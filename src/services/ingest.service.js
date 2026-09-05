/**
 * Ingest from the moomoo OpenD sync worker (sync/moomoo_sync.py).
 *
 * The whole payload lands in one transaction: a half-applied sync would leave the
 * derived portfolio wrong until the next run, which is worse than failing loudly.
 *
 * Three invariants here are easy to break and expensive to notice:
 *
 *  1. A dividend is written as a DIV *transaction* when its instrument is known,
 *     and as a DIVIDEND *cash_movement* only when it is not. The client counts a
 *     dividend from either table, so a row present in both is counted twice.
 *  2. The cash leg of a trade ('Others') is dropped by the worker before sending,
 *     because the BUY/SELL rows already move cash on the client.
 *  3. The cash balance comes from the broker, never from summing cash_movements.
 *     moomoo's cash-flow ledger omits trade fees entirely — its per-trade rows
 *     equal the deal notional to the cent — so no sum of it reproduces the real
 *     balance. cash_movements is the movement history; `funds` is the balance.
 */
const { transaction } = require('../db');
const instruments = require('../models/instruments.model');
const brokerPositions = require('../models/brokerPositions.model');
const transactions = require('../models/transactions.model');
const cash = require('../models/cash.model');
const prices = require('../models/prices.model');
const fundMetrics = require('../models/fundMetrics.model');
const fundDistributions = require('../models/fundDistributions.model');
const snapshots = require('../models/snapshots.model');
const settings = require('../models/settings.model');

// moomoo cashflow_type → cash_movements.type. Anything unmapped falls back to the
// flow's direction, which is what an FX transfer needs: a withdrawal from one
// currency and a deposit into the other, since balances are held per currency.
const CASH_KIND = {
  'Cash Dividend': 'DIVIDEND',
  'FATCA Withholding Tax': 'FEE',
  'Bank Transfer Deposits': 'DEPOSIT',
};

async function ingestOrders(client, orders) {
  let added = 0;
  for (const o of orders) {
    // expected: {order_id, ticker, market, currency, side: BUY|SELL, qty, price, fees, trade_date}
    const i = await instruments.ensure(client, o);
    added += await transactions.insertSyncedTrade(client, i.id, o);
  }
  return added;
}

async function ingestQuotes(client, quotes) {
  for (const q of quotes) {
    const i = await instruments.idByTicker(client, q.ticker);
    if (!i) continue;
    await prices.upsert(client, i.id, q.price, 'moomoo');
  }
}

async function ingestCashFlows(client, cashFlows) {
  let dividendsAdded = 0, cashAdded = 0;
  for (const c of cashFlows) {
    const extId = `moomoo:cf:${c.cashflow_id}`;
    const amount = Math.abs(Number(c.amount) || 0);
    const instrument = c.ticker ? await instruments.idByTicker(client, c.ticker) : null;

    if (c.type === 'Cash Dividend' && instrument) {
      // An earlier run may have parked this in cash_movements because the
      // instrument did not exist yet. Drop that row so it isn't counted twice —
      // the two tables have separate unique constraints, so neither catches it.
      await cash.removeByExtId(client, extId);
      dividendsAdded += await transactions.insertSyncedDividend(client, instrument.id, {
        amount, date: c.date, extId,
      });
      continue;
    }

    const type = CASH_KIND[c.type] || (c.direction === 'OUT' ? 'WITHDRAW' : 'DEPOSIT');
    // Withholding tax names its stock in the remark, which the worker parses into
    // `ticker` — attaching it here is what lets Positions show tax per holding.
    // Deposits and FX transfers have no ticker and stay unattributed, as they should.
    cashAdded += await cash.insertSynced(client, {
      type, currency: c.currency, amount, date: c.date, extId,
      instrumentId: instrument ? instrument.id : null,
    });
  }
  return { dividendsAdded, cashAdded };
}

/** ETF facts, skipped for any ticker we don't already know. */
async function ingestFundMetrics(client, rows) {
  let n = 0;
  for (const m of rows) {
    const i = await instruments.idByTicker(client, m.ticker);
    if (!i) continue;
    await fundMetrics.upsert(client, i.id, m);
    n += 1;
  }
  return n;
}

