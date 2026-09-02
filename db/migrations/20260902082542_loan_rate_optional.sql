-- A loan may be recorded without its rate.
--
-- Most people know what they pay each month and how many payments are left.
-- Far fewer know the rate, and fewer still know whether it is charged flat or on
-- the reducing balance — which is the harder half of the question, since a
-- Malaysian lender will call a reducing-balance rate "fixed" and a flat rate
-- costs close to double what it looks like.
--
-- Demanding all of it meant a car loan could not go in at all until the
-- agreement was found. What is actually needed to track a commitment is what
-- leaves the account and how long it goes on: with those, what is still owed is
-- the instalments still to run.
--
-- Rate and rate_type stay optional TOGETHER. A rate with no basis is not half an
-- answer, it is a wrong one — 2.79% flat and 2.79% reducing are different loans,
-- and showing either without saying which would mislead more than showing
-- neither. Hence the paired condition rather than two independent nullables.
--
-- The instalment becomes required in that case, because with no rate it is the
-- only thing left that can say what a payment is.

-- migrate:up

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_shape_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_shape_check CHECK (
     (kind = 'LOAN'      AND (COALESCE(principal, 0) > 0 OR COALESCE(instalment, 0) > 0)
                         AND (principal IS NULL OR principal > 0)
                         AND (instalment IS NULL OR instalment > 0)
                         -- both, or neither
                         AND ((rate IS NULL AND rate_type IS NULL)
                              OR (rate IS NOT NULL AND rate_type IS NOT NULL))
                         -- no rate: the instalment has to carry the payment
                         AND (rate IS NOT NULL OR COALESCE(instalment, 0) > 0)
                         AND term_months > 0 AND started_on IS NOT NULL)
  OR (kind = 'REVOLVING' AND apr IS NOT NULL)
  OR (kind = 'RECURRING' AND amount > 0 AND every_months > 0)
);

-- migrate:down

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_shape_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_shape_check CHECK (
     (kind = 'LOAN'      AND (COALESCE(principal, 0) > 0 OR COALESCE(instalment, 0) > 0)
                         AND (principal IS NULL OR principal > 0)
                         AND (instalment IS NULL OR instalment > 0)
                         AND rate IS NOT NULL AND rate_type IS NOT NULL
                         AND term_months > 0 AND started_on IS NOT NULL)
  OR (kind = 'REVOLVING' AND apr IS NOT NULL)
  OR (kind = 'RECURRING' AND amount > 0 AND every_months > 0)
);
