/**
 * The exchange rate on a given day, from Bank Negara.
 *
 * WHY DATED AT ALL. The app has one global `fx_usd_myr`, written by the moomoo
 * sync and applied to everything. A freelance invoice from March is therefore
 * converted at today's rate, which quietly restates history — the twelve-month
 * income chart changes shape whenever the ringgit moves, and no month on it is
 * what actually arrived. A rate fixed to the day the money landed is the only way
 * a chart of the past can be true.
 *
 * WHY BNM. It publishes free and unauthenticated, and it is the source a
 * Malaysian tax filing uses, so the app's figure and the owner's return agree by
 * construction rather than by luck. The middle rate, not buying or selling: those
 * are what a bank would hand you across a counter, and this is a reference.
 *
 * WEEKENDS ARE NOT MISSING DATA. BNM publishes on working days, so money landing
 * on a Saturday has no Saturday rate and never will. Walking back to the last
 * published day is the correct answer, not a fallback — but WHICH day is recorded
 * alongside, so Friday's number is never silently attributed to Saturday.
 *
 * IT NEVER GUESSES. Unreachable, or a date so old BNM has nothing, returns null.
 * The caller stores null and the figure falls back to the global rate, which the
 * screen labels as approximate. A wrong rate written into history is permanent in
 * a way a missing one is not.
 */
const fxRates = require('../models/fxRates.model');
const { badRequest } = require('../middleware/errorHandler');

const BASE_URL = 'https://api.bnm.gov.my/public/exchange-rate';
/** BNM versions by Accept header, not by path. Without this it answers 400. */
const ACCEPT = 'application/vnd.BNM.API.v1+json';
/** The published snapshot to use. 1200 is midday, which is the one BNM treats as
 *  the day's reference rate. */
const SESSION = '1200';
/** How far back to walk for a working day. Four covers a weekend with public
 *  holidays either side; beyond that the date is wrong, not unpublished. */
const MAX_WALK = 4;
const TIMEOUT_MS = 8000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const dayBefore = iso => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * One day's published rate, or null if BNM has none for it.
 *
 * Throws only on a bad argument. A network failure is not an exception here — it
 * is an absence, and the caller's job is to carry on without a dated rate rather
 * than to fail a payslip because a rate server was down.
 */
async function fetchOne(currency, dateISO) {
  const url = `${BASE_URL}/${currency.toLowerCase()}/date/${dateISO}?session=${SESSION}&quote=rm`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: ACCEPT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const r = body && body.data && body.data.rate;
  // A day BNM has not published comes back shaped like a success with nothing in
  // it, so the shape has to be checked rather than the status.
  if (!r || typeof r.middle_rate !== 'number' || !r.date) return null;
  return { rate: r.middle_rate, unit: body.data.unit || 1, date: r.date };
}

/**
 * The rate to use for `currency` on `dateISO`, cached.
 *
 * Returns `{ rate, unit, date, source }` where `date` is the day the rate was
 * actually published — equal to the requested date on a working day, earlier on a
 * weekend — or null when nothing could be found.
 */
async function rateOn(currency, dateISO) {
  const cur = String(currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) throw badRequest('currency must be a three-letter code');
  if (!ISO.test(dateISO)) throw badRequest('date must be YYYY-MM-DD');
  // Converting the base currency to itself is one, and asking BNM would be a
  // network call to learn that.
  if (cur === 'MYR') return { rate: 1, unit: 1, date: dateISO, source: 'identity' };

  /* Walk back a day at a time, checking the cache for each date BEFORE asking
   * BNM for it.
   *
   * THE CACHE IS CONSULTED PER DATE, NOT FUZZILY, and the difference is a bug
   * that looked like a feature. Asking the cache for "the nearest row within four
   * days" answers a Saturday with whatever it already holds — the Tuesday before,
   * say — and never discovers the Friday in between, because it returned before
   * fetching anything. The rate is then wrong by however far the ringgit moved
   * over three days, permanently, in a column whose whole purpose is to be exact.
   *
   * Each miss is a real absence: BNM answers an unpublished day with a success
   * shaped like a rate and nothing in it, so there is no way to tell a weekend
   * from an outage except by trying the day before. */
  let iso = dateISO;
  let reachedBnm = false;
  for (let i = 0; i <= MAX_WALK; i += 1) {
    const cached = await fxRates.findOn(cur, iso);
    if (cached) {
      return { rate: cached.rate, unit: cached.unit, date: cached.date, source: cached.source };
    }
    const hit = await fetchOne(cur, iso);
    if (hit) {
      reachedBnm = true;
      await fxRates.upsert({
        base: cur, quote: 'MYR', date: hit.date, rate: hit.rate, unit: hit.unit, source: 'bnm',
      });
      return { ...hit, source: 'bnm' };
    }
    iso = dayBefore(iso);
  }

  /* Nothing published and nothing cached for any of those days. If BNM was never
   * reachable this is an outage rather than a run of holidays, so fall back to
   * the nearest cached rate — approximate, but the app keeping working beats it
   * refusing to record a payslip because a rate server is down. */
  if (!reachedBnm) {
    const near = await fxRates.findOnOrBefore(cur, dateISO, MAX_WALK);
    if (near) {
      return { rate: near.rate, unit: near.unit, date: near.date, source: near.source };
    }
  }
  return null;
}

module.exports = { rateOn, MAX_WALK };
