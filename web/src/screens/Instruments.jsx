/**
 * Instruments — what each holding actually is, one card per instrument.
 *
 * Everything here comes from moomoo's get_market_snapshot (the `trust_*` fields),
 * stored in fund_metrics and refreshed by each sync. Yahoo was the obvious
 * alternative for fund profiles, but it returns nothing at all for ETCO, and its
 * topHoldings for these funds is a single money-market line — they are synthetic
 * option-income ETFs holding cash and options, not a basket of stocks. So there
 * is no portfolio breakdown to show, and the card does not pretend otherwise.
 *
 * The screen leads with ONE comparison: the yield moomoo quotes against what the
 * fund has actually put in your pocket. moomoo annualises a recent distribution,
 * which for MSTY reads 180% — beside a real 10% returned on cost. Those two
 * numbers were adjacent stats of equal weight before, which understated the gap
 * to the point of being misleading. Everything else on the card is detail.
 *
 * Declarations are charted rather than listed. The list was eight numbers and a
 * trend percentage; the chart is forty and shows the decay these funds are
 * living through, which is the single most decision-relevant fact about them.
 * A marker shows where your money entered a schedule already in progress.
 *
 * The comparison table is the navigation and exactly one card is open beneath it.
 * The table carries every fund's headline figures, so nothing is lost by keeping
 * the detail to one — and the card is tall enough that stacking three of them
 * turned the page into scrolling rather than reading.
 *
 * It opens on the largest holding rather than the top row: the table ranks by what
 * each fund has really returned, which is the right order to READ but not the one
 * that says which position matters most to the account.
 *
 * Sold-out instruments are hidden by default and available behind a toggle. The
 * sync only refreshes fund figures and declaration schedules for what is held, so
 * a closed card carries income history and nothing else — it says so rather than
 * showing a row of dashes.
 */

