-- An account that declares no annual rate.
--
-- rate_basis offered two values, MIN_MONTHLY and MADB, and both are descriptions
-- of how an annual DISTRIBUTION is computed — the average of your monthly lows,
-- or a modified aggregate daily balance. A bank savings account has no such
-- distribution to compute, so a Maybank MAE Tabung had to claim a basis it does
-- not have.
--
-- That was harmless only while the rate stayed blank. Fill one in and the
-- estimator would happily project a year of income for a cash pot, on a basis
-- nobody chose and the account does not use.
--
-- NONE is therefore not "unknown". It is a positive statement that this account
-- pays no declared rate, which is what lets the screen drop the estimator for it
-- rather than showing an empty one.

-- migrate:up

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_rate_basis_check;
ALTER TABLE assets ADD CONSTRAINT assets_rate_basis_check
  CHECK (rate_basis IN ('MIN_MONTHLY','MADB','NONE'));

-- migrate:down

-- Anything recorded as NONE has to become something the old constraint permits.
-- MIN_MONTHLY is the table's own default and, with no rate declared, changes no
-- figure on any screen.
UPDATE assets SET rate_basis = 'MIN_MONTHLY' WHERE rate_basis = 'NONE';

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_rate_basis_check;
ALTER TABLE assets ADD CONSTRAINT assets_rate_basis_check
  CHECK (rate_basis IN ('MIN_MONTHLY','MADB'));
