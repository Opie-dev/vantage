/**
 * The Vantage app shell.
 *
 * Owns: the side navigation (brand, screens, last-sync line, theme toggle), the
 * top bar (screen title, Sync, ↻ Prices, theme), the first-load /
 * server-down states, the toast host, and the three write dialogs.
 *
 * Navigation is a VERTICAL rail, not a row of tabs. Even at eight screens a
 * horizontal strip overflowed on any narrow window, and the rail also gives the
 * last-sync line and theme toggle a home that is not competing with the actions.
 *
 * It is still Radix Tabs underneath: orientation="vertical" moves the active
 * indicator to the right edge and rebinds the arrow keys to up/down, so the whole
 * keyboard contract comes for free. Below 1024px the rail keeps its structure and
 * drops to icons alone — a layout that changes shape at a breakpoint would need a
 * second orientation, and a drawer would need focus trapping this app has no other
 * use for.
 *
 * Screens live in src/screens/*.jsx and are rendered inside a TabsContent. They
 * never render their own header, and every form that WRITES lives here — a
 * screen calls the openers on useVantage() instead. See src/lib/store.jsx for
 * that contract.
 *
 * A panel that only READS is the screen's own business: Portfolio opens one for
 * a holding's income history. It is not shared, it is not a form, and putting it
 * in the store would mean the shell holding a piece of one screen's presentation
 * state on that screen's behalf.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  CloudDownloadIcon,
  CreditCardIcon,
  LandmarkIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  HistoryIcon,
  LayersIcon,
  LayoutDashboardIcon,
  BanknoteIcon,
  EyeIcon,
  EyeOffIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PiggyBankIcon,
  RefreshCwIcon,
  SettingsIcon,
  SunIcon,
  TargetIcon,
  TriangleAlertIcon,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import {
  EXPENSE_GROUPS,
  EXPENSE_LABEL,
  GOAL_KIND,
  GOAL_NEEDS_INSTRUMENT,
  commitmentRows,
  goalIncomeIsNet,
  planEffectiveRate,
  planFit,
  previewStatementImport,
  startFromMonthsLeft,
} from '@/lib/calc'
import {
  FISCAL_YEARS,
  INSTITUTIONS,
  OTHER,
  SHARIAH,
  estimatedRate,
  institutionOf,
  latestRate,
  productOf,
  rateIsStale,
  totalRate,
  withRates,
} from '@/lib/institutions'
import LockScreen from '@/components/LockScreen'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { parseStatementPdf } from '@/lib/api'
import { TABS, useVantage } from '@/lib/store'
import { dtfmt, fmt, pct1, today } from '@/lib/format'

import Dashboard from '@/screens/Dashboard'
import Portfolio from '@/screens/Portfolio'
import History from '@/screens/History'
import CalendarScreen from '@/screens/Calendar'
import Goals, { KIND_OPTIONS, WHOLE, isBalance, isIncome } from '@/screens/Goals'
import Assets from '@/screens/Assets'
import Overview from '@/screens/Overview'
import Income from '@/screens/Income'
import Commitments from '@/screens/Commitments'
import Cards from '@/screens/Cards'
import Loans from '@/screens/Loans'
import Expenses from '@/screens/Expenses'
import Settings from '@/screens/Settings'

const SCREENS = {
  dashboard: Dashboard,
  portfolio: Portfolio,
  history: History,
  calendar: CalendarScreen,
  goals: Goals,
  assets: Assets,
  overview: Overview,
  income: Income,
  commitments: Commitments,
  cards: Cards,
  loans: Loans,
  expenses: Expenses,
  settings: Settings,
}

/* ── shell pieces ─────────────────────────────────────────────────────────── */

/** Radix Select refuses an empty string as a value, so "nothing chosen" needs a
 *  sentinel that is never a real id. */
const NONE = '__none__'

/** One per TABS entry. Kept here rather than in the store: the store holds data,
 *  and which glyph a screen wears is a presentation choice. */
const NAV_ICON = {
  dashboard: LayoutDashboardIcon,
  portfolio: LayersIcon,
  history: HistoryIcon,
  calendar: CalendarDaysIcon,
  goals: TargetIcon,
  assets: PiggyBankIcon,
  overview: BanknoteIcon,
  income: TrendingUpIcon,
  commitments: CalendarClockIcon,
  cards: CreditCardIcon,
  loans: LandmarkIcon,
  expenses: ReceiptTextIcon,
  settings: SettingsIcon,
}

/** The shortcut's name, not its behaviour — the handler below takes either
 *  modifier regardless, so a wrong guess here costs a wrong hint and nothing
 *  more. */
const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

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
 * Hide every figure behind '••••'.
 *
 * Beside the theme toggle because it is the same kind of control: how the screen
 * looks, not what is in it. Nothing is fetched and nothing is written to the
 * server — the figures are still in the DOM and one request away from the API.
 * This is for the person standing behind you, and the tooltip says so rather
 * than implying a protection that is not there.
 */
function PrivateToggle() {
  const { isPrivate, togglePrivate } = useVantage()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={isPrivate}
          aria-label={isPrivate ? 'Show the figures' : 'Hide the figures'}
          onClick={togglePrivate}
        >
          {isPrivate ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[250px]">
        {isPrivate
          ? 'Show the figures again'
          : 'Hide every figure behind ••••, for reading this in company. Not a lock — the numbers are still there.'}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The rail. Brand, the eight screens, and when the data last arrived.
 *
 * WIDTH IS A CHOICE NOW, NOT ONLY A BREAKPOINT. It used to be `w-[58px]
 * lg:w-[212px]` and nothing else, which meant a window under 1024px got the icon
 * strip with no way to read the labels, and a wide one could not reclaim the
 * 212px for a dense table. The breakpoint still decides the DEFAULT — see
 * railCollapsed in the store — and after that the owner decides.
 *
 * Every width rule below is now driven by that one boolean rather than by `lg:`,
 * so the rail cannot end up half-collapsed: 58px of chrome with labels clipped
 * inside it was the failure mode of doing this with two independent mechanisms.
 */
function SideNav() {
  const { state, railCollapsed } = useVantage()
  const wide = !railCollapsed

  return (
    <aside
      className={cn(
        'bg-background sticky top-0 z-30 flex h-svh shrink-0 flex-col border-r transition-[width] duration-150',
        wide ? 'w-[212px]' : 'w-[58px]',
      )}
    >
      <div
        className={cn(
          'flex h-[60px] shrink-0 items-center border-b',
          wide ? 'px-4' : 'justify-center',
        )}
      >
        <div className="num text-[17px] leading-none font-semibold tracking-[0.04em] lg:text-[19px]">
          {wide ? (
            <>
              Vantage
              <div className="eyebrow mt-1.5">personal finance</div>
            </>
          ) : (
            'V'
          )}
        </div>
      </div>

      <TabsList
        variant="line"
        className="w-full flex-1 items-stretch justify-start gap-0.5 overflow-y-auto rounded-none p-2"
      >
        {TABS.map((t, i) => {
          const Icon = NAV_ICON[t.id]
          // A group heading opens on the first entry carrying that group. On the
          // icon rail there is no room for the word, so the group becomes a rule
          // instead — the break is the part that survives the narrow width.
          const opensGroup = t.group && t.group !== TABS[i - 1]?.group
          return (
            <Fragment key={t.id}>
              {opensGroup ? (
                wide ? (
                  <span className="eyebrow px-3 pt-3 pb-1">{t.group}</span>
                ) : (
                  <span className="bg-border mx-auto my-2 h-px w-6" aria-hidden="true" />
                )
              ) : null}
            <TabsTrigger
              value={t.id}
              // The label is hidden by width, never removed: sr-only keeps it as the
              // button's accessible name on the icon rail, where a tooltip would
              // only reach a mouse. `title` gives that rail a hover hint too.
              title={t.label}
              className={cn(
                'h-9 flex-none gap-2.5 rounded-md text-[13px] font-semibold data-[state=active]:bg-muted data-[state=active]:after:bg-primary',
                wide ? 'justify-start px-3' : 'justify-center px-0',
                // Pushed to the bottom of the column, but only when there is
                // room to push into: the rail scrolls, and in a scrolled list
                // `mt-auto` collapses to nothing rather than stranding the row.
                t.foot && 'mt-auto',
              )}
            >
              <Icon aria-hidden="true" />
              {/* The label is hidden by width, never removed: sr-only keeps it as
                  the button's accessible name on the icon rail, where a tooltip
                  would only reach a mouse. `title` gives that rail a hover hint. */}
              <span className={wide ? '' : 'sr-only'}>{t.label}</span>
            </TabsTrigger>
            </Fragment>
          )
        })}
      </TabsList>

      <div className={cn('shrink-0 border-t', wide ? 'px-3 py-2.5' : 'p-2')}>
        <div className="flex items-center justify-center gap-2">
          <span className={cn('text-faint text-[11px] leading-tight', wide ? '' : 'hidden')}>
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
  const { tab, refreshPrices, pricesPending, syncMoomoo, syncPending, railCollapsed, toggleRail } =
    useVantage()
  const current = TABS.find(t => t.id === tab)
  const wide = !railCollapsed

  // ⌘B / Ctrl-B, the shortcut every editor with a sidebar has already trained
  // into the hands reaching for this one. It lives beside the button rather
  // than in the rail, for the same reason the button does: this is the control
  // that trades the labels away, so it belongs where that trade is read.
  //
  // SKIPPED WHILE TYPING. A field owns its own keystrokes, and this pair means
  // bold in more than a few of them — folding the navigation instead of
  // emboldening a word is the kind of surprise that gets a shortcut disabled.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'b' && e.key !== 'B') return
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const el = e.target
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName || '')) return
      e.preventDefault()
      toggleRail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleRail])

  return (
    <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur-md">
      <div className="flex h-[60px] w-full flex-wrap items-center gap-x-3 gap-y-2 px-[clamp(14px,2.4vw,28px)]">
        {/* Beside the name of the screen it is making room for, rather than in the
            rail's own header — the thing you are trading away is the labels next
            to these titles, and the control now sits where that trade is read. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleRail}
              aria-label={wide ? 'Collapse the sidebar' : 'Expand the sidebar'}
              aria-expanded={wide}
              className="-ml-1.5"
            >
              {wide ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {wide ? 'Collapse the sidebar' : 'Expand the sidebar'}
            {/* The shortcut is discoverable only if it is written somewhere, and
                the tooltip for the button it duplicates is that somewhere. */}
            <span className="text-faint ml-1.5">{MOD_KEY}B</span>
          </TooltipContent>
        </Tooltip>
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
          <PrivateToggle />
          <ThemeToggle />
      </div>
    </header>
  )
}

