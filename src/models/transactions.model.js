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

module.exports = { listAll, insertManual, remove, insertSyncedTrade, insertSyncedDividend };
