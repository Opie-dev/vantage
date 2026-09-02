-- Goals gain a kind, so a goal can target income as well as shares.
--
--   SHARES         accumulate N shares of one holding   (the original goal)
--   INCOME_TOTAL   receive N of dividends, all time
--   INCOME_MONTHLY reach a monthly income run rate of N
--   INCOME_YEAR    receive N of dividends this calendar year
--
-- instrument_id becomes nullable: an income goal with no instrument is
-- portfolio-wide ("RM 12,000 a year across everything"), which is a different
-- and equally reasonable thing to want than a per-holding target.
--
-- Income targets are MYR, matching monthly_budget, so every goal amount in the
-- app is one currency and they can be compared with each other.

-- migrate:up
ALTER TABLE goals ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'SHARES';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_amount DOUBLE PRECISION;

-- A share goal needs an instrument; an income goal may be portfolio-wide.
ALTER TABLE goals ALTER COLUMN instrument_id DROP NOT NULL;
-- Income goals carry no share target, so it needs a default to be omittable.
ALTER TABLE goals ALTER COLUMN target_qty SET DEFAULT 0;

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_kind_check;
ALTER TABLE goals ADD CONSTRAINT goals_kind_check
  CHECK (kind IN ('SHARES','INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR'));

-- Each kind must carry the target it is actually measured against, so a goal can
-- never exist in a state the progress maths cannot read.
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_shape_check;
ALTER TABLE goals ADD CONSTRAINT goals_shape_check CHECK (
  (kind = 'SHARES'  AND instrument_id IS NOT NULL AND target_qty > 0)
  OR (kind <> 'SHARES' AND target_amount > 0)
);

-- migrate:down
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_shape_check;
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_kind_check;
DELETE FROM goals WHERE kind <> 'SHARES' OR instrument_id IS NULL;
ALTER TABLE goals ALTER COLUMN instrument_id SET NOT NULL;
ALTER TABLE goals ALTER COLUMN target_qty DROP DEFAULT;
ALTER TABLE goals DROP COLUMN IF EXISTS target_amount;
ALTER TABLE goals DROP COLUMN IF EXISTS kind;
