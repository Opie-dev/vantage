-- Things a loan bought, so both sides of the loan can be counted.
--
-- THE ASYMMETRY THIS FIXES. A mortgage is a liability the app has modelled since
-- commitments landed; the house it bought has not existed here at all. Net worth
-- has therefore been understating by the entire value of the house, and
-- netWorth() has been hardcoding `itemsTracked: false` and saying so on the
-- Dashboard rather than pretending otherwise. That was the right thing to do
-- while nothing could be tracked. This makes it trackable.
--
-- money-redesign-plan.md 4(a). It is the only schema change the Loans screen
-- needs and the last thing blocking the equity line the design has drawn since
-- the first canvas.
--
-- AN ITEM IS NOT A SAVINGS ACCOUNT WEARING A HAT. Three things are true of it and
-- of nothing else in this table, and the shape check below enforces all three:
--
--   It earns no rate. A house appreciates or it does not, and neither is a
--   declared dividend. `rate_basis` is NONE, so the estimator never runs on it and
--   never invents a projection for a thing that does not pay.
--
--   It cannot be spent. Not "locked until 55" like EPF — a different kind of
--   unreachable, and conflating the two would make the Assets screen's locked
--   bucket mean a retirement account you may not touch yet AND a house you live
--   in. Hence ILLIQUID as its own value rather than reusing LOCKED.
--
--   Its value is read, never accumulated. A savings balance is a running sum of
--   deposits; a valuation is a single figure someone asserts on a date and
--   replaces later. That is exactly what a BALANCE entry already is, so items
--   reuse asset_entries rather than growing a column, and get a history of
--   valuations for free. The service rule that keeps BALANCE readings out of
--   SAVINGS accounts is relaxed for ITEM only, and for the opposite reason it
--   exists: a reading on a savings account breaks the ledger invariant, while for
--   an item the reading IS the ledger.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not value anything, guess
-- appreciation, or link to a price feed. A valuation here is whatever the owner
-- last asserted, carrying the date they asserted it, and the screens say so —
-- a stale valuation should read as stale rather than as a fact.
--
-- LINKING IS OPTIONAL AND STAYS OPTIONAL. commitments.asset_id is nullable, and a
-- loan with nothing linked keeps counting only the debt. The Loans screen says
-- that in words rather than absorbing the omission quietly, because an
-- understated net worth the owner knows about is a different thing from one they
-- do not.

-- migrate:up

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets ADD CONSTRAINT assets_kind_check
  CHECK (kind IN ('SAVINGS','ITEM'));

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_liquidity_check;
ALTER TABLE assets ADD CONSTRAINT assets_liquidity_check
  CHECK (liquidity IN ('WALLET','SAVINGS','LOCKED','ILLIQUID'));

-- The three facts above, enforced rather than documented. An ITEM that earned a
-- rate or turned up in the reachable total would be a quiet lie in a figure
-- nobody re-derives.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_item_shape_check;
ALTER TABLE assets ADD CONSTRAINT assets_item_shape_check CHECK (
     kind <> 'ITEM'
  OR (liquidity = 'ILLIQUID' AND rate_basis = 'NONE' AND unit_cap IS NULL)
);

-- And the reverse: only an item may be ILLIQUID. Without this, a savings account
-- could be hidden from the reachable total by setting one field.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_illiquid_is_item_check;
ALTER TABLE assets ADD CONSTRAINT assets_illiquid_is_item_check
  CHECK (liquidity <> 'ILLIQUID' OR kind = 'ITEM');

-- What the loan bought. ON DELETE SET NULL rather than CASCADE: removing the
-- house must not remove the mortgage, which is still owed either way.
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS asset_id integer
  REFERENCES assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN commitments.asset_id IS
  'What this loan bought, if it is tracked. Nullable on purpose: a loan with nothing linked counts only the debt, and the Loans screen says so.';

-- Only a loan buys a thing. A card or a recurring charge pointing at an asset
-- would be meaningless, and meaningless is how a wrong net worth starts.
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_asset_is_loan_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_asset_is_loan_check
  CHECK (asset_id IS NULL OR kind = 'LOAN');

CREATE INDEX IF NOT EXISTS commitments_asset_idx ON commitments (asset_id);

-- migrate:down

DROP INDEX IF EXISTS commitments_asset_idx;
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_asset_is_loan_check;
ALTER TABLE commitments DROP COLUMN IF EXISTS asset_id;

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_illiquid_is_item_check;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_item_shape_check;

-- Anything created under the new rules has to go before the old ones can hold.
DELETE FROM asset_entries WHERE asset_id IN (SELECT id FROM assets WHERE kind = 'ITEM');
DELETE FROM assets WHERE kind = 'ITEM';

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_liquidity_check;
ALTER TABLE assets ADD CONSTRAINT assets_liquidity_check
  CHECK (liquidity IN ('WALLET','SAVINGS','LOCKED'));

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets ADD CONSTRAINT assets_kind_check CHECK (kind = 'SAVINGS');
