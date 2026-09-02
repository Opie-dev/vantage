/**
 * Derived portfolio math.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A FAITHFUL PORT of `positions()`, `cashBal()`, `toRM()`, `priceOf()`
 * and `instr()` from the original single-file UI. It is financially load-bearing: nothing
 * is stored as a running balance, every quantity, average cost and cash figure
 * on screen is re-derived from the raw `transactions` and `cash_movements` rows
 * on each render.
 *
 * It must stay in sync with how the sync worker writes rows (see the
 * /api/ingest/moomoo handler in server.js):
 *
 *  - A moomoo dividend lands as a DIV *transaction* when its instrument is
 *    known, and as a DIVIDEND *cash_movement* only when it is not. cashBal()
 *    counts a dividend from either table, so a row must never exist in both —
 *    the ingest handler deletes the cash_movements copy when it promotes one.
 *  - The cash leg of a trade ('Others') is dropped before ingest, because the
 *    BUY/SELL rows already move cash here.
 *  - An FX transfer arrives as a WITHDRAW in one currency and a DEPOSIT in the
 *    other, which is what cashBal() needs since it totals per currency.
 *
 * If you change the arithmetic below you silently change the owner's reported
 * portfolio. Don't, unless you have checked the effect on real synced data.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every function takes the full state object `S` (the /api/state payload) as
 * its first argument and is pure — no module-level mutable state.
 */

/** Empty-but-valid state, so a screen can render before the first fetch lands. */
export const EMPTY_STATE = {
  instruments: [],
  transactions: [],
  cash: [],
  prices: [],
  goals: [],
  snapshots: [],
  fundMetrics: [],
  distributions: [],
  assets: [],
  assetEntries: [], declaredRates: [],
  commitments: [],
  commitmentPayments: [],
  incomeSources: [],
  incomeEvents: [],
  funds: [],
  fx: 4.22,
  preferences: { pnlBasis: 'price', dashboardTheme: 'income' },
  lastSync: null,
}

/* ── primitives ───────────────────────────────────────────────────────────── */

/** The instrument row for a ticker, or undefined. */
export function instr(S, ticker) {
  return S.instruments.find(i => i.ticker === ticker)
}

/** Latest known price for a ticker, in the instrument's own currency. 0 if none. */
export function priceOf(S, ticker) {
  const i = instr(S, ticker)
  const p = i && S.prices.find(x => x.instrument_id === i.id)
  return p ? p.price : 0
}

/**
 * Convert a figure into MYR. USD multiplies by the stored FX rate; MYR passes
 * through. NEVER add two figures of different currencies without this.
 */
export function toRM(S, v, cur) {
  return cur === 'USD' ? v * S.fx : v
}

/**
 * Series slot 1..8 for a ticker — the colour identity used by the allocation
 * donut, the equity legend and the dot beside a ticker.
 *
 * The legacy app assigned these in first-seen order into a mutable module map.
 * Here it is derived from the instrument's position in `S.instruments` (which
 * the API returns ORDER BY id, i.e. creation order), so it is stable across
 * re-renders and identical on every screen. Same intent, no shared mutable map.
 */
export function slotOf(S, ticker) {
  const idx = S.instruments.findIndex(i => i.ticker === ticker)
  return (idx < 0 ? 0 : idx) % 8 + 1
}

/** The CSS colour for a slot, usable as a fill/stroke or a style value. */
export function slotColor(slot) {
  return `var(--chart-${((slot - 1) % 8) + 1})`
}

/* ── positions ────────────────────────────────────────────────────────────── */

/**
 * Open positions, derived from the transaction log.
 *
 * Ported verbatim from legacy `positions()`:
 *   - transactions arrive newest-first from the API, so they are reversed to
 *     walk them oldest-first — average cost depends on the order;
 *   - DIV rows are skipped entirely (they move cash, not shares);
 *   - a BUY adds `qty * price + fees` to cost and `qty` to quantity, so the
 *     average cost INCLUDES fees;
 *   - a SELL removes shares at the running average cost, leaving the average
 *     of the remainder unchanged;
 *   - anything left holding <= 1e-9 shares is dropped (fully closed).
 *
 * @returns {Array<{
 *   t: string, cur: string, mkt: string, name: string, slot: number,
 *   qty: number, avg: number, px: number, val: number, cost: number,
 *   pnl: number, pct: number
 * }>}  `t` is the ticker, `px` is 0 when no price is known, `pct` is a
 *      percentage (e.g. 4.2 means +4.2%), all money in the instrument's own
 *      currency — convert with toRM() before summing across markets.
 */
export function positions(S) {
  const m = {}
  for (const x of S.transactions.slice().reverse()) {
    // oldest first for avg-cost math
    if (x.side === 'DIV') continue
    m[x.ticker] ??= { qty: 0, cost: 0 }
    if (x.side === 'BUY') {
      m[x.ticker].cost += x.qty * x.price + x.fees
      m[x.ticker].qty += x.qty
    } else {
      const avg = m[x.ticker].qty ? m[x.ticker].cost / m[x.ticker].qty : 0
      m[x.ticker].cost -= x.qty * avg
      m[x.ticker].qty -= x.qty
    }
  }
  return Object.entries(m)
    .filter(([, v]) => v.qty > 1e-9)
    .map(([t, v]) => {
      const i = instr(S, t) || { currency: 'MYR', market: '?', name: '' }
      const px = priceOf(S, t)
      const avg = v.cost / v.qty
      const val = v.qty * px
      const pnl = val - v.cost
      return {
        t,
        cur: i.currency,
        mkt: i.market,
        name: i.name,
        slot: slotOf(S, t),
        qty: v.qty,
        avg,
        px,
        val,
        cost: v.cost,
        pnl,
        pct: v.cost ? (pnl / v.cost) * 100 : 0,
      }
    })
}

/** The open position for one ticker, or `{ qty: 0 }`-shaped fallback. */
export function positionOf(S, ticker) {
  return positions(S).find(p => p.t === ticker) || null
}

/* ── cash ─────────────────────────────────────────────────────────────────── */

/**
 * Wallet balance for one currency, derived from cash_movements plus the cash
 * legs of every transaction. Ported verbatim from legacy `cashBal()`:
 *   - cash_movements: WITHDRAW and FEE subtract, DEPOSIT and DIVIDEND add;
 *   - transactions in that currency: BUY subtracts `qty*price + fees`,
 *     SELL adds `qty*price - fees`, DIV adds `amount ?? price`.
 *
 * @param {object} S   state
 * @param {'MYR'|'USD'} cur
 * @returns {number}   balance in `cur` (can legitimately be negative if the
 *                     owner never recorded their deposits)
 */
export function cashBal(S, cur) {
  let b = S.cash
    .filter(c => c.currency === cur)
    .reduce((s, c) => s + (c.type === 'WITHDRAW' || c.type === 'FEE' ? -c.amount : c.amount), 0)
  for (const x of S.transactions) {
    const i = instr(S, x.ticker)
    if (!i || i.currency !== cur) continue
    if (x.side === 'BUY') b -= x.qty * x.price + x.fees
    else if (x.side === 'SELL') b += x.qty * x.price - x.fees
    else if (x.side === 'DIV') b += (x.amount ?? x.price) || 0
  }
  return b
}

/**
 * The broker's own cash figure for a currency, or null when no sync has run.
 *
 * PREFER THIS OVER cashBal(). moomoo's cash-flow ledger leaves trade fees out
 * entirely — its per-trade rows equal the deal notional to the cent, with the
 * fees nowhere in it — so no sum of cash_movements can reproduce the real
 * balance. accinfo_query is authoritative and the sync worker stores it under
 * `funds`. cashBal() stays as the fallback for a database with no synced data
 * (manual entry only), and cash_movements remains the movement *history*.
 */
export function brokerCash(S, cur) {
  const f = (S.funds || []).find(x => x.currency === cur)
  return f && typeof f.cash === 'number' ? f.cash : null
}

/** 'broker' when the figures come from moomoo, 'derived' when computed locally. */
export function cashSource(S) {
  return brokerCash(S, 'MYR') === null && brokerCash(S, 'USD') === null ? 'derived' : 'broker'
}

/**
 * Dividend income to date, RM-combined.
 *
 * `gross` is what the funds paid out, `tax` is what was withheld before it
 * landed (moomoo books 30% FATCA withholding on US dividends as a FEE cash
 * movement), and `net` is what actually reached the wallet.
 *
 * Trade commissions are deliberately NOT counted here: they are already inside
 * each position's average cost, so charging them again would double-count.
 *
 * @returns {{ gross: number, tax: number, net: number }} all in MYR
 */
export function income(S) {
  let gross = 0
  for (const x of S.transactions) {
    if (x.side !== 'DIV') continue
    const i = instr(S, x.ticker)
    gross += toRM(S, (x.amount ?? x.price) || 0, i ? i.currency : 'MYR')
  }
  const tax = S.cash
    .filter(c => c.type === 'FEE')
    .reduce((s, c) => s + toRM(S, c.amount, c.currency), 0)
  return { gross, tax, net: gross - tax }
}

/**
 * Dividends received per calendar month, RM-combined, oldest first.
 *
 * Months with no dividend are filled in as zero so the chart shows a real gap
 * rather than silently closing it. `tax` is the withholding booked in that same
 * month; it is not necessarily withheld from that month's dividends, but it
 * tracks them closely enough to be worth showing side by side.
 *
 * @returns {Array<{ month: string, label: string, gross: number, tax: number,
 *                   net: number, byTicker: Record<string, number> }>}
 */
export function dividendMonths(S) {
  const months = new Map()
  const at = key => {
    if (!months.has(key)) months.set(key, { gross: 0, tax: 0, byTicker: {} })
    return months.get(key)
  }
  for (const x of S.transactions) {
    if (x.side !== 'DIV' || !x.trade_date) continue
    const i = instr(S, x.ticker)
    const rm = toRM(S, (x.amount ?? x.price) || 0, i ? i.currency : 'MYR')
    const m = at(x.trade_date.slice(0, 7))
    m.gross += rm
    m.byTicker[x.ticker] = (m.byTicker[x.ticker] || 0) + rm
  }
  for (const c of S.cash) {
    if (c.type !== 'FEE' || !c.date) continue
    at(c.date.slice(0, 7)).tax += toRM(S, c.amount, c.currency)
  }
  if (!months.size) return []

  const keys = [...months.keys()].sort()
  const out = []
  const [y0, m0] = keys[0].split('-').map(Number)
  const [y1, m1] = keys[keys.length - 1].split('-').map(Number)
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const v = months.get(key) || { gross: 0, tax: 0, byTicker: {} }
    out.push({
      month: key,
      label: new Date(y, m - 1, 1).toLocaleDateString('en-MY', { month: 'short' }),
      gross: v.gross,
      tax: v.tax,
      net: v.gross - v.tax,
      byTicker: v.byTicker,
    })
  }
  return out
}

/**
 * Total dividends received per ticker, in the instrument's OWN currency.
 *
 * GROSS — what the funds declared, before withholding. A per-holding net figure
 * is not available: withholding is booked as FEE cash movements, and
 * cash_movements carries no instrument, so the tax cannot be attributed back to
 * the position that generated it. income() nets it off at portfolio level, where
 * that attribution isn't needed.
 *
 * Includes dividends from positions since closed, which is why this is keyed by
 * ticker rather than folded into positions().
 *
 * @returns {Record<string, number>}
 */
export function dividendsByTicker(S) {
  const out = {}
  for (const x of S.transactions) {
    if (x.side !== 'DIV') continue
    out[x.ticker] = (out[x.ticker] || 0) + ((x.amount ?? x.price) || 0)
  }
  return out
}

/**
 * Trade fees paid per ticker, in the instrument's OWN currency.
 *
 * Commission, platform, settlement and stamp duty on each fill — what moomoo
 * charged to transact. NOTE these are already inside each position's average
 * cost (positions() adds `qty * price + fees`), so this is a breakout of a figure
 * you can already see, not an extra cost on top of it.
 *
 * Withholding tax is NOT here. It is a FEE cash movement with no instrument, and
 * it is a tax on income rather than a cost of trading — a different thing that
 * would mislead if added in.
 *
 * @returns {Record<string, number>}
 */
export function feesByTicker(S) {
  const out = {}
  for (const x of S.transactions) {
    if (x.side === 'DIV') continue
    out[x.ticker] = (out[x.ticker] || 0) + (x.fees || 0)
  }
  return out
}

/**
 * Withholding tax per ticker, in the instrument's OWN currency.
 *
 * Real attribution, not an allocation: moomoo names the stock in the remark
 * ('MSTY 182.31230000 SHARES FATCA WITHHOLDING TAX @30%'), the sync worker parses
 * that ticker out and the ingest stores it on cash_movements.instrument_id.
 *
 * A FEE row with no instrument is skipped rather than spread across holdings —
 * rows synced before that column existed stay unattributed until a sync re-runs
 * over their date range, and guessing would be worse than omitting.
 *
 * @returns {Record<string, number>}
 */
export function withholdingByTicker(S) {
  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker
  const out = {}
  for (const c of S.cash) {
    if (c.type !== 'FEE' || !c.instrument_id) continue
    const t = tickerOf[c.instrument_id]
    if (!t) continue
    out[t] = (out[t] || 0) + c.amount
  }
  return out
}

/**
 * How P&L is computed on the Positions table. Server-side preference; see
 * src/services/preferences.service.js for the stored values.
 *
 *   PRICE - market value less cost. Cost already includes trading fees, so those
 *           ARE counted; dividends and withholding are not. Conventional
 *           unrealised P&L, and the default.
 *   NET   - price plus dividends received less withholding tax.
 *   GROSS - price plus dividends, ignoring the tax withheld. Pre-tax.
 */
export const PNL_BASIS = { PRICE: 'price', NET: 'net', GROSS: 'gross' }

