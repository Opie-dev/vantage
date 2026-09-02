const { get } = require('../db');

/**
 * Joined to the ticker the UI shows. `fetched_at` travels with the row so the
 * screen can say how old these figures are — they move daily, unlike the
 * instrument identity they hang off.
 */
const listAll = () => get(
  `SELECT f.*, i.ticker, i.currency FROM fund_metrics f JOIN instruments i ON i.id=f.instrument_id
   ORDER BY i.ticker`);

/** Upsert one instrument's fund facts. `q` may be a transaction client. */
const upsert = (q, instrumentId, m) => q.query(
  `INSERT INTO fund_metrics
     (instrument_id,aum,nav,outstanding_units,dividend_yield,premium,asset_class,fetched_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,now())
   ON CONFLICT (instrument_id) DO UPDATE SET
     aum=excluded.aum, nav=excluded.nav, outstanding_units=excluded.outstanding_units,
     dividend_yield=excluded.dividend_yield, premium=excluded.premium,
     asset_class=excluded.asset_class, fetched_at=excluded.fetched_at`,
  [instrumentId, m.aum ?? null, m.nav ?? null, m.outstanding_units ?? null,
   m.dividend_yield ?? null, m.premium ?? null, m.asset_class ?? null]);

module.exports = { listAll, upsert };
