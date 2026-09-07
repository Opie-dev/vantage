// Headless mount check for the app shell. Run: node smoke.mjs   (needs jsdom)
// Renders <VantageProvider><App/></VantageProvider> in jsdom against a stub
// /api/state, then opens each of the three dialogs. Any React runtime error
// fails the run. Delete this file once the screens exist and there are tests.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html class="dark"><body><div id="root"></div></body></html>', {
  url: 'http://localhost:8123/',
  pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
for (const k of Object.getOwnPropertyNames(window)) {
  if (k in globalThis) continue
  try {
    Object.defineProperty(globalThis, k, { get: () => window[k], configurable: true })
  } catch {}
}
const def = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true })
def('navigator', window.navigator)
def('location', window.location)
def('getComputedStyle', (...a) => window.getComputedStyle(...a))
def('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0))
def('cancelAnimationFrame', id => clearTimeout(id))
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.DOMRect = class { constructor() { Object.assign(this, { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) } }
def('ResizeObserver', window.ResizeObserver)
def('DOMRect', window.DOMRect)
// Node 19+ ships its own Event/CustomEvent/EventTarget; jsdom rejects those as
// cross-realm, so force the jsdom versions over them.
for (const k of ['Event', 'CustomEvent', 'EventTarget', 'UIEvent', 'MouseEvent', 'PointerEvent',
  'KeyboardEvent', 'FocusEvent', 'InputEvent', 'DOMException', 'Node', 'Element', 'HTMLElement']) {
  if (window[k]) def(k, window[k])
}
// jsdom ships no matchMedia. Answer min-width queries against the window it does
// have — 1024x768 by default — rather than a flat `false`, because the rail
// derives its default state from `(min-width: 1024px)`: a stub that always says
// no collapses the rail to icons and hides the brand and every tab label this
// file goes on to assert on, which reads as "the shell did not render".
window.matchMedia = q => {
  const min = /min-width:\s*(\d+)px/.exec(q)
  return {
    matches: min ? window.innerWidth >= Number(min[1]) : false,
    media: q, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  }
}
window.HTMLElement.prototype.scrollIntoView = () => {}
window.HTMLElement.prototype.hasPointerCapture = () => false
window.HTMLElement.prototype.setPointerCapture = () => {}
window.HTMLElement.prototype.releasePointerCapture = () => {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The fixture is built RELATIVE TO TODAY, never from fixed dates.
//
// Half this app looks forward — the income outlook, the pending rows, the annual
// projection, the settlement lag learned from a fund's own history. Pin the dates
// and those paths quietly stop firing as real time moves past them, which is how a
// crash in the Calendar's annual panel reached a browser with this suite green:
// the old fixture had no dividends at all, so the panel returned null and the
// screen never rendered the line that was broken.
const DAY = 86400000
const isoOf = t => new Date(t).toISOString().slice(0, 10)
const NOW = Date.now()
const ago = n => isoOf(NOW - n * DAY)

// Ex-dates on Thursdays paying Friday, which is the real cadence of these funds.
//
// The Thursday must be old enough that its Friday has ARRIVED. pendingHistoryRows()
// skips a declaration whose pay date is still in the future — correctly, that is
// the outlook's job — so on a Thursday the nearest one pays tomorrow, the newest
// declaration goes missing, and the History assertion for "PENDING" fails. This
// ran green six days a week and red on the seventh.
//
// Note the two calendars: getUTCDay() is UTC while calc.js builds `today` from
// the local date, so the comparison is made in local terms to match the code
// under test rather than the code generating the fixture.
const localToday = (() => {
  const d = new Date()
  const p2 = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
})()
const lastThursday = (() => {
  let t = NOW
  while (new Date(t).getUTCDay() !== 4 || isoOf(t + DAY) > localToday) t -= DAY
  return t
})()
/** A day in whatever month it is today — for fixtures a month-scoped screen reads. */
const thisMonthDay = d => {
  const t = new Date(NOW)
  const p2 = n => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(d)}`
}

const exOn = k => isoOf(lastThursday - k * 7 * DAY)
const payOn = k => isoOf(lastThursday - k * 7 * DAY + DAY)

const HELD = 200 // shares of the income fund
const PER_SHARE = 0.05
const GROSS = +(HELD * PER_SHARE).toFixed(2) // 10.00
const TAX = +(GROSS * 0.3).toFixed(2) // 3.00

// Twelve declarations; the newest is deliberately UNPAID so the pending-payment
// path has something to find. The eleven before it all have a receipt.
const PAID_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

const STATE = {
  instruments: [
    { id: 1, ticker: 'ETCO', name: 'ETCO Bhd', market: 'MY', currency: 'MYR', yahoo_symbol: '5279.KL' },
    { id: 2, ticker: 'AAPL', name: 'Apple', market: 'US', currency: 'USD', yahoo_symbol: 'AAPL' },
    { id: 3, ticker: 'INCM', name: 'Example Option Income ETF', market: 'US', currency: 'USD', yahoo_symbol: 'INCM' },
  ],
  transactions: [
    { id: 2, ticker: 'AAPL', side: 'BUY', qty: 5, price: 210, fees: 1.2, amount: null, trade_date: ago(120), source: 'api' },
    { id: 1, ticker: 'ETCO', side: 'BUY', qty: 1000, price: 0.6, fees: 8, amount: null, trade_date: ago(160), source: 'manual' },
    { id: 3, ticker: 'INCM', side: 'BUY', qty: HELD, price: 20, fees: 2, amount: null, trade_date: ago(100), source: 'api' },
    ...PAID_WEEKS.map((k, i) => ({
      id: 100 + i, ticker: 'INCM', side: 'DIV', qty: 0, price: 0, fees: 0,
      amount: GROSS, trade_date: payOn(k), source: 'api', ext_id: `moomoo:cf:${1000 + i}`,
    })),
  ],
  cash: [
    { id: 1, type: 'DEPOSIT', currency: 'MYR', amount: 2000, date: ago(170), source: 'manual' },
    // Withholding, attributed to its holding exactly as the sync writes it.
    ...PAID_WEEKS.map((k, i) => ({
      id: 200 + i, type: 'FEE', currency: 'USD', amount: TAX, date: payOn(k),
      source: 'api', ext_id: `moomoo:cf:${2000 + i}`, instrument_id: 3,
    })),
  ],
  prices: [
    { instrument_id: 1, price: 0.72, ticker: 'ETCO' },
    { instrument_id: 2, price: 231, ticker: 'AAPL' },
    { instrument_id: 3, price: 18.4, ticker: 'INCM' },
  ],
  fundMetrics: [
    {
      instrument_id: 3, ticker: 'INCM', currency: 'USD', aum: 384000000, nav: 17.95,
      outstanding_units: 9050000, dividend_yield: 85.4, premium: 2.51, asset_class: null,
      fetched_at: new Date(NOW - 3600000).toISOString(),
    },
  ],
  // Twelve weekly declarations, newest first, the newest still unpaid.
  distributions: Array.from({ length: 12 }, (_, i) => ({
    ticker: 'INCM', ex_date: exOn(i), per_share: +(PER_SHARE * (1 + i * 0.04)).toFixed(5),
  })),
  goals: [
    { id: 1, ticker: 'ETCO', currency: 'MYR', target_qty: 5000, monthly_budget: 500 },
    { id: 2, ticker: 'INCM', currency: 'USD', target_income: 400, monthly_budget: 300 },
    // A balance goal, so the third card kind cannot rot unnoticed. ASB below
    // holds 4,576 — 1,000 in, 12 of fees, 3,588 declared — so this renders a
    // partly-filled bar rather than 0% or 100%, either of which would pass while
    // the arithmetic was broken.
    { id: 3, kind: 'ASSET_BALANCE', asset_id: 1, asset_name: 'ASB', asset_slug: 'asb',
      target_amount: 100000, monthly_budget: 1000 },
  ],
  // Three points, not two, and only the last two carry the owned side. That is
  // the shape the real table has — columns added partway through a history — and
  // it is what proves equitySeries() leaves `net` null where nothing was recorded
  // instead of drawing a dive to zero on the day the feature shipped.
  // Pinned to the FIRST DAYS OF THE CURRENT MONTH, not ago(n). The Expenses
  // screen opens on the current month, and ago(1)/ago(2) fall into the previous
  // one for the first days of every month — the screen would then render its
  // empty state and the assertion below would fail on about a tenth of all days.
  expenses: [
    { id: 1, date: thisMonthDay(1), amount: 186.4, currency: 'MYR', category: 'GROCERIES', note: 'Jaya Grocer', asset_id: null, source: 'manual' },
    { id: 2, date: thisMonthDay(2), amount: 60, currency: 'MYR', category: 'FUEL', note: '', asset_id: null, source: 'manual' },
    { id: 3, date: thisMonthDay(3), amount: 38.9, currency: 'MYR', category: 'MEALS_OUT', note: 'lunch', asset_id: null, source: 'manual' },
  ],
  // What the broker last said it holds. ETCO and AAPL agree with the ledger;
  // INCM is ten short, so exactly one drift row must render on Positions.
  brokerPositions: [
    { instrument_id: 1, ticker: 'ETCO', qty: 1000, avg_cost: 0.6, fetched_at: ago(0) },
    { instrument_id: 2, ticker: 'AAPL', qty: 5, avg_cost: 210, fetched_at: ago(0) },
    { instrument_id: 3, ticker: 'INCM', qty: 210, avg_cost: 20, fetched_at: ago(0) },
  ],
  snapshots: [
    { date: ago(3), value_rm: 4800, cash_rm: 300, assets_rm: null, liabilities_rm: null },
    { date: ago(2), value_rm: 5000, cash_rm: 300, assets_rm: 7073.3, liabilities_rm: 60000 },
    { date: ago(1), value_rm: 5200, cash_rm: 300, assets_rm: 7073.3, liabilities_rm: 59500 },
  ],
  // Holdings outside moomoo. Two rate bases on purpose — MIN_MONTHLY (ASB,
  // Tabung Haji) and MADB (EPF) render different card copy, and a fixture with
  // only one would let the other rot unnoticed.
  assets: [
    { id: 1, kind: 'SAVINGS', name: 'ASB', slug: 'asb', currency: 'MYR', institution: 'ASNB',
      account_ref: '', unit_label: 'units', unit_cap: 300000, fiscal_year: '12-31',
      rate_basis: 'MIN_MONTHLY', rate_quote: 'SEN_PER_UNIT', last_rate: 5.2, last_bonus: 0.55,
      sort_order: 1, archived: false, created_at: ago(400) },
    { id: 2, kind: 'SAVINGS', name: 'Tabung Haji', slug: 'tabung-haji', currency: 'MYR',
      institution: 'Lembaga Tabung Haji', account_ref: '', unit_label: '', unit_cap: null,
      fiscal_year: '12-31', rate_basis: 'MIN_MONTHLY', rate_quote: 'PERCENT', last_rate: 3.5,
      last_bonus: null, sort_order: 2, archived: false, created_at: ago(400) },
    // A configured account with NO entries, so the setup path is covered as well
    // as the card path — the two render completely differently and one used to
    // be a wall of zeros pretending to be data.
    { id: 4, kind: 'SAVINGS', name: 'ASN Imbang', slug: 'asn-imbang', currency: 'MYR',
      institution: 'ASNB', account_ref: '', unit_label: '', unit_cap: null,
      fiscal_year: '12-31', rate_basis: 'MIN_MONTHLY', rate_quote: 'PERCENT', last_rate: null,
      last_bonus: null, sort_order: 4, archived: false, created_at: ago(10) },
    // LOCKED, so the reach split is exercised. Every other account here leaves
    // `liquidity` absent on purpose — that is the shape of a row written before
    // the column existed, and assetRows() has to read it as SAVINGS.
    { id: 3, liquidity: 'LOCKED', kind: 'SAVINGS', name: 'EPF', slug: 'epf', currency: 'MYR', institution: 'KWSP',
      account_ref: '', unit_label: '', unit_cap: null, fiscal_year: '12-31',
      rate_basis: 'MADB', rate_quote: 'PERCENT', last_rate: 6.15, last_bonus: null,
      sort_order: 3, archived: false, created_at: ago(400) },
  ],
  // Every entry type, so the sign handling and the badges all get exercised.
  assetEntries: [
    { id: 1, asset_id: 1, slug: 'asb', type: 'DEPOSIT', date: ago(4), amount: 1000, note: '', source: 'manual', ext_id: null },
    // Hand-entered from an EPF statement now that no payslip writes one. It must
    // stay a 'payroll' deposit: net pay is already short of it, so the money
    // calendar and spendingFor() both have to leave it out — see the savedRM
    // assertion in the spending block.
    { id: 2, asset_id: 3, slug: 'epf', type: 'DEPOSIT', date: ago(7), amount: 1955, note: 'August payslip', source: 'payroll', ext_id: null },
    { id: 3, asset_id: 2, slug: 'tabung-haji', type: 'WITHDRAW', date: ago(30), amount: 200, note: '', source: 'manual', ext_id: null },
    { id: 4, asset_id: 2, slug: 'tabung-haji', type: 'DISTRIBUTION', date: ago(160), amount: 742.3, note: '2025 hibah', source: 'manual', ext_id: null },
    { id: 5, asset_id: 1, slug: 'asb', type: 'FEE', date: ago(200), amount: 12, note: '', source: 'manual', ext_id: null },
    { id: 6, asset_id: 1, slug: 'asb', type: 'DISTRIBUTION', date: ago(240), amount: 3588, note: '2025 · 5.75 sen', source: 'manual', ext_id: null },
  ],
  // What you owe. Start dates are FIXED, not relative: a loan schedule is a
  // function of its start, and drifting dates would change `paid` on every run
  // while the assertions below stayed still. Both are years from maturity, so
  // the monthly figures are stable.
  commitments: [
    { id: 1, kind: 'LOAN', name: 'Myvi', lender: '', currency: 'MYR', due_day: 5, note: '',
      principal: 78000, rate: 3.4, rate_type: 'FLAT', term_months: 84,
      started_on: '2023-03-05', instalment: 1149.57,
      credit_limit: null, balance: null, balance_as_of: null, apr: null,
      min_payment_pct: 5, min_payment_floor: 50, amount: null, every_months: 1,
      active: true, ended_on: null, sort_order: 1 },
    { id: 2, kind: 'LOAN', name: 'House', lender: '', currency: 'MYR', due_day: 1, note: '',
      principal: 420000, rate: 4.1, rate_type: 'REDUCING', term_months: 420,
      started_on: '2021-06-01', instalment: null,
      credit_limit: null, balance: null, balance_as_of: null, apr: null,
      min_payment_pct: 5, min_payment_floor: 50, amount: null, every_months: 1,
      active: true, ended_on: null, sort_order: 2 },
    { id: 3, kind: 'REVOLVING', name: 'CIMB Visa', lender: '', currency: 'MYR', due_day: 18, note: '',
      principal: null, rate: null, rate_type: null, term_months: null, started_on: null, instalment: null,
      credit_limit: 15000, balance: 2340, balance_as_of: ago(4), apr: 18,
      card_count: 2,
      min_payment_pct: 5, min_payment_floor: 50, amount: null, every_months: 1,
      active: true, ended_on: null, sort_order: 3 },
    { id: 4, kind: 'RECURRING', name: 'Rent', lender: '', currency: 'MYR', due_day: 1, note: '',
      principal: null, rate: null, rate_type: null, term_months: null, started_on: null, instalment: null,
      credit_limit: null, balance: null, balance_as_of: null, apr: null,
      min_payment_pct: 5, min_payment_floor: 50, amount: 900, every_months: 1,
      active: true, ended_on: null, sort_order: 4 },
  ],
  commitmentPayments: [],
  // What arrives. The salary event carries a full statutory block so the two
  // column groups are both covered; the freelance ones are dated inside the
  // 3-month window so the average is exercised rather than the fallback.
  incomeSources: [
    // Both carry a payer: the column has always been written by the form and the
    // empty string it used to hold here would have let the row render nothing
    // and still pass.
    { id: 1, kind: 'EMPLOYMENT', name: 'Day job', payer: 'Perdana Systems', currency: 'MYR',
      cadence: 'MONTHLY', pay_day: 25, gross_default: 8500, active: true, started_on: null,
      ended_on: null, sort_order: 1 },
    { id: 2, kind: 'FREELANCE', name: 'Design work', payer: 'Studio Kuala', currency: 'MYR',
      cadence: 'IRREGULAR', pay_day: null, gross_default: null,
      active: true, started_on: null, ended_on: null, sort_order: 2 },
  ],
  incomeEvents: [
    { id: 1, source_id: 1, name: 'Day job', kind: 'EMPLOYMENT', cadence: 'MONTHLY', date: ago(8),
      gross: 8500, epf_employee: 935, socso_employee: 29.75, eis_employee: 11.9, skbbk: 44.65,
      pcb: 609.2, zakat: 0, other_deducted: 0,
      epf_employer: 1020, socso_employer: 104.15, eis_employer: 11.9, note: '', source: 'manual', ext_id: null },
    { id: 2, source_id: 2, name: 'Design work', kind: 'FREELANCE', cadence: 'IRREGULAR', date: ago(5),
      gross: 2400, epf_employee: 0, socso_employee: 0, eis_employee: 0, skbbk: 0, pcb: 0, zakat: 0,
      other_deducted: 0, epf_employer: 0, socso_employer: 0, eis_employer: 0, note: '', source: 'manual', ext_id: null },
    { id: 3, source_id: 2, name: 'Design work', kind: 'FREELANCE', cadence: 'IRREGULAR', date: ago(40),
      gross: 1800, epf_employee: 0, socso_employee: 0, eis_employee: 0, skbbk: 0, pcb: 0, zakat: 0,
      other_deducted: 0, epf_employer: 0, socso_employer: 0, eis_employer: 0, note: '', source: 'manual', ext_id: null },
    { id: 4, source_id: 2, name: 'Design work', kind: 'FREELANCE', cadence: 'IRREGULAR', date: ago(70),
      gross: 1350, epf_employee: 0, socso_employee: 0, eis_employee: 0, skbbk: 0, pcb: 0, zakat: 0,
      other_deducted: 0, epf_employer: 0, socso_employer: 0, eis_employer: 0, note: '', source: 'manual', ext_id: null },
  ],
  funds: [{ currency: 'MYR', cash: 195.04 }, { currency: 'USD', cash: 236.66 }],
  fx: 4.22,
  lastSync: new Date(NOW - 3600000).toISOString(),
}
// A FRESH OBJECT PER CALL, not STATE itself. reload() ends in setState(next),
// and handing React the object it is already holding is a no-op it correctly
// skips — so a block that edits the fixture and reloads would assert against the
// screen it had before. A real server returns parsed JSON, which is never the
// same reference twice; this matches that.
globalThis.fetch = async path => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => (String(path).includes('/api/state') ? { ...STATE } : { ok: true }),
})

const errors = []
const origError = console.error
console.error = (...a) => { errors.push(a.map(String).join(' ')); origError(...a) }

const { createServer } = await import('vite')
const server = await createServer({
  root: new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

try {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ThemeProvider } = await import('next-themes')
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const { VantageProvider } = await server.ssrLoadModule('/src/lib/store.jsx')

  // The institution catalogue is data the form writes straight into the assets
  // table, so it has to satisfy the same CHECK constraints the database does.
  // A typo like '08-30' or 'MIN_MONTLY' would otherwise pass every render and
  // only fail at save, on the one account nobody adds twice.
  {
    const {
      FISCAL_YEARS,
      INSTITUTIONS,
      OTHER,
      estimatedRate,
      lastCompleteYear,
      latestRate,
      rateIsStale,
    } = await server.ssrLoadModule('/src/lib/institutions.js')
    const years = new Set(FISCAL_YEARS.map(y => y.value))
    const seen = new Set()
    let n = 0
    let rated = 0
    let estimated = 0
    const behind = []
    for (const inst of INSTITUTIONS) {
      if (inst.id === OTHER) throw new Error(`institution "${inst.id}" collides with the OTHER sentinel`)
      if (!inst.products.length) throw new Error(`institution "${inst.id}" has no products`)
      for (const p of inst.products) {
        n++
        if (seen.has(p.id)) throw new Error(`duplicate product id "${p.id}"`)
        seen.add(p.id)
        if (!/^[0-9]{2}-[0-9]{2}$/.test(p.fiscal_year)) {
          throw new Error(`${p.id}: fiscal_year "${p.fiscal_year}" fails the assets_fiscal_year_check pattern`)
        }
        if (!years.has(p.fiscal_year)) {
          throw new Error(`${p.id}: fiscal_year "${p.fiscal_year}" is not offered by FISCAL_YEARS, so the form cannot show it`)
        }
        if (!['MIN_MONTHLY', 'MADB'].includes(p.rate_basis)) {
          throw new Error(`${p.id}: rate_basis "${p.rate_basis}" fails assets_rate_basis_check`)
        }
        if (!['PERCENT', 'SEN_PER_UNIT'].includes(p.rate_quote)) {
          throw new Error(`${p.id}: rate_quote "${p.rate_quote}" fails assets_rate_quote_check`)
        }
        if (p.unit_cap != null && !(p.unit_cap > 0)) {
          throw new Error(`${p.id}: unit_cap must be a positive number or null`)
        }
        if (!p.name || !p.label) throw new Error(`${p.id}: needs both a name and a label`)
        // An institution that caps nothing must carry no caps, or the form hides
        // a field that is holding a real value and saves it invisibly.
        if (inst.hasCap === false && p.unit_cap != null) {
          throw new Error(`${p.id}: has a unit_cap, but ${inst.id} caps nothing`)
        }

        // Declared rates are the part that feeds the estimator, so they get the
        // strictest checks. The year test is the one that matters most: it
        // catches a rate invented for a financial year that has not closed yet,
        // which no announcement could exist for.
        const complete = lastCompleteYear(p.fiscal_year)
        const rateYears = new Set()
        for (const r of p.rates || []) {
          if (rateYears.has(r.year)) throw new Error(`${p.id}: two rates for ${r.year}`)
          rateYears.add(r.year)
          if (!(r.rate > 0)) throw new Error(`${p.id} ${r.year}: rate must be a positive number`)
          if (r.bonus != null && !(r.bonus >= 0)) {
            throw new Error(`${p.id} ${r.year}: bonus must be zero or more`)
          }
          if (r.shariah != null && !(r.shariah > 0)) {
            throw new Error(`${p.id} ${r.year}: shariah rate must be a positive number`)
          }
          if (r.year > complete) {
            throw new Error(
              `${p.id}: has a rate for ${r.year}, but that financial year has not closed yet ` +
                `(latest that could be declared: ${complete})`,
            )
          }
        }
        // The estimate is synthetic, so it gets its own guard: it must sit on a
        // year that has NOT been declared, or it would present a made-up number
        // over a real announcement.
        const est = estimatedRate(p)
        if (est) {
          if ((p.rates || []).some(r => r.year === est.year)) {
            throw new Error(`${p.id}: estimated ${est.year} collides with a declared year`)
          }
          if (est.year !== complete + 1) {
            throw new Error(`${p.id}: estimate is for ${est.year}, expected ${complete + 1}`)
          }
          if (!est.estimated || !est.basedOn) throw new Error(`${p.id}: estimate is not marked`)
          estimated++
        }
        if (p.rates?.length) rated++
        if (rateIsStale(p)) behind.push(`${p.id} (newest ${latestRate(p).year}, ${complete} has closed)`)
      }
    }
    console.log(`  catalogue   ${INSTITUTIONS.length} institutions, ${n} accounts, all match the DB constraints`)
    console.log(`  rates       ${rated}/${n} accounts carry a declared-rate history`)
    console.log(`  estimates   ${estimated}/${n} accounts are mid-year, carrying last year forward`)
    // Not a failure: a year closing is normal and the form says so in the UI.
    // Printing it is the nudge to refresh the file.
    if (behind.length) console.log(`  NOTE        rate history is behind for: ${behind.join(', ')}`)
  }

  const root = createRoot(document.getElementById('root'))
  await act(async () => {
    root.render(
      React.createElement(
        ThemeProvider,
        { attribute: 'class', defaultTheme: 'dark', storageKey: 'vantage.theme', enableSystem: true },
        React.createElement(VantageProvider, null, React.createElement(App)),
      ),
    )
  })
  await act(async () => { await new Promise(r => setTimeout(r, 60)) })

  const text = document.body.textContent
  const html = document.body.innerHTML
  const need = ['Vantage', 'personal finance', 'Prices', 'Dashboard', 'Portfolio', 'History', 'Calendar', 'Goals', 'Assets', 'Money']
  for (const n of need) if (!text.includes(n)) throw new Error(`shell is missing "${n}"`)
  if (!text.includes('OpenD sync')) throw new Error('last-sync line missing')
  if (!html.includes('data-state="active"')) throw new Error('no active tab')

  // re-render with a probe so we can drive the store directly
  const { useVantage } = await server.ssrLoadModule('/src/lib/store.jsx')
  let ctl = null
  function Probe() { ctl = useVantage(); return null }
  const tick = async fn => {
    await act(async () => { if (fn) fn() })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
  }
  await tick(() =>
    root.render(
      React.createElement(
        ThemeProvider,
        { attribute: 'class', defaultTheme: 'dark', storageKey: 'vantage.theme', enableSystem: true },
        React.createElement(VantageProvider, null, React.createElement(App), React.createElement(Probe)),
      ),
    ),
  )

  // every screen must mount and render something
  const SCREENS = ['dashboard', 'portfolio', 'history', 'calendar', 'goals', 'assets',
    'overview', 'income', 'commitments', 'cards', 'loans', 'expenses', 'settings']
  for (const id of SCREENS) {
    await tick(() => ctl.setTab(id))
    const panes = document.querySelectorAll('[data-slot="tabs-content"][data-state="active"]')
    if (panes.length !== 1) throw new Error(`${id}: expected 1 active tab panel, saw ${panes.length}`)
    if (!panes[0].textContent.trim() && !panes[0].querySelector('svg, table, canvas'))
      throw new Error(`${id}: screen rendered nothing`)
    console.log(`  ${id.padEnd(10)} ok (${panes[0].textContent.trim().slice(0, 48) || '<graphical>'})`)
  }
  await tick(() => ctl.setTab('dashboard'))

  /* ── what an import would do, before anything is written ─────────────────── */
  {
    const { previewStatementImport } = await server.ssrLoadModule('/src/lib/calc.js')
    const rules = [
      { pattern: 'SETEL', action: 'EXPENSE', category: 'FUEL' },
      { pattern: 'SETEL FUEL PASSTHROUGH KL', action: 'EXPENSE', category: 'PARKING' },
      { pattern: 'MY TNB', action: 'COMMITMENT', commitment_id: 4, commitment_name: 'Electricity' },
      { pattern: 'PAYMENT', action: 'IGNORE', category: null },
    ]
    const rows = [
      { kind: 'retail', description: 'SETEL FUEL PASSTHROUGH', amount: 60 },
      { kind: 'retail', description: 'SETEL FUEL PASSTHROUGH', amount: 42.07 },
      { kind: 'retail', description: 'SETEL FUEL PASSTHROUGH KL', amount: 10 },
      { kind: 'retail', description: 'MY TNB-EC', amount: 61 },
      { kind: 'retail', description: 'NSK SELAYANG', amount: 377.35 },
      { kind: 'retail', description: 'GATEWAY XYZ', amount: 12.5 },
      { kind: 'retail', description: 'GATEWAY XYZ', amount: 7.5 },
      // FPX is a rail, not a payee. This descriptor names a real merchant behind
      // it and must stay answerable rather than being filed as unnameable.
      { kind: 'retail', description: 'FPX-XOX COM SDN BHD', amount: 41.35 },
      { kind: 'instalment', description: 'EZYPAY PLUS 3/12', amount: 400 },
      { kind: 'credit', description: 'PAYMENT - THANK YOU', amount: 1375.33 },
      { kind: 'retail', description: 'CASH OUT', amount: 500, spending_candidate: false },
    ]
    const v = previewStatementImport(rows, rules)

    // A plan's billing is not a purchase.
    if (v.instalments.rows !== 1 || v.instalments.rm !== 400)
      throw new Error('import preview: an instalment line was treated as spending')

    // The credit and the cash-out, taken out BEFORE any rule is consulted —
    // which is why the IGNORE rule on 'PAYMENT' never has to fire for the credit.
    if (v.notSpending.rows !== 2 || v.notSpending.rm !== 1875.33)
      throw new Error(`import preview: notSpending is ${v.notSpending.rows}/${v.notSpending.rm}`)

    // Longest pattern wins: the KL row goes to PARKING, not to the FUEL rule
    // that also matches its prefix.
    if (v.known.length !== 2) throw new Error(`import preview: ${v.known.length} known groups`)
    if (v.known[0].pattern !== 'SETEL' || v.known[0].rows !== 2 || v.known[0].total !== 102.07)
      throw new Error('import preview: the general fuel rule did not group its two rows')
    if (v.known[1].pattern !== 'SETEL FUEL PASSTHROUGH KL' || v.known[1].category !== 'PARKING')
      throw new Error('import preview: the specific rule lost to the general one')

    // Already counted on Money — recorded as seen, booked as nothing.
    if (v.asCommitment.length !== 1 || v.asCommitment[0].as !== 'Electricity')
      throw new Error('import preview: a commitment row would have been double-counted')

    // Undecided, biggest gap in the log first — and a gateway descriptor is NOT
    // among them. The two ask different questions: one wants a category, the
    // other names an intermediary and cannot be given one from the statement.
    if (v.undecided.length !== 2 || v.undecided[0].description !== 'NSK SELAYANG')
      throw new Error('import preview: undecided merchants are not worst-first')
    if (v.undecided[1].description !== 'FPX-XOX COM SDN BHD')
      throw new Error('import preview: an FPX row naming a merchant was filed as unnameable')
    if (v.unnamed.length !== 1 || v.unnamed[0].rows !== 2 || v.unnamed[0].total !== 20)
      throw new Error('import preview: the gateway rows were not split out and summed')

    // One entry per plan, not per line.
    if (v.plans.length !== 1 || v.plans[0].rm !== 400)
      throw new Error('import preview: instalment lines did not group into one plan')

    console.log(
      `  import     preview ok (${v.known.length} known, ${v.undecided.length} to decide, ` +
        `${v.unnamed.length} unnameable)`,
    )
  }


  // The screens above only have to render SOMETHING, which a fixture with no
  // income satisfies while every forward-looking surface silently returns null.
  // These name the surfaces that must actually be on screen.
  const surfaces = [
    // The strip is the one figure on the Dashboard that adds broker and accounts
    // together. Asserted by its wording rather than its value: the broker half
    // moves with every fixture edit, and a total pinned here would break for
    // reasons that have nothing to do with totalOwned(). The arithmetic itself is
    // covered on the assets screen below, where both sides are fixture-controlled.
    ['dashboard', ['Income this month', 'Received to date', 'Net worth', 'excluding property & vehicle',
      // owned - owed, both derived. The debt bar is drawn to the same scale as
      // the assets bar, so owing more than you own is visible rather than
      // normalised away.
      'the loans are counted, the things they bought are not']],
    // One screen where there were three. The four figures are the frame, not a
    // tab, so they have to be on screen before anything is clicked.
    ['portfolio', ['Portfolio value', 'Unrealised P&L', 'Net income', 'Wallet',
      'Holdings', 'Ledger',
      // The holdings table's combined columns. 'Price / cost' in one header is
      // the merge itself — two columns became one and the header says so.
      'Price / cost', 'Value / units',
      'a missing quote must never read as a wipe-out',
      // The drift card became a chip. 'DRIFT' is the badge, the sentence after
      // it is what the card used to spend four lines saying.
      'INCM', 'DRIFT', 'more than your transactions account for']],
    // Provenance on two axes: 'moomoo' says which world a row is from, 'SYNCED'
    // says the sync wrote it rather than a person. A row can be moomoo and NOT
    // synced, so neither badge can stand in for the other.
    ['history', ['PENDING', 'moomoo', 'SYNCED', 'Savings', 'Income', 'What']],
    // The allocation scope chips, on the screen that owns them.
    ['dashboard', ['Allocation', 'Everything', 'Outside']],
    // The money layer. The fixture's salary lands on the 25th and the loans on
    // the 1st and 5th, so a grid with no money marks means moneyByDay() stopped
    // producing them. 'across the month' is the in/out/net line.
    // 'Not on the grid' is deliberately NOT asserted: it renders only when the
    // month has money with no date on it, and the fixture's irregular source
    // lands on ago(5). For most of a month that is the previous month and the
    // note appears; in the first days of one it lands in THIS month, moneyMonthNotes()
    // correctly suppresses the averaged line beside the real payment, and the
    // string vanishes. Asserting it made the suite fail on the 1st through the 5th
    // — the same date-dependence a888f22 took out of the Thursday case.
    ['calendar', ['Annual income', 'Income by month', 'across the month']],
    // Balances are derived, so these are the arithmetic on screen rather than
    // anything the fixture states: ASB 1000 - 12 + 3588, TH 742.30 - 200,
    // EPF 1955. A regression in assetBalance() shows up here as a wrong string.
    ['assets', ['Outside moomoo', 'RM 7,073.30', 'RM 4,576.00', 'RM 542.30', 'average of monthly minimums', 'aggregate daily balance',
      // The estimator, both bases. 'average monthly minimum' is the MIN_MONTHLY
      // wording and 'weighted balance' the MADB one, so a card silently losing
      // its basis-specific copy fails here rather than looking plausible.
      'Distribution on track for', 'average monthly minimum', 'weighted balance',
      'A deposit never lifts the month it lands in', 'months are settled',
      // The empty account must appear as setup, NOT as a card of zeros.
      'Set up, nothing entered', 'ASN Imbang', 'Add the opening balance']],
    // Derived, never stated: 1149.57 + 1884.93 (solved from 420000 @ 4.1% over
    // 420mo) + 900 + 117 (5% of 2340). The flat->effective conversion is the
    // Seventh Schedule closed form, so 3.4% flat must read 6.3% real.
    // All derived, none stated. Net 6,869.50 is 8,500 less the DEDUCTED group
    // only — if employer EPF ever leaked into it the figure would drop by
    // 1,020 and this fails. Freelance 1,850 is (2400+1800+1350)/3. Income
    // 8,719.50, less commitments 4,051.50, is uncommitted 4,668.00; less the
    // fixture's 1,800 of goal budgets — 500 shares, 300 income, 1,000 balance —
    // unclaimed 2,868.00. A balance goal claims from the same pool as the other
    // two, and this figure is what proves it.
    // Income and Commitments fold away by default, so their row detail is
    // asserted separately below — what has to be here is the run rate and the
    // two section heads it is summarised into.
    // The spending half is asserted here rather than on a tab of its own, which
    // is the point of the merge: one screen carries the statement AND the log it
    // measures. That half totals 186.40 + 60.00 + 38.90 across two groups —
    // 'Food' and 'Transport' prove the group layer resolved from the stored
    // categories, 'Groceries' that the leaf survives into the log, 'Every entry'
    // that the list rendered rather than only the summary. The wallet prompt
    // proves the month cannot be closed without a reading — the fixture has no
    // wallet — and 'Set a target' that an unset target is a state rather than an
    // invented figure.
    // Six screens where there was one (money-redesign-plan.md §3). Each is
    // asserted on something only it can render, so a screen quietly rendering
    // another's content fails here rather than looking plausible.
    ['overview', ['Run-rate figures say a month, never this month', 'What happened to the money',
      'The other question', 'Net income', '= Uncommitted', 'RM 4,668.00', 'waterfall', 'flow']],
    ['income', ['Net, a month', 'Of that, firm', 'Of that, estimated', 'Sources',
      'RM 8,719.50', 'a salary is a floor'.replace('a s', 'A s')]],
    ['commitments', ['Committed run rate', 'Falling in', 'Commitments', 'All', 'Recurring',
      'RM 4,051.50']],
    // 'never added' is the anti-summing rule on screen: what is free is stated
    // per account and no figure here totals it, while what is committed and
    // what leaves are summed because those genuinely add. 'Carrying' with no
    // badge beside it is the fixture's own state — a balance reading and no
    // bill proves nothing either way.
    ['cards', ['Committed across every card', 'Due in the next 30 days', 'Actually available',
      'Due next', 'Carrying', 'never added']],
    ['loans', ['Instalments, a month', 'Of that, spent', 'Of that, kept', 'Outstanding']],
    ['expenses', ['Spending · what was actually spent', 'RM 285.30 logged',
      'Logged spend · 12 months', 'Set a target', 'Day by day', 'By group', 'Food',
      'Transport', 'Groceries', 'Every entry', 'Jaya Grocer']],
    // The payoff: goal budgets checked against real uncommitted cash. RM 1,800
    // is the fixture's three budgets; RM 4,668.00 is income less commitments,
    // both derived. 'all funded' proves the allocation ran rather than the card
    // just rendering a total.
    // The colour theme lives in localStorage, not the server, so there is no
    // state key to assert — these prove the controls exist and are reachable.
    ['settings', ['Appearance', 'Match my system', 'The colours, not the layout']],
    // 'in ASB' is the balance card's title; 'asb' its source tag. Both together
    // prove the card was picked, not just that the account name appears somewhere.
    // 'in ASB' is the balance card's title, 'asb' its source tag — both together
    // prove the card was picked, not just that the name appears somewhere. The
    // RM 1,800.00 claimed is 500 + 300 + the balance goal's own 1,000, so this
    // also catches a balance goal being dropped from the funding waterfall.
    ['goals', ['moomoo', 'Claimed each month', 'all funded', 'RM 1,800.00', 'in ASB', 'asb']],
  ]
  for (const [id, needed] of surfaces) {
    await tick(() => ctl.setTab(id))
    const pane = document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent
    for (const n of needed) {
      if (!pane.includes(n)) throw new Error(`${id}: income surface missing "${n}"`)
    }
    console.log(`  ${id.padEnd(10)} income surfaces ok (${needed.length})`)
  }
  await tick(() => ctl.setTab('dashboard'))

  /* ── a source row's two totals, its payer, and a foreign source's twin ──── */
  //
  // Driven through the mounted app rather than through incomeRows() alone,
  // because none of this was ever a derivation gap: `deducted`, `onTop`, `payer`
  // and `fxDated` were all computed or stored, and not one of the four reached a
  // screen. A unit test of calc.js would have passed the whole time.
  {
    const { deductionsOf, netOf } = await server.ssrLoadModule('/src/lib/calc.js')
    const { fmt } = await server.ssrLoadModule('/src/lib/format.js')
    const incomePane = async () => {
      await tick(() => ctl.setTab('income'))
      return document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent
    }

    // Derived from the fixture's own payslip, never stated here — the six lines
    // are already on the page and their sum is what turns gross into net.
    const slip = STATE.incomeEvents.find(e => e.source_id === 1)
    const d = deductionsOf(slip)
    // The fixture has to be able to tell a total from a line, or a row wired to
    // one field would print a plausible figure under a bold label and pass.
    for (const k of ['epf_employee', 'pcb', 'epf_employer']) {
      if (Math.abs(d.deducted - slip[k]) < 0.005 || Math.abs(d.onTop - slip[k]) < 0.005) {
        throw new Error(`income: fixture cannot distinguish a total from ${k}`)
      }
    }

    let pane = await incomePane()
    if (!pane.includes(`−${fmt(d.deducted, 'MYR')}`)) {
      throw new Error(`income: no total deducted — expected −${fmt(d.deducted, 'MYR')}`)
    }
    if (!pane.includes(fmt(d.onTop, 'MYR'))) {
      throw new Error(`income: no employer total — expected ${fmt(d.onTop, 'MYR')}`)
    }
    // Signed one way only. The employer group is not a subtraction from your pay
    // and must not be drawn as one.
    if (pane.includes(`−${fmt(d.onTop, 'MYR')}`)) {
      throw new Error('income: what the employer paid on top is not money taken off you')
    }

    for (const src of STATE.incomeSources) {
      if (!pane.includes(src.payer)) {
        throw new Error(`income: "${src.payer}" is stored on ${src.name} and shown nowhere`)
      }
    }

    // Two ringgit sources print one currency. Whatever the foreign half renders
    // below, it has to be the source's doing and not something the page always
    // draws.
    if (pane.includes('$')) throw new Error('income: an all-MYR page must print no second figure')

    /* A source paid in dollars — creatable only through the API until this slice,
     * and shown as one figure or none once it existed.
     *
     * BUILT BY SWAPPING STATE AND RELOADING, not by putting a USD source in the
     * fixture: it would move `RM 8,719.50`, `RM 4,668.00` and every figure the
     * waterfall feeds, and this block would be paid for in unrelated churn. */
    const srcs = STATE.incomeSources
    const evs = STATE.incomeEvents
    const usdSource = { id: 3, kind: 'FREELANCE', name: 'Overseas retainer',
      payer: 'Northwind LLC', currency: 'USD', cadence: 'MONTHLY', pay_day: 15,
      gross_default: null, active: true, started_on: null, ended_on: null, sort_order: 3 }
    // Something is withheld, so net differs from gross — otherwise the twin
    // figure and the `last ... gross` already on the meta line are the same
    // string and either one would satisfy the assertion.
    const usdEvent = { id: 5, source_id: 3, name: 'Overseas retainer', kind: 'FREELANCE',
      cadence: 'MONTHLY', date: ago(9), gross: 400, epf_employee: 0, socso_employee: 0,
      eis_employee: 0, skbbk: 0, pcb: 0, zakat: 0, other_deducted: 25, epf_employer: 0,
      socso_employer: 0, eis_employer: 0, note: '', source: 'manual', ext_id: null,
      fx_rate: 4.35, fx_date: ago(10) }
    const net = netOf(usdEvent)

    const withUsd = async ev => {
      STATE.incomeSources = [...srcs, usdSource]
      STATE.incomeEvents = [ev, ...evs]
      await act(async () => { await ctl.reload() })
      return incomePane()
    }

    // Both figures kept, which is what the record-payment sheet has always
    // promised, and the ringgit one at the STORED rate rather than the global
    // one — 4.35 against 4.22, so a screen reaching for S.fx fails here.
    pane = await withUsd(usdEvent)
    if (!pane.includes(fmt(net, 'USD'))) {
      throw new Error(`income: a foreign source hides what arrived — expected ${fmt(net, 'USD')}`)
    }
    if (!pane.includes(fmt(net * usdEvent.fx_rate, 'MYR'))) {
      throw new Error(`income: expected ${fmt(net * usdEvent.fx_rate, 'MYR')} at the stored rate`)
    }
    if (!pane.includes('at the rate on the day it landed')) {
      throw new Error('income: a dated conversion has to say the figure is fixed')
    }

    // The same payment with no rate stored. It converts at the global one and
    // the row must stop claiming a day it does not have.
    pane = await withUsd({ ...usdEvent, fx_rate: null, fx_date: null })
    if (!pane.includes(fmt(net * STATE.fx, 'MYR'))) {
      throw new Error(`income: expected ${fmt(net * STATE.fx, 'MYR')} at the global rate`)
    }
    if (pane.includes('at the rate on the day it landed')) {
      throw new Error('income: an undated conversion must not claim a day')
    }
    if (!pane.includes('at today’s rate')) {
      throw new Error('income: an undated conversion must say the figure still moves')
    }

    /* AN IRREGULAR SOURCE HAS NO SINGLE DAY BEHIND ITS RINGGIT FIGURE.
     *
     * Its mean is of several payments, each converted on its own day, so the two
     * figures on the row are not one rate apart and a row claiming they are
     * states a relationship the reader cannot check against either of them. Two
     * events at different stored rates is the only fixture that can tell the two
     * phrasings apart — with one event the mean IS the payment and the wrong
     * copy passes. */
    const irregular = { ...usdSource, id: 4, name: 'Overseas invoices', cadence: 'IRREGULAR', pay_day: null }
    const recent = { ...usdEvent, id: 6, source_id: 4, name: 'Overseas invoices', cadence: 'IRREGULAR' }
    const earlier = { ...usdEvent, id: 7, source_id: 4, name: 'Overseas invoices', cadence: 'IRREGULAR',
      date: ago(40), gross: 320, other_deducted: 20, fx_rate: 4.1, fx_date: ago(41) }
    const withSource = async (source, events) => {
      STATE.incomeSources = [...srcs, source]
      STATE.incomeEvents = [...events, ...evs]
      await act(async () => { await ctl.reload() })
      return incomePane()
    }

    const meanUSD = (netOf(recent) + netOf(earlier)) / 3
    const meanRM = (netOf(recent) * recent.fx_rate + netOf(earlier) * earlier.fx_rate) / 3
    // The fixture has to be one no single rate explains, or the assertion below
    // proves nothing about the copy.
    for (const rate of [recent.fx_rate, earlier.fx_rate, STATE.fx]) {
      if (Math.abs(meanRM - meanUSD * rate) < 0.005) {
        throw new Error(`income: a mean explained by ${rate} cannot test the mean's own wording`)
      }
    }
    pane = await withSource(irregular, [recent, earlier])
    if (!pane.includes(fmt(meanUSD, 'USD')) || !pane.includes(fmt(meanRM, 'MYR'))) {
      throw new Error(`income: expected the pair ${fmt(meanUSD, 'USD')} / ${fmt(meanRM, 'MYR')}`)
    }
    if (pane.includes('at the rate on the day it landed')) {
      throw new Error('income: an average has no day, and must not borrow the last payment\'s')
    }
    if (!pane.includes('each payment at the rate on its own day')) {
      throw new Error('income: an average must say the rates are per payment')
    }

    // One of the two carries no rate. Part of the figure is fixed and part of it
    // drifts, and the row may claim neither in full.
    pane = await withSource(irregular, [recent, { ...earlier, fx_rate: null, fx_date: null }])
    if (!pane.includes('where a payment carried none')) {
      throw new Error('income: a part-dated average must say which part still moves')
    }

    // NOTHING IN THE WINDOW. `every` on an empty list is true, which used to make
    // fxDated true with no payment behind it — a dated conversion of RM 0.00.
    // There is no figure to twin, so the row says nothing about a rate at all.
    pane = await withSource(irregular, [{ ...earlier, date: ago(400) }])
    for (const claim of ['at the rate on the day it landed', 'on its own day', 'at today’s rate']) {
      if (pane.includes(claim)) {
        throw new Error(`income: a source with no payment in the window claimed "${claim}"`)
      }
    }

    STATE.incomeSources = srcs
    STATE.incomeEvents = evs
    await act(async () => { await ctl.reload() })
    console.log(`  income row −${fmt(d.deducted, 'MYR')} deducted, ${fmt(d.onTop, 'MYR')} on top, `
      + `${fmt(net, 'USD')} twinned at ${usdEvent.fx_rate} not ${STATE.fx}`)
    console.log(`  income row a 3-month mean of two rates prints ${fmt(meanRM, 'MYR')}, claiming no single day`)
  }
  await tick(() => ctl.setTab('dashboard'))

  /* ── a foreign payment is converted before it is handed to a screen ─────── */
  //
  // FOUR CALLERS, ONE MISTAKE. Every one of these prints or sums its figure as
  // ringgit — the calendar grid with fmt(x,'MYR'), the note beneath it, a PAY row
  // that declares `currency: 'MYR'`, and spendingFor(), where the figure is not
  // labelled at all but reconciled against a wallet delta so the error lands in
  // `spentRM`. Asserted together because they failed together: netOf() returns
  // the source's own currency and each of the four added it raw.
  {
    const { moneyByDay, moneyMonthNotes, historyRows, spendingFor, netOf } =
      await server.ssrLoadModule('/src/lib/calc.js')
    const S = JSON.parse(JSON.stringify(STATE))
    // A wallet with two readings, so spendingFor() computes rather than refusing.
    S.assets.push({ id: 99, name: 'MAE', slug: 'mae', currency: 'MYR', liquidity: 'WALLET',
      kind: 'SAVINGS', archived: false, rate_basis: 'NONE', fiscal_year: '12-31', created_at: '2026-01-01' })
    S.assetEntries.unshift(
      { id: 990, asset_id: 99, type: 'BALANCE', date: '2026-01-01', amount: 5000, source: 'manual' },
      { id: 991, asset_id: 99, type: 'BALANCE', date: '2026-01-31', amount: 5600, source: 'manual' })
    const before = spendingFor(JSON.parse(JSON.stringify(S)), 2026, 0, '2026-02-01')

    S.incomeSources.push({ id: 5, kind: 'FREELANCE', name: 'Overseas invoices', payer: 'Northwind LLC',
      currency: 'USD', cadence: 'IRREGULAR', pay_day: null, gross_default: null,
      active: true, started_on: null, ended_on: null, sort_order: 5 })
    const ev = { id: 9, source_id: 5, name: 'Overseas invoices', kind: 'FREELANCE', cadence: 'IRREGULAR',
      date: '2026-01-09', gross: 400, epf_employee: 0, socso_employee: 0, eis_employee: 0, skbbk: 0,
      pcb: 0, zakat: 0, other_deducted: 25, epf_employer: 0, socso_employer: 0, eis_employer: 0,
      note: '', source: 'manual', ext_id: null, fx_rate: 4.35, fx_date: '2026-01-09' }
    S.incomeEvents.unshift(ev)
    const usd = netOf(ev)
    const rm = usd * ev.fx_rate
    if (Math.abs(rm - usd) < 1) throw new Error('income fx: a rate of 1 cannot test a conversion')

    const grid = moneyByDay(S, 2026, 0, '2026-02-01')
    const cell = (grid[9] || []).find(x => x.key === `ie${ev.id}`)
    if (!cell) throw new Error('income fx: the payment is not on the calendar grid at all')
    if (Math.abs(cell.amount - rm) > 0.005) {
      throw new Error(`income fx: the grid prints ${cell.amount} as RM, expected ${rm}`)
    }

    const note = moneyMonthNotes(S, 2026, 1, '2026-02-20').find(n => n.label === 'Overseas invoices')
    if (!note) throw new Error('income fx: an irregular source with no dated payment must still be noted')
    if (Math.abs(note.amount - rm / 3) > 0.005) {
      throw new Error(`income fx: the note prints ${note.amount} as RM, expected ${rm / 3}`)
    }

    const pay = historyRows(S).find(r => r.key === `i${ev.id}`)
    if (pay.currency !== 'MYR') throw new Error('income fx: a PAY row that is not MYR needs its own label')
    if (Math.abs(pay.amount - rm) > 0.005) {
      throw new Error(`income fx: History lists ${pay.amount} under an RM label, expected ${rm}`)
    }

    const after = spendingFor(S, 2026, 0, '2026-02-01')
    if (Math.abs(after.inflowRM - (before.inflowRM + rm)) > 0.005) {
      throw new Error(`income fx: inflow moved by ${after.inflowRM - before.inflowRM}, expected ${rm}`)
    }
    // The whole conversion error would otherwise land here, on the one figure
    // nobody can check against a statement.
    if (Math.abs(after.spentRM - (before.spentRM + rm)) > 0.005) {
      throw new Error(`income fx: spending moved by ${after.spentRM - before.spentRM}, expected ${rm}`)
    }
    console.log(`  income fx  USD ${usd.toFixed(2)} reaches four callers as RM ${rm.toFixed(2)}, not RM ${usd.toFixed(2)}`)
  }

  // The equity curve carries a net-worth line wherever the owned side was
  // recorded, and nothing where it was not.
  {
    const { equitySeries } = await server.ssrLoadModule('/src/lib/calc.js')
    const s = equitySeries(STATE)
    if (s.length !== 3) throw new Error(`net worth: expected 3 snapshot points, got ${s.length}`)
    if (s[0].net !== null) throw new Error('net worth: a point with no owned side must be null, not 0')
    // 5200 + 300 broker, + 7073.30 outside, − 59500 owed.
    const want = 5200 + 300 + 7073.3 - 59500
    if (Math.abs(s[2].net - want) > 0.005) throw new Error(`net worth: expected ${want}, got ${s[2].net}`)
    if (s[2].net >= 0) throw new Error('net worth: this fixture owes more than it owns and must read negative')
    console.log(`  net worth  ${s.filter(p => p.net != null).length}/3 points carry net, earliest stays null (${s[2].net.toFixed(2)})`)
  }

  // Declaration axis labels. Asserted on the formatter rather than on rendered
  // ticks: recharts decides how many ticks fit, and a test that depends on that
  // measures the chart library instead of the code.
  {
    const { dfmtAxis, monthYear, dfmtLong } = await server.ssrLoadModule('/src/lib/format.js')

    // A semi-annual payer repeats its months across years — this is the case
    // that was unreadable, with the axis showing "9 Feb … 10 Aug … 9 Feb".
    const a = dfmtAxis('2019-02-09')
    const b = dfmtAxis('2024-02-09')
    if (a === b) throw new Error(`axis: two Februaries five years apart must differ, both read ${a}`)
    if (!/19/.test(a) || !/24/.test(b)) throw new Error(`axis: the year must be in the label, got ${a} / ${b}`)

    // A weekly payer puts several declarations in one month, so the DAY has to
    // survive too — dropping it in favour of the year would just move the
    // ambiguity rather than remove it.
    const c = dfmtAxis('2026-03-05')
    const d = dfmtAxis('2026-03-12')
    if (c === d) throw new Error(`axis: two dates in one month must differ, both read ${c}`)

    // The caption names the span in full years; the ticks abbreviate.
    if (!/2019/.test(monthYear('2019-02-09'))) throw new Error('axis: the caption span wants a full year')
    // And the single-year path still strips it, which is what it was right about.
    if (/\d{4}/.test(dfmtLong('2026-02-09').replace(/\s\d{4}$/, ''))) {
      throw new Error('axis: the single-year label must carry no year at all')
    }

    console.log(`  axis       ${a} vs ${b} distinguishable, ${c} vs ${d} distinguishable`)
  }

  // The words a card row is built from. Asserted on the formatters because the
  // row prints them inside longer strings, and "22nd" reading "22th" is the
  // kind of thing a rendered-text assertion would sail past.
  {
    const { ordinal, dfmtMonth, monthOf, availabilityTone, stateCaption } =
      await server.ssrLoadModule('/src/lib/format.js')
    const want = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th',
      21: '21st', 22: '22nd', 23: '23rd', 31: '31st' }
    for (const [n, s] of Object.entries(want)) {
      if (ordinal(Number(n)) !== s) throw new Error(`ordinal(${n}) read ${ordinal(Number(n))}, not ${s}`)
    }
    if (ordinal(null) !== '—') throw new Error('ordinal: no day recorded must read as a dash')
    if (ordinal(-1) !== 'last day') throw new Error('ordinal: -1 is the last-day convention')
    if (dfmtMonth('2026-07-07') !== '7 July') throw new Error(`dfmtMonth read ${dfmtMonth('2026-07-07')}`)
    if (monthOf('2026-08-26') !== 'August') throw new Error(`monthOf read ${monthOf('2026-08-26')}`)
    const tones = [[null, 'text-faint'], [2.45, 'text-gain'], [60, 'text-cash'], [81.25, 'text-loss']]
    for (const [pct, cls] of tones) {
      if (availabilityTone(pct) !== cls) throw new Error(`availabilityTone(${pct}) read ${availabilityTone(pct)}, not ${cls}`)
    }
    // Number words, and the verb agreeing with them.
    const captions = [
      [stateCaption({ unknownNoPayment: 1 }), 'one account has no payment recorded'],
      [stateCaption({ carrying: 1, settled: 1 }), 'one account carries · one settles in full'],
      [stateCaption({ carrying: 2, late: 1, settled: 3, unknownOneBill: 1, unknownNoBill: 2 }),
        'two accounts carry · one paid late · three settle in full · one has one bill so far · two have no bill yet'],
      [stateCaption({ unknownNoPayment: 1 }, { overdueRM: 5092.49, overdueISO: '2026-08-26' }),
        'one account has no payment recorded · RM 5,092.49 of it fell due on 26 Aug with no payment recorded'],
    ]
    for (const [got, exp] of captions) {
      if (got !== exp) throw new Error(`stateCaption read "${got}", not "${exp}"`)
    }
    console.log(`  card words ${ordinal(22)}, ${dfmtMonth('2026-07-07')}, ${monthOf('2026-08-26')}, captions agree`)
  }

  // The allocation donut, scoped three ways.
  {
    const { allocation, ALLOC_SCOPE } = await server.ssrLoadModule('/src/lib/calc.js')
    const sum = a => a.reduce((s, p) => s + p.value, 0)

    const all = allocation(STATE, ALLOC_SCOPE.ALL)
    const broker = allocation(STATE, ALLOC_SCOPE.BROKER)
    const outside = allocation(STATE, ALLOC_SCOPE.OUTSIDE)

    // The two halves must account for the whole, or a scope is dropping money.
    if (Math.abs(sum(broker) + sum(outside) - sum(all)) > 0.005) {
      throw new Error(`allocation: ${sum(broker)} + ${sum(outside)} != ${sum(all)}`)
    }
    // Every scope's shares are of ITS OWN total — a percentage of an unstated
    // denominator is the easiest way for a chart to mislead.
    for (const [name, a] of [['all', all], ['broker', broker], ['outside', outside]]) {
      if (!a.length) throw new Error(`allocation: ${name} must have slices in this fixture`)
      const shares = a.reduce((s, p) => s + p.share, 0)
      if (Math.abs(shares - 1) > 1e-9) throw new Error(`allocation: ${name} shares sum to ${shares}`)
    }
    // Cash is the broker's, not the accounts'. It is money waiting to be invested.
    if (!broker.some(p => p.name === 'Cash')) throw new Error('allocation: broker scope must carry its cash')
    if (outside.some(p => p.name === 'Cash')) throw new Error('allocation: outside scope must not')
    // And the scopes must not leak into each other.
    if (broker.some(p => p.name.startsWith('EPF'))) throw new Error('allocation: an account leaked into the broker scope')
    if (outside.some(p => p.name === 'ETCO')) throw new Error('allocation: a position leaked into the outside scope')

    console.log(`  allocation ${all.length} slices all / ${broker.length} moomoo / ${outside.length} outside, each summing to 100%`)
  }

  // The broker's own position count, against what the ledger can explain.
  {
    const { brokerDrift } = await server.ssrLoadModule('/src/lib/calc.js')

    const d = brokerDrift(STATE)
    if (d.length !== 1) throw new Error(`drift: expected 1 row from the fixture, got ${d.length}`)
    if (d[0].ticker !== 'INCM' || d[0].kind !== 'short') {
      throw new Error(`drift: expected INCM short, got ${d[0].ticker} ${d[0].kind}`)
    }
    if (Math.abs(d[0].diff - 10) > 1e-9) throw new Error(`drift: expected a gap of 10, got ${d[0].diff}`)

    // A holding the broker reports and no transaction explains — the free-share
    // case that prompted all of this. avg_cost 0 is what marks it as a gift.
    const gift = JSON.parse(JSON.stringify(STATE))
    gift.instruments.push({ id: 9, ticker: 'FREE', name: 'Gift', market: 'US', currency: 'USD' })
    gift.brokerPositions.push({ instrument_id: 9, ticker: 'FREE', qty: 0.0153, avg_cost: 0, fetched_at: ago(0) })
    const g = brokerDrift(gift).find(x => x.ticker === 'FREE')
    if (!g || g.kind !== 'missing') throw new Error(`drift: a broker-only holding must read 'missing', got ${g && g.kind}`)
    if (g.avgCost !== 0) throw new Error('drift: the zero cost is what lets the screen call it a free share')

    // Float residue must NOT be a discrepancy. BITO carries 5.68e-14 in the real
    // database after 36 buys and 2 sells; crying wolf on that would make the
    // whole report ignorable.
    const dust = JSON.parse(JSON.stringify(STATE))
    dust.brokerPositions = [{ instrument_id: 1, ticker: 'ETCO', qty: 1000 + 5.68e-14, avg_cost: 0.6, fetched_at: ago(0) }]
    if (brokerDrift(dust).some(x => x.ticker === 'ETCO')) {
      throw new Error('drift: floating-point residue must not register as a gap')
    }

    // And with no sync ever run, every position would look like a phantom —
    // the report has to stay silent rather than accuse the whole portfolio.
    const fresh = JSON.parse(JSON.stringify(STATE))
    fresh.brokerPositions = []
    if (brokerDrift(fresh).length) throw new Error('drift: an empty broker table must report nothing')

    // Once the ingest has recognised a broker-only holding, the ledger derives it
    // and the gap must close. A BUY at price 0 is the free-share shape, and its
    // percentage has to read 0% rather than Infinity — cost is the divisor.
    const recognised = JSON.parse(JSON.stringify(gift))
    recognised.transactions.unshift({
      id: 9001, ticker: 'FREE', side: 'BUY', qty: 0.0153, price: 0, fees: 0,
      amount: null, trade_date: ago(0), source: 'position', ext_id: 'moomoo:pos:FREE',
    })
    if (brokerDrift(recognised).some(x => x.ticker === 'FREE')) {
      throw new Error('drift: recognising the holding must close the gap it reported')
    }
    const { positionsWithIncome, pnlBasis } = await server.ssrLoadModule('/src/lib/calc.js')
    const free = positionsWithIncome(recognised, pnlBasis(recognised)).find(p => p.t === 'FREE')
    if (!free) throw new Error('drift: the recognised holding must now derive as a position')
    if (!Number.isFinite(free.pctShown) || free.pctShown !== 0) {
      throw new Error(`drift: a zero-cost holding must read 0%, got ${free.pctShown}`)
    }

    console.log(`  drift      ${d.length} gap from the fixture, free-share case detected, residue ignored`)
  }

  /* ── does a plan fit, against what is actually free ──────────────────────── */
  {
    const { planFit, commitmentRows } = await server.ssrLoadModule('/src/lib/calc.js')
    const card = STATE.commitments.find(c => c.kind === 'REVOLVING')
    const row = commitmentRows(STATE).find(r => r.id === card.id)
    if (row.availableRM == null) throw new Error('planFit: the fixture card needs a credit limit')

    // The identity the panel prints: limit − billed − blocked = available.
    const f = planFit(STATE, card.id, 1)
    const derived = f.limit - f.revolving - f.blocked
    if (Math.abs(derived - f.availableRM) > 0.005) {
      throw new Error(`planFit: ${f.limit} − ${f.revolving} − ${f.blocked} = ${derived}, not ${f.availableRM}`)
    }

    // Exactly the room fits; a sen more does not. An off-by-one here is the
    // difference between warning about a plan that fits and clearing one that
    // does not.
    if (!planFit(STATE, card.id, f.availableRM).fits) throw new Error('planFit: exact room must fit')
    if (planFit(STATE, card.id, f.availableRM + 0.01).fits) {
      throw new Error('planFit: a sen over the room must not fit')
    }

    // What the bill implies is never tighter than what is actually free: it is
    // looser by exactly what the instalments are blocking.
    if (Math.abs(f.apparentFree - f.availableRM - f.blocked) > 0.005) {
      throw new Error(`planFit: the gap must be exactly what is blocked — ${f.apparentFree} − ${f.availableRM} ≠ ${f.blocked}`)
    }
    if (planFit(STATE, STATE.commitments.find(c => c.kind === 'LOAN').id, 1) !== null) {
      throw new Error('planFit: a loan has no limit and cannot answer a fit')
    }
    // And now the case the panel exists for. A contracted plan blocks the limit
    // as its PRINCIPAL is repaid, while the bill only ever shows what it has
    // billed — so with a plan running the two figures must diverge, and the
    // statement view must be the looser one. On a local copy: a plan in the
    // shared fixture would move the card figures asserted on four screens above.
    const blocked = JSON.parse(JSON.stringify(STATE))
    blocked.cardPlans = [{
      id: 900, commitment_id: card.id, kind: 'EPP', name: 'Fridge', merchant: 'Senheng',
      amount: 4800, tenure_months: 12, instalment: 400, rate: 0, upfront_fee: 0,
      purchased_on: ago(40), started_on: ago(40), settled_on: null, status: 'ACTIVE',
      category: 'THINGS', note: '', source: 'manual',
    }]
    const g = planFit(blocked, card.id, 1)
    if (!(g.blocked > 0)) throw new Error('planFit: an active plan must block part of the limit')
    if (!(g.apparentFree > g.availableRM + 0.005)) {
      throw new Error(`planFit: with a plan running the bill must look looser — ${g.apparentFree} vs ${g.availableRM}`)
    }
    if (planFit(blocked, card.id, g.apparentFree).fits) {
      throw new Error('planFit: a plan sized to the free room the bill implies must NOT fit — this is the whole point')
    }
    console.log(`  plan fit   ${g.availableRM.toFixed(2)} free vs ${g.apparentFree.toFixed(2)} the bill implies, ${g.blocked.toFixed(2)} blocked`)
  }

  /* ── both sides of a loan, once the thing it bought is tracked ───────────── */
  {
    const { loanEquity, assetsTotal, netWorth } = await server.ssrLoadModule('/src/lib/calc.js')
    const loan = STATE.commitments.find(c => c.kind === 'LOAN')

    // Nothing linked is the common case and must not read as an error.
    if (loanEquity(STATE, loan) !== null) throw new Error('loanEquity: an unlinked loan has no equity')
    if (netWorth(STATE).itemsTracked) throw new Error('itemsTracked must be false with no items')

    // A local copy: an item in the shared fixture would move the net-worth and
    // reachable figures asserted on the Dashboard and Assets screens above.
    const owned = JSON.parse(JSON.stringify(STATE))
    owned.assets.push({
      id: 900, kind: 'ITEM', name: 'The house', slug: 'the-house', currency: 'MYR',
      institution: '', account_ref: '', unit_label: '', unit_cap: null, fiscal_year: '12-31',
      rate_basis: 'NONE', rate_quote: 'PERCENT', last_rate: null, last_bonus: null,
      sort_order: 9, archived: false, created_at: ago(0), product_id: null, liquidity: 'ILLIQUID',
    })
    owned.assetEntries.push({
      id: 9000, asset_id: 900, type: 'BALANCE', date: ago(30), amount: 550000,
      note: '', source: 'manual', ext_id: null,
    })
    owned.commitments = owned.commitments.map(c => (c.id === loan.id ? { ...c, asset_id: 900 } : c))

    const e = loanEquity(owned, owned.commitments.find(c => c.id === loan.id))
    if (!e) throw new Error('loanEquity: a linked loan must produce equity')
    if (Math.abs(e.valueRM - 550000) > 0.005) throw new Error(`loanEquity: value ${e.valueRM}`)
    if (Math.abs(e.equityRM - (e.valueRM - e.owedRM)) > 0.005) {
      throw new Error('loanEquity: equity must be value less what is owed')
    }
    if (e.valuedOn !== ago(30)) throw new Error('loanEquity: the valuation date must survive')

    // The asymmetry closes: net worth rises by exactly the valuation, and the
    // Dashboard's "the things they bought are not counted" line stops being true.
    if (!netWorth(owned).itemsTracked) throw new Error('itemsTracked must follow the data')
    const gain = netWorth(owned).netRM - netWorth(STATE).netRM
    if (Math.abs(gain - 550000) > 0.005) {
      throw new Error(`net worth should rise by the valuation, rose by ${gain}`)
    }

    // And it is NOT money. An item must never reach the reachable total, which is
    // the bug the old `liquidity !== LOCKED` test would have shipped.
    const before = assetsTotal(STATE)
    const after = assetsTotal(owned)
    if (Math.abs(after.reachableRM - before.reachableRM) > 0.005) {
      throw new Error('a house is not money you can reach')
    }
    if (Math.abs(after.lockedRM - before.lockedRM) > 0.005) {
      throw new Error('a house is not locked money either — that bucket answers a different question')
    }
    if (Math.abs(after.illiquidRM - 550000) > 0.005) {
      throw new Error(`illiquidRM should carry the house, got ${after.illiquidRM}`)
    }
    console.log(`  equity     ${e.equityRM.toFixed(2)} on ${e.asset.name}, and none of it reachable`)
  }

  /* ── a charge a card collects leaves on the card's day ───────────────────── */
  {
    const { commitmentRows, commitmentsTotal } = await server.ssrLoadModule('/src/lib/calc.js')
    const card = STATE.commitments.find(c => c.kind === 'REVOLVING')
    const rec = STATE.commitments.find(c => c.kind === 'RECURRING')
    if (!card || !rec) throw new Error('collected: the fixture needs a card and a recurring charge')

    // Unlinked, it leaves on its own day.
    const before = commitmentRows(STATE).find(r => r.id === rec.id)
    if (before.collectedBy !== null) throw new Error('collected: unlinked must be null')
    if (before.leavesOnDay !== (rec.due_day ?? null)) {
      throw new Error(`collected: unlinked leaves on its own day, got ${before.leavesOnDay}`)
    }

    const via = JSON.parse(JSON.stringify(STATE))
    via.commitments = via.commitments.map(c =>
      c.id === rec.id ? { ...c, collected_by_id: card.id } : c)
    const after = commitmentRows(via).find(r => r.id === rec.id)

    if (!after.collectedBy || after.collectedBy.id !== card.id) {
      throw new Error('collected: the collector must be resolved to the card')
    }
    // The date moves to the card's, which is the entire point of the column.
    if (after.leavesOnDay !== card.due_day) {
      throw new Error(`collected: should leave on the card's day ${card.due_day}, got ${after.leavesOnDay}`)
    }

    // And it costs NOTHING extra. Counting a collected charge twice — once as a
    // commitment and again as card spending — is the one error the whole
    // merchant_rules COMMITMENT action exists to prevent, and this column must
    // not reintroduce it through another door.
    const t0 = commitmentsTotal(STATE)
    const t1 = commitmentsTotal(via)
    if (Math.abs(t0.monthlyOutRM - t1.monthlyOutRM) > 0.005) {
      throw new Error(`collecting a charge must not change what a month costs: ${t0.monthlyOutRM} -> ${t1.monthlyOutRM}`)
    }
    if (Math.abs(t0.owedRM - t1.owedRM) > 0.005) {
      throw new Error('collecting a charge must not change what is owed')
    }
    console.log(`  collected  ${rec.name} leaves on the ${after.leavesOnDay} via ${card.name}, costing the same`)
  }

  /* ── the two bases, and that they are two ────────────────────────────────── */
  {
    const { expensesFor } = await server.ssrLoadModule('/src/lib/calc.js')
    const w = JSON.parse(JSON.stringify(STATE))
    const wallet = { id: 950, kind: 'SAVINGS', name: 'Current', slug: 'current', currency: 'MYR',
      institution: '', account_ref: '', unit_label: '', unit_cap: null, fiscal_year: '12-31',
      rate_basis: 'NONE', rate_quote: 'PERCENT', last_rate: null, last_bonus: null,
      sort_order: 9, archived: false, created_at: ago(90), product_id: null, liquidity: 'WALLET' }
    w.assets.push(wallet)
    // Two readings bracketing the month, which is what makes the residual exist.
    // NEWEST FIRST — assetBalance() reverses this array before replaying it,
    // because a BALANCE reading resets the running total and a reset only means
    // anything in order. Pushed the other way round, both dates resolve to the
    // opening figure, the delta comes out zero, and the residual quietly becomes
    // a different number that still looks plausible.
    w.assetEntries.unshift(
      { id: 9501, asset_id: 950, type: 'BALANCE', date: ago(2), amount: 4200, note: '', source: 'manual', ext_id: null },
      { id: 9500, asset_id: 950, type: 'BALANCE', date: ago(40), amount: 5000, note: '', source: 'manual', ext_id: null },
    )
    const now = new Date()
    const e = expensesFor(w, now.getFullYear(), now.getMonth())
    if (e.spend.reason) throw new Error(`two bases: expected a closed window, got ${e.spend.reason}`)
    if (e.unloggedRM == null) throw new Error('two bases: with two readings there must be a gap figure')

    // The panel's whole claim: the log plus what was never logged is what the
    // wallet says left. If this ever drifts the screen is showing three numbers
    // that do not belong to each other.
    const sum = e.loggedInWindowRM + e.unloggedRM
    if (Math.abs(sum - e.spend.spentRM) > 0.005) {
      throw new Error(`two bases: ${e.loggedInWindowRM} + ${e.unloggedRM} = ${sum}, not ${e.spend.spentRM}`)
    }
    // Coverage is capped and never invented from a non-positive residual.
    if (e.coveragePct != null && (e.coveragePct < 0 || e.coveragePct > 100)) {
      throw new Error(`two bases: coverage out of range at ${e.coveragePct}`)
    }
    console.log(`  two bases  ${e.loggedInWindowRM.toFixed(2)} logged + ${e.unloggedRM.toFixed(2)} never logged = ${e.spend.spentRM.toFixed(2)}`)

    /* The Overview column, on the same wallet-bearing copy.
     *
     * Neither view mode was covered anywhere until a real browser showed why:
     * the fixture has no wallet, so overviewRows() returns NO_WALLET and the
     * screen correctly refuses to draw a column at all. Everything above was
     * therefore asserting the refusal and calling it a render. */
    const { overviewRows } = await server.ssrLoadModule('/src/lib/calc.js')
    const v = overviewRows(w, now.getFullYear(), now.getMonth())
    if (v.reason) throw new Error(`overview: expected a drawable column, got ${v.reason}`)
    if (v.rows.length !== 5) throw new Error(`overview: expected 5 rows, got ${v.rows.length}`)
    if (!v.closes) throw new Error('overview: the column must close, or it is lying')

    // Read downward: the four rows above the total must BE the total. This is
    // the identity money-redesign-plan.md 2.2 exists because the canvas broke.
    const total = v.rows.find(r => r.total)
    const above = v.rows.filter(r => !r.total).reduce((t, r) => t + r.rm, 0)
    if (Math.abs(above - total.rm) > 0.005) {
      throw new Error(`overview: the column does not sum — ${above} vs ${total.rm}`)
    }
    // The wallet row points the right way. It FELL here, so it funded part of the
    // month and adds; a rise would subtract. Getting this backwards was 2.8.
    const wal = v.rows.find(r => r.key === 'wallet')
    if (wal.rm <= 0) throw new Error('overview: a wallet that fell must add to what the month cost')
    if (!/gave up/.test(wal.label)) throw new Error(`overview: mislabelled — "${wal.label}"`)
    console.log(`  overview   5 rows closing on ${total.rm.toFixed(2)}, wallet ${wal.label.toLowerCase()}`)

    /* The same copy, actually RENDERED — and in Flow, which nothing ever drew.
     *
     * overviewMode() reads a stored preference and the fixture carries none, so
     * every run above drew the Waterfall and called Overview covered. That is the
     * blind spot 7 already names, one layer up: the column was asserted, the
     * second view OF the column was not. It cost a heading that said the opposite
     * of the row printed underneath it, and no assertion over overviewRows()
     * could have caught that — those rows were right the whole time. */
    const { fmt } = await server.ssrLoadModule('/src/lib/format.js')
    const flowState = { ...w, preferences: { overviewMode: 'flow' } }
    const stub = globalThis.fetch
    globalThis.fetch = async path => ({
      ok: true, status: 200, statusText: 'OK',
      json: async () => (String(path).includes('/api/state') ? { ...flowState } : { ok: true }),
    })
    try {
      await act(async () => { await ctl.reload() })
      await tick(() => ctl.setTab('overview'))
      const pane = document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent

      for (const n of ['Arrives', 'Promised, and spent']) {
        if (!pane.includes(n)) throw new Error(`overview (flow): the "${n}" column did not draw`)
      }
      // THE THIRD COLUMN IS THE RESIDUAL — what living took, money already gone.
      // A heading claiming it is still on hand contradicts the row beneath it,
      // and that row names itself, so the two are readable against each other.
      if (pane.includes('Still here')) {
        throw new Error('overview (flow): the residual is headed as money still held')
      }
      if (!pane.includes('What that leaves')) {
        throw new Error('overview (flow): the residual column lost its heading')
      }
      // And it is the TOTAL row under there, both halves of it — so a column
      // wired to the wrong row fails here rather than looking plausible with a
      // right-shaped figure.
      if (!pane.includes(total.label)) {
        throw new Error(`overview (flow): the residual column does not name "${total.label}"`)
      }
      if (!pane.includes(fmt(total.rm, 'MYR'))) {
        throw new Error(`overview (flow): expected the residual ${fmt(total.rm, 'MYR')}`)
      }
      console.log(`  overview   flow draws 3 columns, the third "${total.label}" at ${fmt(total.rm, 'MYR')}`)
    } finally {
      globalThis.fetch = stub
      await act(async () => { await ctl.reload() })
      await tick(() => ctl.setTab('dashboard'))
    }
  }

  /* ── a payment converted at the rate it landed at ────────────────────────── */
  {
    const { eventToRM, incomeRows } = await server.ssrLoadModule('/src/lib/calc.js')
    const ev = { date: ago(200), gross: 1000, fx_rate: 4.5, fx_date: ago(201) }

    // The stored rate wins over the global one, which is the entire point: with
    // only S.fx a March invoice is restated every time the ringgit moves.
    const dated = eventToRM(STATE, 1000, 'USD', ev)
    if (Math.abs(dated.rm - 4500) > 0.005) throw new Error(`fx: expected 4500, got ${dated.rm}`)
    if (!dated.dated) throw new Error('fx: an event carrying a rate is dated')
    if (dated.on !== ev.fx_date) throw new Error('fx: the published day must survive')

    // No rate falls back rather than failing, and says it is undated so a screen
    // can mark it approximate.
    const undated = eventToRM(STATE, 1000, 'USD', { date: ago(200), gross: 1000 })
    if (Math.abs(undated.rm - 1000 * STATE.fx) > 0.005) throw new Error('fx: fallback must use the global rate')
    if (undated.dated) throw new Error('fx: an event with no rate is not dated')

    // MYR never asks anyone anything.
    const home = eventToRM(STATE, 1000, 'MYR', null)
    if (home.rm !== 1000 || !home.dated) throw new Error('fx: MYR converts to itself')

    // And a source is only "dated" when every event feeding its figure is.
    const mixed = JSON.parse(JSON.stringify(STATE))
    const src = mixed.incomeSources.find(x => x.cadence === 'IRREGULAR')
    mixed.incomeSources = mixed.incomeSources.map(x =>
      x.id === src.id ? { ...x, currency: 'USD' } : x)
    const rows = incomeRows(mixed).find(r => r.id === src.id)
    if (rows.fxDated) throw new Error('fx: a source with undated events must not claim to be dated')
    console.log(`  fx         ${dated.rm.toFixed(2)} at a stored rate vs ${undated.rm.toFixed(2)} at the global one`)
  }

  /* ── what a card took on, from two readings and no transactions ──────────── */
  {
    const { cardFloat } = await server.ssrLoadModule('/src/lib/calc.js')
    const card = STATE.commitments.find(c => c.kind === 'REVOLVING')

    const one = JSON.parse(JSON.stringify(STATE))
    one.cardStatements = [{ id: 800, commitment_id: card.id, statement_date: ago(35),
      due_date: ago(15), closing_balance: 1375.33, minimum_due: 68.77, interest_charged: 0,
      fees_charged: 0, note: '', source: 'manual' }]
    // One reading is a balance, not a movement, and must say so rather than
    // reporting the balance as if the whole of it had been spent this cycle.
    if (cardFloat(one, card.id).reason !== 'ONE_STATEMENT') {
      throw new Error('cardFloat: one statement cannot make a window')
    }

    const two = JSON.parse(JSON.stringify(one))
    // Newest first, as the model returns them.
    two.cardStatements.unshift({ id: 801, commitment_id: card.id, statement_date: ago(5),
      due_date: ago(-15), closing_balance: 5092.49, minimum_due: 1838.83, interest_charged: 0,
      fees_charged: 0, note: '', source: 'manual' })
    two.commitmentPayments = [{ id: 700, commitment_id: card.id, date: ago(33), amount: 1375.33,
      extra_principal: 0, note: '', source: 'manual' }]

    const f = cardFloat(two, card.id)
    if (f.reason) throw new Error(`cardFloat: expected a window, got ${f.reason}`)
    // The claim the panel prints: owed after, less owed before, plus what was
    // paid off it. The repayment is ADDED because it reduced the balance without
    // being spending — drop it and a month that was paid in full reads as zero
    // activity, which is the exact opposite of what happened.
    const expect = 5092.49 - 1375.33 + 1375.33
    if (Math.abs(f.rm - expect) > 0.005) throw new Error(`cardFloat: ${f.rm} vs ${expect}`)
    if (Math.abs(f.rm - 5092.49) > 0.005) throw new Error('cardFloat: a fully-paid cycle spent the closing balance')

    // A payment ON the earlier closing date is already inside that balance and
    // must not be counted again.
    const edge = JSON.parse(JSON.stringify(two))
    edge.commitmentPayments = [{ id: 701, commitment_id: card.id, date: ago(35), amount: 500,
      extra_principal: 0, note: '', source: 'manual' }]
    if (Math.abs(cardFloat(edge, card.id).rm - (5092.49 - 1375.33)) > 0.005) {
      throw new Error('cardFloat: a payment on the closing date is already in that balance')
    }
    console.log(`  card float ${f.rm.toFixed(2)} from two readings and ${f.payments.length} payment, no transactions`)
  }

  /* ── what a card's bills prove, and every figure that follows ────────────── */
  //
  // Calc-level, on local copies, with `nowISO` passed explicitly everywhere:
  // the live Maybank figures below are checked against two fixed dates and
  // must not move with the wall clock. The CIMB copy is relative to today, as
  // the rest of the fixture is, and is given today's date by name.
  {
    const { cardState, commitmentRows, commitmentsTotal, moneyByDay, cardFloat, planFit, addDaysISO } =
      await server.ssrLoadModule('/src/lib/calc.js')
    const { stateCaption, monthOf, fmt } = await server.ssrLoadModule('/src/lib/format.js')
    const card = STATE.commitments.find(c => c.kind === 'REVOLVING')
    const today = isoOf(NOW)
    const copy = () => JSON.parse(JSON.stringify(STATE))
    const fail = (name, got, want) =>
      new Error(`card state: ${name} read ${JSON.stringify(got)}, not ${JSON.stringify(want)}`)
    const same = (name, got, want) => { if (got !== want) throw fail(name, got, want) }
    // A calendar note carries its money as numbers, formatted only when drawn
    // (so private mode can mask it); read here the way Calendar.jsx reads it.
    const noteText = n => (Array.isArray(n) ? n.map(p => (typeof p === 'number' ? fmt(p, 'MYR') : p)).join('') : n)
    const near = (name, got, want) => {
      if (got == null || Math.abs(got - want) > 0.005) throw fail(name, got, want)
    }
    const stmt = (id, statement_date, due_date, closing_balance, extra = {}) => ({
      id, commitment_id: card.id, statement_date, due_date, closing_balance, minimum_due: 50,
      interest_charged: 0, fees_charged: 0, note: '', source: 'manual', ...extra,
    })
    const pay = (id, date, amount) => ({
      id, commitment_id: card.id, date, amount, extra_principal: 0, note: '', source: 'manual',
    })
    const withBills = (statements, payments = []) => {
      const S = copy()
      S.cardStatements = statements
      S.commitmentPayments = payments
      return S
    }
    const verdict = S => {
      const r = cardState(S, card, { nowISO: today })
      return `${r.state}/${r.evidence}`
    }

    // Every row of the decision table, first match wins. `s1` is live (closed
    // ten days ago, due in ten), `s0` the bill before it (due twenty days ago);
    // `past` is a lone bill past due AND past the four-day grace.
    const s1 = stmt(820, ago(10), ago(-10), 1000)
    const s0 = stmt(821, ago(40), ago(20), 800)
    const past = stmt(822, ago(30), ago(10), 1000)
    const table = [
      ['no statements', STATE, 'UNKNOWN/NO_STATEMENTS'],
      ['first bill', withBills([s1]), 'UNKNOWN/FIRST_BILL'],
      ['previous settled', withBills([s1, s0], [pay(720, ago(25), 800)]), 'SETTLED/PREVIOUS_SETTLED'],
      ['previous carried, partial', withBills([s1, s0], [pay(720, ago(25), 300)]), 'CARRYING/PREVIOUS_CARRIED'],
      ['previous carried, paid late', withBills([s1, s0], [pay(720, ago(12), 800)]), 'CARRYING/PREVIOUS_CARRIED'],
      ['previous unpaid', withBills([s1, s0]), 'UNKNOWN/PREVIOUS_UNPAID'],
      ['paid on time', withBills([s1, s0], [pay(720, ago(25), 800), pay(721, ago(2), 1000)]), 'SETTLED/PAID_ON_TIME'],
      ['paid in grace', withBills([past], [pay(721, addDaysISO(ago(10), 3), 1000)]), 'SETTLED/PAID_IN_GRACE'],
      ['paid late', withBills([past], [pay(721, addDaysISO(ago(10), 10), 1000)]), 'SETTLED/PAID_LATE'],
      ['partial', withBills([past], [pay(721, ago(9), 500)]), 'CARRYING/PARTIAL'],
      ['no payment recorded', withBills([past]), 'UNKNOWN/NO_PAYMENT_RECORDED'],
      ['interest billed', withBills([{ ...s1, interest_charged: 5 }, s0]), 'CARRYING/INTEREST_BILLED'],
      // An imported row writes interest_charged: 0 unconditionally, so a figure
      // on one is not evidence — and must never make a card CARRYING.
      ['imported interest', withBills([{ ...s1, interest_charged: 5, source: 'import' }, s0]), 'UNKNOWN/PREVIOUS_UNPAID'],
      // Interest on the bill BEFORE says the one before that was carried — a
      // cycle too early to speak to the live bill (the corrected 6b).
      ['interest on the bill before', withBills([s1, { ...s0, interest_charged: 5 }], [pay(720, ago(25), 800)]), 'SETTLED/PREVIOUS_SETTLED'],
      // And a hand-keyed bill printing interest, paid in full by its due date,
      // is SETTLED — never CARRYING.
      ['interest then paid', withBills([{ ...past, interest_charged: 5 }], [pay(721, ago(12), 1000)]), 'SETTLED/PAID_ON_TIME'],
    ]
    for (const [name, S, want] of table) same(name, verdict(S), want)

    // The carried base is the whole unpaid bill, net of payments: 500 on
    // 5,092.49 past due and grace carries 4,592.49, costing 57.41 a month at 15%.
    const partial = withBills([stmt(823, ago(30), ago(10), 5092.49)], [pay(721, ago(9), 500)])
    partial.commitments = partial.commitments.map(c => (c.id === card.id ? { ...c, apr: 15 } : c))
    const pr = commitmentRows(partial, { nowISO: today }).find(r => r.id === card.id)
    same('partial verdict', `${pr.state}/${pr.evidence}`, 'CARRYING/PARTIAL')
    near('partial carried', pr.carried, 4592.49)
    same('partial cost', pr.costOfCarrying.toFixed(2), '57.41')
    near('partial band 1', pr.bandPct[0], (4592.49 / 15000) * 100)
    near('partial band 2', pr.bandPct[1], 0)

    // Minimum met: payments cover the minimum but not the bill, so nothing more
    // is demanded on the due date — and it is said, not printed as RM 0.00.
    const met = withBills([{ ...s1, minimum_due: 100 }], [pay(721, ago(3), 100)])
    const mr = commitmentRows(met, { nowISO: today }).find(r => r.id === card.id)
    if (!(mr.dueNext.met && mr.dueNext.rm === 0 && mr.dueNext.atLeast === false && mr.dueNext.basis === 'BILL')) {
      throw fail('minimum met', mr.dueNext, { rm: 0, met: true, atLeast: false, basis: 'BILL' })
    }

    // Settled is settled: two payments whose float sum lands a hair under the
    // bill (4,320.40 + 0.70 is 4,321.099999…) still clear it, and the cleared
    // bill leaves nothing billed and unpaid — so the due figure moves to the
    // next cycle rather than reading as a met minimum on an open bill.
    const drift = withBills([stmt(824, ago(10), ago(-10), 4321.10)], [pay(721, ago(8), 4320.40), pay(722, ago(7), 0.70)])
    const dr = commitmentRows(drift, { nowISO: today }).find(r => r.id === card.id)
    same('drift verdict', `${dr.state}/${dr.evidence}`, 'SETTLED/PAID_ON_TIME')
    same('drift billedUnpaid', dr.billedUnpaid, 0)
    same('drift dueNext.basis', dr.dueNext.basis, 'CYCLE')
    same('drift dueNext.rm', dr.dueNext.rm, null)

    // A partial past the due date and its grace is decided: the balance is
    // carried, and what leaves next is the next bill's minimum on the next
    // cycle's date — never "minimum met" or "RM 0.00" against a date gone by.
    const covered = withBills([stmt(825, ago(30), ago(10), 5092.49, { minimum_due: 1838.83 })], [pay(721, ago(15), 2000)])
    const cr0 = commitmentRows(covered, { nowISO: today }).find(r => r.id === card.id)
    same('covered verdict', `${cr0.state}/${cr0.evidence}`, 'CARRYING/PARTIAL')
    same('covered dueNext.basis', cr0.dueNext.basis, 'CYCLE')
    same('covered dueNext.met', cr0.dueNext.met, false)
    if (!(cr0.dueNext.rm > 0)) throw fail('covered dueNext.rm', cr0.dueNext.rm, 'the next minimum')
    same('covered dueNext.atLeast', cr0.dueNext.atLeast, true)
    same('partial dueNext.basis', pr.dueNext.basis, 'CYCLE')

    // A plan bought after the bill closed is unbilled in full: none of it is
    // inside the closing balance, so the retail base the minimum reads is the
    // whole bill (5% of 1,000 plus the 100 instalment now contracted = 150).
    const after = withBills([stmt(826, ago(30), ago(10), 1000, { minimum_due: null })])
    after.cardPlans = [{
      id: 915, commitment_id: card.id, kind: 'EPP', name: 'Bought after the close', merchant: '', amount: 1200,
      tenure_months: 12, instalment: 100, rate: 0, upfront_fee: 0, purchased_on: ago(20), started_on: ago(20),
      settled_on: null, status: 'ACTIVE', category: 'OTHER', note: '', source: 'manual',
    }]
    const ar = commitmentRows(after, { nowISO: today }).find(r => r.id === card.id)
    same('plan after close instalmentsBilled', ar.instalmentsBilled, 0)
    near('plan after close retailUnpaid', ar.retailUnpaid, 1000)
    near('plan after close unbilled', ar.unbilled, 1200)
    near('plan after close derivedMinimum', ar.derivedMinimum, 150)

    // A minimum of nothing is nothing due: no "at least RM 0.00" on the row
    // and no estimated event of RM 0.00 on the calendar.
    const nothing = copy()
    nothing.commitments = nothing.commitments.map(c =>
      c.id === card.id ? { ...c, balance: 0, balance_as_of: null, statement_day: 6 } : c)
    const nr = commitmentRows(nothing, { nowISO: today }).find(r => r.id === card.id)
    same('nothing dueNext.rm', nr.dueNext.rm, null)
    same('nothing dueNext.atLeast', nr.dueNext.atLeast, false)
    const [ny, nm] = today.split('-').map(Number)
    const nothingDue = Object.values(moneyByDay(nothing, ny, nm - 1, today)).flat().find(e => e.key === `cr${card.id}`)
    if (nothingDue) throw fail('nothing calendar', nothingDue, 'no due event for a minimum of nothing')

    // ── the live Maybank account, at two fixed dates ──────────────────────────
    const live = copy()
    live.commitments = [{
      id: 19, kind: 'REVOLVING', name: 'Maybank card account', lender: 'Maybank', currency: 'MYR',
      due_day: 26, statement_day: 6, note: '', principal: null, rate: null, rate_type: null,
      term_months: null, started_on: null, instalment: null, credit_limit: 15000, balance: 3424.91,
      balance_as_of: '2026-08-06', apr: 15, min_payment_pct: 5, min_payment_floor: 25, amount: null,
      every_months: 1, limit_release: 'PROGRESSIVE', asset_id: null, collected_by_id: null,
      active: true, ended_on: null, sort_order: 9,
    }]
    live.cardStatements = [{ id: 830, commitment_id: 19, statement_date: '2026-08-06', due_date: '2026-08-26',
      closing_balance: 5092.49, minimum_due: 1838.83, interest_charged: 0, fees_charged: 0, note: '', source: 'import' }]
    live.commitmentPayments = []
    const plan = (id, name, amount, tenure_months, instalment, started_on) => ({
      id, commitment_id: 19, kind: 'EPP', name, merchant: '', amount, tenure_months, instalment, rate: 0,
      upfront_fee: 0, purchased_on: started_on, started_on, settled_on: null, status: 'ACTIVE',
      category: 'OTHER', note: '', source: 'manual',
    })
    live.cardPlans = [
      plan(910, 'EzyCash', 7000.02, 6, 1166.67, '2026-05-07'),
      plan(911, 'EzyPay Plus', 2896.20, 12, 263.07, '2026-04-07'),
      plan(912, 'BJAK', 2854.08, 12, 237.84, '2026-03-07'),
    ]
    const dates = [
      ['2026-09-06', { verdict: 'UNKNOWN/NO_PAYMENT_RECORDED', days: -11, daysOfFloat: 20, stale: true,
        staleDays: 31, stated: false, counts: { unknownNoPayment: 1 }, overdueRM: 5092.49, overdueISO: '2026-08-26',
        caption: 'one account has no payment recorded · RM 5,092.49 of it fell due on 26 Aug with no payment recorded' }],
      ['2026-08-20', { verdict: 'UNKNOWN/FIRST_BILL', days: 6, daysOfFloat: 37, stale: false,
        staleDays: null, stated: true, counts: { unknownOneBill: 1 }, overdueRM: 0, overdueISO: null,
        caption: 'one account has one bill so far' }],
    ]
    for (const [nowISO, want] of dates) {
      const tag = k => `Maybank ${nowISO} ${k}`
      const r = commitmentRows(live, { nowISO }).find(x => x.id === 19)
      same(tag('verdict'), `${r.state}/${r.evidence}`, want.verdict)
      near(tag('instalmentsBilled'), r.instalmentsBilled, 1667.58)
      near(tag('billedUnpaid'), r.billedUnpaid, 5092.49)
      near(tag('retailUnpaid'), r.retailUnpaid, 3424.91)
      same(tag('carried'), r.carried, null)
      near(tag('unbilled'), r.unbilled, 7269.45)
      near(tag('blocked'), r.blocked, 7095.69)
      near(tag('owed'), r.owed, 12361.94)
      near(tag('billed'), r.billed, 5092.49)
      near(tag('availableRM'), r.availableRM, 2811.82)
      same(tag('utilisationPct'), r.utilisationPct.toFixed(2), '81.25')
      near(tag('apparentFree'), r.apparentFree, 9907.51)
      same(tag('apparentPct'), r.apparentPct.toFixed(2), '33.95')
      same(tag('bandPct'), r.bandPct.map(v => v.toFixed(2)).join(' '), '0.00 33.95 47.30')
      near(tag('releasePerMonth'), r.releasePerMonth, 1645.86)
      same(tag('minimum limb'), r.minimumDetail.limb, 'PCT')
      same(tag('derivedMinimum'), r.derivedMinimum.toFixed(2), '1838.83')
      same(tag('minimumIsStated'), r.minimumIsStated, want.stated)
      same(tag('minimum'), r.minimum.toFixed(2), '1838.83')
      same(tag('costOfCarrying'), r.costOfCarrying, null)
      same(tag('interestThisMonth'), r.interestThisMonth, 0)
      same(tag('principalThisMonth'), r.principalThisMonth.toFixed(2), '1838.83')
      same(tag('cycle'), `${r.cycle.closesOn} ${r.cycle.dueOn} ${r.cycle.daysOfFloat} ${r.cycle.graceDays}`,
        `2026-09-06 2026-09-26 ${want.daysOfFloat} 20`)
      near(tag('dueNext.rm'), r.dueNext.rm, 1838.83)
      same(tag('dueNext.iso'), r.dueNext.iso, '2026-08-26')
      same(tag('dueNext.days'), r.dueNext.days, want.days)
      same(tag('dueNext.atLeast'), r.dueNext.atLeast, true)
      same(tag('dueNext.basis'), r.dueNext.basis, 'BILL')
      same(tag('stale'), r.stale, want.stale)
      same(tag('staleDays'), r.staleDays, want.staleDays)
      same(tag('balanceNewer'), r.balanceNewer, false)
      // The identities the screen prints.
      near(tag('owed = billed + unbilled'), r.owed, r.billed + r.unbilled)
      near(tag('available = limit − billedUnpaid − blocked'), r.availableRM, 15000 - r.billedUnpaid - r.blocked)
      // Nothing may print the old figures: interest on an unproven balance, or
      // the plan arithmetic run at today's date.
      for (const bad of [42.81, 6125.26, 9026.78, 10694.36, 4457.68]) {
        for (const v of [r.interestThisMonth, r.owed, r.availableRM, r.unbilled, r.blocked, r.carried || 0]) {
          if (Math.abs(v - bad) < 0.005) throw fail(tag(`must not print ${bad}`), v, 'anything else')
        }
      }
      const t = commitmentsTotal(live, { kinds: ['REVOLVING'], nowISO })
      near(tag('billedRM'), t.billedRM, 5092.49)
      near(tag('unbilledRM'), t.unbilledRM, 7269.45)
      near(tag('owedRM'), t.owedRM, 12361.94)
      near(tag('due30RM'), t.due30RM, 1838.83)
      same(tag('due30AtLeast'), t.due30AtLeast, true)
      const counts = { carrying: 0, late: 0, settled: 0, unknownNoPayment: 0, unknownOneBill: 0, unknownNoBill: 0, ...want.counts }
      same(tag('counts'), JSON.stringify(t.counts), JSON.stringify(counts))
      near(tag('overdueRM'), t.overdueRM, want.overdueRM)
      same(tag('overdueISO'), t.overdueISO, want.overdueISO)
      same(tag('caption'), stateCaption(t.counts, t), want.caption)
      const pf = planFit(live, 19, 1, { nowISO })
      near(tag('planFit.billedUnpaid'), pf.billedUnpaid, 5092.49)
      near(tag('planFit.apparentFree'), pf.apparentFree, 9907.51)
      near(tag('planFit.availableRM'), pf.availableRM, 2811.82)
    }
    // The calendar: August's due day is the printed minimum with the whole bill
    // named and no payment recorded; September's is derived, by the PCT limb.
    const aug = (moneyByDay(live, 2026, 7, '2026-09-06')[26] || []).find(e => e.key === 'cr19')
    if (!aug) throw fail('Maybank calendar Aug 26', null, 'a due event')
    near('Maybank Aug 26 amount', aug.amount, 1838.83)
    same('Maybank Aug 26 state', aug.state, 'due')
    near('Maybank Aug 26 clearAmount', aug.clearAmount, 5092.49)
    if (!noteText(aug.note).includes('the whole bill is RM 5,092.49, and no payment is recorded')) {
      throw fail('Maybank Aug 26 note', noteText(aug.note), '…the whole bill is RM 5,092.49, and no payment is recorded')
    }
    const sep = (moneyByDay(live, 2026, 8, '2026-09-06')[26] || []).find(e => e.key === 'cr19')
    if (!sep) throw fail('Maybank calendar Sep 26', null, 'an estimated event')
    same('Maybank Sep 26 amount', sep.amount.toFixed(2), '1838.83')
    same('Maybank Sep 26 state', sep.state, 'estimated')
    if (!sep.note.startsWith('derived: 5% of the revolving balance')) throw fail('Maybank Sep 26 note', sep.note, 'the PCT note')

    // ── the shared state does not move ───────────────────────────────────────
    // Card 3 has a balance and no bill: UNKNOWN, its minimum still 117 (5% of
    // 2,340), which is what keeps 'RM 4,051.50' and 'RM 4,668.00' where the
    // screens above asserted them.
    const shared = commitmentsTotal(STATE, { kinds: ['REVOLVING'], nowISO: today })
    near('shared monthlyOutRM', shared.monthlyOutRM, 117)
    const c3 = shared.rows.find(r => r.id === card.id)
    same('shared verdict', `${c3.state}/${c3.evidence}`, 'UNKNOWN/NO_STATEMENTS')
    same('shared basis', c3.basis, 'READING')
    near('shared owed', c3.owed, 2340)
    near('shared dueNext.rm', c3.dueNext.rm, 117)
    same('shared dueNext.iso', c3.dueNext.iso, null)
    same('shared dueNext.atLeast', c3.dueNext.atLeast, true)
    same('shared interestThisMonth', c3.interestThisMonth, 0)
    same('shared costOfCarrying', c3.costOfCarrying, null)
    near('shared apparentFree − availableRM = blocked', c3.apparentFree - c3.availableRM, c3.blocked)
    same('shared counts', JSON.stringify(shared.counts),
      JSON.stringify({ carrying: 0, late: 0, settled: 0, unknownNoPayment: 0, unknownOneBill: 0, unknownNoBill: 1 }))

    // ── a card that settles every cycle ──────────────────────────────────────
    const closed = ago(2), due = ago(-22), prevClosed = ago(33), prevDue = ago(9)
    const cimb = copy()
    cimb.commitments.push({
      id: 5, kind: 'REVOLVING', name: 'CIMB Platinum', lender: 'CIMB', currency: 'MYR',
      due_day: Number(due.slice(8, 10)), statement_day: Number(closed.slice(8, 10)), note: '',
      principal: null, rate: null, rate_type: null, term_months: null, started_on: null, instalment: null,
      credit_limit: 25000, balance: 0, balance_as_of: closed, apr: 17, min_payment_pct: 5,
      min_payment_floor: 50, amount: null, every_months: 1, limit_release: 'PROGRESSIVE',
      asset_id: null, collected_by_id: null, active: true, ended_on: null, sort_order: 5,
    })
    cimb.cardStatements = [
      { id: 810, commitment_id: 5, statement_date: closed, due_date: due, closing_balance: 612.40,
        minimum_due: 50, interest_charged: 0, fees_charged: 0, note: '', source: 'import' },
      { id: 811, commitment_id: 5, statement_date: prevClosed, due_date: prevDue, closing_balance: 588.10,
        minimum_due: 50, interest_charged: 0, fees_charged: 0, note: '', source: 'import' },
    ]
    cimb.commitmentPayments = [{ id: 710, commitment_id: 5, date: ago(12), amount: 588.10,
      extra_principal: 0, note: '', source: 'manual' }]
    const cr = commitmentRows(cimb, { nowISO: today }).find(r => r.id === 5)
    same('CIMB verdict', `${cr.state}/${cr.evidence}`, 'SETTLED/PREVIOUS_SETTLED')
    near('CIMB billedUnpaid', cr.billedUnpaid, 612.40)
    same('CIMB carried', cr.carried, 0)
    same('CIMB bandPct', cr.bandPct.map(v => v.toFixed(2)).join(' '), '0.00 2.45 0.00')
    same('CIMB unbilled', cr.unbilled, 0)
    same('CIMB blocked', cr.blocked, 0)
    near('CIMB owed', cr.owed, 612.40)
    near('CIMB availableRM', cr.availableRM, 24387.60)
    near('CIMB apparentFree', cr.apparentFree, 24387.60)
    same('CIMB minimum', cr.minimum, 50)
    same('CIMB minimumIsStated', cr.minimumIsStated, true)
    same('CIMB minimum limb', cr.minimumDetail.limb, 'FLOOR')
    near('CIMB dueNext.rm', cr.dueNext.rm, 612.40)
    same('CIMB dueNext.days', cr.dueNext.days, 22)
    same('CIMB dueNext.atLeast', cr.dueNext.atLeast, false)
    same('CIMB costOfCarrying', cr.costOfCarrying, 0)
    same('CIMB interestThisMonth', cr.interestThisMonth, 0)
    same('CIMB staleDays', cr.staleDays, null)
    same('CIMB stale', cr.stale, false)
    same('CIMB bill.timing', cr.bill.timing, null)
    same('CIMB prevBill.timing', cr.prevBill.timing, 'ON_TIME')
    const ct = commitmentsTotal(cimb, { kinds: ['REVOLVING'], nowISO: today })
    near('CIMB billedRM', ct.billedRM, 2952.40)
    near('CIMB due30RM', ct.due30RM, 612.40)
    same('CIMB due30AtLeast', ct.due30AtLeast, false)
    same('CIMB caption', stateCaption(ct.counts, ct), 'one account settles in full · one has no bill yet')
    // The calendar on its due day carries the WHOLE bill, because the account
    // settles — and what clears it is the same figure.
    const [dy, dm] = due.split('-').map(Number)
    const ev = (moneyByDay(cimb, dy, dm - 1, today)[Number(due.slice(8, 10))] || []).find(e => e.key === 'cr5')
    if (!ev) throw fail('CIMB calendar', null, 'a due event')
    near('CIMB calendar amount', ev.amount, 612.40)
    same('CIMB calendar state', ev.state, 'due')
    near('CIMB calendar clearAmount', ev.clearAmount, 612.40)
    if (!noteText(ev.note).includes('as this account settles in full — the minimum would be RM 50.00')) {
      throw fail('CIMB calendar note', noteText(ev.note), '…as this account settles in full — the minimum would be RM 50.00')
    }
    // The float speaks in the settled voice, from the bill before — not from
    // whether the window's payments happen to add up.
    const cf = cardFloat(cimb, 5, { nowISO: today })
    near('CIMB float rm', cf.rm, 612.40)
    same('CIMB float voice', cf.voice, 'SETTLED')
    same('CIMB float range', `${cf.rangeStartISO} ${cf.to}`, `${ago(32)} ${closed}`)
    same('CIMB float paysISO', cf.paysISO, due)
    same('CIMB float paysMonth', cf.paysMonth, monthOf(due))
    same('CIMB float livedMonth', cf.livedMonth, monthOf(ago(18)))
    same('CIMB float payments', cf.payments.length, 1)
    // The same 588.10 five days after the due date is inside the window and
    // still late: the balance was cleared, the interest-free period was not kept.
    const lateCopy = JSON.parse(JSON.stringify(cimb))
    lateCopy.commitmentPayments = [{ ...cimb.commitmentPayments[0], date: addDaysISO(prevDue, 5) }]
    const lf = cardFloat(lateCopy, 5, { nowISO: today })
    same('CIMB late voice', lf.voice, 'CARRYING')
    same('CIMB late prevBill.timing', lf.prevBill.timing, 'LATE')
    near('CIMB late rm', lf.rm, 612.40)
    const lr = commitmentRows(lateCopy, { nowISO: today }).find(r => r.id === 5)
    same('CIMB late verdict', `${lr.state}/${lr.evidence}`, 'CARRYING/PREVIOUS_CARRIED')
    near('CIMB late carried', lr.carried, 612.40)
    // And with no payment recorded at all, the voice is neither.
    const noPay = JSON.parse(JSON.stringify(cimb))
    noPay.commitmentPayments = []
    const uf = cardFloat(noPay, 5, { nowISO: today })
    same('CIMB unknown voice', uf.voice, 'UNKNOWN')
    same('CIMB unknown paidRM', uf.paidRM, 0)
    near('CIMB unknown rm', uf.rm, 612.40 - 588.10)

    console.log(`  card state ${table.length} verdicts; Maybank 12,361.94 committed, 2,811.82 free at both dates; CIMB settles`)
  }

  /* ── a row never offers an action its screen cannot perform ──────────────── */
  {
    const { commitmentRows } = await server.ssrLoadModule('/src/lib/calc.js')
    const kinds = new Set(commitmentRows(STATE).map(r => r.kind))
    if (!kinds.has('REVOLVING')) throw new Error('row actions: the fixture needs a card')

    // Commitments shows EVERY kind, so a card row renders there — and it never
    // passed the card callbacks. The plus called undefined and threw
    // "r is not a function", which is a button that does nothing.
    await tick(() => ctl.setTab('commitments'))
    const onCommitments = document.querySelectorAll('[aria-label^="Add an instalment plan to"]').length
    if (onCommitments !== 0) {
      throw new Error(`row actions: Commitments offers ${onCommitments} add-plan buttons it cannot honour`)
    }
    const handoff = document.querySelectorAll('[aria-label*="on Credit cards"], [aria-label*="on Loans"]').length
    if (handoff === 0) throw new Error('row actions: a card or loan row must offer its own screen instead')

    // And Credit cards, which does pass them, still offers them.
    await tick(() => ctl.setTab('cards'))
    if (!document.querySelectorAll('[aria-label^="Add an instalment plan to"]').length) {
      throw new Error('row actions: Credit cards must still offer to add a plan')
    }
    console.log(`  row actions Commitments hands ${handoff} row(s) to the screen that owns them`)
  }

  /* ── the account row is the control, and the actions inside it are not ──── */
  // Every card account is one row that opens its sheet. The plus inside the row
  // must open the plan form WITHOUT opening the sheet — a click that did both
  // would put a form on top of a panel the owner never asked for.
  {
    await tick(() => ctl.setTab('cards'))
    const pane = () => document.querySelector('[data-slot="tabs-content"][data-state="active"]')
    const sheets = () => [...document.querySelectorAll('[data-slot="sheet-content"]')]
    const rowsOf = () => [...pane().querySelectorAll('[role="button"][aria-label^="Open "]')]
    const revolving = STATE.commitments.filter(c => c.kind === 'REVOLVING' && c.active).length
    if (rowsOf().length !== revolving) {
      throw new Error(`cards: ${rowsOf().length} account rows for ${revolving} card account(s)`)
    }

    await tick(() => rowsOf()[0].querySelector('[aria-label^="Add an instalment plan to"]').click())
    if (!document.body.textContent.includes('Add an instalment plan')) {
      throw new Error('cards: the plus inside a row did not open the plan form')
    }
    if (sheets().some(s => s.textContent.includes('Committed on this account'))) {
      throw new Error('cards: the plus inside a row opened the account sheet as well')
    }
    await tick(() => ctl.closeModal())

    const openSheet = async row => {
      await tick(() => row.click())
      const sheet = sheets().find(s => s.textContent.includes('Committed on this account'))
      if (!sheet) throw new Error(`cards: clicking ${row.getAttribute('aria-label')} opened no account sheet`)
      return sheet
    }
    const closeSheet = async () => {
      await tick(() => document.querySelector('[data-slot="sheet-content"] button[type="button"]')?.click())
      if (sheets().length) throw new Error('cards: the account sheet did not close')
    }
    const expectSheet = (sheet, who, needles) => {
      for (const n of needles) {
        if (!sheet.textContent.includes(n)) throw new Error(`cards sheet (${who}): missing "${n}"`)
      }
    }
    // The float headline is the one figure whose tone is the voice's: loss
    // only where a carried balance is proven, muted where the float is money
    // waiting to leave the wallet. Found by its size class, which no other
    // span in the sheet carries.
    const floatHeadline = sheet =>
      [...sheet.querySelectorAll('span')].find(el => el.classList.contains('text-[26px]'))

    // The fixture's own card has no bill: the cost is an em dash, not a zero,
    // and the sentence under it says a balance alone cannot prove carrying.
    expectSheet(await openSheet(rowsOf()[0]), 'no bill', [
      'Pay this card',
      'Cost of carrying',
      '—',
      'no bill recorded — carrying cannot be read from a balance alone',
    ])
    await closeSheet()

    // A card that settles every cycle, rendered beside the fixture's own. The
    // stub hands the store the same STATE object on every reload, and React
    // ignores a state set to the object it already holds — so the swap goes in
    // through a fresh copy, and the restore through the original reference.
    const closed = ago(2), due = ago(-22), prevClosed = ago(33), prevDue = ago(9)
    const stub = globalThis.fetch
    globalThis.fetch = async path => ({
      ok: true, status: 200, statusText: 'OK',
      json: async () => (String(path).includes('/api/state') ? { ...STATE } : { ok: true }),
    })
    STATE.commitments.push({
      id: 5, kind: 'REVOLVING', name: 'CIMB Platinum', lender: 'CIMB', currency: 'MYR',
      due_day: Number(due.slice(8, 10)), statement_day: Number(closed.slice(8, 10)), note: '',
      principal: null, rate: null, rate_type: null, term_months: null, started_on: null, instalment: null,
      credit_limit: 25000, balance: 0, balance_as_of: closed, apr: 17, min_payment_pct: 5,
      min_payment_floor: 50, amount: null, every_months: 1, limit_release: 'PROGRESSIVE',
      asset_id: null, collected_by_id: null, active: true, ended_on: null, sort_order: 5,
    })
    STATE.cardStatements = [
      { id: 810, commitment_id: 5, statement_date: closed, due_date: due, closing_balance: 612.40,
        minimum_due: 50, interest_charged: 0, fees_charged: 0, note: '', source: 'import' },
      { id: 811, commitment_id: 5, statement_date: prevClosed, due_date: prevDue, closing_balance: 588.10,
        minimum_due: 50, interest_charged: 0, fees_charged: 0, note: '', source: 'import' },
    ]
    STATE.commitmentPayments = [{ id: 710, commitment_id: 5, date: ago(12), amount: 588.10,
      extra_principal: 0, note: '', source: 'manual' }]
    await act(async () => { await ctl.reload() })
    try {
      if (rowsOf().length !== revolving + 1) {
        throw new Error(`cards: ${rowsOf().length} account rows after adding a second account`)
      }
      const text = pane().textContent
      // The badge is the previous bill paid in full and on time; the figure is the
      // whole live bill on its own due date, because a settling account pays all
      // of it — and 'Two limits' proves the two rooms were named, not added.
      for (const n of ['Paid in full', 'RM 612.40 · in 22 days', 'Two limits, not one pool.']) {
        if (!text.includes(n)) throw new Error(`cards (settled account): missing "${n}"`)
      }
      // Its sheet: the cost is an em dash because nothing is carried, and the
      // float speaks in the settled voice — spending waiting to leave the
      // wallet, not debt, so the headline is not painted as a loss.
      const cimbRow = () => rowsOf().find(r => r.getAttribute('aria-label') === 'Open CIMB Platinum')
      if (!cimbRow()) throw new Error('cards: no row for the settled account')
      const settledSheet = await openSheet(cimbRow())
      expectSheet(settledSheet, 'settled account', [
        'Cost of carrying',
        'nothing is carried, so there is no cost',
        'A card settled every cycle still carries float',
        'Spent on the card in ',
        'Paid off it on ',
        'RM 612.40 DUE IN 22 DAYS',
        'never used',
      ])
      const settledHeadline = floatHeadline(settledSheet)
      if (!settledHeadline) throw new Error('cards sheet (settled account): no float headline')
      if (settledHeadline.classList.contains('text-loss')) {
        throw new Error('cards sheet (settled account): the float of a settled card is painted as a loss')
      }
      await closeSheet()

      // The same account with a PARTIAL payment on the bill before: a balance
      // came into the live cycle, so the badge, the cost and the float all
      // turn — the lead is the carrying voice and the headline is a loss.
      STATE.commitmentPayments[0].amount = 300
      await act(async () => { await ctl.reload() })
      const carryingSheet = await openSheet(cimbRow())
      expectSheet(carryingSheet, 'carrying account', [
        'Two closing balances.',
        'RM 300.00 was paid off it',
        '17.0% on the revolving band only',
        'RM 50.00 DUE IN 22 DAYS',
      ])
      if (carryingSheet.textContent.includes('nothing is carried, so there is no cost')) {
        throw new Error('cards sheet (carrying account): still reads as settled')
      }
      const carryingHeadline = floatHeadline(carryingSheet)
      if (!carryingHeadline?.classList.contains('text-loss')) {
        throw new Error('cards sheet (carrying account): the float of a carried balance is not a loss')
      }
      await closeSheet()

      // The 30-day figure is a loss only while something leaves: with CIMB's
      // whole bill inside the month it is red, and on the fixture alone (a card
      // with no statement day has no date to fall due on) it is not.
      const due30 = () => [...pane().querySelectorAll('div')].find(el => el.classList.contains('text-[22px]'))
      if (!due30()?.classList.contains('text-loss')) {
        throw new Error('cards: RM 612.40 due inside the month is not painted as a loss')
      }

      // The sheet lists the plans, so the sheet is where a plan is edited or
      // removed — the row on Credit cards no longer carries a plan list at all.
      STATE.cardPlans = [{
        id: 916, commitment_id: 5, kind: 'EPP', name: 'Sofa on EPP', merchant: '', amount: 1200,
        tenure_months: 12, instalment: 100, rate: 0, upfront_fee: 0, purchased_on: ago(1), started_on: ago(1),
        settled_on: null, status: 'ACTIVE', category: 'OTHER', note: '', source: 'manual',
      }]
      await act(async () => { await ctl.reload() })
      const planSheet = await openSheet(cimbRow())
      for (const label of ['Edit Sofa on EPP', 'Remove Sofa on EPP']) {
        if (!planSheet.querySelector(`[aria-label="${label}"]`)) {
          throw new Error(`cards sheet (plans): no "${label}" action`)
        }
      }
      await tick(() => planSheet.querySelector('[aria-label="Edit Sofa on EPP"]').click())
      if (!document.body.textContent.includes('Edit the plan')) {
        throw new Error('cards sheet (plans): the pencil did not open the plan for editing')
      }
      await tick(() => ctl.closeModal())
      await closeSheet()
    } finally {
      STATE.commitments = STATE.commitments.filter(c => c.id !== 5)
      delete STATE.cardStatements
      delete STATE.cardPlans
      STATE.commitmentPayments = []
      globalThis.fetch = stub
      await act(async () => { await ctl.reload() })
    }
    if (rowsOf().length !== revolving) throw new Error('cards: the settled account did not restore')
    {
      const due30 = [...pane().querySelectorAll('div')].find(el => el.classList.contains('text-[22px]'))
      if (!due30 || due30.classList.contains('text-loss')) {
        throw new Error('cards: nothing due in 30 days is painted as a loss')
      }
    }
    console.log('  cards      one row per account opens its sheet; the plus inside it does not; CIMB settles, then carries; plans edit from the sheet')
  }

  // THE MONTH IS NOT SHARED, and that reversal is the rule now. Every Money
  // screen shows the month that is happening; Expenses alone can be drilled into
  // a past one by its own twelve-month chart, and that drill is a fact about
  // Expenses. The stepper that used to move all six at once is gone outright, so
  // there is nothing anywhere that can take another screen off today.
  {
    const { currentMonth } = await server.ssrLoadModule('/src/lib/calc.js')
    const { monthLabel } = await server.ssrLoadModule('/src/lib/format.js')
    const MONEY = ['overview', 'income', 'commitments', 'cards', 'loans', 'expenses']
    const pane = () => document.querySelector('[data-slot="tabs-content"][data-state="active"]')
    // Off the strip's header, because that is now the ONLY thing on a Money
    // screen that names the month — which is the reason it has to be asserted
    // rather than assumed.
    const shown = () =>
      pane().querySelector('[data-slot="month-strip"] [data-slot="month-name"]')?.textContent || ''
    // The oracle is the app's own definition of today's month, never a date typed
    // here: a literal would go stale on the first of every month.
    const { y: NY, m: NM } = currentMonth()
    const thisMonth = monthLabel(NY, NM)

    for (const id of MONEY) {
      await tick(() => ctl.setTab(id))
      if (shown() !== thisMonth) throw new Error(`${id}: shows ${shown() || 'no month'}, not ${thisMonth}`)
      // Nothing that steps a month may render on a Money screen. The Calendar has
      // its own prev/next and keeps them — it is not a Money screen and never
      // shared this month.
      for (const sel of ['[aria-label="Previous month"]', '[aria-label="Next month"]']) {
        if (pane().querySelector(sel)) throw new Error(`${id}: a month-stepping control survived (${sel})`)
      }
      const thisMonthButton = [...pane().querySelectorAll('button')].find(
        b => b.textContent.trim() === 'This month')
      if (thisMonthButton) throw new Error(`${id}: the stepper's "This month" button survived`)
    }
    console.log(`  month      all ${MONEY.length} Money screens show ${thisMonth}, and none can be stepped`)

    // The drill-down, and the containment that is the point of it. Picking a bar
    // moves Expenses and NOTHING ELSE — which is only testable because the other
    // five have no month of their own to be moved.
    await tick(() => ctl.setTab('expenses'))
    const keyOf = (yy, mm) => `${yy}-${String(mm + 1).padStart(2, '0')}`
    const back = new Date(Date.UTC(NY, NM - 1, 1))
    const key = keyOf(back.getUTCFullYear(), back.getUTCMonth())
    const bar = pane().querySelector(`button[data-month="${key}"]`)
    if (!bar) throw new Error(`expenses: the ${key} bar is not in the twelve-month chart`)
    await tick(() => bar.click())
    const drilled = monthLabel(back.getUTCFullYear(), back.getUTCMonth())
    if (shown() !== drilled) throw new Error(`expenses: drilled to ${key} and the strip says ${shown()}`)

    for (const id of MONEY.filter(x => x !== 'expenses')) {
      await tick(() => ctl.setTab(id))
      if (shown() !== thisMonth) {
        throw new Error(`${id}: followed the Expenses drill to ${shown()} — the month is not shared any more`)
      }
    }
    // AND THE DRILL DOES NOT SURVIVE LEAVING, deliberately. The tab panel
    // unmounts, the useState goes with it, and coming back lands on the month
    // that is happening. A drilled month that outlived a round trip through
    // Loans would be a log quietly showing July to a reader who believes every
    // Money screen is on today — which is the failure the stepper's removal is
    // for.
    await tick(() => ctl.setTab('expenses'))
    if (shown() !== thisMonth) {
      throw new Error(`expenses: came back on ${shown()} rather than ${thisMonth}`)
    }
    console.log(`  month      Expenses drills to ${drilled} alone; the other five stay on ${thisMonth}`)
  }

  // Expenses, and the reconciliation that makes a hand-kept log defensible.
  // Built on a local copy for the same reason the spending block is: a wallet in
  // the shared fixture would move the Money and Calendar figures asserted above.
  {
    const { expenseHistory, expensesFor } = await server.ssrLoadModule('/src/lib/calc.js')

    // Without a wallet there is nothing to reconcile against, and the log must
    // still work — that is the state every owner is in on day one.
    // FIXED dates, not ago(). Relative ones straddle a month boundary depending
    // on the day this runs, and expensesFor() reads one month at a time — with
    // ago(3) and ago(2) this asserted 240 and got 120 for most of every month.
    // Same trap that made the History assertion fail every Thursday.
    const iso = d => `2026-01-${String(d).padStart(2, '0')}`
    const bare = JSON.parse(JSON.stringify(STATE))
    bare.expenses = [
      { id: 1, date: iso(5), amount: 120, currency: 'MYR', category: 'GROCERIES', note: '' },
      { id: 2, date: iso(8), amount: 80, currency: 'MYR', category: 'FUEL', note: '' },
      { id: 3, date: iso(9), amount: 40, currency: 'MYR', category: 'GROCERIES', note: '' },
    ]
    const b = expensesFor(bare, 2026, 0, '2026-02-01')
    if (Math.abs(b.loggedRM - 240) > 0.005) throw new Error(`expenses: expected 240 logged, got ${b.loggedRM}`)
    if (b.categories.length !== 2) throw new Error(`expenses: expected 2 categories, got ${b.categories.length}`)
    // Biggest first, and the two GROCERIES rows must have been summed rather than listed twice.
    if (b.categories[0].category !== 'GROCERIES' || Math.abs(b.categories[0].amountRM - 160) > 0.005) {
      throw new Error(`expenses: groceries should lead at 160, got ${b.categories[0].category} ${b.categories[0].amountRM}`)
    }
    if (Math.abs(b.categories.reduce((s, c) => s + c.share, 0) - 1) > 1e-9) {
      throw new Error('expenses: category shares must sum to 1')
    }
    if (b.unloggedRM !== null || b.coveragePct !== null) {
      throw new Error('expenses: with no wallet there is nothing to reconcile against, expected nulls')
    }

    // The group layer, resolved from the stored category and nothing else.
    // Food is 120 + 40 and Transport is 80, so the groups must sort Food first.
    if (b.groups.length !== 2) throw new Error(`expenses: expected 2 groups, got ${b.groups.length}`)
    if (b.groups[0].group !== 'FOOD' || Math.abs(b.groups[0].amountRM - 160) > 0.005) {
      throw new Error(`expenses: Food should lead at 160, got ${b.groups[0].group} ${b.groups[0].amountRM}`)
    }
    // Every category of an open group is carried, the empty ones included — the
    // drill-down prints an em dash for those rather than dropping them.
    if (b.groups[0].categories.length !== 3) {
      throw new Error(`expenses: Food carries 3 categories, got ${b.groups[0].categories.length}`)
    }
    if (b.emptyGroupCount !== b.groupCount - 2) {
      throw new Error('expenses: the untouched groups must be counted, not dropped')
    }
    // Nothing logged before January, so there is no usual month and every figure
    // derived from one is null rather than zero.
    if (b.usualRM !== null || b.deltaVsUsual !== null || b.groups[0].delta !== null) {
      throw new Error('expenses: with no history there is nothing to compare against, expected nulls')
    }
    // The day strip: 31 cells, the 5th carrying the 120 and the whole strip
    // summing to the month.
    if (b.byDay.length !== 31) throw new Error(`expenses: January has 31 days, got ${b.byDay.length}`)
    if (Math.abs(b.byDay[4] - 120) > 0.005) {
      throw new Error(`expenses: the 5th should carry 120, got ${b.byDay[4]}`)
    }
    if (Math.abs(b.byDay.reduce((sum, v) => sum + v, 0) - b.loggedRM) > 0.005) {
      throw new Error('expenses: the day strip must sum to the month total')
    }

    // A USUAL MONTH IS AN AVERAGE OF THE MONTHS THAT WERE LOGGED, not of three
    // calendar months. October and December carry entries and November does not,
    // so the divisor is 2 and the usual month is 200 — a naive /3 would say
    // 133.33 and invent a rise in spending out of a gap in the habit.
    const hist = JSON.parse(JSON.stringify(bare))
    hist.expenses.push(
      { id: 4, date: '2025-12-04', amount: 300, currency: 'MYR', category: 'GROCERIES', note: '' },
      { id: 5, date: '2025-10-04', amount: 100, currency: 'MYR', category: 'FUEL', note: '' },
    )
    const h = expensesFor(hist, 2026, 0, '2026-02-01')
    if (h.monthsLogged !== 2) throw new Error(`expenses: expected 2 logged months, got ${h.monthsLogged}`)
    if (Math.abs(h.usualRM - 200) > 0.005) {
      throw new Error(`expenses: a usual month is 200 here, got ${h.usualRM}`)
    }
    if (Math.abs(h.deltaVsUsual - 0.2) > 1e-9) {
      throw new Error(`expenses: 240 against 200 is +20%, got ${h.deltaVsUsual}`)
    }
    // The group averages must sum to the headline, or a group could be up while
    // the month it belongs to was down and neither figure would be wrong.
    const usualSum = h.groups.reduce((sum, g) => sum + g.usualRM, 0)
    if (Math.abs(usualSum - h.usualRM) > 0.005) {
      throw new Error(`expenses: group averages sum to ${usualSum}, not ${h.usualRM}`)
    }
    const transport = h.groups.find(g => g.group === 'TRANSPORT')
    if (Math.abs(transport.delta - 0.6) > 1e-9) {
      throw new Error(`expenses: transport 80 against a usual 50 is +60%, got ${transport.delta}`)
    }
    // Per day divides by the days that HAVE HAPPENED. January is over on
    // 1 February, so all 31 of them.
    if (h.elapsedDays !== 31 || Math.abs(h.perDayRM - 240 / 31) > 1e-9) {
      throw new Error(`expenses: expected 240/31 a day over 31 days, got ${h.perDayRM} over ${h.elapsedDays}`)
    }

    // The history window: twelve months ending at the one on screen, and a month
    // nobody typed into is marked rather than drawn as a zero.
    const win = expenseHistory(hist, 2026, 0, 12, '2026-02-01')
    if (win.length !== 12 || win[11].key !== '2026-01' || win[0].key !== '2025-02') {
      throw new Error(`expenses: expected Feb 2025 to Jan 2026, got ${win[0].key} to ${win[11].key}`)
    }
    if (win.filter(x => x.logged).length !== 3) {
      throw new Error('expenses: three of the twelve months were logged')
    }
    const november = win.find(x => x.key === '2025-11')
    if (november.logged || november.totalRM !== 0) {
      throw new Error('expenses: a month with nothing typed is not a month with nothing spent')
    }

    // With a wallet and two readings the log is measured against what actually left.
    const rec = JSON.parse(JSON.stringify(bare))
    rec.expenses = [{ id: 9, date: iso(10), amount: 200, currency: 'MYR', category: 'GROCERIES', note: '' }]
    rec.assets.push({ id: 99, name: 'MAE', slug: 'mae', currency: 'MYR', liquidity: 'WALLET',
      kind: 'SAVINGS', archived: false, rate_basis: 'NONE', fiscal_year: '12-31', created_at: iso(1) })
    rec.assetEntries.unshift({ id: 990, asset_id: 99, type: 'BALANCE', date: iso(1), amount: 5000, source: 'manual' })
    rec.assetEntries.unshift({ id: 991, asset_id: 99, type: 'BALANCE', date: iso(21), amount: 5600, source: 'manual' })
    const r = expensesFor(rec, 2026, 0, '2026-02-01')
    if (r.unloggedRM === null) throw new Error('expenses: with two readings the reconciliation must compute')
    // The identity that makes the whole thing honest.
    if (Math.abs(r.loggedInWindowRM + r.unloggedRM - r.spend.spentRM) > 0.005) {
      throw new Error(`expenses: ${r.loggedInWindowRM} + ${r.unloggedRM} != ${r.spend.spentRM}`)
    }
    // Only expenses inside the readings' own window count — one outside it must not.
    const outside = JSON.parse(JSON.stringify(rec))
    outside.expenses.push({ id: 10, date: iso(28), amount: 999, currency: 'MYR', category: 'UNCATEGORISED', note: '' })
    const o = expensesFor(outside, 2026, 0, '2026-02-01')
    if (Math.abs(o.loggedInWindowRM - r.loggedInWindowRM) > 0.005) {
      throw new Error('expenses: an expense outside the reading window must not enter the reconciliation')
    }
    if (Math.abs(o.loggedRM - r.loggedRM - 999) > 0.005) {
      throw new Error('expenses: but it must still count in the month total')
    }
    // coveragePct is deliberately null here: this fixture owes more than it earns
    // so its residual is negative, and a percentage of a negative total says
    // nothing. The identity above is what the reconciliation actually rests on.
    console.log(
      `  expenses   ${b.categories.length} categories in ${b.groups.length} groups, ` +
      `usual ${h.usualRM.toFixed(2)} over ${h.monthsLogged} logged months, ` +
      `${r.loggedInWindowRM.toFixed(2)} logged + ${r.unloggedRM.toFixed(2)} unlogged ` +
      `= ${r.spend.spentRM.toFixed(2)} inferred`,
    )
  }

  // Reach, not just balance. EPF is LOCKED in the fixture and every other
  // account omits `liquidity` entirely, so this also proves the absent-column
  // fallback reads as SAVINGS rather than undefined.
  {
    const { assetsTotal } = await server.ssrLoadModule('/src/lib/calc.js')
    const t = assetsTotal(STATE)
    if (Math.abs(t.reachableRM + t.lockedRM - t.valueRM) > 0.005) {
      throw new Error(`reach: ${t.reachableRM} + ${t.lockedRM} != ${t.valueRM}`)
    }
    if (!(t.lockedRM > 0)) throw new Error('reach: the fixture has a LOCKED account and must report it')
    if (!(t.reachableRM > 0)) throw new Error('reach: the fixture has reachable accounts too')
    const epf = t.rows.find(r => r.name === 'EPF')
    if (epf.liquidity !== 'LOCKED') throw new Error(`reach: EPF should be LOCKED, got ${epf.liquidity}`)
    const asb = t.rows.find(r => r.name === 'ASB')
    if (asb.liquidity !== 'SAVINGS') {
      throw new Error(`reach: a row with no liquidity must default to SAVINGS, got ${asb.liquidity}`)
    }
    console.log(`  reach      ${t.reachableRM.toFixed(2)} within reach, ${t.lockedRM.toFixed(2)} locked`)
  }

  // Spending, inferred. Built on a LOCAL copy of the fixture rather than by
  // adding a wallet to the shared one: a WALLET is skipped by moneyByDay(), so
  // putting one in STATE would move the Money and Calendar figures asserted
  // above and this block would be paid for in unrelated churn.
  {
    const { spendingFor, SPEND_UNKNOWN, walletBalanceOn } =
      await server.ssrLoadModule('/src/lib/calc.js')
    const clone = () => JSON.parse(JSON.stringify(STATE))
    const Y = 2026
    const M = 0 // January, so the window sits wholly in the past whenever this runs
    const iso = d => `2026-01-${String(d).padStart(2, '0')}`

    // No wallet at all — the state every existing install is in.
    const a = spendingFor(clone(), Y, M, '2026-02-01')
    if (a.spentRM !== null || a.reason !== SPEND_UNKNOWN.NO_WALLET) {
      throw new Error(`spend: with no wallet expect null/NO_WALLET, got ${a.spentRM}/${a.reason}`)
    }

    // A wallet, but only one reading. One point cannot describe a change.
    const s1 = clone()
    s1.assets.push({ id: 99, name: 'MAE', slug: 'mae', currency: 'MYR', liquidity: 'WALLET',
      kind: 'SAVINGS', archived: false, rate_basis: 'NONE', fiscal_year: '12-31', created_at: iso(1) })
    s1.assetEntries.unshift({ id: 990, asset_id: 99, type: 'BALANCE', date: iso(1), amount: 5000, source: 'manual' })
    const b = spendingFor(s1, Y, M, '2026-02-01')
    if (b.spentRM !== null || b.reason !== SPEND_UNKNOWN.NO_CLOSING_READING) {
      throw new Error(`spend: one reading expect null/NO_CLOSING_READING, got ${b.spentRM}/${b.reason}`)
    }

    // Two readings. The identity must hold exactly, and the window must be the
    // readings' own rather than the calendar month's.
    const s2 = JSON.parse(JSON.stringify(s1))
    s2.assetEntries.unshift({ id: 991, asset_id: 99, type: 'BALANCE', date: iso(21), amount: 5600, source: 'manual' })
    const c = spendingFor(s2, Y, M, '2026-02-01')
    if (c.reason) throw new Error(`spend: two readings should compute, got ${c.reason}`)
    if (c.from !== iso(1) || c.to !== iso(21)) throw new Error(`spend: window ${c.from}..${c.to}`)
    if (c.days !== 20) throw new Error(`spend: expected a 20-day window, got ${c.days}`)
    if (Math.abs(c.walletDeltaRM - 600) > 0.005) throw new Error(`spend: wallet delta ${c.walletDeltaRM}`)
    const identity = c.inflowRM - c.committedRM - c.savedRM - c.walletDeltaRM
    if (Math.abs(identity - c.spentRM) > 1e-9) throw new Error(`spend: identity ${identity} != ${c.spentRM}`)

    // A HAND-ENTERED EPF CONTRIBUTION MUST NOT COUNT AS SAVING.
    //
    // Nothing books EPF from a payslip any more, so the owner records it on
    // Assets — and net pay already excludes it. Counting that deposit here would
    // subtract the same ringgit twice and understate what the month was lived on.
    // Two entries, identical but for `source`, are the only way to show the
    // exclusion is the source's doing and not the amount's or the account's.
    const withSource = src => {
      const s = JSON.parse(JSON.stringify(s2))
      s.assetEntries.unshift({ id: 993, asset_id: 3, type: 'DEPOSIT', date: iso(10), amount: 400, source: src })
      return spendingFor(s, Y, M, '2026-02-01')
    }
    const paid = withSource('manual')
    const fromPay = withSource('payroll')
    if (Math.abs(paid.savedRM - (c.savedRM + 400)) > 0.005) {
      throw new Error(`spend: a manual deposit must count — ${c.savedRM} + 400 != ${paid.savedRM}`)
    }
    if (Math.abs(fromPay.savedRM - c.savedRM) > 0.005) {
      throw new Error(`spend: a payroll deposit must not count — ${c.savedRM} != ${fromPay.savedRM}`)
    }
    // And the identity still has to close, or the 400 has merely moved into spent.
    if (Math.abs(fromPay.spentRM - c.spentRM) > 0.005) {
      throw new Error(`spend: a payroll deposit moved spending ${c.spentRM} -> ${fromPay.spentRM}`)
    }

    // A reading resets rather than accumulates — that is the whole point of the
    // type, and a DEPOSIT after one must build on the reading, not on history.
    const s3 = JSON.parse(JSON.stringify(s2))
    s3.assetEntries.unshift({ id: 992, asset_id: 99, type: 'DEPOSIT', date: iso(25), amount: 100, source: 'manual' })
    const after = walletBalanceOn(s3, iso(25))
    if (Math.abs(after - 5700) > 0.005) {
      throw new Error(`spend: a reading must reset — expected 5700 after 5600 + 100, got ${after}`)
    }

    console.log(`  spending   null without a wallet, ${c.spentRM.toFixed(2)} over ${c.days} days with two readings`)
    console.log(`  epf entry  a payroll deposit adds 0.00 to savings where a manual one adds 400.00`)
  }

  // Private mode, driven through the store exactly as the toggle does.
  //
  // Worth a check in the mounted app rather than a unit test of the formatters,
  // because the risky part is not the masking — it is that format.js holds a
  // module flag which VantageProvider writes DURING render. If that write ever
  // moves into an effect, the formatters stay correct and the screen still shows
  // a frame of real figures. Only a render can catch that.
  {
    const paneText = () =>
      document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent
    await tick(() => ctl.setTab('assets'))
    const open = paneText()
    if (!open.includes('RM ')) throw new Error('private: no figures on Assets to hide in the first place')

    await tick(() => ctl.togglePrivate())
    const hidden = paneText()
    if (!hidden.includes('••••')) throw new Error('private: toggled on but nothing is masked')

    // Every rendered MONEY token the open pane showed must be gone. Harvested
    // from the render rather than listed by hand: a hardcoded list drifts away
    // from the fixture and then passes while checking nothing, which is worse
    // than no check at all. The count guard is what stops that happening here.
    //
    // Anchored on the currency symbol, so it matches what fmt() emits and not
    // every decimal on the page. FREE-TEXT NOTES ARE NOT MASKED and cannot be —
    // a note reading "2025 · 5.75 sen" is prose the owner typed, never passed
    // through a formatter, and blanking all prose would leave a ledger of dots
    // with no way to tell one row from another. A bare \d\.\d\d pattern here
    // matched that note and failed, which is how this was found.
    const figures = [...new Set(open.match(/(?:RM\s|\$)[\d,]+\.\d{2}/g) || [])]
    if (figures.length < 4) {
      throw new Error(`private: only ${figures.length} figures on Assets — too few to be a real check`)
    }
    for (const leak of figures) {
      if (hidden.includes(leak)) throw new Error(`private: "${leak}" still on screen while masked`)
    }
    // The month names and dates in the ledger are not the private part.
    if (!/Sept|Aug|Jul/.test(hidden)) throw new Error('private: dates were masked too')

    await tick(() => ctl.togglePrivate())
    if (paneText() !== open) throw new Error('private: toggling back did not restore the figures')
    console.log(`  private    masks all ${figures.length} figures on Assets, keeps dates, and reverses`)
  }
  await tick(() => ctl.setTab('dashboard'))

  // The two halves of Portfolio that a tab click away, and the panel behind a
  // holding's name. Local state, so the store cannot drive any of it — these
  // click what the owner clicks.
  {
    await tick(() => ctl.setTab('portfolio'))
    const pane = () => document.querySelector('[data-slot="tabs-content"][data-state="active"]')
    const button = re => [...pane().querySelectorAll('button')].find(b => re.test(b.textContent))

    // The holding name IS the control — there is no View button to find.
    const holding = pane().querySelector('table button')
    if (!holding) throw new Error('portfolio: no holding row to open')
    await tick(() => holding.click())
    const panel = document.querySelector('[data-slot="sheet-content"]')
    if (!panel) throw new Error('portfolio: clicking a holding opened no panel')
    for (const n of ['Paid you, net', 'Quoted yield', 'Per share trend', 'Owed to you', 'Withheld']) {
      if (!panel.textContent.includes(n)) throw new Error(`portfolio panel: missing "${n}"`)
    }
    // The panel is the income history, so it has to carry the payments as well
    // as the analytics above them.
    if (!panel.textContent.includes('Per share') || !panel.textContent.includes('Net'))
      throw new Error('portfolio panel: the payment table did not render')
    await tick(() => document.querySelector('[data-slot="sheet-content"] button[type="button"]')?.click())

    await tick(() => button(/^Ledger/)?.click())
    const ledger = pane().textContent
    // 'Wallet after' is the running balance this screen derives; 'Columns' and
    // 'Per page' prove the toolbar and the pager came with it.
    for (const n of ['Wallet after', 'Columns', 'Per page', 'Add movement', 'running balance']) {
      if (!ledger.includes(n)) throw new Error(`portfolio ledger: missing "${n}"`)
    }
    console.log('  portfolio  holdings, the income panel, and the ledger all open')
  }
  await tick(() => ctl.setTab('dashboard'))

  // each form must open through the store opener and close again
  const FORMS = [['openInstrument', 'Add instrument'], ['openTransaction', 'Add transaction'], ['openCash', 'Add cash movement'], ['openAssetEntry', 'Add entry'], ['openAsset', 'Add account'], ['openCommitment', 'Add commitment'], ['openIncome', 'Add income source'],
    ['openIncomeEvent', 'Record a payment'], ['openGoal', 'New goal'],
    ['openCardPlan', 'Add an instalment plan'], ['openCardStatement', 'Record a statement'],
    ['openCardPayment', 'Pay this card'], ['openStatementImport', 'Import a statement']]
  for (const [open, title] of FORMS) {
    await tick(() => ctl[open]())
    if (!document.body.textContent.includes(title)) throw new Error(`${open}() did not render "${title}"`)
    // Every form is a side panel now. Asserting the slot catches a form that
    // silently falls back to a centred dialog, which is the exact drift this
    // change was made to remove.
    if (!document.querySelector('[data-slot="sheet-content"]')) {
      throw new Error(`${open}() rendered "${title}" but not as a side panel`)
    }
    await tick(() => ctl.closeModal())
    if (document.body.textContent.includes(title)) throw new Error(`closeModal() left "${title}" mounted`)
  }

  // A HAND-ENTERED EPF CONTRIBUTION IS NOT AUTOMATIC.
  //
  // The fixture's payroll deposit was badged AUTO with a tooltip saying the
  // contribution books itself — true while a payslip wrote the row, and the last
  // surface still saying it after the write was removed. It is typed on Assets
  // now, exactly as an opening balance is, and an opening balance has never
  // carried a badge. Asserted on the rendered pane because the badge is a map
  // lookup: nothing but a render can show which values reach it.
  {
    await tick(() => ctl.setTab('history'))
    const pane = document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent
    if (!pane.includes('EPF')) throw new Error('history: the payroll deposit is not on this screen to check')
    if (pane.includes('AUTO')) {
      throw new Error('history: a contribution you typed must not be badged as one something else wrote')
    }
    // The badge that IS still earned, so the removal did not simply empty the map.
    if (!pane.includes('SYNCED')) throw new Error('history: a synced row must still say so')
    console.log('  history    a payroll deposit carries no AUTO badge; SYNCED still does')
    await tick(() => ctl.setTab('dashboard'))
  }

  // The third source on an asset deposit, which is the only way an EPF
  // contribution can be recorded now that no payslip writes one. Radix keeps a
  // closed Select's items out of the DOM, so the option is proved by opening the
  // form ON it — the trigger renders the chosen item's own copy, which is the
  // thing that has to say the money never passed through your wallet.
  await tick(() => ctl.openAssetEntry({ source: 'payroll' }))
  if (!document.body.textContent.includes('From your pay — EPF, deducted before you saw it')) {
    throw new Error('asset entry: no payroll option, so a hand-recorded EPF contribution cannot be marked')
  }
  if (!document.body.textContent.includes('never as money you spent this month')) {
    throw new Error('asset entry: the payroll/opening option carries no explanation of what it excludes')
  }
  // Named, not counted. Radix keeps a closed Select's other items out of the DOM,
  // so "the last two" pointed at nothing the reader could see.
  if (!document.body.textContent.includes('An opening balance and money from your pay')) {
    throw new Error('asset entry: the hint counts the non-flow options instead of naming them')
  }
  await tick(() => ctl.closeModal())

  // The income form can now make the foreign source that was API-only. Same
  // Radix problem as above — a closed Select keeps its items out of the DOM — so
  // the form is opened ON the option and the trigger renders the chosen code.
  // The hint is asserted too: it is the form's half of the promise the payment
  // sheet makes, and a field that took a currency without saying what happens to
  // the figure is how this got shipped write-only the first time.
  await tick(() => ctl.openIncome({ currency: 'USD' }))
  {
    const sheet = document.querySelector('[data-slot="sheet-content"]').textContent
    if (!sheet.includes('Currency')) throw new Error('income form: no currency field, so a USD source is still API-only')
    if (!sheet.includes('USD')) throw new Error('income form: the currency field does not carry the chosen code')
    if (!sheet.includes('converted at the rate on the day it landed, and both figures are kept')) {
      throw new Error('income form: the currency field promises nothing about conversion')
    }
    console.log('  income form currency is askable, and says what happens to the figure')
  }
  await tick(() => ctl.closeModal())

  // Ctrl-B folds the rail, folds it back, and is ignored while you are typing.
  //
  // Asserted on the aside's own width class rather than on the store, because
  // the failure this guards against is the shortcut firing and nothing moving:
  // a handler still bound to a toggle that no longer reaches the element passes
  // every assertion written against state.
  {
    const railWide = () => document.querySelector('aside').className.includes('w-[212px]')
    const press = el =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))

    const open = railWide()
    if (!open) throw new Error('rail: the fixture starts folded, so folding proves nothing')
    await tick(() => press(window))
    if (railWide()) throw new Error('rail: Ctrl-B did not fold the rail')

    // The same pair means bold in a text field, so a shortcut that fires there
    // folds the navigation out from under a half-typed sentence. Dispatched ON
    // an input, because the guard reads the event's target and nothing else —
    // firing at the window would pass while the guard did no work at all.
    const probe = document.createElement('input')
    document.body.appendChild(probe)
    await tick(() => press(probe))
    if (railWide()) throw new Error('rail: Ctrl-B inside a text field folded the rail')
    probe.remove()

    await tick(() => press(window))
    if (!railWide()) throw new Error('rail: Ctrl-B folds but does not unfold')
    console.log('  rail       Ctrl-B folds and unfolds it, and is ignored while typing')
  }

  // The rail reads as three runs, in order.
  //
  // Asserted on the headings rather than on TABS, and on their ORDER rather than
  // their presence, because the failure here is silent: a heading is what starts
  // a run, so an entry that loses its group does not disappear — it joins the run
  // above and reads as something it is not. "Portfolio" also names a screen
  // inside its own run, so a substring check over the rail would pass with every
  // heading gone.
  {
    const runs = [...document.querySelectorAll('aside .eyebrow')]
      .map(e => e.textContent.trim())
      .filter(t => t !== 'personal finance')
    const want = ['Portfolio', 'Planning', 'Money']
    if (runs.join('|') !== want.join('|')) {
      throw new Error(`rail: runs are [${runs.join(', ') || 'unlabelled'}], expected [${want.join(', ')}]`)
    }
    console.log('  rail       three runs, in order: ' + runs.join(', '))
  }

  // Settings hangs at the foot rather than trailing the run of screens, because
  // it is the drawer under them and not the last place you go to read something.
  {
    const settings = [...document.querySelectorAll('aside button')]
      .find(b => b.textContent.includes('Settings'))
    if (!settings) throw new Error('rail: no Settings entry to check')
    if (!settings.className.includes('mt-auto')) {
      throw new Error('rail: Settings is not pinned to the foot, so it reads as the last screen')
    }
    console.log('  rail       Settings is pinned to the foot')
  }

  // The pay day resolved to a date, and the clamp it inherits from dueDayIn.
  // Asserted directly rather than through a row, because the interesting cases
  // are the ones a fixture will never happen to contain: a 31st in a 30-day
  // month, the pay day landing on today, and a December that rolls the year.
  {
    const { nextPayDate } = await server.ssrLoadModule('/src/lib/calc.js')
    const cases = [
      [25, '2026-09-07', '2026-09-25', 'a day still ahead stays in this month'],
      [25, '2026-09-25', '2026-09-25', 'today counts as next, not four weeks away'],
      [25, '2026-09-26', '2026-10-25', 'a day just passed rolls to next month'],
      [31, '2026-09-07', '2026-09-30', 'the 31st clamps to a 30-day September'],
      [-1, '2026-09-07', '2026-09-30', 'last working day resolves to the last day'],
      [5, '2026-12-06', '2027-01-05', 'December rolls the year, not only the month'],
    ]
    for (const [day, now, want, why] of cases) {
      const got = nextPayDate(day, now)
      if (got !== want) {
        throw new Error(`nextPayDate(${day}, ${now}) = ${got}, expected ${want} — ${why}`)
      }
    }
    if (nextPayDate(null, '2026-09-07') !== null) {
      throw new Error('nextPayDate: an irregular source has no pay day and must resolve to nothing')
    }
    console.log('  next pay   clamps short months, counts today, and rolls the year')
  }

  // Both figures were derivable and neither was ever said: the pay day was
  // printed as a rule with no date in it, and employerCostOf() had no caller
  // anywhere in the repo.
  {
    await tick(() => ctl.setTab('income'))
    const pane = document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent
    if (!pane.includes('· next ')) {
      throw new Error('income: no row resolves its pay day to a date')
    }
    if (!pane.includes('cost your employer')) {
      throw new Error('income: employerCostOf() still has no caller, so the employer total is unsaid')
    }
    console.log('  income     rows carry the next pay date and what the source cost to pay')
  }

  // Plastic and limits are different quantities, and until card_count existed
  // nothing in the app could tell them apart — Cards.jsx counted ACCOUNTS and
  // called them cards. The fixture has one account carrying two, so a screen that
  // still conflates the two prints "1 account" with no card clause and fails here.
  {
    await tick(() => ctl.setTab('cards'))
    const pane = document.querySelector('[data-slot="tabs-content"][data-state="active"]').textContent
    if (!pane.includes('1 account')) throw new Error('cards: the account count is not on the screen')
    if (!pane.includes('and 2 cards')) {
      throw new Error('cards: two cards on one limit are not said, so plastic still reads as accounts')
    }
    console.log('  cards      one account, two cards, and the screen says both')
  }

  /* ── the month strip, on all six Money screens ──────────────────────────── */
  //
  // The strip is the sentence the six Money screens are clauses of, and since the
  // stepper came off it is also the only thing that names the month. So what is
  // asserted here is the four ways it stops being one: it goes missing on a
  // screen, it names a month the page beneath it is not showing, it prints a
  // share its own bar does not draw, or it puts a figure on a month nobody has
  // measured.
  {
    const MONEY = ['overview', 'income', 'commitments', 'cards', 'loans', 'expenses']
    const pane = () => document.querySelector('[data-slot="tabs-content"][data-state="active"]')
    const strip = () => pane().querySelector('[data-slot="month-strip"]')
    const stripText = () => strip().textContent
    const named = () => strip().querySelector('[data-slot="month-name"]').textContent

    // Every Money screen, on the shared fixture — which has no wallet, so this
    // is also the refusal rendering on screens whose own data is missing too
    // (Cards and Loans reach the strip from their empty states as well).
    for (const id of MONEY) {
      await tick(() => ctl.setTab(id))
      if (!strip()) throw new Error(`strip: missing on ${id}`)
      if (!stripText().includes('The month, end to end · declared')) {
        throw new Error(`strip: no eyebrow on ${id}`)
      }
      if (!stripText().includes('every page shows its own segment of this')) {
        throw new Error(`strip: no note on ${id}`)
      }
      if (!named().trim()) {
        throw new Error(`strip: names no month on ${id}, and nothing else on the page does`)
      }
    }
    console.log(`  strip      the eyebrow, the month and the note render on all ${MONEY.length} Money screens`)

    // NOT PINNED, and that is a rule rather than a preference. The stepper it
    // replaced was one 52px row of CONTROLS, which have to stay reachable; this
    // is five tiles of STATEMENT, read once at the top. Measured in a browser
    // while it was sticky it froze 218px over a 1366x768 window and 690px over a
    // 430x932 one — 74% of a phone viewport before the screen's own content got a
    // pixel. jsdom lays nothing out, so what is asserted is the class that caused
    // it.
    for (const id of MONEY) {
      await tick(() => ctl.setTab(id))
      if (/(^|\s)sticky(\s|$)/.test(strip().className)) {
        throw new Error(`strip: pinned on ${id} — five tiles frozen over the screen's own content`)
      }
    }
    console.log('  strip      scrolls with the page on all 6, rather than freezing five tiles over it')

    // ── ONCE PER SCREEN. Overview carries the refusal twice over: the strip
    // states it with the control that fixes it, and the column below states why
    // its own figures are absent. Both used to print the whole of
    // SPEND_WHY[reason], so the same sentence about the same missing reading
    // appeared forty words apart on one page and only one of the two offered the
    // form. The strip is the one that keeps it, because the strip has the button.
    {
      await tick(() => ctl.setTab('overview'))
      const why = 'so there is nothing to measure the month against'
      const seen = pane().textContent.split(why).length - 1
      if (seen !== 1) throw new Error(`overview: the refusal is stated ${seen} times, and once is the number`)
      if (!strip().textContent.includes(why)) {
        throw new Error('overview: the one statement of the refusal is not the one with the button')
      }
      console.log('  strip      the refusal is stated once on Overview, by the surface that can fix it')
    }

    const { currentMonth, overviewRows } = await server.ssrLoadModule('/src/lib/calc.js')
    const { dfmt, fmt, monthLabel, ordinal } = await server.ssrLoadModule('/src/lib/format.js')

    // A month wholly in the past for the measurable case, so `ceiling` is the
    // month end and both readings sit inside the window whatever day of the month
    // this runs on. The same trap the expense block documents: relative dates
    // straddle a month boundary and the assertion then fails on a few days in
    // thirty. Expenses is the one screen that can be shown such a month, and it
    // is shown it the only way there is — by drilling its own chart.
    const p2 = n => String(n).padStart(2, '0')
    const { y: NY, m: NM } = currentMonth()
    const prev = new Date(Date.UTC(NY, NM - 1, 1))
    const PY = prev.getUTCFullYear()
    const PM = prev.getUTCMonth()
    const pd = d => `${PY}-${p2(PM + 1)}-${p2(d)}`
    const keyOf = (yy, mm) => `${yy}-${p2(mm + 1)}`

    const assets0 = STATE.assets
    const entries0 = STATE.assetEntries
    const events0 = STATE.incomeEvents
    const txns0 = STATE.transactions
    const wallet = { id: 99, name: 'MAE', slug: 'mae', currency: 'MYR', liquidity: 'WALLET',
      kind: 'SAVINGS', institution: '', account_ref: '', unit_label: '', unit_cap: null,
      fiscal_year: '12-31', rate_basis: 'NONE', rate_quote: 'PERCENT', last_rate: null,
      last_bonus: null, sort_order: 9, archived: false, created_at: pd(1) }
    const reading = (id, date, amount) => ({ id, asset_id: 99, slug: 'mae', type: 'BALANCE',
      date, amount, note: '', source: 'manual', ext_id: null })

    // ── one reading: the state the live database is in every day until the owner
    // records the second one, and the one the strip has to be good at. One
    // reading anchors a window and never closes it, wherever it is dated, so this
    // holds on any day of any month.
    STATE.assets = [...assets0, wallet]
    STATE.assetEntries = [reading(990, ago(3), 5000), ...entries0]
    await act(async () => { await ctl.reload() })
    await tick(() => ctl.setTab('overview'))
    {
      const t = stripText()
      if (strip().querySelectorAll('[data-segment]').length) {
        throw new Error('strip: an unmeasurable month must draw no segment tiles')
      }
      if (/\d%/.test(t)) throw new Error(`strip: a share of an unknown was printed — "${t}"`)
      if (/RM\s*[\d•]/.test(t)) throw new Error(`strip: a figure was invented — "${t}"`)
      if (!t.includes('has not been split into its five segments yet')) {
        throw new Error(`strip: the refusal does not say what is missing — "${t}"`)
      }
      // It still says WHICH month it is refusing to split, because nothing else
      // on the page does.
      if (named() !== monthLabel(NY, NM)) {
        throw new Error(`strip: the refusal names ${named()} rather than ${monthLabel(NY, NM)}`)
      }
      // What to record, and the control that records it — not just a sentence.
      if (!t.includes('No balance reading since this month')) {
        throw new Error('strip: the refusal does not name the reading that is missing')
      }
      if (!t.includes('Add a reading')) throw new Error('strip: the refusal offers no way to fix it')

      // AND THE FORM IT OPENS IS THE FORM IT PROMISED. The sheet defaults to the
      // first account in the list and to today, and here the first account is a
      // SAVINGS one — a BALANCE against it closes no wallet window, so a reader
      // who did exactly what the strip asked would come back to the same refusal.
      // The wallet is deliberately appended AFTER the fixture's own accounts so
      // the default and the right answer cannot be the same row by accident.
      if (STATE.assets[0].id === wallet.id) {
        throw new Error('strip: the wallet is first in the list, so this proves nothing about the default')
      }
      const add = [...strip().querySelectorAll('button')].find(b => b.textContent.trim() === 'Add a reading')
      await tick(() => add.click())
      {
        const sheet = document.querySelector('[data-slot="sheet-content"]')
        const acct = sheet.querySelector('[role="combobox"]')?.textContent || ''
        if (acct !== wallet.name) {
          throw new Error(`strip: "Add a reading" opens on ${acct || 'no account'}, not the wallet ${wallet.name}`)
        }
        // Dated at the end of the window that is open — today, for a month still
        // running — because a reading cannot exist for a day that has not
        // happened and one dated before the opening reading closes nothing.
        const date = [...sheet.querySelectorAll('input')].find(i => i.type === 'date')?.value
        if (date !== isoOf(NOW)) {
          throw new Error(`strip: "Add a reading" is dated ${date}, not ${isoOf(NOW)}`)
        }
      }
      await tick(() => ctl.closeModal())
      console.log('  strip      one reading: no figure, no percentage, and the form that closes it — on the wallet, dated to close it')
    }

    // ── THREE readings, plus a payslip and a savings deposit dated inside the
    // window the first two bracket, so every segment of the previous month has
    // something real in it. The third sits after this month opened: without it
    // the five screens pinned to today would all be showing the refusal, and the
    // "which tile is lit" pass below would have no tiles to read.
    const pay = { id: 900, source_id: 1, name: 'Day job', kind: 'EMPLOYMENT', cadence: 'MONTHLY',
      date: pd(10), gross: 8500, epf_employee: 935, socso_employee: 29.75, eis_employee: 11.9,
      skbbk: 44.65, pcb: 609.2, zakat: 0, other_deducted: 0, epf_employer: 1020,
      socso_employer: 104.15, eis_employer: 11.9, note: '', source: 'manual', ext_id: null }
    STATE.assetEntries = [
      reading(993, ago(1), 4050),
      reading(991, pd(24), 4200),
      { id: 992, asset_id: 1, slug: 'asb', type: 'DEPOSIT', date: pd(12), amount: 500, note: '',
        source: 'manual', ext_id: null },
      reading(990, pd(2), 5000),
      ...entries0,
    ]
    STATE.incomeEvents = [pay, ...events0]
    await act(async () => { await ctl.reload() })

    // THE DRILL IS HOW A PAST MONTH GETS ON SCREEN NOW, so the assertions that
    // follow ride on it — and prove it on the way past.
    const drillTo = async (yy, mm) => {
      await tick(() => ctl.setTab('expenses'))
      // `button[data-month]`, NEVER a bare attribute selector. The strip carries
      // its own month too, and it precedes the chart in the pane — so
      // `[data-month="…"]` resolved to the strip's <section>, whose .click() does
      // nothing, and this helper reported a drill it had not performed.
      await tick(() => pane().querySelector(`button[data-month="${keyOf(yy, mm)}"]`).click())
      if (named() !== monthLabel(yy, mm)) {
        throw new Error(`strip: drilled to ${keyOf(yy, mm)} and the header says ${named()}`)
      }
    }
    await drillTo(PY, PM)

    // The oracle is overviewRows() over the same fixture, never a number typed
    // here: a copied figure stops testing the derivation the moment either moves.
    const view = overviewRows({ ...STATE }, PY, PM)
    if (view.reason) throw new Error(`strip: two readings should measure, got ${view.reason}`)
    const rowOf = k => view.rows.find(r => r.key === k).rm
    // "What stayed" is the wallet row with the other sign, and that is asserted
    // rather than assumed — the tile is labelled by what the wallet KEPT while
    // the column states what it GAVE UP, and a strip that got this backwards
    // would still add up.
    if (Math.abs(view.spend.walletDeltaRM + rowOf('wallet')) > 1e-9) {
      throw new Error('strip: the wallet row is not the delta negated')
    }
    // NEGATED, and that is the point of the row rather than a detail of it.
    // overviewRows() states `spent` POSITIVE because its column has subtracted
    // its way down to it; the tile sits in a row between two figures carrying a
    // minus, so monthSegments() flips it — money that left the month printed like
    // money that arrived makes the largest outflow read as the second largest
    // inflow. This line used to hold the un-negated row and passed anyway,
    // because the check below was `includes()` and "−RM 6,229.53" contains
    // "RM 6,229.53": the negation the strip depends on was untested.
    const EXPECT = [
      ['income', rowOf('inflow')],
      ['commitments', rowOf('committed')],
      ['saved', rowOf('saved')],
      ['expenses', -rowOf('spent')],
      ['stayed', view.spend.walletDeltaRM],
    ]

    const tiles = () => [...strip().querySelectorAll('[data-segment]')]
    if (tiles().length !== 5) throw new Error(`strip: expected 5 tiles, got ${tiles().length}`)
    if (!view.incomeRM) throw new Error('strip: the fixture must earn something, or no share is testable')
    let checked = 0
    for (const [key, rm] of EXPECT) {
      const el = tiles().find(t => t.dataset.segment === key)
      if (!el) throw new Error(`strip: no ${key} tile`)
      // STRICT EQUALITY, on the figure element alone. `includes()` over the whole
      // tile cannot see a sign — fmt() puts the U+2212 OUTSIDE the symbol, so
      // "−RM 6,229.53".includes("RM 6,229.53") is true — and the sign is the one
      // thing about four of these five tiles that a derivation can get wrong
      // while still adding up.
      const want = fmt(rm, 'MYR')
      const got = el.querySelector('.num').textContent
      if (got !== want) {
        throw new Error(`strip: ${key} should print ${want}, prints ${got}`)
      }
      const bar = el.querySelector('div[style*="width"]')
      if (!bar) throw new Error(`strip: ${key} has a share and no bar to draw it`)
      // Signed, so a negative width would be read rather than skipped by the
      // pattern. Before the denominator was guarded, a window that declared less
      // than nothing produced `width: -100%` — invalid, dropped by the browser,
      // and drawn as a FULL rail under a label reading −100.0%.
      const drawn = Number(/width:\s*(-?[\d.]+)%/.exec(bar.getAttribute('style'))[1])
      // TWO ORACLES FROM ONE NUMBER, and they are deliberately not the same one.
      // The share is printed TRUE and drawn CLAMPED: a month whose living cost
      // ran to 110% of what arrived says 110.0% and fills the rail, because a bar
      // cannot be drawn past its own track and the overrun is most of the point.
      // Comparing the printed figure against the clamped oracle would have failed
      // that month, which is the one this strip exists to show.
      const trueShare = (Math.abs(rm) / view.incomeRM) * 100
      if (Math.abs(drawn - Math.min(100, trueShare)) > 0.005) {
        throw new Error(`strip: ${key} draws ${drawn}% where the clamped share is ${Math.min(100, trueShare)}%`)
      }
      // THE ONE THAT MATTERS: the width and the words are one number, or they
      // are §2.4 all over again. Rounded to the digit the tile prints.
      // Off the sub-line alone. Read against the whole tile, "RM 5,718.10" and
      // "18.1%" run together into a percentage neither of them is.
      const printed = /(\d+\.\d)%/.exec(el.querySelector('[data-slot="segment-share"]').textContent)
      if (printed) {
        if (Math.abs(Number(printed[1]) - trueShare) > 0.051) {
          throw new Error(`strip: ${key} prints ${printed[1]}% where its share is ${trueShare}%`)
        }
        checked += 1
      }
    }
    if (checked < 3) throw new Error(`strip: only ${checked} tiles printed a share to check the bar against`)
    console.log(
      `  strip      five tiles match overviewRows() and ${checked} bars draw exactly what they print`,
    )

    // The facts under the figures are bound to the fixture, not to the canvas's
    // August. Every one of them is derived here from the rows the strip reads.
    const source = STATE.incomeSources.find(s => s.id === pay.source_id)
    {
      const income = tiles().find(t => t.dataset.segment === 'income').textContent
      if (!income.includes(source.name)) throw new Error(`strip: the income tile does not name ${source.name}`)
      const saved = tiles().find(t => t.dataset.segment === 'saved').textContent
      const dest = STATE.assets.find(a => a.id === 1).name
      if (!saved.includes(dest)) throw new Error(`strip: the savings tile does not name ${dest}`)

      // NO PAY DAY IS CLAIMED HERE, and that is the assertion rather than a gap
      // in it. This window holds the payslip AND the broker's weekly
      // distributions — two arrivals on two different days — so "lands on the
      // 25th" would be dating a figure only part of which lands then. The broker
      // is named instead: it paid, and it has no income source to put a name in
      // the list, so without its own clause the employer would stand over its
      // money.
      if (!income.includes('distributions from the broker')) {
        throw new Error(`strip: a month part-paid by the broker does not say so — "${income}"`)
      }
      if (/lands on the/.test(income)) {
        throw new Error(`strip: a pay day was dated over a figure two streams paid — "${income}"`)
      }
      console.log('  strip      two streams: the broker is named and no single pay day is claimed')
    }

    // ── the same window with the distributions taken out, so ONE stream paid it
    // and the clause is owed. The pay day is a fact about the SOURCE: it must be
    // the source's own 25th and never the payslip's date, which is deliberately
    // the 10th here so the two cannot be confused for each other.
    STATE.transactions = txns0.filter(t => t.side !== 'DIV')
    await act(async () => { await ctl.reload() })
    await drillTo(PY, PM)
    {
      const income = tiles().find(t => t.dataset.segment === 'income').textContent
      if (!income.includes(`lands on the ${ordinal(source.pay_day)}`)) {
        throw new Error(`strip: one stream and the tile still drops its pay day — "${income}"`)
      }
      if (income.includes(`lands on the ${ordinal(10)}`)) {
        throw new Error('strip: the pay day came off the payslip rather than off the source')
      }
      if (income.includes('distributions from the broker')) {
        throw new Error('strip: the broker is named in a month it paid nothing')
      }
      console.log(
        `  strip      one stream: the tile carries ${source.name}'s own pay day, the ${ordinal(source.pay_day)}`,
      )
    }
    STATE.transactions = txns0
    await act(async () => { await ctl.reload() })

    // Which tile is lit, on which screen — read on the month every screen is
    // pinned to, which is asserted alongside so that switching tabs can never be
    // switching months at the same time. `saved` navigates to the overview and
    // must not light there; `stayed` navigates to Expenses and must not light
    // anywhere at all.
    // CARDS AND LOANS LIGHT `commitments`, and that is the fix for a note that
    // was promising them a segment they did not have. A card's minimum and a
    // loan's instalment are both inside `committedRM` — one commitmentRows()
    // call derives all three screens — so those two ARE that segment, itemised
    // by kind. Overview is the one Money screen with nothing lit, because it is
    // the screen that shows all five.
    for (const [id, lit] of [['income', 'income'], ['commitments', 'commitments'],
      ['expenses', 'expenses'], ['overview', null], ['cards', 'commitments'],
      ['loans', 'commitments']]) {
      await tick(() => ctl.setTab(id))
      if (named() !== monthLabel(NY, NM)) {
        throw new Error(`strip: ${id} says ${named()} where every screen but a drilled Expenses is on ${monthLabel(NY, NM)}`)
      }
      const on = tiles().filter(t => t.dataset.here === 'true').map(t => t.dataset.segment)
      if (lit ? on.length !== 1 || on[0] !== lit : on.length) {
        throw new Error(`strip: on ${id} expected ${lit || 'no'} tile lit, got [${on}]`)
      }
      if (lit && !strip().querySelector(`[data-segment="${lit}"]`).className.includes('border-primary')) {
        throw new Error(`strip: the lit tile on ${id} does not carry the primary border`)
      }
      const stayed = strip().querySelector('[data-segment="stayed"]')
      if (stayed.dataset.here === 'true' || stayed.className.includes('border-primary')) {
        throw new Error(`strip: "What stayed" is lit on ${id}, and it must never be`)
      }
    }
    console.log('  strip      the active screen’s own segment is lit; "What stayed" never is')

    // ── THE WINDOW, ON EVERY SCREEN THE STRIP IS ON. The header names a calendar
    // month; every figure under it is measured over the span two wallet readings
    // bracket, and spendingFor() opens that span at the last reading on or BEFORE
    // the month started — so it routinely begins in the month before and the two
    // are different spans wearing one label. Overview has always printed the
    // dates beside its own copy of these figures; since the strip became the only
    // month statement on Income, Commitments, Credit cards and Loans, it has to
    // carry them too. Asserted against spendingFor()'s own `from`/`to`, so a
    // window line that drifted from the window it describes fails here.
    {
      const win = () => strip().querySelector('[data-slot="month-window"]')?.textContent || ''
      const here = overviewRows({ ...STATE }, NY, NM)
      if (here.reason) throw new Error(`strip: the current month must measure, got ${here.reason}`)
      const want = `Window ${dfmt(here.spend.from)} to ${dfmt(here.spend.to)} · ${here.spend.days} days`
      for (const id of MONEY) {
        await tick(() => ctl.setTab(id))
        if (win() !== want) {
          throw new Error(`strip: ${id} states the window as "${win()}", not "${want}"`)
        }
        // And the month it is labelled with is NOT that window, on this fixture —
        // which is what makes the line worth printing rather than a restatement.
        if (here.spend.from.slice(0, 7) === keyOf(NY, NM)) {
          throw new Error('strip: the fixture no longer opens its window in the month before, so this proves nothing')
        }
      }
      console.log(`  strip      all ${MONEY.length} Money screens state the window their figures were measured over`)
    }

    // ── DRILLED, and the two things that are only true then: the note stops
    // promising the other five pages this month, and the way back exists.
    // expenseHistory() re-anchors on the month picked — the selected month is
    // always the LAST bar — so after a drill there is no bar for today and the
    // chart alone cannot undo itself.
    {
      await drillTo(PY, PM)
      const note = strip().textContent
      if (note.includes('every page shows its own segment of this')) {
        throw new Error('strip: a drilled Expenses still claims every page is on its month')
      }
      if (!note.includes(`this screen only — the other five are on ${monthLabel(NY, NM)}`)) {
        throw new Error(`strip: a drilled Expenses does not say where the other five are — "${note}"`)
      }
      if ([...pane().querySelectorAll('button[data-month]')].some(b => b.dataset.month === keyOf(NY, NM))) {
        throw new Error('strip: the chart still holds a bar for this month, so the way back needs no button')
      }
      const back = [...pane().querySelectorAll('button')].find(
        b => b.textContent.trim() === `Back to ${monthLabel(NY, NM)}`)
      if (!back) throw new Error('expenses: drilled into the past with no way back to the month that is happening')
      await tick(() => back.click())
      if (named() !== monthLabel(NY, NM)) {
        throw new Error(`expenses: the way back landed on ${named()} rather than ${monthLabel(NY, NM)}`)
      }
      // And it is gone again, because it is the return path for a drill and not
      // a month control: nothing on a Money screen showing today can move it.
      if ([...pane().querySelectorAll('button')].some(b => b.textContent.trim().startsWith('Back to '))) {
        throw new Error('expenses: the way back is still offered on the month that is happening')
      }
      console.log(`  strip      a drilled Expenses says so, and offers the one way back to ${monthLabel(NY, NM)}`)
    }

    // ── A WALLET THAT ENDED WHERE IT STARTED neither rose nor fell, and two
    // surfaces on one screen used to say both: the strip called RM 0.00 a rise
    // (`rm < 0` is false at zero) over a "+0.0%", while overviewRows() called the
    // same zero "Plus what the wallet gave up · the balances fell" (`>= 0` is
    // true at zero). One figure, one card apart, opposite directions — and RM
    // 0.00 gives a reader nothing else to check the words against.
    {
      STATE.assetEntries = [
        reading(993, ago(1), 4050),
        reading(991, pd(24), 5000),
        reading(990, pd(2), 5000),
        ...entries0,
      ]
      await act(async () => { await ctl.reload() })
      const flat = overviewRows({ ...STATE }, PY, PM)
      if (flat.spend.walletDeltaRM !== 0) {
        throw new Error(`strip: the flat fixture moved by ${flat.spend.walletDeltaRM}, so this proves nothing`)
      }
      await drillTo(PY, PM)
      const sub = tiles().find(t => t.dataset.segment === 'stayed')
        .querySelector('[data-slot="segment-share"]').textContent
      if (/rose|fell/.test(sub)) {
        throw new Error(`strip: a wallet that did not move is described as moving — "${sub}"`)
      }
      const wallet0 = flat.rows.find(r => r.key === 'wallet')
      if (/fell|rose|gave up|kept/.test(`${wallet0.label} ${wallet0.note}`)) {
        throw new Error(`overview: a wallet that did not move is described as moving — "${wallet0.label}"`)
      }
      console.log(`  strip      a flat wallet is neither a rise nor a fall — "${sub}"`)
    }

    // ── A WINDOW THAT DECLARED LESS THAN NOTHING: deductions over gross on a
    // corrected payslip, or a reversed distribution larger than the payslips
    // beside it. `incomeRM ? …` treated that as a usable denominator, so every
    // share came back NEGATIVE and the tile emitted `width: -100%` — a
    // declaration the browser drops, leaving a FULL rail under a −100.0% label,
    // which is the exact print-versus-draw divergence the one shared expression
    // exists to prevent. Nothing arrived that anything can be a share OF, so it
    // is the same null the zero case already returns: no percentage, no bar, on
    // every tile at once. Calc-level, because no fixture the app renders can
    // reach it and the guard is in the derivation.
    {
      const { monthSegments } = await server.ssrLoadModule('/src/lib/calc.js')
      const neg = JSON.parse(JSON.stringify({ ...STATE }))
      neg.assetEntries = [reading(991, pd(24), 4000), reading(990, pd(2), 5000)]
      neg.incomeEvents = [{ ...pay, gross: 0, other_deducted: 500 }]
      neg.transactions = txns0.filter(t => t.side !== 'DIV')
      const seg = monthSegments(neg, PY, PM)
      if (!(seg.incomeRM < 0)) {
        throw new Error(`strip: the negative fixture declared ${seg.incomeRM}, so this proves nothing`)
      }
      const drawn = seg.segments.filter(x => x.share != null)
      if (drawn.length) {
        throw new Error(`strip: shares taken of a negative denominator — ${drawn.map(x => `${x.key}=${x.share}`)}`)
      }
      console.log('  strip      a window that declared less than nothing prints no share and draws no bar')
    }

    STATE.assetEntries = [
      reading(993, ago(1), 4050),
      reading(991, pd(24), 4200),
      { id: 992, asset_id: 1, slug: 'asb', type: 'DEPOSIT', date: pd(12), amount: 500, note: '',
        source: 'manual', ext_id: null },
      reading(990, pd(2), 5000),
      ...entries0,
    ]
    await act(async () => { await ctl.reload() })

    // A tile is a way in, not a decoration.
    await tick(() => ctl.setTab('overview'))
    await tick(() => strip().querySelector('[data-segment="commitments"]').click())
    if (ctl.tab !== 'commitments') {
      throw new Error(`strip: clicking the committed tile left us on ${ctl.tab}`)
    }
    console.log('  strip      a tile navigates to the screen its segment belongs to')

    STATE.assets = assets0
    STATE.assetEntries = entries0
    STATE.incomeEvents = events0
    STATE.transactions = txns0
    await act(async () => { await ctl.reload() })
    await tick(() => ctl.setTab('dashboard'))
  }

  const real = errors.filter(e =>
    !/not wrapped in act|useLayoutEffect does nothing on the server|Window's scrollTo/.test(e))
  if (real.length) throw new Error(`console.error during render:\n${real.join('\n')}`)

  console.log('OK - shell mounts, all ' + SCREENS.length + ' screens render, all ' + FORMS.length + ' side-panel forms open and close')
} finally {
  await server.close()
  window.close()
}
