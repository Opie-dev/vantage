/**
 * The savings accounts Malaysians actually hold outside a broker.
 *
 * This is a catalogue to pick from, not a set of accounts anyone is assumed to
 * have — nothing here exists until you choose it and save. What it removes is
 * the guesswork in the fields underneath, which is where the damage was: the
 * distribution basis and the financial year end are properties OF THE PRODUCT,
 * not opinions about it, and getting either wrong makes the estimator
 * confidently wrong rather than visibly broken.
 *
 * Two of those are easy to get wrong from memory, which is the reason this file
 * exists at all:
 *
 *   - the financial year is NOT the calendar year for four of the six ASNB
 *     fixed-price funds. ASB 2 and ASM run to 31 March, ASB 3 Didik to 30 June,
 *     ASM 2 Wawasan to 31 AUGUST and ASM 3 to 30 SEPTEMBER.
 *   - ASNB and Tabung Haji pay on the average of your monthly MINIMUMS, so a
 *     withdrawal on the 30th costs you the whole month. EPF instead runs a
 *     Modified Aggregate Daily Balance: a contribution earns from the last day
 *     of the month it was made. The same deposit is worth different money under
 *     the two, which is why the app asks rather than assuming.
 *
 * Everything here is a starting point the form leaves editable.
 *
 * Declared rates ARE included, as a dated history rather than a bare default.
 * The distinction matters: a past rate is a fact that never changes — ASB's
 * 2024 distribution is permanently 5.75 sen — whereas an undated "current rate"
 * silently rots the day the next one is declared. So every figure carries the
 * financial year it was earned in, and rateIsStale() below reports when the
 * newest rate on file is older than the year the account is now in, rather than
 * letting the estimator quietly project last year's number forever.
 *
 * Rates are keyed by FINANCIAL year, not the calendar year of the announcement.
 * The two differ for every ASNB fund that does not end in December: ASB 2's
 * "2026" is the year to 31 March 2026, announced that same March.
 *
 * Sources are in the pull request that added this file.
 */

/**
 * EPF declares one rate for Simpanan Konvensional and another for Simpanan
 * Shariah, and all three accounts earn whichever applies to the member — the
 * split is a choice made once, not per account. The two converged in 2024 and
 * have stayed level since, but they were as far apart as 0.60pp in 2022, so
 * both are kept.
 */
const EPF_RATES = [
  { year: 2025, rate: 6.15, shariah: 6.15 },
  { year: 2024, rate: 6.3, shariah: 6.3 },
  { year: 2023, rate: 5.5, shariah: 5.4 },
  { year: 2022, rate: 5.35, shariah: 4.75 },
  { year: 2021, rate: 6.1, shariah: 5.65 },
  { year: 2020, rate: 5.2, shariah: 4.9 },
]

/**
 * Shariah standing, which is a different question per institution and is asked
 * about often enough to belong on screen rather than in a search.
 *
 *   COMPLIANT  fully Shariah-compliant. One rate, nothing to choose.
 *   FATWA      not Shariah-compliant BY STRUCTURE, but permitted for Muslim
 *              investors under fatwa on maslahah grounds. Still one rate: this
 *              is a ruling about the fund, not a variant of it.
 *   ELECTION   the institution runs two funds and you elect between them, so
 *              the declared rate genuinely differs. EPF alone does this.
 *
 * The distinction matters because only ELECTION changes a number. A fund can be
 * conventional in structure and still declare exactly one distribution, which is
 * the case for every ASNB fixed-price fund.
 */
export const SHARIAH = {
  COMPLIANT: 'Shariah-compliant.',
  FATWA:
    'Not Shariah-compliant by structure, but permitted for Muslim investors under fatwa, on maslahah grounds. One rate is declared either way. ASNB does offer separate Shariah funds - ASN Equity Shariah, ASN Imbang Shariah, ASN Sukuk - but those are variable-price and are not in this list.',
  ELECTION:
    'You elect Simpanan Konvensional or Simpanan Shariah once, and it applies to all three accounts. The two declare different rates, so pick yours below.',
}

