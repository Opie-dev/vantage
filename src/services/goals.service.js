const instruments = require('../models/instruments.model');
const goals = require('../models/goals.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

/** Mirrors the goals_kind_check constraint in the migration. */
const KINDS = ['SHARES', 'INCOME_TOTAL', 'INCOME_MONTHLY', 'INCOME_YEAR', 'INCOME_PER_PAYMENT'];

// Kinds that measure one holding and cannot be portfolio-wide.
const NEEDS_INSTRUMENT = new Set(['SHARES', 'INCOME_PER_PAYMENT']);

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Create a goal.
 *
 * A SHARES goal must name an instrument. An income goal may name one (per
 * holding) or omit it (portfolio-wide) — the ticker being optional is what
 * distinguishes the two, so an absent ticker is not an error there.
 */
async function create({ kind = 'SHARES', ticker, target_qty, target_amount, monthly_budget = null }) {
  if (!KINDS.includes(kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);

  let instrumentId = null;
  if (ticker) {
    const instrument = await instruments.findByTicker(ticker);
    if (!instrument) throw badRequest(`Unknown ticker ${ticker}`);
    instrumentId = instrument.id;
  }

  if (NEEDS_INSTRUMENT.has(kind) && !instrumentId) {
    throw badRequest(
      kind === 'SHARES'
        ? 'a share goal needs an instrument'
        : 'a per-payment goal needs an instrument — combined across holdings it would measure the payment calendar, not the portfolio');
  }
  if (kind === 'SHARES') {
    if (!positive(target_qty)) throw badRequest('target_qty must be a positive number');
  } else if (!positive(target_amount)) {
    throw badRequest('target_amount must be a positive number');
  }

  await goals.insert({
    kind,
    instrumentId,
    targetQty: kind === 'SHARES' ? target_qty : 0,
    targetAmount: kind === 'SHARES' ? null : target_amount,
    monthlyBudget: monthly_budget,
  });
}

/**
 * Partial update. Defaulting each field from the existing row is what lets the
 * client send `{monthly_budget: null}` to clear the budget while an omitted key
 * leaves it alone — the inline editors on the Goals screen rely on that.
 */
async function update(id, body) {
  const goal = id === null ? null : await goals.findById(id);
  if (!goal) throw notFound('no such goal');
  const {
    target_qty = goal.target_qty,
    target_amount = goal.target_amount,
    monthly_budget = goal.monthly_budget,
  } = body;

  // The database CHECK would reject these anyway; catching them here gives a
  // message that names the field instead of a constraint.
  if (goal.kind === 'SHARES') {
    if (!positive(target_qty)) throw badRequest('target_qty must be a positive number');
  } else if (!positive(target_amount)) {
    throw badRequest('target_amount must be a positive number');
  }

  await goals.update(id, { targetQty: target_qty, targetAmount: target_amount, monthlyBudget: monthly_budget });
}

async function remove(id) {
  if (id === null) throw badRequest('bad id');
  await goals.remove(id);
}

module.exports = { create, update, remove, KINDS };
