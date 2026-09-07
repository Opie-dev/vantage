/**
 * What arrives each month.
 *
 * Nothing here touches the broker tables. A salary is not a `cash_movements`
 * DEPOSIT and never reaches cashBal(); it is not a DIV transaction and never
 * reaches income(), which means dividends — a month with a bonus in it would
 * otherwise read as a spectacular month for the ETFs.
 *
 * NOTHING HERE WRITES TO ANOTHER TABLE EITHER. A payslip's EPF used to be booked
 * into a linked EPF asset in the same transaction. That link is gone: EPF splits
 * every contribution across three accounts — Akaun Persaraan, Akaun Sejahtera,
 * Akaun Fleksibel — on a statutory 75/15/10, and one foreign key could only ever
 * put the whole of it in one of them. The payslip's EPF columns stay, because net
 * pay is computed from them; the contribution itself is recorded on Assets, from
 * a statement, by hand.
 */
const { pool } = require('../db');
const income = require('../models/income.model');
const fx = require('./fx.service');
const { badRequest, notFound } = require('../middleware/errorHandler');

/** Mirrors income_sources_kind_check. */
const KINDS = ['EMPLOYMENT', 'FREELANCE', 'RENTAL', 'OTHER'];
const CADENCES = ['MONTHLY', 'IRREGULAR'];