/** Sentinel for an institution not in the list — Radix rejects ''. */
export const OTHER = '__other__'

/**
 * ASNB's fixed-price funds are all priced at RM1.00 a unit and all declare in
 * sen per unit, so units and ringgit are the same number and a 5.50 sen
 * distribution reads as 5.5%. EPF and Tabung Haji declare a percentage.
 */
export const INSTITUTIONS = [
  {
    id: 'ASNB',
    label: 'ASNB',
    hint: 'Amanah Saham Nasional Berhad',
    shariah: 'FATWA',
    products: [
      {
        id: 'ASB',
        name: 'ASB',
        label: 'ASB — Amanah Saham Bumiputera',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '12-31',
        unit_cap: 300000,
        rates: [
          { year: 2025, rate: 5.2, bonus: 0.55 },
          { year: 2024, rate: 5.5, bonus: 0.25 },
          { year: 2023, rate: 4.25, bonus: 1.0 },
          { year: 2022, rate: 3.35, bonus: 1.25 },
          { year: 2021, rate: 4.25, bonus: 0.75 },
          { year: 2020, rate: 3.5, bonus: 0.75 },
        ],
      },
      {
        id: 'ASB2',
        name: 'ASB 2',
        label: 'ASB 2',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '03-31',
        unit_cap: 300000,
        rates: [
          { year: 2026, rate: 5.5 },
          { year: 2025, rate: 5.5 },
          { year: 2024, rate: 5.25 },
        ],
      },
      {
        id: 'ASB3',
        name: 'ASB 3 Didik',
        label: 'ASB 3 Didik',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '06-30',
        unit_cap: null,
        rates: [
          { year: 2026, rate: 5.5 },
          { year: 2025, rate: 5.25 },
        ],
      },
      {
        id: 'ASM',
        name: 'ASM',
        label: 'ASM — Amanah Saham Malaysia',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '03-31',
        unit_cap: null,
        rates: [
          { year: 2026, rate: 5.0 },
          { year: 2025, rate: 5.0 },
          { year: 2024, rate: 4.75 },
        ],
      },
      {
        id: 'ASM2W',
        name: 'ASM 2 Wawasan',
        label: 'ASM 2 Wawasan',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '08-31',
        unit_cap: null,
        rates: [
          { year: 2026, rate: 5.0 },
          { year: 2025, rate: 4.75 },
          { year: 2024, rate: 4.75 },
        ],
      },
      {
        id: 'ASM3',
        name: 'ASM 3',
        label: 'ASM 3',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '09-30',
        unit_cap: null,
        rates: [
          { year: 2025, rate: 4.75 },
          { year: 2024, rate: 4.75 },
          { year: 2022, rate: 3.75 },
        ],
      },
    ],
  },
  {
    id: 'EPF',
    label: 'EPF',
    hint: 'Kumpulan Wang Simpanan Pekerja (KWSP)',
    shariah: 'ELECTION',
    // The 2024 restructuring split the old two accounts into three. New
    // contributions go 75 / 15 / 10, and all three earn the same declared
    // dividend on the same MADB basis — they differ in what you may withdraw,
    // which is not something this app models.
    products: [
      {
        id: 'EPF_PERSARAAN',
        name: 'EPF Akaun Persaraan',
        label: 'Akaun Persaraan — was Account 1 · 75%',
        rate_basis: 'MADB',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
        rates: EPF_RATES,
      },
      {
        id: 'EPF_SEJAHTERA',
        name: 'EPF Akaun Sejahtera',
        label: 'Akaun Sejahtera — was Account 2 · 15%',
        rate_basis: 'MADB',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
        rates: EPF_RATES,
      },
      {
        id: 'EPF_FLEKSIBEL',
        name: 'EPF Akaun Fleksibel',
        label: 'Akaun Fleksibel — Account 3 · 10%',
        rate_basis: 'MADB',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
        rates: EPF_RATES,
      },
    ],
  },
  {
    id: 'TH',
    label: 'Tabung Haji',
    hint: 'Lembaga Tabung Haji',
    shariah: 'COMPLIANT',
    products: [
      {
        id: 'TH_SAVINGS',
        name: 'Tabung Haji',
        label: 'Tabung Haji savings',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
        rates: [
          { year: 2025, rate: 3.5 },
          { year: 2024, rate: 3.25 },
          { year: 2023, rate: 3.1 },
          { year: 2022, rate: 3.1 },
          { year: 2021, rate: 3.1 },
          { year: 2020, rate: 3.1 },
        ],
      },
    ],
  },
]

