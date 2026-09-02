/**
 * The Vantage app shell.
 *
 * Owns: the side navigation (brand, screens, last-sync line, theme toggle), the
 * top bar (screen title, Sync, ↻ Prices, theme), the first-load /
 * server-down states, the toast host, and the three write dialogs.
 *
 * Navigation is a VERTICAL rail, not a row of tabs. Eight screens overflowed a
 * horizontal strip on any narrow window, and the rail also gives the last-sync
 * line and theme toggle a home that is not competing with the actions.
 *
 * It is still Radix Tabs underneath: orientation="vertical" moves the active
 * indicator to the right edge and rebinds the arrow keys to up/down, so the whole
 * keyboard contract comes for free. Below 1024px the rail keeps its structure and
 * drops to icons alone — a layout that changes shape at a breakpoint would need a
 * second orientation, and a drawer would need focus trapping this app has no other
 * use for.
 *
 * Screens live in src/screens/*.jsx and are rendered inside a TabsContent. They
 * never render their own header or dialogs — they call the openers on
 * useVantage() instead. See src/lib/store.jsx for that contract.
 */

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  CalendarDaysIcon,
  CloudDownloadIcon,
  HistoryIcon,
  LandmarkIcon,
  LayersIcon,
  LayoutDashboardIcon,
  BanknoteIcon,
  MoonIcon,
  PiggyBankIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  SunIcon,
  TargetIcon,
  TriangleAlertIcon,
  WalletIcon,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
