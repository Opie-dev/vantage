/**
 * The pieces the six Money screens share.
 *
 * These lived at the top of Money.jsx while Income, Commitments, Credit cards and
 * Loans were four sections of one file. They are here now because the sections
 * became screens — see money-redesign-plan.md §3 — and a row action that looks
 * one way on Commitments and another on Loans is exactly the drift the split
 * makes easy and this module makes hard.
 *
 * THE ROW PRIMITIVES KNOW NOTHING ABOUT A MONTH. A label and a figure, a rule
 * above a total, an icon with its words in a tooltip — every figure they render
 * is derived in calc.js and handed in.
 *
 * The month chrome at the top of this file is the exception, and always was.
 * There is one piece of it now: MonthStrip, which is the whole month in five
 * segments and, since the stepper was removed, the only thing on a Money screen
 * that says which month you are looking at. It computes no figure of its own —
 * monthSegments() does that — and it takes the month as a prop rather than
 * reading one out of the store, because there is no longer one month to read.
 * See MonthStrip.
 */
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'
import { SPEND_UNKNOWN, currentMonth, monthSegments } from '@/lib/calc'
import { dfmt, fmt, monthLabel, ordinal, pct1, pctS } from '@/lib/format'
import { useVantage } from '@/lib/store'

/**
 * Where a screen's own sticky column begins: clear of the top bar, and nothing
 * else.
 *
 * A CONSTANT AGAIN, and smaller than it was. It used to be 60 + 52 — the top bar
 * plus the row of month controls pinned under it — and then briefly a measured
 * variable, while the strip itself was pinned and its height was whatever five
 * tiles happened to wrap to. Measured on a browser that came to 158px on a wide
 * window and 630px on a phone: 28% of a 1366x768 viewport and 74% of a 430x932
 * one, frozen over every Money screen. The strip scrolls now (see MonthStrip),
 * so the only thing still pinned is the 60px bar, and this is that number.
 */
export const STICKY_TOP = 'top-[60px]'

/** One colour per kind, so the eye can group without reading. */
export const KIND_COLOR = {
  LOAN: 'var(--chart-1)',
  REVOLVING: 'var(--loss)',
  RECURRING: 'var(--chart-5)',
}

/**
 * Why a month could not be measured, in one sentence each.
 *
 * Here rather than on Overview because two surfaces now say it — the strip on
 * every Money screen, and the Overview column — and a refusal that reads one way
 * in one place and another way six screens over is a reader deciding the app
 * does not know its own mind.
 */
export const SPEND_WHY = {
  [SPEND_UNKNOWN.NO_WALLET]:
    'No account is marked as a wallet, so there is nothing to measure the month against. Mark the account your pay lands in as a wallet on Assets.',
  [SPEND_UNKNOWN.NO_OPENING_READING]:
    'No balance reading before this month, so the window has no start. Record one on Assets and the month closes.',
  [SPEND_UNKNOWN.NO_CLOSING_READING]:
    'No balance reading since this month, so the window has no end. Record one on Assets and the month closes.',
  [SPEND_UNKNOWN.NO_CARD_READING]:
    'A card has no statement bracketing this window, so what it took on is unknown — and an unread card is not a card with no spending.',
}

/** The canvas's colour per segment, in the canvas's order. */
const SEG_COLOR = {
  income: 'var(--gain)',
  commitments: 'var(--chart-4)',
  saved: 'var(--chart-3)',
  expenses: 'var(--chart-2)',
  stayed: 'var(--loss)',
}

/**
 * The line under a segment's figure: its share of what arrived, and the fact
 * that makes the figure legible.
 *
 * The canvas wrote these against a fixture — "lands on the 25th", "ASB, EPF,
 * broker", "falling in August". Every one of those is bound to the real thing
 * here, and a clause whose fact is not recorded is DROPPED rather than filled
 * in: a strip that names a pay day nobody entered is worse than one that says
 * only what it knows.
 */
