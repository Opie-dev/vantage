/**
 * What was actually spent, month by month.
 *
 * Its own screen rather than a card on Money, because the two answer different
 * questions. Money is the waterfall — what arrives, what is owed, what is left
 * before living costs. This is the half after that line, and it needs room the
 * waterfall cannot give it: a month to navigate, twelve months behind it, every
 * row rather than the last six, and the reconciliation stated rather than
 * squeezed into a sentence.
 *
 * THE RECONCILIATION IS WHY THIS SCREEN IS HONEST. commitments-and-income-plan.md
 * §2 argued against an expense log because one gets abandoned and then silently
 * under-reports. spendingFor() already infers what actually left the wallets from
 * balance readings, without anything being entered, so the log is measured
 * against it and told to say when it has gone stale. A log that reports its own
 * incompleteness is a different thing from one that quietly lies.
 *
 * EVERY COMPARISON ON THIS SCREEN IS AGAINST A FACT. The month runs against the
 * three months before it, the log runs against what left the wallet, and the day
 * strip shows which days were typed into. The one intention here is the target,
 * and it is the one figure the app will not invent: unset, the tile asks for one
 * rather than assuming a number and grading the month against it.
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

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
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
  SPEND_UNKNOWN,
  expenseGroupOf,
  expenseHistory,
  expenseTarget,
  expensesFor,
  toRM,
} from '@/lib/calc'
import { compact, dfmt, fmt, monthLabel, pct1, pctS } from '@/lib/format'
import { useVantage } from '@/lib/store'

/** How many rows the log shows before it has to be asked for the rest. */
const PAGE = 8
/** Months in the history chart. */
const WINDOW = 12

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

/** A small figure with a label and a line of explanation under it. */
function Tile({ label, value, note, tone }) {
  return (
    <div className="border-hairline rounded-md border px-3 py-2.5">
      <span className="eyebrow">{label}</span>
      <div className="num mt-1 text-[19px] leading-none font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <p className="text-faint mt-1.5 text-[11px] leading-[1.5]">{note}</p>
    </div>
  )
}

/**
 * How much of what left the wallet actually got typed.
 *
 * Four states, and three of them are "cannot know yet" rather than a number.
 * That is deliberate: a coverage figure invented from a missing wallet reading
 * would be worse than no figure, because it would look like an answer.
 */
function coverageOf(ex) {
  const { spend } = ex

  if (spend.reason === SPEND_UNKNOWN.NO_WALLET) {
    return {
      value: '—',
      tone: 'var(--faint)',
      note: 'Mark the account you spend from as a wallet on the Assets screen and record its balance now and then. The app can then work out what actually left it.',
    }
  }
  if (spend.reason === SPEND_UNKNOWN.NO_CLOSING_READING) {
    return {
      value: '—',
      tone: 'var(--faint)',
      note: 'One wallet reading so far. Record a second and this list gets checked against what actually left.',
    }
  }
  if (spend.reason) {
    return {
      value: '—',
      tone: 'var(--faint)',
      note: 'No wallet reading before this month, so there is nothing to measure the gap from yet.',
    }
  }

  const measured = `measured ${dfmt(spend.from)} to ${dfmt(spend.to)} · ${spend.days} days`
  if (ex.coveragePct == null) {
    return {
      value: '—',
      tone: 'var(--faint)',
      note: `Nothing left the wallet over the window the readings bracket, so there is no gap to report. ${measured}.`,
    }
  }
  if (ex.unloggedRM < -1) {
    return {
      value: pct1(ex.coveragePct),
      tone: 'var(--cash)',
      note: `${fmt(Math.abs(ex.unloggedRM), 'MYR')} more is logged than actually left — a double entry, or something dated into the wrong month. ${measured}.`,
    }
  }
  return {
    value: pct1(ex.coveragePct),
    tone: ex.unloggedRM > 1 ? 'var(--cash)' : undefined,
    note:
      ex.unloggedRM > 1
        ? `${fmt(ex.unloggedRM, 'MYR')} left the wallet unlogged. ${measured}.`
        : `This matches what actually left your wallet. ${measured}.`,
  }
}

