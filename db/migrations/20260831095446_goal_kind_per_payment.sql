-- A fifth goal kind: INCOME_PER_PAYMENT — the size of each individual dividend,
-- averaged over the last few payments.
--
-- Unlike the other income kinds this one is per holding only. Combined across
-- holdings it would swing 4x purely on which funds happened to pay that day
-- (RM 182 when two paid, RM 789 when three did), which measures the payment
-- calendar rather than the portfolio.

-- migrate:up
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_kind_check;
ALTER TABLE goals ADD CONSTRAINT goals_kind_check
  CHECK (kind IN ('SHARES','INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR','INCOME_PER_PAYMENT'));

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_shape_check;
ALTER TABLE goals ADD CONSTRAINT goals_shape_check CHECK (
  (kind = 'SHARES' AND instrument_id IS NOT NULL AND target_qty > 0)
  OR (kind = 'INCOME_PER_PAYMENT' AND instrument_id IS NOT NULL AND target_amount > 0)
  OR (kind IN ('INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR') AND target_amount > 0)
);

-- migrate:down
DELETE FROM goals WHERE kind = 'INCOME_PER_PAYMENT';
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_shape_check;
ALTER TABLE goals ADD CONSTRAINT goals_shape_check CHECK (
  (kind = 'SHARES' AND instrument_id IS NOT NULL AND target_qty > 0)
  OR (kind <> 'SHARES' AND target_amount > 0)
);
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_kind_check;
ALTER TABLE goals ADD CONSTRAINT goals_kind_check
  CHECK (kind IN ('SHARES','INCOME_TOTAL','INCOME_MONTHLY','INCOME_YEAR'));
