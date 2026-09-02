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
const lastThursday = (() => {
  let t = NOW
  while (new Date(t).getUTCDay() !== 4) t -= DAY
  return t
})()
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
  ],
  snapshots: [
    { date: ago(2), value_rm: 5000, cash_rm: 300 },
    { date: ago(1), value_rm: 5200, cash_rm: 300 },
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
    { id: 3, kind: 'SAVINGS', name: 'EPF', slug: 'epf', currency: 'MYR', institution: 'KWSP',
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
  const SCREENS = ['dashboard', 'positions', 'instruments', 'history', 'wallet', 'calendar', 'goals', 'assets', 'money', 'settings']
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
    // fixture's 800 of goal budgets, unclaimed 3,868.00.
    ['money', ['Unclaimed this month', '= Uncommitted', 'RM 8,719.50', 'RM 4,051.50', 'RM 4,668.00',
      'RM 3,868.00', 'flat = 6.3% real', 'Deducted from your pay',
      'Paid on top by your employer', 'no balance, pure expense', 'of instalments',
      'Debt falling', '3-month average']],
    // The payoff: goal budgets checked against real uncommitted cash. RM 800 is
    // the fixture's two budgets; RM 4,668.00 is income less commitments, both
    // derived. 'all funded' proves the allocation ran rather than the card just
    // rendering a total.
    // The colour theme lives in localStorage, not the server, so there is no
    // state key to assert — these prove the controls exist and are reachable.
    ['settings', ['Appearance', 'Match my system', 'The colours, not the layout']],
    ['goals', ['moomoo', 'Claimed each month', 'RM 800.00', 'RM 4,668.00', 'all funded', 'uncommitted']],
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
