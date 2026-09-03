/**
 * Calendar — the activity month grid.
 *
 * Monday-first, ‹ › navigation, coloured marks per day and the money that moved.
 * Selecting a day opens the detail below it; changing month clears the selection.
 *
 * It runs FORWARD as well as back. These funds pay weekly and the whole point of
 * holding them is knowing when — a calendar that stopped at today was the one
 * screen that could answer "when do I next get paid" and did not.
 *
 * Two kinds of future payment, never drawn alike. A DECLARED one is the fund's
 * published rate times your shares: solid mark, figure in full. A PROJECTED one is
 * the fund's rhythm priced at recent averages, and those averages are falling 24-32%
 * a quarter — so it is faded and marked with ≈. Dressing a guess as a commitment on
 * a calendar is how someone comes to spend against it.
 *
 * Dividends have their own colour. They used to share amber with deposits and
 * withholding, and the only figure a day ever showed was what was SPENT, which for
 * an income tracker had it exactly backwards.
 *
 * It opens on today, so the screen answers "what is happening now" before anything
 * is clicked. Landing on a month with the detail pane empty made the most useful
 * day the one you had to go and find. Moving to another month clears the selection
 * — there is no "today" there — and coming back restores it.
 *
 * A day with nothing recorded and nothing due renders no detail card at all, so
 * the default selection cannot leave an empty panel sitting under the grid.
 *
 * The month and the selected day are local component state on purpose — the
 * store holds the world, not where the owner happens to be looking.
 */

