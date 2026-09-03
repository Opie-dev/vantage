const instruments = require('../models/instruments.model');
const assets = require('../models/assets.model');
const goals = require('../models/goals.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

/** Mirrors the goals_kind_check constraint in the migration. */
const KINDS = ['SHARES', 'INCOME_TOTAL', 'INCOME_MONTHLY', 'INCOME_YEAR', 'INCOME_PER_PAYMENT', 'ASSET_BALANCE'];

// Kinds that measure one holding and cannot be portfolio-wide.
const NEEDS_INSTRUMENT = new Set(['SHARES', 'INCOME_PER_PAYMENT']);

// The one kind measured against an account outside moomoo instead of a holding.
const NEEDS_ASSET = new Set(['ASSET_BALANCE']);

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Create a goal.
 *
 * A SHARES goal must name an instrument. An income goal may name one (per
 * holding) or omit it (portfolio-wide) — the ticker being optional is what
 * distinguishes the two, so an absent ticker is not an error there.
 */
async function create({ kind = 'SHARES', ticker, asset_id, target_qty, target_amount, monthly_budget = null }) {
  if (!KINDS.includes(kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);

  let instrumentId = null;
  if (ticker) {
    const instrument = await instruments.findByTicker(ticker);
    if (!instrument) throw badRequest(`Unknown ticker ${ticker}`);
    instrumentId = instrument.id;
  }

  let assetId = null;
  if (NEEDS_ASSET.has(kind)) {
    const asset = asset_id === undefined || asset_id === null ? null : await assets.findById(Number(asset_id));
    if (!asset) throw badRequest('an account balance goal needs an account');
    // Archiving is what you do instead of deleting an account with history, so a
    // goal against one would be a target you have already stopped tracking.
    if (asset.archived) throw badRequest(`${asset.name} is archived — unarchive it before setting a goal against it`);
    assetId = asset.id;
  } else if (asset_id != null) {
    throw badRequest('only an account balance goal names an account');
  }

  if (instrumentId && assetId) {
    throw badRequest('a goal is measured against a holding or an account, not both');
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
    assetId,
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
