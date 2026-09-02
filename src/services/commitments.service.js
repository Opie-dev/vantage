/**
 * What you owe and what leaves every month.
 *
 * Nothing here touches the broker tables. A car instalment is not a
 * `cash_movements` row and never reaches cashBal(); none of this reaches
 * positions() or income(). See commitments-and-income-plan.md.
 *
 * The schedule is NOT stored. A loan's whole future follows from principal, rate,
 * rate type, term and start date, so those five are validated hard here and the
 * arithmetic lives in calc.js. `commitment_payments` records only what a schedule
 * cannot know.
 */
const commitments = require('../models/commitments.model');
const payments = require('../models/commitmentPayments.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

/** Mirrors commitments_kind_check in the migration. */
const KINDS = ['LOAN', 'REVOLVING', 'RECURRING'];
/** Mirrors commitments_rate_type_check. See the migration for why this cannot be inferred. */
const RATE_TYPES = ['FLAT', 'REDUCING'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonNegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const optionalNumber = v => v == null || (typeof v === 'number' && Number.isFinite(v));

/**
 * A real calendar date, not just the right shape. Checked here rather than left
 * to the CHECK constraint because the column is TEXT: 2026-02-30 matches the
 * regex, Date.parse rolls it into March, and the row then sorts wrong forever.
 * Only a real date formats back to the string it came from.
 */
function checkDate(date, field) {
  if (!DATE_RE.test(date)) throw badRequest(`${field} must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
    throw badRequest(`${field}: ${date} is not a real date`);
  }
  return date;
}

function checkDueDay(v) {
  if (v == null) return null;
  if (!Number.isInteger(v) || v < 1 || v > 31) throw badRequest('due_day must be a day of the month, 1 to 31');
  return v;
}

/**
 * The per-kind rules. Each kind is checked only against what its own math reads,
 * which is the same contract commitments_shape_check enforces in the database —
 * this layer exists to name the field instead of returning a constraint name.
 */
function checkShape(kind, f) {
  if (kind === 'LOAN') {
    if (!positive(f.principal)) throw badRequest('principal must be a positive number — the amount financed, not the purchase price');
    if (!nonNegative(f.rate)) throw badRequest('rate must be a number of zero or more');
    if (!RATE_TYPES.includes(f.rate_type)) {
      throw badRequest(
        'rate_type must be FLAT (interest on the original amount, Malaysian hire purchase) ' +
        'or REDUCING (interest on what is left). It cannot be inferred — take it from the agreement');
    }
    if (!Number.isInteger(f.term_months) || f.term_months <= 0) throw badRequest('term_months must be a whole number of months');
    checkDate(f.started_on, 'started_on');
    if (f.instalment != null && !positive(f.instalment)) throw badRequest('instalment must be a positive number');
    return;
  }
  if (kind === 'REVOLVING') {
    if (!nonNegative(f.apr)) throw badRequest('apr must be a number of zero or more');
    if (f.balance != null && !nonNegative(f.balance)) throw badRequest('balance must be a number of zero or more');
    if (f.credit_limit != null && !positive(f.credit_limit)) throw badRequest('credit_limit must be a positive number');
    if (f.balance_as_of != null) checkDate(f.balance_as_of, 'balance_as_of');
    // A balance with no date is a figure nobody can judge the age of, and a card
    // balance goes stale in days. The screen has to be able to say when.
    if (f.balance != null && !f.balance_as_of) throw badRequest('balance_as_of is required whenever a balance is given — a card balance is a snapshot, and the screen has to say how old it is');
    return;
  }
  if (!positive(f.amount)) throw badRequest('amount must be a positive number');
  if (!Number.isInteger(f.every_months) || f.every_months <= 0) {
    throw badRequest('every_months must be a whole number — 1 monthly, 3 quarterly, 12 annual');
  }
}

/**
 * Defaults are applied BEFORE validation, never after.
 *
 * The reverse order has a subtle failure: checkShape() would judge the raw body,
 * so a monthly RECURRING commitment that simply omits `every_months` — relying on
 * the default of 1 — gets rejected for a field the caller was right not to send,
 * and with the wrong message, because that check runs before the one that would
 * have caught the real problem. Validate what will actually be stored.
 */
async function create(body) {
  const { kind } = body;
  if (!KINDS.includes(kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);
  if (!body.name || !String(body.name).trim()) throw badRequest('name is required');

  const f = {
    name: String(body.name).trim(),
    lender: body.lender || '',
    currency: body.currency || 'MYR',
    due_day: body.due_day ?? null,
    note: body.note || '',
    principal: body.principal ?? null,
    rate: body.rate ?? null,
    rate_type: body.rate_type ?? null,
    term_months: body.term_months ?? null,
    started_on: body.started_on ?? null,
    instalment: body.instalment ?? null,
    credit_limit: body.credit_limit ?? null,
    balance: body.balance ?? null,
    balance_as_of: body.balance_as_of ?? null,
    apr: body.apr ?? null,
    min_payment_pct: body.min_payment_pct ?? 5,
    min_payment_floor: body.min_payment_floor ?? 50,
    amount: body.amount ?? null,
    every_months: body.every_months ?? 1,
    sort_order: body.sort_order ?? 0,
  };

  checkDueDay(f.due_day);
  checkShape(kind, f);

  return commitments.insert({
    kind,
    name: f.name, lender: f.lender, currency: f.currency, dueDay: f.due_day, note: f.note,
    principal: f.principal, rate: f.rate, rateType: f.rate_type,
    termMonths: f.term_months, startedOn: f.started_on, instalment: f.instalment,
    creditLimit: f.credit_limit, balance: f.balance, balanceAsOf: f.balance_as_of,
    apr: f.apr, minPaymentPct: f.min_payment_pct, minPaymentFloor: f.min_payment_floor,
    amount: f.amount, everyMonths: f.every_months, sortOrder: f.sort_order,
  });
}

/**
 * Partial update, every field defaulting from the existing row — so updating a
 * card balance is `{balance, balance_as_of}` and nothing else.
 *
 * `kind` is deliberately not updatable: it decides which fields the shape rules
 * require, and switching it would mean rewriting every other column in the same
 * request. End the commitment and create the right one instead.
 */
async function update(id, body) {
  const c = id === null ? null : await commitments.findById(id);
  if (!c) throw notFound('no such commitment');
  if (body.kind && body.kind !== c.kind) {
    throw badRequest('kind cannot be changed — end this commitment and create the right one');
  }

  const f = {
    name: body.name ?? c.name,
    lender: body.lender ?? c.lender,
    currency: body.currency ?? c.currency,
    due_day: body.due_day === undefined ? c.due_day : body.due_day,
    note: body.note ?? c.note,
    principal: body.principal === undefined ? c.principal : body.principal,
    rate: body.rate === undefined ? c.rate : body.rate,
    rate_type: body.rate_type ?? c.rate_type,
    term_months: body.term_months === undefined ? c.term_months : body.term_months,
    started_on: body.started_on ?? c.started_on,
    instalment: body.instalment === undefined ? c.instalment : body.instalment,
    credit_limit: body.credit_limit === undefined ? c.credit_limit : body.credit_limit,
    balance: body.balance === undefined ? c.balance : body.balance,
    balance_as_of: body.balance_as_of === undefined ? c.balance_as_of : body.balance_as_of,
    apr: body.apr === undefined ? c.apr : body.apr,
    min_payment_pct: body.min_payment_pct ?? c.min_payment_pct,
    min_payment_floor: body.min_payment_floor ?? c.min_payment_floor,
    amount: body.amount === undefined ? c.amount : body.amount,
    every_months: body.every_months ?? c.every_months,
    active: body.active === undefined ? c.active : body.active,
    ended_on: body.ended_on === undefined ? c.ended_on : body.ended_on,
    sort_order: body.sort_order ?? c.sort_order,
  };

  if (!f.name || !String(f.name).trim()) throw badRequest('name is required');
  if (typeof f.active !== 'boolean') throw badRequest('active must be true or false');
  if (f.ended_on != null) checkDate(f.ended_on, 'ended_on');
  if (!optionalNumber(f.min_payment_pct)) throw badRequest('min_payment_pct must be a number');
  checkDueDay(f.due_day ?? null);
  checkShape(c.kind, f);

  await commitments.update(id, {
    name: String(f.name).trim(), lender: f.lender, currency: f.currency,
    dueDay: f.due_day, note: f.note,
    principal: f.principal, rate: f.rate, rateType: f.rate_type,
    termMonths: f.term_months, startedOn: f.started_on, instalment: f.instalment,
    creditLimit: f.credit_limit, balance: f.balance, balanceAsOf: f.balance_as_of,
    apr: f.apr, minPaymentPct: f.min_payment_pct, minPaymentFloor: f.min_payment_floor,
    amount: f.amount, everyMonths: f.every_months,
    active: f.active, endedOn: f.ended_on, sortOrder: f.sort_order,
  });
}

/**
 * Delete, but only while nothing has been recorded against it. A settled loan is
 * ended (`active: false`, `ended_on`), never dropped — the payments are the record
 * of what actually happened, and nothing in this app orphans rows behind an FK.
 */
async function remove(id) {
  if (id === null) throw badRequest('bad id');
  const c = await commitments.findById(id);
  if (!c) throw notFound('no such commitment');

  const n = await payments.countForCommitment(id);
  if (n > 0) {
    throw badRequest(
      `${c.name} has ${n} recorded payment${n === 1 ? '' : 's'} — end it instead of deleting, ` +
      'or that record goes with it');
  }
  await commitments.remove(id);
}

/**
 * Record a payment that the schedule would not predict — an overpayment, a
 * missed month caught up later, a settlement. Routine on-time instalments are
 * not entered: they are derived.
 */
async function addPayment(commitmentId, { date, amount, extra_principal = 0, note = '', source = 'manual' }) {
  if (commitmentId === null) throw badRequest('bad id');
  const c = await commitments.findById(commitmentId);
  if (!c) throw notFound('no such commitment');

  checkDate(date, 'date');
  if (!nonNegative(amount)) throw badRequest('amount must be a number of zero or more');
  if (!nonNegative(extra_principal)) throw badRequest('extra_principal must be a number of zero or more');
  if (extra_principal > amount) throw badRequest('extra_principal cannot exceed the amount paid');

  return payments.insert({ commitmentId, date, amount, extraPrincipal: extra_principal, note, source });
}

/** The commitment id in the path is checked against the payment's own, so a stale
 *  link cannot delete a row from a different commitment's history. */
async function removePayment(commitmentId, paymentId) {
  if (commitmentId === null || paymentId === null) throw badRequest('bad id');
  const p = await payments.findById(paymentId);
  if (!p) throw notFound('no such payment');
  if (p.commitment_id !== commitmentId) throw notFound('no such payment on this commitment');
  await payments.remove(paymentId);
}

module.exports = { create, update, remove, addPayment, removePayment, KINDS, RATE_TYPES };
