-- A sixth goal kind: ASSET_BALANCE — a target balance in one account outside
-- moomoo. "RM 300,000 in ASB", "RM 40,000 in Tabung Kawin".
--
-- Every goal until now has been a moomoo goal: shares of a holding, or dividends
-- from the portfolio. That left the accounts holding most of the money with no
-- way to express a target at all, while two of them are already goal-shaped —
-- Tabung Kawin is a cash pot with rate_basis NONE, which is a savings target
-- with the target missing, and ASB carries a unit_cap that the Assets screen
-- already draws as a progress bar.
--
-- `asset_id` rather than reusing `instrument_id`: they reference different
-- tables, and one nullable column pointing at two of them by convention is the
-- kind of thing that survives exactly until someone forgets the convention.
-- The shape check enforces that a goal names one or the other, never both.

-- migrate:up

ALTER TABLE goals ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id);

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_kind_check;
ALTER TABLE goals ADD CONSTRAINT goals_kind_check
  CHECK (kind IN ('SHARES','INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR','INCOME_PER_PAYMENT','ASSET_BALANCE'));

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_shape_check;
ALTER TABLE goals ADD CONSTRAINT goals_shape_check CHECK (
  (kind = 'SHARES' AND instrument_id IS NOT NULL AND target_qty > 0 AND asset_id IS NULL)
  OR (kind = 'INCOME_PER_PAYMENT' AND instrument_id IS NOT NULL AND target_amount > 0 AND asset_id IS NULL)
  OR (kind IN ('INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR') AND target_amount > 0 AND asset_id IS NULL)
  OR (kind = 'ASSET_BALANCE' AND asset_id IS NOT NULL AND target_amount > 0 AND instrument_id IS NULL)
);

-- migrate:down

DELETE FROM goals WHERE kind = 'ASSET_BALANCE';

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_shape_check;
ALTER TABLE goals ADD CONSTRAINT goals_shape_check CHECK (
  (kind = 'SHARES' AND instrument_id IS NOT NULL AND target_qty > 0)
  OR (kind = 'INCOME_PER_PAYMENT' AND instrument_id IS NOT NULL AND target_amount > 0)
  OR (kind IN ('INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR') AND target_amount > 0)
);

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_kind_check;
ALTER TABLE goals ADD CONSTRAINT goals_kind_check
  CHECK (kind IN ('SHARES','INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR','INCOME_PER_PAYMENT'));

ALTER TABLE goals DROP COLUMN IF EXISTS asset_id;
