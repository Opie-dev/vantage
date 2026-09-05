/**
 * What was actually spent, by category.
 *
 * SCOPE IS THE POINT. This is unpredictable spending only. Rent, insurance,
 * phone and subscriptions are RECURRING commitments and belong there — they are
 * known in advance, already modelled, and entering them here as well would
 * double-count them against income. The category list is chosen so that none of
 * its members can be a commitment.
 */
const assets = require('../models/assets.model');
const expenses = require('../models/expenses.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The taxonomy: a group, and the categories inside it. Mirrors
 * expenses_category_check, and web/src/lib/calc.js mirrors both.
 *
 * TWO LEVELS, ONE QUESTION. Only the category is stored — the group is a
 * function of it and never varies, so a column for it would be a second place
 * for one fact to be wrong. The form still asks once; the group is what lets the
 * screen compare a month against the three before it at a level where the
 * comparison means something.
 *
 * Chosen for what they are NOT: none of these can be a RECURRING commitment.
 * There is no Housing, Insurance or Subscriptions group and there must never be
 * one — those are known in advance and already modelled, and entering them here
 * as well would count them twice against income.
 */
const GROUPS = [
  ['FOOD', 'Food', ['GROCERIES', 'MEALS_OUT', 'COFFEE_SNACKS']],
  ['TRANSPORT', 'Transport', ['FUEL', 'FARES', 'PARKING_TOLLS']],
  ['HOME', 'Home', ['HOUSEHOLD_GOODS', 'HOME_UPKEEP']],
  ['HEALTH', 'Health', ['MEDICAL', 'PHARMACY']],
  ['PERSONAL_CARE', 'Personal care', ['GROOMING', 'TOILETRIES']],
  ['SHOPPING', 'Shopping', ['CLOTHES', 'THINGS']],
  ['ENTERTAINMENT', 'Entertainment', ['GOING_OUT', 'GAMES_MEDIA']],
  ['TRAVEL', 'Travel', ['FLIGHTS_STAYS', 'TRIP_SPENDING']],
  // RELATIVES is money sent to parents or relatives — the old FAMILY column,
  // kept as its own leaf because folding it into Gifts would lose a real and
  // regular flow rather than merely renaming it.
  ['FAMILY', 'Family', ['RELATIVES', 'KIDS', 'PETS']],
  ['GIVING', 'Giving', ['GIFTS', 'DONATIONS']],
  ['LEARNING', 'Learning', ['COURSES', 'BOOKS']],
  ['FEES', 'Fees', ['BANK_FEES', 'CARD_CHARGES']],
  ['OTHER', 'Other', ['UNCATEGORISED']],
];

const CATEGORIES = GROUPS.flatMap(g => g[2]);

// Twenty-eight names on one line is unreadable, and an error nobody reads is an
// error that does not help. Grouped, it is a list you can scan for the one you
// meant.
const categoryHelp = () =>
  'category must be one of: ' + GROUPS.map(g => g[1] + ' (' + g[2].join(', ') + ')').join('; ');

/** Mirrors expenses_source_check. `import` is reserved for a future importer. */
const SOURCES = ['manual', 'import'];

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

function checkDate(date) {
  if (!DATE_RE.test(String(date))) throw badRequest(`date must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  const [y, m, d] = String(date).split('-').map(Number);
  // A regex alone lets 2026-02-30 through, and a bad date sorts wrong in the
  // month totals forever. Round-trip it, exactly as the snapshot service does.
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
    throw badRequest(`${date} is not a real date`);
  }
}

/**
 * Resolve and check the wallet an expense came from.
 *
 * Optional, because the log is useful before any wallet is set up and cash has
 * no account. But when one IS named it must be an account you actually spend
 * from — attributing a purchase to ASB would put it in a reconciliation it can
 * never belong to, since money in ASB did not leave through a till.
 */
async function resolveAsset(asset_id) {
  if (asset_id == null || asset_id === '') return null;
  const asset = await assets.findById(Number(asset_id));
  if (!asset) throw badRequest('no such account');
  if (asset.liquidity !== 'WALLET') {
    throw badRequest(
      `${asset.name} is not an account you spend from — set its reachability to WALLET, ` +
      'or leave the account blank');
  }
  return asset.id;
}

async function create({ date, amount, currency = 'MYR', category, note = '', asset_id = null, source = 'manual' }) {
  checkDate(date);
  if (!positive(amount)) throw badRequest('amount must be a positive number');
  if (!CATEGORIES.includes(category)) throw badRequest(categoryHelp());
  if (!SOURCES.includes(source)) throw badRequest(`source must be one of: ${SOURCES.join(', ')}`);

  return expenses.insert({
    date, amount, currency, category, note: String(note || '').trim(),
    assetId: await resolveAsset(asset_id), source,
  });
}

/** Partial update, defaulting every field from the existing row. */
async function update(id, body) {
  const row = id === null ? null : await expenses.findById(id);
  if (!row) throw notFound('no such expense');

  const {
    date = row.date, amount = row.amount, currency = row.currency,
    category = row.category, note = row.note,
  } = body;

  checkDate(date);
  if (!positive(amount)) throw badRequest('amount must be a positive number');
  if (!CATEGORIES.includes(category)) throw badRequest(categoryHelp());

  // Distinguishes "not sent" from "sent as null", so an expense can be detached
  // from a wallet as well as moved between two.
  const assetId = 'asset_id' in body ? await resolveAsset(body.asset_id) : row.asset_id;

  await expenses.update(id, {
    date, amount, currency, category, note: String(note || '').trim(), assetId,
  });
}

async function remove(id) {
  const row = id === null ? null : await expenses.findById(id);
  if (!row) throw notFound('no such expense');
  await expenses.remove(id);
}

module.exports = { create, update, remove, CATEGORIES, GROUPS };
