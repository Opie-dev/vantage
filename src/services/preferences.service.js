/**
 * User display preferences.
 *
 * Stored as one JSON blob under the `preferences` settings key rather than a key
 * per option, so adding a preference later needs no migration and no endpoint
 * change. Writes are merged, so a client that knows about one preference cannot
 * wipe another it has never heard of.
 *
 * Only keys listed in ALLOWED can be written. The settings table also holds
 * `fx_usd_myr`, `funds` and `last_sync`, which are derived from the broker — a
 * generic settings endpoint would let a stray request corrupt the portfolio.
 */
const settings = require('../models/settings.model');
const { badRequest } = require('../middleware/errorHandler');

/**
 * How the Positions table computes P&L.
 *
 *   price - market value less cost. Cost already includes trading fees, so those
 *           are counted; dividends and withholding tax are not. The conventional
 *           unrealised P&L, and the default.
 *   net   - price plus dividends received less withholding tax: what the holding
 *           has actually returned.
 *   gross - price plus dividends, ignoring the tax withheld. Pre-tax performance.
 */
const PNL_BASIS = ['price', 'net', 'gross'];

/**
 * Which layout the Dashboard screen opens on.
 *
 *   income - leads with what the funds pay. The month's income outlook is the
 *            headline and the payout calendar sits under it: the screen as it
 *            has always been, and the default.
 *   equity - leads with what the holdings are worth. Portfolio value takes the
 *            headline, the equity curve and the holdings get the room, and
 *            income drops to a figure and a chart.
 *
 * Both themes show the same figures on the same P&L basis; only the order and
 * the emphasis differ, so switching cannot change what anything reads.
 */
const DASHBOARD_THEME = ['income', 'equity'];

/**
 * EPF contribution rates, used to SUGGEST a payslip's figures — never to decide
 * them. The payslip is authoritative and its numbers are typed over these.
 *
 * They are preferences rather than constants because none of them is universal.
 * The employer's rate steps at RM5,000 of monthly wage, which is why there are
 * two. From age 60 the statutory pair becomes 0% and 4%, which is expressed by
 * setting the rates rather than by asking anyone's age.
 *
 * A suggestion built from these will USUALLY DIFFER FROM THE PAYSLIP BY A FEW
 * RINGGIT, and that is not a bug to chase. Below RM20,000 a month EPF does not
 * use a percentage at all: the Third Schedule rounds wages into bands — RM20
 * steps to RM5,000, RM100 steps above it — and each band has a fixed
 * contribution. Only above RM20,000 is the calculation an exact percentage.
 * Encoding that table would make the suggestion exact; a percentage gets close
 * and cannot go stale the way a copied table can.
 */
const EPF_WAGE_THRESHOLD = 5000;

const pct = label => v =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
    ? null
    : `${label} must be a percentage between 0 and 100`;

// key -> validator. A validator returns null when the value is fine, or the
// message explaining why it isn't.
const ALLOWED = {
  epfEmployeePct: pct('epfEmployeePct'),
  epfEmployerPctLow: pct('epfEmployerPctLow'),
  epfEmployerPctHigh: pct('epfEmployerPctHigh'),
  pnlBasis: v => (PNL_BASIS.includes(v) ? null : `pnlBasis must be one of: ${PNL_BASIS.join(', ')}`),
  dashboardTheme: v =>
    DASHBOARD_THEME.includes(v) ? null : `dashboardTheme must be one of: ${DASHBOARD_THEME.join(', ')}`,
};

const DEFAULTS = {
  pnlBasis: 'price',
  dashboardTheme: 'income',
  // Malaysian statutory rates for a citizen under 60: 11% employee, and 13%
  // employer up to RM5,000 of monthly wage, 12% above it.
  epfEmployeePct: 11,
  epfEmployerPctLow: 13,
  epfEmployerPctHigh: 12,
};

/** Stored preferences merged over the defaults, so a caller always gets a full object. */
async function get() {
  return { ...DEFAULTS, ...(await settings.getJSON('preferences', {})) };
}

/** Merge `patch` into the stored preferences. Unknown or invalid keys are rejected. */
async function update(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw badRequest('expected an object of preferences');
  }
  const keys = Object.keys(patch);
  if (!keys.length) throw badRequest('no preferences given');

  const next = await get();
  for (const k of keys) {
    if (!(k in ALLOWED)) throw badRequest(`unknown preference: ${k}`);
    const problem = ALLOWED[k](patch[k]);
    if (problem) throw badRequest(problem);
    next[k] = patch[k];
  }
  await settings.set(settings.pool, 'preferences', JSON.stringify(next));
  return next;
}

module.exports = { get, update, PNL_BASIS, DASHBOARD_THEME, DEFAULTS, EPF_WAGE_THRESHOLD };
