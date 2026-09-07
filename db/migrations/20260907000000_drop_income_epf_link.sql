-- The EPF link goes, and with it the write it existed for.
--
-- income_sources.epf_asset_id named ONE account to route a payslip's EPF into,
-- and income.service.addEvent() wrote a DEPOSIT of employee + employer EPF there
-- in the same transaction as the payslip. Two things were wrong with it.
--
-- IT COULD ONLY EVER MISALLOCATE. EPF splits every contribution 75% to Akaun
-- Persaraan, 15% to Akaun Sejahtera and 10% to Akaun Fleksibel — the same split
-- asset_product_id's own note records, and the reason that column exists. Nothing
-- in this app models it, and a single foreign key cannot express it: the whole
-- contribution lands in one of the three accounts, so all three balances are
-- wrong and only their total is right.
--
-- AND IT HAD NOT FIRED IN MONTHS. The form stopped offering the field; every
-- source the app can create has this column null, and both live rows are null.
-- Meanwhile three sentences in the UI told the owner their contributions were
-- being booked. A promise the code cannot keep is worse than no promise, and this
-- one was about money that had already moved.
--
-- WHAT REPLACES IT: nothing here. The owner records a contribution on Assets from
-- a statement, into whichever of the three accounts it belongs to, and the entry
-- carries source 'payroll' so the money calendar does not count it as spending —
-- net pay never contained it. The payslip's own epf_employee / epf_employer
-- columns are untouched. They are what net pay is computed from; they simply do
-- not write anywhere else now, which is what the comment above IncomeDialog has
-- claimed since before it was true.
--
-- NO DATA IS LOST. Both rows are null. Any asset_entries a past payslip did
-- generate stay exactly where they are — they are real contributions and this
-- drops the routing, not the history.

-- migrate:up

ALTER TABLE income_sources DROP CONSTRAINT IF EXISTS income_sources_epf_asset_id_fkey;
ALTER TABLE income_sources DROP COLUMN IF EXISTS epf_asset_id;

-- migrate:down

ALTER TABLE income_sources ADD COLUMN IF NOT EXISTS epf_asset_id INTEGER REFERENCES assets(id);