/** "the three months before this one", truthfully — there may only be one. */
function usualPhrase(monthsLogged) {
  if (monthsLogged >= 3) return 'the average of the three months before this one'
  if (monthsLogged === 2) return 'the average of the two months before this one'
  return 'the month before this one'
}

/**
 * The target, and the one place on this screen where an intention is stored.
 *
 * Unset by default and unset is a state, not a gap to be filled with a plausible
 * number: everything else here is measured, and grading a month against a figure
 * the app made up would put the two on the same footing.
 */
function TargetBlock({ target, ex, onSave }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(target == null ? '' : String(target))

  const save = async () => {
    const n = Number(draft)
    const ok = await onSave(Number.isFinite(n) && n > 0 ? n : null)
    if (ok) setOpen(false)
  }
  const clear = async () => {
    setDraft('')
    if (await onSave(null)) setOpen(false)
  }

  const editor = (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o)
        if (o) setDraft(target == null ? '' : String(target))
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          {target == null ? 'Set a target' : 'Change'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[268px]" align="end">
        <span className="eyebrow">Monthly target</span>
        <p className="text-faint mt-1.5 text-[11.5px] leading-relaxed">
          One figure for everything variable, not a budget per category. A budget compares an
          intention against another intention; this compares one against what happened.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            className="num h-8"
            type="number"
            min="0"
            step="50"
            autoFocus
            placeholder="0"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            aria-label="Monthly target in RM"
          />
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
        {target == null ? null : (
          <Button variant="ghost" size="xs" className="mt-2" onClick={clear}>
            No target
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )

  if (target == null) {
    return (
      <div className="grid gap-2">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow">Against your target</span>
          <div className="ml-auto">{editor}</div>
        </div>
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          No target set. A target is an intention and everything else on this screen is a fact, so
          the app will not invent one for you to be measured against.
        </p>
      </div>
    )
  }

  const ceiling = Math.max(target, ex.loggedRM)
  const over = ex.loggedRM - target
  const left = ex.daysInMonth - ex.elapsedDays

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Against your target</span>
        <span className="num text-muted-foreground ml-auto text-[11.5px]">
          {fmt(target, 'MYR')}
        </span>
        {editor}
      </div>
      <div className="relative">
        <Progress value={(ex.loggedRM / ceiling) * 100} />
        {/* Where the target sits once the month has run past it — without the
            mark, a full bar could mean either "at the target" or "double it". */}
        {over > 0 ? (
          <div
            className="bg-foreground/70 absolute -top-0.5 -bottom-0.5 w-px"
            style={{ left: `${(target / ceiling) * 100}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="text-[12.5px] leading-relaxed">
        {ex.open ? (
          over > 0 ? (
            <>
              Over the target by <b className="num text-cash font-semibold">{fmt(over, 'MYR')}</b>{' '}
              with {left} {left === 1 ? 'day' : 'days'} still to go.
            </>
          ) : (
            <>
              <b className="num font-semibold">{fmt(-over, 'MYR')}</b> of the target is unspent with{' '}
              {left} {left === 1 ? 'day' : 'days'} to go. A target is an intention; the figure beside
              it is a fact.
            </>
          )
        ) : over > 0 ? (
          <>
            Over by <b className="num text-cash font-semibold">{fmt(over, 'MYR')}</b>. A target is an
            intention and this is a fact, so the gap is worth reading before it is worth acting on.
          </>
        ) : (
          <>
            Under by <b className="num text-gain font-semibold">{fmt(-over, 'MYR')}</b>. A target is
            an intention and this is a fact, so the gap is worth reading before it is worth acting
            on.
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Twelve months of logged spend, ending at the month on screen.
 *
 * A month nobody typed into is drawn as a gap rather than a zero bar. A zero bar
 * is a claim — it says nothing was spent — and every month before the log existed
 * would otherwise be making it.
 */
function History({ months, target, onPick }) {
  const most = Math.max(...months.map(m => m.totalRM), target ? target * 1.1 : 0)
  // Headroom for the figure that sits above each bar, and for the target line
  // when the target is above everything logged.
  const scale = most > 0 ? most * 1.16 : 1
  const anyLogged = months.some(m => m.logged)

  return (
    <Card>
      <CardContent className="px-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="eyebrow">Logged spend · {WINDOW} months</span>
          {target ? (
            <span className="text-faint flex items-center gap-1.5 text-[11px]">
              <span
                className="border-foreground/50 inline-block w-4 border-t border-dashed"
                aria-hidden="true"
              />
              target
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
          {anyLogged ? null : (
            <span className="text-faint text-[11px]">nothing logged in this window yet</span>
          )}
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
                          background: m.open
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
          {target ? (
            <div
              className="border-foreground/40 pointer-events-none absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${(target / scale) * 100}%` }}
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
      </CardContent>
    </Card>
  )
}

/** Every day of the month, shaded by what was logged against it. */
function DayStrip({ ex, label }) {
  const most = Math.max(...ex.byDay, 1)
  const heaviest = ex.byDay.indexOf(most) + 1
  const blanks = ex.byDay.slice(0, ex.elapsedDays).filter(v => v === 0).length

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-8 gap-y-4 px-5">
        <div className="min-w-[320px] flex-1">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="eyebrow">Day by day · {label}</span>
            <span className="text-faint num text-[11px]">
              heaviest day {heaviest} · {fmt(most, 'MYR')}
              {blanks ? ` · ${blanks} ${blanks === 1 ? 'day' : 'days'} with nothing logged` : ''}
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
                  className="h-[34px] rounded-[2px]"
                  style={
                    future
                      ? { border: '1px dashed var(--hairline)', backgroundImage: FUTURE_HATCH }
                      : v === 0
                        ? { background: 'color-mix(in srgb, var(--muted) 60%, transparent)' }
                        : {
                            background: `color-mix(in srgb, var(--cash) ${Math.round(12 + (v / most) * 60)}%, transparent)`,
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
        <div className="w-[250px] shrink-0">
          <span className="eyebrow">Reading this</span>
          <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
            A pale day means nothing was <i>logged</i>, not that nothing was spent. The wallet gap
            above is where those days go.
          </p>
        </div>
      </CardContent>
    </Card>
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
      className="border-border hover:bg-muted/40 aria-pressed:border-ring aria-pressed:bg-muted/60 grid gap-1.5 rounded-md border px-3 py-2.5 text-left"
    >
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: GROUP_TONE[g.group] }} />
        <span className="text-muted-foreground text-[12px]">{g.label}</span>
      </span>
      <span className="num text-[16px] font-semibold">{fmt(g.amountRM, 'MYR')}</span>
      <span className="flex items-baseline gap-2">
        <span className="num text-faint text-[11px]">{pct1(g.share * 100)} of total</span>
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

export default function Expenses() {
  const { state, openExpense, deleteExpense, setPreference } = useVantage()
  const now = new Date()
  const [{ y, m }, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState({ group: null, category: null })
  const [sort, setSort] = useState('amount')
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [showAllRows, setShowAllRows] = useState(false)

  const ex = useMemo(() => expensesFor(state, y, m), [state, y, m])
  const months = useMemo(() => expenseHistory(state, y, m, WINDOW), [state, y, m])
  const target = expenseTarget(state)
  const thisMonth = y === now.getFullYear() && m === now.getMonth()
  const label = monthLabel(y, m)

  const goto = (year, monthIndex) => {
    setMonth({ y: year, m: monthIndex })
    setPick({ group: null, category: null })
    setShowAllRows(false)
  }
  const move = n => {
    const next = new Date(y, m + n, 1)
    goto(next.getFullYear(), next.getMonth())
  }

  const openGroup = pick.group == null ? null : ex.groups.find(g => g.group === pick.group)
  const clearFilters = () => {
    setPick({ group: null, category: null })
    setQuery('')
    setShowAllRows(false)
  }

  /* ── the log, filtered ── */
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
  const filteredRM = filtered.reduce((sum, e) => sum + toRM(state, e.amount, e.currency), 0)
  const shown = showAllRows ? filtered : filtered.slice(0, PAGE)
  const filtering = !!q || pick.group != null || pick.category != null

  // A group with no history has no movement, so it sorts to the bottom rather
  // than pretending to a position among the ones that do.
  const byDelta = (a, b) =>
    a.delta == null || b.delta == null ? (a.delta == null) - (b.delta == null) : b.delta - a.delta
  const sortedGroups = sort === 'amount' ? ex.groups : [...ex.groups].sort(byDelta)
  const visibleGroups = showAllGroups ? sortedGroups : sortedGroups.slice(0, 6)
  const restCount = sortedGroups.length - visibleGroups.length

  const coverage = coverageOf(ex)
  const perDay = ex.perDayRM == null ? '—' : fmt(ex.perDayRM, 'MYR')

  return (
    <div className="grid gap-3">
      <Card>
        <CardContent className="grid gap-5 px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => move(-1)}
              aria-label="Previous month"
            >
              <ChevronLeftIcon />
            </Button>
            <h3 className="num min-w-[152px] text-center text-[15px] font-semibold">{label}</h3>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => move(1)}
              aria-label="Next month"
            >
              <ChevronRightIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goto(now.getFullYear(), now.getMonth())}
              disabled={thisMonth}
            >
              This month
            </Button>
            <div className="ml-auto">
              <Button size="sm" onClick={() => openExpense()}>
                <PlusIcon />
                Add expense
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-x-[clamp(20px,4vw,52px)] gap-y-5">
            <div className="min-w-[290px] flex-1">
              <span className="eyebrow">
                Spent · {label}
                {ex.open ? ' · still open' : ''}
              </span>
              <div className="num mt-1.5 text-[clamp(34px,4.4vw,52px)] leading-none font-semibold tracking-[-0.03em]">
                {fmt(ex.loggedRM, 'MYR')}
              </div>
              <p className="mt-3 max-w-[440px] text-[13px] leading-relaxed">
                {/* Two different sentences, because an open month and a closed one
                    are two different claims. Nothing is ever projected forward
                    from a part-month: five days is not a month. */}
                {ex.open ? (
                  <>
                    {ex.elapsedDays} {ex.elapsedDays === 1 ? 'day' : 'days'} in
                    {ex.perDayRM == null ? '' : `. That is ${fmt(ex.perDayRM, 'MYR')} a day`}
                    {ex.usualPerDayRM == null ? (
                      <>
                        . There is nothing logged before this month to compare that against yet.
                      </>
                    ) : (
                      <>
                        , against <b className="num font-semibold">{fmt(ex.usualPerDayRM, 'MYR')}</b>{' '}
                        in a usual month. Nothing is projected forward from it — {ex.elapsedDays}{' '}
                        {ex.elapsedDays === 1 ? 'day' : 'days'} is not a month.
                      </>
                    )}
                  </>
                ) : ex.usualRM == null ? (
                  <>
                    Nothing was logged in the months before this one, so there is nothing yet to
                    read this against.
                  </>
                ) : (
                  <>
                    Against <b className="num font-semibold">{fmt(ex.usualRM, 'MYR')}</b> in a usual
                    month — {usualPhrase(ex.monthsLogged)} — that is{' '}
                    <b className={`num font-semibold ${ex.deltaVsUsual >= 0 ? 'text-loss' : 'text-gain'}`}>
                      {pctS(ex.deltaVsUsual * 100)}
                    </b>
                    . One month is not a trend.
                  </>
                )}
              </p>
              <p className="text-faint mt-2 text-[11.5px]">
                {ex.count} {ex.count === 1 ? 'entry' : 'entries'} · groceries, fuel and the rest.
                Rent and subscriptions are <b className="font-semibold">commitments</b> and live on
                Money.
              </p>
            </div>

            <div className="grid min-w-[300px] flex-1 gap-3">
              <TargetBlock
                target={target}
                ex={ex}
                onSave={v => setPreference({ expenseTargetRM: v })}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Tile
                  label="Coverage"
                  value={coverage.value}
                  note={coverage.note}
                  tone={coverage.tone}
                />
                <Tile
                  label="Per day"
                  value={perDay}
                  note={
                    ex.elapsedDays === 0
                      ? 'a month that has not started yet'
                      : `over ${ex.elapsedDays} ${ex.elapsedDays === 1 ? 'day' : 'days'}${
                          ex.usualPerDayRM == null
                            ? ''
                            : ` · usual ${fmt(ex.usualPerDayRM, 'MYR')}`
                        }`
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <History months={months} target={target} onPick={goto} />

      {ex.count ? <DayStrip ex={ex} label={label} /> : null}

      {ex.groups.length ? (
        <Card>
          <CardContent className="px-5">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="eyebrow">By group · against a usual month</span>
              <span className="text-faint max-w-[420px] text-[11px] leading-[1.5]">
                share of the logged total, and the movement against {usualPhrase(ex.monthsLogged)}.
                Pick a group for its categories.
              </span>
              <div className="ml-auto flex gap-1.5">
                {[
                  ['amount', 'Amount'],
                  ['delta', 'Movement'],
                ].map(([k, text]) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={sort === k ? 'default' : 'outline'}
                    aria-pressed={sort === k}
                    className="rounded-full text-[11px] font-semibold"
                    onClick={() => setSort(k)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              {visibleGroups.map(g => (
                <GroupCard
                  key={g.group}
                  g={g}
                  on={pick.group === g.group}
                  onPick={() =>
                    setPick(p => ({
                      group: p.group === g.group ? null : g.group,
                      category: null,
                    }))
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
                      dash rather than a zero, so the taxonomy stays legible and
                      the owner can see what they are not using. */}
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
                        onClick={() =>
                          setPick(p => ({ ...p, category: p.category === c.category ? null : c.category }))
                        }
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
          </CardContent>
        </Card>
      ) : null}

      {ex.count ? (
        <Card>
          <CardContent className="px-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="eyebrow">Every entry</span>
              <span className="text-faint num text-[11px]">
                {filtering
                  ? `${filtered.length} of ${ex.count}` +
                    (openGroup ? ` · ${openGroup.label}` : '') +
                    (pick.category ? ` · ${EXPENSE_LABEL[pick.category]}` : '')
                  : ex.count}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {filtering ? (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear
                  </Button>
                ) : null}
                <div className="relative">
                  <SearchIcon className="text-faint pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                  <Input
                    className="h-8 w-[190px] pl-7 text-[12.5px]"
                    placeholder="Search notes"
                    aria-label="Search notes"
                    value={query}
                    onChange={e => {
                      setQuery(e.target.value)
                      setShowAllRows(false)
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Every row, not a recent few. A log you cannot audit in full is a
                log you cannot correct, and correcting it is most of what makes
                the coverage figure above worth reading. */}
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
                            <span className="text-faint text-[11px]">{EXPENSE_GROUP_LABEL[group]}</span>
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

              {filtered.length === 0 ? (
                <p className="text-muted-foreground px-4 py-6 text-center text-[13px]">
                  Nothing in {label} matches that.
                </p>
              ) : null}

              <div className="border-hairline flex flex-wrap items-center gap-2.5 border-t px-3.5 py-2">
                <span className="text-faint text-[12px]">
                  {filtered.length === 0
                    ? 'Try a different note, or clear the category.'
                    : showAllRows || filtered.length <= PAGE
                      ? `All ${filtered.length} shown, newest first.`
                      : `Showing ${PAGE} of ${filtered.length}, newest first.`}
                </span>
                {filtered.length > PAGE ? (
                  <Button variant="outline" size="xs" onClick={() => setShowAllRows(v => !v)}>
                    {showAllRows ? 'Show fewer' : `Show all ${filtered.length}`}
                  </Button>
                ) : null}
                {filtering && filtered.length ? (
                  <span className="text-faint num ml-auto text-[12px]">
                    {fmt(filteredRM, 'MYR')} of {fmt(ex.loggedRM, 'MYR')}
                  </span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-10">
          <CardContent className="text-center">
            <h2 className="num text-[16px] font-semibold">Nothing recorded in {label}</h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed">
              Groceries, fuel, eating out — the spending that is not the same every month. Rent,
              insurance and subscriptions are commitments and belong on Money; entering them here as
              well would count them twice against your income.
            </p>
            <Button size="sm" className="mt-4" onClick={() => openExpense()}>
              <PlusIcon />
              Add expense
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
