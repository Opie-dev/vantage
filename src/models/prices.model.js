const { get, run, pool } = require('../db');

const listAll = () => get(`SELECT p.*, i.ticker FROM prices p JOIN instruments i ON i.id=p.instrument_id`);

// One row per instrument — the latest price, not a history. The equity curve
// comes from `snapshots` instead, so nothing here needs to be kept.
const UPSERT = `
  INSERT INTO prices (instrument_id,price,fetched_at,source) VALUES ($1,$2,now(),$3)
  ON CONFLICT(instrument_id) DO UPDATE
    SET price=excluded.price, fetched_at=excluded.fetched_at, source=excluded.source`;

/** `source` is one of manual | yahoo | moomoo. `q` may be a transaction client. */
const upsert = (q, instrumentId, price, source) => (q || pool).query(UPSERT, [instrumentId, price, source]);

const setManual = (instrumentId, price) => run(UPSERT, instrumentId, price, 'manual');

module.exports = { listAll, upsert, setManual };
