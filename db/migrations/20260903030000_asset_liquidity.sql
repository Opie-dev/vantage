-- How reachable an account is, which is a different question from what it holds.
--
-- `kind` is the asset CLASS — SAVINGS, and later COMMODITY and ITEM. This is a
-- second axis entirely: whether the money is where you spend from, somewhere you
-- put money aside, or somewhere you cannot reach at all. Both are real and
-- neither implies the other.
--
--   WALLET   where money sits between arriving and being spent. A change in it is
--            NOT a contribution, it is your pocket moving — which is what lets
--            spending be inferred rather than recorded. See expenses-plan.md.
--   SAVINGS  a destination. Money in is money out of pocket, reachable later with
--            notice or a penalty.
--   LOCKED   cannot be reached before a condition is met. Counted in net worth,
--            never counted as within reach.
--
-- SAVINGS IS THE DEFAULT ON PURPOSE. It is what every existing row already is, so
-- this migration changes no behaviour: with no WALLET account the spending
-- residual is not computable, and the app is required to say so rather than
-- invent a figure. The feature switches itself on the day a bank balance is
-- added.

-- migrate:up

ALTER TABLE assets ADD COLUMN IF NOT EXISTS liquidity TEXT NOT NULL DEFAULT 'SAVINGS';

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_liquidity_check;
ALTER TABLE assets ADD CONSTRAINT assets_liquidity_check
  CHECK (liquidity IN ('WALLET','SAVINGS','LOCKED'));

-- EPF Akaun Persaraan cannot be touched before age 55 — only the Members
-- Investment Scheme reaches it, and that moves it sideways rather than out. That
-- is a fact about EPF rather than a preference, so it is set here; every other
-- account keeps the SAVINGS default, and nothing is guessed into WALLET, which is
-- a claim only the owner can make about their own bank account.
--
-- Matched on product_id where the catalogue set one, falling back to the name, so
-- a renamed account still matches and a differently-named one is left alone.
UPDATE assets
   SET liquidity = 'LOCKED'
 WHERE liquidity = 'SAVINGS'
   AND (product_id = 'EPF_PERSARAAN' OR name ILIKE '%Akaun Persaraan%');

-- migrate:down

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_liquidity_check;
ALTER TABLE assets DROP COLUMN IF EXISTS liquidity;
