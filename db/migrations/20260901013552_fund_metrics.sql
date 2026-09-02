-- Fund facts for an ETF holding, refreshed by each sync.
--
-- Separate from `instruments` on purpose: that table is identity (ticker, market,
-- currency) and changes almost never, while these are market figures that move
-- every day. Keeping them apart means `fetched_at` describes only the volatile
-- half, so the UI can say how stale a figure is without implying the ticker
-- itself was re-checked.
--
-- One row per instrument, upserted. moomoo returns these under `trust_*` in
-- get_market_snapshot and they are NULL for anything that is not a fund.

-- migrate:up
CREATE TABLE IF NOT EXISTS fund_metrics (
  instrument_id     INTEGER PRIMARY KEY REFERENCES instruments(id),
  aum               DOUBLE PRECISION,   -- fund size, in the fund's own currency
  nav               DOUBLE PRECISION,   -- net asset value per unit
  outstanding_units DOUBLE PRECISION,   -- units in issue
  dividend_yield    DOUBLE PRECISION,   -- percent, as moomoo reports it (annualised)
  premium           DOUBLE PRECISION,   -- percent price sits above (+) or below (-) NAV
  asset_class       TEXT,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS fund_metrics;
