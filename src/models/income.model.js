const { get, one, run } = require('../db');

/* ── sources ──────────────────────────────────────────────────────────────── */

const listSources = () => get(`SELECT * FROM income_sources ORDER BY sort_order, id`);

const findSource = id => one(`SELECT * FROM income_sources WHERE id=$1`, id);

const insertSource = ({
  kind, name, payer, currency, cadence, payDay, grossDefault, epfAssetId, startedOn, sortOrder,
}) => one(
  `INSERT INTO income_sources
     (kind,name,payer,currency,cadence,pay_day,gross_default,epf_asset_id,started_on,sort_order)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
  kind, name, payer, currency, cadence, payDay, grossDefault, epfAssetId, startedOn, sortOrder);

/** `kind` and `cadence` are not updatable: cadence decides whether pay_day may
 *  exist at all, and kind decides whether the statutory block means anything. */
const updateSource = (id, {
  name, payer, currency, payDay, grossDefault, epfAssetId, active, startedOn, endedOn, sortOrder,
}) => run(
  `UPDATE income_sources SET
     name=$1, payer=$2, currency=$3, pay_day=$4, gross_default=$5, epf_asset_id=$6,
     active=$7, started_on=$8, ended_on=$9, sort_order=$10
   WHERE id=$11`,
  name, payer, currency, payDay, grossDefault, epfAssetId, active, startedOn, endedOn, sortOrder, id);

const removeSource = id => run(`DELETE FROM income_sources WHERE id=$1`, id);

/* ── events ───────────────────────────────────────────────────────────────── */

/**
 * Joined to the source's name, kind and cadence — the client groups and labels by
 * all three, and a per-row lookup against `income_sources` would be work the
 * database has already done. Newest first; several events can share a date.
 */
const listEvents = () => get(
  `SELECT e.*, s.name, s.kind, s.cadence FROM income_events e
   JOIN income_sources s ON s.id = e.source_id
   ORDER BY e.date DESC, e.id DESC`);

const findEvent = id => one(`SELECT * FROM income_events WHERE id=$1`, id);

/**
 * Takes `q` — the pool, or a client checked out for a transaction. An employment
 * event and the EPF asset entry it generates are written together or not at all;
 * see incomeService.addEvent().
 */
const insertEvent = (q, {
  sourceId, date, gross,
  epfEmployee, socsoEmployee, eisEmployee, skbbk, pcb, zakat, otherDeducted,
  epfEmployer, socsoEmployer, eisEmployer, note, source,
}) => q.query(
  `INSERT INTO income_events
     (source_id,date,gross,
      epf_employee,socso_employee,eis_employee,skbbk,pcb,zakat,other_deducted,
      epf_employer,socso_employer,eis_employer,note,source)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
  [sourceId, date, gross,
    epfEmployee, socsoEmployee, eisEmployee, skbbk, pcb, zakat, otherDeducted,
    epfEmployer, socsoEmployer, eisEmployer, note, source]);

const removeEvent = id => run(`DELETE FROM income_events WHERE id=$1`, id);

/** Guards the source delete: a source with history is ended, never dropped. */
const countEventsForSource = async sourceId =>
  Number((await one(`SELECT count(*)::int AS n FROM income_events WHERE source_id=$1`, sourceId)).n);

module.exports = {
  listSources, findSource, insertSource, updateSource, removeSource,
  listEvents, findEvent, insertEvent, removeEvent, countEventsForSource,
};
