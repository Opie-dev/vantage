-- A loan needs the amount financed OR the instalment, not necessarily both.
--
-- The original constraint required `principal > 0`, written when the principal
-- was mandatory. It is optional now — a hire-purchase statement gives the
-- instalment and never the amount financed, and each figure yields the other —
-- so the rule had to move rather than simply be dropped.
--
-- IT HAD ALREADY STOPPED ENFORCING ANYTHING, which is the part worth recording.
-- A CHECK fails only on FALSE, and passes on NULL. With principal NULL the LOAN
-- branch evaluated to NULL, the other two branches to FALSE, and `NULL OR FALSE
-- OR FALSE` is NULL — so the row went in. A loan with no principal AND no
-- instalment was accepted by the database and refused only by the service, which
-- is exactly the arrangement these constraints exist to avoid.
--
-- Hence COALESCE rather than a bare comparison: it turns the unknown into a
-- FALSE the constraint can actually reject.

-- migrate:up

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

-- migrate:down

ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_shape_check;
ALTER TABLE commitments ADD CONSTRAINT commitments_shape_check CHECK (
     (kind = 'LOAN'      AND principal > 0 AND rate IS NOT NULL AND rate_type IS NOT NULL
                         AND term_months > 0 AND started_on IS NOT NULL)
  OR (kind = 'REVOLVING' AND apr IS NOT NULL)
  OR (kind = 'RECURRING' AND amount > 0 AND every_months > 0)
);
