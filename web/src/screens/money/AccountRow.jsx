/**
 * One card account on the Credit cards screen.
 *
 * THE ROW IS THE CONTROL. Clicking anywhere on it opens the account's sheet,
 * which is why it is a div with role="button" and not a <button>: it contains
 * buttons of its own (add a plan, record a statement, edit, remove), and a
 * button inside a button is invalid HTML that browsers unnest unpredictably.
 * Every nested action stops the click, so the plus adds a plan and does not also
 * open the sheet — see RowAction's `stop`.
 *
 * FOUR FIGURES, AND ONE OF THEM IS OFTEN A DASH. Committed and Actually
 * available are always known once there is a limit. Carrying is known only
 * when a bill and a recorded payment prove it, so on an account whose bill has
 * nothing recorded against it the row prints an em dash and no badge — and the
 * caption underneath says why, because a missing badge with no explanation
 * reads as an omission rather than a fact.
 *
 * Nothing here is derived. Every figure is cardState()'s, so the row, the
 * sheet, the calendar and the header cannot disagree about the same account.
 */
import { ChevronRightIcon, FileTextIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { addMonthsISO } from '@/lib/calc'
import { availabilityTone, dfmt, fmt, fq, ordinal, pct1, symbol } from '@/lib/format'

import { BandBar, RowAction, StateBadge } from './parts'

/**
 * How far a due date is, in words. Negative days never print as a number: a
 * bill that was due is named by its date, because "in −11 days" is not a
 * sentence anyone reads twice.
 */
export function countdown(days, iso) {
  if (days == null) return ''
  if (days < 0) return `was due ${dfmt(iso)}`
  if (days === 0) return 'due today'
  if (days === 1) return 'in 1 day'
  return `in ${days} days`
}

/**
 * Why a row carries no badge, or a badge that needs a sentence. Null when the
 * state speaks for itself. The stale and the newer-reading sentences are
 * appended whatever the state, because a bill that closed at the bank and is
 * not here changes what every figure on the row means.
 */
export function rowCaption(r) {
  const c = r.commitment
  const S1 = r.statement
  const S0 = r.previousStatement
  const parts = []
  const unpaid = s =>
    `The bill of ${dfmt(s.statement_date)} fell due on ${dfmt(s.due_date)} and no payment is recorded against it. Record what was paid and this row can say whether the balance is carried.`
  if (r.evidence === 'NO_PAYMENT_RECORDED' && S1) parts.push(unpaid(S1))
  else if (r.evidence === 'PREVIOUS_UNPAID' && S0) parts.push(unpaid(S0))
  else if (r.evidence === 'FIRST_BILL') {
    parts.push(
      'One bill recorded. Whether its balance was carried in is decided by the bill before it — import that one and the state can be stated.',
    )
  } else if (r.evidence === 'NO_STATEMENTS') {
    parts.push(
      `No bill recorded. These figures read the balance you entered${c.balance_as_of ? ` on ${dfmt(c.balance_as_of)}` : ''}; a statement is what turns them into facts.`,
    )
  } else if (r.state === 'SETTLED' && r.bill?.timing === 'LATE') {
    const n = r.bill.lateDays
    parts.push(
      `Paid in full ${n} day${n === 1 ? '' : 's'} after the due date. The interest-free period is lost for the cycle that followed — that bill carries interest from each purchase's posting date.`,
    )
  }
  if (r.stale && S1) {
    parts.push(`A newer bill closed on ${dfmt(addMonthsISO(S1.statement_date, 1))} and is not here — import it.`)
  }
  if (r.balanceNewer && S1) {
    parts.push(
      `A balance of ${fmt(c.balance, r.cur)} was recorded on ${dfmt(c.balance_as_of)}, after the bill of ${dfmt(S1.statement_date)} closed. It does not move these figures — a bill is settled by a recorded payment, not by a reading.`,
    )
  }
  return parts.length ? parts.join(' ') : null
}

/** 'RM 15,000 · 15% · closes 6th, due 26th' — the limit without sen, as a bank prints it. */
export function termsLine(r) {
  const c = r.commitment
  const limit = c.credit_limit ? `${symbol(r.cur)}${fq(c.credit_limit)} · ` : ''
  // NO CARD NAMES HERE, though the canvas shows them. cards-canvas-gaps.md says
  // they can ride the "existing dead `note` column" — and `note` is not dead: on
  // the live account it holds a paragraph explaining that two cards share the
  // limit and that the balance excludes plans. Concatenating that into a terms
  // line gives a sentence where a spec line should be. Naming the cards needs a
  // field of its own, or nothing.
  return `${limit}${c.apr}% · closes ${ordinal(c.statement_day)}, due ${ordinal(c.due_day)}`
}

const ROW_PILL = 'px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase'

/**
 * When the next payment leaves, as a chip on the account's name.
 *
 * Nothing at all where nothing is owed: a countdown is a deadline, and drawing
 * one over an account that settles every cycle invents an urgency the card does
 * not have. `countdown()` already refuses to print a negative as a number, so a
 * bill that has gone past is named by its date instead.
 */
function dueBadge(r) {
  const d = r.dueNext
  if (!d || d.met || d.rm == null || d.rm <= 0) return null
  const text = countdown(d.days, d.iso)
  if (!text) return null
  return { text, tone: 'loss' }
}

/** The Due next stat: what leaves, and when. */
export function dueNextText(r) {
  const d = r.dueNext
  const cd = countdown(d.days, d.iso)
  if (d.met) return `minimum met${cd ? ` · ${cd}` : ''}`
  if (d.rm == null) return r.cycle ? `closes ${dfmt(r.cycle.closesOn)}` : '—'
  const when = cd ? ` · ${cd}` : r.commitment.due_day ? ` · on the ${ordinal(r.commitment.due_day)}` : ''
  return `${d.atLeast ? 'at least ' : ''}${fmt(d.rm, r.cur)}${when}`
}

/**
 * A figure and its date break between each other, never inside either: an
 * ellipsis would eat the date, and "was due 26 / Aug" reads as two facts.
 */
function Unsplit({ text }) {
  return text.split(' \u00b7 ').map((part, i) => (
    <span key={i}>
      {i ? ' \u00b7 ' : ''}
      <span className="whitespace-nowrap">{part}</span>
    </span>
  ))
}

export default function AccountRow({ r, onOpenSheet, onEdit, onRemove, onAddPlan, onAddStatement }) {
  const c = r.commitment
  const open = () => onOpenSheet(r.id)
  const caption = rowCaption(r)
  const carrying = r.state === 'CARRYING'
  const stats = [
    ['Committed', fmt(r.owed, r.cur), 'text-foreground'],
    [
      'Actually available',
      r.availableRM == null ? '—' : fmt(r.availableRM, r.cur),
      availabilityTone(r.utilisationPct),
    ],
    ['Due next', <Unsplit key="due" text={dueNextText(r)} />, 'text-muted-foreground'],
    [
      'Carrying',
      carrying ? `${fmt(r.carried, r.cur)}${c.apr == null ? '' : ` at ${c.apr}%`}` : '—',
      carrying ? 'text-loss' : 'text-faint',
    ],
  ]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${r.name}`}
      onClick={open}
      onKeyDown={e => {
        // Only the row's own keys: Enter on a focused action inside it already
        // clicked that action, and must not open the sheet as well.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="border-hairline focus-visible:ring-ring hover:bg-muted/50 grid cursor-pointer gap-2 rounded-sm border-t px-1.5 py-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-semibold">{r.name}</span>
        <StateBadge row={r} />
        {/* Plastic and limits are different quantities, and the canvas says so
            here rather than only in the sheet — this is the row you compare one
            account against another on. Absent when the count was never given:
            "1 CARD" asserted by default is the invention the nullable column
            exists to avoid. */}
        {c.card_count > 0 ? (
          <Badge variant="neutral" className={ROW_PILL}>
            {c.card_count === 1 ? '1 card' : `${c.card_count} cards, 1 limit`}
          </Badge>
        ) : null}
        {/* When it leaves, beside the name. The Due next stat says how much and
            when; this says only when, because that is the half you scan a list
            of accounts for. Toned loss only where something is actually owed —
            a countdown on a settled account is a deadline for nothing. */}
        {dueBadge(r) ? (
          <Badge variant={dueBadge(r).tone} className={ROW_PILL}>
            {dueBadge(r).text}
          </Badge>
        ) : null}
        {r.staleDays != null && r.staleDays > 7 ? (
          <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {r.staleDays}d old
          </Badge>
        ) : null}
        <div className="flex-1" />
        {/* One group, so a narrow row breaks before the terms and never between
            the pencil and the bin — half a toolbar on the next line reads as a
            second row of controls. */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="num text-muted-foreground text-[11.5px] whitespace-nowrap">{termsLine(r)}</span>
          <RowAction
            icon={PlusIcon}
            label={`Add an instalment plan to ${r.name}`}
            onClick={() => onAddPlan({ commitment_id: r.id })}
            stop
          />
          <RowAction
            icon={FileTextIcon}
            label={`Record a statement for ${r.name}`}
            onClick={() => onAddStatement({ commitment_id: r.id })}
            stop
          />
          <RowAction icon={PencilIcon} label={`Edit ${r.name}`} onClick={() => onEdit(c)} stop />
          <RowAction icon={TrashIcon} label={`Remove ${r.name}`} onClick={() => onRemove(r.id)} stop />
          <ChevronRightIcon aria-hidden="true" className="text-faint size-3.5 shrink-0" />
        </div>
      </div>

      {c.credit_limit ? <BandBar pct={r.bandPct} className="h-[7px]" /> : null}

      {/* The two readings of the same bar, at its two ends: how much of the
          limit is spoken for, and what is actually left. Both are needed
          because neither implies the other on a card carrying unbilled
          instalments — which is the whole argument of this screen. */}
      {c.credit_limit && r.utilisationPct != null ? (
        <div className="num text-faint flex justify-between text-[10.5px]">
          <span>{pct1(r.utilisationPct)} used</span>
          <span>{r.availableRM == null ? '' : `${fmt(r.availableRM, r.cur)} free`}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-3.5 gap-y-2.5">
        {stats.map(([label, value, tone]) => (
          <div key={label}>
            <div className="eyebrow">{label}</div>
            <div className={`num mt-0.5 text-[13.5px] font-medium ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      {caption ? (
        <p className="text-muted-foreground m-0 text-[12px] leading-relaxed text-pretty">{caption}</p>
      ) : null}
    </div>
  )
}
