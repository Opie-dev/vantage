const { get } = require('../db');

const listAll = () => get(
  `SELECT b.*, i.ticker FROM broker_positions b JOIN instruments i ON i.id=b.instrument_id`);

// One row per instrument — what the broker last reported, not a history. Same
// shape as `prices`, and for the same reason.
const UPSERT = `
  INSERT INTO broker_positions (instrument_id,qty,avg_cost,fetched_at) VALUES ($1,$2,$3,now())
  ON CONFLICT(instrument_id) DO UPDATE
    SET qty=excluded.qty, avg_cost=excluded.avg_cost, fetched_at=excluded.fetched_at`;

const upsert = (q, instrumentId, qty, avgCost) => q.query(UPSERT, [instrumentId, qty, avgCost || 0]);

/**
 * Drop every row the broker no longer reports.
 *
 * A sync always sends its FULL position list, so an instrument missing from the
 * payload is one the broker has stopped holding — a closed position. Leaving the
 * row would leave a permanent phantom claiming you still hold something you sold,
 * and the drift report would never stop complaining about it.
 *
 * Called with the ids the payload did carry; an empty payload clears the table,
 * which is correct for an account that has been emptied.
 */
const keepOnly = (q, instrumentIds) => q.query(
  instrumentIds.length
    ? `DELETE FROM broker_positions WHERE instrument_id <> ALL($1::int[])`
    : `DELETE FROM broker_positions`,
  instrumentIds.length ? [instrumentIds] : []);

module.exports = { listAll, upsert, keepOnly };