import { useMemo, useState } from 'react'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from 'lucide-react'
import { Bar, BarChart, LabelList, ReferenceArea, ResponsiveContainer, XAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import {
  annualIncome,
  calendarByDay,
  calendarDayCards,
  dayBuyRM,
  dayDivRM,
  incomeMonths,
  moneyByDay,
  moneyMonthTotals,
  monthGrid,
  monthSummary,
  outlookByDay,
  slotColor,
  slotOf,
} from '@/lib/calc'
import { compact, fmt, fmtS, fq, monthLabel } from '@/lib/format'
import { useVantage } from '@/lib/store'
import { cn } from '@/lib/utils'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Chip colour for a row in the day detail — same semantics as the marks. */
const chipVariant = side =>
  side === 'BUY' ? 'gain' : side === 'SELL' ? 'loss' : side === 'DIV' || side === 'DIVIDEND' ? 'cash' : 'neutral'

/**
 * The cash effect of one calendar row, in its own currency.
 * Ported from the legacy day-detail table: BUY/SELL show the notional at
 * qty × price (fees are NOT included here, unlike the History feed), a DIV
 * shows `amount ?? price`, and a cash row shows its amount, out for
 * WITHDRAW / FEE and in for the rest.
 */
function cashEffect(r) {
  if (!r.ticker) {
    const out = r.side === 'WITHDRAW' || r.side === 'FEE'
    return { dir: out ? -1 : 1, value: r.amount || 0 }
  }
  if (r.side === 'DIV') return { dir: 1, value: (r.amount ?? r.price) || 0 }
  return { dir: r.side === 'BUY' ? -1 : 1, value: r.qty * r.price }
}

function LegendDot({ className, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', className)} />
      {children}
    </span>
  )
}

/** Cards shown before the rest collapse into a count. The day detail below the
 *  grid is the full list; a cell is a preview, and a tall cell breaks the grid. */
const CARDS = 3

/** Tone by what the card is: income and sales in, buys and charges out. */
const cardTone = kind =>
  kind === 'income' || kind === 'sell'
    ? 'text-gain'
    : kind === 'buy' || kind === 'tax'
      ? 'text-loss'
      : 'text-muted-foreground'

/**
 * One entry in a day cell.
 *
 * `settled` separates what the broker has booked from what it merely owes: a tick
 * against money that arrived, a clock against money that has not. Faded and dashed
 * for the second, because a calendar that draws them alike is one you plan against.
 */
function DayCard({ state, ticker, name, label, amount, currency, dir, count, kind, settled = true }) {
  return (
    <div
      className={cn(
        'border-hairline rounded-[4px] border px-1.5 py-[3px]',
        settled ? 'bg-background/60' : 'border-dashed opacity-80',
      )}
      title={[name, count > 1 ? `${count} fills` : null].filter(Boolean).join(' · ')}
    >
      <div className="flex items-center gap-1">
        {ticker ? (
          <span
            aria-hidden="true"
            className="size-[6px] shrink-0 rounded-full"
            style={{ background: slotColor(slotOf(state, ticker)) }}
          />
        ) : null}
        <span className="truncate text-[10px] font-semibold">{ticker || label}</span>
        {kind === 'tax' ? <span className="text-faint shrink-0 text-[9px]">tax</span> : null}
        {kind === 'income' ? (
          settled ? (
            <CheckIcon aria-hidden="true" className="text-gain ml-auto size-2.5 shrink-0" />
          ) : (
            <ClockIcon aria-hidden="true" className="text-cash ml-auto size-2.5 shrink-0" />
          )
        ) : null}
      </div>
      <div className={cn('num text-[10.5px] font-semibold', settled ? cardTone(kind) : 'text-cash')}>
        {settled ? fmtS(dir * Math.abs(amount), currency) : `≈ ${fmt(amount, currency)}`}
      </div>
    </div>
  )
}

function DayCell({ state, day, cards, incomeRM, due, money, selected, isToday, onSelect }) {
  const base = 'relative flex min-h-[104px] flex-col gap-1 rounded-sm border p-1.5 text-left transition-colors'
  const dueCards = due
    ? due.parts.map((x, i) => ({
        key: `due${i}`,
        ticker: x.ticker,
        amount: x.native ?? x.amount,
        currency: x.currency || 'MYR',
        dir: 1,
        kind: 'income',
        settled: false,
      }))
    : []
  const all = [...cards, ...dueCards]

  // Money events get a pair of bars rather than cards: a day can carry a salary,
  // two instalments and a card due, and four more cards would bury the trades
  // this grid was built to show.
  const moneyIn = (money || []).filter(e => e.dir > 0).reduce((s, e) => s + (e.amount || 0), 0)
  const moneyOut = (money || []).filter(e => e.dir < 0).reduce((s, e) => s + (e.amount || 0), 0)
  const hasMoney = Boolean(money && money.length)

  const moneyMarks = hasMoney ? (
    <div className="mt-auto flex items-center gap-1 pt-1">
      {moneyIn > 0 ? <span className="bg-gain h-1 flex-1 rounded-full" title={`In ${moneyIn.toFixed(2)}`} /> : null}
      {moneyOut > 0 ? <span className="bg-loss h-1 flex-1 rounded-full" title={`Out ${moneyOut.toFixed(2)}`} /> : null}
      {moneyIn === 0 && moneyOut === 0 ? (
        <span className="bg-muted-foreground/40 h-1 flex-1 rounded-full" title="Recorded, but no money moved" />
      ) : null}
    </div>
  ) : null

  if (!all.length && !hasMoney) {
    return (
      <div className={cn(base, 'border-hairline text-muted-foreground')}>
        <span className={cn('num text-[11.5px]', isToday && 'text-primary font-semibold')}>{day}</span>
      </div>
    )
  }

  if (!all.length) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${day} — money only`}
        className={cn(
          base,
          'hover:border-primary focus-visible:ring-ring/50 border-border cursor-pointer outline-none focus-visible:ring-[3px]',
          selected && 'border-primary ring-primary/60 ring-1',
        )}
      >
        <span className={cn('num text-[11.5px]', isToday ? 'text-primary font-semibold' : 'text-foreground')}>
          {day}
        </span>
        {moneyMarks}
      </button>
    )
  }

  const shown = all.slice(0, CARDS)
  const extra = all.length - shown.length

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${day} — ${all.length} ${all.length === 1 ? 'entry' : 'entries'}`}
      className={cn(
        base,
        'bg-muted/30 hover:border-primary focus-visible:ring-ring/50 cursor-pointer border-border outline-none focus-visible:ring-[3px]',
        !cards.length && due && 'bg-transparent border-dashed',
        selected && 'border-primary ring-primary/60 ring-1',
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('num text-[11.5px]', isToday ? 'text-primary font-semibold' : 'text-foreground')}>
          {day}
        </span>
        {/* Exact, not compact(). These are the same figures the detail card and
            the next-up card show, and rounding one of the three to the nearest
            ringgit made RM 147.70 read as 148 in the grid and 147.70 everywhere
            else — the kind of disagreement that makes a reader distrust all
            three. `truncate` handles the rare day too wide for the cell. */}
        {incomeRM > 0 ? (
          <span className="num text-gain truncate text-[10px] font-semibold">
            {fmtS(incomeRM, 'MYR')}
          </span>
        ) : due ? (
          <span className="num text-cash truncate text-[10px] font-semibold">
            {due.declared ? '' : '≈ '}
            {fmt(due.total, 'MYR')}
          </span>
        ) : null}
      </div>

      <div className="grid gap-1">
        {shown.map(({ key, ...c }) => (
          <DayCard key={key} state={state} {...c} />
        ))}
        {extra > 0 ? <span className="text-faint text-[9.5px]">+{extra} more</span> : null}
      </div>
    </button>
  )
}

