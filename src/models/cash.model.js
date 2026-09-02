const { get, run } = require('../db');

const listAll = () => get(`SELECT * FROM cash_movements ORDER BY date DESC, id DESC`);

const insertManual = ({ type, currency, amount, date }) => run(
  `INSERT INTO cash_movements (type,currency,amount,date,source) VALUES ($1,$2,$3,$4,'manual')`,
  type, currency, amount, date);

/**
 * A synced movement, deduped on the moomoo cashflow id.
 *
 * On conflict it updates `instrument_id` rather than doing nothing, so rows
 * written before that column existed pick up their holding on the next sync.
 * COALESCE keeps an attribution already on the row if this payload has none.
 *
 * `xmax = 0` is true only for a genuine INSERT — an ON CONFLICT update leaves a
 * non-zero xmax. Without it rowCount would report every re-synced row as new and
 * the worker's "N cash movements" line would be meaningless.
 *
 * @returns {Promise<number>} 1 when the row was newly created, 0 when it existed.
 */
async function insertSynced(q, { type, currency, amount, date, extId, instrumentId = null }) {
  const r = await q.query(
    `INSERT INTO cash_movements (type,currency,amount,date,source,ext_id,instrument_id)
     VALUES ($1,$2,$3,$4,'api',$5,$6)
     ON CONFLICT (ext_id) DO UPDATE
       SET instrument_id = COALESCE(EXCLUDED.instrument_id, cash_movements.instrument_id)
     RETURNING (xmax = 0) AS inserted`,
    [type, currency, amount, date, extId, instrumentId]);
  return r.rows[0] && r.rows[0].inserted ? 1 : 0;
}

/**
 * Used when a dividend is promoted to a DIV transaction: an earlier sync may have
 * parked it here because its instrument did not exist yet, and the balance math
 * counts a dividend from either table, so leaving both would double it.
 */
const removeByExtId = (q, extId) => q.query(`DELETE FROM cash_movements WHERE ext_id=$1`, [extId]);

module.exports = { listAll, insertManual, insertSynced, removeByExtId };
