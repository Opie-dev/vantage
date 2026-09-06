const { get, one, run } = require('../db');

/**
 * Published exchange rates, one row per currency per day.
 *
 * A cache with no expiry, deliberately: a rate BNM published for a past date does
 * not change, so a date fetched once is a date fetched forever. That is also what
 * keeps conversions working while BNM is unreachable, for every date already
 * seen.
 */
const listAll = () => get(
  `SELECT * FROM fx_rates ORDER BY date DESC, base ASC`);

/** The rate published for exactly this date, or nothing. */
const findOn = (base, dateISO) => one(
  `SELECT * FROM fx_rates WHERE base = $1 AND quote = 'MYR' AND date = $2`,
  base, dateISO);

/**
 * The nearest published day within `walk` days before `dateISO`.
 *
 * A LAST RESORT, NOT A FIRST LOOK. Used only when BNM cannot be reached: asking
 * it first would answer a Saturday with whatever happens to be cached — the
 * Tuesday before, say — while the Friday in between goes unfetched. The exact
 * lookup above is the fast path; this one keeps the app working offline and is
 * allowed to be approximate because the alternative is not working at all.
 *
 * The walk-back is what makes a weekend work: BNM publishes on working days, so
 * Saturday has no rate and the right answer is Friday's — with Friday's date
 * returned, so nothing attributes it to Saturday.
 */
const findOnOrBefore = (base, dateISO, walk) => one(
  `SELECT * FROM fx_rates
    WHERE base = $1 AND quote = 'MYR'
      AND date <= $2
      AND date >= to_char(($2::date - $3::int), 'YYYY-MM-DD')
    ORDER BY date DESC
    LIMIT 1`,
  base, dateISO, walk);

/** Re-fetching a date corrects it rather than leaving two rows to arbitrate. */
const upsert = ({ base, quote = 'MYR', date, rate, unit = 1, source = 'bnm' }) => one(
  `INSERT INTO fx_rates (base, quote, date, rate, unit, source)
   VALUES ($1,$2,$3,$4,$5,$6)
   ON CONFLICT (base, quote, date)
   DO UPDATE SET rate = EXCLUDED.rate, unit = EXCLUDED.unit, source = EXCLUDED.source
   RETURNING *`,
  base, quote, date, rate, unit, source);

module.exports = { listAll, findOn, findOnOrBefore, upsert };