/**
 * Salary in and instalments out, on the day they land.
 *
 * A SEPARATE BLOCK from the dividend rows above, and separate in calc.js too: a
 * rent payment has no ticker, quantity or price, and folding it into the broker
 * table would mean a row of dashes with a name in it.
 *
 * Three states, drawn differently because the certainty differs:
 *   recorded   it happened — solid
 *   due        date and amount both known ahead — solid, quieter
 *   estimated  the date is known and the amount is not — dashed
 *
 * A reinvested distribution carries dir 0: it belongs on the day because it
 * happened, but it moved no money you could spend, so it shows without a sign
 * and stays out of every total.
 */
function MoneyBlock({ events }) {
  if (!events || !events.length) return null
  return (
    <CardContent className="pb-0">
      <div className="border-hairline rounded-md border px-3 py-2.5">
        <span className="eyebrow">Money</span>
        <div className="mt-1.5 grid gap-1">
          {events.map(e => {
            const flow = e.dir !== 0
            return (
              <div key={e.key} className="grid gap-0.5">
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold">{e.label}</span>
                    {e.state !== 'recorded' ? (
                      <span className="text-faint text-[10.5px] tracking-[0.06em] uppercase">
                        {e.state === 'due' ? 'due' : 'expected'}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'num shrink-0',
                      !flow ? 'text-muted-foreground' : e.dir > 0 ? 'text-gain' : 'text-loss',
                      e.state === 'estimated' && 'opacity-80',
                    )}
                  >
                    {e.amount == null
                      ? '—'
                      : `${e.state === 'estimated' ? '≈ ' : ''}${flow ? (e.dir > 0 ? '+' : '−') : ''}${fmt(e.amount, 'MYR')}`}
                  </span>
                </div>
                {e.note ? <p className="text-faint text-[11px] leading-relaxed">{e.note}</p> : null}
              </div>
            )
          })}
        </div>
      </div>
    </CardContent>
  )
}