export const PNL_BASIS_LABEL = {
  price: 'Price only',
  net: 'Incl. income, after tax',
  gross: 'Incl. income, before tax',
}

/** The active basis, defaulting to price-only for a state that predates the setting. */
export function pnlBasis(S) {
  const b = S.preferences && S.preferences.pnlBasis
  return b === PNL_BASIS.NET || b === PNL_BASIS.GROSS ? b : PNL_BASIS.PRICE
}

/**
 * Which layout the Dashboard opens on. Server-side preference; see
 * src/services/preferences.service.js for the stored values.
 *
 *   INCOME - leads with what the funds pay: the month's outlook is the headline
 *            and the payout calendar sits beneath it. The default.
 *   EQUITY - leads with what the holdings are worth: portfolio value is the
 *            headline and the equity curve and holdings get the room.
 *
 * Presentation only. Both themes read the same figures off the same P&L basis,
 * so this changes the order and the size of things and nothing else.
 */
export const DASHBOARD_THEME = { INCOME: 'income', EQUITY: 'equity' }

export const DASHBOARD_THEME_LABEL = { income: 'Income focus', equity: 'Equity focus' }

/** The active theme, defaulting to income focus for a state that predates the setting. */
export function dashboardTheme(S) {
  const t = S.preferences && S.preferences.dashboardTheme
  return t === DASHBOARD_THEME.EQUITY ? DASHBOARD_THEME.EQUITY : DASHBOARD_THEME.INCOME
}

/**
 * Positions decorated with their income and the P&L the chosen basis implies.
 *
 * positions() is left alone deliberately — it is the ported, load-bearing figure
 * and several screens depend on `pnl` meaning price movement. This adds fields
 * rather than changing them:
 *
 *   dividends / withheld / income  the holding's income under the basis
 *   pnlShown / pctShown            what the Positions table displays
 *   pnl / pct                      unchanged: always price-only
 *
 * NOTE income here is realised cash already sitting in the wallet balance. Adding
 * it to a position's P&L is a view of that position's performance, NOT something
 * that can be summed into portfolio value — the cash is counted there already.
 */
export function positionsWithIncome(S, basis = pnlBasis(S)) {
  const divs = dividendsByTicker(S)
  const tax = withholdingByTicker(S)
  return positions(S).map(p => {
    const dividends = divs[p.t] || 0
    const withheld = tax[p.t] || 0
    const income =
      basis === PNL_BASIS.NET ? dividends - withheld : basis === PNL_BASIS.GROSS ? dividends : 0
    const pnlShown = p.pnl + income
    return {
      ...p,
      dividends,
      withheld,
      income,
      pnlShown,
      pctShown: p.cost ? (pnlShown / p.cost) * 100 : 0,
    }
  })
}

/**
 * Withholding tax to date, overall and per calendar year, in MYR.
 *
 * `rate` is tax over the gross dividends of the SAME period, which is the only
 * meaningful denominator — dividing this year's tax by all-time dividends would
 * understate it. A year with dividends but no tax yet reports a rate of 0 rather
 * than dividing by zero.
 *
 * Years come from the row dates, so this follows the calendar year. If you ever
 * need a tax year that starts elsewhere, this is the function to change.
 *
 * @returns {{ gross: number, tax: number, net: number, rate: number,
 *             byYear: Array<{year: string, gross: number, tax: number,
 *                            net: number, rate: number}> }}
 */
export function withholdingSummary(S) {
  const years = new Map()
  const at = y => {
    if (!years.has(y)) years.set(y, { year: y, gross: 0, tax: 0 })
    return years.get(y)
  }
  for (const x of S.transactions) {
    if (x.side !== 'DIV' || !x.trade_date) continue
    const i = instr(S, x.ticker)
    at(x.trade_date.slice(0, 4)).gross += toRM(S, (x.amount ?? x.price) || 0, i ? i.currency : 'MYR')
  }
  for (const c of S.cash) {
    if (c.type !== 'FEE' || !c.date) continue
    at(c.date.slice(0, 4)).tax += toRM(S, c.amount, c.currency)
  }

  const byYear = [...years.values()]
    .map(y => ({ ...y, net: y.gross - y.tax, rate: y.gross ? (y.tax / y.gross) * 100 : 0 }))
    .sort((a, b) => b.year.localeCompare(a.year))

  const gross = byYear.reduce((s2, y) => s2 + y.gross, 0)
  const tax = byYear.reduce((s2, y) => s2 + y.tax, 0)
  return { gross, tax, net: gross - tax, rate: gross ? (tax / gross) * 100 : 0, byYear }
}

/* ── roll-ups (built on the above; nothing new is invented here) ──────────── */

/**
 * Everything the Dashboard header needs, all RM-combined at S.fx.
 *
 * `pnlRM` follows the user's chosen P&L basis (see PNL_BASIS), so it may already
 * include income. `totalReturnRM` ALWAYS means price plus net income, whatever
 * the basis — when the basis is 'net' the two are deliberately identical, and the
 * Dashboard shows income received instead of repeating the card.
 *
 * `pricePnlRM` is always price movement alone, for anywhere that needs the
 * unmodified figure regardless of the setting.
 *
 * @returns {{
 *   pos: ReturnType<typeof positions>, invRM: number, costRM: number,
 *   pnlRM: number, pnlPct: number,
 *   divGrossRM: number, divTaxRM: number, divNetRM: number,
 *   totalReturnRM: number, totalReturnPct: number,
 *   cashMYR: number, cashUSD: number, cashRM: number, totalRM: number
 * }}
 */
export function portfolio(S, basis = pnlBasis(S)) {
  const pos = positions(S)
  const invRM = pos.reduce((s, p) => s + toRM(S, p.val, p.cur), 0)
  const costRM = pos.reduce((s, p) => s + toRM(S, p.cost, p.cur), 0)
  const cashMYR = brokerCash(S, 'MYR') ?? cashBal(S, 'MYR')
  const cashUSD = brokerCash(S, 'USD') ?? cashBal(S, 'USD')
  const cashRM = cashMYR + toRM(S, cashUSD, 'USD')
  const pricePnlRM = invRM - costRM
  // Total return adds the income the holdings actually threw off. For this
  // portfolio (option-income and covered-call ETFs) the distributions ARE the
  // strategy, so price movement alone badly misstates how it has done.
  const inc = income(S)
  const totalReturnRM = pricePnlRM + inc.net
  const applied = basis === PNL_BASIS.NET ? inc.net : basis === PNL_BASIS.GROSS ? inc.gross : 0
  const pnlRM = pricePnlRM + applied
  return {
    pos,
    invRM,
    costRM,
    basis,
    pricePnlRM,
    pricePnlPct: costRM ? (pricePnlRM / costRM) * 100 : 0,
    pnlRM,
    pnlPct: costRM ? (pnlRM / costRM) * 100 : 0,
    divGrossRM: inc.gross,
    divTaxRM: inc.tax,
    divNetRM: inc.net,
    totalReturnRM,
    totalReturnPct: costRM ? (totalReturnRM / costRM) * 100 : 0,
    cashMYR,
    cashUSD,
    cashRM,
    totalRM: invRM + cashRM,
  }
}

/**
 * Allocation slices for the donut, RM-combined, largest slot order preserved.
 * Cash is appended as a final neutral slice when positive, exactly as legacy.
 * @returns {Array<{ name: string, value: number, color: string, share: number }>}
 *          `share` is a fraction 0..1.
 */
export function allocation(S) {
  const { pos, cashRM } = portfolio(S)
  const parts = pos
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(p => ({ name: p.t, value: toRM(S, p.val, p.cur), color: slotColor(p.slot) }))
  if (cashRM > 0) parts.push({ name: 'Cash', value: cashRM, color: 'var(--faint)' })
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return parts.map(p => ({ ...p, share: p.value / total }))
}

/**
 * Equity curve points from the daily snapshots. Value is invested + cash, both
 * already RM in the snapshots table. Fewer than 2 points means the chart should
 * show its empty state ("appears after a few daily snapshots").
 * @returns {Array<{ date: string, label: string, value: number }>}
 */
export function equitySeries(S) {
  return S.snapshots.map(s => ({
    date: s.date,
    label: s.date,
    value: s.value_rm + s.cash_rm,
  }))
}

/**
 * Progress for one goal row (goals come from the API already joined with
 * `ticker` and `currency`).
 * @returns {{
 *   qty: number, remain: number, px: number, need: number, prog: number,
 *   months: number|null, cur: string
 * }}  `need` is capital still required in the goal's own currency, `prog` is a
 *     0..100 percentage clamped at 100, `months` is null when there is no
 *     monthly budget or no price yet.
 */
export function goalProgress(S, g) {
  if (g.kind && g.kind !== GOAL_KIND.SHARES) return incomeGoalProgress(S, g)

  const pos = positionOf(S, g.ticker) || { qty: 0 }
  const px = priceOf(S, g.ticker)
  const cur = g.currency
  const remain = Math.max(g.target_qty - pos.qty, 0)
  const need = remain * px
  const prog = g.target_qty ? Math.min((pos.qty / g.target_qty) * 100, 100) : 0
  const months = g.monthly_budget && px ? Math.ceil(toRM(S, need, cur) / g.monthly_budget) : null
  return { kind: GOAL_KIND.SHARES, qty: pos.qty, remain, px, need, prog, months, cur }
}

/**
 * Progress for an income goal. Always MYR — income targets are stored in MYR so
 * that a portfolio-wide goal and a per-holding one are directly comparable.
 *
 * `months` projects from the current monthly run rate, so it answers "at the pace
 * I'm earning now, when do I get there". For a MONTHLY goal that projection is
 * meaningless (the rate IS the target), so it stays null.
 */
function incomeGoalProgress(S, g) {
  const target = g.target_amount || 0
  const current = goalCurrent(S, g)
  const remain = Math.max(target - current, 0)
  const prog = target ? Math.min((current / target) * 100, 100) : 0
  const rate = monthlyIncomeRate(S, g.ticker || null, goalIncomeIsNet(S))
  // A rate or per-payment target is reached by holding more, not by waiting, so
  // projecting months from the income rate would be nonsense for those kinds.
  const isRate = g.kind === GOAL_KIND.INCOME_MONTHLY || g.kind === GOAL_KIND.INCOME_PER_PAYMENT
  const months = isRate || !remain || rate <= 0 ? null : Math.ceil(remain / rate)

  return {
    kind: g.kind,
    cur: 'MYR',
    current,
    target,
    remain,
    prog,
    rate,
    months,
    net: goalIncomeIsNet(S),
    scope: g.ticker || null,
    ...(g.kind === GOAL_KIND.INCOME_PER_PAYMENT ? sharesToReach(S, g, current) : null),
  }
}

/**
 * What it would take to lift a holding's payment to its target: how many more
 * shares, and what they cost.
 *
 * The per-share payout is inferred as `average payment / shares held now`, since
 * we store each payment's total but not the share count it was paid on. Recent
 * payments were made on close to the current holding, so this is sound — but it
 * understates the rate right after a large purchase, when the average still
 * reflects a smaller position.
 *
 * It also assumes the fund keeps distributing at the same rate per share, which
 * for these funds is the shakier half of the estimate: MSTY has gone 0.208 →
 * 0.181 → 0.162 per share over three payments. The card says so.
 *
 * @returns {{qty, perShare, sharesNeeded, capital, capitalRM, px, priceCur}}
 */
function sharesToReach(S, g, current) {
  const pos = positionOf(S, g.ticker) || { qty: 0 }
  const i = instr(S, g.ticker)
  const priceCur = (i && i.currency) || 'MYR'
  const px = priceOf(S, g.ticker)
  // Payments are RM; dividing by shares gives RM of payout per share.
  const perShare = pos.qty > 0 && current > 0 ? current / pos.qty : 0
  const target = g.target_amount || 0

  if (!perShare) return { qty: pos.qty, perShare: 0, sharesNeeded: 0, capital: 0, capitalRM: 0, px, priceCur }

  const sharesNeeded = Math.max(Math.ceil(target / perShare) - pos.qty, 0)
  // toRM converts INTO ringgit, so the price must be divided back out of it to
  // express a ringgit-denominated need in the share's own currency.
  const capital = sharesNeeded * px
  return {
    qty: pos.qty,
    perShare,
    sharesNeeded,
    capital,
    capitalRM: toRM(S, capital, priceCur),
    px,
    priceCur,
  }
}

/* ── instruments ──────────────────────────────────────────────────────────── */

/**
 * A fund's declared distributions, newest first, each flagged with whether it has
 * reached this account yet.
 *
 * `pending` compares the ex-date against the newest DIV transaction for the same
 * ticker: money settles a day or more after the ex-date, so a declaration newer
 * than your last receipt is one that is still on its way. It is a heuristic on
 * dates, not a confirmation from the broker — but it is the difference between
 * "the fund cut its payout" and "yours simply hasn't landed".
 *
 * @returns {Array<{ex_date: string, per_share: number, pending: boolean}>}
 */
export function distributionsFor(S, ticker) {
  const received = S.transactions
    .filter(x => x.side === 'DIV' && x.ticker === ticker && x.trade_date)
    .map(x => x.trade_date)
    .sort()
  const newest = received.length ? received[received.length - 1] : null
  return (S.distributions || [])
    .filter(d => d.ticker === ticker)
    .map(d => ({ ...d, pending: newest ? d.ex_date > newest : true }))
    .sort((a, b) => b.ex_date.localeCompare(a.ex_date))
}

/** The fund facts for one ticker, or null when it is not a fund or never synced. */
export function fundMetricsFor(S, ticker) {
  return (S.fundMetrics || []).find(f => f.ticker === ticker) || null
}

