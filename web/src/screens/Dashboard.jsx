/**
 * Dashboard — the daily read.
 *
 * Port of legacy `renderDash()` + `goalCardSmall()`: four stat cards, the equity
 * curve beside the allocation donut, then the goals in progress. Every figure
 * here comes from '@/lib/calc' — nothing is re-derived locally, and nothing is
 * shown that the legacy screen did not show.
 *
 * Cash deliberately comes from portfolio(), which prefers the broker's own
 * figure: moomoo's cash-flow ledger omits trade fees, so summing movements
 * never reconciles. When no sync has run the figures are locally derived and
 * the Cash card says so, quietly.
 *
 * TWO LAYOUTS, one screen, chosen by `dashboardTheme` in Settings.
 *
 * INCOME is the DEFAULT, and it opens on income rather than on portfolio value.
 * These holdings are bought for what they pay: price is down 21.6% while they
 * have paid out RM 5,033 net, and a dashboard led by the value card tells the
 * wrong story every morning. The loss is not hidden for it — TwoTruths puts both
 * figures side by side, and the figure row carries the same P&L it always did.
 *
 * EQUITY is OPT-IN, for the mornings when the question honestly is "what is this
 * worth". It leads with portfolio value and demotes income to a figure row. That
 * is exactly the flattering read the income theme exists to avoid, so the theme
 * pays for the privilege: the cost-versus-value bar sits directly under the
 * headline, and a per-holding table sits under that. Neither layout is allowed
 * to state one of the two truths without the other — they differ only in which
 * one the eye lands on first, which is a preference and not a fact.
 */

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  ReferenceArea,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { useVantage } from '@/lib/store'
import {
  DASHBOARD_THEME,
  PNL_BASIS,
  PNL_BASIS_LABEL,
  ALLOC_SCOPE,
  ALLOC_SCOPE_LABEL,
  allocation,
  dashboardTheme,
  dividendMonths,
  equitySeries,
  fundMetricsFor,
  goalProgress,
  incomeOutlook,
  pnlBasis,
  portfolio,
  positions,
  slotColor,
  slotOf,
  netWorth,
  toRM,
} from '@/lib/calc'
import {
  dfmt,
  dfmtLong,
  dtfmt,
  fmt,
  fmtBare,
  fmtCompact,
  fmtS,
  fq,
  pct0,
  pct1,
  pctS,
  symbol,
  toneClass,
} from '@/lib/format'

/* ── welcome ──────────────────────────────────────────────────────────────── */

const WAYS = [
  <>
    Run the OpenD sync — start OpenD, then <code className="num text-foreground">python sync/moomoo_sync.py</code>
  </>,
  <>Add instruments on the Instruments screen and log trades under Positions</>,
  <>Record a deposit under Wallet</>,
]

