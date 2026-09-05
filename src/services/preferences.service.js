/**
 * User display preferences, and the one intention the app stores.
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
 * What the owner means to spend in a month, in RM, or null for no target.
 *
 * NULL IS THE DEFAULT AND IT MATTERS. expenses-plan.md §7 puts a target last and
 * calls it a nicety, for a good reason: a target is an intention and everything
 * else on the Expenses screen is a fact, so an invented one would put a made-up
 * number beside measured ones. Until it is set the screen says "set a target"
 * rather than comparing against a guess.
 *
 * Not a budget per category. That would be intention measured against intention;
 * this is one figure measured against what actually happened.
 */
const isTarget = v =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0);

// key -> validator. A validator returns null when the value is fine, or the
// message explaining why it isn't.
const ALLOWED = {
  pnlBasis: v => (PNL_BASIS.includes(v) ? null : `pnlBasis must be one of: ${PNL_BASIS.join(', ')}`),
  dashboardTheme: v =>
    DASHBOARD_THEME.includes(v) ? null : `dashboardTheme must be one of: ${DASHBOARD_THEME.join(', ')}`,
  expenseTargetRM: v =>
    isTarget(v) ? null : 'expenseTargetRM must be a positive number, or null for no target',
};

const DEFAULTS = { pnlBasis: 'price', dashboardTheme: 'income', expenseTargetRM: null };

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

module.exports = { get, update, PNL_BASIS, DASHBOARD_THEME, DEFAULTS };