/* ── dialogs ──────────────────────────────────────────────────────────────── */

/**
 * A labelled control, one cell of the two-column form grid.
 *
 * `content-start` is load-bearing. Grid cells stretch to the tallest in the row,
 * and a stretched grid container spreads its own rows through the extra height —
 * so a field beside one with a two-line hint had its label and input drifting
 * down the cell, out of line with the field it sat next to. Packing the rows to
 * the top keeps every label on the same baseline whatever its neighbour does.
 */
function Field({ label, htmlFor, hint, children, className = '' }) {
  return (
    <div className={`grid content-start gap-1.5 ${className}`}>
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
function AssetDialog({ prefill }) {
  const { state, closeModal, addAsset, updateAsset } = useVantage()
  const editing = prefill.id != null
  const str = (v, fallback = '') => (v == null ? fallback : String(v))
  const [f, setF] = useState({
    // An existing account already names its institution, and the catalogue is
    // only there to fill a blank form — so editing starts on the free-text side
    // rather than trying to match a saved name back to a catalogue entry.
    institution_id: editing ? OTHER : '',
    product_id: str(prefill.product_id),
    name: str(prefill.name),
    institution: str(prefill.institution),
    rate_basis: prefill.rate_basis || 'MIN_MONTHLY',
    liquidity: prefill.liquidity || 'SAVINGS',
    rate_quote: prefill.rate_quote || 'PERCENT',
    last_rate: str(prefill.last_rate),
    last_bonus: str(prefill.last_bonus),
    unit_cap: str(prefill.unit_cap),
    fiscal_year: prefill.fiscal_year || '12-31',
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
    const body = {
      name: f.name.trim(),
      institution: f.institution.trim(),
      rate_basis: f.rate_basis,
      rate_quote: f.rate_quote,
      liquidity: f.liquidity,
      // Sen-per-unit accounts are the ones that talk about units at all.
      unit_label: f.rate_quote === 'SEN_PER_UNIT' ? 'units' : '',
      last_rate: f.last_rate === '' ? null : Number(f.last_rate),
      last_bonus: f.last_bonus === '' ? null : Number(f.last_bonus),
      unit_cap: f.unit_cap === '' ? null : Number(f.unit_cap),
      fiscal_year: f.fiscal_year,
      // Which catalogue entry this is. Nothing reads it today — the EPF split
      // that needed it was reverted — but the column is applied and an account
      // that records what it IS costs nothing and is not recoverable later.
      product_id: f.product_id || null,
    }
    // slug is not sent on an edit: it is the key the UI addresses an account by,
    // and the service refuses to change it — renaming would orphan those links.
    const ok = editing ? await updateAsset(prefill.id, body) : await addAsset({ ...body, slug })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${prefill.name}` : 'Add account'}</DialogTitle>
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
        {/* Asked separately from "how does it pay" because it is a different
            question with a different answer: a MAE Tabung declares no rate and is
            still where you spend from, while EPF Akaun Fleksibel declares one and
            is not. Nothing defaults to a wallet — that is a claim only the owner
            can make about their own bank account. */}
        <Field
          label="How reachable is it?"
          htmlFor="as-liq"
          className="col-span-2"
          hint="A wallet is where money sits between arriving and being spent — naming one is what lets the app work out what living costs."
        >
          <Select value={f.liquidity} onValueChange={v => set('liquidity', v)}>
            <SelectTrigger id="as-liq" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WALLET">
                I spend from it — a current account, an e-wallet
              </SelectItem>
              <SelectItem value="SAVINGS">
                I put money aside in it, and can get it back — ASB, Tabung Haji
              </SelectItem>
              <SelectItem value="LOCKED">
                I cannot touch it yet — EPF Akaun Persaraan
              </SelectItem>
            </SelectContent>
          </Select>
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
              <SelectItem value="NONE">
                It does not declare a rate — a bank savings account
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {/* All of this describes a declared distribution, so none of it applies
            to an account that declares none. Hidden rather than disabled: a
            greyed row of rate fields still reads as something you failed to
            fill in. */}
        {f.rate_basis === 'NONE' ? null : (
        <>
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

        {f.rate_basis === 'NONE' ? (
          <p className="text-faint col-span-2 -mt-1 text-[11.5px] leading-relaxed">
            No rate, no financial year and no estimate — the balance is whatever the entries add up
            to. That is the whole of what this app can say about a bank savings account, and saying
            less is better than projecting a year of income it never declared.
          </p>
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
        </>
        )}

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
        {f.rate_basis === 'NONE' ? null : (
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
        )}
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
/** Sentinel for "no wallet" in the expense form — Radix rejects '' as a value. */
const NO_WALLET = '__none__'

/**
 * One expense.
 *
 * DELIBERATELY THE SHORTEST FORM IN THE APP. Every other form here is filled in
 * once and correct for years; this one is filled in over and over, and the whole
 * feature is won or lost at the point of entry. Four fields, one of them
 * optional, and the date defaults to today because that is when you are typing.
 *
 * The account is optional on purpose: the log is useful before any wallet is set
 * up, and cash has no account at all. Naming one is what lets the reconciliation
 * work per wallet, which matters here because the owner spends from several
 * cards by purpose.
 */
function ExpenseDialog({ prefill }) {
  const { state, closeModal, addExpense, updateExpense } = useVantage()
  const editing = prefill.id != null
  const wallets = (state.assets || []).filter(a => !a.archived && a.liquidity === 'WALLET')
  const [f, setF] = useState({
    date: prefill.date || today(),
    amount: prefill.amount ?? '',
    category: prefill.category || 'GROCERIES',
    note: prefill.note || '',
    asset_id: prefill.asset_id == null ? NO_WALLET : String(prefill.asset_id),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const amount = Number(f.amount)
  const valid = f.date && Number.isFinite(amount) && amount > 0

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    const body = {
      date: f.date,
      amount: Math.abs(amount),
      category: f.category,
      note: f.note.trim(),
      asset_id: f.asset_id === NO_WALLET ? null : Number(f.asset_id),
    }
    const ok = editing ? await updateExpense(prefill.id, body) : await addExpense(body)
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit expense' : 'Add expense'}</DialogTitle>
        <DialogDescription>
          What you actually spent. Rent, insurance and subscriptions are{' '}
          <b className="font-semibold">commitments</b> and belong there — entering them here as
          well would count them twice against your income.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (RM)" htmlFor="ex-amount">
          <Input
            id="ex-amount"
            className="num"
            type="number"
            min="0"
            step="0.01"
            autoFocus
            placeholder="0.00"
            value={f.amount}
            onChange={e => set('amount', e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="ex-date">
          <Input
            id="ex-date"
            className="num"
            type="date"
            value={f.date}
            onChange={e => set('date', e.target.value)}
          />
        </Field>
        <Field label="Category" htmlFor="ex-cat" className="col-span-2">
          <Select value={f.category} onValueChange={v => set('category', v)}>
            <SelectTrigger id="ex-cat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            {/* Grouped, because twenty-eight names in one column is a scroll and a
                scroll at the point of entry is where this feature is lost. The
                group is a heading and not a choice: only the category is
                stored, and picking one is still a single click. */}
            <SelectContent>
              {EXPENSE_GROUPS.map(g => (
                <SelectGroup key={g.group}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.categories.map(c => (
                    <SelectItem key={c} value={c}>
                      {EXPENSE_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {wallets.length ? (
          <Field
            label="Paid from"
            htmlFor="ex-asset"
            className="col-span-2"
            hint="Optional. Naming the card it came off is what lets each wallet be reconciled on its own."
          >
            <Select value={f.asset_id} onValueChange={v => set('asset_id', v)}>
              <SelectTrigger id="ex-asset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_WALLET}>Not recorded — cash, or elsewhere</SelectItem>
                {wallets.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label="Note" htmlFor="ex-note" className="col-span-2">
          <Input
            id="ex-note"
            placeholder="Optional — Jaya Grocer, dinner with family"
            value={f.note}
            onChange={e => set('note', e.target.value)}
          />
        </Field>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !valid}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function AssetEntryDialog({ prefill }) {
  const { state, closeModal, addAssetEntry } = useVantage()
  const [f, setF] = useState({
    asset_id: String(prefill.asset_id ?? state.assets[0]?.id ?? ''),
    type: prefill.type || 'DEPOSIT',
    amount: prefill.amount ?? 500,
    date: prefill.date || today(),
    note: prefill.note || '',
    // Only ever sent with a DEPOSIT — see the Field below for why it exists.
    source: prefill.source || 'manual',
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
      // The API refuses 'opening' on anything but a DEPOSIT, and neither it nor
      // 'payroll' means anything on money coming out, so a type changed after the
      // box was set must not carry the old answer along with it.
      source: f.type === 'DEPOSIT' ? f.source : 'manual',
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
              {/* Only where it means anything. On a savings account the API
                  refuses it, so offering it would be a dead end you can pick. */}
              {asset?.liquidity === 'WALLET' ? <SelectItem value="BALANCE">BALANCE</SelectItem> : null}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={`Amount (${asset ? asset.currency : 'MYR'})`}
          htmlFor="ae-amount"
          hint={
            f.type === 'BALANCE'
              ? 'What the account holds as of this date — not what changed. This is the reading that lets the app work out what living costs.'
              : 'Always positive — the type says which way it moves.'
          }
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
        {/* Only for a deposit, and only because the money calendar has to tell
            these apart. Two of the three never passed through your wallet, for
            different reasons. An opening balance moved long before this ledger
            existed; counting it as spending on the day you type it in overstates
            that month by the whole balance. A payroll contribution was taken from
            your pay before you saw it, so net pay is already short of it and
            counting it again deducts the same ringgit twice on one screen — which
            is the case that matters now that a payslip books nothing itself. All
            three are equally real to the Assets screen. */}
        {f.type === 'DEPOSIT' ? (
          <Field
            label="What this is"
            htmlFor="ae-source"
            className="col-span-2"
            hint="An opening balance and money from your pay both reached the account without passing through your wallet — they count towards the balance, but never as money you spent this month."
          >
            <Select value={f.source} onValueChange={v => set('source', v)}>
              <SelectTrigger id="ae-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Contribution — money you paid in</SelectItem>
                <SelectItem value="opening">Opening balance — what it already held</SelectItem>
                <SelectItem value="payroll">From your pay — EPF, deducted before you saw it</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
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
/**
 * Add a commitment, or edit one.
 *
 * The same form does both because the fields are the same fields — a separate
 * edit form would be this one with different defaults, and the two would drift
 * the first time a field was added to only one of them.
 *
 * `prefill` carrying an id is what makes it an edit. Numbers arrive from the API
 * as numbers and every input here is a string, so they are converted on the way
 * in rather than each field having to cope with both.
 */
/**
 * An instalment plan on a card — the derivable half of it.
 *
 * FIVE FIELDS AND TODAY'S DATE do the rest, exactly as they do for a loan: how
 * many instalments have been paid, what is left, when it ends and what it is
 * blocking off the limit are all derived. You never type an instalment twice.
 *
 * The two dates are separate on purpose. A purchase made after the bill closed
 * was SPENT this month and starts COSTING next, and collapsing them files the
 * spending in the wrong month — which is the exact error the float exists to fix.
 */
function CardPlanDialog({ prefill }) {
  const { state, closeModal, addCardPlan, updateCardPlan } = useVantage()
  const editing = prefill.id != null
  const cards = state.commitments.filter(c => c.kind === 'REVOLVING' && c.active)
  const str = (v, fallback = '') => (v == null ? fallback : String(v))
  const [f, setF] = useState({
    commitment_id: String(prefill.commitment_id ?? cards[0]?.id ?? ''),
    kind: prefill.kind || 'EPP',
    name: str(prefill.name),
    merchant: str(prefill.merchant),
    amount: str(prefill.amount),
    tenure_months: str(prefill.tenure_months, '12'),
    instalment: str(prefill.instalment),
    rate: str(prefill.rate, '0'),
    upfront_fee: str(prefill.upfront_fee, '0'),
    purchased_on: prefill.purchased_on || today(),
    started_on: prefill.started_on || today(),
    settled_on: prefill.settled_on || '',
    // A 0% plan can stop being one: miss two consecutive minimums and the
    // concession is retracted and the unbilled balance is billed at the retail
    // rate. That is a state transition, not a rate change, so it is set here
    // rather than inferred from the dates.
    status: prefill.status || 'ACTIVE',
    category: prefill.category || 'THINGS',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = v => (v === '' ? null : Number(v))

  const ready = f.commitment_id && f.name.trim() && f.amount && f.tenure_months && f.instalment

  // What the plan actually costs, shown while the decision is still being made.
  // A fee on a "0%" plan is the only place its cost appears.
  const effective = planEffectiveRate({
    amount: num(f.amount),
    tenure_months: num(f.tenure_months),
    rate: Number(f.rate) || 0,
    upfront_fee: Number(f.upfront_fee) || 0,
  })
  // Only an EPP is a purchase. A cash-out moves money into your own account and a
  // balance transfer refinances a debt you already had; logging either as spending
  // would invent living costs that never happened.
  const isSpending = f.kind === 'EPP'

  /**
   * Whether the account has room for this, against what is ACTUALLY free.
   *
   * Not against what the bill says. A statement showing a third of the limit used
   * can sit on an account with almost nothing left, because instalments not yet
   * billed keep blocking the limit until each month's principal is paid — and no
   * statement prints that total anywhere. `availableRM` is the figure that does.
   *
   * It warns rather than refuses. The bank decides what fits; this only makes sure
   * the decision is taken against the real number, and a plan taken out anyway is
   * still a plan the app has to record faithfully. Skipped while editing, where
   * the plan is already on the account and would be counted against itself.
   */
  // Derived in calc.js, where the rest of the card arithmetic lives and where it
  // can be tested without a form. Skipped while editing: the plan is already on
  // the account and would be counted against itself.
  const fit = useMemo(() => {
    if (editing || !f.commitment_id || !num(f.amount)) return null
    const r = planFit(state, f.commitment_id, num(f.amount))
    return r && { ...r, instalment: num(f.instalment) || 0 }
  }, [editing, state, f.commitment_id, f.amount, f.instalment])

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const body = {
      kind: f.kind,
      name: f.name.trim(),
      merchant: f.merchant.trim(),
      amount: num(f.amount),
      tenure_months: Number(f.tenure_months),
      instalment: num(f.instalment),
      rate: Number(f.rate) || 0,
      upfront_fee: Number(f.upfront_fee) || 0,
      purchased_on: f.purchased_on,
      started_on: f.started_on,
      settled_on: f.settled_on || null,
      status: f.status,
      category: isSpending ? f.category : null,
    }
    const ok = editing
      ? await updateCardPlan(Number(f.commitment_id), prefill.id, body)
      : await addCardPlan(Number(f.commitment_id), body)
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit the plan' : 'Add an instalment plan'}</DialogTitle>
        <DialogDescription>
          An EPP, a balance transfer or a cash instalment. Everything after the first month is
          derived — you never type an instalment twice.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="On which card"
          htmlFor="cp-card"
          className="col-span-2"
          hint={editing ? 'A plan stays on the card whose limit it consumed.' : undefined}
        >
          <Select
            value={f.commitment_id}
            onValueChange={v => set('commitment_id', v)}
            disabled={editing}
          >
            <SelectTrigger id="cp-card" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cards.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Kind"
          htmlFor="cp-kind"
          className="col-span-2"
          hint={
            isSpending
              ? 'A purchase, so it reaches the expense log on the day it was bought.'
              : 'Not spending — this moves or refinances money you already owed, and is never logged as an expense.'
          }
        >
          <Select value={f.kind} onValueChange={v => set('kind', v)}>
            <SelectTrigger id="cp-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EPP">Easy payment plan — a purchase</SelectItem>
              <SelectItem value="BALANCE_TRANSFER">Balance transfer — another card&rsquo;s debt</SelectItem>
              <SelectItem value="CASH_INSTALMENT">Cash instalment — drawn to your account</SelectItem>
              <SelectItem value="AUTO_BALANCE_CONVERSION">Automatic balance conversion</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="What for" htmlFor="cp-name">
          <Input id="cp-name" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Fridge" />
        </Field>
        <Field label="Where" htmlFor="cp-merchant">
          <Input id="cp-merchant" value={f.merchant} onChange={e => set('merchant', e.target.value)} placeholder="Senheng" />
        </Field>

        <Field label="Amount financed" htmlFor="cp-amount" hint="What came off the limit.">
          <Input id="cp-amount" className="num" type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} />
        </Field>
        <Field label="Over how many months" htmlFor="cp-tenure">
          <Input id="cp-tenure" className="num" type="number" min="1" value={f.tenure_months} onChange={e => set('tenure_months', e.target.value)} />
        </Field>

        <Field
          label="Billed each month"
          htmlFor="cp-inst"
          className="col-span-2"
          hint="The bank's own figure, and the TOTAL for this plan — if it bills principal and interest as two lines, add them. Both count toward the minimum."
        >
          <Input id="cp-inst" className="num" type="number" step="0.01" value={f.instalment} onChange={e => set('instalment', e.target.value)} />
        </Field>

        <Field label="Rate (%)" htmlFor="cp-rate" hint="0 on a true 0% plan.">
          <Input id="cp-rate" className="num" type="number" step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} />
        </Field>
        <Field label="Upfront fee" htmlFor="cp-fee" hint="Where the cost of a 0% plan actually hides.">
          <Input id="cp-fee" className="num" type="number" step="0.01" value={f.upfront_fee} onChange={e => set('upfront_fee', e.target.value)} />
        </Field>

        <Field label="Bought on" htmlFor="cp-bought" hint="When it was spent.">
          <Input id="cp-bought" type="date" value={f.purchased_on} onChange={e => set('purchased_on', e.target.value)} />
        </Field>
        <Field label="First instalment" htmlFor="cp-start" hint="When money starts moving — often a cycle later.">
          <Input id="cp-start" type="date" value={f.started_on} onChange={e => set('started_on', e.target.value)} />
        </Field>

        {editing ? (
          <Field
            label="Standing"
            htmlFor="cp-status"
            className="col-span-2"
            hint="Retracted means the 0% was pulled and the rest was billed to the card — it stops billing instalments and what is left now lives in the revolving balance."
          >
            <Select value={f.status} onValueChange={v => set('status', v)}>
              <SelectTrigger id="cp-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Running</SelectItem>
                <SelectItem value="SETTLED">Settled early</SelectItem>
                <SelectItem value="RETRACTED">Retracted by the bank</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {isSpending ? (
          <Field label="Expense category" htmlFor="cp-cat" className="col-span-2">
            <Select value={f.category} onValueChange={v => set('category', v)}>
              <SelectTrigger id="cp-cat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_GROUPS.map(g => (
                  <SelectGroup key={g.group}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.categories.map(c => (
                      <SelectItem key={c} value={c}>
                        {EXPENSE_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {ready ? (
          <div className="border-hairline col-span-2 rounded-md border px-3 py-2.5">
            <span className="eyebrow">What it costs</span>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num text-[15px] font-semibold">
                {effective == null ? 'Nothing' : pct1(effective)}
              </span>
              <span className="text-muted-foreground text-[12px]">
                {effective == null
                  ? 'genuinely 0% — no rate, no fee'
                  : 'effective, on a reducing balance'}
              </span>
            </div>
            <p className="text-faint mt-1.5 mb-0 text-[11.5px] leading-relaxed text-pretty">
              {fmt(Number(f.instalment) * Number(f.tenure_months), 'MYR')} paid in total against{' '}
              {fmt(Number(f.amount), 'MYR')} financed.
              {effective == null
                ? ' A merchant plan with no fee really is free.'
                : ' Converted by the Hire-Purchase Act’s own Seventh Schedule formula, so it compares with every other rate on screen.'}
            </p>
          </div>
        ) : null}

        {fit ? (
          <div
            className={cn(
              'col-span-2 rounded-md border px-3 py-2.5',
              fit.fits
                ? 'border-[color:var(--gain)]/30 bg-[color:var(--gain)]/[0.06]'
                : 'border-[color:var(--loss)]/35 bg-[color:var(--loss)]/[0.07]',
            )}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={cn('text-[12.5px] font-semibold', fit.fits ? 'text-gain' : 'text-loss')}>
                {fit.fits ? 'This fits' : 'This does not fit'}
              </span>
              <span className="text-muted-foreground num text-[11.5px]">
                {fmt(fit.amount, fit.cur)} against {fmt(fit.availableRM, fit.cur)} of room
                {fit.fits
                  ? ` — ${fmt(fit.availableRM - fit.amount, fit.cur)} would be left`
                  : ` — short by ${fmt(fit.amount - fit.availableRM, fit.cur)}`}
              </span>
            </div>

            {/* The middle line is why this panel exists. Read only the statement
                and the account looks a third used; the instalments still to be
                billed keep blocking the limit until each month's principal is
                paid, and no statement prints that total anywhere. */}
            <div className="mt-2 grid gap-1">
              {[
                ['Limit', fit.limit, ''],
                ['– Billed and unpaid', -fit.billedUnpaid, 'text-loss'],
                ['– Instalments not yet billed', -fit.blocked, 'text-loss'],
                ['= Available', fit.availableRM, 'font-semibold'],
              ].map(([label, v, tone], i) => (
                <div
                  key={label}
                  className={cn(
                    'flex items-baseline justify-between gap-3 text-[11.5px]',
                    i === 3 && 'border-hairline mt-0.5 border-t pt-1',
                  )}
                >
                  <span className={i === 3 ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
                  <span className={cn('num', tone)}>{fmt(Math.abs(v), fit.cur)}</span>
                </div>
              ))}
            </div>

            <p className="text-faint m-0 mt-2 text-[11px] leading-relaxed text-pretty">
              {fit.fits
                ? `It would add ${fmt(fit.amount, fit.cur)} of float in the month it was bought, and ${fmt(fit.instalment, fit.cur)} a month to a minimum already at ${fmt(fit.minimum, fit.cur)}.`
                : `Reading the bill alone, this account looks ${pct1(fit.apparentPct)} used with ${fmt(fit.apparentFree, fit.cur)} free — and this plan would appear to fit. The app can say what a plan would do to the float and to the minimum. Whether to ask for a limit increase is not its business.`}
            </p>
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!ready || busy}>
          {busy ? 'Saving…' : editing ? 'Save' : 'Add plan'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * One statement — a dated reading of what a card owed.
 *
 * This is the row the float reads, and the reason it is a table rather than a
 * column: a float needs `owed` at TWO dates, and a mutable balance can only ever
 * answer for today. Upserts on the statement date, so recording the same bill
 * twice corrects it instead of duplicating it.
 */
function CardStatementDialog({ prefill }) {
  const { state, closeModal, addCardStatement } = useVantage()
  const cards = state.commitments.filter(c => c.kind === 'REVOLVING' && c.active)
  const str = (v, fallback = '') => (v == null ? fallback : String(v))
  const [f, setF] = useState({
    commitment_id: String(prefill.commitment_id ?? cards[0]?.id ?? ''),
    statement_date: prefill.statement_date || today(),
    due_date: prefill.due_date || '',
    closing_balance: str(prefill.closing_balance),
    minimum_due: str(prefill.minimum_due),
    interest_charged: str(prefill.interest_charged, '0'),
    fees_charged: str(prefill.fees_charged, '0'),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = v => (v === '' ? null : Number(v))
  const ready = f.commitment_id && f.statement_date && f.due_date && f.closing_balance !== ''

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const ok = await addCardStatement(Number(f.commitment_id), {
      statement_date: f.statement_date,
      due_date: f.due_date,
      closing_balance: Number(f.closing_balance),
      minimum_due: num(f.minimum_due),
      interest_charged: Number(f.interest_charged) || 0,
      fees_charged: Number(f.fees_charged) || 0,
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Record a statement</DialogTitle>
        <DialogDescription>
          Off the bill, as printed. One row a month — this is what lets the spending figure survive
          a credit card.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Which card" htmlFor="cs-card" className="col-span-2">
          <Select value={f.commitment_id} onValueChange={v => set('commitment_id', v)}>
            <SelectTrigger id="cs-card" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cards.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Statement date" htmlFor="cs-date" hint="The day it closed.">
          <Input id="cs-date" type="date" value={f.statement_date} onChange={e => set('statement_date', e.target.value)} />
        </Field>
        <Field label="Due date" htmlFor="cs-due">
          <Input id="cs-due" type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
        </Field>

        <Field
          label="Closing balance"
          htmlFor="cs-close"
          className="col-span-2"
          hint="The TOTAL owed as printed, instalment plans included — not the revolving part."
        >
          <Input id="cs-close" className="num" type="number" step="0.01" value={f.closing_balance} onChange={e => set('closing_balance', e.target.value)} />
        </Field>

        <Field
          label="Minimum due"
          htmlFor="cs-min"
          className="col-span-2"
          hint="As printed. It outranks anything derived, because the bank can see what this app cannot."
        >
          <Input id="cs-min" className="num" type="number" step="0.01" value={f.minimum_due} onChange={e => set('minimum_due', e.target.value)} />
        </Field>

        <Field label="Interest charged" htmlFor="cs-int" hint="The price of carrying a balance.">
          <Input id="cs-int" className="num" type="number" step="0.01" value={f.interest_charged} onChange={e => set('interest_charged', e.target.value)} />
        </Field>
        <Field label="Fees charged" htmlFor="cs-fee" hint="The price of holding the card.">
          <Input id="cs-fee" className="num" type="number" step="0.01" value={f.fees_charged} onChange={e => set('fees_charged', e.target.value)} />
        </Field>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!ready || busy}>
          {busy ? 'Saving…' : 'Record it'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/* ── statement import ─────────────────────────────────────────────────────── */

/**
 * One merchant the statement names and no rule explains.
 *
 * The pattern starts as the whole description and is editable, because that is
 * where the leverage is: sixteen Setel rows are one decision if the pattern is
 * `SETEL`, and sixteen decisions if it is the full line with its station code.
 * The count beside it re-reads this statement as you type, so the reach of a
 * shorter pattern is visible before it is saved rather than after.
 */
function UndecidedMerchant({ row, rows, targets }) {
  const { saveMerchantRule } = useVantage()
  const [f, setF] = useState({
    pattern: row.description,
    action: 'EXPENSE',
    category: 'GROCERIES',
    commitment_id: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const pattern = f.pattern.trim()
  const covers = pattern.length >= 3
    ? rows.filter(
        r =>
          r.kind === 'retail' &&
          r.spending_candidate !== false &&
          String(r.description || '').toUpperCase().startsWith(pattern.toUpperCase()),
      ).length
    : 0
  const ready =
    pattern.length >= 3 &&
    (f.action === 'EXPENSE' ? !!f.category : f.action === 'COMMITMENT' ? !!f.commitment_id : true)

  const save = async () => {
    if (!ready) return
    setBusy(true)
    await saveMerchantRule({
      pattern,
      action: f.action,
      category: f.action === 'EXPENSE' ? f.category : undefined,
      commitment_id: f.action === 'COMMITMENT' ? Number(f.commitment_id) : undefined,
    })
    setBusy(false)
    // No local reset: a saved rule reloads state, the preview re-runs, and this
    // row disappears because it is no longer undecided.
  }

  return (
    <div className="border-hairline grid gap-2 border-t py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="num text-[12px]">{row.description}</span>
        <span className="text-muted-foreground num text-[11px]">
          ×{row.rows} · {fmt(row.total)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1.4fr_auto]">
        <Input
          aria-label={`Pattern for ${row.description}`}
          value={f.pattern}
          onChange={e => set('pattern', e.target.value)}
        />
        <Select value={f.action} onValueChange={v => set('action', v)}>
          <SelectTrigger aria-label="What it is">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">Spending</SelectItem>
            <SelectItem value="COMMITMENT">Already a commitment</SelectItem>
            <SelectItem value="IGNORE">Not spending</SelectItem>
          </SelectContent>
        </Select>
        {f.action === 'EXPENSE' ? (
          <Select value={f.category} onValueChange={v => set('category', v)}>
            <SelectTrigger aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_GROUPS.map(g => (
                <SelectGroup key={g.group}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.categories.map(c => (
                    <SelectItem key={c} value={c}>
                      {EXPENSE_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        ) : f.action === 'COMMITMENT' ? (
          <Select value={f.commitment_id} onValueChange={v => set('commitment_id', v)}>
            <SelectTrigger aria-label="Which commitment">
              <SelectValue placeholder="Which one" />
            </SelectTrigger>
            <SelectContent>
              {targets.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-faint self-center text-[11px]">Seen, and booked as nothing.</p>
        )}
        <Button size="sm" variant="secondary" onClick={save} disabled={!ready || busy}>
          {busy ? 'Saving…' : 'Decide'}
        </Button>
      </div>
      {pattern.length >= 3 && covers > 1 ? (
        <p className="text-faint text-[11px]">
          This pattern covers {covers} rows on this statement.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Import a statement — the PDF Maybank sent, dropped straight in.
 *
 * The first version of this screen asked the owner to open a terminal and run a
 * Python parser, then paste its JSON here. That was the browser's limitation
 * mistaken for the product's: the parser needed Xpdf's `pdftotext -table`, and
 * the fix was never a queue or a host agent but an extractor that runs where the
 * app runs. src/lib/maybankStatement.js is that, verified identical to the Python
 * on a real statement. The JSON path stays as a fallback for a statement parsed
 * elsewhere; it is no longer the way in.
 *
 * NOTHING IS WRITTEN UNTIL THE LAST BUTTON. The PDF is parsed and shown — gates,
 * what would land without asking, what a rule already explains, what still needs
 * deciding — and confirming sends the parsed payload through the ordinary import,
 * which re-runs the minimum gate before writing. A parse that happened on the
 * server is still a claim.
 */
function StatementImportDialog({ prefill }) {
  const { state, closeModal, importStatement } = useVantage()
  const cards = state.commitments.filter(c => c.kind === 'REVOLVING' && c.active)
  // A rule can only point at something already counted elsewhere, and a card is
  // not that — a charge on a statement is not a payment of it.
  const targets = state.commitments.filter(c => c.kind !== 'REVOLVING' && c.active)

  const [cardId, setCardId] = useState(String(prefill.commitment_id ?? cards[0]?.id ?? ''))
  const [raw, setRaw] = useState('')
  const [payload, setPayload] = useState(null)
  const [readError, setReadError] = useState(null)
  const [password, setPassword] = useState('')
  const [parsing, setParsing] = useState(false)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  const read = text => {
    setRaw(text)
    setReadError(null)
    if (!text.trim()) {
      setPayload(null)
      return
    }
    try {
      const j = JSON.parse(text)
      const statement = j?.statement
      if (!statement?.statement_date || !statement?.due_date) {
        throw new Error('that JSON has no statement dates in it — is it the parser’s output?')
      }
      setPayload({
        statement,
        rows: Array.isArray(j.rows) ? j.rows : [],
        gates: Array.isArray(j.gates) ? j.gates : [],
      })
    } catch (e) {
      setPayload(null)
      setReadError(e.message)
    }
  }

  const onFile = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setReadError(null)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf) {
      read(await file.text())
      return
    }
    // The server reads it; nothing is written. What comes back is the same
    // shape a pasted payload has, so the review below does not care which.
    setParsing(true)
    try {
      const out = await parseStatementPdf(file, { password })
      setRaw('')
      setPayload({ statement: out.statement, rows: out.rows, gates: out.gates })
    } catch (err) {
      setPayload(null)
      setReadError(err.message)
    } finally {
      setParsing(false)
    }
  }

  const gates = payload?.gates || []
  const failed = gates.filter(g => !g.ok)
  const view = payload ? previewStatementImport(payload.rows, state.merchantRules || []) : null
  const carrying = (payload?.statement?.cards || []).filter(c => c.balance > 0)
  const summary = carrying[carrying.length - 1] || null

  const run = async () => {
    if (!payload || !cardId || failed.length) return
    setBusy(true)
    const out = await importStatement({
      card_id: Number(cardId),
      statement: payload.statement,
      rows: payload.rows,
    })
    setBusy(false)
    if (out) setReport(out)
  }

  if (report) {
    return (
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Imported</DialogTitle>
          <DialogDescription>
            Statement {report.statement.statement_date}, closing{' '}
            {fmt(report.statement.closing_balance)}. The header alone makes this month&rsquo;s
            spending figure exact — the float reads two closing balances and nothing else.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5 text-[12px]">
          <div className="flex justify-between gap-3">
            <span>Booked as spending</span>
            <span className="num">
              {report.booked.rows} · {fmt(report.booked.rm)}
            </span>
          </div>
          {report.alreadyImported ? (
            <div className="text-muted-foreground flex justify-between gap-3">
              <span>Already there</span>
              <span className="num">{report.alreadyImported}</span>
            </div>
          ) : null}
          {report.ignored ? (
            <div className="text-muted-foreground flex justify-between gap-3">
              <span>Not spending</span>
              <span className="num">{report.ignored}</span>
            </div>
          ) : null}
          {report.matchedToCommitments.map((m, i) => (
            <div key={i} className="text-muted-foreground flex justify-between gap-3">
              <span>
                {m.description} — already {m.as}
              </span>
              <span className="num">{fmt(m.amount)}</span>
            </div>
          ))}
        </div>

        {report.unmatched.length ? (
          <Alert>
            <AlertTitle>
              {report.unmatched.length} merchant(s) still undecided
            </AlertTitle>
            <AlertDescription>
              Nothing was booked for them, so they sit outside the log rather than inside it
              wrongly. Decide them under Statement merchants in Settings and import the same file
              again — the rows that already landed cannot land twice.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-faint text-[11px]">Nothing left to decide.</p>
        )}

        <DialogFooter>
          <Button onClick={closeModal}>Done</Button>
        </DialogFooter>
      </DialogContent>
    )
  }

  return (
    <DialogContent className="sm:max-w-[720px]">
      <DialogHeader>
        <DialogTitle>Import a statement</DialogTitle>
        <DialogDescription>
          Drop the PDF Maybank sent. It is read on the server and shown here first, and nothing
          is written until you confirm.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Which card" htmlFor="si-card">
          <Select value={cardId} onValueChange={setCardId}>
            <SelectTrigger id="si-card" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cards.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="The statement"
          htmlFor="si-file"
          hint={parsing ? 'Reading it…' : 'The PDF from Maybank, or the parser’s JSON.'}
        >
          <Input
            id="si-file"
            type="file"
            accept=".pdf,application/pdf,.json,application/json"
            onChange={onFile}
            disabled={parsing}
          />
        </Field>
        <Field
          label="Password, if it is locked"
          htmlFor="si-password"
          className="col-span-2"
          hint="Maybank locks the statements it emails. Leave blank for one downloaded from M2U."
        >
          <Input
            id="si-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Or paste the parser’s JSON" htmlFor="si-raw">
        <textarea
          id="si-raw"
          className="border-input bg-transparent num h-24 w-full rounded-md border p-2 text-[11px]"
          placeholder='{ "statement": { … }, "gates": [ … ], "rows": [ … ] }'
          value={raw}
          onChange={e => read(e.target.value)}
        />
      </Field>

      {readError ? (
        <Alert variant="destructive">
          <AlertTitle>That did not read</AlertTitle>
          <AlertDescription>{readError}</AlertDescription>
        </Alert>
      ) : null}

      {payload ? (
        <>
          <div className="grid gap-1">
            <span className="eyebrow">Checks</span>
            <p className="text-faint text-[11px]">
              The parser&rsquo;s own arithmetic, against figures the bank printed on the same
              document. Any one failing stops the import. The server re-runs the minimum before it
              writes anything, whatever this says.
            </p>
            {gates.length ? (
              gates.map(g => (
                <div key={g.gate} className="flex flex-wrap justify-between gap-2 text-[12px]">
                  <span>
                    <Badge
                      variant={g.ok ? 'gain' : 'loss'}
                      className="mr-1.5 px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                    >
                      {g.ok ? 'pass' : 'fail'}
                    </Badge>
                    {g.how}
                  </span>
                  <span className="num text-muted-foreground">
                    {fmt(g.derived)} vs {fmt(g.expected)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-faint text-[11px]">
                This payload carries no gates. The server still refuses an import whose minimum
                does not add up.
              </p>
            )}
          </div>

          {summary ? (
            <div className="grid gap-1">
              <span className="eyebrow">Recorded without asking</span>
              <div className="flex justify-between gap-3 text-[12px]">
                <span>
                  The statement itself · {payload.statement.statement_date}, due{' '}
                  {payload.statement.due_date}
                </span>
                <span className="num">{fmt(summary.balance)}</span>
              </div>
              {summary.minimum != null ? (
                <div className="text-muted-foreground flex justify-between gap-3 text-[12px]">
                  <span>Minimum as printed</span>
                  <span className="num">{fmt(summary.minimum)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-1">
            <span className="eyebrow">The rows</span>
            <div className="flex justify-between gap-3 text-[12px]">
              <span>Instalment billing — a plan&rsquo;s, not a purchase</span>
              <span className="num">
                {view.instalments.rows} · {fmt(view.instalments.rm)}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-[12px]">
              <span>Not spending — payments, cash-outs, ignored merchants</span>
              <span className="num">
                {view.notSpending.rows} · {fmt(view.notSpending.rm)}
              </span>
            </div>
            {view.known.map(k => (
              <div key={k.pattern} className="flex justify-between gap-3 text-[12px]">
                <span className="num">
                  {k.pattern} → {EXPENSE_LABEL[k.category] || k.category}
                </span>
                <span className="num">
                  ×{k.rows} · {fmt(k.total)}
                </span>
              </div>
            ))}
            {view.asCommitment.map((m, i) => (
              <div key={i} className="text-muted-foreground flex justify-between gap-3 text-[12px]">
                <span className="num">
                  {m.description} — already {m.as}
                </span>
                <span className="num">{fmt(m.amount)}</span>
              </div>
            ))}
            {view.asCommitment.length ? (
              <p className="text-faint text-[11px]">
                Already subtracted from income on the Money screen. Logging them here would count
                them twice.
              </p>
            ) : null}
          </div>

          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">The statement does not say who</span>
              <Badge
                variant={view.undecided.length ? 'neutral' : 'gain'}
                className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
              >
                {view.undecided.length
                  ? `${view.undecided.length} to decide`
                  : 'nothing to decide'}
              </Badge>
            </div>
            <p className="text-faint text-[11px]">
              Decided once, remembered after. Anything left undecided imports as nothing rather
              than as a guess — a wrong category is read as fact on Expenses and nothing would
              ever flag it.
            </p>
            {view.undecided.map(u => (
              <UndecidedMerchant
                key={u.description}
                row={u}
                rows={payload.rows}
                targets={targets}
              />
            ))}
          </div>
        </>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={run} disabled={!payload || !cardId || failed.length > 0 || busy}>
          {busy
            ? 'Importing…'
            : failed.length
              ? 'A check failed'
              : payload
                ? `Import ${payload.rows.length} rows`
                : 'Import'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * Pay a card.
 *
 * FOUR CHOICES, AND ONLY ONE OF THEM IS FREE. Paying the statement in full is the
 * only one that keeps the interest-free days. The minimum keeps the account
 * current and starts interest on everything else, including — on most Malaysian
 * issuers — on new purchases from the day they post, so a card carried once is a
 * card charging from then on. Paying everything owed clears the unbilled
 * instalments too, which no statement asks for.
 *
 * WHY A RECORDED PAYMENT MATTERS HERE MORE THAN ANYWHERE. A card is the one
 * commitment whose monthly figure is a guess: for a loan the instalment is the
 * instalment, but what actually left for a card is whatever was actually paid,
 * anywhere between the minimum and the whole bill. spendingFor() takes a recorded
 * payment over the derived minimum for exactly that reason, so this is what makes
 * the month's residual right rather than plausible.
 *
 * NO "PAID FROM" FIELD, DELIBERATELY. The residual is measured from wallet balance
 * readings, which already capture the money leaving whichever account paid — so a
 * source stored here would be a second, unchecked copy of a fact the readings
 * already carry, and `commitment_payments` rightly has no column for it.
 */
function CardPaymentDialog({ prefill }) {
  const { state, closeModal, addCommitmentPayment } = useVantage()
  const cards = state.commitments.filter(c => c.kind === 'REVOLVING' && c.active)
  const [cardId, setCardId] = useState(String(prefill.commitment_id ?? cards[0]?.id ?? ''))
  const row = useMemo(
    () => commitmentRows(state).find(r => r.id === Number(cardId)) || null,
    [state, cardId],
  )

  // Offered only while something of the bill is still unpaid: a bill already
  // recorded paid in full has nothing left to pay, and an option worth RM 0.00
  // that can never be saved is a trap, not a choice.
  const options = row
    ? [
        row.statement && row.billedUnpaid > 0 && {
          id: 'statement',
          // What is still owed on the bill, not what it printed: a payment
          // already recorded against it has left, and paying the printed figure
          // again would pay it twice.
          label:
            row.bill?.paidRM > 0
              ? 'The statement balance, less what is recorded paid'
              : 'The statement balance',
          rm: row.billedUnpaid,
          why: 'the only choice that keeps the interest-free days',
        },
        {
          id: 'minimum',
          label: 'The minimum',
          rm: row.minimum,
          why: 'keeps the account current, and starts interest on everything else',
        },
        {
          id: 'current',
          label: 'Everything owed, unbilled included',
          rm: row.owed,
          why: 'clears the instalments no statement has asked for yet',
        },
        { id: 'custom', label: 'Some other amount', rm: null, why: '' },
      ].filter(Boolean)
    : []

  const [choice, setChoice] = useState('statement')
  // What is actually selected: the first option when the chosen one is not on
  // offer for this card, so the highlight and the amount never disagree.
  const picked = options.find(o => o.id === choice) || options[0]
  const pick = picked?.id
  const [custom, setCustom] = useState('')
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)

  const amount = pick === 'custom' ? Number(custom) || 0 : picked?.rm || 0
  const ready = row && amount > 0 && date

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const ok = await addCommitmentPayment(Number(cardId), {
      date,
      amount,
      note: pick === 'custom' ? '' : picked.label.toLowerCase(),
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Pay this card</DialogTitle>
        <DialogDescription>
          What actually left, so the month reads the payment rather than the derived minimum.
        </DialogDescription>
      </DialogHeader>

      <Field label="Which card" htmlFor="pay-card">
        <Select value={cardId} onValueChange={setCardId}>
          <SelectTrigger id="pay-card" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cards.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {row ? (
        <div className="grid gap-1.5">
          <span className="eyebrow">How much?</span>
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setChoice(o.id)}
              className={cn(
                'flex items-baseline gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                pick === o.id ? 'border-primary bg-muted/50' : 'border-border hover:bg-muted/30',
              )}
            >
              <span className="flex-1 text-[12.5px]">
                {o.label}
                {o.why ? <span className="text-faint block text-[11px]">{o.why}</span> : null}
              </span>
              {o.rm != null ? <span className="num text-[12.5px]">{fmt(o.rm, row.cur)}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-faint text-[12px]">Add a card account first.</p>
      )}

      {pick === 'custom' ? (
        <Field
          label="Amount"
          htmlFor="pay-amount"
          hint="Anything above the minimum reduces the revolving band first, which is the only band charging the retail rate."
        >
          <Input
            id="pay-amount"
            className="num"
            type="number"
            step="0.01"
            value={custom}
            onChange={e => setCustom(e.target.value)}
          />
        </Field>
      ) : null}

      <Field
        label="Date"
        htmlFor="pay-date"
        hint="On or before the due date. A late payment resets the prompt-payment tier and the retail rate goes up with it."
      >
        <Input id="pay-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>

      <p className="text-faint m-0 text-[11px] leading-relaxed text-pretty">
        No account to pay from: the residual is measured from wallet balance readings, which
        already carry the money leaving. Storing a source here would be a second copy of a fact
        those readings already hold.
      </p>

      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!ready || busy}>
          {busy ? 'Recording…' : 'Record the payment'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * Something a loan bought.
 *
 * A SEPARATE FORM, NOT A MODE OF AssetDialog. That form is built around a
 * catalogue of Malaysian funds, their declared-rate histories and a distribution
 * estimator — none of which a house has. Bending it would mean hiding two thirds
 * of its fields and defending three impossible states; this asks the four things
 * an item actually has and sets the rest from the schema's own rules.
 *
 * THE VALUATION IS PART OF CREATING IT. An item with no valuation is worth
 * nothing, and an item worth nothing understates net worth by exactly as much as
 * not tracking it at all — so the date and the figure are asked here rather than
 * left as a second step someone might not take.
 */
function ItemDialog({ prefill }) {
  const { closeModal, addItem } = useVantage()
  const [f, setF] = useState({
    name: prefill.name || '',
    slug: prefill.slug || '',
    value: '',
    valued_on: today(),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // Typed once. A slug nobody sees is a field nobody should have to fill.
  const slug =
    f.slug.trim() ||
    f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const ready = f.name.trim() && slug && Number(f.value) > 0 && f.valued_on

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const ok = await addItem({
      name: f.name.trim(),
      slug,
      value: Number(f.value),
      valued_on: f.valued_on,
    })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>Add something a loan bought</DialogTitle>
        <DialogDescription>
          A house, a car. Tracking the loan without the thing understates net worth by the whole
          value of the thing.
        </DialogDescription>
      </DialogHeader>

      <Field label="What is it" htmlFor="item-name">
        <Input
          id="item-name"
          placeholder="The house"
          value={f.name}
          onChange={e => set('name', e.target.value)}
        />
      </Field>

      <Field
        label="What is it worth"
        htmlFor="item-value"
        hint="Whatever you would put on it today. Nothing here appreciates it for you."
      >
        <Input
          id="item-value"
          className="num"
          type="number"
          step="0.01"
          value={f.value}
          onChange={e => set('value', e.target.value)}
        />
      </Field>

      <Field
        label="Valued on"
        htmlFor="item-date"
        hint="Kept and shown beside the figure, so a stale valuation reads as stale rather than as a fact."
      >
        <Input
          id="item-date"
          type="date"
          value={f.valued_on}
          onChange={e => set('valued_on', e.target.value)}
        />
      </Field>

      <p className="text-faint m-0 text-[11px] leading-relaxed text-pretty">
        It earns no rate, never counts as money within reach, and its value is replaced rather than
        added to — record a newer valuation any time and the old one stays as history. Link it to
        the loan that bought it on the loan itself.
      </p>

      <DialogFooter>
        <Button variant="ghost" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!ready || busy}>
          {busy ? 'Adding…' : 'Add it'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function CommitmentDialog({ prefill }) {
  const { state, closeModal, addCommitment, updateCommitment, openItem } = useVantage()
  const editing = prefill.id != null
  // Not saved anywhere. It only computes started_on, which is what is stored.
  const [monthsLeft, setMonthsLeft] = useState('')
  // Opened when editing a loan that already has a rate, so an existing one is
  // never hidden behind a disclosure the reader has no reason to open.
  const [showRate, setShowRate] = useState(prefill.rate != null)
  const str = (v, fallback = '') => (v == null ? fallback : String(v))
  const items = state.assets.filter(a => a.kind === 'ITEM' && !a.archived)
  const cardAccounts = state.commitments.filter(c => c.kind === 'REVOLVING' && c.active)
  const [f, setF] = useState({
    asset_id: prefill.asset_id == null ? '' : String(prefill.asset_id),
    collected_by_id: prefill.collected_by_id == null ? '' : String(prefill.collected_by_id),
    kind: prefill.kind || 'LOAN',
    name: str(prefill.name),
    lender: str(prefill.lender),
    due_day: str(prefill.due_day),
    principal: str(prefill.principal),
    rate: str(prefill.rate),
    rate_type: prefill.rate_type || 'REDUCING',
    term_months: str(prefill.term_months),
    started_on: prefill.started_on || today(),
    instalment: str(prefill.instalment),
    apr: str(prefill.apr, '18'),
    balance: str(prefill.balance),
    credit_limit: str(prefill.credit_limit),
    card_count: str(prefill.card_count),
    statement_day: str(prefill.statement_day),
    min_payment_floor: str(prefill.min_payment_floor, '50'),
    limit_release: prefill.limit_release || 'PROGRESSIVE',
    amount: str(prefill.amount),
    every_months: str(prefill.every_months, '1'),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = v => (v === '' ? null : Number(v))

  const ready =
    f.name.trim() &&
    (f.kind === 'LOAN'
      ? f.instalment && f.term_months && f.started_on
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
            // Both or neither: a rate with no basis reads as an answer while
            // being a coin flip between two loans that cost very differently.
            rate: num(f.rate),
            rate_type: f.rate === '' ? null : f.rate_type,
            term_months: num(f.term_months),
            started_on: f.started_on,
            instalment: num(f.instalment),
            // Optional, and it stays optional. A loan with nothing linked counts
            // only the debt, which the Loans screen says out loud rather than
            // absorbing quietly.
            asset_id: f.asset_id === '' ? null : Number(f.asset_id),
          }
        : f.kind === 'REVOLVING'
          ? {
              ...common,
              apr: num(f.apr),
              credit_limit: num(f.credit_limit),
              card_count: num(f.card_count),
              balance: num(f.balance),
              // The day the bill CLOSES, which is not the day it falls due. The
              // interest-free period runs from it, so without it the app cannot
              // say when something bought today stops being free.
              statement_day: f.statement_day === '' ? null : Number(f.statement_day),
              min_payment_floor: num(f.min_payment_floor),
              limit_release: f.limit_release,
              // The API refuses a balance with no date, because a card balance is
              // a snapshot and the screen has to be able to say how old it is.
              balance_as_of: f.balance === '' ? null : today(),
            }
          : {
              ...common,
              amount: num(f.amount),
              every_months: Number(f.every_months),
              // Where the money goes out through. It adds nothing to the month —
              // the charge is counted once, here — but a charge a card collects
              // leaves when that bill is paid, not on its own due day.
              collected_by_id: f.collected_by_id === '' ? null : Number(f.collected_by_id),
            }
    // kind is not sent on an edit: the shape decides which columns are
    // meaningful, and changing it would leave a loan's fields on a card.
    const ok = editing
      ? await updateCommitment(prefill.id, (({ kind: _kind, ...rest }) => rest)(body))
      : await addCommitment(body)
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${prefill.name}` : 'Add commitment'}</DialogTitle>
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
            editing
              ? 'Fixed once saved — the kind decides which columns mean anything.'
              : f.kind === 'LOAN'
                ? 'Car, house or personal — anything with a term.'
                : f.kind === 'REVOLVING'
                  ? 'A balance that revolves, with no end date.'
                  : 'Rent, insurance, a subscription.'
          }
        >
          <Select value={f.kind} onValueChange={v => set('kind', v)} disabled={editing}>
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
              label="What did it buy?"
              htmlFor="cm-asset"
              className="col-span-2"
              hint="Tracking a mortgage without tracking the house understates net worth by the whole value of the house. Leaving this empty is allowed, and the Loans screen says so rather than absorbing the omission."
            >
              <div className="flex gap-2">
                <Select value={f.asset_id} onValueChange={v => set('asset_id', v === NONE ? '' : v)}>
                  <SelectTrigger id="cm-asset" className="w-full">
                    <SelectValue placeholder="Nothing tracked — count only the debt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nothing tracked — count only the debt</SelectItem>
                    {items.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => openItem()}>
                  New
                </Button>
              </div>
            </Field>
            <Field
              label="Monthly instalment"
              htmlFor="cm-inst"
              hint="What leaves your account each month."
            >
              <Input id="cm-inst" className="num" type="number" step="0.01" placeholder="705.00" value={f.instalment} onChange={e => set('instalment', e.target.value)} />
            </Field>
            <Field label="Term (months)" htmlFor="cm-term" hint="9 years is 108.">
              <Input id="cm-term" className="num" type="number" step="1" placeholder="108" value={f.term_months} onChange={e => set('term_months', e.target.value)} />
            </Field>
            <Field
              label="Months left"
              htmlFor="cm-left"
              className="col-span-2"
              hint="Off the statement. Leave blank if it has only just started."
            >
              <Input
                id="cm-left"
                className="num"
                type="number"
                step="1"
                placeholder="78"
                value={monthsLeft}
                onChange={e => {
                  setMonthsLeft(e.target.value)
                  const d = startFromMonthsLeft(
                    Number(f.term_months),
                    Number(e.target.value),
                    Number(f.due_day) || 1,
                  )
                  if (d) set('started_on', d)
                }}
              />
            </Field>

            {/* Behind a disclosure, not deleted. Most people know what they pay
                and how long is left; far fewer know the rate, and fewer still
                whether it is charged flat or reducing — which is the half that
                matters, since a Malaysian lender calls a reducing rate "fixed"
                and a flat rate costs close to double what it looks like. Asking
                up front turned a two-minute job into a hunt for the agreement.
                Given, it buys the real cost of the loan; left alone, what is
                owed is simply the instalments still to run. */}
            <div className="col-span-2 grid gap-3">
              <button
                type="button"
                onClick={() => setShowRate(v => !v)}
                aria-expanded={showRate}
                className="text-muted-foreground hover:text-foreground justify-self-start text-[11.5px] transition-colors"
              >
                {showRate ? 'Hide' : 'Add'} interest details — optional, for the real cost
              </button>

              {showRate ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Rate (% p.a.)"
                    htmlFor="cm-rate"
                    hint="As the agreement quotes it."
                  >
                    <Input id="cm-rate" className="num" type="number" step="0.01" placeholder="2.79" value={f.rate} onChange={e => set('rate', e.target.value)} />
                  </Field>
                  <Field
                    label="Amount financed"
                    htmlFor="cm-principal"
                    hint="Worked out from the instalment if blank."
                  >
                    <Input id="cm-principal" className="num" type="number" step="100" value={f.principal} onChange={e => set('principal', e.target.value)} />
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
                  <Field
                    label="First payment"
                    htmlFor="cm-start"
                    className="col-span-2"
                    hint="Set from months left above. Only worth changing if you know the exact date."
                  >
                    <Input id="cm-start" className="num" type="date" value={f.started_on} onChange={e => set('started_on', e.target.value)} />
                  </Field>
                </div>
              ) : null}
            </div>
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
            {/* Plastic and limits are different quantities, and nothing else
                in the app can tell them apart: a limit is per account, and the
                statement parser emits card numbers but drops any card that
                settled to zero — so counting them undercounts exactly the
                cards that behaved. Left blank it stays unasked, never 1. */}
            <Field
              label="Cards on this account"
              htmlFor="cm-cards"
              hint="Two cards can share one limit — a principal and a supplementary, or a Visa and a Mastercard. Blank if you would rather not say."
            >
              <Input id="cm-cards" className="num" type="number" min="1" max="20" placeholder="2" value={f.card_count} onChange={e => set('card_count', e.target.value)} />
            </Field>
            <Field
              label="Balance now"
              htmlFor="cm-bal"
              className="col-span-2"
              hint="The REVOLVING part only — what is carried at the rate above. Instalment plans are added separately and must not be folded in here, or the minimum is charged on them twice."
            >
              <Input id="cm-bal" className="num" type="number" step="0.01" value={f.balance} onChange={e => set('balance', e.target.value)} />
            </Field>
            <Field
              label="Statement day"
              htmlFor="cm-stmt"
              hint="The day the bill CLOSES, not the day it is due. Both, or the app cannot say when a purchase stops being interest-free."
            >
              <Input id="cm-stmt" className="num" type="number" min="1" max="31" value={f.statement_day} onChange={e => set('statement_day', e.target.value)} />
            </Field>
            <Field
              label="Minimum floor"
              htmlFor="cm-floor"
              hint="Issuer practice, not a rule: BSN 50, Maybank 25."
            >
              <Input id="cm-floor" className="num" type="number" step="1" value={f.min_payment_floor} onChange={e => set('min_payment_floor', e.target.value)} />
            </Field>
            <Field
              label="Instalment plans free the limit"
              htmlFor="cm-release"
              className="col-span-2"
              hint="Off the card's own terms — issuers publish both, and it decides how much credit you actually have left."
            >
              <Select value={f.limit_release} onValueChange={v => set('limit_release', v)}>
                <SelectTrigger id="cm-release" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROGRESSIVE">Month by month, as principal is paid</SelectItem>
                  <SelectItem value="ON_SETTLEMENT">Not until the plan finishes</SelectItem>
                </SelectContent>
              </Select>
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
            {cardAccounts.length ? (
              <Field
                label="Collected through"
                htmlFor="cm-collected"
                className="col-span-2"
                hint="Adds nothing to the month — this charge is counted once, here. What it changes is the day the money leaves: a direct debit goes on its own due day, and a card charge goes when that bill is paid."
              >
                <Select
                  value={f.collected_by_id}
                  onValueChange={v => set('collected_by_id', v === NONE ? '' : v)}
                >
                  <SelectTrigger id="cm-collected" className="w-full">
                    <SelectValue placeholder="Direct debit or transfer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Direct debit or transfer</SelectItem>
                    {cardAccounts.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
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
/*
 * An income source records what arrives. It does NOT touch the savings side.
 *
 * A field here once linked an employment source to an EPF account, and a payslip
 * recorded against it booked the contribution as a deposit. The field went first
 * and the write stayed live for months behind it; both are gone now, along with
 * income_sources.epf_asset_id itself.
 *
 * WHY, and not merely that it was tidier: EPF splits every contribution 75/15/10
 * across Akaun Persaraan, Akaun Sejahtera and Akaun Fleksibel. A single foreign
 * key names one account, so the write could only ever put the whole contribution
 * in one of the three — three balances wrong, and a total that happens to be
 * right. Nothing here models the split, so nothing here may write it.
 *
 * The payslip's own EPF columns stay — they are part of what the payslip says
 * and are what net pay is computed from. They no longer write anywhere else, and
 * there is no longer anywhere else for them to write to. The contribution is
 * recorded on Assets from a statement, as a `payroll` deposit, which the money
 * calendar knows not to count as spending: net pay never contained it.
 */
function IncomeDialog({ prefill }) {
  const { closeModal, addIncomeSource, updateIncomeSource } = useVantage()
  const editing = prefill.id != null
  const str = (v, fallback = '') => (v == null ? fallback : String(v))
  const [f, setF] = useState({
    kind: prefill.kind || 'EMPLOYMENT',
    name: str(prefill.name),
    payer: str(prefill.payer),
    cadence: prefill.cadence || 'MONTHLY',
    currency: prefill.currency || 'MYR',
    pay_day: str(prefill.pay_day, '25'),
    gross_default: str(prefill.gross_default),
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const monthly = f.cadence === 'MONTHLY'

  const save = async () => {
    if (!f.name.trim()) return
    setBusy(true)
    const body = {
      name: f.name.trim(),
      payer: f.payer.trim(),
      currency: f.currency,
      pay_day: monthly ? Number(f.pay_day) : null,
      gross_default: f.gross_default === '' ? null : Number(f.gross_default),
    }
    // kind and cadence are omitted on an edit because the server refuses to
    // change either — a source whose shape changed would leave its recorded
    // payments describing something that no longer exists. Both are locked in
    // the form too, rather than being sent and bounced back as an error.
    const ok = editing
      ? await updateIncomeSource(prefill.id, body)
      : await addIncomeSource({ ...body, kind: f.kind, cadence: f.cadence })
    setBusy(false)
    if (ok) closeModal()
  }

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${prefill.name}` : 'Add income source'}</DialogTitle>
        <DialogDescription>
          Where money arrives from. Each payment is recorded against it, and net pay is worked out
          from the payslip rather than typed.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Kind"
          htmlFor="in-kind"
          hint={editing ? 'Fixed once saved.' : undefined}
        >
          <Select value={f.kind} onValueChange={v => set('kind', v)} disabled={editing}>
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
          hint={
            editing
              ? 'Fixed once saved — recorded payments would stop describing what they were.'
              : 'An irregular source is averaged over three months and drawn faded — it is never treated as a floor.'
          }
        >
          <Select value={f.cadence} onValueChange={v => set('cadence', v)} disabled={editing}>
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

        {/* The column and the API have taken a currency since income_sources
            existed; the form never asked. A foreign source could therefore only
            be made through the API, and every figure it produced was converted
            by a rate nothing on screen had mentioned.
            TWO OPTIONS, NOT AN OPEN FIELD. toRM() knows one rate — USD — so a
            third code would be added into ringgit totals as though it were
            ringgit. The list is what the app can convert, not what BNM
            publishes, and widening it is a calc.js change first. */}
        <Field
          label="Currency"
          htmlFor="in-cur"
          hint={
            editing
              ? 'Changing it re-reads every recorded payment as the new currency — the stored figures do not convert.'
              : 'Each payment is converted at the rate on the day it landed, and both figures are kept.'
          }
        >
          <Select value={f.currency} onValueChange={v => set('currency', v)}>
            <SelectTrigger id="in-cur" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MYR">MYR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
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
              Never subtracted from net. EPF from both groups is yours, but nothing here books it —
              record the contribution on Assets when the statement shows it.
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
  const [assetId, setAssetId] = useState('')
  const [target, setTarget] = useState('500')
  const [amount, setAmount] = useState('1000')
  const [monthly, setMonthly] = useState('')
  const [busy, setBusy] = useState(false)

  const instruments = state.instruments
  // Archived is what you do instead of deleting an account with history, so it is
  // not a thing to set a new target against. The API refuses it either way.
  const accounts = (state.assets || []).filter(a => !a.archived)
  const income = isIncome(kind)
  const balance = isBalance(kind)
  const pickedAsset = assetId || String(accounts[0]?.id || '')
  // Per-payment is per holding only: combined across holdings it would measure
  // which funds happened to pay that day rather than the portfolio.
  const needsInstrument = GOAL_NEEDS_INSTRUMENT.has(kind)
  const picked = needsInstrument
    ? ticker && ticker !== WHOLE
      ? ticker
      : instruments[0]?.ticker || ''
    : ticker || WHOLE
  const blocked = balance ? !accounts.length : needsInstrument && !instruments.length

  const save = async () => {
    if (blocked || busy) return
    setBusy(true)
    const ok = await addGoal(
      balance
        ? {
            kind,
            asset_id: Number(pickedAsset),
            target_amount: Number(amount) || 0,
            monthly_budget: monthly ? Number(monthly) : null,
          }
        : income
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

        {/* A balance goal names an account, not a holding, so it gets its own
            picker rather than a ticker select taught to mean two things. */}
        {balance ? (
          <Field
            label="Account"
            htmlFor="g-asset"
            hint={
              blocked
                ? 'Add an account first, from the Assets screen.'
                : 'Measured against the balance its own ledger adds up to.'
            }
          >
            <Select value={pickedAsset} onValueChange={setAssetId} disabled={blocked}>
              <SelectTrigger id="g-asset" className="w-full">
                <SelectValue placeholder="No accounts yet" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                    <span className="text-faint ml-1">{a.currency}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
        <Field
          label={income ? 'Scope' : 'Instrument'}
          htmlFor="g-t"
          hint={blocked ? 'Add an instrument first, from the Portfolio screen.' : undefined}
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
        )}

        {balance ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target (RM)" htmlFor="g-amount" hint="The balance you are aiming the account at.">
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
            <Field
              label="Monthly budget (RM)"
              htmlFor="g-monthly-bal"
              hint="Optional — what you plan to pay in each month."
            >
              <Input
                id="g-monthly-bal"
                type="number"
                min="0"
                step="10"
                className="num"
                placeholder="—"
                value={monthly}
                onChange={e => setMonthly(e.target.value)}
              />
            </Field>
          </div>
        ) : income ? (
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
      {modal?.kind === 'asset' && <AssetDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'assetEntry' && <AssetEntryDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'expense' && <ExpenseDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'commitment' && <CommitmentDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'cardPlan' && <CardPlanDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'cardStatement' && <CardStatementDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'cardPayment' && <CardPaymentDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'item' && <ItemDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'statementImport' && <StatementImportDialog prefill={modal.prefill || {}} />}
      {modal?.kind === 'income' && <IncomeDialog prefill={modal.prefill || {}} />}
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
