-- What the broker says you hold, kept beside what the ledger can explain.
--
-- THE APP ALREADY KNEW AND THREW IT AWAY. Every sync pulls a full position list
-- with a quantity and an average cost per holding, and ingest.service.js used it
-- only to call instruments.ensure() — creating the instrument row and discarding
-- the numbers. positions() then derives quantity from the transaction log alone,
-- so a holding the broker reports but no transaction explains is invisible.
--
-- That is not hypothetical. A free promotional share arrives as a position with
-- qty 0.0153 and cost 0.000 and NO deal in the order history, because nothing
-- was bought. moomoo reported four positions, the app drew three, and the only
-- way to notice was to count them by hand.
--
-- ONE ROW PER INSTRUMENT, upserted, exactly like `prices` — a snapshot of what
-- the broker last said, not a history. The equity curve is where history lives.
--
-- `fetched_at` matters as much as the figures: a stale row is a position the
-- broker has stopped reporting, or a sync that has not run. The screen says how
-- old it is rather than presenting it as current.
--
-- THIS IS NOT A SECOND SOURCE OF TRUTH FOR A POSITION. positions() still derives
-- from the ledger and nothing here changes that — a broker quantity is evidence
-- that the ledger is incomplete, not a replacement for it. The distinction is
-- the same one the expense log makes against the spending residual.

-- migrate:up

CREATE TABLE IF NOT EXISTS broker_positions (
  instrument_id INTEGER PRIMARY KEY REFERENCES instruments(id) ON DELETE CASCADE,
  qty           DOUBLE PRECISION NOT NULL,
  avg_cost      DOUBLE PRECISION NOT NULL DEFAULT 0,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A quantity can be zero — the broker briefly reports a closed position that
-- way — but never negative: this app has no short positions and a negative here
-- would mean the payload was misread.
ALTER TABLE broker_positions DROP CONSTRAINT IF EXISTS broker_positions_qty_check;
ALTER TABLE broker_positions ADD CONSTRAINT broker_positions_qty_check
  CHECK (qty >= 0 AND avg_cost >= 0);

-- migrate:down

DROP TABLE IF EXISTS broker_positions;