/**
 * One row per instrument for the Instruments screen: what the thing is, what the
 * fund is, what you own of it and what it has paid you.
 *
 * ONLY what you currently hold. A sold-out instrument has no fund figures worth
 * showing (the sync stops refreshing it) and its dividend history already lives
 * in History, so listing it here would be a card of dashes.
 *
 * `shareOfFund` is your holding as a percentage of the whole vehicle. It is the
 * figure that shows ETCO is a RM 4m fund you own a meaningful slice of, which no
 * other screen surfaces.
 */
/** Everything ever put into a ticker, fees included — the base a closed position's
 * income is measured against, since its running cost basis is gone once it is sold. */
function investedEver(S, ticker) {
  let cost = 0
  for (const x of S.transactions) {
    if (x.ticker !== ticker || x.side !== 'BUY') continue
    cost += x.qty * x.price + (x.fees || 0)
  }
  return cost
}

/** The day a ticker was FIRST bought — where your money entered a schedule the
 * fund had already been running, which is worth seeing on the declaration chart. */
function firstBoughtOn(S, ticker) {
  let first = ''
  for (const x of S.transactions) {
    if (x.ticker !== ticker || x.side !== 'BUY' || !x.trade_date) continue
    if (!first || x.trade_date < first) first = x.trade_date
  }
  return first || null
}

/** The day a ticker was last sold, for a position that is now closed. */
function lastSoldOn(S, ticker) {
  let last = ''
  for (const x of S.transactions) {
    if (x.ticker !== ticker || x.side !== 'SELL' || !x.trade_date) continue
    if (x.trade_date > last) last = x.trade_date
  }
  return last || null
}

/**
 * One row per instrument for the Instruments screen.
 *
 * By default only what is currently held: the sync refreshes fund figures and
 * declaration schedules for held codes alone, so a sold fund's card would be a row
 * of dashes. With `includeClosed` those come back anyway, marked `closed` and
 * carrying only what survives a sale — the income it paid while you held it, and
 * what you put in. Callers must not expect `pos` or `metrics` on those.
 */
export function instrumentRows(S, { includeClosed = false } = {}) {
  const held = new Map(positions(S).map(p => [p.t, p]))
  const divs = dividendsByTicker(S)
  const tax = withholdingByTicker(S)
  const fees = feesByTicker(S)

  return S.instruments
    .filter(i => held.has(i.ticker) || (includeClosed && (divs[i.ticker] || investedEver(S, i.ticker))))
    .map(i => {
      const pos = held.get(i.ticker) || null
      const m = fundMetricsFor(S, i.ticker)
      const gross = divs[i.ticker] || 0
      const withheld = tax[i.ticker] || 0
      // Units and holding are both in shares, so this needs no conversion.
      const shareOfFund = m && m.outstanding_units && pos ? (pos.qty / m.outstanding_units) * 100 : null
      const cost = pos ? pos.cost : investedEver(S, i.ticker)
      return {
        instrument: i,
        ticker: i.ticker,
        cur: i.currency,
        pos,
        closed: !pos,
        soldOn: pos ? null : lastSoldOn(S, i.ticker),
        firstBought: firstBoughtOn(S, i.ticker),
        invested: cost,
        metrics: m,
        gross,
        withheld,
        net: gross - withheld,
        fees: fees[i.ticker] || 0,
        returnedPct: cost > 0 ? ((gross - withheld) / cost) * 100 : null,
        shareOfFund,
        payments: dividendPayments(S, i.ticker).length,
        declarations: distributionsFor(S, i.ticker),
      }
    })
    // Held first, largest holding down; then closed positions by what they paid.
    .sort((a, b) => {
      if (!a.pos !== !b.pos) return a.pos ? -1 : 1
      if (a.pos) return b.pos.val - a.pos.val || a.ticker.localeCompare(b.ticker)
      return b.net - a.net || a.ticker.localeCompare(b.ticker)
    })
}

/**
 * How a fund's recent declarations compare with the ones before them, per share.
 *
 * Returns null unless there is a full window on both sides — a direction claimed
 * off two declarations is noise, and these funds' rates move enough that a wrong
 * one would be believed.
 */
export function declarationTrend(rows, window = 4) {
  const avg = xs => (xs.length ? xs.reduce((sum, x) => sum + x.per_share, 0) / xs.length : 0)
  const prior = rows.slice(window, window * 2)
  const before = avg(prior)
  if (prior.length < window || before <= 0) return null
  return ((avg(rows.slice(0, window)) - before) / before) * 100
}

/* ── goal income ──────────────────────────────────────────────────────────── */

export const GOAL_KIND = {
  SHARES: 'SHARES',
  INCOME_TOTAL: 'INCOME_TOTAL',
  INCOME_MONTHLY: 'INCOME_MONTHLY',
  INCOME_YEAR: 'INCOME_YEAR',
  INCOME_PER_PAYMENT: 'INCOME_PER_PAYMENT',
}

export const GOAL_KIND_LABEL = {
  SHARES: 'Shares held',
  INCOME_TOTAL: 'Total dividends',
  INCOME_MONTHLY: 'Monthly income',
  INCOME_YEAR: 'Dividends this year',
  INCOME_PER_PAYMENT: 'Per dividend payment',
}

/** Kinds that measure a single holding — a portfolio-wide version makes no sense. */
export const GOAL_NEEDS_INSTRUMENT = new Set([GOAL_KIND.SHARES, GOAL_KIND.INCOME_PER_PAYMENT])

/** Months averaged for a monthly-income goal. */
export const INCOME_RATE_MONTHS = 3

/** Payments averaged for a per-payment goal. */
export const PAYMENTS_AVERAGED = 3

/**
 * Whether goal income counts gross or net.
 *
 * Follows the P&L basis, EXCEPT that 'price' says nothing about income — it means
 * "keep income out of P&L", not "count it gross". So it falls back to net, which
 * is also the honest default: net is money that actually arrived.
 */
export function goalIncomeIsNet(S) {
  return pnlBasis(S) !== PNL_BASIS.GROSS
}

/**
 * Dividend income in MYR, optionally narrowed to one holding and a date window.
 *
 * `ticker` null means the whole portfolio, which includes holdings since sold —
 * that income was still received. Dates are inclusive 'YYYY-MM-DD' strings, which
 * compare correctly as text in this format.
 */
function incomeIn(S, { ticker = null, from = null, to = null } = {}) {
  let gross = 0
  for (const x of S.transactions) {
    if (x.side !== 'DIV' || !x.trade_date) continue
    if (ticker && x.ticker !== ticker) continue
    if ((from && x.trade_date < from) || (to && x.trade_date > to)) continue
    const i = instr(S, x.ticker)
    gross += toRM(S, (x.amount ?? x.price) || 0, i ? i.currency : 'MYR')
  }

  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker
  let tax = 0
  for (const c of S.cash) {
    if (c.type !== 'FEE' || !c.date) continue
    if (ticker && tickerOf[c.instrument_id] !== ticker) continue
    if ((from && c.date < from) || (to && c.date > to)) continue
    tax += toRM(S, c.amount, c.currency)
  }
  return { gross, tax, net: gross - tax }
}

/**
 * Average monthly income over the last INCOME_RATE_MONTHS months that have data.
 *
 * The current month is included even though it is usually incomplete, which drags
 * the figure down late in a month — the alternative, waiting for a month to close,
 * lags harder while income is still ramping. Averaging over three months is what
 * keeps one partial month from dominating.
 */
function monthlyIncomeRate(S, ticker, net) {
  const months = new Map()
  const add = (key, field, v) => {
    const m = months.get(key) || { gross: 0, tax: 0 }
    m[field] += v
    months.set(key, m)
  }
  for (const x of S.transactions) {
    if (x.side !== 'DIV' || !x.trade_date) continue
    if (ticker && x.ticker !== ticker) continue
    const i = instr(S, x.ticker)
    add(x.trade_date.slice(0, 7), 'gross', toRM(S, (x.amount ?? x.price) || 0, i ? i.currency : 'MYR'))
  }
  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker
  for (const c of S.cash) {
    if (c.type !== 'FEE' || !c.date) continue
    if (ticker && tickerOf[c.instrument_id] !== ticker) continue
    add(c.date.slice(0, 7), 'tax', toRM(S, c.amount, c.currency))
  }
  if (!months.size) return 0

  const recent = [...months.keys()].sort().slice(-INCOME_RATE_MONTHS)
  const total = recent.reduce((sum, k) => {
    const m = months.get(k)
    return sum + (net ? m.gross - m.tax : m.gross)
  }, 0)
  return total / recent.length
}

/**
 * One holding's dividend payments, newest first, in MYR.
 *
 * Grouped by date so two rows booked on the same clearing date read as the single
 * payment they are. Withholding is matched to a payment by ticker AND date, which
 * is how moomoo books it — tax with no matching payment is dropped rather than
 * spread, since attributing it elsewhere would invent a number.
 *
 * @returns {Array<{date: string, gross: number, tax: number, net: number}>}
 */
