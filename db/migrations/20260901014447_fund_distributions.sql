-- The distributions a fund has DECLARED, as opposed to the ones you received.
--
-- Two different things worth keeping apart: `transactions` (side='DIV') is money
-- that reached this account, while this table is the fund's own schedule — it
-- covers dates before you bought, and runs ahead of your account by the days
-- between an ex-date and settlement.
--
-- Source is moomoo get_rehab, which returns per_cash_div against an ex_div_date.
-- Amounts are per share, in the fund's own currency.

-- migrate:up
CREATE TABLE IF NOT EXISTS fund_distributions (
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  ex_date       TEXT NOT NULL,              -- YYYY-MM-DD, matching every other date column
  per_share     DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (instrument_id, ex_date)      -- one declaration per fund per ex-date
);

-- The screen reads one fund's history newest-first.
CREATE INDEX IF NOT EXISTS fund_distributions_lookup_idx
  ON fund_distributions (instrument_id, ex_date DESC);

-- migrate:down
DROP INDEX IF EXISTS fund_distributions_lookup_idx;
DROP TABLE IF EXISTS fund_distributions;