/** The fund's own declared distributions. Unknown tickers are skipped. */
async function ingestDistributions(client, rows) {
  let added = 0;
  for (const d of rows) {
    const i = await instruments.idByTicker(client, d.ticker);
    if (!i) continue;
    added += await fundDistributions.upsert(client, i.id, d);
  }
  return added;
}

/**
 * Cash the broker says moved that the ledger does not account for.
 *
 * moomoo updates a balance the moment money lands but only publishes the cash-flow
 * row at clearing, hours later. In that gap a dividend is real, visible in the app,
 * and absent from every API a sync can read — so a sync reports "0 dividends" and
 * looks broken when it is working correctly.
 *
 * Comparing the broker's own two numbers is reliable in a way that reconciling our
 * movement history is not (that never balances — moomoo omits trade fees from the
 * ledger). Only worth reporting when nothing else arrived; otherwise the delta is
 * just the rows we did import.
 */
function unexplainedCash(before, after) {
  const prev = new Map(before.map(f => [f.currency, Number(f.cash) || 0]));
  const moved = [];
  for (const f of after) {
    if (!prev.has(f.currency)) continue; // first sync: no baseline, nothing to explain
    const delta = (Number(f.cash) || 0) - prev.get(f.currency);
    if (Math.abs(delta) >= 0.01) moved.push({ currency: f.currency, delta: Math.round(delta * 100) / 100 });
  }
  return moved;
}

async function ingest(payload) {
  const {
    positions = [], orders = [], quotes = [], cash_flows = [], funds = [], account = null,
    fund_metrics = [], distributions = [], fx,
  } = payload;

  return transaction(async client => {
    const ordersAdded = await ingestOrders(client, orders);
    await ingestQuotes(client, quotes);
    // The instrument must exist first; the quantity is then kept BESIDE the
    // ledger rather than in it. positions() still derives holdings from the
    // transaction log and nothing here changes that — what the broker reports is
    // evidence the ledger may be incomplete, not a replacement for it.
    //
    // Discarding it, which is what this used to do, is how a free promotional
    // share stayed invisible: the broker reported qty 0.0153 with no deal behind
    // it, so no transaction existed and no position was drawn.
    const heldIds = [];
    for (const p of positions) {
      const instrument = await instruments.ensure(client, p);
      const id = instrument && instrument.id;
      if (id == null) continue;
      heldIds.push(id);
      await brokerPositions.upsert(client, id, Number(p.qty) || 0, Number(p.avg_cost) || 0);
    }
    // A sync always sends its full list, so anything absent has been closed.
    await brokerPositions.keepOnly(client, heldIds);
    const { dividendsAdded, cashAdded } = await ingestCashFlows(client, cash_flows);
    // After positions, so a newly-held instrument already exists to hang facts off.
    const fundsUpdated = await ingestFundMetrics(client, fund_metrics);
    const distributionsAdded = await ingestDistributions(client, distributions);

    if (fx) await settings.set(client, 'fx_usd_myr', fx);
    // Read the old balance before overwriting it — that difference is the only
    // evidence we get of money the ledger has not caught up with.
    const drift = funds.length
      ? unexplainedCash(await settings.getJSON('funds', []), funds)
      : [];
    if (funds.length) await settings.set(client, 'funds', JSON.stringify(funds));
    // One snapshot per sync day, from the broker's own MYR-denominated
    // whole-account figures, so the equity curve depends on neither the fx rate
    // nor the derived-position math.
    if (account) await snapshots.upsertToday(client, account.market_val_rm || 0, account.cash_rm || 0);
    await settings.set(client, 'last_sync', new Date().toISOString());

    return {
      ok: true, ordersAdded, dividendsAdded, cashAdded, fundsUpdated, distributionsAdded,
      unexplainedCash: dividendsAdded + cashAdded + ordersAdded === 0 ? drift : [],
    };
  });
}

module.exports = { ingest, CASH_KIND };