import { useMemo, useState } from 'react'

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { PlusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { useVantage } from '@/lib/store'
import { declarationTrend, instrumentRows, slotColor, slotOf } from '@/lib/calc'
import { dfmtAxis, dfmtLong, dtfmt, fmt, fq, monthYear, pct1, pctS } from '@/lib/format'

/** Declarations charted per fund. Forty covers roughly a year of a weekly payer. */
const CHARTED = 40
/** Declarations averaged on each side of the payout-trend comparison. */
const TREND_WINDOW = 4

/** Fund sizes span $4m to $924m here, so a fixed unit would read badly. */
function money(v, cur) {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${cur === 'USD' ? '$' : 'RM '}${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${cur === 'USD' ? '$' : 'RM '}${(v / 1e6).toFixed(1)}M`
  return fmt(v, cur)
}

function Stat({ label, value, tone = '', hint }) {
  const body = (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`num mt-0.5 text-[14px] font-semibold ${tone}`}>{value}</div>
    </div>
  )
  if (!hint) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">{body}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[250px]">{hint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Every fund on one row each, so "which of these is actually doing best?" can be
 * answered by looking rather than by scrolling between cards and remembering.
 *
 * Sorted by what each has really returned, not by the quoted yield — ordering by
 * the projection would rank them by the least trustworthy number on the screen.
 */
function Compare({ rows, state, selected, onSelect }) {
  if (rows.length < 2) return null
  const ranked = [...rows].sort((a, b) => (b.returnedPct ?? -1) - (a.returnedPct ?? -1))

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-muted-foreground [&>th]:bg-card [&>th]:h-8 [&>th]:px-3 [&>th]:text-right [&>th]:text-[10.5px] [&>th]:font-semibold [&>th]:tracking-[0.09em] [&>th]:whitespace-nowrap [&>th]:uppercase [&>th]:shadow-[inset_0_-1px_0_var(--border)]">
              <th className="!text-left">Fund</th>
              <th>Quoted yield</th>
              <th>Really returned</th>
              <th>Paid you (net)</th>
              <th>Per share trend</th>
              <th>Price vs NAV</th>
              <th>Fund size</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(r => {
              const trend = declarationTrend(r.declarations, TREND_WINDOW)
              const m = r.metrics
              return (
                <tr
                  key={r.ticker}
                  // A row is a control, so it has to answer to the keyboard too —
                  // this table is the only way to reach a single fund's card.
                  role="button"
                  tabIndex={0}
                  // Selecting, not toggling: one card is always open, so a second
                  // click on the open row has nothing to fall back to.
                  aria-current={selected === r.ticker ? 'true' : undefined}
                  onClick={() => onSelect(r.ticker)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    onSelect(r.ticker)
                  }}
                  className={`border-hairline hover:bg-muted/50 focus-visible:ring-ring cursor-pointer border-b outline-none last:border-0 focus-visible:ring-2 focus-visible:ring-inset ${
                    selected === r.ticker ? 'bg-muted/60' : ''
                  }`}
                >
                  <td
                    className="px-3 py-2 whitespace-nowrap"
                    style={
                      selected === r.ticker
                        ? { boxShadow: `inset 2px 0 0 ${slotColor(slotOf(state, r.ticker))}` }
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-[7px] shrink-0 rounded-full"
                        style={{ background: slotColor(slotOf(state, r.ticker)) }}
                      />
                      <span className="font-semibold">{r.ticker}</span>
                      {r.closed ? (
                        <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                          sold
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="num text-cash px-3 py-2 text-right">
                    {m && m.dividend_yield != null ? pct1(m.dividend_yield) : '—'}
                  </td>
                  <td className="num text-gain px-3 py-2 text-right font-semibold">
                    {r.returnedPct == null ? '—' : pct1(r.returnedPct)}
                  </td>
                  <td className="num text-gain px-3 py-2 text-right">{fmt(r.net, r.cur)}</td>
                  <td className={`num px-3 py-2 text-right ${trend == null ? 'text-faint' : trend < 0 ? 'text-loss' : 'text-gain'}`}>
                    {trend == null ? '—' : pctS(trend)}
                  </td>
                  <td className={`num px-3 py-2 text-right ${m && m.premium > 0 ? 'text-loss' : 'text-gain'}`}>
                    {m && m.premium != null ? pctS(m.premium) : '—'}
                  </td>
                  <td className="num text-muted-foreground px-3 py-2 text-right">
                    {m ? money(m.aum, r.cur) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-faint border-hairline border-t px-3 py-2.5 text-[11.5px] leading-relaxed">
        Pick a row to open that fund below. Ordered by what each has really returned on cost, not by its quoted
        yield — that figure annualises one recent distribution and ranks these in almost the opposite order.
        Returned is cumulative since your first purchase, so a fund you have held longer has had longer to earn it.
      </p>
    </Card>
  )
}

function DeclarationTooltip({ active, payload, cur }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="border-hairline bg-popover rounded-md border px-2.5 py-1.5 text-[12px] shadow-md">
      <div className="num text-muted-foreground">{dfmtLong(d.ex_date)}</div>
      <div className="num font-semibold">{fmt(d.per_share, cur)} per share</div>
      {d.pending ? <div className="text-cash text-[11px]">not yet received</div> : null}
    </div>
  )
}

/**
 * Every declaration the fund has made, oldest to newest.
 *
 * This is the fund's schedule, not your account: it starts before you bought and
 * the marker says where you came in. For these funds that gap is the point — the
 * per-share rate they were paying when you looked is rarely the one you get.
 */
function DeclarationChart({ rows, cur, color, firstBought }) {
  const data = useMemo(() => [...rows].slice(0, CHARTED).reverse(), [rows])

  /**
   * Whether a tick has to carry its year.
   *
   * The label used to strip the year always, which is right for the funds this
   * screen was built around: a weekly payer's forty declarations are nine months
   * of one year, and "2026" on every tick is noise. It is wrong the moment a
   * fund pays twice a year — AAPL's forty declarations span two decades, and the
   * axis read "9 Feb … 10 Aug … 9 Feb … 10 Aug" with no way to tell 2008 from
   * 2024.
   *
   * So the axis answers to the data rather than to an assumption about it.
   */
  const spansYears = useMemo(() => {
    if (data.length < 2) return false
    return data[0].ex_date.slice(0, 4) !== data[data.length - 1].ex_date.slice(0, 4)
  }, [data])

  if (!data.length) return null

  // Only mark the entry when the fund was already declaring before it.
  const entryIndex = firstBought ? data.findIndex(d => d.ex_date >= firstBought) : -1
  const showEntry = entryIndex > 0

  return (
    <div className="h-[132px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap={1}>
          <XAxis
            dataKey="ex_date"
            tick={{ fontSize: 10, fill: 'var(--faint)' }}
            // The year appears only when the series needs it. Every fund here
            // does today, but a fund that has only ever declared inside one year
            // gains nothing from repeating it on every tick — which is what the
            // original strip-the-year formatter was right about.
            tickFormatter={v => (spansYears ? dfmtAxis(v) : dfmtLong(v).replace(/\s\d{4}$/, ''))}
            axisLine={false}
            tickLine={false}
            minTickGap={44}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--faint)' }}
            tickFormatter={v => (cur === 'USD' ? '$' : '') + v.toFixed(2)}
            axisLine={false}
            tickLine={false}
            width={54}
          />
          <ChartTooltip content={<DeclarationTooltip cur={cur} />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
          {showEntry ? (
            <ReferenceLine
              x={data[entryIndex].ex_date}
              stroke="var(--faint)"
              strokeDasharray="3 3"
              label={{ value: 'you bought', position: 'insideTopLeft', fontSize: 9.5, fill: 'var(--faint)' }}
            />
          ) : null}
          <Bar dataKey="per_share" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map(d => (
              <Cell key={d.ex_date} fill={color} fillOpacity={d.pending ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * The card's headline: the projection against the fact.
 *
 * moomoo's yield takes a recent distribution and annualises it. For a weekly payer
 * whose rate is falling that extrapolates hard — 180% for MSTY. Beside it sits what
 * the fund has actually paid you against what you paid for it. Same fund, both
 * numbers true, and the reader deserves to see them at the same size.
 */
function Headline({ row }) {
  const quoted = row.metrics && row.metrics.dividend_yield != null ? row.metrics.dividend_yield : null
  if (quoted == null && row.returnedPct == null) return null

  return (
    <div className="border-hairline flex flex-wrap items-end gap-x-10 gap-y-4 border-b pb-3.5">
      <div>
        <div className="eyebrow">Quoted yield</div>
        <div className="num text-cash mt-1 text-[30px] leading-none font-semibold tracking-[-0.02em]">
          {quoted == null ? '—' : pct1(quoted)}
        </div>
        <div className="text-faint mt-1.5 text-[11.5px]">moomoo&rsquo;s projection, annualised</div>
      </div>

      <div>
        <div className="eyebrow">Has really paid you</div>
        <div className="num text-gain mt-1 text-[30px] leading-none font-semibold tracking-[-0.02em]">
          {row.returnedPct == null ? '—' : pct1(row.returnedPct)}
        </div>
        <div className="text-faint mt-1.5 text-[11.5px]">
          {fmt(row.net, row.cur)} net on {fmt(row.invested, row.cur)} put in
          {row.firstBought ? ` since ${dfmtLong(row.firstBought)}` : ''}
        </div>
      </div>
    </div>
  )
}

function InstrumentCard({ row, state }) {
  const { instrument: i, pos, metrics: m, cur, gross, withheld, net, shareOfFund, payments, declarations } = row
  const color = slotColor(slotOf(state, i.ticker))
  const trend = declarationTrend(declarations, TREND_WINDOW)
  // The same window the chart draws, oldest first, so the caption's span and the
  // axis cannot disagree about which declarations are on screen.
  const charted = useMemo(() => [...declarations].slice(0, CHARTED).reverse(), [declarations])

  return (
    <Card className={`gap-3 ${row.closed ? 'opacity-80' : ''}`}>
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="size-[9px] shrink-0 translate-y-px rounded-full"
              style={{ background: color }}
            />
            <span className="text-[15px] font-bold">{i.ticker}</span>
            <span className="text-faint text-[10.5px] tracking-[0.05em]">{i.market}</span>
            {row.closed ? (
              <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                sold {row.soldOn ? dfmtLong(row.soldOn) : ''}
              </Badge>
            ) : null}
          </span>
          {m ? (
            <span className="text-faint text-[11px]">as of {dtfmt(m.fetched_at)}</span>
          ) : (
            <span className="text-faint text-[11px]">no fund data</span>
          )}
        </div>
        {i.name ? <p className="text-muted-foreground text-[12.5px]">{i.name}</p> : null}
      </CardHeader>

      <CardContent className="grid gap-3.5 px-4 pb-4">
        <Headline row={row} />

        {declarations.length ? (
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="eyebrow">Declared per share</span>
              {trend == null ? null : (
                <span className={`num text-[11.5px] ${trend < 0 ? 'text-loss' : 'text-gain'}`}>
                  {pctS(trend)} on the previous {TREND_WINDOW}
                </span>
              )}
            </div>
            <DeclarationChart rows={declarations} cur={cur} color={color} firstBought={row.firstBought} />
            <p className="text-faint text-[11px] leading-relaxed">
              The fund&rsquo;s own schedule, {declarations.length} on record
              {declarations.length > CHARTED ? `, most recent ${CHARTED} shown` : ''}
              {/* The span in words, because a bar chart can only label so many
                  ticks and the ends are what a reader checks first. */}
              {charted.length > 1
                ? ` — ${monthYear(charted[0].ex_date)} to ${monthYear(charted[charted.length - 1].ex_date)}`
                : ''}
              . A faded bar is dated after your last receipt, so it should still be on its way.
            </p>
          </div>
        ) : row.closed ? (
          <p className="text-faint text-[12px]">
            No declaration history — the sync only tracks schedules for funds you currently hold, so this stopped
            updating when you sold. What it paid you is still in History.
          </p>
        ) : (
          <p className="text-faint text-[12px]">No declarations synced yet.</p>
        )}

        {m ? (
          <div className="border-hairline grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
            <Stat label="Fund size" value={money(m.aum, cur)} />
            <Stat label="NAV / unit" value={m.nav == null ? '—' : fmt(m.nav, cur)} />
            <Stat
              label="Price vs NAV"
              value={m.premium == null ? '—' : pctS(m.premium)}
              tone={m.premium > 0 ? 'text-loss' : 'text-gain'}
              hint={
                m.premium == null
                  ? undefined
                  : m.premium > 0
                    ? 'Trading above the value of what the fund holds — you pay a premium to buy in.'
                    : 'Trading below the value of what the fund holds.'
              }
            />
            <Stat
              label="Units in issue"
              value={m.outstanding_units == null ? '—' : fq(Math.round(m.outstanding_units))}
            />
          </div>
        ) : null}

        <div className="border-hairline grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
          <Stat label="Paid you (gross)" value={fmt(gross, cur)} tone="text-cash" />
          <Stat
            label="Withheld"
            value={withheld > 0 ? fmt(withheld, cur) : '—'}
            tone={withheld > 0 ? 'text-loss' : ''}
            hint="FATCA withholding on a US distribution, booked by moomoo as a separate charge."
          />
          <Stat label="Net to you" value={fmt(net, cur)} tone="text-gain" />
          <Stat label="Payments" value={fq(payments)} />
        </div>

        {pos ? (
          <div className="border-hairline grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
            <Stat label="You hold" value={fq(pos.qty)} />
            <Stat label="Worth" value={fmt(pos.val, cur)} />
            <Stat label="Avg cost" value={fmt(pos.avg, cur)} />
            <Stat
              label="Share of fund"
              value={shareOfFund == null ? '—' : `${shareOfFund < 0.01 ? '<0.01' : shareOfFund.toFixed(3)}%`}
              tone={shareOfFund != null && shareOfFund >= 0.1 ? 'text-cash' : ''}
              hint="Your holding as a slice of the whole vehicle. A large share of a small fund is worth knowing about — it affects how easily you could sell, and how exposed you are if the fund closes."
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Instruments() {
  const { state, openInstrument } = useVantage()
  const [showClosed, setShowClosed] = useState(false)
  const [selected, setSelected] = useState(null)

  const held = useMemo(() => instrumentRows(state), [state])
  const all = useMemo(() => instrumentRows(state, { includeClosed: true }), [state])
  const closedCount = all.length - held.length
  const rows = showClosed ? all : held
  // Exactly one card, always. instrumentRows() sorts held-largest-first, so row 0
  // is the biggest position — the right thing to land on. A selection pointing at a
  // fund that is no longer listed (sold positions hidden again) falls back to it.
  const open = rows.find(r => r.ticker === selected) || rows[0]

  if (!held.length && !all.length) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-12 text-center">
          Nothing held right now — this screen lists what you currently own. Sync from OpenD, or
          add one yourself and log a BUY under Positions.
          <div>
            <Button size="sm" className="mt-4" onClick={openInstrument}>
              <PlusIcon />
              Add instrument
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3.5">
      {/* Adding an instrument belongs on the screen that lists them, not in the
          top bar where it sat beside Sync and Prices — those act on everything
          at once from anywhere, this one adds a row to this list. */}
      <div className="flex justify-end">
        <Button size="sm" onClick={openInstrument}>
          <PlusIcon />
          Add instrument
        </Button>
      </div>

      <Compare rows={rows} state={state} selected={open ? open.ticker : null} onSelect={setSelected} />

      {closedCount > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Button variant="outline" size="sm" onClick={() => setShowClosed(v => !v)}>
            {showClosed ? 'Hide' : 'Show'} {closedCount} sold position{closedCount === 1 ? '' : 's'}
          </Button>
          {showClosed ? (
            <span className="text-faint text-[11.5px]">
              Fund figures and schedules stopped updating when you sold — income history is all that survives.
            </span>
          ) : null}
        </div>
      ) : null}

      {open ? <InstrumentCard key={open.ticker} row={open} state={state} /> : null}

      <p className="text-faint text-[11.5px] leading-relaxed">
        Fund figures come from moomoo and refresh with each sync. There is no holdings breakdown because these are
        option-income ETFs — they hold cash and option positions against a single underlying rather than a
        portfolio of stocks, so there is nothing to break down.
      </p>
    </div>
  )
}
