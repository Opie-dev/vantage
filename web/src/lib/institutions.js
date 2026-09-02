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
 * Everything here is a starting point the form leaves editable. Rates are
 * deliberately NOT included: they are declared annually and would be stale
 * within months, and a stale rate presented as a default is worse than a blank
 * field. Sources are in the pull request that added this file.
 */

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
    products: [
      {
        id: 'ASB',
        name: 'ASB',
        label: 'ASB — Amanah Saham Bumiputera',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '12-31',
        unit_cap: 300000,
      },
      {
        id: 'ASB2',
        name: 'ASB 2',
        label: 'ASB 2',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '03-31',
        unit_cap: 300000,
      },
      {
        id: 'ASB3',
        name: 'ASB 3 Didik',
        label: 'ASB 3 Didik',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '06-30',
        unit_cap: null,
      },
      {
        id: 'ASM',
        name: 'ASM',
        label: 'ASM — Amanah Saham Malaysia',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '03-31',
        unit_cap: null,
      },
      {
        id: 'ASM2W',
        name: 'ASM 2 Wawasan',
        label: 'ASM 2 Wawasan',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '08-31',
        unit_cap: null,
      },
      {
        id: 'ASM3',
        name: 'ASM 3',
        label: 'ASM 3',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'SEN_PER_UNIT',
        fiscal_year: '09-30',
        unit_cap: null,
      },
    ],
  },
  {
    id: 'EPF',
    label: 'EPF',
    hint: 'Kumpulan Wang Simpanan Pekerja (KWSP)',
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
      },
      {
        id: 'EPF_SEJAHTERA',
        name: 'EPF Akaun Sejahtera',
        label: 'Akaun Sejahtera — was Account 2 · 15%',
        rate_basis: 'MADB',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
      },
      {
        id: 'EPF_FLEKSIBEL',
        name: 'EPF Akaun Fleksibel',
        label: 'Akaun Fleksibel — Account 3 · 10%',
        rate_basis: 'MADB',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
      },
    ],
  },
  {
    id: 'TH',
    label: 'Tabung Haji',
    hint: 'Lembaga Tabung Haji',
    products: [
      {
        id: 'TH_SAVINGS',
        name: 'Tabung Haji',
        label: 'Tabung Haji savings',
        rate_basis: 'MIN_MONTHLY',
        rate_quote: 'PERCENT',
        fiscal_year: '12-31',
        unit_cap: null,
      },
    ],
  },
]

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
