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
window.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })
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
    { id: 3, date: thisMonthDay(3), amount: 38.9, currency: 'MYR', category: 'EATING_OUT', note: 'lunch', asset_id: null, source: 'manual' },
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
    { id: 1, kind: 'EMPLOYMENT', name: 'Day job', payer: '', currency: 'MYR', cadence: 'MONTHLY',
      pay_day: 25, gross_default: 8500, epf_asset_id: 3, active: true, started_on: null,
      ended_on: null, sort_order: 1 },
    { id: 2, kind: 'FREELANCE', name: 'Design work', payer: '', currency: 'MYR',
      cadence: 'IRREGULAR', pay_day: null, gross_default: null, epf_asset_id: null,
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
globalThis.fetch = async path => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => (String(path).includes('/api/state') ? STATE : { ok: true }),
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
  const need = ['Vantage', 'personal finance', 'Prices', 'Instrument', 'Dashboard', 'Positions', 'History', 'Wallet', 'Calendar', 'Goals', 'Assets', 'Money']
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
  const SCREENS = ['dashboard', 'positions', 'instruments', 'history', 'wallet', 'calendar', 'goals', 'assets', 'money', 'expenses', 'settings']
  for (const id of SCREENS) {
    await tick(() => ctl.setTab(id))
    const panes = document.querySelectorAll('[data-slot="tabs-content"][data-state="active"]')
    if (panes.length !== 1) throw new Error(`${id}: expected 1 active tab panel, saw ${panes.length}`)
    if (!panes[0].textContent.trim() && !panes[0].querySelector('svg, table, canvas'))
      throw new Error(`${id}: screen rendered nothing`)
    console.log(`  ${id.padEnd(10)} ok (${panes[0].textContent.trim().slice(0, 48) || '<graphical>'})`)
  }
  await tick(() => ctl.setTab('dashboard'))

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
    ['instruments', ['Quoted yield', 'Has really paid you', 'Declared per share']],
    // Provenance on two axes: 'moomoo' says which world a row is from, 'SYNCED'
    // says the sync wrote it rather than a person. A row can be moomoo and NOT
    // synced, so neither badge can stand in for the other.
    ['history', ['PENDING', 'moomoo', 'SYNCED', 'Savings', 'Income', 'What']],
    // The allocation scope chips, on the screen that owns them.
    ['dashboard', ['Allocation', 'Everything', 'Outside']],
    // The drift card, on the screen it belongs to. 'a buy is missing' is the
    // INCM short case; the explanatory line proves the card renders in full
    // rather than just its heading.
    ['positions', ['moomoo and your ledger disagree', 'INCM', 'a buy is missing',
      'derived from your transactions']],
    ['wallet', ['INCM dividend', 'INCM withholding tax']],
    // The money layer. The fixture's salary lands on the 25th and the loans on
    // the 1st and 5th, so a grid with no money marks means moneyByDay() stopped
    // producing them. 'across the month' is the in/out/net line.
    ['calendar', ['Annual income', 'Income by month', 'across the month', 'Not on the grid']],
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
    ['money', ['Unclaimed this month', '= Uncommitted', 'RM 8,719.50', 'RM 4,051.50', 'RM 4,668.00',
      'RM 2,868.00', 'flat = 6.3% real', 'Deducted from your pay',
      'Paid on top by your employer', 'no balance, pure expense', 'of instalments',
      'Debt falling', '3-month average']],
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
    // The screen totals 186.40 + 60.00 + 38.90 and splits three ways. 'Every
    // entry' proves the list rendered rather than only the summary, and the
    // wallet prompt proves the reconciliation degrades to a sentence rather than
    // a number when there is no reading to anchor it — the fixture has no wallet.
    ['expenses', ['Spent', 'RM 285.30', 'By category', 'Groceries', 'Eating out', 'Every entry',
      'Jaya Grocer', 'Mark the account you spend from']],
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

    console.log(`  drift      ${d.length} gap from the fixture, free-share case detected, residue ignored`)
  }

  // Expenses, and the reconciliation that makes a hand-kept log defensible.
  // Built on a local copy for the same reason the spending block is: a wallet in
  // the shared fixture would move the Money and Calendar figures asserted above.
  {
    const { expensesFor } = await server.ssrLoadModule('/src/lib/calc.js')

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
    outside.expenses.push({ id: 10, date: iso(28), amount: 999, currency: 'MYR', category: 'OTHER', note: '' })
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
      `  expenses   ${b.categories.length} categories, ` +
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

    // A reading resets rather than accumulates — that is the whole point of the
    // type, and a DEPOSIT after one must build on the reading, not on history.
    const s3 = JSON.parse(JSON.stringify(s2))
    s3.assetEntries.unshift({ id: 992, asset_id: 99, type: 'DEPOSIT', date: iso(25), amount: 100, source: 'manual' })
    const after = walletBalanceOn(s3, iso(25))
    if (Math.abs(after - 5700) > 0.005) {
      throw new Error(`spend: a reading must reset — expected 5700 after 5600 + 100, got ${after}`)
    }

    console.log(`  spending   null without a wallet, ${c.spentRM.toFixed(2)} over ${c.days} days with two readings`)
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

  // each form must open through the store opener and close again
  const FORMS = [['openInstrument', 'Add instrument'], ['openTransaction', 'Add transaction'], ['openCash', 'Add cash movement'], ['openAssetEntry', 'Add entry'], ['openAsset', 'Add account'], ['openCommitment', 'Add commitment'], ['openIncome', 'Add income source'],
    ['openIncomeEvent', 'Record a payment'], ['openGoal', 'New goal']]
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

  const real = errors.filter(e => !/not wrapped in act|useLayoutEffect does nothing on the server/.test(e))
  if (real.length) throw new Error(`console.error during render:\n${real.join('\n')}`)

  console.log('OK - shell mounts, all ' + SCREENS.length + ' screens render, all ' + FORMS.length + ' side-panel forms open and close')
} finally {
  await server.close()
  window.close()
}
