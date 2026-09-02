-- Let a cash movement point at the holding that caused it.
--
-- Withholding tax arrives from moomoo as a FEE row whose remark names the stock
-- ('MSTY 182.31230000 SHARES FATCA WITHHOLDING TAX @30%'), and the sync worker
-- already parses that ticker out — but there was nowhere to store it, so the tax
-- could not be shown per holding. Nullable, because deposits, withdrawals and FX
-- transfers legitimately belong to no instrument.

-- migrate:up
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS instrument_id INTEGER REFERENCES instruments(id);

-- The Positions screen groups by instrument, so index the lookup it will do.
CREATE INDEX IF NOT EXISTS cash_movements_instrument_id_idx
  ON cash_movements (instrument_id) WHERE instrument_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS cash_movements_instrument_id_idx;
ALTER TABLE cash_movements DROP COLUMN IF EXISTS instrument_id;
