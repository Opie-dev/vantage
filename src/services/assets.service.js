/**
 * Holdings outside moomoo — today ASB, Tabung Haji and EPF.
 *
 * Nothing here touches the broker tables. An asset contribution is not a
 * `cash_movements` row and never reaches cashBal(); an annual distribution is not
 * a DIV `transaction` and never reaches income() or the monthly run rate. That
 * separation is the whole reason these tables exist rather than three rows in
 * `instruments` — see personal-assets-plan.md §1.
 *
 * Balances are not stored anywhere. They are derived from `asset_entries` on the
 * client, exactly as positions and the wallet are derived from the transaction
 * log, so there is no running total here that can drift.
 */
const assets = require('../models/assets.model');
const assetEntries = require('../models/assetEntries.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

/** Mirrors the assets_kind_check constraint in the migration. COMMODITY and ITEM
 *  are designed but not yet permitted — nothing can write their columns. */
const KINDS = ['SAVINGS'];
/**
 * Mirrors assets_rate_basis_check.
 *
 *   MIN_MONTHLY  ASB, ASM and Tabung Haji — the average of your monthly lows
 *   MADB         EPF — earning from the last day of the contributing month
 *   NONE         a cash pot that declares no annual rate at all
 *
 * NONE exists because the first two are both descriptions of how an annual
 * DISTRIBUTION is computed, and a bank savings account has none to compute. It
 * was still being asked, so a MAE Tabung had to claim a basis it does not have —
 * harmless while the rate stayed blank, and a lie the moment anyone filled one
 * in.
 */
const RATE_BASES = ['MIN_MONTHLY', 'MADB', 'NONE'];
/** Mirrors assets_rate_quote_check. Display only — it decides "5.75 sen" vs "3.50%". */
const RATE_QUOTES = ['PERCENT', 'SEN_PER_UNIT'];
/**
 * Mirrors assets_liquidity_check. How REACHABLE an account is, which is a
 * different question from what it holds — `kind` is the asset class, this is the
 * second axis, and neither implies the other.
 *
 *   WALLET   where money sits between arriving and being spent. A change in it is
 *            not a contribution, it is your pocket moving, which is what lets
 *            spending be inferred rather than recorded.
 *   SAVINGS  a destination. Money in is money out of pocket.
 *   LOCKED   cannot be reached before a condition is met. Counted in net worth,
 *            never counted as within reach.
 */
const LIQUIDITIES = ['WALLET', 'SAVINGS', 'LOCKED'];

/** Mirrors asset_entries_type_check. */
const ENTRY_TYPES = ['DEPOSIT', 'WITHDRAW', 'DISTRIBUTION', 'FEE', 'BALANCE'];

/**
 * Where an entry came from, which is what decides whether it is a CASH FLOW.
 *
 *   manual   you moved this money — the calendar counts it
 *   payroll  an EPF contribution that booked itself; net pay never contained it
 *   opening  the balance the account was first recorded with. Real money, but it
 *            moved before this ledger existed, so counting it as spending on the
 *            day you typed it in overstates that month by the whole balance.
 *
 * All three are equally real to the Assets screen. They differ only in whether
 * moneyByDay() may treat them as money passing through your hands.
 */
const ENTRY_SOURCES = ['manual', 'payroll', 'opening'];

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const FISCAL_RE = /^\d{2}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonNegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
/** A number or nothing. These columns are all legitimately unset. */
const optionalNumber = v => v == null || (typeof v === 'number' && Number.isFinite(v));

/**
 * Checked here rather than left to the CHECK constraint because the column is
 * TEXT: a regex alone lets 2026-02-30 through, and Date.parse rolls it forward
 * into March, so the row would insert happily and then sort wrong forever. Only
 * a real calendar date formats back to the string it came from. Same reasoning
 * as snapshots.service.normalise().
 */
function checkDate(date, field) {
  if (!DATE_RE.test(date)) throw badRequest(`${field} must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
    throw badRequest(`${field}: ${date} is not a real date`);
  }
  return date;
}

/**
 * Create an asset.
 *
 * `rate_basis` is required rather than defaulted because getting it wrong is
 * silent: EPF's dividend accrues on a modified aggregate daily balance while ASB
 * and Tabung Haji pay on the mean of twelve monthly minimums, and an estimator
 * running the wrong rule produces a plausible number nobody would question.
 */
async function create({
  kind = 'SAVINGS', name, slug, currency = 'MYR', institution = '', account_ref = '',
  unit_label = '', unit_cap = null, fiscal_year = '12-31',
  rate_basis, rate_quote = 'PERCENT', last_rate = null, last_bonus = null, sort_order = 0,
  product_id = null, liquidity = 'SAVINGS',
}) {
  if (!KINDS.includes(kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);
  if (!name || !String(name).trim()) throw badRequest('name is required');

  const key = assets.norm(slug);
  if (!SLUG_RE.test(key)) {
    throw badRequest('slug must be lowercase letters, digits and hyphens, e.g. tabung-haji');
  }
  if (await assets.findBySlug(key)) throw badRequest(`slug ${key} is already taken`);

  if (!RATE_BASES.includes(rate_basis)) {
    throw badRequest(`rate_basis must be one of: ${RATE_BASES.join(', ')}`);
  }
  if (!RATE_QUOTES.includes(rate_quote)) {
    throw badRequest(`rate_quote must be one of: ${RATE_QUOTES.join(', ')}`);
  }
  if (!LIQUIDITIES.includes(liquidity)) {
    throw badRequest(`liquidity must be one of: ${LIQUIDITIES.join(', ')}`);
  }
  if (!FISCAL_RE.test(fiscal_year)) throw badRequest('fiscal_year must be MM-DD, e.g. 12-31');
  // A cap is a progress bar, never a validation — reinvested distributions and
  // inherited units can legitimately carry a balance past ASB's 300,000.
  if (unit_cap != null && !positive(unit_cap)) throw badRequest('unit_cap must be a positive number');
  if (!optionalNumber(last_rate)) throw badRequest('last_rate must be a number');
  if (!optionalNumber(last_bonus)) throw badRequest('last_bonus must be a number');

  return assets.insert({
    kind, name: String(name).trim(), slug: key, currency, institution, accountRef: account_ref,
    unitLabel: unit_label, unitCap: unit_cap, fiscalYear: fiscal_year,
    rateBasis: rate_basis, rateQuote: rate_quote,
    lastRate: last_rate, lastBonus: last_bonus, sortOrder: sort_order, liquidity,
    productId: product_id ? String(product_id).trim() : null,
  });
}

/**
 * Partial update. Every field defaults from the existing row, so a client can
 * send `{last_rate: 5.75}` after a declaration without knowing or resending
 * anything else — and `{unit_cap: null}` still clears the cap.
 */
async function update(id, body) {
  const asset = id === null ? null : await assets.findById(id);
  if (!asset) throw notFound('no such asset');

  const {
    name = asset.name, currency = asset.currency, institution = asset.institution,
    account_ref = asset.account_ref, unit_label = asset.unit_label, unit_cap = asset.unit_cap,
    fiscal_year = asset.fiscal_year, rate_basis = asset.rate_basis, rate_quote = asset.rate_quote,
    last_rate = asset.last_rate, last_bonus = asset.last_bonus,
    sort_order = asset.sort_order, archived = asset.archived,
    liquidity = asset.liquidity,
  } = body;

  if (!name || !String(name).trim()) throw badRequest('name is required');
  if (!RATE_BASES.includes(rate_basis)) {
    throw badRequest(`rate_basis must be one of: ${RATE_BASES.join(', ')}`);
  }
  if (!RATE_QUOTES.includes(rate_quote)) {
    throw badRequest(`rate_quote must be one of: ${RATE_QUOTES.join(', ')}`);
  }
  if (!FISCAL_RE.test(fiscal_year)) throw badRequest('fiscal_year must be MM-DD, e.g. 12-31');
  if (unit_cap != null && !positive(unit_cap)) throw badRequest('unit_cap must be a positive number');
  if (!optionalNumber(last_rate)) throw badRequest('last_rate must be a number');
  if (!optionalNumber(last_bonus)) throw badRequest('last_bonus must be a number');
  if (typeof archived !== 'boolean') throw badRequest('archived must be true or false');
  if (!LIQUIDITIES.includes(liquidity)) {
    throw badRequest(`liquidity must be one of: ${LIQUIDITIES.join(', ')}`);
  }

  await assets.update(id, {
    name: String(name).trim(), currency, institution, accountRef: account_ref,
    unitLabel: unit_label, unitCap: unit_cap, fiscalYear: fiscal_year,
    rateBasis: rate_basis, rateQuote: rate_quote,
    lastRate: last_rate, lastBonus: last_bonus, sortOrder: sort_order, archived, liquidity,
  });
}

/**
 * Delete, but only while the asset has no history.
 *
 * Nothing in this app orphans rows behind a foreign key — `instruments` has no
 * delete endpoint at all for the same reason. Once entries exist the balance and
 * every past distribution live in them, so the answer is `archived`, and the
 * error says so rather than leaving the client to guess.
 */
async function remove(id) {
  if (id === null) throw badRequest('bad id');
  const asset = await assets.findById(id);
  if (!asset) throw notFound('no such asset');

  const n = await assetEntries.countForAsset(id);
  if (n > 0) {
    throw badRequest(
      `${asset.name} has ${n} ${n === 1 ? 'entry' : 'entries'} — archive it instead of deleting, ` +
      'or its balance and distribution history go with it');
  }
  await assets.remove(id);
}

/**
 * Add one entry to an asset's ledger.
 *
 * `amount` is always positive and `type` carries the direction, exactly as
 * `cash_movements` works. A signed amount plus a type column would be two
 * sources of truth for one fact, and they would eventually disagree.
 */
async function addEntry(assetId, { type, date, amount, note = '', source = 'manual' }) {
  if (assetId === null) throw badRequest('bad id');
  const asset = await assets.findById(assetId);
  if (!asset) throw notFound('no such asset');

  if (!ENTRY_TYPES.includes(type)) throw badRequest(`type must be one of: ${ENTRY_TYPES.join(', ')}`);
  if (!ENTRY_SOURCES.includes(source)) throw badRequest(`source must be one of: ${ENTRY_SOURCES.join(', ')}`);
  if (source === 'opening' && type !== 'DEPOSIT') {
    throw badRequest('only a DEPOSIT can be an opening balance — it is what the account already held');
  }
  // A BALANCE is a READING — "as of this date the account holds exactly this" —
  // and it resets the running total rather than adjusting it. Confined to a
  // WALLET because assetRows() guarantees `balance − contributed === earned` for
  // every row, and a reading breaks that by construction: the gap between what
  // was read and what the ledger derived is unexplained, and for a current
  // account it is mostly spending. Keeping readings out of savings accounts keeps
  // that invariant true where it is load-bearing.
  if (type === 'BALANCE' && asset.liquidity !== 'WALLET') {
    throw badRequest(
      `a balance reading only makes sense on an account you spend from — set ${asset.name}'s ` +
      'reachability to WALLET first, or record a deposit or withdrawal instead');
  }
  if (!nonNegative(amount)) throw badRequest('amount must be a number of zero or more');
  checkDate(date, 'date');

  return assetEntries.insert({ assetId, type, date, amount, note, source });
}

/**
 * Remove one entry. The asset id in the path is not decoration: it is checked
 * against the entry's own, so a stale link cannot delete a row from a different
 * asset's ledger than the one the client thinks it is looking at.
 */
async function removeEntry(assetId, entryId) {
  if (assetId === null || entryId === null) throw badRequest('bad id');
  const entry = await assetEntries.findById(entryId);
  if (!entry) throw notFound('no such entry');
  if (entry.asset_id !== assetId) throw notFound('no such entry on this asset');
  await assetEntries.remove(entryId);
}

module.exports = {
  create, update, remove, addEntry, removeEntry,
  KINDS, RATE_BASES, ENTRY_TYPES, ENTRY_SOURCES, LIQUIDITIES,
};
