/**
 * Instalment plans and statements, both hanging off a REVOLVING commitment.
 *
 * Nothing here derives a schedule. How many instalments have been paid follows
 * from the start date, the tenure and today — calc.js does that, the same way it
 * does for a loan. What is validated here is that a plan cannot exist in a state
 * the derivation would have to guess at.
 *
 * See cards-plan.md §4 and §5.
 */
const plans = require('../models/cardPlans.model');
const statements = require('../models/cardStatements.model');
const commitments = require('../models/commitments.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

/** Mirrors card_plans_kind_check. */
const PLAN_KINDS = ['EPP', 'BALANCE_TRANSFER', 'CASH_INSTALMENT', 'AUTO_BALANCE_CONVERSION'];
/** Mirrors card_plans_status_check. */
const PLAN_STATUSES = ['ACTIVE', 'RETRACTED', 'SETTLED'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonNegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * A real calendar date, not merely the right shape — the same check commitments
 * makes, and for the same reason: the column is TEXT, 2026-02-30 matches the
 * regex, Date.parse rolls it into March, and the row sorts wrong forever.
 */
function checkDate(date, field) {
  if (!DATE_RE.test(date)) throw badRequest(`${field} must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
    throw badRequest(`${field}: ${date} is not a real date`);
  }
  return date;
}

/** A plan can only hang off a card. Putting one on a loan would be a category error
 *  that every figure downstream would then quietly carry. */
async function revolvingOr400(commitmentId) {
  if (commitmentId === null) throw badRequest('bad card id');
  const c = await commitments.findById(commitmentId);
  if (!c) throw notFound('no such commitment');
  if (c.kind !== 'REVOLVING') {
    throw badRequest(`${c.name} is a ${c.kind}, and only a card carries instalment plans`);
  }
  return c;
}

/* ── plans ─────────────────────────────────────────────────────────────────── */

function checkPlan(f) {
  if (!PLAN_KINDS.includes(f.kind)) throw badRequest(`kind must be one of: ${PLAN_KINDS.join(', ')}`);
  if (!f.name || !String(f.name).trim()) throw badRequest('name is required');
  if (!positive(f.amount)) throw badRequest('amount must be a positive number — what was charged against the limit');
  if (!Number.isInteger(f.tenure_months) || f.tenure_months <= 0) {
    throw badRequest('tenure_months must be a whole number of months');
  }
  // Demanded rather than derived: amount/tenure rarely divides evenly, the bank
  // rounds the last month, and on Maybank's EzyPay Plus the monthly billing is a
  // principal line PLUS an interest line — both of which BNM 13.1(b) counts.
  if (!positive(f.instalment)) {
    throw badRequest(
      'instalment must be a positive number — the total the bank bills each month for this ' +
      'plan, including any separate interest line');
  }
  if (!nonNegative(f.rate)) throw badRequest('rate must be a number of zero or more');
  if (!nonNegative(f.upfront_fee)) throw badRequest('upfront_fee must be a number of zero or more');
  if (!PLAN_STATUSES.includes(f.status)) throw badRequest(`status must be one of: ${PLAN_STATUSES.join(', ')}`);

  checkDate(f.purchased_on, 'purchased_on');
  checkDate(f.started_on, 'started_on');
  if (f.settled_on != null) checkDate(f.settled_on, 'settled_on');

  // The money cannot start moving before the thing was bought. The reverse — a
  // first instalment a cycle or two AFTER the purchase — is the normal case and is
  // exactly why the two dates are separate columns.
  if (f.started_on < f.purchased_on) {
    throw badRequest('started_on cannot be before purchased_on — the first instalment follows the purchase');
  }
  if (f.settled_on != null && f.settled_on < f.started_on) {
    throw badRequest('settled_on cannot be before started_on');
  }
}

function planFields(body, existing = {}) {
  const pick = (k, d) => (body[k] === undefined ? (existing[k] === undefined ? d : existing[k]) : body[k]);
  return {
    kind: pick('kind', 'EPP'),
    name: String(pick('name', '') || '').trim(),
    merchant: pick('merchant', '') || '',
    amount: pick('amount', null),
    tenure_months: pick('tenure_months', null),
    instalment: pick('instalment', null),
    rate: pick('rate', 0) ?? 0,
    upfront_fee: pick('upfront_fee', 0) ?? 0,
    purchased_on: pick('purchased_on', null),
    started_on: pick('started_on', null),
    settled_on: pick('settled_on', null),
    status: pick('status', 'ACTIVE'),
    category: pick('category', null),
    note: pick('note', '') || '',
    source: pick('source', 'manual'),
  };
}

async function addPlan(commitmentId, body) {
  await revolvingOr400(commitmentId);
  const f = planFields(body);
  checkPlan(f);
  return plans.insert({
    commitmentId,
    kind: f.kind, name: f.name, merchant: f.merchant,
    amount: f.amount, tenureMonths: f.tenure_months, instalment: f.instalment,
    rate: f.rate, upfrontFee: f.upfront_fee,
    purchasedOn: f.purchased_on, startedOn: f.started_on, settledOn: f.settled_on,
    status: f.status, category: f.category, note: f.note, source: f.source,
  });
}

/** The card id in the path is checked against the plan's own, so a stale link
 *  cannot edit a plan belonging to a different card. */
async function updatePlan(commitmentId, planId, body) {
  if (planId === null) throw badRequest('bad plan id');
  const p = await plans.findById(planId);
  if (!p) throw notFound('no such plan');
  if (p.commitment_id !== commitmentId) throw notFound('no such plan on this card');

  const f = planFields(body, p);
  checkPlan(f);
  await plans.update(planId, {
    kind: f.kind, name: f.name, merchant: f.merchant,
    amount: f.amount, tenureMonths: f.tenure_months, instalment: f.instalment,
    rate: f.rate, upfrontFee: f.upfront_fee,
    purchasedOn: f.purchased_on, startedOn: f.started_on, settledOn: f.settled_on,
    status: f.status, category: f.category, note: f.note,
  });
}

async function removePlan(commitmentId, planId) {
  if (planId === null) throw badRequest('bad plan id');
  const p = await plans.findById(planId);
  if (!p) throw notFound('no such plan');
  if (p.commitment_id !== commitmentId) throw notFound('no such plan on this card');
  await plans.remove(planId);
}

/* ── statements ────────────────────────────────────────────────────────────── */

function checkStatement(f) {
  checkDate(f.statement_date, 'statement_date');
  checkDate(f.due_date, 'due_date');
  if (f.due_date < f.statement_date) {
    throw badRequest('due_date cannot be before statement_date — the bill closes, then it falls due');
  }
  if (typeof f.closing_balance !== 'number' || !Number.isFinite(f.closing_balance)) {
    throw badRequest('closing_balance must be a number — as printed, plans included');
  }
  if (f.minimum_due != null && !nonNegative(f.minimum_due)) {
    throw badRequest('minimum_due must be a number of zero or more');
  }
  if (!nonNegative(f.interest_charged)) throw badRequest('interest_charged must be a number of zero or more');
  if (!nonNegative(f.fees_charged)) throw badRequest('fees_charged must be a number of zero or more');
}

/**
 * Record one bill. Upserts on (card, statement_date), so importing the same PDF
 * twice changes nothing — see the model.
 */
async function addStatement(commitmentId, body) {
  await revolvingOr400(commitmentId);
  const f = {
    statement_date: body.statement_date,
    due_date: body.due_date,
    closing_balance: body.closing_balance,
    minimum_due: body.minimum_due ?? null,
    interest_charged: body.interest_charged ?? 0,
    fees_charged: body.fees_charged ?? 0,
    note: body.note || '',
    source: body.source || 'manual',
  };
  checkStatement(f);
  return statements.upsert({
    commitmentId,
    statementDate: f.statement_date, dueDate: f.due_date,
    closingBalance: f.closing_balance, minimumDue: f.minimum_due,
    interestCharged: f.interest_charged, feesCharged: f.fees_charged,
    note: f.note, source: f.source,
  });
}

async function removeStatement(commitmentId, statementId) {
  if (statementId === null) throw badRequest('bad statement id');
  const s = await statements.findById(statementId);
  if (!s) throw notFound('no such statement');
  if (s.commitment_id !== commitmentId) throw notFound('no such statement on this card');
  await statements.remove(statementId);
}

module.exports = {
  addPlan, updatePlan, removePlan,
  addStatement, removeStatement,
  PLAN_KINDS, PLAN_STATUSES,
};
