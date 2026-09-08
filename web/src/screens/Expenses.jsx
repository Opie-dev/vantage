/**
 * Expenses — inferred, never logged, and then checked against the log.
 *
 * ITS OWN SCREEN AGAIN. It was one, then a section of Money, and now one again —
 * see money-redesign-plan.md §3, which reverses 654ad24 deliberately. The
 * argument that consolidation was answering is still true and is what the
 * Overview column is for: "what was logged" and "what actually left the wallet"
 * are two halves of one sentence, so the coverage bar stayed on Overview beside
 * the measured statement rather than following the list here. This screen is the
 * itemised half; the half that checks it is one tab away — and reads the month
 * that is happening, while this screen alone can be looking at another.
 *
 * THE RECONCILIATION IS WHY THE LOG IS HONEST, AND IT LIVES ON OVERVIEW.
 * commitments-and-income-plan.md §2 argued against an expense log because one
 * gets abandoned and then silently under-reports. spendingFor() already infers
 * what left the wallets from balance readings, without anything being entered,
 * so the log is measured against it — on Overview, beside the measured statement
 * the coverage bar is checking.
 *
 * IT WAS ON THIS SCREEN TOO, AND WAS TAKEN OFF. The residual needs two readings
 * bracketing the month, so with the readings this app usually holds it rendered
 * on the month that is happening and on no other. That made it the one section
 * here that appeared and vanished as the reader clicked between months, on a
 * screen whose whole point is that a month is a month. expensesFor() still
 * computes it — nothing was removed from the derivation, only from this page.
 *
 * EVERY COMPARISON HERE IS AGAINST A FACT, AND NOW THERE IS NOTHING ELSE. The
 * month runs against the three months before it, the day strip shows which days
 * were typed into, and the pace divides by the days that have happened. A
 * monthly target used to sit among them — the one intention on the screen, and
 * the one figure the app would not invent — and it is gone: every line drawn
 * here is something that happened, so none of them needs telling apart from a
 * number somebody chose.
 */
import { useMemo, useState } from 'react'
import {
  BookOpenIcon,
  CarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleEllipsisIcon,
  GiftIcon,
  HeartPulseIcon,
  LampIcon,
  LandmarkIcon,
  PencilIcon,
  PlaneIcon,
  PlusIcon,
  ScissorsIcon,
  SearchIcon,
  ShoppingBagIcon,
  TicketIcon,
  TrashIcon,
  UsersIcon,
  UtensilsIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import {
  EXPENSE_GROUPS,
  EXPENSE_GROUP_LABEL,
  EXPENSE_LABEL,
  currentMonth,
  expenseGroupOf,
  expenseHistory,
  expensesFor,
  toRM,
} from '@/lib/calc'
import { compact, dfmt, fmt, monthLabel, pct1, pctS } from '@/lib/format'
import { useVantage } from '@/lib/store'

import { MonthStrip } from './money/parts'

/** Months in the history chart. */
const WINDOW = 12
/** Rows a page of the log can hold. */
const PAGE_SIZES = [10, 25, 50]
/** How the log can be ordered. Newest first, because that is what was just typed. */
const ORDERS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['largest', 'Largest first'],
  ['smallest', 'Smallest first'],
]

const GROUP_ICON = {
  FOOD: UtensilsIcon,
  TRANSPORT: CarIcon,
  HOME: LampIcon,
  HEALTH: HeartPulseIcon,
  PERSONAL_CARE: ScissorsIcon,
  SHOPPING: ShoppingBagIcon,
  ENTERTAINMENT: TicketIcon,
  TRAVEL: PlaneIcon,
  FAMILY: UsersIcon,
  GIVING: GiftIcon,
  LEARNING: BookOpenIcon,
  FEES: LandmarkIcon,
  OTHER: CircleEllipsisIcon,
}

/**
 * The chart slot a group takes, fixed by its position in the taxonomy so a group
 * keeps its colour from month to month. Other is --faint rather than a thirteenth
 * hue: a residue is not a series.
 */
const GROUP_TONE = Object.fromEntries(
  EXPENSE_GROUPS.map((g, i) => [
    g.group,
    i === EXPENSE_GROUPS.length - 1 ? 'var(--faint)' : `var(--chart-${i + 1})`,
  ]),
)

