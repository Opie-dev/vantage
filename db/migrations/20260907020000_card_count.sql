-- How many pieces of plastic share one limit.
--
-- PLASTIC AND LIMITS ARE DIFFERENT QUANTITIES, and the app has been quietly
-- conflating them. `credit_limit` already carries a comment saying two cards can
-- share one limit — a principal and a supplementary, or a Visa and a Mastercard
-- issued against the same account — without recording how many, and Cards.jsx
-- names the account count `cards`, so the one number on screen that looks like a
-- card count is a count of accounts. Two accounts holding three cards reads as
-- "2" everywhere today.
--
-- IT CANNOT BE INFERRED, which is why it has to be asked. The statement parser
-- emits card NUMBERS, and it drops any card that settled to zero on that
-- statement — so counting them undercounts exactly the cards that behaved. There
-- is no other source: a limit is per account, a transaction names no card, and a
-- payment names no card either.
--
-- A COLUMN, NOT A TABLE. Two verified readings of this gap disagreed on shape —
-- one wanted `public.cards`, the other this — and `cards-plan.md:851` settles it
-- by stating outright that there is no `cards` table. It is right. A table earns
-- its place when rows have their own facts to carry; a card does not. Its limit
-- belongs to the account, its APR belongs to the account, its statement belongs
-- to the account, and the only thing that is per-card is a name — which the
-- existing and entirely unused `note` column already holds. A child table here
-- would be five rows of DDL to store a string nobody queries.
--
-- NULL MEANS UNASKED, NOT ONE. An account created before this column existed has
-- no answer, and defaulting it to 1 would invent a fact — the whole point of the
-- badge is to say something the owner told us. A screen prints the count only
-- where there is one, and says nothing where there is not.

-- migrate:up

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS card_count INTEGER;

-- Only a card account has cards, and an account with zero of them is not an
-- account. Anything above a handful is a typo rather than a wallet.
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_card_count_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_card_count_check
  CHECK (card_count IS NULL OR (kind = 'REVOLVING' AND card_count BETWEEN 1 AND 20));

COMMENT ON COLUMN commitments.card_count IS
  'Pieces of plastic sharing this limit. NULL means never asked, never 1 by default.';

-- migrate:down

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_card_count_check;
ALTER TABLE commitments DROP COLUMN IF EXISTS card_count;