function subLine(seg, monthName) {
  const pct = seg.share == null ? null : pct1(seg.share)
  const join = parts => parts.filter(Boolean).join(' · ')

  if (seg.key === 'income') {
    // No percentage here: this IS the denominator, and "100.0% of itself" is
    // noise where the pay day and the payer are not.
    //
    // Distributions get their own clause rather than joining the list of names:
    // "net" belongs to a payslip and means net of its deductions, and the broker
    // deducted nothing. Naming them is not decoration — they can be most of the
    // figure, and then the employer's name alone stands over money it did not
    // pay.
    return (
      join([
        seg.facts.sources.length ? `${seg.facts.sources.join(', ')}, net` : null,
        seg.facts.distributions ? 'distributions from the broker' : null,
        seg.facts.payDay != null ? `lands on the ${ordinal(seg.facts.payDay)}` : null,
      ]) || 'what actually arrived'
    )
  }
  if (seg.key === 'commitments') return join([pct, `falling in ${monthName}`])
  // The accounts, whichever way the money went — the eyebrow above already says
  // which, and calc.js picks the list that matches it.
  if (seg.key === 'saved') return join([pct, seg.facts.accounts.join(', ') || null])
  if (seg.key === 'expenses') return join([pct, 'residual, measured'])
  // The one segment whose direction is not fixed, and it has THREE directions.
  // The canvas only ever drew a wallet that fell; a wallet that rose is the same
  // figure with the other sign and must not be printed as a fall — and a wallet
  // that ended where it started did neither. Zero used to fall through to "rose",
  // over a `+0.0%`, while overviewRows() called the same zero a fall on the
  // column one card below. One RM 0.00, two sentences, opposite directions.
  if (seg.rm === 0) return 'the wallet ended where it started'
  const fell = seg.rm < 0
  return join([
    // pctS rather than a hand-built sign: it drops the sign with the figure in
    // private mode, and gain-or-loss is the first thing a shoulder reads.
    seg.share == null ? null : pctS(fell ? -seg.share : seg.share),
    `the wallet ${fell ? 'fell' : 'rose'} this month`,
  ])
}

/**
 * What to record so the month can be measured, as the control that records it.
 *
 * A sentence naming a screen is a worse answer than the form itself, so the two
 * reading refusals open the balance-entry sheet from wherever the reader is
 * standing. NO_WALLET is the exception: being a wallet is a property of the
 * account, and Assets is where accounts are edited.
 *
 * IT OPENS ON THE READING THE REFUSAL IS ABOUT, not on a blank form. The sheet
 * defaults to the first account in the list and to today, and neither default is
 * the answer here: a BALANCE on the ASB account closes no wallet window, and a
 * reading dated today cannot give a month in the past a start. Following the
 * instruction would then leave the strip refusing for the same reason, with the
 * reader having done exactly what it asked — which is worse than a sentence,
 * because it spends their trust as well as their time.
 *
 * THE DATE IS THE END OF THE WINDOW THAT IS OPEN, which is the month end or
 * today, whichever came first — the same ceiling spendingFor() reconciles to,
 * because a reading cannot exist for a day that has not happened. A missing
 * OPENING reading is the mirror: it has to sit at or before the month starts, or
 * the window has no start to be bracketed from.
 */