function Welcome() {
  return (
    <Card className="py-10">
      <CardContent className="mx-auto max-w-[520px] px-6">
        <p className="text-[15px] font-semibold">Welcome to Vantage.</p>
        <p className="text-muted-foreground mt-1.5">Three ways to get your data in:</p>
        <ol className="mt-5 grid gap-3">
          {WAYS.map((way, i) => (
            <li key={i} className="text-muted-foreground flex items-start gap-3 text-[13px] leading-relaxed">
              <span className="num border-hairline text-faint mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]">
                {i + 1}
              </span>
              <span>{way}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

/* ── dividends received ───────────────────────────────────────────────────── */

function DividendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  const tickers = Object.entries(m.byTicker).sort((a, b) => b[1] - a[1])
  return (
    <div className="bg-popover text-popover-foreground min-w-[190px] rounded-md border px-2.5 py-2 shadow-md">
      <div className="text-faint num text-[11px]">{m.month}</div>
      <div className="num mt-1 flex justify-between gap-4 text-[12px]">
        <span className="text-muted-foreground">Received</span>
        <span className="text-gain font-medium">{fmt(m.net, 'MYR')}</span>
      </div>
      <div className="num flex justify-between gap-4 text-[11.5px]">
        <span className="text-muted-foreground">Withheld</span>
        <span className="text-loss">{fmt(m.tax, 'MYR')}</span>
      </div>
      {tickers.length > 0 && (
        <div className="border-hairline mt-1.5 border-t pt-1.5">
          {tickers.map(([t, v]) => (
            <div key={t} className="num flex justify-between gap-4 text-[11px]">
              <span className="text-faint">{t}</span>
              <span className="text-muted-foreground">{fmt(v, 'MYR')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── equity curve ─────────────────────────────────────────────────────────── */

function EquityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-2.5 py-1.5 shadow-md">
      <div className="text-faint num text-[11px]">{dfmtLong(p.date)}</div>
      <div className="num mt-0.5 text-[13px] font-semibold">{fmt(p.value, 'MYR')}</div>
      <div className="text-faint text-[10.5px]">at the broker</div>
      {p.net != null ? (
        <div className="border-hairline mt-1 border-t pt-1">
          <div className="num text-gain text-[12.5px] font-semibold">{fmt(p.net, 'MYR')}</div>
          <div className="text-faint text-[10.5px]">
            net worth · {fmt(p.assets || 0, 'MYR')} outside, {fmt(p.owed || 0, 'MYR')} owed
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EquityCard({ series }) {
  // Drawn only where it exists. Every point written before the owned columns did
  // carries net: null, so the line begins partway along the broker curve rather
  // than diving to zero and inventing a crash that never happened.
  const hasNet = useMemo(() => series.some(s => s.net != null), [series])

  const domain = useMemo(() => {
    if (series.length < 2) return [0, 1]
    // The domain must span both lines or the taller one clips. Math.min/max
    // rather than the old *0.97 / *1.02 on one series: net worth can be negative
    // when the debts win, and scaling a negative floor by 0.97 raises it.
    const vals = series.flatMap(s => (s.net == null ? [s.value] : [s.value, s.net]))
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.06
    return [lo - pad, hi + pad]
  }, [series])

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Equity curve</span>
      </CardHeader>
      <CardContent className="px-2 pb-1">
        {series.length < 2 ? (
          <p className="text-muted-foreground px-2 py-14 text-center">
            The equity curve appears after a few daily snapshots (the sync worker records one per run).
          </p>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vantage-equity-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={dfmt}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tickMargin={8}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10.5 }}
                />
                <YAxis
                  domain={domain}
                  width={56}
                  tickCount={4}
                  tickFormatter={v => fmtCompact(v, 'MYR')}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10.5 }}
                />
                <ChartTooltip
                  content={<EquityTooltip />}
                  cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#vantage-equity-fill)"
                  dot={false}
                  activeDot={{ r: 3.5, stroke: 'var(--card)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                {/* No fill: the broker area is the subject and a second filled
                    region would read as a stack, which this is not — net worth
                    contains the broker figure rather than sitting on top of it.
                    connectNulls stays off so the gap before the owned side was
                    recorded is visible as a gap. */}
                {hasNet ? (
                  <Area
                    type="monotone"
                    dataKey="net"
                    stroke="var(--gain)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    fill="none"
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 3.5, stroke: 'var(--card)', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The same curve, edge to edge, for the theme that leads with portfolio value.
 *
 * EquityCard stays exactly as it is — the income theme still uses it inside its
 * card grid, where a bordered panel is the right container. Here the chart IS the
 * band, so the card and its padding would only fence it in, and the axis is
 * mirrored inside the plot the way IncomeCurve's is so nothing eats the bleed.
 *
 * The gradient carries its own id: two <defs> answering to the same name in one
 * document is a coin toss over which fill wins, and both charts can be mounted
 * at once while a theme switch is animating out.
 *
 * A curve of fewer than two snapshots is not a flat line, it is no curve at all,
 * so it keeps EquityCard's wording rather than drawing a shape that would read as
 * a portfolio that has not moved.
 */
function EquityStrip({ series }) {
  const domain = useMemo(() => {
    if (series.length < 2) return [0, 1]
    const vals = series.map(s => s.value)
    return [Math.min(...vals) * 0.97, Math.max(...vals) * 1.02]
  }, [series])

  const since = series.length ? dfmtLong(series[0].date) : null

  return (
    <div className="border-hairline border-b">
      <div className="px-[clamp(14px,2.4vw,28px)] pt-4">
        <span className="eyebrow">Portfolio value{since ? ` · since ${since}` : ''}</span>
      </div>
      {series.length < 2 ? (
        <p className="text-muted-foreground px-[clamp(14px,2.4vw,28px)] py-14 text-center">
          The equity curve appears after a few daily snapshots (the sync worker records one per run).
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={series} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="vantage-equity-strip-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="2 5" />
            <XAxis
              dataKey="date"
              tickFormatter={dfmt}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickMargin={8}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10.5 }}
            />
            <YAxis
              domain={domain}
              width={62}
              orientation="left"
              mirror
              tickCount={4}
              tickFormatter={v => fmtCompact(v, 'MYR')}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--faint)', fontSize: 10 }}
            />
            <ChartTooltip content={<EquityTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#vantage-equity-strip-fill)"
              dot={false}
              activeDot={{ r: 3.5, stroke: 'var(--background)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

/* ── allocation ───────────────────────────────────────────────────────────── */

function AllocationTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-2.5 py-1.5 shadow-md">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold">
        <span className="size-2 rounded-full" style={{ background: p.color }} />
        {p.name}
      </div>
      <div className="num text-faint mt-0.5 text-[11.5px]">
        {fmt(p.value, 'MYR')} · {pct0(p.share * 100)}
      </div>
    </div>
  )
}

/** One scope chip, matching the History filter chips rather than inventing a control. */
function ScopeChip({ scope, active, onPick }) {
  const on = scope === active
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? 'default' : 'outline'}
      aria-pressed={on}
      onClick={() => onPick(scope)}
      className="h-6 rounded-full px-2.5 text-[11px] font-semibold"
    >
      {ALLOC_SCOPE_LABEL[scope]}
    </Button>
  )
}

/**
 * The allocation donut, scoped.
 *
 * The scope lives here rather than in the Dashboard body because nothing else
 * needs it — it is a way of looking at one chart, not a property of the data.
 *
 * A scope with nothing in it still renders its chips, so switching to an empty
 * one is visibly a choice you made rather than the card breaking.
 */
function AllocationCard({ state }) {
  const [scope, setScope] = useState(ALLOC_SCOPE.ALL)
  const parts = useMemo(() => allocation(state, scope), [state, scope])
  const slices = parts.filter(p => p.value > 0)
  const total = slices.reduce((s, p) => s + p.value, 0)

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="eyebrow">Allocation</span>
          <div className="flex flex-wrap gap-1">
            {[ALLOC_SCOPE.ALL, ALLOC_SCOPE.BROKER, ALLOC_SCOPE.OUTSIDE].map(s => (
              <ScopeChip key={s} scope={s} active={scope} onPick={setScope} />
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-1">
        {!slices.length ? (
          <p className="text-muted-foreground px-2 py-14 text-center">
            Allocation appears once a position has a price.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative h-[168px] w-[168px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={1.5}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map(p => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<AllocationTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-muted-foreground text-[11px]">Total</span>
                <span className="num text-[13px] font-semibold">{fmtCompact(total, 'MYR')}</span>
              </div>
            </div>
            <div className="min-w-[140px] flex-1">
              {slices.map(p => (
                <div key={p.name} className="flex items-center gap-2 py-[3px] text-[12.5px]">
                  <span className="size-[9px] shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="truncate">{p.name}</span>
                  <span className="num text-muted-foreground ml-auto">{pct0(p.share * 100)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ── goals ────────────────────────────────────────────────────────────────── */

/** The compact goal card. Income goals are a different shape, so they branch. */
function GoalCard({ goal, progress }) {
  if (progress.kind && progress.kind !== 'SHARES') return <IncomeGoalCard goal={goal} progress={progress} />

  const { qty, remain, px, need, prog, cur } = progress
  return (
    <Card className="gap-2.5 py-3.5">
      <CardContent className="px-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-[13.5px] font-bold">
            {fq(goal.target_qty)} × {goal.ticker}
          </span>
          <Badge variant="neutral" className="num px-2 py-0 text-[11px]">
            {pct0(prog)}
          </Badge>
        </div>
        <Progress value={prog} className="mt-2.5 h-2" />
        <div className="text-muted-foreground mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
          <span>
            Have <b className="num text-foreground font-semibold">{fq(qty)}</b>
          </span>
          <span>
            Need <b className="num text-foreground font-semibold">{fq(remain)}</b> more
          </span>
          <span>
            Capital ≈{' '}
            <b className={`font-semibold ${px ? 'num text-foreground' : 'text-faint'}`}>
              {px ? fmt(need, cur) : 'set a price first'}
            </b>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function IncomeGoalCard({ goal, progress }) {
  const { current, remain, prog, rate, sharesNeeded, capital, px, priceCur } = progress
  const monthly = goal.kind === 'INCOME_MONTHLY'
  const perPayment = goal.kind === 'INCOME_PER_PAYMENT'
  const isRate = monthly || perPayment
  const amount = fmt(goal.target_amount || 0, 'MYR')
  const title = monthly
    ? `${amount}/mo`
    : perPayment
      ? `${amount}/payment`
      : goal.kind === 'INCOME_YEAR'
        ? `${amount} in ${new Date().getFullYear()}`
        : amount

  return (
    <Card className="gap-2.5 py-3.5">
      <CardContent className="px-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-[13.5px] font-bold">
            {title} <span className="text-faint font-normal">· {goal.ticker || 'all'}</span>
          </span>
          <Badge variant="neutral" className="num px-2 py-0 text-[11px]">
            {pct0(prog)}
          </Badge>
        </div>
        <Progress value={prog} className="mt-2.5 h-2" />
        <div className="text-muted-foreground mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
          <span>
            {perPayment ? 'Averaging' : monthly ? 'Earning' : 'Received'}{' '}
            <b className="num text-gain font-semibold">{fmt(current, 'MYR')}</b>
          </span>
          <span>
            Need <b className="num text-foreground font-semibold">{fmt(remain, 'MYR')}</b> more
          </span>
          {/* A per-payment target is reached by buying, so say what that costs —
              the same question the share goals answer. */}
          {perPayment && sharesNeeded > 0 ? (
            <span>
              Buy <b className="num text-foreground font-semibold">{fq(Math.ceil(sharesNeeded))}</b> more ·
              Capital ≈{' '}
              <b className={`font-semibold ${px ? 'num text-foreground' : 'text-faint'}`}>
                {px ? fmt(capital, priceCur) : 'set a price first'}
              </b>
            </span>
          ) : null}
          {isRate ? null : (
            <span>
              at <b className="num text-foreground font-semibold">{fmt(rate, 'MYR')}</b>/mo
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── screen ───────────────────────────────────────────────────────────────── */

/**
 * The price strip under the nav.
 *
 * NOT a day change — the app stores one price per instrument and no prior
 * close, so a daily percentage would have to be invented. What it shows instead
 * is real and, for funds like these, more use: how far the market price sits
 * from what the fund actually holds per unit.
 */
function Ticker({ rows, lastSync, fx }) {
  if (!rows.length) return null
  return (
    <div className="border-hairline flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-[clamp(14px,2.4vw,28px)] py-2">
      {rows.map(r => (
        <span key={r.ticker} className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="size-[6px] shrink-0 rounded-full"
            style={{ background: slotColor(r.slot) }}
          />
          <span className="num text-muted-foreground text-[11px]">
            {r.ticker} {fmtBare(r.price)}
          </span>
          {r.premium == null ? null : (
            <span className={`num text-[11px] ${r.premium > 0 ? 'text-loss' : 'text-gain'}`}>
              {pctS(r.premium)} vs NAV
            </span>
          )}
        </span>
      ))}
      <span className="text-faint num text-[11px] whitespace-nowrap">
        synced {lastSync} · 1 USD = RM {fx.toFixed(2)}
      </span>
    </div>
  )
}

/** One cell of the full-bleed figures row along the bottom of the fold. */
function FigCell({ label, value, valueClass = '', sub, subClass = 'text-faint' }) {
  return (
    <div className="border-hairline flex-1 border-r px-[clamp(14px,2.4vw,28px)] py-4 last:border-r-0">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-2 text-[clamp(19px,2vw,25px)] font-semibold tracking-[-0.02em] ${valueClass}`}>
        {value}
      </div>
      <div className={`mt-1 text-[11.5px] ${subClass}`}>{sub}</div>
    </div>
  )
}

/**
 * The month's income: what has landed, and what the funds' own rhythm says is
 * still to come — with the three figures that give it a scale down the side.
 *
 * Three states, never blurred together: money RECEIVED, money DECLARED but not yet
 * paid (the fund published a per-share rate — this is arithmetic), and money merely
 * PROJECTED from the fund's rhythm at recent average rates. The bar is solid, then
 * half-tone, then hatched; only the projected half carries an '≈'. The run rate is
 * amber because it extrapolates per-share rates that are currently falling.
 */
function IncomeHero({ outlook, monthLabel, receivedToDate, monthsPaid, best, runRate }) {
  const received = outlook.received
  const total = received + outlook.estimated
  if (!total && !receivedToDate) return null
  const declared = outlook.declaredDue || 0
  const paidPct = total ? (received / total) * 100 : 0
  const declaredPct = total ? (declared / total) * 100 : 0
  const whole = Math.floor(total)
  const cents = (total - whole).toFixed(2).slice(1)

  return (
    <div className="border-hairline flex flex-wrap items-start justify-between gap-x-10 gap-y-7 border-b px-[clamp(14px,2.4vw,28px)] pt-[clamp(22px,3.4vw,38px)] pb-[clamp(18px,2.6vw,28px)]">
      <div className="min-w-[300px] flex-1">
        <div className="eyebrow">Income this month · {monthLabel}</div>

        <div className="num mt-3 text-[clamp(44px,7.4vw,92px)] leading-[0.92] font-semibold tracking-[-0.045em]">
          {symbol('MYR')}
          {fq(whole)}
          <span className="text-faint">{cents}</span>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-[13px]">
          <span className="text-muted-foreground">
            across {outlook.dates.length} payout date{outlook.dates.length === 1 ? '' : 's'} ·{' '}
            {received > 0 ? (
              <>
                <b className="num text-gain font-semibold">{fmt(received, 'MYR')}</b> landed
              </>
            ) : (
              'nothing landed yet'
            )}
            {declared > 0 ? (
              <>
                {' · '}
                <b className="num text-foreground font-semibold">{fmt(declared, 'MYR')}</b> declared and owed to you
              </>
            ) : null}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="cash" className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                net of withholding
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px]">
              A DECLARED payment is the fund's own published per-share rate times what you hold, less the
              withholding this account actually gets charged — it is owed to you, and only the exact day can
              drift. Everything else is projected from the fund's rhythm at recent average rates; those rates
              have been falling, so read the projected half as a direction, not a figure to spend against.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-5 max-w-[560px]">
          <div className="bg-muted flex h-3 overflow-hidden rounded-full">
            <div className="bg-gain" style={{ width: `${paidPct}%` }} />
            <div className="bg-gain" style={{ width: `${declaredPct}%`, opacity: 0.55 }} />
            <div
              className="flex-1"
              style={{ background: 'repeating-linear-gradient(115deg, var(--gain) 0 6px, transparent 6px 13px)', opacity: 0.42 }}
            />
          </div>
          <div className="num text-faint mt-2 flex justify-between gap-3 text-[10.5px] tracking-[0.06em] uppercase">
            <span>received {fmt(received, 'MYR')}</span>
            {declared > 0 ? <span>declared {fmt(declared, 'MYR')}</span> : null}
            <span>projected {fmt(outlook.estimated - declared, 'MYR')}</span>
          </div>
        </div>

        {outlook.dates.length > 0 && (
          <div className="border-hairline mt-6 flex flex-wrap overflow-hidden rounded-md border">
            {outlook.dates.map((d, i) => (
              <div
                key={d.date}
                className="border-hairline min-w-[128px] flex-1 border-r px-4 py-3 last:border-r-0"
                style={i === 0 ? { borderTop: '2px solid var(--primary)' } : undefined}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="eyebrow">{dfmt(d.date)}</span>
                  {i === 0 ? <span className="text-primary text-[9px] font-semibold tracking-[0.07em] uppercase">next up</span> : null}
                </div>
                <div className={`num mt-1.5 text-[17px] font-semibold ${i === 0 ? 'text-gain' : ''}`}>
                  {d.declared ? '' : '≈ '}
                  {fmt(d.total, 'MYR')}
                </div>
                <div className="text-faint mt-1 flex items-center gap-1.5 text-[10.5px]">
                  <span>{d.parts.map(x => x.ticker).join(' + ')}</span>
                  {d.declared ? (
                    <span className="text-cash text-[9px] font-semibold tracking-[0.07em] uppercase">declared</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-[190px] flex-col gap-6 pt-1">
        <div>
          <div className="eyebrow">Received to date</div>
          <div className="num mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">{fmt(receivedToDate, 'MYR')}</div>
          <div className="text-faint mt-1 text-[11.5px]">
            {monthsPaid} month{monthsPaid === 1 ? '' : 's'} paid
          </div>
        </div>
        {best ? (
          <div>
            <div className="eyebrow">Best month</div>
            <div className="num text-gain mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">
              {fmt(best.net, 'MYR')}
            </div>
            <div className="text-faint mt-1 text-[11.5px]">{best.label}</div>
          </div>
        ) : null}
        <div>
          <div className="eyebrow">Run rate</div>
          <div className="num text-cash mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">
            {fmt(runRate, 'MYR')}
            <span className="text-faint text-[15px]">/yr</span>
          </div>
          <div className="text-faint mt-1 text-[11.5px]">if per-share rates hold — they are falling</div>
        </div>
      </div>
    </div>
  )
}

/**
 * The income-by-month chart itself, with no opinion about what contains it.
 *
 * Two callers want this shape at two sizes — IncomeCurve draws it edge to edge as
 * the income theme's second band, IncomeMini sits it in a card beside the donut in
 * the equity theme — and a chart drawn twice is a chart that drifts. The container
 * differs; the marks, the hatch and the tooltip do not.
 *
 * `idSuffix` exists because SVG <defs> ids are document-global. IncomeCurve keeps
 * the bare ids it has always had; anything else must pass a suffix or the second
 * instance quietly repaints the first.
 */
function IncomeChart({ months, projected, monthLabel, height = 224, idSuffix = '' }) {
  const fillId = `incFill${idSuffix}`
  const hatchId = `incHatch${idSuffix}`
  const data = months.map((m, i) => ({
    ...m,
    actual: m.net,
    projected: i === months.length - 1 ? m.net : null,
  }))
  if (projected > 0) data.push({ label: monthLabel.slice(0, 3), net: projected, tax: 0, byTicker: {}, projected, actual: null })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 18, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gain)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--gain)" stopOpacity={0} />
          </linearGradient>
          <pattern id={hatchId} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--gain)" strokeWidth="1.4" strokeOpacity="0.28" />
          </pattern>
        </defs>
        <CartesianGrid horizontal vertical={false} stroke="var(--hairline)" strokeDasharray="2 5" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
        <YAxis
          width={62}
          orientation="left"
          mirror
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--faint)', fontSize: 10 }}
          tickFormatter={v => fmtCompact(v, 'MYR')}
        />
        <ChartTooltip content={<DividendTooltip />} cursor={{ stroke: 'var(--border)' }} />
        {projected > 0 && <ReferenceArea x1={months[months.length - 1].label} fill={`url(#${hatchId})`} fillOpacity={1} />}
        <Area type="linear" dataKey="actual" stroke="var(--gain)" strokeWidth={2.5} fill={`url(#${fillId})`} connectNulls={false} dot={false} />
        <Area type="linear" dataKey="projected" stroke="var(--gain)" strokeWidth={2} strokeDasharray="4 5" strokeOpacity={0.65} fill="none" connectNulls dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/**
 * Net income by month, edge to edge, with the projected month hatched off.
 *
 * This replaces the old dividend bar card rather than sitting beside it: same
 * data, same tooltip, but as the shape of the income stream instead of nine
 * separate columns. The hatch and the dashed segment mark where fact stops.
 */
function IncomeCurve({ months, projected, monthLabel }) {
  if (!months.length) return null
  return (
    <div className="border-hairline border-b">
      <IncomeChart months={months} projected={projected} monthLabel={monthLabel} height={224} />
    </div>
  )
}

/**
 * The same curve, carded and shorter, for the theme where income is a supporting
 * figure rather than the headline. Demoted, not dropped: the equity layout still
 * has to show that the stream is real and roughly which way it is going.
 */
function IncomeMini({ months, projected, monthLabel }) {
  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Income by month · net</span>
      </CardHeader>
      <CardContent className="px-2 pb-1">
        {!months.length ? (
          <p className="text-muted-foreground px-2 py-14 text-center">
            Income by month appears once the sync has pulled a dividend.
          </p>
        ) : (
          <IncomeChart
            months={months}
            projected={projected}
            monthLabel={monthLabel}
            height={190}
            idSuffix="-mini"
          />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Both facts at once: what the holdings have paid, against what they have lost
 * on price. A dashboard that leads with income owes the reader this card — it
 * is the one place the drawdown is stated in full, unsoftened by distributions.
 */
function TwoTruths({ income, priceLoss }) {
  if (!income && !priceLoss) return null
  const covered = priceLoss < 0 ? Math.min((income / Math.abs(priceLoss)) * 100, 100) : 100
  const scale = Math.max(income, Math.abs(priceLoss)) || 1

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Paid out, against paid for</span>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        <div className="grid gap-2.5">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-[92px] shrink-0 text-[12px]">Distributions</span>
            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <div className="bg-gain h-2" style={{ width: `${(income / scale) * 100}%` }} />
            </div>
            <span className="num text-gain w-[104px] shrink-0 text-right text-[12.5px] font-semibold">
              {fmtS(income, 'MYR')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-[92px] shrink-0 text-[12px]">Price change</span>
            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <div className="bg-loss h-2" style={{ width: `${(Math.abs(priceLoss) / scale) * 100}%` }} />
            </div>
            <span className="num text-loss w-[104px] shrink-0 text-right text-[12.5px] font-semibold">
              {fmtS(priceLoss, 'MYR')}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          Income has covered <b className="num text-foreground font-semibold">{pct0(covered)}</b> of the price
          decline so far. You are being paid well; the capital is still falling faster than the income replaces it.
          Both of these are true and the app shows you the one you asked for in Settings.
        </p>
      </CardContent>
    </Card>
  )
}

/* ── equity theme ─────────────────────────────────────────────────────────── */

/**
 * The headline of the equity layout, built to IncomeHero's anatomy: one giant
 * figure on the left with the sentence that qualifies it, a bar that gives the
 * figure a scale, and three supporting figures down the right rail.
 *
 * The bar is where this differs, and it is the whole reason the layout is safe to
 * ship. Portfolio value is a number that only ever goes up while you keep buying,
 * so on its own it reads as progress even when every holding is under water. The
 * bar scales the track to what was PUT IN and fills it with what the market says
 * it is worth now, hatching the gap — the hatch is the money that is not there.
 * When the portfolio is ahead the track flips to market value and the surplus is
 * drawn solid in gain green, because a gain is a real thing you hold rather than
 * an absence, and a bar scaled to cost could not draw it at all.
 *
 * Idle cash is deliberately outside the bar: it was never a cost and it has not
 * moved, so including it would dilute the drawdown into something gentler than it
 * is. It is on the line above instead, where it belongs to the value figure.
 */
function EquityHero({ p, basis, dayLabel, monthsPaid }) {
  // fmt() always ends '.dd', so the last three characters are the cents and the
  // split needs no arithmetic of its own — which also keeps the sign, the
  // grouping and the rounding in one place rather than three.
  const money = fmt(p.totalRM, 'MYR')
  const cut = money.length - 3

  const up = p.pricePnlRM >= 0
  const scale = up ? p.invRM : p.costRM
  // Scaled to cost when down (so the hatch is the shortfall) and to market value
  // when up (so the surplus has somewhere to sit).
  const filled = scale > 0 ? Math.min(((up ? p.costRM : p.invRM) / scale) * 100, 100) : 0
  const hasBar = p.costRM > 0 || p.invRM > 0

  return (
    <div className="border-hairline flex flex-wrap items-start justify-between gap-x-10 gap-y-7 border-b px-[clamp(14px,2.4vw,28px)] pt-[clamp(22px,3.4vw,38px)] pb-[clamp(18px,2.6vw,28px)]">
      <div className="min-w-[300px] flex-1">
        <div className="eyebrow">Portfolio value · {dayLabel}</div>

        <div className="num mt-3 text-[clamp(44px,7.4vw,92px)] leading-[0.92] font-semibold tracking-[-0.045em]">
          {money.slice(0, cut)}
          <span className="text-faint">{money.slice(cut)}</span>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-[13px]">
          <span className="text-muted-foreground">
            invested <b className="num text-foreground font-semibold">{fmt(p.invRM, 'MYR')}</b> across{' '}
            {p.pos.length} position{p.pos.length === 1 ? '' : 's'} · idle cash{' '}
            <b className={`num font-semibold ${p.cashRM < 0 ? 'text-loss' : 'text-cash'}`}>
              {fmt(p.cashRM, 'MYR')}
            </b>
          </span>
          <Badge variant="neutral" className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {PNL_BASIS_LABEL[basis]}
          </Badge>
        </div>

        {hasBar ? (
          <div className="mt-5 max-w-[560px]">
            <div className="bg-muted flex h-3 overflow-hidden rounded-full">
              <div className="bg-[var(--chart-1)]" style={{ width: `${filled}%` }} />
              {up ? (
                <div className="bg-gain flex-1" />
              ) : (
                <div
                  className="flex-1"
                  style={{
                    background: 'repeating-linear-gradient(115deg, var(--loss) 0 6px, transparent 6px 13px)',
                    opacity: 0.55,
                  }}
                />
              )}
            </div>
            <div className="num text-faint mt-2 flex justify-between gap-3 text-[10.5px] tracking-[0.06em] uppercase">
              <span>{up ? `cost ${fmt(p.costRM, 'MYR')}` : `market value ${fmt(p.invRM, 'MYR')}`}</span>
              <span>
                {up ? 'price gain' : 'price loss'} {fmtS(p.pricePnlRM, 'MYR')}
              </span>
            </div>
            <p className="text-faint mt-2.5 text-[11.5px]">
              measured against {fmt(p.costRM, 'MYR')} put in. Idle cash sits outside cost and is not in this bar.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-[190px] flex-col gap-6 pt-1">
        <div>
          <div className="eyebrow">Total P&amp;L</div>
          <div className={`num mt-1.5 text-[25px] font-semibold tracking-[-0.02em] ${toneClass(p.pnlRM)}`}>
            {fmtS(p.pnlRM, 'MYR')}
          </div>
          <div className="text-faint mt-1 text-[11.5px]">{p.costRM ? pctS(p.pnlPct) : '—'} on cost</div>
        </div>

        {/* Under the price-only basis, Total P&L already IS price only — printing
            it twice would suggest two figures agreeing rather than one repeated.
            Total return is the one that adds something the rail does not have. */}
        {basis === PNL_BASIS.PRICE ? (
          <div>
            <div className="eyebrow">Total return</div>
            <div className={`num mt-1.5 text-[25px] font-semibold tracking-[-0.02em] ${toneClass(p.totalReturnRM)}`}>
              {fmtS(p.totalReturnRM, 'MYR')}
            </div>
            <div className="text-faint mt-1 text-[11.5px]">
              {p.costRM ? pctS(p.totalReturnPct) : '—'} with income
            </div>
          </div>
        ) : (
          <div>
            <div className="eyebrow">Price only</div>
            <div className={`num mt-1.5 text-[25px] font-semibold tracking-[-0.02em] ${toneClass(p.pricePnlRM)}`}>
              {fmtS(p.pricePnlRM, 'MYR')}
            </div>
            <div className="text-faint mt-1 text-[11.5px]">
              {p.costRM ? pctS(p.pricePnlPct) : '—'} on cost
            </div>
          </div>
        )}

        <div>
          <div className="eyebrow">Income received</div>
          <div className="num text-gain mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">
            {fmt(p.divNetRM, 'MYR')}
          </div>
          <div className="text-faint mt-1 text-[11.5px]">
            {monthsPaid} month{monthsPaid === 1 ? '' : 's'} paid · already in cash
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The two ends of the table, pulled out so they can be seen without reading it.
 *
 * Ranked on percentage return rather than ringgit, because the biggest ringgit
 * loss is usually just the biggest position and says nothing about the holding.
 * The ringgit figure is underneath anyway, converted, so a large percentage on a
 * small position cannot masquerade as a large loss.
 *
 * `Spread` is the distance between the two ends — how much of the outcome is the
 * choice of fund rather than the market. It only appears with more than one
 * holding, where it means anything; so do the best/worst labels, since a single
 * position is not the best of anything.
 */
function Movers({ state, pos }) {
  if (!pos.length) return null
  const ranked = [...pos].sort((a, b) => b.pct - a.pct)
  const many = ranked.length > 1
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Best and worst by return</span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          {ranked.map((q, i) => {
            const rank = !many ? null : i === 0 ? 'best' : i === ranked.length - 1 ? 'worst' : null
            return (
              <div key={q.t} className="border-hairline min-w-[128px] flex-1 rounded-lg border px-3 py-2.5">
                <div className="flex items-baseline gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-[7px] shrink-0 translate-y-px rounded-full"
                    style={{ background: slotColor(q.slot) }}
                  />
                  {rank ? <span className="text-faint text-[10px] tracking-[0.06em] uppercase">{rank} ·</span> : null}
                  <span className="num text-[12.5px] font-semibold">{q.t}</span>
                </div>
                <div className={`num mt-1 text-[16px] font-semibold ${toneClass(q.pnl)}`}>{pctS(q.pct)}</div>
                <div className="num text-faint mt-0.5 text-[11px]">
                  {fmtS(toRM(state, q.pnl, q.cur), 'MYR')}
                </div>
              </div>
            )
          })}
          {many ? (
            <div className="border-hairline min-w-[128px] flex-1 rounded-lg border px-3 py-2.5">
              <div className="text-faint text-[10px] tracking-[0.06em] uppercase">Spread</div>
              <div className="num mt-1 text-[16px] font-semibold">{pct1(best.pct - worst.pct)}</div>
              <div className="num text-faint mt-0.5 text-[11px]">
                {best.t} to {worst.t}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Every open holding, largest first, in the currency each question wants.
 *
 * Avg cost and Price stay in the instrument's own currency — comparing a fund's
 * price to its own average is the only thing those two columns are for, and
 * converting them would put an FX rate between a number and itself. Value and
 * P&L are RM, because those DO get summed down the column.
 *
 * The totals row carries PRICE-ONLY P&L whatever basis is set, and cannot do
 * otherwise: withholding is booked as FEE cash movements with no instrument
 * attached (see dividendsByTicker), so a per-position net income does not exist
 * to sum. The note under the table says so rather than letting the row quietly
 * disagree with the hero above it.
 */
function Holdings({ state, p }) {
  if (!p.pos.length) return null
  const rows = p.pos
    .map(q => ({ ...q, rm: toRM(state, q.val, q.cur), pnlRM: toRM(state, q.pnl, q.cur) }))
    .sort((a, b) => b.rm - a.rm)
  const weight = v => (p.totalRM ? (v / p.totalRM) * 100 : 0)

  const th = 'border-hairline border-b py-2 pl-3 text-right font-semibold'
  const td = 'num border-hairline border-b py-2 pl-3 text-right'

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Holdings</span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-faint text-[10.5px] tracking-[0.06em] uppercase">
                <th className="border-hairline border-b py-2 pr-3 text-left font-semibold">Holding</th>
                <th className={th}>Units</th>
                <th className={th}>Avg cost</th>
                <th className={th}>Price</th>
                <th className={th}>Value (RM)</th>
                <th className={th}>Weight</th>
                <th className={th}>P&amp;L (RM)</th>
                <th className={th}>Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(q => (
                <tr key={q.t}>
                  <td className="border-hairline border-b py-2 pr-3">
                    <div className="flex items-baseline gap-2">
                      <span
                        aria-hidden="true"
                        className="size-[8px] shrink-0 translate-y-px rounded-full"
                        style={{ background: slotColor(q.slot) }}
                      />
                      <span className="num font-semibold">{q.t}</span>
                    </div>
                    {q.name ? (
                      <div className="text-faint ml-[16px] max-w-[240px] truncate text-[10.5px]" title={q.name}>
                        {q.name}
                      </div>
                    ) : null}
                  </td>
                  <td className={td}>{fq(q.qty)}</td>
                  <td className={td}>{fmt(q.avg, q.cur)}</td>
                  {/* A missing quote is a dash, never a zero — see Positions. */}
                  <td className={td}>{q.px > 0 ? fmt(q.px, q.cur) : <span className="text-faint">—</span>}</td>
                  <td className={td}>{fmt(q.rm, 'MYR')}</td>
                  <td className={`${td} text-muted-foreground`}>{pct1(weight(q.rm))}</td>
                  <td className={`${td} ${toneClass(q.pnl)}`}>{fmtS(q.pnlRM, 'MYR')}</td>
                  <td className={`${td} ${toneClass(q.pnl)}`}>{pctS(q.pct)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="num py-2 pl-3 text-right" />
                <td className="num py-2 pl-3 text-right" />
                <td className="num py-2 pl-3 text-right" />
                <td className="num py-2 pl-3 text-right">{fmt(p.invRM, 'MYR')}</td>
                <td className="num text-muted-foreground py-2 pl-3 text-right">{pct1(weight(p.invRM))}</td>
                <td className={`num py-2 pl-3 text-right ${toneClass(p.pricePnlRM)}`}>
                  {fmtS(p.pricePnlRM, 'MYR')}
                </td>
                <td className={`num py-2 pl-3 text-right ${toneClass(p.pricePnlRM)}`}>
                  {p.costRM ? pctS(p.pricePnlPct) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-faint mt-2.5 text-[11.5px]">
          The total is price-only P&amp;L, whatever basis is set: withholding is booked as cash movements with no
          instrument attached, so income cannot be split back across these rows. Weight is each holding against
          portfolio value, cash included — the totals row is what share of it is invested.
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Fund size, in the units a fund is actually discussed in — '$924.3M', '$4.25M'.
 *
 * fmtCompact() is tuned for chart axes and stops at one decimal, which turns a
 * RM 4.25m fund into 'RM 4.2m' and loses the digit that distinguishes these funds
 * from each other. Same idea, one more significant figure, and it borrows the
 * currency symbol from format.js rather than inventing one.
 */
function fundSize(v, cur) {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs < 1e3) return fmt(v, cur)
  const [unit, div] = abs >= 1e9 ? ['B', 1e9] : abs >= 1e6 ? ['M', 1e6] : ['k', 1e3]
  const n = v / div
  return symbol(cur) + n.toFixed(Math.abs(n) >= 100 ? 1 : 2) + unit
}

/**
 * What the market charges over what the fund holds, per holding.
 *
 * This is a cost, not a statistic. Every buy of a fund trading at a premium hands
 * the spread away before the position has done anything, and it is the one figure
 * on the screen that is entirely inside the owner's control — the decision to buy
 * today or wait. So a POSITIVE premium is coloured as a loss and a negative one as
 * a gain, which inverts the usual reading of those colours and matches what the
 * price strip at the top of the screen already does.
 *
 * Only funds with a synced metrics row appear: the sync refreshes fund figures for
 * held codes, and a row of dashes would be a table pretending to know something.
 */
function PremiumPanel({ state, pos }) {
  const rows = pos
    .map(q => ({ q, m: fundMetricsFor(state, q.t) }))
    .filter(r => r.m)
    .sort((a, b) => toRM(state, b.q.val, b.q.cur) - toRM(state, a.q.val, a.q.cur))
  if (!rows.length) return null

  const th = 'border-hairline border-b py-2 pl-3 text-right font-semibold'
  const td = 'num border-hairline border-b py-2 pl-3 text-right'

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Premium to NAV</span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-muted-foreground text-[12.5px]">
          What the market charges above what the fund actually holds per unit. You pay this on every buy.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-faint text-[10.5px] tracking-[0.06em] uppercase">
                <th className="border-hairline border-b py-2 pr-3 text-left font-semibold">Fund</th>
                <th className={th}>Price</th>
                <th className={th}>NAV</th>
                <th className={th}>Premium</th>
                <th className={th}>Dist. yield</th>
                <th className={th}>Fund size</th>
                <th className={th}>Your share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ q, m }) => {
                // Units and holding are both in shares, so this needs no FX.
                const share = m.outstanding_units ? (q.qty / m.outstanding_units) * 100 : null
                return (
                  <tr key={q.t}>
                    <td className="border-hairline border-b py-2 pr-3">
                      <div className="flex items-baseline gap-2">
                        <span
                          aria-hidden="true"
                          className="size-[8px] shrink-0 translate-y-px rounded-full"
                          style={{ background: slotColor(q.slot) }}
                        />
                        <span className="num font-semibold">{q.t}</span>
                      </div>
                      {q.name ? (
                        <div className="text-faint ml-[16px] max-w-[240px] truncate text-[10.5px]" title={q.name}>
                          {q.name}
                        </div>
                      ) : null}
                    </td>
                    <td className={td}>{q.px > 0 ? fmt(q.px, q.cur) : <span className="text-faint">—</span>}</td>
                    <td className={td}>{m.nav == null ? <span className="text-faint">—</span> : fmt(m.nav, q.cur)}</td>
                    <td className={`${td} ${m.premium == null ? '' : m.premium > 0 ? 'text-loss' : 'text-gain'}`}>
                      {m.premium == null ? <span className="text-faint">—</span> : pctS(m.premium)}
                    </td>
                    <td className={`${td} text-cash`}>
                      {m.dividend_yield == null ? <span className="text-faint">—</span> : pct1(m.dividend_yield)}
                    </td>
                    <td className={`${td} text-muted-foreground`}>{fundSize(m.aum, q.cur)}</td>
                    <td className={`${td} text-muted-foreground`}>
                      {share == null ? (
                        <span className="text-faint">—</span>
                      ) : (
                        `${share < 0.01 ? '<0.01' : share.toFixed(3)}%`
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── layouts ──────────────────────────────────────────────────────────────── */

/**
 * The default: income first, value underneath.
 *
 * Moved here verbatim from the old default export — same order, same blocks, same
 * full-bleed shell. Nothing in this function may change without the same change
 * being justified on its own; the theme switch is not a licence to redesign it.
 */
function IncomeLayout({ state, ticker, lastSync, fx, outlook, monthLabel, p, divMonths, monthsPaid, best, runRate, basis, series, goals }) {
  return (
    <>
      {/* Edge to edge: the shell's padding is re-applied per block, so the
          hairlines run the full width the way they do in the design. */}
      <div className="-mx-[clamp(14px,2.4vw,28px)] -mt-5">
        <Ticker rows={ticker} lastSync={lastSync} fx={fx} />

        <IncomeHero
          outlook={outlook}
          monthLabel={monthLabel}
          receivedToDate={p.divNetRM}
          monthsPaid={monthsPaid}
          best={best}
          runRate={runRate}
        />

        <IncomeCurve months={divMonths} projected={outlook.estimated} monthLabel={monthLabel} />

        <div className="border-hairline flex flex-wrap border-b">
          <FigCell
            label="Portfolio value"
            value={fmt(p.totalRM, 'MYR')}
            sub={`1 USD = RM ${fx.toFixed(2)}`}
            subClass="num text-faint"
          />
          <FigCell
            label={basis === 'price' ? 'Unrealized P&L' : `P&L · ${PNL_BASIS_LABEL[basis].toLowerCase()}`}
            value={fmtS(p.pnlRM, 'MYR')}
            valueClass={toneClass(p.pnlRM)}
            sub={`${p.costRM ? pctS(p.pnlPct) : '—'} on cost`}
            subClass={`num ${toneClass(p.pnlRM)}`}
          />
          <FigCell
            label="Invested"
            value={fmt(p.invRM, 'MYR')}
            sub={`${p.pos.length} position${p.pos.length === 1 ? '' : 's'}`}
          />
          <FigCell
            label="Idle cash"
            value={fmt(p.cashRM, 'MYR')}
            valueClass={p.cashRM < 0 ? 'text-loss' : 'text-cash'}
            sub={
              p.cashRM < 0
                ? 'Negative? Record your deposits in Wallet'
                : `MYR ${fmtBare(p.cashMYR)} · USD ${fmtBare(p.cashUSD)}`
            }
            subClass={p.cashRM < 0 ? 'text-faint' : 'num text-faint'}
          />
        </div>
      </div>

      <div className="grid gap-3.5 pt-5">
        <TwoTruths income={p.divNetRM} priceLoss={p.pricePnlRM} />

        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <EquityCard series={series} />
          <AllocationCard state={state} />
        </div>

        {goals.length > 0 && (
          <>
            <h2 className="num mt-3 text-[17px] font-semibold">Goals in progress</h2>
            <div className="grid gap-3.5 md:grid-cols-2">
              {goals.map(({ goal, progress }) => (
                <GoalCard key={goal.id ?? goal.ticker} goal={goal} progress={progress} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/**
 * The opt-in: value first, income demoted to a figure row.
 *
 * It leads with what the portfolio is worth today and then, immediately under the
 * headline and before anything else can soften it, the cost-versus-value bar. That
 * placement is the point of the layout. Portfolio value rises whenever a deposit
 * lands, and the equity curve below rises with it, so a screen that showed the
 * number and then the curve would read as a portfolio climbing — while this one is
 * down 21.6% on cost and the climb is entirely money being carried in. The bar is
 * the sentence that stops the misread, so it sits inside the hero rather than in a
 * card further down where it could be scrolled past.
 *
 * After that the order follows the question: the curve, then income as four
 * figures rather than a headline, then the movers and the holdings table that say
 * which positions produced the number, then allocation, income shape, the premium
 * being paid to buy in, TwoTruths, and the goals. TwoTruths is unchanged and still
 * present — this layout may reorder the two truths but it does not get to drop one.
 */
function EquityLayout({ state, ticker, lastSync, fx, basis, p, series, divMonths, outlook, monthLabel, dayLabel, monthsPaid, runRate, goals }) {
  const monthIncome = outlook.received + outlook.estimated
  // Run rate over what was put in — "what this portfolio pays on the money in it".
  // Against cost, not market value: a falling price would otherwise flatter the
  // yield, which is exactly backwards.
  const yieldOnCost = p.costRM > 0 ? (runRate / p.costRM) * 100 : null

  return (
    <>
      <div className="-mx-[clamp(14px,2.4vw,28px)] -mt-5">
        <Ticker rows={ticker} lastSync={lastSync} fx={fx} />

        <EquityHero p={p} basis={basis} dayLabel={dayLabel} monthsPaid={monthsPaid} />

        <EquityStrip series={series} />

        <div className="border-hairline flex flex-wrap border-b">
          <FigCell
            label="Income this month"
            value={fmt(monthIncome, 'MYR')}
            valueClass="text-cash"
            sub={`${monthLabel} · ${
              outlook.received > 0 ? `${fmt(outlook.received, 'MYR')} landed` : 'nothing landed yet'
            } · ${outlook.dates.length} payout date${outlook.dates.length === 1 ? '' : 's'}`}
          />
          <FigCell
            label="Received to date"
            value={fmt(p.divNetRM, 'MYR')}
            valueClass="text-gain"
            sub={`${monthsPaid} month${monthsPaid === 1 ? '' : 's'} paid · net of withholding`}
          />
          <FigCell
            label="Run rate"
            value={
              <>
                {fmt(runRate, 'MYR')}
                <span className="text-faint text-[15px]">/yr</span>
              </>
            }
            valueClass="text-cash"
            sub="if per-share rates hold — they are falling"
          />
          <FigCell
            label="Yield on cost"
            value={yieldOnCost == null ? '—' : pct1(yieldOnCost)}
            sub={`run rate over ${fmt(p.costRM, 'MYR')} invested`}
          />
        </div>
      </div>

      <div className="grid gap-3.5 pt-5">
        <Movers state={state} pos={p.pos} />

        <Holdings state={state} p={p} />

        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <AllocationCard state={state} />
          <IncomeMini months={divMonths} projected={outlook.estimated} monthLabel={monthLabel} />
        </div>

        <PremiumPanel state={state} pos={p.pos} />

        <TwoTruths income={p.divNetRM} priceLoss={p.pricePnlRM} />

        {goals.length > 0 && (
          <>
            <h2 className="num mt-3 text-[17px] font-semibold">Goals in progress</h2>
            <div className="grid gap-3.5 md:grid-cols-2">
              {goals.map(({ goal, progress }) => (
                <GoalCard key={goal.id ?? goal.ticker} goal={goal} progress={progress} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/**
 * Resolve once, then choose a layout.
 *
 * Both themes are fed from the same derived figures, so everything is computed
 * here and nothing is re-derived inside a layout — two layouts calling portfolio()
 * for themselves is how the same screen ends up with two different totals.
 *
 * Every hook runs before the branch and before the Welcome return, unconditionally.
 * The layouts are components rather than inlined JSX for the same reason: React
 * counts hooks per component and per render, and a theme switch must not be able to
 * change the order of the ones this function owns.
 */
function DashboardBody() {
  const { state, fx } = useVantage()

  const basis = pnlBasis(state)
  const theme = dashboardTheme(state)
  const p = useMemo(() => portfolio(state, basis), [state, basis])
  const series = useMemo(() => equitySeries(state), [state])
  const divMonths = useMemo(() => dividendMonths(state), [state])
  const now = useMemo(() => new Date(), [])
  const outlook = useMemo(() => incomeOutlook(state, now.getFullYear(), now.getMonth()), [state, now])
  const goals = useMemo(
    () => state.goals.map(g => ({ goal: g, progress: goalProgress(state, g) })),
    [state],
  )

  if (!state.transactions.length && !state.cash.length) return <Welcome />

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long' })
  const dayLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const best = divMonths.length ? divMonths.reduce((a, b) => (b.net > a.net ? b : a)) : null
  const runRate = (outlook.received + outlook.estimated) * 12
  const ticker = positions(state)
    .slice()
    .sort((a, b) => b.val - a.val)
    .map(q => {
      const m = fundMetricsFor(state, q.t)
      return { ticker: q.t, price: q.px, premium: m ? m.premium : null, slot: slotOf(state, q.t) }
    })
  const lastSync = state.lastSync ? dtfmt(state.lastSync) : 'never'

  if (theme === DASHBOARD_THEME.EQUITY) {
    return (
      <EquityLayout
        state={state}
        ticker={ticker}
        lastSync={lastSync}
        fx={fx}
        basis={basis}
        p={p}
        series={series}
        divMonths={divMonths}
        outlook={outlook}
        monthLabel={monthLabel}
        dayLabel={dayLabel}
        monthsPaid={divMonths.length}
        runRate={runRate}
        goals={goals}
      />
    )
  }

  return (
    <IncomeLayout
      state={state}
      ticker={ticker}
      lastSync={lastSync}
      fx={fx}
      outlook={outlook}
      monthLabel={monthLabel}
      p={p}
      divMonths={divMonths}
      monthsPaid={divMonths.length}
      best={best}
      runRate={runRate}
      basis={basis}
      series={series}
      goals={goals}
    />
  )
}

/**
 * Net worth: everything you own, less everything you owe.
 *
 * It is the ONLY figure on this screen that adds the two worlds together —
 * everything below still describes the broker alone and means exactly what it
 * meant before. That restraint is what keeps this a small diff to a long screen.
 *
 * WHILE NOTHING IS OWED it refuses the name and says "Everything you own"
 * instead, because a total with no subtraction in it is not a net worth.
 *
 * AND WHEN SOMETHING IS OWED it names what is missing. A loan whose underlying
 * item is not tracked as an asset subtracts the debt without adding the thing it
 * bought — track a mortgage and not the house and the figure understates you by
 * the whole house. That is a defensible way to run it (no valuation to keep
 * fresh, nothing quietly flattering you) but it must be in the label, not buried.
 *
 * The debt bar is drawn to the SAME SCALE as the assets bar rather than being
 * normalised to its own width, so when you owe more than you own the picture says
 * so at a glance. Fitting each bar to its own container would flatter the smaller
 * one and lie about which way round the situation is.
 *
 * Full-bleed, with `-mt-5` cancelling main's top padding and `mb-5` giving back
 * the space the layout below immediately reclaims with its own `-mt-5`.
 */
function OwnedStrip({ owned }) {
  const owes = owned.owedRM > 0

  // Everything on one scale: each segment's share is of owned PLUS owed, so a
  // width means the same thing wherever it sits and the legend's percentages
  // add to a hundred across the whole strip rather than within each half.
  const scale = owned.totalRM + owned.owedRM || 1

  // Debts share one colour because they are one thing; the fade only separates
  // them from each other, largest first. The step shrinks past three because a
  // fixed 0.25 hit opacity 0 on the fifth debt and drew it as nothing at all.
  const fade = Math.min(0.25, 0.6 / Math.max(owned.liabilities.length - 1, 1))

  // Folding now happens in totalOwned(), so the strip and the allocation donut
  // cannot disagree about which accounts are too small to draw — or about what
  // colour the ones that survive get.
  const segments = [
    ...owned.parts.map(p => ({
      key: `own:${p.key}`,
      name: p.name,
      value: p.value,
      color: p.color,
      dim: 1,
      owed: false,
      share: p.value / scale,
      detail: p.detail,
    })),
    ...owned.liabilities.map((l, i) => ({
      key: `owe:${l.key}`,
      name: l.name,
      value: l.value,
      color: 'var(--loss)',
      dim: 1 - i * fade,
      owed: true,
      share: l.value / scale,
    })),
  ]
  return (
    <div className="border-hairline -mx-[clamp(14px,2.4vw,28px)] -mt-5 mb-5 border-b px-[clamp(14px,2.4vw,28px)] pt-5 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
        <div className="min-w-[300px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{owes ? 'Net worth' : 'Everything you own'}</span>
            {owes ? (
              <Badge
                variant="neutral"
                className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
              >
                excluding property &amp; vehicle
              </Badge>
            ) : null}
          </div>
          <div
            className={`num mt-1.5 text-[clamp(28px,3.4vw,40px)] leading-none font-semibold tracking-[-0.03em] ${
              owes && owned.netRM < 0 ? 'text-loss' : ''
            }`}
          >
            {fmt(owes ? owned.netRM : owned.totalRM, 'MYR')}
          </div>
          <p className="text-faint mt-2 text-[11.5px]">
            {owes ? (
              <>
                <span className="num">{fmtCompact(owned.totalRM, 'MYR')}</span> owned less{' '}
                <span className="num">{fmtCompact(owned.owedRM, 'MYR')}</span> owed · the loans are
                counted, the things they bought are not
              </>
            ) : (
              <>
                <span className="num">{pct0(owned.outsideSharePct)}</span> of it sits outside moomoo ·
                nothing you owe is counted here
              </>
            )}
          </p>
        </div>

        {/* One track, not two.
            The bars used to be drawn separately and each scaled against the
            larger side, which meant moomoo filled its bar and read "100%" while
            sitting beside a longer red one — 100% of what you own, printed next
            to nearly twice as much debt. Two scales, two legends, and the reader
            left to hold them against each other.
            Now everything shares a denominator: owned and owed on the same
            track, so a length is a length wherever it appears, and every
            percentage is a share of the same whole. */}
        <div className="min-w-[280px] flex-1">
          <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
            {segments.map(seg => (
              <div
                key={seg.key}
                className="h-3 first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${seg.share * 100}%`,
                  background: seg.color,
                  opacity: seg.dim,
                }}
                title={`${seg.name} ${fmtCompact(seg.value, 'MYR')}${seg.detail ? ` — ${seg.detail}` : ''}`}
              />
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
            {segments.map(seg => (
              <div key={seg.key} className="flex items-baseline gap-2 text-[12.5px]">
                <span
                  className="size-[9px] shrink-0 translate-y-px rounded-full"
                  style={{ background: seg.color, opacity: seg.dim }}
                />
                <span className="truncate">{seg.name}</span>
                <span className={`num ${seg.owed ? 'text-loss' : 'text-muted-foreground'}`}>
                  {seg.owed ? '−' : ''}
                  {fmtCompact(seg.value, 'MYR')}
                </span>
                <span className="num text-faint text-[11px]">{pct0(seg.share * 100)}</span>
              </div>
            ))}
          </div>

          {owes ? (
            <p className="text-faint mt-2.5 text-[11.5px]">
              Owned and owed share one scale, so the lengths compare directly.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { state } = useVantage()
  const owned = useMemo(() => netWorth(state), [state])

  return (
    <>
      {owned.assetsRM > 0 || owned.owedRM > 0 ? <OwnedStrip owned={owned} /> : null}
      <DashboardBody />
    </>
  )
}
