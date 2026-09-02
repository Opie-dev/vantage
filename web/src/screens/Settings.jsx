/**
 * Settings — display preferences and the tax figures behind them.
 *
 * The P&L basis is stored server-side (settings.preferences), not in
 * localStorage, so it follows the owner between browsers and machines. Changing
 * it re-renders every screen that shows a P&L, which is why the consequence is
 * spelled out here rather than left to be discovered.
 *
 * The Dashboard theme is stored the same way and decides which layout that
 * screen opens on — income first or equity first — reordering and resizing
 * without ever changing a figure, which is why both options are offered here
 * carrying live numbers rather than described in the abstract.
 *
 * The withholding figures are read-only: they are what moomoo actually withheld,
 * not a rate this app applies. There is nothing to configure about them — they
 * are here because this is where you come looking for tax.
 */

import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, LaptopIcon, MoonIcon, PencilIcon, SunIcon, TrashIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { INSTITUTIONS, totalRate, withRates } from '@/lib/institutions'

import { useVantage } from '@/lib/store'
import {
  DASHBOARD_THEME,
  PNL_BASIS,
  dashboardTheme,
  income,
  incomeOutlook,
  pnlBasis,
  portfolio,
  withholdingSummary,
} from '@/lib/calc'
import { dtfmt, fmt, fmtS, pctS, toneClass } from '@/lib/format'

/**
 * Light, dark, or follow the machine.
 *
 * Named "Appearance" rather than "Theme" on purpose: this screen already has a
 * "Dashboard theme" that means something completely different — which layout the
 * Dashboard opens on — and two controls called theme sitting inches apart would
 * be a genuine trap.
 *
 * Unlike every other preference here, this one is NOT stored server-side. It
 * lives in localStorage under `vantage.theme`, read by a script in index.html
 * before first paint so the right palette is up immediately. Moving it to the
 * server would mean a flash of the wrong palette on every load while the state
 * request is in flight, which is a worse trade than having it follow the browser
 * rather than the person.
 */
const APPEARANCES = [
  { id: 'light', title: 'Light', note: 'The full light palette, not an inversion', Icon: SunIcon },
  { id: 'dark', title: 'Dark', note: 'The default, and what most people leave it on', Icon: MoonIcon },
  { id: 'system', title: 'Match my system', note: 'Follows the machine, switching when it does', Icon: LaptopIcon },
]

function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Until localStorage has been read there is no stored choice to reflect, and
  // showing one option as selected would be a guess.
  const active = mounted ? theme : null

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Appearance</span>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          The colours, not the layout &mdash; &ldquo;Dashboard theme&rdquo; below decides what that
          screen leads with. Stored in this browser rather than on the server, so the right palette
          is up before the first paint instead of flashing the wrong one.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 pb-4">
        {APPEARANCES.map(o => {
          const on = o.id === active
          const { Icon } = o
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => (on ? null : setTheme(o.id))}
              className={`border-hairline rounded-lg border px-3.5 py-3 text-left transition-colors ${
                on ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                  {on ? <CheckIcon className="text-primary size-3.5" aria-hidden="true" /> : null}
                  {o.title}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 ml-6 text-[12.5px]">{o.note}</p>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** Each theme, with what the Dashboard leads with under it stated plainly. */
const THEMES = [
  {
    id: DASHBOARD_THEME.INCOME,
    title: 'Income focus',
    blurb:
      'Opens on what the funds pay. The month’s income is the headline, the payout calendar sits beneath it, and the equity curve and allocation stay as cards further down. Portfolio value, P&L, invested and idle cash run along the figure row.',
  },
  {
    id: DASHBOARD_THEME.EQUITY,
    title: 'Equity focus',
    blurb:
      'Opens on what the holdings are worth. Portfolio value is the headline with cost, P&L and return beside it, the equity curve runs the full width, and holdings, allocation and premium-to-NAV each get a block. Income keeps the figure row and a chart on the side.',
  },
]

function ThemeCard() {
  const { state, setPreference } = useVantage()
  const active = dashboardTheme(state)
  // The figure each theme would put at the top of the Dashboard, so the choice
  // is made by seeing it rather than by imagining it.
  const preview = useMemo(() => {
    const now = new Date()
    const outlook = incomeOutlook(state, now.getFullYear(), now.getMonth())
    const p = portfolio(state)
    return {
      [DASHBOARD_THEME.INCOME]: {
        figure: fmt(outlook.received + outlook.estimated, 'MYR'),
        note: 'this month',
        tone: 'text-cash',
      },
      [DASHBOARD_THEME.EQUITY]: { figure: fmt(p.totalRM, 'MYR'), note: 'portfolio', tone: '' },
    }
  }, [state])

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Dashboard theme</span>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          What the Dashboard leads with. Both themes carry the same figures on the same P&amp;L basis — only the
          order and the size change.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 pb-4">
        {THEMES.map(o => {
          const on = o.id === active
          const p = preview[o.id]
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => (on ? null : setPreference({ dashboardTheme: o.id }))}
              className={`border-hairline rounded-lg border px-3.5 py-3 text-left transition-colors ${
                on ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                  {on ? <CheckIcon className="text-primary size-3.5" aria-hidden="true" /> : null}
                  {o.title}
                </span>
                <span className={`num shrink-0 text-[12.5px] ${p.tone}`}>
                  {p.figure} <span className="text-faint">{p.note}</span>
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">{o.blurb}</p>
            </button>
          )
        })}
        <p className="text-faint text-[11.5px] leading-relaxed">
          Neither theme hides anything. Paid out, against paid for — the card that states the drawdown in
          full — and your goals appear in both, because a screen that leads with one truth still owes you the
          other.
        </p>
      </CardContent>
    </Card>
  )
}

