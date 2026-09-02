/**
 * What arrives each month.
 *
 * Nothing here touches the broker tables. A salary is not a `cash_movements`
 * DEPOSIT and never reaches cashBal(); it is not a DIV transaction and never
 * reaches income(), which means dividends — a month with a bonus in it would
 * otherwise read as a spectacular month for the ETFs.
 *
 * ONE THING HERE DOES REACH ANOTHER TABLE, deliberately: an employment event with
 * EPF on it writes the matching entry into the linked EPF asset, in the same
 * database transaction. One record, two effects, no chance of the two drifting —
 * see addEvent().
 */
const { transaction, pool } = require('../db');
const income = require('../models/income.model');
const assets = require('../models/assets.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

/**
 * How EPF allocates a contribution, since the 2024 restructuring.
 *
 * Every ringgit that goes in is split three ways on the way. Booking the whole
 * amount into one account — all epf_asset_id alone can express — leaves three
 * balances that are each wrong and a total that happens to be right, which is
 * the worst kind of wrong: it reconciles.
 *
 * Applied only when all three accounts exist. Two of them is not a split it is
 * safe to guess at, so that case falls back to the single linked account.
 */
const EPF_SPLIT = [
  { productId: 'EPF_PERSARAAN', share: 0.75, label: 'Akaun Persaraan' },
  { productId: 'EPF_SEJAHTERA', share: 0.15, label: 'Akaun Sejahtera' },
  { productId: 'EPF_FLEKSIBEL', share: 0.10, label: 'Akaun Fleksibel' },
];

/**
 * Divide `total` by the shares above, in sen, losing nothing.
 *
 * The last account takes the remainder rather than its own rounded share. Three
 * independently rounded figures do not have to add up to what went in, and a sen
 * that vanishes here never comes back — it would sit as a permanent difference
 * between the payslip and the EPF balance it produced.
 */
function splitEpf(total) {
  const cents = Math.round(total * 100);
  const out = [];
  let used = 0;
  EPF_SPLIT.forEach((part, i) => {
    const c = i === EPF_SPLIT.length - 1 ? cents - used : Math.round(cents * part.share);
    used += c;
    out.push({ ...part, amount: c / 100 });
  });
  return out;
}

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
    pay_day = null, gross_default = null, epf_asset_id = null,
    started_on = null, sort_order = 0,
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

  if (epf_asset_id != null) {
    const a = await assets.findById(epf_asset_id);
    if (!a) throw badRequest(`no asset with id ${epf_asset_id} to route EPF into`);
  }

  return income.insertSource({
    kind, name: String(name).trim(), payer, currency, cadence,
    payDay: cadence === 'MONTHLY' ? pay_day : null,
    grossDefault: gross_default, epfAssetId: epf_asset_id,
    startedOn: started_on, sortOrder: sort_order,
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
    epf_asset_id: body.epf_asset_id === undefined ? s.epf_asset_id : body.epf_asset_id,
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
  if (f.epf_asset_id != null && !(await assets.findById(f.epf_asset_id))) {
    throw badRequest(`no asset with id ${f.epf_asset_id} to route EPF into`);
  }

  await income.updateSource(id, {
    name: String(f.name).trim(), payer: f.payer, currency: f.currency,
    payDay: f.pay_day, grossDefault: f.gross_default, epfAssetId: f.epf_asset_id,
    active: f.active, startedOn: f.started_on, endedOn: f.ended_on, sortOrder: f.sort_order,
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
 * Record one payment, and book its EPF where EPF actually lands.
 *
 * The whole contribution — the employee's 11% AND the employer's 12 or 13% — goes
 * into the linked asset, because both halves are yours the moment they land. Only
 * the employee's half is subtracted from net pay, which is exactly why the two
 * column groups exist.
 *
 * Both writes share one transaction. A half-applied pair would leave the EPF
 * balance disagreeing with the payslip that produced it, and nothing would ever
 * reconcile them again.
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

  const epfTotal = f.epf_employee + f.epf_employer;

  // Prefer the three restructured accounts when they exist, whichever one the
  // source happens to be linked to — EPF is one membership, so the split is the
  // same no matter which employer the payslip came from.
  const trio = epfTotal > 0
    ? await assets.findByProductIds(EPF_SPLIT.map(p => p.productId))
    : [];
  const byProduct = new Map(trio.map(a => [a.product_id, a]));
  const splitAcross = EPF_SPLIT.every(p => byProduct.has(p.productId))
    ? splitEpf(epfTotal).map(p => ({ ...p, asset: byProduct.get(p.productId) }))
    : null;

  const bookEpf = epfTotal > 0 && (splitAcross != null || s.epf_asset_id != null);

  return transaction(async client => {
    const row = (await income.insertEvent(client, {
      sourceId, date, gross,
      epfEmployee: f.epf_employee, socsoEmployee: f.socso_employee, eisEmployee: f.eis_employee,
      skbbk: f.skbbk, pcb: f.pcb, zakat: f.zakat, otherDeducted: f.other_deducted,
      epfEmployer: f.epf_employer, socsoEmployer: f.socso_employer, eisEmployer: f.eis_employer,
      note, source,
    })).rows[0];

    const halves =
      `${f.epf_employee.toFixed(2)} yours + ${f.epf_employer.toFixed(2)} employer`;

    if (splitAcross) {
      for (const part of splitAcross) {
        if (part.amount <= 0) continue;
        await client.query(
          `INSERT INTO asset_entries (asset_id,type,date,amount,note,source)
           VALUES ($1,'DEPOSIT',$2,$3,$4,'payroll')`,
          [part.asset.id, date, part.amount,
            `${s.name} — ${halves}, ${Math.round(part.share * 100)}% to ${part.label}`]);
      }
    } else if (bookEpf) {
      await client.query(
        `INSERT INTO asset_entries (asset_id,type,date,amount,note,source)
         VALUES ($1,'DEPOSIT',$2,$3,$4,'payroll')`,
        [s.epf_asset_id, date, epfTotal, `${s.name} — ${halves}`]);
    }
    return {
      ...row,
      epfBooked: bookEpf ? epfTotal : 0,
      epfAccounts: splitAcross ? splitAcross.length : bookEpf ? 1 : 0,
    };
  });
}

/**
 * Remove an event.
 *
 * The EPF entry it generated is NOT removed with it — there is no link between
 * the two rows to follow, and guessing at one by date and amount could delete a
 * contribution the owner recorded by hand. The response says so, and the entry is
 * deleted from the Assets screen if that is what was meant.
 */
async function removeEvent(sourceId, eventId) {
  if (sourceId === null || eventId === null) throw badRequest('bad id');
  const e = await income.findEvent(eventId);
  if (!e) throw notFound('no such payment');
  if (e.source_id !== sourceId) throw notFound('no such payment on this source');
  await income.removeEvent(eventId);
  const booked = e.epf_employee + e.epf_employer;
  return booked > 0
    ? { ok: true, note: `Any EPF entry this created (${booked.toFixed(2)}) is left in place — remove it from Assets if it was wrong.` }
    : { ok: true };
}

module.exports = {
  createSource, updateSource, removeSource, addEvent, removeEvent,
  KINDS, CADENCES, DEDUCTED, ON_TOP, pool,
};
