/**
 * The rules that decide what a statement line is.
 *
 * Nothing here guesses. A merchant with no rule stays unmatched and is reported;
 * the importer's job is to apply decisions already made, never to make them.
 */
const rules = require('../models/merchantRules.model');
const commitments = require('../models/commitments.model');
const { badRequest, notFound } = require('../middleware/errorHandler');
const { CATEGORIES } = require('./expenses.service');

const ACTIONS = ['EXPENSE', 'COMMITMENT', 'IGNORE'];

async function upsert(body) {
  const pattern = String(body.pattern || '').trim().toUpperCase();
  if (pattern.length < 3) {
    throw badRequest('pattern must be at least three characters — a shorter one matches too much');
  }
  if (!ACTIONS.includes(body.action)) throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);

  let category = null;
  let commitmentId = null;

  if (body.action === 'EXPENSE') {
    if (!CATEGORIES.includes(body.category)) {
      throw badRequest('an EXPENSE rule needs a category from the taxonomy');
    }
    category = body.category;
  } else if (body.action === 'COMMITMENT') {
    commitmentId = body.commitment_id ?? null;
    if (!Number.isInteger(commitmentId)) {
      throw badRequest('a COMMITMENT rule needs the commitment it is already counted as');
    }
    const c = await commitments.findById(commitmentId);
    if (!c) throw notFound('no such commitment');
    // Pointing at a card would be circular: the statement IS the card, and the
    // charge on it is not a payment of it.
    if (c.kind === 'REVOLVING') {
      throw badRequest(`${c.name} is a card — a charge on a statement is not a payment of it`);
    }
  }

  return rules.upsert({ pattern, action: body.action, category, commitmentId, note: body.note || '' });
}

async function remove(id) {
  if (id === null) throw badRequest('bad id');
  const r = await rules.findById(id);
  if (!r) throw notFound('no such rule');
  await rules.remove(id);
}

module.exports = { upsert, remove, ACTIONS };
