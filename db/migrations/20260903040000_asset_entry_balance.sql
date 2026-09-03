-- A fifth entry type: BALANCE — "as of this date the account holds exactly this".
--
-- Every other type is a MOVEMENT and accumulates. This one is a READING and
-- resets: it says what the balance is, not what changed. That is the difference
-- between a ledger you keep and a position you check, and a current account is
-- the second kind.
--
-- WHY IT HAS TO EXIST. expenses-plan.md infers spending rather than recording it,
-- and the inference needs one number the app does not otherwise have: what you
-- hold liquid. Recording a current account through DEPOSIT and WITHDRAW rows
-- would mean entering every movement, which is the transaction log §2 of
-- commitments-and-income-plan.md spends a page rejecting. A reading is one number
-- typed when convenient, and it is the whole difference between a feature that
-- survives and one abandoned in three weeks.
--
-- RESTRICTED TO liquidity = 'WALLET', enforced in assets.service.js rather than
-- here because the check spans two tables. The reason is an invariant worth
-- keeping: assetRows() documents that `balance − contributed === earned` holds
-- identically for every row, and says that if it ever fails an entry carries the
-- wrong type. A BALANCE reading breaks that by construction — the gap between a
-- reading and the derived balance is unexplained, and for a current account it is
-- mostly spending. Confining readings to wallets keeps the invariant true for
-- every savings account, where it is load-bearing, and exempts the one kind of
-- account whose contributed and earned figures were never meaningful anyway.
--
-- ORDER NOW MATTERS. assetBalance() was an order-independent sum; with a reset in
-- the type list it becomes an oldest-first walk, the same way positions() already
-- reverses the transaction log because average cost depends on order.

-- migrate:up

ALTER TABLE asset_entries DROP CONSTRAINT IF EXISTS asset_entries_type_check;
ALTER TABLE asset_entries ADD CONSTRAINT asset_entries_type_check
  CHECK (type IN ('DEPOSIT','WITHDRAW','DISTRIBUTION','FEE','BALANCE'));

-- A reading of zero is meaningful — an emptied account — so the existing
-- amount >= 0 check is already right and is left alone.

-- migrate:down

-- Readings cannot survive the column that gives them meaning.
DELETE FROM asset_entries WHERE type = 'BALANCE';

ALTER TABLE asset_entries DROP CONSTRAINT IF EXISTS asset_entries_type_check;
ALTER TABLE asset_entries ADD CONSTRAINT asset_entries_type_check
  CHECK (type IN ('DEPOSIT','WITHDRAW','DISTRIBUTION','FEE'));
