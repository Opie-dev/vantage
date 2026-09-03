/**
 * Daily portfolio snapshots — the points behind the equity curve.
 *
 * Written by a scheduler, by the sync worker (via the ingest service), and in
 * bulk by sync/backfill_equity.py, which reconstructs the whole history in one
 * request.
 */
const { transaction } = require('../db');
const snapshots = require('../models/snapshots.model');
const { badRequest } = require('../middleware/errorHandler');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalise one snapshot.
 *
 * The date is checked here rather than left to Postgres because the column is
 * TEXT: a malformed string inserts happily and then sorts wrong in the chart
 * forever. A regex alone is not enough either — Date.parse rolls 2026-02-30 over
 * into March — so the date is round-tripped, and only a real calendar date
 * formats back to the string it came from.
 */
function normalise(r, i, todayISO, isList) {
  const where = isList ? `[${i}]` : '';
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw badRequest(`snapshot${where}: expected an object`);

  const date = r.date == null || r.date === '' ? todayISO : String(r.date);
  if (!DATE_RE.test(date)) {
    throw badRequest(`snapshot${where}: date must be YYYY-MM-DD, got ${JSON.stringify(r.date)}`);
  }
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
    throw badRequest(`snapshot${where}: ${date} is not a real date`);
  }

  const value_rm = Number(r.value_rm), cash_rm = Number(r.cash_rm);
  if (!Number.isFinite(value_rm) || !Number.isFinite(cash_rm)) {
    throw badRequest(`snapshot${where}: value_rm and cash_rm must be numbers`);
  }
  return { date, value_rm, cash_rm };
}

/**
 * Accepts one {date?, value_rm, cash_rm} or an array of them. `date` defaults to
 * today, which is what the scheduler and the sync worker rely on.
 *
 * The whole batch is validated before anything is written, so a bad row rejects
 * the request instead of leaving half a curve behind.
 */
async function save(body) {
  const list = Array.isArray(body) ? body : [body];
  if (!list.length) return { ok: true, written: 0 };

  const todayISO = await snapshots.todayISO();
  const rows = list.map((r, i) => normalise(r, i, todayISO, Array.isArray(body)));
  // Last write wins within one request, so a duplicated date can't make the
  // upsert order decide the outcome.
  const byDate = new Map(rows.map(r => [r.date, r]));

  await transaction(async client => {
    for (const r of byDate.values()) await snapshots.upsert(client, r);
  });
  return { ok: true, written: byDate.size };
}

/**
 * Record today's owned side.
 *
 * A SEPARATE ENTRY POINT rather than two more optional fields on save(). save()
 * requires both broker columns and returns a fresh literal, which is what stops a
 * malformed row reaching a TEXT date column — relaxing it so a caller could send
 * assets alone would weaken the guard for every caller. This writes a different
 * column pair for a different writer, so it gets its own door.
 *
 * The figures come from the CLIENT, deliberately. An asset balance is a running
 * sum this layer could manage in SQL, but a liability is an amortisation
 * schedule derived from five fields, and calc.js is the single source of truth
 * for that math. A second implementation here would be a second answer to "what
 * do you owe", and the two would drift.
 */
async function saveOwned(body) {
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw badRequest(`${name} must be a number`);
    if (n < 0) throw badRequest(`${name} cannot be negative`);
    return n;
  };
  const assets_rm = num(body && body.assets_rm, 'assets_rm');
  const liabilities_rm = num(body && body.liabilities_rm, 'liabilities_rm');

  await transaction(client => snapshots.upsertOwned(client, assets_rm, liabilities_rm));
  return { ok: true, assets_rm, liabilities_rm };
}

module.exports = { save, saveOwned };
