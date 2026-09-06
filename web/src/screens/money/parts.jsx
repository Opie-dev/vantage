/**
 * The pieces the six Money screens share.
 *
 * These lived at the top of Money.jsx while Income, Commitments, Credit cards and
 * Loans were four sections of one file. They are here now because the sections
 * became screens — see money-redesign-plan.md §3 — and a row action that looks
 * one way on Commitments and another on Loans is exactly the drift the split
 * makes easy and this module makes hard.
 *
 * NOTHING HERE KNOWS WHAT A MONTH IS. These are presentation primitives only: a
 * label and a figure, a rule above a total, an icon with its words in a tooltip.
 * Every figure they render is derived in calc.js and passed in already formatted.
 */
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  PlusIcon,
} from 'lucide-react'
import { monthLabel } from '@/lib/format'
import { useVantage } from '@/lib/store'

/** Where the sticky month bar ends and a screen's own sticky column can begin. */
export const STICKY_TOP = 'top-[112px]'

/** One colour per kind, so the eye can group without reading. */
export const KIND_COLOR = {
  LOAN: 'var(--chart-1)',
  REVOLVING: 'var(--loss)',
  RECURRING: 'var(--chart-5)',
}

/**
 * The month control, on every Money screen that is scoped to one.
 *
 * ONE BAR, ONE MONTH, FIVE SCREENS. It reads and writes the shared month in the
 * store rather than holding its own, so stepping back on Expenses moves the
 * statement on Overview too. That was free when these were sections of one
 * screen — the bar said "Governs both halves" and meant it — and it is the thing
 * that had to be rebuilt deliberately once they became separate tabs.
 *
 * The negative margin bleeds it to the edges of <main>, whose padding is the same
 * clamp; change one and the other has to follow. It sits at top-[60px] because
 * the top bar above it is sticky at 0 and 60 tall, which is also why a sticky
 * column on a screen that renders this bar starts at STICKY_TOP and not higher.
 */
export function MonthStepper({ note }) {
  const { moneyMonth, setMoneyMonth, stepMoneyMonth } = useVantage()
  const { y, m } = moneyMonth
  const now = new Date()
  const thisMonth = y === now.getFullYear() && m === now.getMonth()

  return (
    <div className="bg-background/85 sticky top-[60px] z-10 -mx-[clamp(14px,2.4vw,28px)] flex flex-wrap items-center gap-2 border-b px-[clamp(14px,2.4vw,28px)] py-2.5 backdrop-blur-md">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => stepMoneyMonth(-1)}
        aria-label="Previous month"
      >
        <ChevronLeftIcon />
      </Button>
      <span className="num min-w-[140px] text-center text-[13.5px] font-semibold">
        {monthLabel(y, m)}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => stepMoneyMonth(1)}
        aria-label="Next month"
      >
        <ChevronRightIcon />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={thisMonth}
        onClick={() => setMoneyMonth({ y: now.getFullYear(), m: now.getMonth() })}
      >
        This month
      </Button>
      {note ? <span className="text-faint ml-auto text-[11px]">{note}</span> : null}
    </div>
  )
}

/**
 * An action on a row: an icon, with the words in a tooltip and on the button's
 * accessible name.
 *
 * A row already carries a name, an amount, a rate and a date, and spelling out
 * "Edit" and "Remove" beside all of that competes with the figures the row
 * exists to show. The label is not dropped, only moved to where it is asked for.
 *
 * Nothing here predicts whether the action will succeed. The server refuses to
 * delete an income source that has recorded payments and says why, and that
 * refusal arrives as a toast from mutate() — a rule enforced in one place cannot
 * drift from a copy of itself in another.
 */
export function RowAction({ icon: Icon, label, onClick }) {
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

export function Meta({ children, className = '' }) {
  return <span className={`text-faint text-[11.5px] ${className}`}>{children}</span>
}

export function Line({ label, value, tone = '', strong = false, rule = false }) {
  return (
    <div
      className={`flex items-baseline gap-3 text-[12.5px] ${rule ? 'border-hairline border-t pt-1.5' : ''}`}
    >
      <span className={`flex-1 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`num ${tone} ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

/**
 * The header of a section that can be folded away.
 *
 * Kept from the one-screen layout because a screen can still hold more than one
 * section — Credit cards has an account list and a cycle panel, Loans has one
 * card per loan. What changed is that folding is now a convenience rather than
 * the only way to see past a section to the one below it.
 */
export function SectionHead({ id, open, onToggle, label, badge, summary, add, addLabel }) {
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="hover:bg-muted/40 -mx-1.5 flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md px-1.5 py-1 text-left transition-colors"
      >
        <Chevron className="text-muted-foreground size-3.5 shrink-0" />
        <span className="eyebrow">{label}</span>
        {badge}
        <span className="text-faint text-[11px]">{summary}</span>
      </button>
      {add ? (
        <Button variant="outline" size="icon-sm" aria-label={addLabel} title={addLabel} onClick={add}>
          <PlusIcon />
        </Button>
      ) : null}
    </div>
  )
}