function dividendPayments(S, ticker) {
  const byDate = new Map()
  const at = d => {
    if (!byDate.has(d)) byDate.set(d, { date: d, gross: 0, tax: 0 })
    return byDate.get(d)
  }
  for (const x of S.transactions) {
    if (x.side !== 'DIV' || x.ticker !== ticker || !x.trade_date) continue
    const i = instr(S, x.ticker)
    at(x.trade_date).gross += toRM(S, (x.amount ?? x.price) || 0, i ? i.currency : 'MYR')
  }
  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker
  for (const c of S.cash) {
    if (c.type !== 'FEE' || !c.date || tickerOf[c.instrument_id] !== ticker) continue
    const e = byDate.get(c.date)
    if (e) e.tax += toRM(S, c.amount, c.currency)
  }
  return [...byDate.values()]
    .map(e => ({ ...e, net: e.gross - e.tax }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Average size of a holding's recent dividend payments, in MYR.
 *
 * Averaged over PAYMENTS_AVERAGED rather than taken from the latest, because a
 * single payment swings on the fund's own distribution rate — ETCO paid RM 306.91
 * after RM 565.22 — and a goal that lurches for reasons the owner did not cause
 * is not a goal you can act on.
 */
export function averagePayment(S, ticker, net = true) {
  const rows = dividendPayments(S, ticker).slice(0, PAYMENTS_AVERAGED)
  if (!rows.length) return 0
  return rows.reduce((sum, r) => sum + (net ? r.net : r.gross), 0) / rows.length
}

/** Declarations inspected when working out how often a fund pays. */
const CADENCE_SAMPLE = 6

/**
 * How many days a fund leaves between distributions, from its own declared
 * ex-dates — the median gap, so one irregular declaration cannot skew it.
 *
 * Returns 0 when there is not enough history to tell, which callers must read
 * as "do not project" rather than "pays daily".
 */
export function paymentCadenceDays(S, ticker) {
  const dates = distributionsFor(S, ticker)
    .slice(0, CADENCE_SAMPLE)
    .map(d => Date.parse(d.ex_date + 'T00:00:00Z'))
    .filter(Number.isFinite)
  if (dates.length < 3) return 0

  const gaps = []
  for (let i = 1; i < dates.length; i += 1) gaps.push(Math.round((dates[i - 1] - dates[i]) / 86400000))
  const usable = gaps.filter(g => g > 0).sort((a, b) => a - b)
  if (!usable.length) return 0
  return usable[Math.floor(usable.length / 2)]
}

/** Payments inspected when learning how long a fund takes to pay. */
const LAG_SAMPLE = 6
/** A gap wider than this is a mis-paired ex-date, not a settlement cycle. */
const LAG_MAX = 5
const DAY = 86400000

const isoOf = t => new Date(t).toISOString().slice(0, 10)
const msOf = d => Date.parse(d + 'T00:00:00Z')
const isWeekend = t => {
  const w = new Date(t).getUTCDay()
  return w === 0 || w === 6
}

/** A weekend date moved to the following Monday. Public holidays are not modelled. */
function onBusinessDay(d) {
  let t = msOf(d)
  while (isWeekend(t)) t += DAY
  return isoOf(t)
}

/**
 * Calendar days a fund takes to pay after its ex-date, from its own history.
 *
 * The SMALLEST gap seen, because the large ones are not a different lag — they are
 * this same lag landing on a weekend (see payDateFor). Taking the max instead would
 * push every mid-week payment a day late, which is how a payment already received
 * comes back as one still owed.
 */
export function settlementLagDays(S, ticker) {
  const ex = distributionsFor(S, ticker).map(d => d.ex_date).sort()
  let lag = 0
  for (const paid of dividendPayments(S, ticker).slice(0, LAG_SAMPLE)) {
    const match = ex.filter(e => e <= paid.date).pop()
    if (!match) continue
    const n = Math.round((msOf(paid.date) - msOf(match)) / DAY)
    if (n > 0 && n <= LAG_MAX) lag = lag ? Math.min(lag, n) : n
  }
  return lag || 1
}

/**
 * The EARLIEST day an ex-date can pay. Deliberately not the likeliest.
 *
 * Money posts `lag` calendar days after the ex-date, and a weekend pushes it to
 * the Monday. Holidays push it further and are NOT modelled: this account is
 * Malaysian and holds US funds, so a payment waits on both calendars — MSTY's
 * 2 Jul ex-date paid on 6 Jul with US markets shut for the 4th, and ETCO's 12 Jun
 * paid on 16 Jun rather than the Monday. Against the full history the rule is
 * exact mid-week and one to two days early around a holiday.
 *
 * It once carried an extra business day whenever the roll crossed a weekend, which
 * fitted the 12 Jun case and looked right until ETCO's 28 Aug ex-date paid on
 * Monday 31 Aug — a day EARLIER than predicted, and in the previous month. One
 * late prediction is worse than six early ones: early only shows money slightly
 * before it lands, late strands a payment that has already arrived. The extra day
 * is gone, and 12 Jun is simply another holiday this does not model.
 *
 * Never later than the real payment is the property that matters, and the reason
 * settlementLagDays takes the minimum gap. A projected ex-date can itself land on
 * a weekend; real ones never do, so it is rolled onto a business day first.
 */
function payDateFor(exDate, lag) {
  let t = msOf(onBusinessDay(exDate)) + lag * DAY
  while (isWeekend(t)) t += DAY
  return isoOf(t)
}

/**
 * The share of a fund's distributions this account loses to withholding, from what
 * has actually been booked rather than an assumed rate — a Bursa holding correctly
 * comes out at 0 where a hardcoded 30% would quietly understate it.
 */
function withholdingRate(S, ticker) {
  const rows = dividendPayments(S, ticker).slice(0, PAYMENTS_AVERAGED)
  const gross = rows.reduce((sum, r) => sum + r.gross, 0)
  if (gross <= 0) return 0
  return rows.reduce((sum, r) => sum + r.tax, 0) / gross
}

/**
 * What a month will pay, and on which days.
 *
 * Two different kinds of number, and the caller must not present them alike:
 *
 *   DECLARED — the fund has published a per-share rate for an ex-date that has
 *     passed without paying yet. Rate × shares held, less the withholding this
 *     account is actually charged. This is arithmetic on the broker's own figures;
 *     only the exact settlement day can drift.
 *   PROJECTED — past the last declaration, each fund's own cadence (median gap
 *     between its declared ex-dates) priced at the average of its recent payments.
 *     These per-share rates have been falling, so this half reads high more often
 *     than low. `declaredDue` is the firm part of `estimated`.
 *
 * Ex-dates are not pay dates. Each fund settles a fixed number of business days
 * after going ex (see settlementLagDays) — one here, or two when the ex-date falls
 * on a Friday — and a projected ex-date landing on a weekend rolls forward first.
 *
 * A payment is dropped only once one has actually been RECEIVED on or after its
 * date, never because the date is in the past. Money due today has not arrived
 * until moomoo books it, and treating the calendar as authority is what used to
 * hide a fund's most recent declaration until its next one came round.
 *
 * @returns {{received: number, estimated: number, declaredDue: number, dates: Array,
 *           perTicker: object, isEstimate: boolean}}
 *          money in MYR; `dates` oldest-first as
 *          {date, total, declared, parts:[{ticker, amount, slot, declared}]}
 */
export function incomeOutlook(S, year, monthIndex) {
  const net = goalIncomeIsNet(S)
  const pad = n => String(n + 1).padStart(2, '0')
  const from = `${year}-${pad(monthIndex)}-01`
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const to = `${year}-${pad(monthIndex)}-${String(last).padStart(2, '0')}`

  const got = incomeIn(S, { from, to })
  const received = net ? got.net : got.gross

  const byDate = new Map()
  const add = (date, ticker, amount, declared) => {
    if (!byDate.has(date)) byDate.set(date, { date, total: 0, parts: [], declared: true })
    const slot = byDate.get(date)
    slot.total += amount
    slot.declared = slot.declared && declared
    const i = instr(S, ticker)
    const cur = i ? i.currency : 'MYR'
    slot.parts.push({
      ticker,
      amount,
      currency: cur,
      // The same money in the instrument's own currency, for per-row display.
      native: cur === 'USD' && S.fx ? amount / S.fx : amount,
      slot: slotOf(S, ticker),
      declared,
    })
  }

  for (const p of positions(S)) {
    const declared = distributionsFor(S, p.t)
    if (!declared.length) continue

    const lag = settlementLagDays(S, p.t)
    const payFor = ex => payDateFor(ex, lag)
    // What has actually landed is the only reliable "already dealt with" mark. The
    // calendar is not: a payment due today has not arrived until moomoo books it,
    // and treating today as settled is what hid ETCO's payment for a fortnight.
    const paid = dividendPayments(S, p.t)
    const lastPaid = paid.length ? paid[0].date : ''
    const rate = net ? withholdingRate(S, p.t) : 0
    const i = instr(S, p.t)
    const cur = i ? i.currency : 'MYR'

    // 1. Declared, not yet paid. The fund has published its per-share rate, so this
    //    is arithmetic on a real number rather than an average of past payments.
    for (const d of declared) {
      const pay = payFor(d.ex_date)
      if (pay < from) break // newest-first, so everything below this is older still
      if (pay > to || pay <= lastPaid) continue
      add(pay, p.t, toRM(S, d.per_share * p.qty, cur) * (1 - rate), true)
    }

    // 2. Past the last declaration, walk the fund's own rhythm forward and price
    //    each date at what it has been paying lately. This half is the estimate.
    const step = paymentCadenceDays(S, p.t)
    const each = averagePayment(S, p.t, net)
    if (!step || !each) continue
    let ex = msOf(declared[0].ex_date)
    for (let guard = 0; guard < 80; guard += 1) {
      ex += step * DAY
      const pay = payFor(isoOf(ex))
      if (pay > to) break
      if (pay >= from && pay > lastPaid) add(pay, p.t, each, false)
    }
  }

  const dates = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const perTicker = {}
  for (const d of dates) for (const part of d.parts) perTicker[part.ticker] = (perTicker[part.ticker] || 0) + part.amount

  return {
    received,
    estimated: dates.reduce((sum, d) => sum + d.total, 0),
    // What the funds have already declared and still owe — a firm number, unlike
    // the rest. The UI must not label these two the same way.
    declaredDue: dates.filter(d => d.declared).reduce((sum, d) => sum + d.total, 0),
    dates,
    perTicker,
    isEstimate: dates.some(d => !d.declared),
  }
}

/** The figure a goal is measured against, in MYR. */
export function goalCurrent(S, g) {
  const net = goalIncomeIsNet(S)
  const ticker = g.ticker || null
  const pick = r => (net ? r.net : r.gross)

  if (g.kind === GOAL_KIND.INCOME_PER_PAYMENT) return ticker ? averagePayment(S, ticker, net) : 0
  if (g.kind === GOAL_KIND.INCOME_MONTHLY) return monthlyIncomeRate(S, ticker, net)
  if (g.kind === GOAL_KIND.INCOME_YEAR) {
    const y = new Date().getFullYear()
    return pick(incomeIn(S, { ticker, from: `${y}-01-01`, to: `${y}-12-31` }))
  }
  return pick(incomeIn(S, { ticker }))
}

/* ── activity feed (History + Calendar share this normalisation) ──────────── */

/**
 * Which world a row belongs to.
 *
 * SEPARATE FROM `source`, which says how a row arrived — 'api' only ever means
 * the moomoo sync wrote it, 'manual' means it was typed. A hand-entered ETCO
 * trade is MOOMOO by domain and manual by source, so one badge cannot carry both
 * without lying about one of them.
 */
export const HISTORY_DOMAIN = {
  MOOMOO: 'MOOMOO',
  SAVINGS: 'SAVINGS',
  INCOME: 'INCOME',
  OWED: 'OWED',
}

export const HISTORY_DOMAIN_LABEL = {
  MOOMOO: 'moomoo',
  SAVINGS: 'savings',
  INCOME: 'income',
  OWED: 'owed',
}

/**
 * The filter keys the History screen offers, in order — domains first, then the
 * broker's own kinds. Two axes in one row, which works because they never
 * contradict: picking BUY implies moomoo, and picking SAVINGS implies not-BUY.
 */
export const HISTORY_FILTERS = ['ALL', 'MOOMOO', 'SAVINGS', 'INCOME', 'OWED', 'BUY', 'SELL', 'DIV', 'CASH']
export const HISTORY_FILTER_LABELS = {
  ALL: 'All',
  MOOMOO: 'moomoo',
  SAVINGS: 'Savings',
  INCOME: 'Income',
  OWED: 'Owed',
  BUY: 'Buys',
  SELL: 'Sells',
  DIV: 'Dividends',
  CASH: 'Cash',
}

/**
 * Transactions and cash movements merged into one newest-first feed.
 *
 * Matches legacy `renderHist()`: cash rows of type DIVIDEND are EXCLUDED,
 * because a dividend normally lives as a DIV transaction and would otherwise
 * appear twice. FEE cash rows are included but no filter selects them.
 *
 * @returns {Array<{
 *   key: string, kind: 'BUY'|'SELL'|'DIV'|'DEPOSIT'|'WITHDRAW'|'FEE',
 *   date: string, ticker: string|null, name: string, currency: string,
 *   -- `ticker` is set on a FEE row when the tax was attributed to a holding, so
 *   -- do NOT use it to decide whether a row is a cash movement; use `kind`.
 *   qty: number, price: number, amount: number, direction: 1|-1,
 *   source: string, id: number|null
 * }>}  `amount` is the magnitude of the cash effect in `currency`;
 *      `direction` is +1 when money comes in, -1 when it goes out.
 *      For BUY/SELL, amount already includes fees the way legacy showed it:
 *      qty*price + fees on a buy, qty*price - fees on a sell.
 */
/**
 * Payments a fund has declared, whose day has come, that moomoo has not booked yet
 * — shaped like the History rows they are about to become.
 *
 * This is NOT invented data. The amount is the fund's own published per-share rate
 * times the shares held, and the tax is the rate this account actually gets charged;
 * it is the same arithmetic the broker will do. It exists because moomoo updates a
 * balance the moment money lands but only publishes the cash-flow row at clearing,
 * so there is a window where a payment is real, visible in the moomoo app, in your
 * cash — and absent from every API a sync can read.
 *
 * These rows are marked `pending` and must never be counted as received. Every
 * income figure in the app comes from booked transactions and none of them look
 * here; this is so History does not read as broken while the broker catches up.
 *
 * They clear themselves: once the real row lands, dividendPayments() reports a
 * receipt on or after the pay date and the declaration stops being due.
 */
export function pendingHistoryRows(S) {
  const now = new Date()
  const p2 = n => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`

  const rows = []
  for (const p of positions(S)) {
    const i = instr(S, p.t)
    const cur = i ? i.currency : 'MYR'
    const lag = settlementLagDays(S, p.t)
    const paid = dividendPayments(S, p.t)
    const lastPaid = paid.length ? paid[0].date : ''
    const rate = withholdingRate(S, p.t)

    for (const d of distributionsFor(S, p.t)) {
      const pay = payDateFor(d.ex_date, lag)
      if (pay > today) continue // declared, but not due yet — that is the outlook's job
      if (pay <= lastPaid) break // newest-first, so everything below this has settled
      const gross = d.per_share * p.qty
      if (gross <= 0) continue
      rows.push({
        key: `p:${p.t}:${d.ex_date}`, id: null, kind: 'DIV', date: pay, ticker: p.t,
        name: (i && i.name) || '', currency: cur, qty: 0, price: 0,
        amount: gross, direction: 1, source: 'pending', pending: true, domain: HISTORY_DOMAIN.MOOMOO,
      })
      // moomoo books the withholding as its own row, so show it the same way.
      if (rate > 0) {
        rows.push({
          key: `p:${p.t}:${d.ex_date}:wht`, id: null, kind: 'FEE', date: pay, ticker: p.t,
          name: '', currency: cur, qty: 0, price: 0,
          amount: gross * rate, direction: -1, source: 'pending', pending: true, domain: HISTORY_DOMAIN.MOOMOO,
        })
      }
    }
  }
  return rows
}

/**
 * Everything that moved the wallet, newest first.
 *
 * A dividend is stored as a DIV transaction because it belongs to a holding, not
 * to the wallet — but it is money paid INTO the wallet all the same, and leaving
 * it out showed the withholding tax without the payment it was taken from. The
 * ledger then read as an account that is only ever charged.
 *
 * Declared-but-unbooked payments are here too: the broker's balance at the top of
 * the screen already includes them (moomoo credits the cash before it publishes
 * the row), so omitting them would leave the ledger further from the balance, not
 * closer. They carry `pending` and the screen marks them.
 *
 * This still does not sum to the balance, and is not meant to: moomoo leaves trade
 * fees out of its cash-flow ledger entirely. See the note on the Wallet screen.
 */
const WALLET_ORDER = { DIVIDEND: 0, DEPOSIT: 1, WITHDRAW: 2, FEE: 3 }

export function walletMovements(S) {
  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker
  const rows = S.cash.map(c => ({
    ...c,
    key: `c${c.id}`,
    ticker: (c.instrument_id && tickerOf[c.instrument_id]) || null,
  }))

  for (const x of S.transactions) {
    if (x.side !== 'DIV' || !x.trade_date) continue
    const i = instr(S, x.ticker)
    rows.push({
      key: `t${x.id}`, id: x.id, type: 'DIVIDEND', ticker: x.ticker,
      currency: i ? i.currency : 'MYR', amount: (x.amount ?? x.price) || 0,
      date: x.trade_date, source: x.source,
    })
  }

  for (const r of pendingHistoryRows(S)) {
    rows.push({
      key: r.key, id: null, type: r.kind === 'DIV' ? 'DIVIDEND' : 'FEE',
      ticker: r.ticker, currency: r.currency, amount: r.amount,
      date: r.date, source: 'pending', pending: true,
    })
  }

  // Newest day first, then a fund's dividend immediately above the tax taken from
  // it — the two rows are one event and read as nonsense in the other order.
  return rows.sort(
    (x, y) =>
      y.date.localeCompare(x.date) ||
      String(x.ticker || '').localeCompare(String(y.ticker || '')) ||
      (WALLET_ORDER[x.type] ?? 9) - (WALLET_ORDER[y.type] ?? 9),
  )
}

export function historyRows(S) {
  const rows = []
  // Which world a row belongs to. Distinct from `source`, which says how it got
  // in — a hand-typed ETCO trade is MOOMOO by domain and 'manual' by source, and
  // conflating the two would make an unsynced broker row look like it came from
  // somewhere else entirely.
  // Withholding tax carries an instrument (see withholdingByTicker), so those rows
  // can name their stock instead of reading as anonymous wallet activity — which
  // also makes them reachable from an instrument filter.
  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker
  for (const x of S.transactions) {
    const i = instr(S, x.ticker) || { currency: 'MYR', name: '' }
    if (x.side === 'DIV') {
      rows.push({
        key: `t${x.id}`,
        id: x.id,
        kind: 'DIV',
        date: x.trade_date,
        ticker: x.ticker,
        name: i.name || '',
        currency: i.currency,
        qty: 0,
        price: 0,
        amount: (x.amount ?? x.price) || 0,
        direction: 1,
        source: x.source,
        domain: HISTORY_DOMAIN.MOOMOO,
      })
    } else {
      rows.push({
        key: `t${x.id}`,
        id: x.id,
        kind: x.side,
        date: x.trade_date,
        ticker: x.ticker,
        name: i.name || '',
        currency: i.currency,
        qty: x.qty,
        price: x.price,
        amount: x.qty * x.price + (x.side === 'BUY' ? x.fees : -x.fees),
        direction: x.side === 'BUY' ? -1 : 1,
        source: x.source,
        domain: HISTORY_DOMAIN.MOOMOO,
      })
    }
  }
  for (const c of S.cash) {
    if (c.type === 'DIVIDEND') continue // already counted as a DIV transaction
    rows.push({
      key: `c${c.id}`,
      id: c.id,
      kind: c.type,
      date: c.date,
      ticker: (c.instrument_id && tickerOf[c.instrument_id]) || null,
      name: '',
      currency: c.currency,
      qty: 0,
      price: 0,
      amount: c.amount,
      direction: c.type === 'WITHDRAW' || c.type === 'FEE' ? -1 : 1,
      source: c.source,
      domain: HISTORY_DOMAIN.MOOMOO,
    })
  }

  // ── everything that is not the broker ──────────────────────────────────────
  // These read from the parallel tables and never from `transactions` or
  // `cash_movements`. This is a presentation-layer union only: no balance, no
  // wallet figure and no income run rate is computed from the merged list.

  const assetName = new Map((S.assets || []).map(a => [a.id, a.name]))
  for (const e of S.assetEntries || []) {
    rows.push({
      key: `a${e.id}`,
      id: e.id,
      kind: e.type,
      date: e.date,
      ticker: null,
      name: assetName.get(e.asset_id) || e.slug || '',
      currency: 'MYR',
      qty: 0,
      price: 0,
      amount: e.amount,
      direction: e.type === 'WITHDRAW' || e.type === 'FEE' ? -1 : 1,
      source: e.source,
      domain: HISTORY_DOMAIN.SAVINGS,
    })
  }

  for (const e of S.incomeEvents || []) {
    rows.push({
      key: `i${e.id}`,
      id: e.id,
      kind: 'PAY',
      date: e.date,
      ticker: null,
      name: e.name || '',
      currency: 'MYR',
      qty: 0,
      price: 0,
      // What actually reached you. Gross would overstate the row against every
      // other amount in this list, all of which are money that moved.
      amount: netOf(e),
      direction: 1,
      source: e.source,
      domain: HISTORY_DOMAIN.INCOME,
    })
  }

  const commitmentName = new Map((S.commitments || []).map(c => [c.id, c.name]))
  for (const p of S.commitmentPayments || []) {
    rows.push({
      key: `p${p.id}`,
      id: p.id,
      kind: 'PAYMENT',
      date: p.date,
      ticker: null,
      name: commitmentName.get(p.commitment_id) || p.name || '',
      currency: 'MYR',
      qty: 0,
      price: 0,
      amount: p.amount,
      direction: -1,
      source: p.source,
      domain: HISTORY_DOMAIN.OWED,
    })
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Applies a HISTORY_FILTERS key to the rows from historyRows().
 *
 * CASH covers FEE as well as DEPOSIT/WITHDRAW, which legacy did not: the synced
 * account carries 79 FEE rows (30% FATCA withholding on US dividends), and
 * leaving them reachable only under ALL hid real money leaving the wallet.
 */
export function filterHistory(rows, filter) {
  if (filter === 'ALL') return rows
  if (HISTORY_DOMAIN[filter]) return rows.filter(r => r.domain === filter)
  // CASH means the broker's wallet movements, not every ringgit that ever moved —
  // an ASB deposit is a DEPOSIT too, and sweeping it in here would make this
  // filter mean something different from what the Wallet screen shows.
  if (filter === 'CASH') {
    return rows.filter(
      r => r.domain === HISTORY_DOMAIN.MOOMOO &&
        (r.kind === 'DEPOSIT' || r.kind === 'WITHDRAW' || r.kind === 'FEE'))
  }
  return rows.filter(r => r.kind === filter)
}

/* ── calendar ─────────────────────────────────────────────────────────────── */

/**
 * Activity for one month, keyed by day-of-month (1..31).
 *
 * Matches legacy `renderCal()`: BOTH transactions and ALL cash movements are
 * included (unlike historyRows, the calendar does show DIVIDEND cash rows), and
 * a cash row is given a `side` equal to its type so one renderer handles both.
 *
 * @param {object} S
 * @param {number} year        full year, e.g. 2026
 * @param {number} monthIndex  0-based, as in Date#getMonth()
 * @returns {Record<number, Array<object>>}  each entry carries the raw row plus
 *          `side` ('BUY'|'SELL'|'DIV'|'DEPOSIT'|'WITHDRAW'|'DIVIDEND'|'FEE'),
 *          `ticker` (null for cash) and `currency`.
 */
export function calendarByDay(S, year, monthIndex) {
  const byDay = {}
  const push = (dateStr, row) => {
    const dt = new Date(dateStr + 'T00:00')
    if (dt.getFullYear() !== year || dt.getMonth() !== monthIndex) return
    ;(byDay[dt.getDate()] ??= []).push(row)
  }
  for (const x of S.transactions) {
    const i = instr(S, x.ticker) || { currency: 'MYR' }
    push(x.trade_date, { ...x, side: x.side, currency: i.currency })
  }
  for (const c of S.cash) {
    push(c.date, { ...c, side: c.type, ticker: null })
  }
  return byDay
}

/**
 * RM total the owner put INTO the market on a given day's rows — the figure the
 * legacy calendar cell shows. BUY legs only, at qty*price, fees excluded.
 */
/**
 * What a calendar month came to, in MYR — the line above the grid.
 *
 * `received` is net of withholding, matching every other income figure in the app.
 * `intoMarket` is the notional of buys, excluding fees, which is what the day cells
 * already show. These are not two halves of one sum and are never netted off: money
 * spent buying and money paid to you answer different questions.
 */
export function monthSummary(S, year, monthIndex) {
  const byDay = calendarByDay(S, year, monthIndex)
  const rows = Object.values(byDay).flat()
  const cur = r => r.currency || 'MYR'

  let received = 0
  let withheld = 0
  let intoMarket = 0
  let out = 0
  for (const r of rows) {
    if (r.side === 'BUY') intoMarket += toRM(S, r.qty * r.price, cur(r))
    else if (r.side === 'DIV') received += toRM(S, (r.amount ?? r.price) || 0, cur(r))
    else if (r.side === 'DIVIDEND') received += toRM(S, r.amount || 0, cur(r))
    else if (r.side === 'FEE') withheld += toRM(S, r.amount || 0, cur(r))
    else if (r.side === 'WITHDRAW') out += toRM(S, r.amount || 0, cur(r))
  }

  return {
    received: received - withheld,
    gross: received,
    withheld,
    intoMarket,
    out,
    activeDays: Object.keys(byDay).length,
  }
}

/**
 * Payouts still to come in a month, keyed by day of month.
 *
 * A thin wrapper over incomeOutlook() so the calendar does not have to know how a
 * pay date is derived. Each day carries `declared` — true only when EVERY payment
 * landing on it is one the fund has already published a rate for. The calendar
 * must not draw a projection as solidly as a declaration.
 */
export function outlookByDay(S, year, monthIndex) {
  const byDay = {}
  for (const d of incomeOutlook(S, year, monthIndex).dates) {
    byDay[Number(d.date.slice(8, 10))] = d
  }
  return byDay
}

/**
 * A day's rows collapsed into the few cards a calendar cell can actually hold.
 *
 * The raw feed is too granular to show one row per entry: a single day here runs to
 * eleven, four of them buys of the same fund and two of them the two halves of one
 * FX transfer. Grouped it reads as what happened rather than as bookkeeping.
 *
 *   income   a fund's dividend and the withholding taken from it, netted — one card,
 *            because they are one event and the second only ever explains the first
 *   buy/sell every fill of the same fund on the same day, summed
 *   swap     a same-day withdrawal and deposit in different currencies, paired
 *   cash     anything left, as itself
 *
 * Amounts stay in their own currency, as everywhere else in the app. `dir` is +1
 * into your pocket and −1 out of it.
 */
export function calendarDayCards(S, rows) {
  const byKey = new Map()
  const at = (key, seed) => {
    if (!byKey.has(key)) byKey.set(key, { key, amount: 0, count: 0, qty: 0, ...seed })
    return byKey.get(key)
  }

  const tickerOf = {}
  for (const i of S.instruments) tickerOf[i.id] = i.ticker

  const loose = []
  for (const r of rows) {
    const ticker = r.ticker || (r.instrument_id ? tickerOf[r.instrument_id] : null)
    const cur = r.currency || 'MYR'
    const name = ticker ? (instr(S, ticker) || {}).name || '' : ''

    if (r.side === 'DIV' || r.side === 'DIVIDEND') {
      const c = at(`inc:${ticker}`, { kind: 'income', ticker, name, currency: cur, dir: 1 })
      c.amount += (r.amount ?? r.price) || 0
      c.count += 1
      c.paid = true
    } else if (r.side === 'FEE' && ticker) {
      // Withholding belongs to the dividend it was taken from, netted into one card
      // — but moomoo does not always book them on the same day. When the tax lands
      // alone it is a charge, not income, and calling it income would print a
      // dividend card with a tick against a negative number.
      const c = at(`inc:${ticker}`, { kind: 'income', ticker, name, currency: cur, dir: 1 })
      c.amount -= r.amount || 0
    } else if (r.side === 'BUY' || r.side === 'SELL') {
      const c = at(`${r.side}:${ticker}`, {
        kind: r.side.toLowerCase(), ticker, name, currency: cur, dir: r.side === 'BUY' ? -1 : 1,
      })
      c.amount += r.qty * r.price
      c.qty += r.qty
      c.count += 1
    } else {
      loose.push({ ...r, currency: cur })
    }
  }

  // An FX transfer reaches the database as two rows; showing both reads as money
  // leaving and arriving rather than as one movement between wallets.
  const outs = loose.filter(r => r.side === 'WITHDRAW')
  const ins = loose.filter(r => r.side === 'DEPOSIT')
  const used = new Set()
  for (const o of outs) {
    const match = ins.find(i => i.currency !== o.currency && !used.has(i))
    if (!match) continue
    used.add(o)
    used.add(match)
    byKey.set(`swap:${o.id}`, {
      key: `swap:${o.id}`, kind: 'swap', ticker: null,
      name: `${o.currency} → ${match.currency}`,
      currency: match.currency, amount: match.amount || 0, dir: 1, count: 1, qty: 0,
    })
  }
  for (const r of loose) {
    if (used.has(r)) continue
    const out = r.side === 'WITHDRAW' || r.side === 'FEE'
    byKey.set(`cash:${r.id}`, {
      key: `cash:${r.id}`, kind: 'cash', ticker: null, name: r.side,
      currency: r.currency, amount: r.amount || 0, dir: out ? -1 : 1, count: 1, qty: 0,
    })
  }

  for (const c of byKey.values()) {
    if (c.kind !== 'income' || c.paid) continue
    // Tax with no dividend beside it: relabel and flip the direction so it reads
    // as money out, which is what it is.
    c.kind = 'tax'
    c.dir = -1
    c.amount = Math.abs(c.amount)
  }

  // Income first — it is why this portfolio exists — then trades, then wallet.
  const rank = { income: 0, tax: 0, buy: 1, sell: 1, swap: 2, cash: 3 }
  return [...byKey.values()].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || Math.abs(b.amount) - Math.abs(a.amount),
  )
}

/**
 * Income by month across a window either side of today, for the bar chart.
 *
 * `paid` is what landed, `due` is what is still expected — and the CURRENT month
 * carries both, which is the whole reason they are separate fields rather than one
 * number with a flag. A month part-paid and part-projected is the normal case.
 */
export function incomeMonths(S, back = 3, forward = 3) {
  const now = new Date()
  const out = []
  for (let k = -back; k <= forward; k += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    out.push({
      y,
      m,
      key: `${y}-${m}`,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      paid: monthSummary(S, y, m).received,
      due: incomeOutlook(S, y, m).estimated,
      current: k === 0,
    })
  }
  return out
}

/**
 * The year ahead, and the year behind, in MYR.
 *
 * `projected` walks twelve months forward through incomeOutlook: this month's
 * receipts plus what it still owes, then every later month's expected payments. It
 * is a PROJECTION built on per-share rates that have been falling 24-32% a quarter,
 * so it reads high more often than low and must never be presented as a promise.
 *
 * `paid` is the plain fact beside it — everything actually received, net of
 * withholding. It is deliberately not a twelve-month trailing figure: this account
 * has only held these funds since February, so a trailing year would divide real
 * income by months that could not have paid and understate the run rate badly.
 */
export function annualIncome(S) {
  const now = new Date()
  let projected = 0
  for (let k = 0; k < 12; k += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1)
    const o = incomeOutlook(S, d.getFullYear(), d.getMonth())
    projected += k === 0 ? o.received + o.estimated : o.estimated
  }
  const got = incomeIn(S, {})
  return {
    projected,
    paid: goalIncomeIsNet(S) ? got.net : got.gross,
    monthly: projected / 12,
    daily: projected / 365,
  }
}

/** What a day PAID you, in MYR — net of any withholding booked the same day. */
export function dayDivRM(S, rows) {
  let paid = 0
  for (const x of rows) {
    const cur = x.currency || 'MYR'
    if (x.side === 'DIV') paid += toRM(S, (x.amount ?? x.price) || 0, cur)
    else if (x.side === 'DIVIDEND') paid += toRM(S, x.amount || 0, cur)
    else if (x.side === 'FEE') paid -= toRM(S, x.amount || 0, cur)
  }
  return Math.max(paid, 0)
}

export function dayBuyRM(S, rows) {
  return rows
    .filter(x => x.side === 'BUY')
    .reduce((s, x) => s + toRM(S, x.qty * x.price, x.currency || 'MYR'), 0)
}

/**
 * The 7-column month grid the Calendar screen draws, Monday-first.
 * @returns {{ leading: number, days: number }} `leading` blank cells before the 1st.
 */
export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1)
  return {
    leading: (first.getDay() + 6) % 7, // Monday-first, as legacy
    days: new Date(year, monthIndex + 1, 0).getDate(),
  }
}

/* ── assets ───────────────────────────────────────────────────────────────── */

/**
 * Holdings that are not in moomoo — ASB, Tabung Haji, EPF.
 *
 * NOTHING BELOW READS THE BROKER TABLES, and nothing above reads these. That is
 * the whole point of the separate schema: an asset contribution is not a
 * cash_movement and must never reach cashBal(); an annual distribution is not a
 * DIV transaction and must never reach income() or the monthly run rate, where
 * one December payout would triple a 3-month average and then collapse it.
 *
 * The two worlds meet in exactly one derived figure — net worth — which does not
 * exist yet and will be built in its own function rather than by widening any of
 * these.
 *
 * Balances are derived here on every render, never stored, exactly as positions()
 * derives holdings from the transaction log.
 */

/** Money in and money out. WITHDRAW and FEE subtract; DEPOSIT and DISTRIBUTION add. */
const ASSET_OUT = new Set(['WITHDRAW', 'FEE'])

/** One asset's entries, newest first (the API already sorts them that way). */
export function assetEntriesFor(S, assetId) {
  return S.assetEntries.filter(e => e.asset_id === assetId)
}

/**
 * What the account is worth: everything that went in, less everything that came
 * out, including the distributions it paid itself.
 */
export function assetBalance(S, a) {
  return assetEntriesFor(S, a.id).reduce(
    (sum, e) => sum + (ASSET_OUT.has(e.type) ? -e.amount : e.amount), 0)
}

/**
 * Your own money, net of withdrawals — for EPF this includes the employer's half,
 * which is yours the moment it lands.
 *
 * CAN LEGITIMATELY GO NEGATIVE once withdrawals exceed deposits: put in 10k, earn
 * 5k, take out 12k and this reads −2k against a 3k balance. The arithmetic is
 * still right and total return is still balance − contributed. Do not treat a
 * negative here as an error.
 */
export function assetContributed(S, a) {
  return assetEntriesFor(S, a.id).reduce((sum, e) => {
    if (e.type === 'DEPOSIT') return sum + e.amount
    if (e.type === 'WITHDRAW') return sum - e.amount
    return sum
  }, 0)
}

/** What the account threw off: distributions less any fees charged against it. */
export function assetEarned(S, a) {
  return assetEntriesFor(S, a.id).reduce((sum, e) => {
    if (e.type === 'DISTRIBUTION') return sum + e.amount
    if (e.type === 'FEE') return sum - e.amount
    return sum
  }, 0)
}

/**
 * One row per asset, with everything the Assets screen needs.
 *
 * `balance − contributed === earned` holds identically for every row, which is
 * worth knowing: if it ever fails, an entry carries the wrong type. `returnedPct`
 * is cumulative since the first entry and deliberately NOT annualised — these
 * accounts have run for different lengths and an annual figure would invite a
 * comparison the data cannot support.
 *
 * Archived assets are excluded by default: archiving is what you do instead of
 * deleting an account with history, so it should leave the screen.
 */
export function assetRows(S, { includeArchived = false } = {}) {
  return S.assets
    .filter(a => includeArchived || !a.archived)
    .map(a => {
      const balance = assetBalance(S, a)
      const contributed = assetContributed(S, a)
      const earned = assetEarned(S, a)
      const entries = assetEntriesFor(S, a.id)
      return {
        asset: a,
        id: a.id,
        slug: a.slug,
        name: a.name,
        cur: a.currency,
        balance,
        contributed,
        earned,
        balanceRM: toRM(S, balance, a.currency),
        contributedRM: toRM(S, contributed, a.currency),
        earnedRM: toRM(S, earned, a.currency),
        // Against what you put in, not against the balance — "how much of my own
        // money has come back". Meaningless when nothing has been contributed.
        returnedPct: contributed > 0 ? (earned / contributed) * 100 : null,
        // A progress bar, never a limit: reinvested distributions and inherited
        // units can carry a real balance past ASB's cap.
        capPct: a.unit_cap ? Math.min((balance / a.unit_cap) * 100, 100) : null,
        headroom: a.unit_cap ? a.unit_cap - balance : null,
        entries,
        lastEntry: entries[0] || null,
      }
    })
}

/**
 * The strip at the top of the Assets screen. RM-combined, so it needs toRM() even
 * though everything is MYR today — the currency column exists and a USD account
 * would otherwise be silently added to ringgit.
 */
export function assetsTotal(S) {
  const rows = assetRows(S)
  const valueRM = rows.reduce((sum, r) => sum + r.balanceRM, 0)
  const contributedRM = rows.reduce((sum, r) => sum + r.contributedRM, 0)
  const earnedRM = rows.reduce((sum, r) => sum + r.earnedRM, 0)
  return {
    rows,
    valueRM,
    contributedRM,
    earnedRM,
    returnPct: contributedRM > 0 ? (earnedRM / contributedRM) * 100 : null,
  }
}

/**
 * The ledger table: every entry with its asset attached, newest first.
 *
 * `signed` is what the row should render — the sign lives here rather than in the
 * component so the table and any future total cannot disagree about direction.
 */
export function assetLedger(S, { assetId = null } = {}) {
  const byId = new Map(S.assets.map(a => [a.id, a]))
  return S.assetEntries
    .filter(e => assetId === null || e.asset_id === assetId)
    .map(e => ({
      ...e,
      asset: byId.get(e.asset_id) || null,
      name: (byId.get(e.asset_id) || {}).name || e.slug,
      signed: ASSET_OUT.has(e.type) ? -e.amount : e.amount,
    }))
}

/* ── the distribution estimator ────────────────────────────────────────────── */

/**
 * What this year's distribution is on track to be, and what a deposit today is
 * worth toward it.
 *
 * Both providers compute on something other than the closing balance, and the
 * difference is the whole point:
 *
 *   MIN_MONTHLY  ASB and Tabung Haji pay on the mean of the twelve monthly
 *                MINIMUM balances. ASNB's own wording: "Total Monthly Minimum
 *                Balance for the Year / 12 Months x Income Distribution Rate".
 *                A deposit therefore never lifts the month it lands in — the
 *                month's low has already happened.
 *   MADB         EPF's dividend accrues from the last day of each contribution
 *                month to the year end, so the balance you carried in earns a
 *                full year and a December contribution earns nothing.
 *
 * They differ in how they treat the EXISTING balance, but they agree exactly on
 * what a NEW deposit is worth: money added during month m earns for the (11 − m)
 * whole months that follow, under either rule. That is why one nudge serves both.
 *
 * Everything here is an estimate at a rate that has not been declared yet, and
 * every caller must say so.
 */

/** Money in and money out, as the ledger sees it. */
const signOf = e => (ASSET_OUT.has(e.type) ? -e.amount : e.amount)

const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The rate as a plain fraction.
 *
 * Sen-per-unit and percent are numerically identical here and that is not a
 * coincidence: an ASB unit is fixed at RM 1.00, so 5.75 sen per unit IS 5.75% of
 * the balance. `rate_quote` decides how it is written, never how it is computed.
 *
 * ASB's bonus is added because it is part of what was paid — but it is stored
 * apart because PNB pays it at its own discretion rather than from the fund, so
 * a screen can show the split.
 */
export function assetRate(a) {
  if (a.last_rate == null) return null
  return (a.last_rate + (a.last_bonus || 0)) / 100
}

/**
 * The twelve months of the provider's own financial year ending in `year`.
 * ASB and EPF end 31 December; ASB 2 and ASM end 31 March, so their year runs
 * April to March and a calendar-year assumption would be a month out at both ends.
 */
export function fiscalMonths(a, year) {
  const endMonth = Number(String(a.fiscal_year || '12-31').slice(0, 2))
  const out = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(year, endMonth - 1 - i, 1))
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }
  return out
}

/** Which financial year an ISO date falls in, for this provider's calendar. */
export function fiscalYearOf(a, iso) {
  const endMonth = Number(String(a.fiscal_year || '12-31').slice(0, 2))
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return m <= endMonth ? y : y + 1
}

/**
 * @returns {{
 *   basis: string, year: number, rate: number|null,
 *   months: Array<{key,label,amount,weight,status}>,
 *   opening: number, base: number, projected: number|null,
 *   nudge: {monthsAhead:number, perThousand:number, ifYouWait:number, costOfWaiting:number}|null,
 *   settledMonths: number, isEstimate: true
 * }}
 *   `base` is the figure the rate applies to — the mean of the minimums under
 *   MIN_MONTHLY, or the contribution-weighted balance under MADB. `status` is
 *   'closed' (the month has ended and its figure is final), 'current' (in
 *   progress — a deposit can no longer raise it, only a withdrawal can lower it)
 *   or 'projected' (still to come, and it assumes you neither add nor withdraw).
 */
export function distributionOutlook(S, a, year = null, nowISO = isoOf(Date.now())) {
  const fy = year == null ? fiscalYearOf(a, nowISO) : year
  const months = fiscalMonths(a, fy)
  const first = months[0]
  const from = `${monthKey(first.y, first.m)}-01`

  // Oldest first — a running balance depends on the order.
  const entries = assetEntriesFor(S, a.id).slice().reverse()
  const opening = entries.filter(e => e.date < from).reduce((sum, e) => sum + signOf(e), 0)

  const nowKey = nowISO.slice(0, 7)
  const madb = a.rate_basis === 'MADB'

  let balance = opening
  let settledMonths = 0
  const rows = months.map(({ y, m }, i) => {
    const key = monthKey(y, m)
    const inMonth = entries.filter(e => e.date.slice(0, 7) === key)
    const status = key < nowKey ? 'closed' : key === nowKey ? 'current' : 'projected'
    if (status !== 'projected') settledMonths += 1

    // The month's low: the balance carried in, or lower if something left during
    // it. Deposits cannot lower it, which is the entire reason timing matters.
    let low = balance
    for (const e of inMonth) {
      balance += signOf(e)
      if (balance < low) low = balance
    }

    // Under MADB the existing balance is carried by `opening` and only the money
    // ADDED in this month is weighted, by the whole months left after it.
    const contributed = inMonth.reduce((sum, e) => sum + signOf(e), 0)
    return {
      key,
      label: MONTH_LABEL[m],
      amount: madb ? contributed : low,
      weight: madb ? (11 - i) / 12 : 1 / 12,
      status,
    }
  })

  const base = (madb ? opening : 0) + rows.reduce((sum, r) => sum + r.amount * r.weight, 0)
  const rate = assetRate(a)

  // A deposit made now earns for the whole months that follow this one — the same
  // count under either rule (see the note at the top of this section).
  const idx = months.findIndex(({ y, m }) => monthKey(y, m) === nowKey)
  const monthsAhead = idx < 0 ? 0 : 11 - idx
  const nudge = rate == null || idx < 0 ? null : {
    monthsAhead,
    perThousand: 1000 * rate * (monthsAhead / 12),
    ifYouWait: 1000 * rate * (Math.max(monthsAhead - 1, 0) / 12),
    costOfWaiting: 1000 * rate * (1 / 12),
  }

  return {
    basis: a.rate_basis,
    year: fy,
    rate,
    months: rows,
    opening,
    base,
    projected: rate == null ? null : base * rate,
    nudge,
    settledMonths,
    isEstimate: true,
  }
}

/**
 * Everything you own, in one figure — the broker plus the accounts outside it.
 *
 * DELIBERATELY NOT CALLED NET WORTH. Nothing here subtracts what you owe, because
 * nothing in the app tracks that yet. A mortgage would move this figure by six
 * digits, so labelling it net worth would be the most expensive kind of wrong.
 * When liabilities exist this becomes the `owned` half of a real net worth and
 * the name changes with it.
 *
 * Asset colours continue past the instruments' slots so a card can never take the
 * same hue as a ticker's dot, which would read as a relationship that isn't there.
 */
export function totalOwned(S) {
  const p = portfolio(S)
  const a = assetsTotal(S)
  const n = S.instruments.length
  const parts = [
    { key: 'broker', name: 'moomoo', value: p.totalRM, color: slotColor(1) },
    ...a.rows.map((r, i) => ({
      key: r.slug,
      name: r.name,
      value: r.balanceRM,
      color: slotColor(((n + i) % 8) + 1),
    })),
  ].filter(x => x.value > 0)

  const totalRM = parts.reduce((sum, x) => sum + x.value, 0)
  return {
    brokerRM: p.totalRM,
    assetsRM: a.valueRM,
    totalRM,
    // A fraction 0..1, as allocation() returns, so the two can be drawn alike.
    parts: parts.map(x => ({ ...x, share: totalRM ? x.value / totalRM : 0 })),
    outsideSharePct: totalRM ? (a.valueRM / totalRM) * 100 : 0,
  }
}

/* ── commitments ──────────────────────────────────────────────────────────── */

/**
 * What you owe and what leaves every month.
 *
 * NOTHING HERE READS THE BROKER TABLES either. A car instalment is not a cash
 * movement and never reaches cashBal(); a rent payment is not a WITHDRAW.
 *
 * A loan's whole future follows from five fields — principal, rate, rate type,
 * term and start — so the schedule is DERIVED on every render and never stored.
 * `commitmentPayments` carries only what a schedule cannot know: an overpayment,
 * a missed month, a settlement. An empty list means everything went to plan.
 */

const MONTHS = 12

/** Whole instalments due between `from` and `on`, capped at the term. */
function instalmentsPaid(from, on, term) {
  if (!from) return 0
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = on.split('-').map(Number)
  const n = (y2 - y1) * MONTHS + (m2 - m1) + (d2 >= d1 ? 1 : 0)
  return Math.max(0, Math.min(n, term))
}

/**
 * The effective rate of a flat-rate loan, by the Hire-Purchase Act 1967's own
 * Seventh Schedule — which s4C has required lenders to disclose since long before
 * the 2026 reform.
 *
 *   F   = 100*C*T / (N*A)                    reduces to the quoted flat rate
 *   APR = 2*N*F*(300*C + N*F) / (2*N^2*F + 300*C*(N+1))
 *
 * Preferred over the tempting `flat * 2n/(n+1)`, which overstates by around half
 * a percentage point — enough to move a loan across a comparison — and over an
 * IRR solve, for two reasons beyond convenience: this is the number the law
 * defines, so it is the number on the customer's own agreement, and a closed form
 * cannot fail to converge. Checked against the flat/effective pairs Malaysian
 * lenders publish beside their own rates, it reproduces them to the basis point.
 */
export function flatToEffective(flatPct, termMonths, perYear = MONTHS) {
  const F = flatPct
  const N = termMonths
  const C = perYear
  const denom = 2 * N * N * F + 300 * C * (N + 1)
  return denom === 0 ? 0 : (2 * N * F * (300 * C + N * F)) / denom
}

/**
 * One loan's schedule as it stands today.
 *
 * FLAT charges interest on the ORIGINAL principal for the whole term however much
 * has been repaid, so `outstanding` is the instalments still to run — NOT what the
 * lender would settle for, which is lower and computed by a rebate this app does
 * not model. `owedIsInstalments` says so, and the screen must repeat it.
 *
 * REDUCING is ordinary amortisation. Its instalment is only stable while the rate
 * is: since 1 July 2026 an OPR move revises the instalment rather than the tenure,
 * so the bank's own recorded figure wins over the derived one.
 */
/**
 * The amount financed, from the instalment — the same equation loanSchedule uses
 * to go the other way.
 *
 *   flat      total payable is P plus P*r*years, spread over n, so
 *             P = instalment*n / (1 + r*years)
 *   reducing  the instalment is an annuity on P, so P is its present value
 *
 * Zero when there is nothing to invert from, which keeps the arithmetic
 * downstream finite rather than turning a missing figure into NaN spread across
 * a screen.
 */
export function principalFrom(c) {
  const n = c.term_months
  const pay = c.instalment
  if (!pay || !n) return 0
  // With no rate there is no interest to strip out, so what was financed is
  // simply what will be paid.
  if (c.rate == null || c.rate_type == null) return pay * n
  if (c.rate_type === 'FLAT') {
    const factor = 1 + (c.rate / 100) * (n / MONTHS)
    return factor > 0 ? (pay * n) / factor : 0
  }
  const r = c.rate / 100 / MONTHS
  if (r === 0) return pay * n
  return (pay * (1 - Math.pow(1 + r, -n))) / r
}

/**
 * The first instalment date implied by "N months left of M".
 *
 * Statements report progress, not a start: Maybank says "78 Months Left Out of
 * 108" and never names the day the agreement began. This inverts
 * instalmentsPaid() so the figure people actually have can be typed in, and the
 * stored row still holds a real date rather than a second way of saying the
 * same thing.
 */
export function startFromMonthsLeft(termMonths, monthsLeft, dueDay, nowISO = isoOf(Date.now())) {
  const term = Number(termMonths)
  const left = Number(monthsLeft)
  const day = Number(dueDay)
  if (!term || !Number.isFinite(left) || left < 0 || left > term || !day) return ''
  const paid = term - left
  const [y, m, d] = nowISO.split('-').map(Number)
  // instalmentsPaid adds one when today has passed the due day, so the month it
  // counts back to depends on where in the month we are.
  const bump = d >= day ? 1 : 0
  const idx = y * MONTHS + (m - 1) - (paid - bump)
  const yy = Math.floor(idx / MONTHS)
  const mm = (idx % MONTHS) + 1
  return `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function loanSchedule(c, nowISO = isoOf(Date.now()), extraPrincipal = 0) {
  const n = c.term_months
  // A statement shows the instalment, not the amount financed, so the principal
  // is optional and inverted from the instalment when it is missing. Inverting
  // is exact for both rate types — it is the same equation read the other way —
  // so a derived principal is not an estimate, only an unstated fact.
  const P = c.principal != null ? c.principal : principalFrom(c)
  const flat = c.rate_type === 'FLAT'
  const paid = instalmentsPaid(c.started_on, nowISO, n)
  const left = Math.max(n - paid, 0)
  // Most people know what they pay and how long is left; far fewer know the rate
  // or whether it is charged flat or reducing. Without it the schedule still
  // answers the question the screen is actually asking — how much is still to
  // pay — and simply declines the ones it cannot: no split, no effective rate.
  const rated = c.rate != null && c.rate_type != null

  let instalment, outstanding, interestThisMonth, effective

  if (!rated) {
    instalment = c.instalment || 0
    outstanding = left * instalment
    interestThisMonth = 0
    effective = null
  } else if (flat) {
    const totalInterest = P * (c.rate / 100) * (n / MONTHS)
    instalment = c.instalment || (P + totalInterest) / n
    outstanding = left * instalment
    // A flat loan has no contractual monthly split — the interest is fixed for the
    // whole term — so this apportions it straight-line, and the screen says so.
    interestThisMonth = left > 0 ? totalInterest / n : 0
    effective = flatToEffective(c.rate, n)
  } else {
    // eslint-disable-next-line no-lonely-if
    const r = c.rate / 100 / MONTHS
    const g = Math.pow(1 + r, n)
    instalment = c.instalment || (r === 0 ? P / n : (P * r * g) / (g - 1))
    outstanding = r === 0 ? P * (left / n) : (P * (g - Math.pow(1 + r, paid))) / (g - 1)
    interestThisMonth = outstanding * r
    effective = c.rate
  }

  // Recorded overpayments come straight off the balance. They also SHORTEN the
  // loan, which is deliberately not recomputed: that needs the schedule re-solved,
  // and showing a shortened term while the lender still expects the old one would
  // be worse than showing neither.
  outstanding = Math.max(outstanding - extraPrincipal, 0)

  return {
    instalment,
    paid,
    left,
    outstanding,
    effective,
    quoted: c.rate,
    flat,
    interestThisMonth,
    principalThisMonth: Math.max(instalment - interestThisMonth, 0),
    // With no rate, what is owed is the instalments still to run — the same
    // meaning a flat loan's figure carries, and for the same reason: nothing
    // here knows how it splits.
    owedIsInstalments: flat || !rated,
    rated,
    extraPaid: extraPrincipal,
  }
}

/** A card's minimum due — 5% or a floor, whichever is higher, never more than the
 *  balance. Standardised across every Malaysian issuer checked. */
export function cardMinimum(c) {
  const bal = c.balance || 0
  if (bal <= 0) return 0
  const pct = (c.min_payment_pct == null ? 5 : c.min_payment_pct) / 100
  const floor = c.min_payment_floor == null ? 50 : c.min_payment_floor
  return Math.min(Math.max(bal * pct, floor), bal)
}

/**
 * One row per active commitment, with everything the Money screen needs.
 *
 * `monthlyOut` is what actually leaves in a typical month: a loan's instalment, a
 * card's minimum, a recurring charge spread over its own cadence so an annual
 * premium does not land as a spike nothing can plan around.
 */
export function commitmentRows(S, { includeEnded = false, nowISO = isoOf(Date.now()) } = {}) {
  const extras = new Map()
  for (const p of S.commitmentPayments || []) {
    extras.set(p.commitment_id, (extras.get(p.commitment_id) || 0) + (p.extra_principal || 0))
  }

  return (S.commitments || [])
    .filter(c => includeEnded || c.active)
    .map(c => {
      const base = { commitment: c, id: c.id, kind: c.kind, name: c.name, cur: c.currency }

      if (c.kind === 'LOAN') {
        const s = loanSchedule(c, nowISO, extras.get(c.id) || 0)
        return {
          ...base,
          ...s,
          monthlyOut: s.left > 0 ? s.instalment : 0,
          owed: s.outstanding,
          progressPct: c.term_months ? (s.paid / c.term_months) * 100 : 0,
        }
      }

      if (c.kind === 'REVOLVING') {
        const bal = c.balance || 0
        const minimum = cardMinimum(c)
        const monthlyInterest = (bal * (c.apr || 0)) / 100 / MONTHS
        return {
          ...base,
          monthlyOut: minimum,
          owed: bal,
          minimum,
          // Only if the balance is carried — what it costs to revolve, not a
          // charge already incurred.
          interestThisMonth: monthlyInterest,
          principalThisMonth: Math.max(minimum - monthlyInterest, 0),
          utilisationPct: c.credit_limit ? (bal / c.credit_limit) * 100 : null,
          staleDays: c.balance_as_of ? Math.round((msOf(nowISO) - msOf(c.balance_as_of)) / DAY) : null,
          effective: c.apr,
          quoted: c.apr,
        }
      }

      // RECURRING — no balance, and every ringgit of it is spent.
      const per = c.every_months || 1
      return {
        ...base,
        monthlyOut: c.amount / per,
        owed: 0,
        amount: c.amount,
        everyMonths: per,
        interestThisMonth: 0,
        principalThisMonth: 0,
      }
    })
    .sort((a, b) => b.monthlyOut - a.monthlyOut)
}

/**
 * The strip at the top of the Money screen.
 *
 * `principalPerMonth` and `interestPerMonth` are kept apart because only the
 * second is spent — the first moves from cash into equity, and a screen that
 * totals them as "money out" gets cash flow right and net worth wrong.
 */
export function commitmentsTotal(S, opts = {}) {
  const rows = commitmentRows(S, opts)
  const sum = f => rows.reduce((t, r) => t + toRM(S, f(r) || 0, r.cur), 0)
  return {
    rows,
    monthlyOutRM: sum(r => r.monthlyOut),
    owedRM: sum(r => r.owed),
    interestPerMonthRM: sum(r => r.interestThisMonth),
    principalPerMonthRM: sum(r => r.principalThisMonth),
  }
}

/* ── income, and the waterfall ────────────────────────────────────────────── */

/**
 * What arrives each month, and what is left once the obligations are out.
 *
 * NET IS DERIVED, NEVER STORED. It is gross less the DEDUCTED half of the
 * statutory block — employer EPF, SOCSO and EIS are paid on top and never pass
 * through your pay, so subtracting them would understate take-home and adding
 * them to gross would overstate income. Keeping the two groups apart in the
 * schema is what makes both mistakes unavailable here.
 */

/** Everything that comes out of the employee's pay. */
const DEDUCTED_FIELDS = [
  'epf_employee', 'socso_employee', 'eis_employee', 'skbbk', 'pcb', 'zakat', 'other_deducted',
]
/** Everything the employer pays alongside it. Never touches net. */
const ON_TOP_FIELDS = ['epf_employer', 'socso_employer', 'eis_employer']

const sumOf = (e, keys) => keys.reduce((t, k) => t + (e[k] || 0), 0)

/** What actually reached you. */
export function netOf(e) {
  return e.gross - sumOf(e, DEDUCTED_FIELDS)
}

/** What you cost — gross plus the employer's contributions. Shown nowhere by
 *  default; it is a fact about the employer, not about your money. */
export function employerCostOf(e) {
  return e.gross + sumOf(e, ON_TOP_FIELDS)
}

export function deductionsOf(e) {
  return {
    deducted: sumOf(e, DEDUCTED_FIELDS),
    onTop: sumOf(e, ON_TOP_FIELDS),
    epfTotal: (e.epf_employee || 0) + (e.epf_employer || 0),
  }
}

/** Months averaged for an irregular source — the same window monthlyIncomeRate()
 *  uses for dividends, and for the same reason: shorter is noise, longer is stale. */
export const VARIABLE_MONTHS = 3

const eventsForSource = (S, id) => (S.incomeEvents || []).filter(e => e.source_id === id)

/**
 * One row per active source.
 *
 * A MONTHLY source contributes its most recent net — a firm figure. An IRREGULAR
 * one contributes the mean of the last few months, which is an estimate and is
 * flagged `variable` so the UI can draw it hatched. Salary is a floor; freelance
 * is a guess, and a good quarter must never quietly become the baseline you plan
 * against.
 */
export function incomeRows(S, { includeEnded = false, nowISO = isoOf(Date.now()) } = {}) {
  const from = isoOf(msOf(nowISO) - VARIABLE_MONTHS * 31 * DAY)

  return (S.incomeSources || [])
    .filter(s => includeEnded || s.active)
    .map(s => {
      const events = eventsForSource(S, s.id)
      const last = events[0] || null
      const variable = s.cadence === 'IRREGULAR'

      let monthly
      if (variable) {
        const recent = events.filter(e => e.date >= from)
        monthly = recent.reduce((t, e) => t + netOf(e), 0) / VARIABLE_MONTHS
      } else if (last) {
        monthly = netOf(last)
      } else {
        // Nothing recorded yet: fall back to the expected gross, and say so.
        monthly = s.gross_default || 0
      }

      return {
        source: s,
        id: s.id,
        name: s.name,
        kind: s.kind,
        cur: s.currency,
        variable,
        monthly,
        monthlyRM: toRM(S, monthly, s.currency),
        last,
        events,
        // True when the figure is a guess rather than a recorded payment: either
        // an average, or a default standing in for a month never entered.
        isEstimate: variable || !last,
      }
    })
    .sort((a, b) => b.monthlyRM - a.monthlyRM)
}

/**
 * The waterfall.
 *
 *   net income − fixed commitments        = uncommitted
 *   uncommitted − goal budgets claimed    = unclaimed
 *
 * TWO SUBTRACTIONS, TWO MEANINGS, and they must not be merged. Uncommitted is a
 * fact about what you owe; unclaimed is a fact about what you intend. Unclaimed
 * can be negative while uncommitted is perfectly healthy — that is goals claiming
 * more than exists, which is a different problem with a different fix.
 *
 * It ends at `unclaimed`, never at "surplus": this app tracks what is known in
 * advance and not what you spend, so everything you actually live on is still
 * ahead of this figure.
 */
export function waterfall(S, opts = {}) {
  const rows = incomeRows(S, opts)
  const firmRM = rows.filter(r => !r.isEstimate).reduce((t, r) => t + r.monthlyRM, 0)
  const variableRM = rows.filter(r => r.isEstimate).reduce((t, r) => t + r.monthlyRM, 0)
  const incomeRM = firmRM + variableRM

  const out = commitmentsTotal(S, opts)
  const uncommittedRM = incomeRM - out.monthlyOutRM

  // Every goal that has named a monthly budget is a claim on the same pool.
  const claims = (S.goals || [])
    .filter(g => g.monthly_budget)
    .map(g => ({ goal: g, claimed: g.monthly_budget }))
  const claimedRM = claims.reduce((t, c) => t + c.claimed, 0)

  return {
    rows,
    firmRM,
    variableRM,
    incomeRM,
    committedRM: out.monthlyOutRM,
    uncommittedRM,
    claims,
    claimedRM,
    unclaimedRM: uncommittedRM - claimedRM,
    // The screen must say which of the two is the problem, so it needs both.
    overclaimedRM: Math.max(claimedRM - uncommittedRM, 0),
    commitments: out,
  }
}

/* ── goals against real money ─────────────────────────────────────────────── */

/**
 * How much of each goal's budget the month can actually fund.
 *
 * This is what income and commitments were built for. Before them,
 * `goals.monthly_budget` was a number typed into a box with nothing behind it:
 * nothing checked it against what you earn, what you already owe, or what the
 * other goals had claimed. Now each one is a claim on a finite, known pool.
 *
 * THE SHORTFALL LANDS ON ONE GOAL, NOT SPREAD ACROSS ALL OF THEM. Goals are
 * funded in their own order until the pool runs out, so the last one absorbs
 * whatever is missing and can be named. A plan that quietly shaves every target
 * is worse than one that says which target it cannot keep — reorder the list and
 * the squeeze moves somewhere you chose.
 *
 * Returns everything `waterfall()` does, plus a row per goal.
 */
export function goalFunding(S, opts = {}) {
  const w = waterfall(S, opts)

  let pool = w.uncommittedRM
  const rows = (S.goals || []).map(g => {
    const claimed = g.monthly_budget || 0
    // Never negative: an already-exhausted pool funds nothing rather than
    // clawing back from a goal that was funded before it.
    const funded = Math.max(Math.min(claimed, pool), 0)
    pool -= funded
    return { goal: g, claimed, funded, shortfall: Math.max(claimed - funded, 0) }
  })

  return {
    ...w,
    rows,
    // What no goal has asked for. Still before living costs, like everything else
    // downstream of the waterfall.
    spareRM: Math.max(pool, 0),
    // True only when income exists: with none recorded, uncommitted is negative
    // because nothing has been entered, and every goal would "overshoot" a pool
    // that was never filled. Blaming the goals there is exactly backwards.
    meaningful: w.rows.length > 0,
  }
}

/**
 * What you own less what you owe.
 *
 * `totalOwned()` deliberately refused to call itself net worth while nothing
 * tracked debt. Now something does, so this is the real figure — with one caveat
 * it must keep stating: a loan whose underlying item is not tracked as an asset
 * subtracts the debt without adding the thing it bought. Track a mortgage and not
 * the house and the number understates you by the whole house, which is why the
 * label says what is excluded rather than burying it.
 */
export function netWorth(S, opts = {}) {
  const owned = totalOwned(S)
  const owed = commitmentsTotal(S, opts)
  const liabilities = owed.rows
    .filter(r => r.owed > 0)
    .map(r => ({ key: r.id, name: r.name, value: r.owed, kind: r.kind }))

  return {
    ...owned,
    owedRM: owed.owedRM,
    liabilities,
    netRM: owned.totalRM - owed.owedRM,
    // Nothing in the app is an ITEM kind yet, so no loan has its purchase
    // counted on the other side. The Dashboard says so in words.
    itemsTracked: false,
  }
}

/* ── the money calendar ───────────────────────────────────────────────────── */

/**
 * Salary in, instalments out, on the month grid.
 *
 * A SEPARATE LAYER from calendarByDay(), which is broker-shaped — its rows carry
 * `side`, `ticker`, `qty` and `price`, none of which a rent payment has. Forcing
 * one into the other would mean nullable fields on both sides and a renderer that
 * has to guess which kind of row it is holding.
 *
 * THREE STATES, because the certainty genuinely differs and the app has always
 * drawn a guess differently from a fact:
 *
 *   recorded   it happened, and there is a row saying so
 *   due        the date and the amount are both known in advance — an instalment
 *   estimated  the date is known but the amount is not, which is what a credit
 *              card statement is: you know the 18th, not the figure
 *
 * A FOURTH CASE DELIBERATELY DOES NOT APPEAR ON THE GRID: irregular income has
 * neither a date nor an amount, and putting freelance work on a day would be
 * inventing both. It surfaces in the month note instead.
 */

/** Clamp a due day to a month that is shorter than it — the 31st in February. */
function dueDayIn(year, monthIndex, day) {
  if (day == null) return null
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  // -1 is the "last working day" convention some payrolls use; weekends are not
  // modelled, so it lands on the last calendar day.
  if (day === -1) return last
  return Math.min(day, last)
}

/**
 * @returns {{[day:number]: Array<{key,dir,label,amount,state,domain,note}>}}
 *   `dir` is +1 for money in and -1 for money out. `amount` is null only when the
 *   state is 'estimated' and nothing is known at all.
 */
export function moneyByDay(S, year, monthIndex, nowISO = isoOf(Date.now())) {
  const byDay = {}
  const put = (day, ev) => {
    if (!day) return
    ;(byDay[day] ??= []).push(ev)
  }
  const pad = n => String(n + 1).padStart(2, '0')
  const monthKey = `${year}-${pad(monthIndex)}`
  const inMonth = d => typeof d === 'string' && d.slice(0, 7) === monthKey
  const dayOf = d => Number(d.slice(8, 10))

  // ── things that actually happened ────────────────────────────────────────
  const sourceName = new Map((S.incomeSources || []).map(s => [s.id, s.name]))
  const recordedSources = new Set()
  for (const e of S.incomeEvents || []) {
    if (!inMonth(e.date)) continue
    recordedSources.add(e.source_id)
    put(dayOf(e.date), {
      key: `ie${e.id}`,
      dir: 1,
      label: sourceName.get(e.source_id) || e.name || 'Income',
      amount: netOf(e),
      state: 'recorded',
      domain: 'INCOME',
    })
  }

  const assetName = new Map((S.assets || []).map(a => [a.id, a.name]))
  for (const e of S.assetEntries || []) {
    if (!inMonth(e.date)) continue

    // A CONTRIBUTION FUNDED BY PAYROLL WAS NEVER IN YOUR POCKET. Net pay already
    // excludes the EPF that produced this row, so showing it as money leaving
    // would deduct the same ringgit twice on the same screen.
    if (e.source === 'payroll') continue

    // THE DIRECTION IS THE OPPOSITE OF THE ASSETS SCREEN, and deliberately so.
    // There, a deposit raises the balance and reads +. Here the question is what
    // moved through your hands: paying money INTO ASB is money leaving, and
    // taking it out is money arriving.
    const inflow = e.type === 'WITHDRAW'
    // A distribution is not cash flow at all — it is reinvested where it lands.
    // It still belongs on the day (it happened) but must not be totalled as
    // money arriving, or a January ASB payout would read as a windfall month.
    const growth = e.type === 'DISTRIBUTION'

    put(dayOf(e.date), {
      key: `ae${e.id}`,
      dir: growth ? 0 : inflow ? 1 : -1,
      label: assetName.get(e.asset_id) || e.slug || 'Savings',
      amount: e.amount,
      state: 'recorded',
      domain: 'SAVINGS',
      note: growth ? 'distribution, reinvested — not cash in hand' : null,
    })
  }

  const commitmentName = new Map((S.commitments || []).map(c => [c.id, c.name]))
  const paidCommitments = new Set()
  for (const p of S.commitmentPayments || []) {
    if (!inMonth(p.date)) continue
    paidCommitments.add(p.commitment_id)
    put(dayOf(p.date), {
      key: `cp${p.id}`,
      dir: -1,
      label: commitmentName.get(p.commitment_id) || p.name || 'Payment',
      amount: p.amount,
      state: 'recorded',
      domain: 'OWED',
      note: p.extra_principal > 0 ? 'includes an overpayment' : null,
    })
  }

  // ── things the month expects ─────────────────────────────────────────────
  for (const s of S.incomeSources || []) {
    // Irregular income has no date to place. Inventing one is exactly the kind
    // of confident guess the rest of this app refuses to make.
    if (!s.active || s.cadence !== 'MONTHLY') continue
    if (recordedSources.has(s.id)) continue // it already landed; the fact wins
    const day = dueDayIn(year, monthIndex, s.pay_day)
    put(day, {
      key: `is${s.id}`,
      dir: 1,
      label: s.name,
      amount: s.gross_default || null,
      state: 'estimated',
      domain: 'INCOME',
      note: s.gross_default ? 'usual gross, before deductions' : null,
    })
  }

  for (const c of S.commitments || []) {
    if (!c.active || paidCommitments.has(c.id)) continue
    const day = dueDayIn(year, monthIndex, c.due_day)
    if (!day) continue

    if (c.kind === 'LOAN') {
      const s = loanSchedule(c, nowISO)
      if (s.left <= 0) continue
      put(day, { key: `cl${c.id}`, dir: -1, label: c.name, amount: s.instalment, state: 'due', domain: 'OWED' })
    } else if (c.kind === 'REVOLVING') {
      // The date is known and the amount is not: a statement has not been issued
      // for it yet. The minimum off the stored balance is the floor, not the bill.
      put(day, {
        key: `cr${c.id}`,
        dir: -1,
        label: c.name,
        amount: cardMinimum(c),
        state: 'estimated',
        domain: 'OWED',
        note: 'minimum on the last balance you recorded — the statement decides the rest',
      })
    } else if ((c.every_months || 1) === 1) {
      // Only monthly recurring items can be placed. A quarterly or annual charge
      // has no start date stored, so which month it falls in is unknown — and a
      // wrong month is worse than no mark.
      put(day, { key: `cc${c.id}`, dir: -1, label: c.name, amount: c.amount, state: 'due', domain: 'OWED' })
    }
  }

  return byDay
}

/**
 * What the month expects that could not be given a day.
 *
 * These exist so the grid can stay honest without hiding anything: an irregular
 * income and a quarterly premium are both real, and neither has a date this
 * function is entitled to invent.
 */
export function moneyMonthNotes(S, year, monthIndex, nowISO = isoOf(Date.now())) {
  const notes = []
  const monthKey = year == null ? null : `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  const landed = new Set(
    (S.incomeEvents || [])
      .filter(e => monthKey && e.date.slice(0, 7) === monthKey)
      .map(e => e.source_id))

  for (const r of incomeRows(S, { nowISO })) {
    if (!r.variable) continue
    // It already arrived this month and is on the grid as a fact. Listing the
    // three-month average beside it would read as a second, additional payment.
    if (landed.has(r.id)) continue
    notes.push({
      key: `v${r.id}`,
      dir: 1,
      label: r.name,
      amount: r.monthly,
      why: 'irregular — no date to place it on, averaged over three months',
    })
  }
  for (const c of S.commitments || []) {
    if (!c.active || c.kind !== 'RECURRING' || (c.every_months || 1) === 1) continue
    notes.push({
      key: `r${c.id}`,
      dir: -1,
      label: c.name,
      amount: c.amount / (c.every_months || 1),
      why: `every ${c.every_months} months — which one is not recorded, so it is spread rather than dated`,
    })
  }
  return notes
}

/** In, out and the difference for a month, counting only what the grid shows. */
export function moneyMonthTotals(S, year, monthIndex, nowISO = isoOf(Date.now())) {
  const byDay = moneyByDay(S, year, monthIndex, nowISO)
  let inRM = 0
  let outRM = 0
  for (const evs of Object.values(byDay)) {
    for (const e of evs) {
      // dir 0 is a real event that moved no pocket money — a reinvested
      // distribution. It shows on the day and stays out of the arithmetic.
      if (!e.amount || !e.dir) continue
      if (e.dir > 0) inRM += e.amount
      else outRM += e.amount
    }
  }
  return { inRM, outRM, netRM: inRM - outRM, notes: moneyMonthNotes(S, year, monthIndex, nowISO) }
}
