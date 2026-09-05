const { get, run } = require('../db');

/** Newest first, joined to the ticker the UI displays. */
const listAll = () => get(
  `SELECT t.*, i.ticker FROM transactions t JOIN instruments i ON i.id=t.instrument_id
   ORDER BY trade_date DESC, t.id DESC`);

const insertManual = (instrumentId, { side, qty, price, fees, amount, trade_date }) => run(
  `INSERT INTO transactions (instrument_id,side,qty,price,fees,amount,trade_date,source)
   VALUES ($1,$2,$3,$4,$5,$6,$7,'manual')`,
  instrumentId, side, qty || 0, price || 0, fees || 0, amount, trade_date);

const remove = id => run(`DELETE FROM transactions WHERE id=$1`, id);

/**
 * A synced fill. `ext_id` carries the moomoo deal id, and the unique constraint
 * on it is what makes re-running the sync a no-op instead of a duplicate.
 * Returns the number of rows actually inserted (0 when already present).
 */
async function insertSyncedTrade(q, instrumentId, o) {
  const r = await q.query(
    `INSERT INTO transactions (instrument_id,side,qty,price,fees,trade_date,source,ext_id)
     VALUES ($1,$2,$3,$4,$5,$6,'api',$7) ON CONFLICT (ext_id) DO NOTHING`,
    [instrumentId, o.side, o.qty, o.price, o.fees || 0, o.trade_date, `moomoo:${o.order_id}`]);
  return r.rowCount;
}

/** A synced dividend, stored as a DIV transaction so it shows per holding. */
async function insertSyncedDividend(q, instrumentId, { amount, date, extId }) {
  const r = await q.query(
    `INSERT INTO transactions (instrument_id,side,qty,price,fees,amount,trade_date,source,ext_id)
     VALUES ($1,'DIV',0,0,0,$2,$3,'api',$4) ON CONFLICT (ext_id) DO NOTHING`,
    [instrumentId, amount, date, extId]);
  return r.rowCount;
}

/** Whether the ledger explains anything at all about this instrument. */
async function countForInstrument(q, instrumentId) {
  const r = await q.query(
    `SELECT count(*)::int AS n FROM transactions WHERE instrument_id=$1 AND side <> 'DIV'`,
    [instrumentId]);
  return r.rows[0].n;
}

/**
 * A holding the broker reports that no deal explains.
 *
 * `source = 'position'` and NOT 'api', because this did not come from a deal —
 * it is the app taking the broker's word for a quantity it cannot otherwise
 * account for. A free promotional share is the case that needs it: it appears in
 * the position list with no order behind it, so nothing in the deal history will
 * ever explain it, however far back the window reaches.
 *
 * THE DATE IS THE DAY IT WAS FIRST SEEN, because the broker's position list does
 * not carry one. That is a real inaccuracy — the share may have arrived months
 * earlier — and the reason the source is a distinct value rather than 'api': the
 * History badge says where the row came from, so the date can be read with the
 * scepticism it deserves and corrected by hand.
 *
 * ext_id keeps it to one row per instrument for ever. If the broker's quantity
 * later changes, the gap reopens and the drift report says so rather than this
 * quietly writing a second row.
 */
async function insertFromPosition(q, instrumentId, { ticker, qty, avgCost, date }) {
  const r = await q.query(
    `INSERT INTO transactions (instrument_id,side,qty,price,fees,trade_date,source,ext_id)
     VALUES ($1,'BUY',$2,$3,0,$4,'position',$5) ON CONFLICT (ext_id) DO NOTHING`,
    [instrumentId, qty, avgCost || 0, date, `moomoo:pos:${ticker}`]);
  return r.rowCount;
}

module.exports = {
  listAll, insertManual, remove, insertSyncedTrade, insertSyncedDividend,
  countForInstrument, insertFromPosition,
};
