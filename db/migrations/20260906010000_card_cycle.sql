-- When the bill closes, and how the limit comes back.
--
-- THE STATEMENT DAY IS NOT COSMETIC. Bank Negara requires an interest-free period
-- of at least twenty calendar days FROM THE STATEMENT DATE, and only for a
-- cardholder carrying nothing forward (BNM/RH/PD 028-141 para 18.2). Store only
-- `due_day` and the app cannot say the one sentence a card screen is for:
-- anything bought today lands on the bill closing on the 8th and due on the 28th.
-- Two dates, or the question is unanswerable.
--
-- Do not confuse it with para 13.3, which requires a further four calendar days
-- of grace AFTER the due date to absorb weekends and holidays. That is a late
-- payment allowance, not interest-free time, and the calendar must not draw it as
-- slack in the cycle.
--
-- LIMIT_RELEASE IS A COLUMN BECAUSE THE BANKS DISAGREE. When a plan blocks the
-- limit, two mechanics exist in the Malaysian market and both are written down in
-- issuers' own terms: PROGRESSIVE restores the limit as each instalment's
-- principal lands, ON_SETTLEMENT holds the whole amount until the last one. Hong
-- Leong, AmBank and UOB publish the first; HSBC, Alliance and Standard Chartered
-- publish the second. It is not something BNM prescribes for EPP at all — the only
-- place the regulator legislates limit treatment is Automatic Balance Conversion,
-- where para 14.3(c) goes further than either and restores nothing until the term
-- loan is fully repaid.
--
-- PROGRESSIVE IS THE DEFAULT because it is what both of this owner's issuers
-- publish. Maybank EzyPay Plus cl 12 restores by "the principal portion of each
-- monthly payment paid and to the extent that actual payment is received"; BSN
-- EasyCash cl 16(a) is the same mechanic. Note the two refinements in Maybank's
-- wording — principal only, and on receipt rather than on schedule — which is why
-- available credit derives from remaining principal, not instalments elapsed.
--
-- NOTHING IS BACKFILLED. Both columns are NULL on every existing row, and the
-- screens say "not recorded" rather than assuming a cycle nobody stated. A
-- statement fills them in one reading.
--
-- See cards-plan.md §4(a) and §7.

-- migrate:up

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS statement_day INTEGER;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS limit_release TEXT;

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_statement_day_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_statement_day_check
  CHECK (statement_day IS NULL OR (statement_day >= 1 AND statement_day <= 31));

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_limit_release_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_limit_release_check
  CHECK (limit_release IS NULL OR limit_release IN ('PROGRESSIVE','ON_SETTLEMENT'));

-- THE MINIMUM FLOOR IS ISSUER PRACTICE, NOT A RULE, and the old comment implied
-- otherwise. `RM50` appears exactly twice in the whole policy document, both times
-- inside a worked example BNM requires issuers to reprint on every statement
-- (Appendices III and V, mandated by para 21.20). The binding requirement in 13.1
-- carries no floor at all — and the two issuers here do not agree on one anyway:
-- BSN is RM 50 (Cardmember Agreement cl 21.1(a)), Maybank is RM 25.
--
-- So the default stays 50 because it is the commoner of the two, existing rows are
-- left alone, and this comment is the correction. Set it per card.
COMMENT ON COLUMN commitments.min_payment_floor IS
  'Issuer practice, not regulation. BSN 50, Maybank 25. BNM 13.1 mandates no floor.';

COMMENT ON COLUMN commitments.credit_limit IS
  'Belongs to the ACCOUNT, not the card. Two cards can share one limit, one due date and one minimum.';

-- migrate:down

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_limit_release_check;
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_statement_day_check;
ALTER TABLE commitments DROP COLUMN IF EXISTS limit_release;
ALTER TABLE commitments DROP COLUMN IF EXISTS statement_day;