// Every form in the app opens as a right-hand side panel rather than a centred
// dialog. The Sheet primitives are aliased to the Dialog names they replace so
// the forms below read exactly as they did — what changed is where a form
// appears, not how one is written.
import {
  Sheet as Dialog,
  SheetContent as DialogContent,
  SheetDescription as DialogDescription,
  SheetFooter as DialogFooter,
  SheetHeader as DialogHeader,
  SheetTitle as DialogTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { GOAL_KIND, GOAL_NEEDS_INSTRUMENT, epfFromGross, goalIncomeIsNet } from '@/lib/calc'
import {
  FISCAL_YEARS,
  INSTITUTIONS,
  OTHER,
  SHARIAH,
  estimatedRate,
  epfAccounts,
  institutionOf,
  latestRate,
  productOf,
  rateIsStale,
  totalRate,
  withRates,
} from '@/lib/institutions'
import LockScreen from '@/components/LockScreen'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { TABS, useVantage } from '@/lib/store'
import { dtfmt, today } from '@/lib/format'

import Dashboard from '@/screens/Dashboard'
import Positions from '@/screens/Positions'
import History from '@/screens/History'
import Wallet from '@/screens/Wallet'
import CalendarScreen from '@/screens/Calendar'
import Goals, { KIND_OPTIONS, WHOLE, isIncome } from '@/screens/Goals'
import Instruments from '@/screens/Instruments'
import Assets from '@/screens/Assets'
import Money from '@/screens/Money'
import Settings from '@/screens/Settings'

const SCREENS = {
  dashboard: Dashboard,
  positions: Positions,
  instruments: Instruments,
  history: History,
  wallet: Wallet,
  calendar: CalendarScreen,
  goals: Goals,
  assets: Assets,
  money: Money,
  settings: Settings,
}

/* ── shell pieces ─────────────────────────────────────────────────────────── */

/** One per TABS entry. Kept here rather than in the store: the store holds data,
 *  and which glyph a screen wears is a presentation choice. */
const NAV_ICON = {
  dashboard: LayoutDashboardIcon,
  positions: LayersIcon,
  instruments: LandmarkIcon,
  history: HistoryIcon,
  wallet: WalletIcon,
  calendar: CalendarDaysIcon,
  goals: TargetIcon,
  assets: PiggyBankIcon,
  money: BanknoteIcon,
  settings: SettingsIcon,
}

/**
 * Light / dark, one click.
 *
 * It flips the RESOLVED theme, so a click while on "system" picks the opposite of
 * whatever the machine is currently showing — which is what someone reaching for
 * this button wants. Choosing "system" itself is a deliberate act and lives in
 * Settings, not on a button whose whole job is to be quick.
 *
 * `mounted` guards the first paint: next-themes cannot know the resolved theme
 * until it has read localStorage, and rendering a sun on a light background for
 * one frame is a visible flicker.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = !mounted || resolvedTheme !== 'light'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? 'Light theme' : 'Dark theme'}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The rail. Brand, the eight screens, and the two things that belong beside them
 * rather than beside the actions: when the data last arrived, and the theme.
 */
function SideNav() {
  const { state, tab } = useVantage()

  return (
    <aside className="bg-background sticky top-0 z-30 flex h-svh w-[58px] shrink-0 flex-col border-r lg:w-[212px]">
      <div className="flex h-[60px] shrink-0 items-center justify-center border-b lg:justify-start lg:px-4">
        <div>
          <div className="num text-[17px] leading-none font-semibold tracking-[0.04em] lg:text-[19px]">
            <span className="lg:hidden">V</span>
            <span className="hidden lg:inline">Vantage</span>
          </div>
          <div className="eyebrow mt-1.5 hidden lg:block">personal finance</div>
        </div>
      </div>

      <TabsList
        variant="line"
        className="w-full flex-1 items-stretch justify-start gap-0.5 overflow-y-auto rounded-none p-2"
      >
        {TABS.map(t => {
          const Icon = NAV_ICON[t.id]
          return (
            <TabsTrigger
              key={t.id}
              value={t.id}
              // The label is hidden by width, never removed: sr-only keeps it as the
              // button's accessible name on the icon rail, where a tooltip would
              // only reach a mouse. `title` gives that rail a hover hint too.
              title={t.label}
              className="h-9 flex-none justify-center gap-2.5 rounded-md px-0 text-[13px] font-semibold data-[state=active]:bg-muted data-[state=active]:after:bg-primary lg:justify-start lg:px-3"
            >
              <Icon aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">{t.label}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>

      <div className="shrink-0 border-t p-2 lg:px-3 lg:py-2.5">
        <div className="flex items-center justify-center gap-2">
          <span className="text-faint hidden text-[11px] leading-tight lg:block">
            {state.lastSync ? (
              <>
                OpenD sync
                <br />
                <span className="num">{dtfmt(state.lastSync)}</span>
              </>
            ) : (
              'OpenD not synced yet'
            )}
          </span>
        </div>
      </div>
    </aside>
  )
}

/** Where you are, and the three things you can do from anywhere. */
function TopBar() {
  const { tab, refreshPrices, pricesPending, syncMoomoo, syncPending } = useVantage()
  const current = TABS.find(t => t.id === tab)

  return (
    <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur-md">
      <div className="flex h-[60px] w-full flex-wrap items-center gap-x-3 gap-y-2 px-[clamp(14px,2.4vw,28px)]">
        <h1 className="text-[16px] font-semibold tracking-[-0.01em]">{current ? current.label : 'Vantage'}</h1>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={syncMoomoo} disabled={syncPending}>
                <CloudDownloadIcon className={syncPending ? 'animate-pulse' : undefined} />
                {syncPending ? 'Syncing…' : 'Sync'}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px]">
              Pull positions, trades, dividends and cash from moomoo. Needs OpenD running and
              <span className="num"> sync\run_agent.cmd</span> open — it reads only, never trades.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={refreshPrices} disabled={pricesPending}>
                <RefreshCwIcon className={pricesPending ? 'animate-spin' : undefined} />
                Prices
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fetch quotes from Yahoo Finance — the fallback when OpenD is off</TooltipContent>
          </Tooltip>
          {/* Beside the other things you can do from anywhere. It used to sit in
              the rail footer, where it was easy to miss entirely — the light
              palette has always existed, but nobody could find the switch. */}
          <ThemeToggle />
      </div>
    </header>
  )
}

/* ── dialogs ──────────────────────────────────────────────────────────────── */

function Field({ label, htmlFor, hint, children, className = '' }) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor} className="eyebrow">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-faint text-[11px]">{hint}</p> : null}
    </div>
  )
}

function InstrumentDialog() {
  const { closeModal, addInstrument } = useVantage()
  const [f, setF] = useState({ ticker: '', name: '', market: 'MY', yahoo_symbol: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const ticker = f.ticker.trim().toUpperCase()
    if (!ticker) return
    setBusy(true)
    const ok = await addInstrument({
      ticker,
      name: f.name.trim(),
      market: f.market,
      currency: f.market === 'MY' ? 'MYR' : 'USD',
      yahoo_symbol: f.yahoo_symbol.trim(),
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>Add instrument</DialogTitle>
        <DialogDescription>
          Bursa counters are the stock code + .KL (e.g. 5279.KL); US tickers as-is. The OpenD sync
          fills the Yahoo symbol in automatically for synced holdings.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ticker (your label)" htmlFor="in-ticker">
          <Input
            id="in-ticker"
            autoFocus
            placeholder="ETCO"
            value={f.ticker}
            onChange={e => set('ticker', e.target.value)}
          />
        </Field>
        <Field label="Name" htmlFor="in-name">
          <Input
            id="in-name"
            placeholder="ETCO Bhd"
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </Field>
        <Field label="Market" htmlFor="in-market">
          <Select value={f.market} onValueChange={v => set('market', v)}>
            <SelectTrigger id="in-market" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MY">MY (Bursa) · MYR</SelectItem>
              <SelectItem value="US">US · USD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Yahoo symbol" htmlFor="in-yahoo">
          <Input
            id="in-yahoo"
            placeholder={f.market === 'MY' ? '5279.KL' : 'AAPL'}
            value={f.yahoo_symbol}
            onChange={e => set('yahoo_symbol', e.target.value)}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !f.ticker.trim()}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function TransactionDialog({ prefill }) {
  const { state, closeModal, addTransaction } = useVantage()
  const [f, setF] = useState({
    ticker: prefill.ticker || state.instruments[0]?.ticker || '',
    side: prefill.side || 'BUY',
    qty: prefill.qty ?? 100,
    price: prefill.price ?? 0,
    fees: prefill.fees ?? 0,
    trade_date: prefill.trade_date || today(),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const isDiv = f.side === 'DIV'

  const save = async () => {
    if (!f.trade_date || !f.ticker) return
    const price = Number(f.price) || 0
    setBusy(true)
    // Legacy convention: a DIV row carries its value in `amount`, price stays 0.
    const ok = await addTransaction({
      ticker: f.ticker,
      side: f.side,
      qty: Number(f.qty) || 0,
      price: isDiv ? 0 : price,
      amount: isDiv ? price : null,
      fees: Number(f.fees) || 0,
      trade_date: f.trade_date,
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>Add transaction</DialogTitle>
        <DialogDescription>
          For a dividend, put the amount received in Price / Amount and leave quantity at 0.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ticker" htmlFor="tx-ticker">
          <Select value={f.ticker} onValueChange={v => set('ticker', v)}>
            <SelectTrigger id="tx-ticker" className="w-full">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {state.instruments.map(i => (
                <SelectItem key={i.ticker} value={i.ticker}>
                  {i.ticker}
                  <span className="text-faint ml-1">{i.currency}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Side" htmlFor="tx-side">
          <Select value={f.side} onValueChange={v => set('side', v)}>
            <SelectTrigger id="tx-side" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
              <SelectItem value="DIV">DIV</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="tx-qty">
          <Input
            id="tx-qty"
            className="num"
            type="number"
            min="0"
            value={f.qty}
            onChange={e => set('qty', e.target.value)}
          />
        </Field>
        <Field label={isDiv ? 'Amount' : 'Price'} htmlFor="tx-price">
          <Input
            id="tx-price"
            className="num"
            type="number"
            step="0.001"
            value={f.price}
            onChange={e => set('price', e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="tx-date">
          <Input
            id="tx-date"
            className="num"
            type="date"
            value={f.trade_date}
            onChange={e => set('trade_date', e.target.value)}
          />
        </Field>
        <Field label="Fees" htmlFor="tx-fees">
          <Input
            id="tx-fees"
            className="num"
            type="number"
            step="0.01"
            value={f.fees}
            onChange={e => set('fees', e.target.value)}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !f.trade_date || !f.ticker}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function CashDialog({ prefill }) {
  const { closeModal, addCash } = useVantage()
  const [f, setF] = useState({
    type: prefill.type || 'DEPOSIT',
    currency: prefill.currency || 'MYR',
    amount: prefill.amount ?? 500,
    date: prefill.date || today(),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true)
    const ok = await addCash({
      type: f.type,
      currency: f.currency,
      amount: Number(f.amount) || 0,
      date: f.date || today(),
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>Add cash movement</DialogTitle>
        <DialogDescription>
          Wallets are tracked per currency — a currency exchange is a withdrawal from one and a
          deposit into the other.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="cash-type">
          <Select value={f.type} onValueChange={v => set('type', v)}>
            <SelectTrigger id="cash-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEPOSIT">DEPOSIT</SelectItem>
              <SelectItem value="WITHDRAW">WITHDRAW</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency" htmlFor="cash-cur">
          <Select value={f.currency} onValueChange={v => set('currency', v)}>
            <SelectTrigger id="cash-cur" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MYR">MYR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Amount" htmlFor="cash-amt">
          <Input
            id="cash-amt"
            className="num"
            type="number"
            step="0.01"
            value={f.amount}
            onChange={e => set('amount', e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="cash-date">
          <Input
            id="cash-date"
            className="num"
            type="date"
            value={f.date}
            onChange={e => set('date', e.target.value)}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * A new account outside moomoo.
 *
 * `rate_basis` is the field that matters and it has no safe default, so it is
 * asked as a question about the provider rather than offered as a technical
 * enum: ASB and Tabung Haji pay on the mean of twelve monthly minimums, EPF
 * accrues from the end of each contribution month. Picking wrong produces a
 * plausible estimate nobody would question, which is the worst kind of wrong.
 *
 * The slug is derived from the name rather than asked for. It is an internal key
 * the UI addresses the account by and there is nothing useful for the owner to
 * decide about it.
 */
function AssetDialog() {
  const { state, closeModal, addAsset } = useVantage()
  const [f, setF] = useState({
    institution_id: '',
    product_id: '',
    name: '',
    institution: '',
    rate_basis: 'MIN_MONTHLY',
    rate_quote: 'PERCENT',
    last_rate: '',
    last_bonus: '',
    unit_cap: '',
    fiscal_year: '12-31',
    // Which declared year the rate above came from, and - for EPF - which of
    // its two series. Neither is saved; they only drive the two fields that are.
    rate_year: null,
    rate_estimated: false,
    rate_variant: 'CONVENTIONAL',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const inst = institutionOf(f.institution_id)
  // The user's own recorded rates win over the shipped catalogue, so the form
  // shows a rate declared last week the same as one that shipped with the app.
  const prod = withRates(productOf(f.institution_id, f.product_id), state.declaredRates)
  const declared = prod?.rates || []
  // The year in progress, carried forward from the last declared one. It leads
  // the list because it is the year an account opened today will actually earn.
  const estimate = prod ? estimatedRate(prod) : null
  const rates = estimate ? [estimate, ...declared] : declared
  // EPF is the only one that declares two series. Everything else has one, and
  // asking which would be a question with a single answer.
  const hasShariah = rates.some(r => r.shariah != null)
  const stale = prod ? rateIsStale(prod) : false

  /** The number this fund actually paid in `r`, under the chosen series. */
  const rateUnder = (r, variant = f.rate_variant) =>
    variant === 'SHARIAH' && r.shariah != null ? r.shariah : r.rate

  /**
   * Put one year's declared figures into the rate fields.
   *
   * Not a choice the form offers. There is exactly one right answer — the most
   * recent figure for the fund, which is the year in progress where one is still
   * running — and asking the user to pick a year would be asking them to guess
   * at something the app already knows. The history is shown so the number can
   * be checked, not so it can be selected; a rate that is wrong is corrected in
   * Settings, where it is fixed for every account rather than for this one.
   *
   * The bonus is written as its own field rather than folded into the rate,
   * because assetRate() sums them and the two have different standing: ASB's
   * base rate is the fund's earnings, the bonus is discretionary and has ranged
   * from 0.25 to 1.25 sen over the last six years.
   */
  const applyRate = (year, variant = f.rate_variant) => {
    const r = rates.find(x => x.year === year)
    if (!r) return
    setF(p => ({
      ...p,
      rate_year: year,
      rate_estimated: Boolean(r.estimated),
      rate_variant: variant,
      last_rate: String(rateUnder(r, variant)),
      last_bonus: r.bonus ? String(r.bonus) : '',
    }))
  }

  // Changing institution clears the fund, because "ASB 2" under EPF would be a
  // nonsense the rest of the form would then happily prefill from.
  const pickInstitution = id => {
    const next = institutionOf(id)
    setF(p => ({
      ...p,
      institution_id: id,
      product_id: '',
      institution: id === OTHER ? '' : next?.label || '',
      // Switching from ASB to EPF must not carry ASB's 300,000 across. The cap
      // is a property of the fund, and the new one either has its own or has
      // none at all.
      unit_cap: next && next.hasCap === false ? '' : p.unit_cap,
    }))
  }

  // The point of the catalogue: the basis, the financial year and the cap are
  // facts about the product, so picking one fills them in. They stay editable —
  // a fund can change its terms, and this file would not know.
  const pickProduct = id => {
    const picked = withRates(productOf(f.institution_id, id), state.declaredRates)
    if (!picked) return
    // The newest entry, which is the in-progress year's estimate when one is
    // running and the last declared year otherwise. Same number either way — the
    // estimate carries it forward — so this only decides what the field is
    // LABELLED, and the honest label is the year actually being projected.
    const use = (picked.rates || [])[0] || latestRate(picked)
    setF(p => ({
      ...p,
      product_id: id,
      name: picked.name,
      rate_basis: picked.rate_basis,
      rate_quote: picked.rate_quote,
      fiscal_year: picked.fiscal_year,
      unit_cap: picked.unit_cap == null ? '' : String(picked.unit_cap),
      rate_year: use ? use.year : null,
      rate_estimated: Boolean(use && use.estimated),
      last_rate: use ? String(use.rate) : '',
      last_bonus: use && use.bonus ? String(use.bonus) : '',
      rate_variant: 'CONVENTIONAL',
    }))
  }

  const slug = f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const save = async () => {
    if (!slug) return
    setBusy(true)
    const ok = await addAsset({
      name: f.name.trim(),
      slug,
      institution: f.institution.trim(),
      rate_basis: f.rate_basis,
      rate_quote: f.rate_quote,
      // Sen-per-unit accounts are the ones that talk about units at all.
      unit_label: f.rate_quote === 'SEN_PER_UNIT' ? 'units' : '',
      last_rate: f.last_rate === '' ? null : Number(f.last_rate),
      last_bonus: f.last_bonus === '' ? null : Number(f.last_bonus),
      unit_cap: f.unit_cap === '' ? null : Number(f.unit_cap),
      fiscal_year: f.fiscal_year,
      // Which catalogue entry this is, so code that needs to know WHAT an account
      // is — the payroll EPF split, above all — does not have to read its name.
      product_id: f.product_id || null,
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Add account</DialogTitle>
        <DialogDescription>
          Something you hold outside moomoo — ASB, Tabung Haji, EPF. It gets its own tables and
          never touches your broker positions, wallet or income figures.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Institution" htmlFor="as-inst" hint={inst?.hint}>
          <Select value={f.institution_id} onValueChange={pickInstitution}>
            <SelectTrigger id="as-inst" className="w-full">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {INSTITUTIONS.map(i => (
                <SelectItem key={i.id} value={i.id}>
                  {i.label}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>Something else</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {inst ? (
          <Field
            label="Account or fund"
            htmlFor="as-product"
            hint="Fills in how it pays, the financial year and any cap."
          >
            <Select value={f.product_id} onValueChange={pickProduct}>
              <SelectTrigger id="as-product" className="w-full">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {inst.products.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : f.institution_id === OTHER ? (
          <Field label="Institution name" htmlFor="as-inst-other">
            <Input
              id="as-inst-other"
              placeholder="Bank Rakyat"
              value={f.institution}
              onChange={e => set('institution', e.target.value)}
            />
          </Field>
        ) : (
          <div aria-hidden />
        )}

        <Field
          label="Name"
          htmlFor="as-name"
          className="col-span-2"
          hint="What you will see on the Assets screen — rename it if you hold more than one."
        >
          <Input
            id="as-name"
            placeholder="ASB"
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </Field>
        <Field
          label="How does it pay?"
          htmlFor="as-basis"
          className="col-span-2"
          hint="Get this wrong and the estimate is plausible but false, so it is asked rather than guessed."
        >
          <Select value={f.rate_basis} onValueChange={v => set('rate_basis', v)}>
            <SelectTrigger id="as-basis" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MIN_MONTHLY">
                On the average of my monthly minimums — ASB, Tabung Haji
              </SelectItem>
              <SelectItem value="MADB">
                From the end of each month I contribute — EPF
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Rate is quoted in" htmlFor="as-quote">
          <Select value={f.rate_quote} onValueChange={v => set('rate_quote', v)}>
            <SelectTrigger id="as-quote" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENT">Percent</SelectItem>
              <SelectItem value="SEN_PER_UNIT">Sen per unit</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={
            f.rate_year
              ? (f.rate_estimated ? 'Rate estimated for ' : 'Rate declared for ') + f.rate_year
              : 'Last declared rate'
          }
          htmlFor="as-rate"
          hint={f.rate_year ? undefined : 'Leave blank until one is declared.'}
        >
          <Input
            id="as-rate"
            className={cn('num', prod && 'text-muted-foreground')}
            type="number"
            step="0.01"
            placeholder="5.75"
            value={f.last_rate}
            readOnly={Boolean(prod)}
            onChange={e => set('last_rate', e.target.value)}
          />
        </Field>

        {/* The bonus is a real column the form never exposed, so ASB's could not
            be recorded at all - and assetRate() adds it to the base rate, so
            leaving it out understated every ASB projection by up to 1.25 sen. */}
        {rates.some(r => r.bonus) || f.institution_id === OTHER ? (
          <Field
            label="Bonus"
            htmlFor="as-bonus"
            hint="Added to the rate. ASB declares one; most accounts do not."
          >
            <Input
              id="as-bonus"
              className={cn('num', prod && 'text-muted-foreground')}
              type="number"
              step="0.01"
              placeholder="0.55"
              value={f.last_bonus}
              readOnly={Boolean(prod)}
              onChange={e => set('last_bonus', e.target.value)}
            />
          </Field>
        ) : null}

        {inst?.shariah ? (
          <p className="text-faint col-span-2 -mt-1 text-[11px] leading-relaxed">
            {SHARIAH[inst.shariah]}
          </p>
        ) : null}

        {rates.length ? (
          <div className="col-span-2 grid gap-1.5">
            <span className="eyebrow">
              Declared {prod.rate_quote === 'SEN_PER_UNIT' ? 'sen per unit' : 'per cent'}, by
              financial year
            </span>
            {/* Read-only. These are here so the figure above can be checked
                against the fund's record, not so a year can be chosen — the app
                uses the most recent one and there is no second right answer. */}
            <div className="flex flex-wrap gap-1.5">
              {rates.map(r => {
                const on = f.rate_year === r.year
                const shown =
                  f.rate_variant === 'SHARIAH' && r.shariah != null ? r.shariah : totalRate(r)
                return (
                  <span
                    key={r.year}
                    title={
                      r.estimated
                        ? `Not declared yet — carried forward from ${r.basedOn}`
                        : `Declared for the year to ${r.year}`
                    }
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11.5px]',
                      r.estimated && 'border-dashed',
                      on
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    <span className="num">{r.year}</span>{' '}
                    <span className="num font-semibold">{shown.toFixed(2)}</span>
                    {r.estimated ? (
                      <span className="text-faint ml-1 text-[10px] tracking-[0.06em] uppercase">
                        est
                      </span>
                    ) : null}
                    {r.mine ? (
                      <span className="text-primary ml-1 text-[10px] tracking-[0.06em] uppercase">
                        yours
                      </span>
                    ) : null}
                  </span>
                )
              })}
            </div>

            {hasShariah ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-faint text-[11px]">Your savings are</span>
                {[
                  ['CONVENTIONAL', 'Konvensional'],
                  ['SHARIAH', 'Shariah'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyRate(f.rate_year, id)}
                    aria-pressed={f.rate_variant === id}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[11.5px] transition-colors',
                      f.rate_variant === id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/60',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            <p className="text-faint text-[11px]">
              {declared.some(r => r.bonus) ? 'Base rate plus bonus, as declared. ' : ''}
              The most recent figure is used automatically — shown above, and editable under
              Declared rates in Settings.{' '}
              {estimate
                ? `${estimate.year} has not been declared yet, so that one is ${estimate.basedOn} carried forward and any projection from it is an estimate.`
                : ''}
              {stale
                ? ' A newer year has since closed - check the latest announcement before relying on this.'
                : ''}
            </p>
          </div>
        ) : null}
        {/* Only where an account can actually fill up. ASNB caps ASB and ASB 2 at
            300,000 units; an EPF or Tabung Haji balance has no ceiling, so the
            field would be a question with no answer — and a progress bar towards
            a number the user invented is worse than no progress bar. Kept for an
            institution typed in by hand, where the app cannot know. */}
        {!inst || inst.hasCap !== false ? (
          <Field label="Holding cap" htmlFor="as-cap" hint="A progress bar, never a limit — optional.">
            <Input
              id="as-cap"
              className="num"
              type="number"
              step="1000"
              placeholder="300000"
              value={f.unit_cap}
              onChange={e => set('unit_cap', e.target.value)}
            />
          </Field>
        ) : null}
        <Field
          label="Financial year ends"
          htmlFor="as-fy"
          className="col-span-2"
          hint="Of the ASNB funds only ASB runs to December; the rest end in March, June, August or September. EPF and Tabung Haji are calendar years."
        >
          <Select value={f.fiscal_year} onValueChange={v => set('fiscal_year', v)}>
            <SelectTrigger id="as-fy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FISCAL_YEARS.map(y => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !slug}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * One entry against an account outside moomoo.
 *
 * `amount` is always positive and the type carries the direction, matching the
 * column and the API — a signed amount plus a type would be two sources of truth
 * for one fact. The date defaults to today because most entries are recorded the
 * day they happen; a distribution being backdated is the exception.
 */
function AssetEntryDialog({ prefill }) {
  const { state, closeModal, addAssetEntry } = useVantage()
  const [f, setF] = useState({
    asset_id: String(prefill.asset_id ?? state.assets[0]?.id ?? ''),
    type: prefill.type || 'DEPOSIT',
    amount: prefill.amount ?? 500,
    date: prefill.date || today(),
    note: prefill.note || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const asset = state.assets.find(a => String(a.id) === f.asset_id)

  const save = async () => {
    if (!f.asset_id || !f.date) return
    setBusy(true)
    const ok = await addAssetEntry(Number(f.asset_id), {
      type: f.type,
      amount: Math.abs(Number(f.amount) || 0),
      date: f.date,
      note: f.note.trim(),
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>Add entry</DialogTitle>
        <DialogDescription>
          A contribution, a withdrawal, or the annual distribution when it is credited. The balance
          follows from these — it is never stored.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Account" htmlFor="ae-asset">
          <Select value={f.asset_id} onValueChange={v => set('asset_id', v)}>
            <SelectTrigger id="ae-asset" className="w-full">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {state.assets
                .filter(a => !a.archived)
                .map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Type" htmlFor="ae-type">
          <Select value={f.type} onValueChange={v => set('type', v)}>
            <SelectTrigger id="ae-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEPOSIT">DEPOSIT</SelectItem>
              <SelectItem value="WITHDRAW">WITHDRAW</SelectItem>
              <SelectItem value="DISTRIBUTION">DISTRIBUTION</SelectItem>
              <SelectItem value="FEE">FEE</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={`Amount (${asset ? asset.currency : 'MYR'})`}
          htmlFor="ae-amount"
          hint="Always positive — the type says which way it moves."
        >
          <Input
            id="ae-amount"
            className="num"
            type="number"
            min="0"
            step="0.01"
            value={f.amount}
            onChange={e => set('amount', e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="ae-date">
          <Input
            id="ae-date"
            className="num"
            type="date"
            value={f.date}
            onChange={e => set('date', e.target.value)}
          />
        </Field>
        <Field label="Note" htmlFor="ae-note" className="col-span-2">
          <Input
            id="ae-note"
            placeholder="2025 distribution · 5.75 sen, reinvested"
            value={f.note}
            onChange={e => set('note', e.target.value)}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !f.asset_id || !f.date}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * A new commitment.
 *
 * The kind is asked first because it decides which fields even exist, and
 * `rate_type` is asked as a question about the agreement rather than offered as
 * an enum: Bank Negara defines FLAT as interest on the original amount and
 * "fixed" as an unchanging rate on the reducing balance, but Malaysian marketing
 * routinely says fixed when it means flat. Only the phrasing below cannot be
 * answered wrongly in good faith, and getting it wrong misstates both the balance
 * and the true cost in the flattering direction.
 */
function CommitmentDialog() {
  const { closeModal, addCommitment } = useVantage()
  const [f, setF] = useState({
    kind: 'LOAN',
    name: '',
    lender: '',
    due_day: '',
    principal: '',
    rate: '',
    rate_type: 'REDUCING',
    term_months: '',
    started_on: today(),
    instalment: '',
    apr: '18',
    balance: '',
    credit_limit: '',
    amount: '',
    every_months: '1',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = v => (v === '' ? null : Number(v))

  const ready =
    f.name.trim() &&
    (f.kind === 'LOAN'
      ? f.principal && f.rate !== '' && f.term_months && f.started_on
      : f.kind === 'REVOLVING'
        ? f.apr !== ''
        : f.amount)

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const common = {
      kind: f.kind,
      name: f.name.trim(),
      lender: f.lender.trim(),
      due_day: f.due_day === '' ? null : Number(f.due_day),
    }
    const body =
      f.kind === 'LOAN'
        ? {
            ...common,
            principal: num(f.principal),
            rate: num(f.rate),
            rate_type: f.rate_type,
            term_months: num(f.term_months),
            started_on: f.started_on,
            instalment: num(f.instalment),
          }
        : f.kind === 'REVOLVING'
          ? {
              ...common,
              apr: num(f.apr),
              credit_limit: num(f.credit_limit),
              balance: num(f.balance),
              // The API refuses a balance with no date, because a card balance is
              // a snapshot and the screen has to be able to say how old it is.
              balance_as_of: f.balance === '' ? null : today(),
            }
          : { ...common, amount: num(f.amount), every_months: Number(f.every_months) }
    const ok = await addCommitment(body)
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Add commitment</DialogTitle>
        <DialogDescription>
          Something known in advance. For a loan, five fields off the agreement give every future
          instalment &mdash; you will never type a payment.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Kind"
          htmlFor="cm-kind"
          hint={
            f.kind === 'LOAN'
              ? 'Car, house or personal — anything with a term.'
              : f.kind === 'REVOLVING'
                ? 'A balance that revolves, with no end date.'
                : 'Rent, insurance, a subscription.'
          }
        >
          <Select value={f.kind} onValueChange={v => set('kind', v)}>
            <SelectTrigger id="cm-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOAN">Loan</SelectItem>
              <SelectItem value="REVOLVING">Credit card</SelectItem>
              <SelectItem value="RECURRING">Recurring</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Name" htmlFor="cm-name">
          <Input
            id="cm-name"
            autoFocus
            placeholder={f.kind === 'LOAN' ? 'Myvi' : f.kind === 'REVOLVING' ? 'CIMB Visa' : 'Rent'}
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </Field>

        {f.kind === 'LOAN' ? (
          <>
            <Field
              label="Amount financed"
              htmlFor="cm-principal"
              hint="Not the purchase price — include anything rolled into the loan."
            >
              <Input id="cm-principal" className="num" type="number" step="100" value={f.principal} onChange={e => set('principal', e.target.value)} />
            </Field>
            <Field label="Rate (% p.a.)" htmlFor="cm-rate">
              <Input id="cm-rate" className="num" type="number" step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} />
            </Field>
            <Field
              label="Interest is charged on…"
              htmlFor="cm-ratetype"
              className="col-span-2"
              hint="Not “is it a fixed rate?” — Malaysian lenders call a reducing-balance rate fixed, and a flat rate costs close to double what it looks like."
            >
              <Select value={f.rate_type} onValueChange={v => set('rate_type', v)}>
                <SelectTrigger id="cm-ratetype" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REDUCING">the balance remaining &mdash; mortgages</SelectItem>
                  <SelectItem value="FLAT">the original amount &mdash; hire purchase</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Term (months)" htmlFor="cm-term">
              <Input id="cm-term" className="num" type="number" step="1" value={f.term_months} onChange={e => set('term_months', e.target.value)} />
            </Field>
            <Field label="First payment" htmlFor="cm-start">
              <Input id="cm-start" className="num" type="date" value={f.started_on} onChange={e => set('started_on', e.target.value)} />
            </Field>
            <Field
              label="Instalment"
              htmlFor="cm-inst"
              hint="Optional — derived if blank. The bank’s own figure wins when given."
            >
              <Input id="cm-inst" className="num" type="number" step="0.01" value={f.instalment} onChange={e => set('instalment', e.target.value)} />
            </Field>
          </>
        ) : f.kind === 'REVOLVING' ? (
          <>
            <Field
              label="Rate if carried (%)"
              htmlFor="cm-apr"
              hint="Malaysian cards are tiered 15 / 17 / 18 on payment history."
            >
              <Input id="cm-apr" className="num" type="number" step="0.01" value={f.apr} onChange={e => set('apr', e.target.value)} />
            </Field>
            <Field label="Credit limit" htmlFor="cm-limit">
              <Input id="cm-limit" className="num" type="number" step="100" value={f.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
            </Field>
            <Field
              label="Balance now"
              htmlFor="cm-bal"
              className="col-span-2"
              hint="A snapshot, dated today — the screen shows how stale it gets, because a card balance goes off in days."
            >
              <Input id="cm-bal" className="num" type="number" step="0.01" value={f.balance} onChange={e => set('balance', e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Amount" htmlFor="cm-amount">
              <Input id="cm-amount" className="num" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} />
            </Field>
            <Field label="Every" htmlFor="cm-every">
              <Select value={f.every_months} onValueChange={v => set('every_months', v)}>
                <SelectTrigger id="cm-every" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Month</SelectItem>
                  <SelectItem value="3">Quarter</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">Year</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <Field label="Lender / payee" htmlFor="cm-lender">
          <Input id="cm-lender" value={f.lender} onChange={e => set('lender', e.target.value)} />
        </Field>
        <Field label="Due day" htmlFor="cm-due" hint="Day of the month, optional.">
          <Input id="cm-due" className="num" type="number" min="1" max="31" value={f.due_day} onChange={e => set('due_day', e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !ready}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * A new income source.
 *
 * Cadence is asked because it decides what the app may claim: a monthly source
 * gets a pay day and a firm figure in the waterfall, an irregular one gets an
 * average and is drawn faded everywhere. Storing a pay day for an irregular
 * source would invent a certainty it does not have, and the API refuses it.
 */
function IncomeDialog() {
  const { state, closeModal, addIncomeSource, createEpfAccounts } = useVantage()
  const [f, setF] = useState({
    kind: 'EMPLOYMENT',
    name: '',
    payer: '',
    cadence: 'MONTHLY',
    pay_day: '25',
    gross_default: '',
    epf_asset_id: '',
  })
  const [busy, setBusy] = useState(false)
  // Whether this job contributes to EPF. Kept apart from epf_asset_id because
  // the two answer different questions: this one is "does EPF apply", which the
  // owner decides, and that one is "to which account", which by now the app
  // works out. Employment means EPF for almost everyone, so it starts on.
  const [applyEpf, setApplyEpf] = useState(true)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const monthly = f.cadence === 'MONTHLY'
  const savings = state.assets.filter(a => !a.archived)

  // EPF is one membership split across three accounts, so the question is not
  // "which account?" but "are they set up?". Anything missing is offered rather
  // than created behind the reader's back — an account appearing on the Assets
  // screen that nobody asked for is exactly what was wrong before.
  const held = new Set(savings.map(a => a.product_id).filter(Boolean))
  const epfMissing = epfAccounts().filter(p => !held.has(p.id))
  const persaraan = savings.find(a => a.product_id === 'EPF_PERSARAAN')

  // Once they exist there is one right answer, so it is filled in rather than
  // asked. The split reaches all three regardless of which is named here.
  useEffect(() => {
    if (f.kind === 'EMPLOYMENT' && applyEpf && !f.epf_asset_id && persaraan) {
      set('epf_asset_id', String(persaraan.id))
    }
  }, [f.kind, f.epf_asset_id, persaraan, applyEpf])

  const save = async () => {
    if (!f.name.trim()) return
    setBusy(true)
    const ok = await addIncomeSource({
      kind: f.kind,
      name: f.name.trim(),
      payer: f.payer.trim(),
      cadence: f.cadence,
      pay_day: monthly ? Number(f.pay_day) : null,
      gross_default: f.gross_default === '' ? null : Number(f.gross_default),
      // Switched off, or not an employment source, means no EPF is booked at
      // all — the column is the flag the server reads.
      epf_asset_id:
        f.kind === 'EMPLOYMENT' && applyEpf && f.epf_asset_id !== ''
          ? Number(f.epf_asset_id)
          : null,
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Add income source</DialogTitle>
        <DialogDescription>
          Where money arrives from. Each payment is recorded against it, and net pay is worked out
          from the payslip rather than typed.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="in-kind">
          <Select value={f.kind} onValueChange={v => set('kind', v)}>
            <SelectTrigger id="in-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EMPLOYMENT">Employment</SelectItem>
              <SelectItem value="FREELANCE">Freelance</SelectItem>
              <SelectItem value="RENTAL">Rental</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Name" htmlFor="in-name">
          <Input
            id="in-name"
            autoFocus
            placeholder={f.kind === 'EMPLOYMENT' ? 'Day job' : 'Design work'}
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </Field>

        <Field
          label="How often?"
          htmlFor="in-cadence"
          className="col-span-2"
          hint="An irregular source is averaged over three months and drawn faded — it is never treated as a floor."
        >
          <Select value={f.cadence} onValueChange={v => set('cadence', v)}>
            <SelectTrigger id="in-cadence" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MONTHLY">Monthly, on a known day</SelectItem>
              <SelectItem value="IRREGULAR">Irregular — whenever it comes</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {monthly ? (
          <>
            <Field label="Pay day" htmlFor="in-payday" hint="Day of the month, or -1 for the last working day.">
              <Input
                id="in-payday"
                className="num"
                type="number"
                min="-1"
                max="31"
                value={f.pay_day}
                onChange={e => set('pay_day', e.target.value)}
              />
            </Field>
            <Field label="Usual gross" htmlFor="in-gross" hint="Optional — stands in for a month not yet recorded.">
              <Input
                id="in-gross"
                className="num"
                type="number"
                step="0.01"
                value={f.gross_default}
                onChange={e => set('gross_default', e.target.value)}
              />
            </Field>
          </>
        ) : null}

        <Field label="Payer" htmlFor="in-payer">
          <Input id="in-payer" value={f.payer} onChange={e => set('payer', e.target.value)} />
        </Field>

        {f.kind === 'EMPLOYMENT' ? (
          <div className="border-hairline col-span-2 grid gap-2.5 rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="eyebrow">Apply EPF</span>
                <p className="text-faint mt-0.5 text-[11.5px] leading-relaxed">
                  Every payslip you record books its contribution into your EPF accounts. Rates live
                  in Settings.
                </p>
              </div>
              <Switch
                checked={applyEpf}
                onCheckedChange={setApplyEpf}
                aria-label="Apply EPF to this job"
              />
            </div>

            {applyEpf && epfMissing.length ? (
              <div className="border-hairline grid gap-2 border-t pt-2.5">
                <p className="text-faint text-[11.5px] leading-relaxed">
                  Since 2024 a contribution is split three ways:{' '}
                  {epfAccounts().map((p, i) => (
                    <span key={p.id}>
                      {i > 0 ? ', ' : ''}
                      <span className="num">{Math.round(p.share * 100)}%</span> to{' '}
                      {p.name.replace('EPF ', '')}
                    </span>
                  ))}
                  . Set them up and each payslip books its own share into all three.
                </p>
                <div>
                  <Button size="sm" variant="outline" onClick={createEpfAccounts}>
                    <PlusIcon />
                    Create{' '}
                    {epfMissing.length === 3 ? 'my EPF accounts' : `the missing ${epfMissing.length}`}
                  </Button>
                </div>
              </div>
            ) : applyEpf ? (
              <div className="border-hairline grid gap-1 border-t pt-2.5">
                {epfAccounts().map(p => (
                  <div key={p.id} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="num text-primary w-[38px] font-semibold">
                      {Math.round(p.share * 100)}%
                    </span>
                    <span>{p.name.replace('EPF ', '')}</span>
                  </div>
                ))}
                <p className="text-faint mt-0.5 text-[11px]">
                  Both halves — yours and your employer's — split across all three.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !f.name.trim()}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * One payment recorded against a source.
 *
 * THE TWO GROUPS ARE SEPARATED IN THE FORM because they are separated in reality:
 * what comes out of your pay decides net, and what the employer pays alongside it
 * does not. Putting employer EPF in the first group is the classic mistake, and
 * the API rejects it by name when the deductions exceed gross.
 *
 * Net is shown live rather than entered — it is gross less the first group, and a
 * figure you could type would be a second source of truth for it.
 */
function IncomeEventDialog({ prefill }) {
  const { state, closeModal, addIncomeEvent } = useVantage()
  const [f, setF] = useState({
    source_id: String(prefill.source_id ?? state.incomeSources[0]?.id ?? ''),
    date: prefill.date || today(),
    gross: '',
    epf_employee: '',
    socso_employee: '',
    eis_employee: '',
    skbbk: '',
    pcb: '',
    zakat: '',
    other_deducted: '',
    epf_employer: '',
    socso_employer: '',
    eis_employer: '',
    note: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const n = v => (v === '' ? 0 : Number(v) || 0)

  const source = state.incomeSources.find(s => String(s.id) === f.source_id)
  const employment = source && source.kind === 'EMPLOYMENT'
  // EPF applies to this job when it was linked to an account — the same flag the
  // server reads to decide whether to book anything.
  const epfApplies = Boolean(employment && source.epf_asset_id != null)

  // Suggest EPF from gross, and stop as soon as the figures are edited.
  //
  // The suggestion is remembered rather than compared against a percentage, so a
  // typed figure that happens to equal 11% is still treated as typed. That
  // matters because the payslip is the authority: below RM20,000 EPF comes from
  // the Third Schedule's bands, not a percentage, so the real number is usually
  // a few ringgit off and must survive the next keystroke in the gross field.
  const [epfHint, setEpfHint] = useState(null)
  useEffect(() => {
    if (!epfApplies) return
    const owned = k => f[k] !== '' && f[k] !== (epfHint ? epfHint[k] : null)
    if (owned('epf_employee') || owned('epf_employer')) return
    const g = Number(f.gross)
    if (!Number.isFinite(g) || g <= 0) return
    const sug = epfFromGross(g, state.preferences)
    const next = { epf_employee: sug.employee.toFixed(2), epf_employer: sug.employer.toFixed(2) }
    if (epfHint && next.epf_employee === epfHint.epf_employee && next.epf_employer === epfHint.epf_employer) {
      return
    }
    setEpfHint(next)
    setF(p => ({ ...p, ...next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.gross, epfApplies])
  const deducted =
    n(f.epf_employee) + n(f.socso_employee) + n(f.eis_employee) + n(f.skbbk) + n(f.pcb) + n(f.zakat) + n(f.other_deducted)
  const onTop = n(f.epf_employer) + n(f.socso_employer) + n(f.eis_employer)
  const net = n(f.gross) - deducted

  const save = async () => {
    if (!f.source_id || !f.date || f.gross === '') return
    setBusy(true)
    const ok = await addIncomeEvent(Number(f.source_id), {
      date: f.date,
      gross: n(f.gross),
      epf_employee: n(f.epf_employee),
      socso_employee: n(f.socso_employee),
      eis_employee: n(f.eis_employee),
      skbbk: n(f.skbbk),
      pcb: n(f.pcb),
      zakat: n(f.zakat),
      other_deducted: n(f.other_deducted),
      epf_employer: n(f.epf_employer),
      socso_employer: n(f.socso_employer),
      eis_employer: n(f.eis_employer),
      note: f.note.trim(),
    })
    setBusy(false)
    if (ok) closeModal()
  }

  const money = (label, key) => (
    <Field label={label} htmlFor={`ev-${key}`}>
      <Input
        id={`ev-${key}`}
        className="num"
        type="number"
        min="0"
        step="0.01"
        value={f[key]}
        onChange={e => set(key, e.target.value)}
      />
    </Field>
  )

  return (
    <DialogContent className="sm:max-w-[540px]">
      <DialogHeader>
        <DialogTitle>Record a payment</DialogTitle>
        <DialogDescription>
          Net pay is worked out from what you enter, never typed — it is gross less the first group
          only.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Source" htmlFor="ev-source" className="col-span-2">
          <Select value={f.source_id} onValueChange={v => set('source_id', v)}>
            <SelectTrigger id="ev-source" className="w-full">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {state.incomeSources
                .filter(s => s.active)
                .map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date" htmlFor="ev-date">
          <Input id="ev-date" className="num" type="date" value={f.date} onChange={e => set('date', e.target.value)} />
        </Field>
        {money('Gross', 'gross')}
        <Field label="Note" htmlFor="ev-note" className="col-span-2">
          <Input id="ev-note" value={f.note} onChange={e => set('note', e.target.value)} />
        </Field>
      </div>

      {employment ? (
        <>
          <div>
            <p className="eyebrow">Deducted from your pay</p>
            {epfApplies ? (
              <p className="text-faint mt-1 text-[11px] leading-relaxed">
                EPF is suggested from gross at your Settings rates. Below RM 20,000 a month the real
                figure comes from the Third Schedule's wage bands, not a percentage, so expect a few
                ringgit of difference — type what the payslip says and the suggestion stops.
              </p>
            ) : null}
            <div className="mt-2 grid grid-cols-3 gap-3">
              {money('EPF', 'epf_employee')}
              {money('SOCSO', 'socso_employee')}
              {money('EIS', 'eis_employee')}
              {money('SKBBK', 'skbbk')}
              {money('PCB', 'pcb')}
              {money('Zakat', 'zakat')}
            </div>
          </div>

          <div>
            <p className="eyebrow">Paid on top by your employer</p>
            <p className="text-faint mt-1 text-[11px]">
              Never subtracted from net. EPF from both groups is booked into your EPF accounts in
              the same write, split 75/15/10.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {money('EPF', 'epf_employer')}
              {money('SOCSO', 'socso_employer')}
              {money('EIS', 'eis_employer')}
            </div>
          </div>
        </>
      ) : null}

      <div className="border-hairline flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t pt-3 text-[13px]">
        <span className="text-muted-foreground">
          Net <b className={`num font-semibold ${net < 0 ? 'text-loss' : 'text-foreground'}`}>{net.toFixed(2)}</b>
        </span>
        {deducted > 0 ? (
          <span className="text-muted-foreground">
            Deducted <b className="num text-foreground font-semibold">{deducted.toFixed(2)}</b>
          </span>
        ) : null}
        {onTop > 0 ? (
          <span className="text-muted-foreground">
            On top <b className="num text-foreground font-semibold">{onTop.toFixed(2)}</b>
          </span>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !f.source_id || !f.date || f.gross === '' || net < 0}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * A goal, as a side panel like every other form.
 *
 * It used to sit inline at the bottom of the Goals screen, which meant the page
 * ended in an empty form whether or not you wanted one, and the form was the
 * only one in the app not to look like the others.
 *
 * The two families take different fields, and the switch is the goal type: a
 * share goal counts shares in the instrument's own currency, an income goal
 * counts ringgit so that a per-holding target and a portfolio-wide one can be
 * compared at all.
 */
function GoalDialog() {
  const { state, closeModal, addGoal } = useVantage()
  const [kind, setKind] = useState(GOAL_KIND.SHARES)
  const [ticker, setTicker] = useState('')
  const [target, setTarget] = useState('500')
  const [amount, setAmount] = useState('1000')
  const [monthly, setMonthly] = useState('')
  const [busy, setBusy] = useState(false)

  const instruments = state.instruments
  const income = isIncome(kind)
  // Per-payment is per holding only: combined across holdings it would measure
  // which funds happened to pay that day rather than the portfolio.
  const needsInstrument = GOAL_NEEDS_INSTRUMENT.has(kind)
  const picked = needsInstrument
    ? ticker && ticker !== WHOLE
      ? ticker
      : instruments[0]?.ticker || ''
    : ticker || WHOLE
  const blocked = needsInstrument && !instruments.length

  const save = async () => {
    if (blocked || busy) return
    setBusy(true)
    const ok = await addGoal(
      income
        ? {
            kind,
            ticker: picked === WHOLE ? undefined : picked,
            target_amount: Number(amount) || 0,
          }
        : {
            kind: GOAL_KIND.SHARES,
            ticker: picked,
            target_qty: Number(target) || 1,
            monthly_budget: monthly ? Number(monthly) : null,
          },
    )
    setBusy(false)
    if (ok) closeModal()
  }

  const amountLabel =
    kind === GOAL_KIND.INCOME_MONTHLY
      ? 'Target per month (RM)'
      : kind === GOAL_KIND.INCOME_PER_PAYMENT
        ? 'Target per payment (RM)'
        : 'Target (RM)'

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>New goal</DialogTitle>
        <DialogDescription>
          A number of shares to accumulate, or a dividend target. Income targets are always in
          ringgit, so a per-holding goal and a portfolio-wide one stay comparable.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <Field
          label="Goal type"
          htmlFor="g-kind"
          hint={KIND_OPTIONS.find(o => o.id === kind)?.hint}
        >
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="g-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map(o => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={income ? 'Scope' : 'Instrument'}
          htmlFor="g-t"
          hint={blocked ? 'Add an instrument first, from the Instruments screen.' : undefined}
        >
          <Select value={picked} onValueChange={setTicker} disabled={blocked}>
            <SelectTrigger id="g-t" className="w-full">
              <SelectValue placeholder="No instruments yet" />
            </SelectTrigger>
            <SelectContent>
              {income && !needsInstrument ? <SelectItem value={WHOLE}>All holdings</SelectItem> : null}
              {instruments.map(i => (
                <SelectItem key={i.ticker} value={i.ticker}>
                  {i.ticker}
                  <span className="text-faint ml-1">{i.currency}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {income ? (
          <Field
            label={amountLabel}
            htmlFor="g-amount"
            hint={
              'Counts ' +
              (goalIncomeIsNet(state)
                ? 'what reached your wallet after tax'
                : 'dividends as declared, before tax') +
              ' — set by the P&L basis in Settings.'
            }
          >
            <Input
              id="g-amount"
              type="number"
              min="1"
              step="100"
              className="num"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target shares" htmlFor="g-target">
              <Input
                id="g-target"
                type="number"
                min="1"
                step="1"
                className="num"
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </Field>
            <Field
              label="Monthly budget (RM)"
              htmlFor="g-monthly"
              hint="Optional — what you plan to put in each month."
            >
              <Input
                id="g-monthly"
                type="number"
                min="0"
                step="10"
                placeholder="optional"
                className="num"
                value={monthly}
                onChange={e => setMonthly(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || blocked}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Modals() {
  const { modal, closeModal } = useVantage()
  const open = Boolean(modal)
  return (
    <Dialog open={open} onOpenChange={v => (v ? null : closeModal())}>
      {modal?.kind === 'instrument' && <InstrumentDialog />}
      {modal?.kind === 'transaction' && <TransactionDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'cash' && <CashDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'asset' && <AssetDialog />}
      {modal?.kind === 'assetEntry' && <AssetEntryDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'commitment' && <CommitmentDialog />}
      {modal?.kind === 'income' && <IncomeDialog />}
      {modal?.kind === 'incomeEvent' && <IncomeEventDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'goal' && <GoalDialog />}
    </Dialog>
  )
}

/* ── first-load / server-down ─────────────────────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-lg" />
    </div>
  )
}

function ServerDown({ message, onRetry }) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Can&rsquo;t reach the Vantage server</AlertTitle>
      <AlertDescription>
        <p>
          Start it with <code className="num">npm start</code> in the project root, then retry.
          {message ? ` (${message})` : null}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCwIcon />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/* ── shell ────────────────────────────────────────────────────────────────── */

export default function App() {
  const { tab, setTab, loading, error, reload, locked, unlock } = useVantage()

  // Before anything else: no header, no tabs, no data on screen.
  if (locked) {
    return (
      <TooltipProvider delayDuration={250}>
        <LockScreen onUnlock={unlock} />
        <Toaster position="bottom-center" richColors closeButton />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="min-h-svh items-stretch gap-0">
        <SideNav />
        {/* min-w-0 or a wide table inside a screen stretches the whole layout. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="w-full flex-1 px-[clamp(14px,2.4vw,28px)] pt-5 pb-20">
            {loading ? (
              <LoadingScreen />
            ) : error ? (
              <ServerDown message={error} onRetry={() => reload().catch(() => {})} />
            ) : (
              Object.entries(SCREENS).map(([id, Screen]) => (
                <TabsContent key={id} value={id}>
                  <Screen />
                </TabsContent>
              ))
            )}
          </main>
        </div>
      </Tabs>
      <Modals />
      <Toaster position="bottom-center" richColors closeButton />
    </TooltipProvider>
  )
}
