-- The equity curve becomes a net-worth curve.
--
-- `snapshots` held only the broker's own figures, so the chart could show a
-- portfolio and never a net worth — while the strip above it has shown net worth
-- as a single number since `Put owned and owed on one bar`. Two columns close
-- that: what the accounts outside moomoo held, and what was owed.
--
-- NULLABLE, NOT `NOT NULL DEFAULT 0` as both plans specify. That default was
-- written before there was any data, and it conflates two different facts: an
-- account genuinely holding nothing, and a date from before anything was
-- recorded. Every row already in this table predates these columns, so under the
-- planned default the whole existing history would read as a confident RM 0 of
-- assets and RM 0 of debt, and the chart would draw a cliff on the day the
-- feature shipped — the exact artefact personal-assets-plan.md:184 says the
-- column exists to prevent. NULL says "not recorded", the chart skips those
-- points, and the line starts where the truth starts.
--
-- Two writers, one column pair each, exactly as the plans describe: the sync
-- worker's upsertToday() sets value_rm and cash_rm and never touches these;
-- upsertOwned() sets these and never touches those. Neither can clobber the
-- other, and a sync that knows nothing about assets still writes a correct
-- broker row.

-- migrate:up

ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS assets_rm DOUBLE PRECISION;
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS liabilities_rm DOUBLE PRECISION;

-- Owned cannot be negative: a balance is a sum of a ledger that never goes below
-- what was put in. Owed cannot either — an overpaid loan is settled, not owed
-- backwards. Both are checked rather than assumed, because a sign error here
-- would draw a net worth that is wrong in the flattering direction.
ALTER TABLE snapshots DROP CONSTRAINT IF EXISTS snapshots_owned_check;
ALTER TABLE snapshots ADD CONSTRAINT snapshots_owned_check
  CHECK ((assets_rm IS NULL OR assets_rm >= 0) AND (liabilities_rm IS NULL OR liabilities_rm >= 0));

-- migrate:down

ALTER TABLE snapshots DROP CONSTRAINT IF EXISTS snapshots_owned_check;
ALTER TABLE snapshots DROP COLUMN IF EXISTS liabilities_rm;
ALTER TABLE snapshots DROP COLUMN IF EXISTS assets_rm;