/** Diagonal fill for a month that is not over yet. */
const OPEN_HATCH =
  'repeating-linear-gradient(115deg, color-mix(in srgb, var(--cash) 50%, transparent) 0 1.5px, transparent 1.5px 5px)'
/** The same, in the muted tone, for a day that has not happened. */
const FUTURE_HATCH =
  'repeating-linear-gradient(115deg, color-mix(in srgb, var(--faint) 45%, transparent) 0 1px, transparent 1px 4px)'

/** An action on a row: an icon, with the words in a tooltip and on the button. */
function RowAction({ icon: Icon, label, onClick }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** "the three months before this one", truthfully — there may only be one. */
function usualPhrase(monthsLogged) {
  if (monthsLogged >= 3) return 'the average of the three months before this one'
  if (monthsLogged === 2) return 'the average of the two months before this one'
  return 'the month before this one'
}

/**
 * Twelve months of logged spend, ending at the month that is happening.
 *
 * Picking a month highlights its bar and re-reads the panels below it; it does
 * not move the window. So the month that is happening is always the last bar,
 * and always one click away — which is why this needs no way back beside it.
 *
 * A month nobody typed into is drawn as a gap rather than a zero bar. A zero bar
 * is a claim — it says nothing was spent — and every month before the log existed
 * would otherwise be making it.
 */
function History({ months, ex, onPick }) {
  // The usual month is drawn, so it has to be inside the scale — a line above
  // every bar would otherwise sit off the top of the chart, which is exactly
  // when it is most worth seeing.
  const usual = ex.usualRM
  const most = Math.max(...months.map(m => m.totalRM), usual ? usual * 1.1 : 0)
  // Headroom for the figure that sits above each bar.
  const scale = most > 0 ? most * 1.16 : 1

  return (
    <div className="border-hairline border-b px-4 py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="eyebrow">Logged spend · {WINDOW} months</span>
        {/* Where the exception is stated, beside the control that is the
            exception. Every other Money screen shows the month that is
            happening and has no way to be moved off it. This one does, and it
            is a READ rather than a move: the window is anchored on today, so
            picking a bar only changes which month is being read out below. A
            "Back to September" button used to stand here because the window
            re-anchored on the pick and the month that is happening fell off the
            chart — the chart was a one-way door. It no longer is: that month is
            the last bar whatever is selected, so the way back is the bar. */}
        <span className="text-faint text-[11px]">pick a month to read it — this screen only</span>
        {/* The line is useless unless the figure is beside it: "a usual month"
            drawn without a number is a rule the reader cannot check any bar
            against. Named rather than labelled "average", because it is the
            average of the months that HAVE a log — usualPhrase() says which. */}
        {usual ? (
          <span className="text-faint flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block w-4 border-t border-dotted"
              style={{ borderColor: 'var(--chart-1)' }}
              aria-hidden="true"
            />
            <span className="num">a usual month {fmt(usual, 'MYR')}</span>
          </span>
        ) : null}
        <span className="text-faint flex items-center gap-1.5 text-[11px]">
          <span
            className="border-cash size-2.5 border"
            style={{ backgroundImage: OPEN_HATCH }}
            aria-hidden="true"
          />
          the month still open
        </span>
      </div>

      <div className="relative h-[150px]">
        <div className="flex h-full items-end gap-1.5">
          {months.map(m => {
            const h = (m.totalRM / scale) * 100
            return (
              <button
                type="button"
                key={m.key}
                onClick={() => onPick(m.year, m.monthIndex)}
                data-month={m.key}
                aria-current={m.selected ? 'true' : undefined}
                title={`${m.short} ${m.year} — ${m.logged ? fmt(m.totalRM, 'MYR') : 'nothing logged'}`}
                className="relative h-full min-w-0 flex-1 cursor-pointer"
              >
                {m.logged ? (
                  <>
                    <span
                      className="num absolute inset-x-0 text-center text-[10px]"
                      style={{
                        bottom: `calc(${h}% + 3px)`,
                        color: m.selected ? 'var(--cash)' : 'var(--faint)',
                      }}
                    >
                      {compact(m.totalRM)}
                    </span>
                    <span
                      className="absolute inset-x-0 bottom-0 rounded-[3px]"
                      style={{
                        height: `max(${h}%, 2px)`,
                        backgroundColor: m.open
                          ? 'color-mix(in srgb, var(--cash) 18%, transparent)'
                          : m.selected
                            ? 'var(--cash)'
                            : 'color-mix(in srgb, var(--chart-1) 70%, transparent)',
                        backgroundImage: m.open ? OPEN_HATCH : undefined,
                        border: m.open ? '1px solid var(--cash)' : undefined,
                      }}
                    />
                  </>
                ) : (
                  <span className="border-hairline absolute inset-x-0 bottom-0 border-t border-dashed" />
                )}
              </button>
            )
          })}
        </div>
        {/* ONE LINE, AND IT IS A MEASUREMENT. It is drawn in the chart's own ink
            and dotted, not in the foreground's and dashed, because nothing on
            this chart is an intention any more: the target line stood here too,
            and telling the two apart was the whole reason for the difference. */}
        {usual ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dotted"
            style={{ bottom: `${(usual / scale) * 100}%`, borderColor: 'var(--chart-1)' }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {months.map(m => (
          <span
            key={m.key}
            className="num min-w-0 flex-1 text-center text-[10px]"
            style={{ color: m.selected ? 'var(--cash)' : 'var(--faint)' }}
          >
            {m.short}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Every day of the month, shaded by what was logged against it, and the pace. */
function DayStrip({ ex }) {
  const most = Math.max(...ex.byDay, 1)
  const heaviest = ex.byDay.indexOf(most) + 1
  const blanks = ex.byDay.slice(0, ex.elapsedDays).filter(v => v === 0).length

  return (
    <div className="border-hairline flex flex-wrap gap-x-8 gap-y-4 border-b px-4 py-4">
      <div className="min-w-[300px] flex-1">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="eyebrow">Day by day</span>
          {/* A month with nothing in it HAS no heaviest day, and this line must
              not invent one: `most` falls back to 1, which is in no day, so
              indexOf() returns -1 and the line would read "heaviest day 0 ·
              RM 1.00". The strip below still draws — every elapsed day pale,
              which is the true picture and the same shape a logged month draws. */}
          <span className="text-faint num text-[11px]">
            {ex.count === 0
              ? ex.open
                ? 'nothing logged yet'
                : 'nothing logged'
              : `heaviest day ${heaviest} · ${fmt(most, 'MYR')}${
                  blanks ? ` · ${blanks} ${blanks === 1 ? 'day' : 'days'} with nothing logged` : ''
                }`}
          </span>
        </div>
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${ex.daysInMonth}, minmax(0, 1fr))` }}
        >
          {ex.byDay.map((v, i) => {
            const future = i + 1 > ex.elapsedDays
            return (
              <div
                key={i}
                title={`${i + 1} — ${future ? 'not yet' : v === 0 ? 'nothing logged' : fmt(v, 'MYR')}`}
                className={`h-[30px] rounded-[2px] ${future ? 'border border-dashed' : ''}`}
                style={
                  future
                    ? { borderColor: 'var(--hairline)', backgroundImage: FUTURE_HATCH }
                    : v === 0
                      ? { backgroundColor: 'color-mix(in srgb, var(--muted) 60%, transparent)' }
                      : {
                          backgroundColor: `color-mix(in srgb, var(--cash) ${Math.round(12 + (v / most) * 60)}%, transparent)`,
                        }
                }
              />
            )
          })}
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-faint num text-[10.5px]">1</span>
          <span className="text-faint num text-[10.5px]">15</span>
          <span className="text-faint num text-[10.5px]">{ex.daysInMonth}</span>
        </div>
      </div>
      <div className="w-[230px] shrink-0">
        <span className="eyebrow">Per day</span>
        <div className="num mt-1 text-[19px] leading-none font-semibold">
          {ex.perDayRM == null ? '—' : fmt(ex.perDayRM, 'MYR')}
        </div>
        <p className="text-faint mt-1.5 text-[11px] leading-[1.5]">
          {ex.elapsedDays === 0
            ? 'A month that has not started yet.'
            : `Over ${ex.elapsedDays} ${ex.elapsedDays === 1 ? 'day' : 'days'}${
                ex.usualPerDayRM == null ? '' : `, against ${fmt(ex.usualPerDayRM, 'MYR')} in a usual month`
              }.`}{' '}
          A pale day means nothing was <i>logged</i>, not that nothing was spent — the hatched
          remainder in the statement is where those days go.
        </p>
      </div>
    </div>
  )
}

/** One group, and the movement against what it usually costs. */
function GroupCard({ g, on, onPick }) {
  const Icon = GROUP_ICON[g.group] || CircleEllipsisIcon
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className="border-border hover:bg-muted/40 aria-pressed:border-ring aria-pressed:bg-muted/60 grid gap-1.5 rounded-md border px-2.5 py-2.5 text-left"
    >
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: GROUP_TONE[g.group] }} />
        <span className="text-muted-foreground text-[12px]">{g.label}</span>
      </span>
      <span className="num text-[15px] font-semibold">{fmt(g.amountRM, 'MYR')}</span>
      <span className="flex items-baseline gap-2">
        <span className="num text-faint text-[11px]">{pct1(g.share * 100)}</span>
        {g.delta == null ? (
          <span className="text-faint ml-auto text-[11px]">no history</span>
        ) : (
          <span
            className={`num ml-auto text-[11px] font-semibold ${g.delta >= 0 ? 'text-loss' : 'text-gain'}`}
          >
            {pctS(g.delta * 100)}
          </span>
        )}
      </span>
      <Progress value={g.share * 100} aria-label={`${g.label} ${pct1(g.share * 100)}`} />
    </button>
  )
}

/**
 * A page window of at most seven numbers, with an em dash where pages are
 * skipped — the same em dash the rest of the app uses for "not shown", never a
 * zero.
 */
function pageWindow(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out = [1]
  if (page > 3) out.push(0)
  for (let i = Math.max(2, page - 1); i <= Math.min(count - 1, page + 1); i++) out.push(i)
  if (page < count - 2) out.push(0)
  out.push(count)
  return out
}

/** A filter dropdown with a count beside each option. */
function FilterSelect({ name, value, onChange, items, disabled, width }) {
  const current = items.find(i => i.value === value)
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" className={width} aria-label={name}>
        <span className="text-faint mr-1 text-[11px]">{name}</span>
        {/* Explicit children, or the trigger would echo the option's row count
            back at you as part of the value. */}
        <SelectValue>{current ? current.label : ''}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[280px]">
        {items.map(it => (
          <SelectItem key={it.value} value={it.value} disabled={it.n === 0}>
            <span className="flex w-full items-baseline gap-4">
              {it.label}
              {it.n == null ? null : (
                <span className="text-faint num ml-auto text-[11px]">{it.n || '—'}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const ALL = '__all__'

export default function Expenses() {
  const { state, setTab, openExpense, deleteExpense } = useVantage()
  // THE ONE MONTH ANYWHERE THAT IS NOT TODAY'S, and it is a useState rather than
  // a shared value in the store on purpose.
  //
  // The twelve-month chart below drills into a past month, which is the one
  // exception the owner kept when the month stepper came off every Money screen.
  // Held here, that drill is a fact about this screen and nothing else can
  // observe it; held in the store — where it was — Overview and Commitments read
  // it too, and picking July's bar quietly re-scoped the measured statement on
  // another tab. Seeded from the same currentMonth() the other five screens are
  // pinned to, so the log opens on the month that is happening — and, because
  // the tab panel unmounts, so does every return to this screen. That reset is
  // wanted: a drilled month that outlived a trip to Loans and back would be a
  // log showing July to a reader who has every reason to believe the Money
  // screens are all on today.
  const [month, setMonth] = useState(currentMonth)
  const { y, m } = month
  // Its own call now, where Money used to pass one down. Pure and month-scoped,
  // so Overview computing it too costs a little work and cannot disagree.
  const ex = useMemo(() => expensesFor(state, y, m), [state, y, m])
  const onMonth = (year, monthIndex) => setMonth({ y: year, m: monthIndex })

  const [query, setQuery] = useState('')
  const [pick, setPick] = useState({ group: null, category: null })
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [order, setOrder] = useState('newest')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const months = useMemo(() => expenseHistory(state, y, m, WINDOW), [state, y, m])
  const label = monthLabel(y, m)

  const reset = patch => {
    setPage(1)
    setPick(p => ({ ...p, ...patch }))
  }
  const openGroup = pick.group == null ? null : ex.groups.find(g => g.group === pick.group)
  const clearFilters = () => {
    setPick({ group: null, category: null })
    setQuery('')
    setPage(1)
  }

  /* ── the log: filter, then order, then page ── */
  const q = query.trim().toLowerCase()
  const filtered = ex.rows.filter(e => {
    const group = expenseGroupOf(e.category)
    if (pick.group && group !== pick.group) return false
    if (pick.category && e.category !== pick.category) return false
    if (!q) return true
    // The words the owner would search by, not the codes the column stores.
    const hay =
      `${e.note || ''} ${EXPENSE_GROUP_LABEL[group]} ${EXPENSE_LABEL[e.category] || e.category}`.toLowerCase()
    return hay.includes(q)
  })
  const ordered = [...filtered].sort((a, b) =>
    order === 'oldest'
      ? a.date < b.date
        ? -1
        : a.date > b.date
          ? 1
          : (a.id || 0) - (b.id || 0)
      : order === 'largest'
        ? toRM(state, b.amount, b.currency) - toRM(state, a.amount, a.currency)
        : order === 'smallest'
          ? toRM(state, a.amount, a.currency) - toRM(state, b.amount, b.currency)
          : 0,
  )
  const filteredRM = filtered.reduce((sum, e) => sum + toRM(state, e.amount, e.currency), 0)
  const filtering = !!q || pick.group != null || pick.category != null

  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize))
  const p = Math.min(page, pageCount)
  const from = (p - 1) * pageSize
  const shown = ordered.slice(from, from + pageSize)

  // Biggest first, always. Ordering by movement instead was a second way to read
  // one list, and on a month whose groups mostly say "no history" it sorted on a
  // figure that was not there — expensesFor() already hands them back by amount.
  const visibleGroups = showAllGroups ? ex.groups : ex.groups.slice(0, 6)
  const restCount = ex.groups.length - visibleGroups.length

  const groupItems = [
    { value: ALL, label: 'All groups', n: ex.count },
    ...EXPENSE_GROUPS.map(g => ({
      value: g.group,
      label: g.label,
      n: ex.rows.filter(e => expenseGroupOf(e.category) === g.group).length,
    })),
  ]
  const catItems =
    pick.group == null
      ? [{ value: ALL, label: 'All categories', n: null }]
      : [
          {
            value: ALL,
            label: 'All categories',
            n: ex.rows.filter(e => expenseGroupOf(e.category) === pick.group).length,
          },
          ...(EXPENSE_GROUPS.find(g => g.group === pick.group)?.categories || []).map(c => ({
            value: c,
            label: EXPENSE_LABEL[c],
            n: ex.rows.filter(e => e.category === c).length,
          })),
        ]

  return (
    <div className="grid gap-4">
      {/* THE MONTH THIS SCREEN IS SHOWING, not the month that is happening. The
          strip is the only thing on the page that names it, so on the one screen
          that can be drilled into the past it has to follow the drill or it
          would be labelling July's log with September. */}
      <MonthStrip month={month} />
      <Card className="min-w-0 gap-0 overflow-hidden py-0">
    <section id="spending" className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
        <span className="eyebrow">Spending · what was actually spent</span>
        {ex.count ? (
          <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {fmt(ex.loggedRM, 'MYR')} logged
          </Badge>
        ) : null}
        <span className="text-faint text-[11px]">
          {ex.count} {ex.count === 1 ? 'entry' : 'entries'} · rent and subscriptions are known in
          advance and sit in{' '}
          <button
            type="button"
            onClick={() => setTab('commitments')}
            className="text-muted-foreground underline underline-offset-2"
          >
            Commitments
          </button>
        </span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => openExpense()}>
            <PlusIcon />
            Add expense
          </Button>
        </div>
      </div>

      <History months={months} ex={ex} onPick={onMonth} />

      {/* EVERY SECTION, EVERY MONTH. These used to be gated on there being
          entries, so clicking from a logged month to an empty one dropped two
          sections and replaced the log with a centred block — the page changed
          shape rather than changing month. Each says what it has instead. */}
      <DayStrip ex={ex} />

      <div className="border-hairline border-b px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="eyebrow">By group · against a usual month</span>
          {/* There is nothing to pick when no group has anything in it, and the
              line below already counts them. Promising categories behind a card
              that is not there is the sort of instruction a reader blames
              themselves for failing to follow. */}
          <span className="text-faint text-[11px]">
            {ex.groups.length
              ? `share of the logged total, and the movement against ${usualPhrase(ex.monthsLogged)}. Pick a group for its categories.`
              : 'share of the logged total, once there is one.'}
          </span>
        </div>

        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {visibleGroups.map(g => (
            <GroupCard
              key={g.group}
              g={g}
              on={pick.group === g.group}
              onPick={() =>
                reset({ group: pick.group === g.group ? null : g.group, category: null })
              }
            />
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          {restCount > 0 || showAllGroups ? (
            <Button variant="outline" size="xs" onClick={() => setShowAllGroups(v => !v)}>
              {showAllGroups ? 'Show the top six' : `Show the other ${restCount}`}
            </Button>
          ) : null}
          <span className="text-faint text-[11px]">
            {ex.emptyGroupCount
              ? `${ex.emptyGroupCount} of the ${ex.groupCount} groups had nothing logged in ${label}.`
              : `All ${ex.groupCount} groups had something logged in ${label}.`}
          </span>
        </div>

        {openGroup ? (
          <div className="border-hairline mt-3 rounded-md border px-4 py-3.5">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="eyebrow">{openGroup.label} · by category</span>
              <span className="text-faint text-[11px]">
                the log is filtered to this group; pick a category to narrow it further
              </span>
              <Button variant="ghost" size="xs" className="ml-auto" onClick={clearFilters}>
                Close
              </Button>
            </div>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              {/* Every category of the group, the empty ones included. An em
                  dash rather than a zero, so the taxonomy stays legible and the
                  owner can see what they are not using. */}
              {openGroup.categories.map(c => {
                const most = Math.max(...openGroup.categories.map(x => x.amountRM), 1)
                const on = pick.category === c.category
                const has = c.amountRM > 0
                return (
                  <button
                    type="button"
                    key={c.category}
                    disabled={!has}
                    aria-pressed={on}
                    onClick={() => reset({ category: on ? null : c.category })}
                    className="border-hairline aria-pressed:border-ring aria-pressed:bg-muted/60 grid gap-1.5 rounded-md border px-2.5 py-2 text-left disabled:cursor-default"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-muted-foreground text-[12.5px]">{c.label}</span>
                      <span
                        className={`num ml-auto text-[12.5px] font-semibold ${has ? '' : 'text-faint'}`}
                      >
                        {has ? fmt(c.amountRM, 'MYR') : '—'}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-faint num text-[11px]">
                        {c.count === 0
                          ? 'nothing logged'
                          : `${c.count} ${c.count === 1 ? 'entry' : 'entries'}`}
                      </span>
                      <span className="text-faint num ml-auto text-[11px]">
                        {has ? `${pct1(c.shareOfGroup * 100)} of ${openGroup.label.toLowerCase()}` : ''}
                      </span>
                    </span>
                    <Progress value={(c.amountRM / most) * 100} />
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {ex.count ? (
        <div className="px-4 py-4">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="eyebrow">Every entry</span>
            <span className="text-faint num text-[11px]">
              {filtering ? `${filtered.length} of ${ex.count}` : ex.count}
            </span>
            <div className="relative ml-auto">
              <SearchIcon className="text-faint pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                className="h-8 w-[180px] pl-7 text-[12.5px]"
                placeholder="Search notes"
                aria-label="Search notes"
                value={query}
                onChange={e => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>

          {/* The group cards above are a reading of the month; these are the
              log's own controls. They stay separate because narrowing the list
              should not disturb what the cards are saying about the month. */}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <FilterSelect
              name="Group"
              width="w-[168px]"
              value={pick.group || ALL}
              onChange={v => reset({ group: v === ALL ? null : v, category: null })}
              items={groupItems}
            />
            <FilterSelect
              name="Category"
              width="w-[192px]"
              value={pick.category || ALL}
              onChange={v => reset({ category: v === ALL ? null : v })}
              items={catItems}
              disabled={pick.group == null}
            />
            <FilterSelect
              name="Sort"
              width="w-[176px]"
              value={order}
              onChange={v => {
                setOrder(v)
                setPage(1)
              }}
              items={ORDERS.map(([value, label2]) => ({ value, label: label2, n: null }))}
            />
            <FilterSelect
              name="Per page"
              width="w-[136px]"
              value={String(pageSize)}
              onChange={v => {
                setPageSize(Number(v))
                setPage(1)
              }}
              items={PAGE_SIZES.map(n => ({ value: String(n), label: `${n} rows`, n: null }))}
            />
            {filtering ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
            {filtering && filtered.length ? (
              <span className="text-faint num ml-auto text-[12px]">
                {fmt(filteredRM, 'MYR')} of {fmt(ex.loggedRM, 'MYR')}
              </span>
            ) : null}
          </div>

          <div className="border-hairline overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[84px]">Date</TableHead>
                  <TableHead className="w-[216px]">Category</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-[124px] text-right">Amount</TableHead>
                  <TableHead className="w-[78px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(e => {
                  const group = expenseGroupOf(e.category)
                  const Icon = GROUP_ICON[group] || CircleEllipsisIcon
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="num text-muted-foreground">{dfmt(e.date)}</TableCell>
                      <TableCell>
                        <span className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                          <Icon className="size-3.5 shrink-0" style={{ color: GROUP_TONE[group] }} />
                          <span>{EXPENSE_LABEL[e.category] || e.category}</span>
                          <span className="text-faint text-[11px]">
                            {EXPENSE_GROUP_LABEL[group]}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-faint">{e.note}</TableCell>
                      <TableCell className="num text-right font-semibold">
                        {fmt(e.amount, e.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="flex justify-end gap-0.5">
                          <RowAction
                            icon={PencilIcon}
                            label={`Edit the ${dfmt(e.date)} expense`}
                            onClick={() => openExpense(e)}
                          />
                          <RowAction
                            icon={TrashIcon}
                            label={`Remove the ${dfmt(e.date)} expense`}
                            onClick={() => deleteExpense(e.id)}
                          />
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {ordered.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-[13px]">
                Nothing in {label} matches that.
              </p>
            ) : null}

            <div className="border-hairline flex flex-wrap items-center gap-2 border-t px-3.5 py-2">
              <span className="text-faint num text-[12px]">
                {ordered.length === 0
                  ? 'Try a different note, or clear the filters.'
                  : `${from + 1}–${from + shown.length} of ${ordered.length}`}
              </span>
              {pageCount > 1 ? (
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Previous page"
                    disabled={p === 1}
                    onClick={() => setPage(p - 1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  {pageWindow(p, pageCount).map((n, i) =>
                    n === 0 ? (
                      <span key={`gap${i}`} className="text-faint px-1 text-[11px]" aria-hidden="true">
                        —
                      </span>
                    ) : (
                      <Button
                        key={n}
                        size="icon-xs"
                        variant={n === p ? 'default' : 'outline'}
                        aria-label={`Page ${n}`}
                        aria-current={n === p ? 'page' : undefined}
                        className="min-w-6 px-1.5 text-[11px]"
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </Button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Next page"
                    disabled={p === pageCount}
                    onClick={() => setPage(p + 1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* THE SAME SECTION, SAYING IT HAS NOTHING — not a different screen. This
           was a centred block with its own heading, the one centred thing on a
           page of left-aligned sections, so an empty month did not merely hold
           less than a logged one, it was laid out differently. Same eyebrow, same
           count in the same place, same padding as the log it stands in for. */
        <div className="px-4 py-4">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="eyebrow">Every entry</span>
            <span className="text-faint num text-[11px]">0</span>
          </div>
          <p className="text-muted-foreground max-w-[560px] text-[13px] leading-relaxed">
            Nothing recorded in {label}. Groceries, fuel, eating out — the spending that is not the
            same every month. Rent, insurance and subscriptions are commitments and belong above;
            entering them here as well would count them twice against your income.
          </p>
          <Button size="sm" className="mt-3" onClick={() => openExpense()}>
            <PlusIcon />
            Add expense
          </Button>
        </div>
      )}
    </section>
      </Card>
    </div>
  )
}