function Fix({ reason, month }) {
  const { state, setTab, openAssetEntry, openCardStatement } = useVantage()
  if (reason === SPEND_UNKNOWN.NO_WALLET) {
    return (
      <Button variant="outline" size="sm" onClick={() => setTab('assets')}>
        Mark a wallet
      </Button>
    )
  }
  if (reason === SPEND_UNKNOWN.NO_CARD_READING) {
    return (
      <Button variant="outline" size="sm" onClick={() => openCardStatement()}>
        Record a statement
      </Button>
    )
  }
  // Whichever wallet the reader keeps. With more than one they all bracket the
  // same window, so any of them opens it; the account is still a field they can
  // change, and it now starts on an account that can actually close the month.
  const wallet = (state.assets || []).find(a => !a.archived && a.liquidity === 'WALLET')
  const { y, m } = month
  const p2 = n => String(n).padStart(2, '0')
  const monthStart = `${y}-${p2(m + 1)}-01`
  const monthEnd = `${y}-${p2(m + 1)}-${p2(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}`
  const today = new Date().toISOString().slice(0, 10)
  const date =
    reason === SPEND_UNKNOWN.NO_OPENING_READING
      ? monthStart
      : monthEnd < today
        ? monthEnd
        : today
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        openAssetEntry({
          type: 'BALANCE',
          date,
          // Only when there IS one. Without a wallet the reason would have been
          // NO_WALLET and this branch is unreachable, but an undefined asset_id
          // must fall back to the sheet's own default rather than blank the field.
          ...(wallet ? { asset_id: wallet.id } : {}),
        })
      }
    >
      Add a reading
    </Button>
  )
}

/**
 * The month, end to end, as five segments — one strip, all six Money screens.
 *
 * WHY IT IS HERE AND NOT ON A SCREEN. Every Money screen shows one segment of
 * one month in detail, and none of them can say what share of the month that
 * segment was. The strip is the sentence the six screens are clauses of, which
 * is only true if it is the same strip on all six — so it lives here, where no
 * screen has to opt in and the empty states get it too.
 *
 * IT IS ALSO THE ONLY THING THAT SAYS WHICH MONTH. The stepper that used to sit
 * above it is gone, and with it the one row on the page that named the month. So
 * the header row names it, beside the eyebrow: five screens are pinned to the
 * month that is happening and Expenses can be drilled into a past one, and a
 * strip that printed a month different from the figures beneath it would be the
 * worst of both.
 *
 * `month` IS A PROP, NOT A READ. THAT is the guarantee. The strip shows the
 * month its own screen shows, because its own screen hands it over — five pass
 * nothing and get currentMonth(), Expenses passes the month its chart is drilled
 * to. There is no shared month in the store any more to read instead, which is
 * what makes it impossible for the strip to contradict the page under it.
 *
 * IT NAMES ITS OWN WINDOW, right beside the month. Every figure below is
 * measured over the span two wallet readings bracket, and that span is NOT the
 * calendar month it is labelled with: spendingFor() opens it at the last reading
 * on or before the month started, which is normally a day in the month before.
 * Rendered against readings a fortnight either side it says "September 2026 …
 * Declared in RM 18,150.00" over a window that is mostly July and August.
 * Overview has always printed the dates beside its own copy of these figures;
 * since the strip became the only month statement on Income, Commitments, Credit
 * cards and Loans, it has to carry them too — in Overview's exact words, so the
 * two surfaces cannot drift into two descriptions of one window.
 *
 * IT SCROLLS. It was briefly pinned, inheriting the stepper's treatment, and the
 * treatment did not survive the change of contents: the stepper was one 52px row
 * of CONTROLS, which have to be reachable from wherever you have scrolled to, and
 * this is a STATEMENT of five tiles, read once at the top. Measured in a browser
 * it froze 218px over a 1366x768 window and 690px over a 430x932 one — 28% and
 * 74% of the viewport, before the screen's own content got a pixel. The negative
 * margin still bleeds it to the edges of <main>, whose padding is the same clamp;
 * change one and the other has to follow.
 *
 * A SEGMENT IS NEVER DRAWN WIDER THAN IT IS PRINTED. `share` is one expression
 * in monthSegments(), read twice here — once as text, once as a width. See
 * money-redesign-plan.md §2.4 for what happens when a label and a bar each carry
 * their own copy of one number.
 */