/** Each basis, with the consequence of choosing it stated plainly. */
const OPTIONS = [
  {
    id: PNL_BASIS.PRICE,
    title: 'Price only',
    blurb:
      'Market value less what you paid. Trading fees are inside cost, so they count; dividends and tax do not. The conventional unrealised P&L.',
  },
  {
    id: PNL_BASIS.NET,
    title: 'Include income, after tax',
    blurb:
      'Adds the dividends that actually reached your wallet — gross distributions less the tax withheld from them. What the holding has really returned.',
  },
  {
    id: PNL_BASIS.GROSS,
    title: 'Include income, before tax',
    blurb:
      'Adds dividends as declared, ignoring withholding. Pre-tax performance — useful for judging the fund rather than your net outcome.',
  },
]

function BasisCard() {
  const { state, setPreference } = useVantage()
  const active = pnlBasis(state)
  const preview = useMemo(
    () => Object.fromEntries(OPTIONS.map(o => [o.id, portfolio(state, o.id)])),
    [state],
  )

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">P&amp;L basis</span>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          How every P&amp;L figure in the app is computed — the Positions table, the Dashboard cards, and the
          percentages beside them.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 pb-4">
        {OPTIONS.map(o => {
          const on = o.id === active
          const p = preview[o.id]
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => (on ? null : setPreference({ pnlBasis: o.id }))}
              className={`border-hairline rounded-lg border px-3.5 py-3 text-left transition-colors ${
                on ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                  {on ? <CheckIcon className="text-primary size-3.5" aria-hidden="true" /> : null}
                  {o.title}
                </span>
                {/* What the whole portfolio reads as under this option, so the
                    choice can be made by looking rather than by reasoning. */}
                <span className={`num shrink-0 text-[12.5px] ${toneClass(p.pnlRM)}`}>
                  {fmtS(p.pnlRM, 'MYR')} <span className="text-faint">{pctS(p.pnlPct)}</span>
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">{o.blurb}</p>
            </button>
          )
        })}
        <p className="text-faint text-[11.5px] leading-relaxed">
          Income is realised cash that already sits in your wallet balance. Including it here shows how a holding
          has performed; it does not add to portfolio value, which counts that cash once already.
        </p>
      </CardContent>
    </Card>
  )
}

function TaxCard() {
  const { state } = useVantage()
  const w = useMemo(() => withholdingSummary(state), [state])
  const inc = useMemo(() => income(state), [state])

  if (!w.gross) {
    return (
      <Card className="gap-3">
        <CardHeader className="px-4">
          <span className="eyebrow">Withholding tax</span>
        </CardHeader>
        <CardContent className="text-faint px-4 pb-4 text-[12.5px]">
          Nothing withheld yet — this fills in once dividends are synced.
        </CardContent>
      </Card>
    )
  }

  const totals = [
    { label: 'Dividends declared', value: inc.gross, tone: '' },
    { label: 'Tax withheld', value: -inc.tax, tone: 'text-loss' },
    { label: 'Reached your wallet', value: inc.net, tone: 'text-gain' },
  ]

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="eyebrow">Withholding tax</span>
          <Badge variant="neutral" className="px-1.5 py-0 text-[10px] tracking-[0.06em]">
            {pctS(w.rate)} effective
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          Taken by moomoo before the dividend reached you. Read-only — these are the amounts actually withheld,
          not a rate this app applies.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {totals.map(t => (
            <div key={t.label} className="border-hairline rounded-lg border px-3 py-2.5">
              <div className="eyebrow">{t.label}</div>
              <div className={`num mt-1 text-[15px] font-semibold ${t.tone}`}>{fmt(t.value, 'MYR')}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-faint text-[10.5px] tracking-[0.06em] uppercase">
                <th className="border-hairline border-b py-1.5 text-left font-semibold">Year</th>
                <th className="border-hairline border-b py-1.5 text-right font-semibold">Dividends</th>
                <th className="border-hairline border-b py-1.5 text-right font-semibold">Withheld</th>
                <th className="border-hairline border-b py-1.5 text-right font-semibold">Net</th>
                <th className="border-hairline border-b py-1.5 text-right font-semibold">Rate</th>
              </tr>
            </thead>
            <tbody>
              {w.byYear.map(y => (
                <tr key={y.year}>
                  <td className="num border-hairline border-b py-1.5 font-semibold">{y.year}</td>
                  <td className="num border-hairline border-b py-1.5 text-right">{fmt(y.gross, 'MYR')}</td>
                  <td className="num text-loss border-hairline border-b py-1.5 text-right">
                    {fmtS(-y.tax, 'MYR')}
                  </td>
                  <td className="num text-gain border-hairline border-b py-1.5 text-right">{fmt(y.net, 'MYR')}</td>
                  <td className="num text-faint border-hairline border-b py-1.5 text-right">{pctS(y.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-faint text-[11.5px] leading-relaxed">
          Calendar years, converted at the current rate of RM {state.fx.toFixed(4)} per USD — there is no
          historical FX series, so older years are approximate. Each year&rsquo;s rate is its own tax over its own
          dividends.
        </p>
      </CardContent>
    </Card>
  )
}

function DataCard() {
  const { state } = useVantage()
  const rows = [
    { label: 'Last sync', value: state.lastSync ? dtfmt(state.lastSync) : 'never' },
    { label: 'Exchange rate', value: `RM ${state.fx.toFixed(4)} / USD` },
    { label: 'Cash balance from', value: state.funds && state.funds.length ? 'broker' : 'your own records' },
  ]

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Data</span>
      </CardHeader>
      <CardContent className="grid gap-1.5 px-4 pb-4 text-[12.5px]">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="num">{r.value}</span>
          </div>
        ))}
        <p className="text-faint mt-1 text-[11.5px] leading-relaxed">
          The rate comes from your account valued in both currencies, so it matches moomoo rather than a
          third-party feed. Run the sync to refresh all of this.
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Two columns, split by what the cards ask of you rather than by their size:
 * the left one is the two things you CHOOSE — both radio groups, both changing
 * what every other screen shows — and the right one is what the app is TELLING
 * you, which is read-only and where you look rather than decide.
 *
 * They stack on narrow screens, and `items-start` keeps each column its own
 * height instead of stretching the shorter one's last card to match.
 */
/**
 * The rates each institution declared, and a way to keep them current.
 *
 * The app ships a catalogue of these, which is accurate the day it is written
 * and rots on a published schedule: ASNB declares ASB every December, EPF every
 * February, Tabung Haji in the first quarter. Before this screen the only way to
 * record a new declaration was to change a source file and redeploy, which meant
 * the estimator quietly projected last year's figure until someone did.
 *
 * So a row saved here wins over the shipped one for that fund and year. Removing
 * it falls back to the built-in figure rather than to nothing, which is why the
 * two are labelled differently — knowing whether a number came from the app or
 * from you is the difference between checking it and trusting it.
 */
function RatesCard() {
  const { state, saveDeclaredRate, deleteDeclaredRate } = useVantage()
  const [instId, setInstId] = useState(INSTITUTIONS[0].id)
  const inst = INSTITUTIONS.find(i => i.id === instId) || INSTITUTIONS[0]
  const [prodId, setProdId] = useState(inst.products[0].id)

  const product = inst.products.find(p => p.id === prodId) || inst.products[0]
  const merged = useMemo(
    () => withRates(product, state.declaredRates),
    [product, state.declaredRates],
  )
  const rows = merged.rates || []

  const [draft, setDraft] = useState({ year: '', rate: '', bonus: '', shariah: '' })
  const [busy, setBusy] = useState(false)
  const setD = (k, v) => setDraft(p => ({ ...p, [k]: v }))

  const pickInstitution = id => {
    const next = INSTITUTIONS.find(i => i.id === id)
    setInstId(id)
    setProdId(next.products[0].id)
    setDraft({ year: '', rate: '', bonus: '', shariah: '' })
  }

  const num = v => (v === '' ? null : Number(v))
  const ready = draft.year !== '' && draft.rate !== '' && Number(draft.rate) >= 0

  const save = async () => {
    if (!ready || busy) return
    setBusy(true)
    const ok = await saveDeclaredRate({
      institution_id: inst.id,
      product_id: product.id,
      year: Number(draft.year),
      rate: Number(draft.rate),
      bonus: num(draft.bonus),
      shariah: num(draft.shariah),
    })
    setBusy(false)
    if (ok) setDraft({ year: '', rate: '', bonus: '', shariah: '' })
  }

  const unit = product.rate_quote === 'SEN_PER_UNIT' ? 'sen' : '%'

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Declared rates</span>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          What each fund actually paid, by financial year. The app ships the figures it knew at
          release; anything you save here replaces them, so a fresh declaration can go in without
          waiting for an update.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rc-inst" className="eyebrow">
              Institution
            </Label>
            <Select value={instId} onValueChange={pickInstitution}>
              <SelectTrigger id="rc-inst" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTITUTIONS.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rc-prod" className="eyebrow">
              Fund
            </Label>
            <Select value={prodId} onValueChange={setProdId}>
              <SelectTrigger id="rc-prod" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {inst.products.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-hairline grid gap-0.5 border-t pt-2">
          {rows.length ? (
            rows.map(r => (
              <div key={r.year} className="flex items-center gap-2 py-1">
                <span className="num w-[46px] text-[12.5px] font-semibold">{r.year}</span>
                <span className="num w-[92px] text-[12.5px]">
                  {totalRate(r).toFixed(2)} {unit}
                  {r.bonus ? <span className="text-faint"> incl {r.bonus.toFixed(2)}</span> : null}
                </span>
                {r.shariah != null ? (
                  <span className="text-faint num w-[86px] text-[11.5px]">
                    shariah {r.shariah.toFixed(2)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'text-[10.5px] tracking-[0.05em] uppercase',
                    r.mine ? 'text-primary' : 'text-faint',
                  )}
                >
                  {r.mine ? 'yours' : 'built in'}
                </span>
                <span className="flex-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit the ${r.year} rate`}
                      onClick={() =>
                        setDraft({
                          year: String(r.year),
                          rate: String(r.rate),
                          bonus: r.bonus == null ? '' : String(r.bonus),
                          shariah: r.shariah == null ? '' : String(r.shariah),
                        })
                      }
                    >
                      <PencilIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy into the form below to change it</TooltipContent>
                </Tooltip>
                {r.mine ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove your ${r.year} rate`}
                        onClick={() => deleteDeclaredRate(r.rowId)}
                      >
                        <TrashIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Revert to the figure built into the app</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-faint text-[12px]">Nothing on file for this fund yet.</p>
          )}
        </div>

        <div className="border-hairline grid gap-2 border-t pt-3">
          <span className="eyebrow">Record a year</span>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rc-year" className="text-faint text-[11px]">
                Financial year
              </Label>
              <Input
                id="rc-year"
                className="num h-8 w-[92px]"
                type="number"
                step="1"
                placeholder="2026"
                value={draft.year}
                onChange={e => setD('year', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rc-rate" className="text-faint text-[11px]">
                Conventional ({unit})
              </Label>
              <Input
                id="rc-rate"
                className="num h-8 w-[86px]"
                type="number"
                step="0.01"
                placeholder="5.20"
                value={draft.rate}
                onChange={e => setD('rate', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rc-bonus" className="text-faint text-[11px]">
                Bonus
              </Label>
              <Input
                id="rc-bonus"
                className="num h-8 w-[86px]"
                type="number"
                step="0.01"
                placeholder="optional"
                value={draft.bonus}
                onChange={e => setD('bonus', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rc-shariah" className="text-faint text-[11px]">
                Shariah ({unit})
              </Label>
              <Input
                id="rc-shariah"
                className="num h-8 w-[86px]"
                type="number"
                step="0.01"
                placeholder={inst.shariah === 'ELECTION' ? '6.15' : 'none'}
                value={draft.shariah}
                onChange={e => setD('shariah', e.target.value)}
              />
            </div>
            <Button size="sm" onClick={save} disabled={!ready || busy}>
              Save
            </Button>
          </div>
          <p className="text-faint text-[11px]">
            The year the money was earned, not the year it was announced &mdash; ASB 2&rsquo;s 2026
            is the year to 31 March 2026. Saving a year already listed corrects it.
          </p>
          <p className="text-faint text-[11px]">
            {inst.shariah === 'ELECTION'
              ? 'EPF announces both series in one release, so both belong on the same year. Whichever you elected is the one an EPF account will use.'
              : `${inst.label} declares a single rate, so Shariah is normally left blank here — fill it only if that changes and two figures are published.`}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  return (
    <div className="mx-auto grid max-w-[1180px] gap-3.5 lg:grid-cols-2 lg:items-start">
      <div className="grid gap-3.5">
        <AppearanceCard />
        <ThemeCard />
        <BasisCard />
      </div>
      <div className="grid gap-3.5">
        <TaxCard />
        <RatesCard />
        <DataCard />
      </div>
    </div>
  )
}