/** The newest declared rate on file for a product, or null. */
export function latestRate(product) {
  const rates = product?.rates
  if (!rates || !rates.length) return null
  return rates.reduce((best, r) => (r.year > best.year ? r : best), rates[0])
}

/** Base rate plus any bonus — what the account actually paid that year. */
export function totalRate(r) {
  return r ? r.rate + (r.bonus || 0) : 0
}

/**
 * The financial year an account is currently earning, given its year end.
 *
 * A fund whose year ends 31 March is, in September 2026, already earning its
 * 2027 year. The newest rate on file can therefore be two years behind the
 * current one without anything being wrong — the year just has not ended yet.
 * So this reports the most recent year that COULD have been declared, and
 * rateIsStale() compares against that rather than against today's date.
 */
export function lastCompleteYear(fiscalYear, now = new Date()) {
  const endMonth = Number(String(fiscalYear || '12-31').slice(0, 2))
  const y = now.getFullYear()
  // getMonth() is 0-based; a year ending in month N completes at the end of N.
  return now.getMonth() + 1 > endMonth ? y : y - 1
}

/**
 * True when the newest rate on file is older than the last year that has
 * actually finished — meaning a declaration has happened, or is overdue, that
 * this file does not know about.
 */
export function rateIsStale(product, now = new Date()) {
  const latest = latestRate(product)
  if (!latest) return false
  return latest.year < lastCompleteYear(product.fiscal_year, now)
}

/**
 * A stand-in rate for the financial year currently in progress.
 *
 * The year a fund is earning right now has no declared rate — that is what
 * "in progress" means — but the estimator still has to project it, and the only
 * defensible input is what the fund last actually paid. So this carries the
 * newest declared rate forward and marks it, rather than leaving the current
 * year blank or letting last year's figure masquerade as this year's.
 *
 * The year is computed per fund, never assumed. On 2 September 2026 ASB is
 * midway through its 2026 year, while ASB 2 — whose year ended in March — has
 * already been paid for 2026 and is earning 2027. A hardcoded "2026" would be
 * wrong for half the catalogue.
 *
 * Returns null when the year in progress has in fact already been declared,
 * so nothing is invented on top of a real figure.
 */
export function estimatedRate(product, now = new Date()) {
  const latest = latestRate(product)
  if (!latest) return null
  const year = lastCompleteYear(product.fiscal_year, now) + 1
  if (year <= latest.year) return null
  return { ...latest, year, estimated: true, basedOn: latest.year }
}

/** The institution record for an id, or undefined for OTHER and unknowns. */
export function institutionOf(id) {
  return INSTITUTIONS.find(i => i.id === id)
}

/** The product record within an institution, or undefined. */
export function productOf(institutionId, productId) {
  return institutionOf(institutionId)?.products.find(p => p.id === productId)
}

/**
 * Financial year ends offered by the form.
 *
 * Every date an institution in this file actually uses, plus December for
 * anything typed in by hand. Sorted by month so the list reads as a calendar
 * rather than in the order the funds happened to be added.
 */
export const FISCAL_YEARS = [
  { value: '03-31', label: '31 March' },
  { value: '06-30', label: '30 June' },
  { value: '08-31', label: '31 August' },
  { value: '09-30', label: '30 September' },
  { value: '12-31', label: '31 December' },
]
