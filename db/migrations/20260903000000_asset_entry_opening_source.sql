-- An opening balance is not a contribution.
--
-- moneyByDay() reads an asset DEPOSIT as money leaving your pocket, which is
-- right for a real contribution and wrong for the balance you type in when first
-- recording an account you have held for years. Seven accounts were set up on
-- 2026-09-02 with one deposit each, so September read RM 97,645.73 of outgoings
-- against RM 1,402.88 of actual bills, and a net of −RM 85,645.73 against a real
-- +RM 10,597.12.
--
-- `source` already carried exactly this idea. A payroll-funded EPF contribution
-- is skipped by the calendar because net pay never contained it. An opening
-- balance is the same exemption for a different reason — the money moved before
-- this ledger existed — so it becomes a third source rather than a new column.
-- The Assets screen keeps counting it either way: it is a real part of the
-- balance, it is simply not a September cash flow.

-- migrate:up

ALTER TABLE asset_entries DROP CONSTRAINT IF EXISTS asset_entries_source_check;
ALTER TABLE asset_entries ADD CONSTRAINT asset_entries_source_check
  CHECK (source IN ('manual','payroll','opening'));

-- The balance an account was first recorded with: its earliest entry, a DEPOSIT,
-- dated no later than the day the account row itself was created. A contribution
-- made after setup is dated after created_at and is deliberately left alone —
-- that one IS money leaving your pocket and belongs on the calendar.
UPDATE asset_entries e
   SET source = 'opening'
  FROM assets a
 WHERE a.id = e.asset_id
   AND e.type = 'DEPOSIT'
   AND e.source = 'manual'
   AND e.date <= a.created_at
   AND e.date = (SELECT MIN(e2.date) FROM asset_entries e2 WHERE e2.asset_id = e.asset_id);

-- migrate:down

UPDATE asset_entries SET source = 'manual' WHERE source = 'opening';
ALTER TABLE asset_entries DROP CONSTRAINT IF EXISTS asset_entries_source_check;