export function MonthStrip({ month }) {
  const { state, tab, setTab } = useVantage()
  const now = currentMonth()
  const { y, m } = month || now
  // Memoised on the same key Overview uses for the same call: this walks every
  // commitment, entry and event in the state, and it now does so on six screens
  // rather than one — including on every tab change, which changes nothing it
  // reads.
  const view = useMemo(() => monthSegments(state, y, m), [state, y, m])
  // 'March 2026' -> 'March'. The header row directly above already says the year.
  const monthName = monthLabel(y, m).split(' ')[0]
  // Only Expenses can be here, and only by drilling its own chart. What this
  // decides is a claim about the OTHER five screens, which have not moved.
  const drilled = y !== now.y || m !== now.m

  return (
    <section
      data-slot="month-strip"
      data-strip-month={`${y}-${String(m + 1).padStart(2, '0')}`}
      className="-mx-[clamp(14px,2.4vw,28px)] border-b px-[clamp(14px,2.4vw,28px)] pb-3"
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <div className="eyebrow shrink-0">The month, end to end · declared</div>
        {/* THE MONTH, PLAINLY. Nothing else on a Money screen says it now, so it
            carries the stepper's own weight and size rather than sitting in the
            eyebrow as a suffix — a reader who wants to know what month they are
            reading should not have to parse a label to find out. */}
        <div data-slot="month-name" className="num shrink-0 text-[13.5px] font-semibold">
          {monthLabel(y, m)}
        </div>
        {/* AND WHAT WAS ACTUALLY MEASURED, in Overview's words exactly. It sits
            against the month label rather than out at the end of the row because
            it qualifies it: the label is the month the figures are FOR, this is
            the span they were taken OVER, and the two are routinely different —
            an opening reading from the 26th of last month brackets this one
            perfectly well, and then most of the window is last month. In the
            refusal there is no window to state, and the sentence below says
            exactly which reading would make one. */}
        {view.reason ? null : (
          <div data-slot="month-window" className="num text-faint shrink-0 text-[11px]">
            Window {dfmt(view.spend.from)} to {dfmt(view.spend.to)} · {view.spend.days} days
          </div>
        )}
        <div className="bg-hairline h-px min-w-[12px] flex-1" />
        {/* The canvas's note, and it is only true while every page IS on this
            month. Drilling Expenses into the past is the one state the design
            allows where it is not — Overview is on today at that moment — so the
            note says what has actually happened instead of repeating a promise
            the reader can see broken by switching tabs. */}
        <div className="num text-faint shrink-0 text-[11px]">
          {drilled
            ? `this screen only — the other five are on ${monthLabel(now.y, now.m)}`
            : 'every page shows its own segment of this'}
        </div>
      </div>

      {view.reason ? (
        // NO FIGURE AT ALL, deliberately. Every tile below is a share of income
        // measured over the window two wallet readings bracket, and without a
        // window there is no such figure to print — not for the four that are
        // shares, and not for the income the shares are of. Printing the calendar
        // month's income under the same eyebrow would be a second derivation
        // wearing the first one's label, which is exactly the drift §2.4
        // catalogues. A sentence and the form that fixes it is the honest whole
        // strip, and it is one row tall rather than five tiles of nothing.
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-muted-foreground m-0 max-w-[86ch] flex-1 text-[12px] leading-relaxed text-pretty">
            <b className="text-foreground font-semibold">
              {monthName} has not been split into its five segments yet.
            </b>{' '}
            {SPEND_WHY[view.reason] || 'The window cannot be closed.'}
          </p>
          <Fix reason={view.reason} month={{ y, m }} />
        </div>
      ) : (
        /* FLEX RATHER THAN AN auto-fit GRID, and the reason is what the last row
            looks like. `repeat(auto-fit, minmax(168px, 1fr))` gives every track
            the same width, so five tiles in four columns left the fifth alone on
            row two with three empty tracks beside it — measured at 604x119px of
            nothing at 1024px wide. `flex-wrap` with a basis lets the tiles on a
            wrapped row grow into the space instead, so every row is full whatever
            the window does. */
        <div className="flex flex-wrap gap-2.5">
          {view.segments.map(seg => {
            // `pages`, not `tab`. Two tiles navigate somewhere without being that
            // screen's segment, and monthSegments() is where the difference is
            // decided and explained — this only has to not collapse it.
            const here = seg.pages.includes(tab)
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => setTab(seg.tab)}
                data-segment={seg.key}
                data-here={here ? 'true' : 'false'}
                className={`hover:bg-muted/40 hover:border-input min-w-0 grow basis-[156px] rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  here ? 'border-primary' : 'border-border'
                }`}
              >
                <div className="eyebrow mb-1">{seg.eyebrow}</div>
                <div className="num text-[19px] font-semibold tracking-[-0.02em]">
                  {fmt(seg.rm, 'MYR')}
                </div>
                <div
                  data-slot="segment-share"
                  className="text-muted-foreground mt-1 mb-2 text-[11px]"
                >
                  {subLine(seg, monthName)}
                </div>
                {/* No share, no bar — TRACK INCLUDED. An unknown proportion
                    drawn at zero width reads as a proportion of nothing, and an
                    empty rail on its own reads as exactly that: a bar filled to
                    0%. Nothing is known here, so nothing is drawn. Every tile
                    loses it together, since they share one denominator. */}
                {seg.share == null ? null : (
                  <div className="bg-muted h-[4px] overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      /* THE ONLY CLAMP, and it is about the track rather than the
                         money: a bar cannot be drawn past its own rail. The share
                         is one number, printed above at its true value — a segment
                         that overran what arrived fills the rail and says by how
                         much in words. */
                      style={{
                        width: `${Math.min(100, seg.share)}%`,
                        background: SEG_COLOR[seg.key],
                      }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
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
 *
 * `stop` is for an action that sits inside a row which is itself a control: on
 * Credit cards the whole row opens the account's sheet, and a click on the plus
 * inside it must not also open the sheet. The pattern lives here so every action
 * on such a row stops the event the same way rather than each remembering to.
 */
export function RowAction({ icon: Icon, label, onClick, stop = false }) {
  const handle = stop
    ? e => {
        e.stopPropagation()
        onClick?.(e)
      }
    : onClick
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={handle}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * What a card's state is, as a chip — or nothing.
 *
 * Shared by the account row and the sheet so the two cannot disagree about the
 * same card. UNKNOWN renders nothing on purpose: a chip saying "not known" would
 * be read as a state, and the caption under the row is where the absence is
 * explained. "Paid late" is its own chip because the balance was proven cleared
 * but the interest-free period was lost for the cycle after it.
 */
export function StateBadge({ row, className = '' }) {
  const cls = `px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase ${className}`
  if (row.state === 'CARRYING') {
    return <Badge variant="loss" className={cls}>Carrying</Badge>
  }
  if (row.state === 'SETTLED') {
    return row.bill?.timing === 'LATE' ? (
      <Badge variant="cash" className={cls}>Paid late</Badge>
    ) : (
      <Badge variant="gain" className={cls}>Paid in full</Badge>
    )
  }
  return null
}

/**
 * The three bands of a card's limit in one bar: carried, billed and unpaid, and
 * the instalment principal not yet billed. `pct` is the row's `bandPct`.
 *
 * A zero-width band is hidden rather than drawn at 0%, because the 1px gap
 * between bands would otherwise leave a sliver where nothing is — an account
 * that carries nothing must not show a hairline of loss colour.
 */
export function BandBar({ pct, className = '' }) {
  const bands = ['band-1', 'band-2', 'band-3']
  return (
    <div className={`bg-muted flex gap-px overflow-hidden rounded-full ${className}`}>
      {bands.map((band, i) => (
        <div key={band} className={band} style={{ width: `${pct[i] || 0}%` }} hidden={!(pct[i] > 0)} />
      ))}
    </div>
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
 * section — Credit cards has its accounts and, below them, which account collects
 * what; Loans has one card per loan. There is no cycle panel: what each cycle
 * does to the month was drawn on the canvas and never built. What changed is
 * that folding is now a convenience rather than the only way to see past a
 * section to the one below it.
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
