const { get } = require('../db');

/**
 * Every declared distribution, newest first, joined to its ticker.
 *
 * Capped because these funds pay weekly and the history is unbounded — MSTY alone
 * has 65 declarations. The screen shows a recent window, so shipping the whole
 * back-catalogue in every /api/state would cost more than it is worth.
 */
const RECENT = 40;

const listRecent = () => get(
  `SELECT ticker, ex_date, per_share FROM (
     SELECT i.ticker, d.ex_date, d.per_share,
            row_number() OVER (PARTITION BY d.instrument_id ORDER BY d.ex_date DESC) AS rn
       FROM fund_distributions d JOIN instruments i ON i.id = d.instrument_id
   ) t WHERE rn <= $1
   ORDER BY ticker, ex_date DESC`, RECENT);

/**
 * Upsert one declaration. The primary key is (instrument_id, ex_date), so a
 * re-sync overwrites rather than duplicating, and a restated amount corrects.
 * Returns 1 only for a genuinely new row — see the xmax note in cash.model.js.
 */
async function upsert(q, instrumentId, { ex_date, per_share }) {
  const r = await q.query(
    `INSERT INTO fund_distributions (instrument_id, ex_date, per_share) VALUES ($1,$2,$3)
     ON CONFLICT (instrument_id, ex_date) DO UPDATE SET per_share = excluded.per_share
     RETURNING (xmax = 0) AS inserted`,
    [instrumentId, ex_date, per_share]);
  return r.rows[0] && r.rows[0].inserted ? 1 : 0;
}

module.exports = { listRecent, upsert, RECENT };
