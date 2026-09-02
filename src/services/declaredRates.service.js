/**
 * The rates an institution declares each year, as the user's own record.
 *
 * The app ships a catalogue of these in the frontend, accurate the day it was
 * written and stale from there — ASNB declares ASB every December, EPF every
 * February, Tabung Haji in the first quarter. A row here overrides the shipped
 * figure for the same fund and year, so a new declaration, a correction, or a
 * fund the catalogue never had are all recordable without a release.
 *
 * Nothing here knows what a valid fund id is: the catalogue lives in JavaScript
 * on the client and this table is keyed by its ids. That seam is deliberate and
 * documented in the migration — validating against a list the server cannot see
 * would mean duplicating the catalogue here and keeping two copies in step.
 */
const declaredRates = require('../models/declaredRates.model');
const { badRequest, notFound } = require('../middleware/errorHandler');

const optionalNumber = v => v == null || (typeof v === 'number' && Number.isFinite(v));

/** Mirrors declared_rates_year_check. */
const YEAR_MIN = 1990;
const YEAR_MAX = 2200;

/**
 * Mirrors declared_rates_sane_check.
 *
 * Not a business rule — a bound on typos. A misplaced decimal turns 5.75 into
 * 575, and the estimator would project a 575% return without blinking. Zero is
 * allowed: a fund that pays nothing in a bad year is a fact worth recording.
 */
const RATE_MAX = 100;

function checkRate(label, v, { required = false } = {}) {
  if (v == null) {
    if (required) throw badRequest(`${label} is required`);
    return;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`${label} must be a number`);
  if (v < 0) throw badRequest(`${label} cannot be negative`);
  if (v > RATE_MAX) throw badRequest(`${label} of ${v} looks like a typo — rates are under ${RATE_MAX}`);
}

const list = () => declaredRates.listAll();

/**
 * Record a rate, replacing any already held for that fund and year.
 *
 * An institution declares once per financial year, so a second submission for
 * the same year is a correction rather than an additional rate — the model's
 * upsert makes that the behaviour instead of a unique-violation the caller
 * would have to interpret.
 */
async function save(body = {}) {
  const {
    institution_id, product_id, year,
    rate = null, bonus = null, shariah = null, note = '',
  } = body;

  const institutionId = String(institution_id || '').trim();
  const productId = String(product_id || '').trim();
  if (!institutionId) throw badRequest('institution_id is required');
  if (!productId) throw badRequest('product_id is required');

  if (!Number.isInteger(year)) throw badRequest('year must be a whole number');
  if (year < YEAR_MIN || year > YEAR_MAX) {
    throw badRequest(`year must be between ${YEAR_MIN} and ${YEAR_MAX}`);
  }

  checkRate('rate', rate, { required: true });
  checkRate('bonus', bonus);
  checkRate('shariah', shariah);
  if (!optionalNumber(bonus) || !optionalNumber(shariah)) throw badRequest('bonus and shariah must be numbers');

  return declaredRates.upsert({
    institutionId, productId, year, rate, bonus, shariah, note: String(note || '').trim(),
  });
}

async function remove(id) {
  const row = await declaredRates.findById(id);
  if (!row) throw notFound('No such declared rate');
  await declaredRates.remove(id);
}

module.exports = { list, save, remove, YEAR_MIN, YEAR_MAX, RATE_MAX };
