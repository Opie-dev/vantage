const { pool, get, one } = require('../db');

/** Tickers are stored and compared uppercase throughout. */
const norm = t => String(t || '').toUpperCase();

const listAll = () => get(`SELECT * FROM instruments ORDER BY id`);

const findByTicker = ticker => one(`SELECT * FROM instruments WHERE ticker=$1`, norm(ticker));

/** Instruments that can be priced from Yahoo. */
const listWithYahooSymbol = () => get(`SELECT * FROM instruments WHERE yahoo_symbol <> ''`);

/**
 * Get-or-create by ticker, returning the row either way.
 *
 * The sync worker calls this for every synced holding and every filled order, so
 * it must be idempotent and safe inside a transaction — hence `q` first, and the
 * re-select after ON CONFLICT DO NOTHING (which returns no row on a collision).
 */
async function ensure(q, { ticker, market, currency, name = '', yahoo_symbol = '', moomoo_code = '' }) {
  const t = norm(ticker);
  const found = (await q.query(`SELECT * FROM instruments WHERE ticker=$1`, [t])).rows[0];
  if (found) return found;
  const ins = await q.query(
    `INSERT INTO instruments (ticker,name,market,currency,yahoo_symbol,moomoo_code) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ticker) DO NOTHING RETURNING *`,
    [t, name, market, currency, yahoo_symbol, moomoo_code]);
  return ins.rows[0] || (await q.query(`SELECT * FROM instruments WHERE ticker=$1`, [t])).rows[0];
}

/** Just the id, for the hot paths in ingest. Returns undefined when unknown. */
async function idByTicker(q, ticker) {
  return (await q.query(`SELECT id FROM instruments WHERE ticker=$1`, [norm(ticker)])).rows[0];
}

module.exports = { norm, listAll, findByTicker, listWithYahooSymbol, ensure, idByTicker, pool };