function DayDetail({ label, rows, buyRM, due, money }) {
  return (
    <Card className="mt-3.5 gap-3">
      <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-0">
        <p className="eyebrow">{label}</p>
        {buyRM > 0 ? (
          <p className="text-faint text-[11.5px]">
            Into the market <span className="num text-foreground">{fmt(buyRM, 'MYR')}</span>
          </p>
        ) : null}
      </CardContent>

      {due ? (
        <CardContent className="pb-0">
          <div className="border-hairline rounded-md border border-dashed px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="eyebrow">{due.declared ? 'Declared, not yet paid' : 'Expected'}</span>
              <span className={cn('num text-[14px] font-semibold', due.declared ? 'text-cash' : 'text-faint')}>
                {due.declared ? '' : '≈ '}
                {fmt(due.total, 'MYR')}
              </span>
            </div>
            <div className="mt-1.5 grid gap-0.5">
              {due.parts.map((part, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="font-semibold">{part.ticker}</span>
                  <span className="num text-muted-foreground">
                    {part.declared ? '' : '≈ '}
                    {fmt(part.amount, 'MYR')}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-faint mt-2 text-[11px] leading-relaxed">
              {due.declared
                ? 'The fund has published its rate per share, so this is arithmetic on what you hold. Only the exact day can move — moomoo books it at clearing, which can lag the payment.'
                : 'Projected from this fund’s own payment rhythm at the average of its recent rates. Those rates are falling, so read the amount as a direction and the date as the reliable half.'}
            </p>
          </div>
        </CardContent>
      ) : null}

      <MoneyBlock events={money} />

      {rows.length ? (
      <CardContent className="px-1.5">
        <Table>
          <TableBody>
            {rows.map((r, i) => {
              const { dir, value } = cashEffect(r)
              const cur = r.currency || 'MYR'
              const gain = r.side === 'DIV' || r.side === 'DIVIDEND' || r.side === 'DEPOSIT'
              const drain = r.side === 'WITHDRAW' || r.side === 'FEE'
              return (
                <TableRow key={`${r.side}-${r.id ?? 'x'}-${i}`}>
                  <TableCell className="w-[86px]">
                    <Badge
                      variant={chipVariant(r.side)}
                      className="num text-[10.5px] font-semibold tracking-[0.06em]"
                    >
                      {r.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {r.ticker ?? <span className="font-normal">Wallet</span>}
                    {r.ticker ? null : <span className="num text-faint ml-1.5 font-normal">{cur}</span>}
                  </TableCell>
                  <TableCell className="num text-muted-foreground text-right">
                    {r.qty ? `${fq(r.qty)} @ ${fmt(r.price, cur)}` : ''}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'num w-[128px] text-right',
                      gain && 'text-gain',
                      drain && 'text-loss',
                    )}
                  >
                    {fmtS(dir * Math.abs(value), cur)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
      ) : null}
    </Card>
  )
}

/**
 * Income by month, either side of today.
 *
 * Paid is solid, expected is hatched, and the current month carries BOTH — it is
 * part-received and part-projected, which a single bar with a flag could not say.
 * The hatch is the same device the dashboard's income curve uses for the same
 * distinction, so the two screens do not teach contradictory visual grammar.
 */
/**
 * The run rate, beside the chart that shows how it was arrived at.
 *
 * The headline is a PROJECTION — twelve months of each fund's own rhythm priced at
 * its recent rates — so the fact sits directly under it rather than in a tooltip:
 * what these holdings have actually paid. Monthly and daily are that projection
 * divided down, which is the only honest reading of them; they are not an average
 * of anything that happened.
 */
function AnnualIncome({ data }) {
  if (!data.projected && !data.paid) return null

  return (
    <Card className="gap-0 py-4">
      <CardContent className="grid gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">Annual income</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-faint cursor-default text-[11px]">(projected)</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                Twelve months forward, from each fund&rsquo;s own payment rhythm priced at the average of its
                recent distributions. Those per-share rates have been falling 24–32% a quarter, so this reads
                high more often than low. The figure below it is what has actually been paid.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="num text-cash mt-1.5 text-[27px] leading-none font-semibold tracking-[-0.02em]">
            {fmt(data.projected, 'MYR')}
          </div>
          <div className="text-faint mt-1.5 text-[11.5px]">
            <b className="num text-gain font-semibold">{fmt(data.paid, 'MYR')}</b> actually paid so far
          </div>
        </div>

        <div className="border-hairline grid gap-0.5 rounded-md border p-2.5">
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-muted-foreground">Monthly</span>
            <span className="num font-semibold">{fmt(data.monthly, 'MYR')}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-muted-foreground">Daily</span>
            <span className="num font-semibold">{fmt(data.daily, 'MYR')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MonthBars({ rows, onPick }) {
  const total = rows.reduce((sum, r) => sum + r.paid + r.due, 0)
  if (!total) return null
  const now = rows.find(r => r.current)

  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="eyebrow">Income by month</p>
        <span className="text-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-cash size-2 rounded-[2px]" /> paid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-cash size-2 rounded-[2px] opacity-40" /> expected
          </span>
        </span>
      </CardContent>
      <CardContent className="h-[168px] px-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 20, right: 6, bottom: 0, left: 6 }} barCategoryGap="28%">
            <defs>
              <pattern id="monthHatch" width="6" height="6" patternTransform="rotate(115)" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="var(--cash)" fillOpacity="0.18" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--cash)" strokeWidth="2.5" strokeOpacity="0.55" />
              </pattern>
            </defs>
            {now ? (
              <ReferenceArea
                x1={now.label}
                x2={now.label}
                fill="var(--muted-foreground)"
                fillOpacity={0.12}
                ifOverflow="extendDomain"
              />
            ) : null}
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="paid" stackId="m" fill="var(--cash)" radius={[0, 0, 0, 0]} isAnimationActive={false}
              onClick={(_, i) => onPick(rows[i])} className="cursor-pointer" />
            <Bar dataKey="due" stackId="m" fill="url(#monthHatch)" radius={[3, 3, 0, 0]} isAnimationActive={false}
              onClick={(_, i) => onPick(rows[i])} className="cursor-pointer">
              <LabelList
                position="top"
                offset={7}
                fontSize={10.5}
                fill="var(--muted-foreground)"
                formatter={(_, entry) => {
                  const r = entry && entry.payload
                  if (!r) return ''
                  const sum = r.paid + r.due
                  return sum ? `RM ${compact(sum)}` : ''
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
      <CardContent>
        <p className="text-faint text-[11px] leading-relaxed">
          Pick a bar to jump to that month. Expected covers what the funds have declared and still owe plus what
          their own rhythm projects at recent rates — those rates have been falling, so the hatched half reads high
          more often than low.
        </p>
      </CardContent>
    </Card>
  )
}

export default function Calendar() {
  const { state } = useVantage()
  const now = new Date()
  // Defaults to the month the owner is living in; navigation is local state.
  const [{ y, m }, setMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [selDay, setSelDay] = useState(() => new Date().getDate())

  const byDay = useMemo(() => calendarByDay(state, y, m), [state, y, m])
  const dueByDay = useMemo(() => outlookByDay(state, y, m), [state, y, m])
  // Salary, instalments and savings movements — kept apart from the broker
  // rows above all the way from calc.js, because none of them is a trade.
  const moneyDays = useMemo(() => moneyByDay(state, y, m), [state, y, m])
  const moneyTotals = useMemo(() => moneyMonthTotals(state, y, m), [state, y, m])
  const cardsByDay = useMemo(() => {
    const out = {}
    for (const [d, rows] of Object.entries(byDay)) out[d] = calendarDayCards(state, rows)
    return out
  }, [state, byDay])
  const months = useMemo(() => incomeMonths(state), [state])
  const annual = useMemo(() => annualIncome(state), [state])
  const summary = useMemo(() => monthSummary(state, y, m), [state, y, m])
  const { leading, days } = useMemo(() => monthGrid(y, m), [y, m])
  const dueTotal = Object.values(dueByDay).reduce((sum, d) => sum + d.total, 0)
  const declaredTotal = Object.values(dueByDay)
    .filter(d => d.declared)
    .reduce((sum, d) => sum + d.total, 0)

  const label = monthLabel(y, m)
  const thisMonth = y === now.getFullYear() && m === now.getMonth()
  const todayDate = thisMonth ? now.getDate() : null
  const active = Object.keys(byDay).length

  /** Step a month, wrapping the year. Lands on today whenever the month has one. */
  const move = n => {
    const next = new Date(y, m + n, 1)
    const ny = next.getFullYear()
    const nm = next.getMonth()
    setMonth({ y: ny, m: nm })
    setSelDay(ny === now.getFullYear() && nm === now.getMonth() ? now.getDate() : null)
  }

  const goToday = () => {
    setMonth({ y: now.getFullYear(), m: now.getMonth() })
    setSelDay(now.getDate())
  }

  const selRows = selDay ? byDay[selDay] || [] : null
  const selMoney = selDay ? moneyDays[selDay] || [] : null
  const selDue = selDay ? dueByDay[selDay] : null

  const pickMonth = r => {
    setMonth({ y: r.y, m: r.m })
    setSelDay(r.current ? now.getDate() : null)
  }

  return (
    <div>
      {/* Run rate and the year either side of today, before the month itself —
          the calendar answers "when", these answer "how much". */}
      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[minmax(230px,290px)_minmax(0,1fr)]">
        <AnnualIncome data={annual} />
        <MonthBars rows={months} onPick={pickMonth} />
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Previous month">
              <ChevronLeftIcon />
            </Button>
            <h3 className="num min-w-[150px] text-center text-[15px] font-semibold">{label}</h3>
            <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Next month">
              <ChevronRightIcon />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday} disabled={thisMonth}>
              Today
            </Button>
            <div className="text-faint ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
              <LegendDot className="bg-gain">buy</LegendDot>
              <LegendDot className="bg-loss">sell</LegendDot>
              <LegendDot className="bg-cash">dividend</LegendDot>
              <LegendDot className="bg-muted-foreground">wallet</LegendDot>
              <LegendDot className="bg-cash opacity-40">expected</LegendDot>
            </div>
          </div>

          {summary.received > 0 || summary.intoMarket > 0 || dueTotal > 0 ? (
            <div className="border-hairline flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y py-2.5">
              {summary.received > 0 ? (
                <span className="text-muted-foreground text-[12.5px]">
                  Received <b className="num text-gain font-semibold">{fmt(summary.received, 'MYR')}</b>
                  {summary.withheld > 0 ? (
                    <span className="text-faint"> after {fmt(summary.withheld, 'MYR')} withheld</span>
                  ) : null}
                </span>
              ) : null}
              {dueTotal > 0 ? (
                <span className="text-muted-foreground text-[12.5px]">
                  Still due <b className="num text-cash font-semibold">{fmt(dueTotal, 'MYR')}</b>
                  <span className="text-faint">
                    {declaredTotal > 0
                      ? ` · ${fmt(declaredTotal, 'MYR')} declared, the rest projected`
                      : ' · all projected'}
                  </span>
                </span>
              ) : null}
              {summary.intoMarket > 0 ? (
                <span className="text-muted-foreground text-[12.5px]">
                  Into the market <b className="num text-foreground font-semibold">{fmt(summary.intoMarket, 'MYR')}</b>
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-7 gap-1">
            {DOW.map(d => (
              <div
                key={d}
                className="text-faint py-1 text-center text-[10px] font-semibold tracking-[0.08em] uppercase"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: leading }, (_, i) => (
              <div key={`pad${i}`} className="border-hairline min-h-[68px] rounded-sm border opacity-35" />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1
              const rows = byDay[d]
              return (
                <DayCell
                  key={d}
                  state={state}
                  day={d}
                  cards={cardsByDay[d] || []}
                  incomeRM={rows ? dayDivRM(state, rows) : 0}
                  due={dueByDay[d]}
                  money={moneyDays[d]}
                  selected={selDay === d}
                  isToday={todayDate === d}
                  onSelect={() => setSelDay(p => (p === d ? null : d))}
                />
              )
            })}
          </div>

          {active || dueTotal > 0 ? (
            <p className="text-faint text-[11.5px]">
              {active ? `${active} ${active === 1 ? 'day' : 'days'} with activity` : 'Nothing recorded yet'}
              {dueTotal > 0
                ? ` · ${Object.keys(dueByDay).length} payout ${Object.keys(dueByDay).length === 1 ? 'day' : 'days'} ahead`
                : ''}{' '}
              · pick a day for the detail
            </p>
          ) : (
            <p className="text-faint text-[11.5px]">Nothing recorded in {label}.</p>
          )}

          {/* The money layer gets its own line rather than being folded into the
              activity count above: those are trades, these are wages and bills,
              and one sentence covering both would have to be vague to be true. */}
          {moneyTotals.inRM > 0 || moneyTotals.outRM > 0 ? (
            <p className="text-faint text-[11.5px]">
              In <span className="num text-gain">{fmt(moneyTotals.inRM, 'MYR')}</span> · out{' '}
              <span className="num text-loss">{fmt(moneyTotals.outRM, 'MYR')}</span> ·{' '}
              <span className={cn('num', moneyTotals.netRM < 0 ? 'text-loss' : 'text-foreground')}>
                {moneyTotals.netRM < 0 ? '−' : '+'}
                {fmt(Math.abs(moneyTotals.netRM), 'MYR')}
              </span>{' '}
              across the month. Reinvested distributions are shown on their day but left out of
              this, since none of it was money you could spend.
            </p>
          ) : null}

          {moneyTotals.notes.length ? (
            <p className="text-faint text-[11.5px] leading-relaxed">
              Not on the grid, because nothing here is entitled to invent a date for them:{' '}
              {moneyTotals.notes.map((n, i) => (
                <span key={n.key}>
                  {i > 0 ? ' · ' : ''}
                  <span className="text-muted-foreground">{n.label}</span>{' '}
                  <span className="num">
                    {n.dir > 0 ? '+' : '−'}
                    {fmt(n.amount, 'MYR')}
                  </span>{' '}
                  <span className="text-faint">({n.why})</span>
                </span>
              ))}
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      {selRows && (selRows.length || selDue || (selMoney && selMoney.length)) ? (
        <DayDetail
          label={`${selDay} ${label}`}
          rows={selRows}
          buyRM={dayBuyRM(state, selRows)}
          due={selDue}
          money={selMoney}
        />
      ) : null}
    </div>
  )
}
