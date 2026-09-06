-- Which card account collects a recurring charge.
--
-- money-redesign-plan.md 4(b). A phone bill on direct debit and a phone bill
-- charged to a card are the same commitment and cost the same money, but they do
-- not leave on the same day: the first goes on its own due day, the second goes
-- when that card's bill is paid, which can be five weeks later. The app has had
-- no way to say which it is, so both were drawn on the charge's own date and one
-- of them was wrong.
--
-- WHAT THIS IS NOT. It is not a second copy of the charge. The commitment is
-- still subtracted from income exactly once, on Commitments, and the statement
-- importer still books a matched merchant as nothing at all — that COMMITMENT
-- rule in merchant_rules exists precisely so an electricity bill on a card is not
-- counted as both a commitment and an expense. This column adds no money to the
-- month; it only says where the money goes out through.
--
-- WHY IT POINTS AT A COMMITMENT AND NOT A CARD. Because a card account IS a
-- commitment here — one REVOLVING row, however many pieces of plastic, because
-- the limit is what runs out. The due day, the statement day and the minimum all
-- belong to that row, and they are exactly what a collected charge needs to know.
--
-- A CHECK cannot reach across rows to insist the target is REVOLVING, so the
-- schema enforces the half it can — only a RECURRING charge is collected through
-- anything — and commitments.service.js enforces the other half, where the
-- refusal can carry a sentence instead of a constraint name.

-- migrate:up

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS collected_by_id integer
  REFERENCES commitments(id) ON DELETE SET NULL;

COMMENT ON COLUMN commitments.collected_by_id IS
  'The REVOLVING account that collects this recurring charge, if a card does. Adds no money to the month — the charge is still counted once, on Commitments. It says which day the money actually leaves.';

-- Only a recurring charge is collected through something. A loan instalment goes
-- where the agreement says, and a card collecting a card is a loop.
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_collected_is_recurring_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_collected_is_recurring_check
  CHECK (collected_by_id IS NULL OR kind = 'RECURRING');

-- And never itself, which the kind rule above already prevents but which is
-- cheap to state and would be an ugly loop to debug.
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_collected_not_self_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_collected_not_self_check
  CHECK (collected_by_id IS NULL OR collected_by_id <> id);

CREATE INDEX IF NOT EXISTS commitments_collected_by_idx ON commitments (collected_by_id);

-- migrate:down

DROP INDEX IF EXISTS commitments_collected_by_idx;
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_collected_not_self_check;
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_collected_is_recurring_check;
ALTER TABLE commitments DROP COLUMN IF EXISTS collected_by_id;