/** Deducted from the employee's pay. net = gross - the sum of these. */
const DEDUCTED = ['epf_employee', 'socso_employee', 'eis_employee', 'skbbk', 'pcb', 'zakat', 'other_deducted'];
/** Paid on top by the employer. NEVER subtracted from net, never added to gross. */
const ON_TOP = ['epf_employer', 'socso_employer', 'eis_employer'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const nonNegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const optionalNumber = v => v == null || (typeof v === 'number' && Number.isFinite(v));

function checkDate(date, field) {
  if (!DATE_RE.test(date)) throw badRequest(`${field} must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
    throw badRequest(`${field}: ${date} is not a real date`);
  }
  return date;
}

/** -1 means the last working day, which is a real Malaysian payroll convention. */
function checkPayDay(v) {
  if (v === -1) return v;
  if (!Number.isInteger(v) || v < 1 || v > 31) {
    throw badRequest('pay_day must be 1 to 31, or -1 for the last working day');
  }
  return v;
}

async function createSource(body) {
  const {
    kind, name, payer = '', currency = 'MYR', cadence = 'MONTHLY',
    pay_day = null, gross_default = null, started_on = null, sort_order = 0,
  } = body;

  if (!KINDS.includes(kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);
  if (!CADENCES.includes(cadence)) throw badRequest(`cadence must be one of: ${CADENCES.join(', ')}`);
  if (!name || !String(name).trim()) throw badRequest('name is required');

  // A monthly source needs a day for the calendar and the forecast; an irregular
  // one must not have a day at all, because storing one invents a certainty it
  // does not have.
  if (cadence === 'MONTHLY') {
    if (pay_day == null) throw badRequest('a monthly source needs pay_day — the day it lands, or -1 for the last working day');
    checkPayDay(pay_day);
  } else if (pay_day != null) {
    throw badRequest('an irregular source cannot have a pay_day — it is irregular');
  }

  if (!optionalNumber(gross_default)) throw badRequest('gross_default must be a number');
  if (started_on != null) checkDate(started_on, 'started_on');

  return income.insertSource({
    kind, name: String(name).trim(), payer, currency, cadence,
    payDay: cadence === 'MONTHLY' ? pay_day : null,
    grossDefault: gross_default, startedOn: started_on, sortOrder: sort_order,
  });
}

/** Partial update. `kind` and `cadence` are fixed: cadence decides whether
 *  pay_day may exist at all, so changing it would invalidate the row's shape. */
async function updateSource(id, body) {
  const s = id === null ? null : await income.findSource(id);
  if (!s) throw notFound('no such income source');
  for (const k of ['kind', 'cadence']) {
    if (body[k] && body[k] !== s[k]) throw badRequest(`${k} cannot be changed — end this source and create the right one`);
  }

  const f = {
    name: body.name ?? s.name,
    payer: body.payer ?? s.payer,
    currency: body.currency ?? s.currency,
    pay_day: body.pay_day === undefined ? s.pay_day : body.pay_day,
    gross_default: body.gross_default === undefined ? s.gross_default : body.gross_default,
    active: body.active === undefined ? s.active : body.active,
    started_on: body.started_on ?? s.started_on,
    ended_on: body.ended_on === undefined ? s.ended_on : body.ended_on,
    sort_order: body.sort_order ?? s.sort_order,
  };

  if (!f.name || !String(f.name).trim()) throw badRequest('name is required');
  if (typeof f.active !== 'boolean') throw badRequest('active must be true or false');
  if (s.cadence === 'MONTHLY') checkPayDay(f.pay_day);
  else if (f.pay_day != null) throw badRequest('an irregular source cannot have a pay_day');
  if (!optionalNumber(f.gross_default)) throw badRequest('gross_default must be a number');
  if (f.started_on != null) checkDate(f.started_on, 'started_on');
  if (f.ended_on != null) checkDate(f.ended_on, 'ended_on');

  await income.updateSource(id, {
    name: String(f.name).trim(), payer: f.payer, currency: f.currency,
    payDay: f.pay_day, grossDefault: f.gross_default, active: f.active,
    startedOn: f.started_on, endedOn: f.ended_on, sortOrder: f.sort_order,
  });
}

async function removeSource(id) {
  if (id === null) throw badRequest('bad id');
  const s = await income.findSource(id);
  if (!s) throw notFound('no such income source');

  const n = await income.countEventsForSource(id);
  if (n > 0) {
    throw badRequest(
      `${s.name} has ${n} recorded payment${n === 1 ? '' : 's'} — end it instead of deleting, ` +
      'or that history goes with it');
  }
  await income.removeSource(id);
}

/**
 * Record one payment.
 *
 * The two column groups are why this reads a payslip rather than a figure: only
 * the employee's half is subtracted from net, while the employer's is paid on top
 * and never touches it. Both are stored on the event and neither is written
 * anywhere else — see the note at the top of this file for why the EPF link went.
 */
async function addEvent(sourceId, body) {
  if (sourceId === null) throw badRequest('bad id');
  const s = await income.findSource(sourceId);
  if (!s) throw notFound('no such income source');

  const { date, gross, note = '', source = 'manual' } = body;
  checkDate(date, 'date');
  if (!nonNegative(gross)) throw badRequest('gross must be a number of zero or more');

  const f = {};
  for (const k of [...DEDUCTED, ...ON_TOP]) {
    const v = body[k] ?? 0;
    if (!nonNegative(v)) throw badRequest(`${k} must be a number of zero or more`);
    f[k] = v;
  }

  const deducted = DEDUCTED.reduce((sum, k) => sum + f[k], 0);
  if (deducted > gross) {
    throw badRequest(
      `deductions (${deducted.toFixed(2)}) exceed gross (${gross.toFixed(2)}) — ` +
      'employer contributions belong in the epf_employer / socso_employer / eis_employer ' +
      'fields, which are paid on top and never come out of your pay');
  }

  /* The rate on the day it landed, fixed to the payment.
   *
   * WITHOUT THIS THE PAST MOVES. One global rate converts a March invoice at
   * today's number, so the twelve-month income chart changes shape whenever the
   * ringgit does and no month on it is what actually arrived.
   *
   * A LOOKUP FAILURE IS NOT A SAVE FAILURE. BNM being unreachable must not stop
   * someone recording a payslip, so the rate comes back null, the event stores
   * null, and the figure falls back to the global rate — which the screen labels
   * approximate. A wrong rate written into history is permanent in a way a
   * missing one is not. */
  let fxRate = null;
  let fxDate = null;
  if (s.currency && s.currency !== 'MYR') {
    const hit = await fx.rateOn(s.currency, date);
    if (hit) {
      fxRate = hit.rate / (hit.unit || 1);
      fxDate = hit.date;
    }
  }

  return income.insertEvent({
    sourceId, date, gross,
    epfEmployee: f.epf_employee, socsoEmployee: f.socso_employee, eisEmployee: f.eis_employee,
    skbbk: f.skbbk, pcb: f.pcb, zakat: f.zakat, otherDeducted: f.other_deducted,
    epfEmployer: f.epf_employer, socsoEmployer: f.socso_employer, eisEmployer: f.eis_employer,
    note, source, fxRate, fxDate,
  });
}

/**
 * Remove an event.
 *
 * The payslip is the only row this ever wrote, so it is the only row to unwind.
 * Any EPF entry on Assets for the same month is the owner's own record of a
 * statement and has no link to this one; deleting it here would be a guess by
 * date and amount against a row nothing here created.
 */
async function removeEvent(sourceId, eventId) {
  if (sourceId === null || eventId === null) throw badRequest('bad id');
  const e = await income.findEvent(eventId);
  if (!e) throw notFound('no such payment');
  if (e.source_id !== sourceId) throw notFound('no such payment on this source');
  await income.removeEvent(eventId);
  return { ok: true };
}

module.exports = {
  createSource, updateSource, removeSource, addEvent, removeEvent,
  KINDS, CADENCES, DEDUCTED, ON_TOP, pool,
};
