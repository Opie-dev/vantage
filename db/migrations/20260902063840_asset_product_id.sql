-- Which catalogue entry an account was created from.
--
-- Until now an asset remembered its NAME and its settings but not what it is, so
-- nothing could tell an EPF Akaun Persaraan from an EPF Akaun Sejahtera except by
-- reading the text someone typed. That is fine for display and useless for the
-- one thing that needs to know: splitting a payroll EPF contribution.
--
-- EPF allocates every contribution 75% to Akaun Persaraan, 15% to Akaun Sejahtera
-- and 10% to Akaun Fleksibel. Booking the whole amount into one account, which is
-- what income_sources.epf_asset_id alone can express, produces three balances
-- that are individually wrong and a total that happens to be right.
--
-- Null is normal and permanent: an account typed in by hand belongs to no
-- catalogue entry, and nothing here requires one. It is a hint for code that can
-- use it, never a key.
--
-- Same seam as declared_rates.product_id — the catalogue lives in JavaScript, so
-- there is no foreign key to point at. The ids are a stable published contract.

-- migrate:up

ALTER TABLE assets ADD COLUMN IF NOT EXISTS product_id TEXT;

-- Partial: most assets have no catalogue entry and there is nothing to index.
CREATE INDEX IF NOT EXISTS assets_product_id_idx
  ON assets (product_id) WHERE product_id IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS assets_product_id_idx;
ALTER TABLE assets DROP COLUMN IF EXISTS product_id;
