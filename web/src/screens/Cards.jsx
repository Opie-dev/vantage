/**
 * Credit cards — the accounts, what they are holding, and what falls due.
 *
 * TWO LIMITS ARE NOT ONE POOL, and that is why this is a screen. Adding the
 * limits together would make the tighter account disappear inside the total,
 * which is the one thing this page must never do: room free on one card cannot
 * pay the other's bill, it can only move the debt at a worse rate. So room is
 * stated per account and never totalled. What IS summed across accounts is debt
 * and what leaves — those add up honestly, because owing 5,000 on one card and
 * 2,000 on another really is owing 7,000. Headroom is the figure that does not.
 *
 * WHAT THE BILL SAYS IS NOT WHAT IS FREE. A statement showing a third of the
 * limit used can sit on an account with almost nothing left, because instalments
 * not yet billed keep blocking the limit until each month's principal is paid,
 * and no statement prints that total anywhere. `availableRM` is the figure that
 * does — see calc.js cardState() — and the hatched third band on each row is
 * the part of the limit no statement shows.
 *
 * ONE CARD, ONE ROW PER ACCOUNT. The header states what is committed across
 * every account and what falls due in the next thirty days; under it each
 * account is one row that opens its sheet; and the block at the foot names the
 * two limits by account and amount, so the rule above is read against the
 * figures it protects rather than in the abstract.
 */
import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { commitmentRows, commitmentsTotal, cycleGapDays } from '@/lib/calc'
import { fmt, fmtBare, ordinal, stateCaption } from '@/lib/format'
import { useVantage } from '@/lib/store'

import AccountRow from './money/AccountRow'
import AccountPanel from './money/AccountPanel'
import { Meta, MonthStrip, StateBadge } from './money/parts'

/**
 * The one paragraph this screen exists for, with the accounts named. Two
 * accounts: the looser limit cannot pay the tighter bill. One: its room is
 * stated alone, never added to a second. None with a limit: nothing to say.
 */
function TwoLimits({ rows }) {
  const withLimit = rows.filter(r => r.availableRM != null)
  if (!withLimit.length) return null
  const short = r => r.commitment.lender || r.name
  const cls =
    'text-muted-foreground border-hairline m-0 border-t pt-2.5 text-[12px] leading-relaxed text-pretty'
  // Ordered by room, so two accounts with the same room to the sen are still
  // two accounts: the rule is about there being two limits, not about one of
  // them being looser.
  const byRoom = [...withLimit].sort((a, b) => b.availableRM - a.availableRM)
  const loose = byRoom[0]
  const tight = byRoom[byRoom.length - 1]
  if (withLimit.length >= 2) {
    const la = loose.commitment.apr
    const ta = tight.commitment.apr
    const rate =
      la > ta
        ? `at ${la}% instead of ${ta}%`
        : la < ta
          ? `at ${la}% rather than ${ta}% — a cheaper rate on the same debt, not less of it`
          : `at the same ${la}%`
    return (
      <p className={cls}>
        <b className="text-foreground font-semibold">Two limits, not one pool.</b>{' '}
        {fmt(loose.availableRM, loose.cur)} free on the {short(loose)} account cannot pay the{' '}
        {short(tight)} bill — it can only move the debt, {rate}. Adding the limits together would
        make the tighter account disappear inside the total, which is the one thing this page must
        never do.
      </p>
    )
  }
  const r = withLimit[0]
  return (
    <p className={cls}>
      <b className="text-foreground font-semibold">One account, one limit.</b>{' '}
      {fmt(r.availableRM, r.cur)} is what is actually free on {r.name}
      {r.apparentFree != null ? `, where the bill would suggest ${fmt(r.apparentFree, r.cur)}` : ''}.
      It is stated on its own: a second account&rsquo;s room would be listed beside it, never added
      to it.
    </p>
  )
}

/**
 * What each cycle does to the month.
 *
 * TWO ACCOUNTS CLOSE ON DIFFERENT DAYS, and that is the whole point of putting
 * them in one table: a purchase made on the 7th lands on one bill and waits a
 * month on the other. The lead only compares where there IS something to
 * compare — with one account it states that account's own gap instead of
 * inventing a spread of nothing.
 *
 * CARRYING FIRST, not biggest first. An account that carries is the one where a
 * day costs money, so it leads regardless of what it happens to bill this month.
 */
function CycleCompare({ rows }) {
  const withCycle = rows.filter(r => r.cycle && r.commitment.statement_day && r.commitment.due_day)
  if (!withCycle.length) return null
  const ordered = [...withCycle].sort(
    (a, b) =>
      Number(b.state === 'CARRYING') - Number(a.state === 'CARRYING') ||
      (b.monthlyOut || 0) - (a.monthlyOut || 0),
  )

  let lead
  if (ordered.length === 1) {
    const r = ordered[0]
    const gap = cycleGapDays(r.commitment.statement_day, r.commitment.due_day)
    lead = `${r.name} closes on the ${ordinal(r.commitment.statement_day)} and falls due on the ${ordinal(r.commitment.due_day)} — ${gap} days in which a bill is known and not yet paid.`
  } else {
    const days = ordered.map(r => r.commitment.due_day)
    const spread = Math.max(...days) - Math.min(...days)
    lead = spread
      ? `These accounts fall due ${spread} day${spread === 1 ? '' : 's'} apart, so a purchase made between the two closing dates lands on one bill and waits a month on the other.`
      : `These accounts fall due on the same day, so nothing is gained by choosing between them on timing alone.`
  }

  return (
    <Card>
      <CardContent className="grid gap-2 px-4">
        <span className="eyebrow">What each cycle does to the month</span>
        <p className="text-muted-foreground m-0 text-[12px] leading-relaxed text-pretty">{lead}</p>
        <div className="grid gap-1">
          {ordered.map(r => (
            <div key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
              <span className="flex items-baseline gap-1.5">
                {r.name}
                <StateBadge row={r} />
              </span>
              <span className="num text-muted-foreground">
                closes {ordinal(r.commitment.statement_day)}, due {ordinal(r.commitment.due_day)}
              </span>
              <div className="flex-1" />
              <span className="num">{r.monthlyOut == null ? '—' : fmt(r.monthlyOut, r.cur)}</span>
            </div>
          ))}
        </div>
        <Meta>
          Every one of these dates is on the Calendar, beside what else leaves that month.
        </Meta>
      </CardContent>
    </Card>
  )
}

/**
 * One recurring charge, with the day IT leaves on.
 *
 * NOT `leavesOnDay`. For a collected charge that helper returns the collector's
 * day, which is right for the calendar and wrong here: this panel's argument is
 * that two charges on the same card can fall on different days, so each row has
 * to carry its own.
 */
function ChargeLine({ r }) {
  const day = r.commitment.due_day
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
      <span>
        {r.name}
        {day ? <Meta className="ml-1.5">due the {ordinal(day)}</Meta> : null}
        {r.everyMonths > 1 ? <Meta className="ml-1.5">every {r.everyMonths} months</Meta> : null}
      </span>
      <span className="num">{fmt(r.monthlyOut, r.cur)}</span>
    </div>
  )
}

export default function Cards() {
  const {
    state,
    openCommitment,
    deleteCommitment,
    openCardPlan,
    openCardStatement,
    openStatementImport,
  } = useVantage()

  const out = useMemo(() => commitmentsTotal(state, { kinds: ['REVOLVING'] }), [state])
  // The id and not the row: a row is rebuilt on every state change, so holding
  // one would pin a stale copy open behind a fresh list.
  // 'all', or an account id as a string.
  //
  // A TAB AND NOT A SHEET. The canvas puts a strip above everything switching
  // the page between the all-cards summary and one account's full page, and
  // cards-canvas-gaps.md §1 names this as the one gap that contradicts a
  // written decision — the old sheet's own header argued for an overlay.
  // Decided the other way: an account is a place you go, not a thing that
  // covers up what you were looking at.
  const [tab, setTab] = useState('all')
  const selected = out.rows.find(r => String(r.id) === tab) || null

  if (!out.rows.length) {
    return (
      <div className="grid gap-4">
        <MonthStrip />
        <Card>
          <CardContent className="grid gap-3 px-4 py-6">
            <span className="eyebrow">No card accounts</span>
            <p className="text-muted-foreground m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty">
              One account, however many pieces of plastic. Two cards sharing a limit is one
              account here, because the limit is what runs out — and the limit, the statement
              day and the due day all belong to the account rather than to the card.
            </p>
            <div>
              <Button size="sm" onClick={() => openCommitment({ kind: 'REVOLVING' })}>
                <PlusIcon />
                Add a card account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ACCOUNTS, not cards. This counted rows and called them cards, which is the
  // exact conflation `card_count` exists to end: a limit belongs to an account,
  // and two pieces of plastic can share one.
  const accounts = out.rows.length
  // Plastic — but only where every account has answered. A partial sum would read
  // as a total and undercount by exactly the accounts that never said, which is
  // the same mistake facing the other way. Printed only when it differs from the
  // account count: "2 accounts and 2 cards" says nothing the first half did not,
  // and the whole point of the figure is that the two can disagree.
  const counted = out.rows.map(r => r.commitment.card_count)
  const plastic = counted.every(n => n > 0) ? counted.reduce((t, n) => t + n, 0) : null
  // Recurring charges these accounts collect. They are counted on Commitments and
  // NOT here — this panel says where the money goes out through, never what it
  // costs, which is why it prints no total of its own alongside the ones above.
  // EVERY RECURRING CHARGE, not only the ones a card collects. Gating on
  // `collectedBy` hid the panel entirely from anyone whose charges are all
  // direct debits — and the contrast between the two is the panel's whole
  // argument, so the rows with no card are the ones that make it worth drawing.
  const recurring = commitmentRows(state).filter(r => r.commitment.kind === 'RECURRING')
  const collected = recurring.filter(r => r.collectedBy)
  const direct = recurring.filter(r => !r.collectedBy)

  return (
    <div className="grid gap-4">
      <MonthStrip />

      {/* Short labels, already stored: the lender where there is one, the
          account name otherwise — "Maybank", not "Maybank card account". */}
      {/* `orientation` is explicit and `flex-row` is not redundant: the rail is
          itself a vertical Tabs, and Tailwind's `group/tabs` variants match ANY
          ancestor carrying the class — so a nested strip inherits the rail's
          orientation and stacks its triggers down the page. */}
      <Tabs value={tab} onValueChange={setTab} orientation="horizontal">
        {/* The direction is a style and not a class on purpose: the rail's
            `group-data-[orientation=vertical]/tabs:flex-col` still matches from
            an ancestor, and tailwind-merge does not treat a variant class and a
            bare one as conflicting, so `flex-row` loses to it silently. */}
        <TabsList
          variant="line"
          className="h-9 w-fit justify-start gap-1 [&>button]:flex-none [&>button]:px-3"
          style={{ flexDirection: 'row' }}
        >
          <TabsTrigger value="all">All cards</TabsTrigger>
          {out.rows.map(r => (
            <TabsTrigger key={r.id} value={String(r.id)}>
              {r.commitment.lender || r.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {selected ? <AccountPanel row={selected} /> : null}
      {selected ? null : (
        <>

      <Card>
        <CardContent className="grid gap-3 px-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => openStatementImport()}>
              Import a statement
            </Button>
            <Button variant="outline" size="sm" onClick={() => openCommitment({ kind: 'REVOLVING' })}>
              <PlusIcon />
              Add a card account
            </Button>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="eyebrow">Committed across every card</span>
              <div className="num text-[30px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap">
                {fmt(out.owedRM, 'MYR')}
              </div>
              <div className="num text-muted-foreground mt-1 text-[11.5px]">
                {fmtBare(out.billedRM)} billed · {fmtBare(out.unbilledRM)} still to be · across{' '}
                {accounts} account{accounts === 1 ? '' : 's'}
                {plastic != null && plastic !== accounts ? ` and ${plastic} cards` : ''}
              </div>
            </div>
            <div className="text-right">
              <span className="eyebrow">Due in the next 30 days</span>
              {/* A loss only where something leaves: a red RM 0.00 on a month
                  nothing falls due would paint the absence of a bill as one. */}
              <div
                className={`num text-[22px] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap ${out.due30RM > 0 ? 'text-loss' : 'text-muted-foreground'}`}
              >
                {out.due30AtLeast ? 'at least ' : ''}
                {fmt(out.due30RM, 'MYR')}
              </div>
              <Meta className="num mt-1 block">{stateCaption(out.counts, out)}</Meta>
            </div>
          </div>

          {/* The stepper's caption, kept because it is about these two figures
              and never was about the control: they are the same debt read on two
              clocks, and a reader who takes them for one basis will read the gap
              between them as money going missing. */}
          <Meta className="block">
            What is due is keyed to each bill&rsquo;s own date; what is committed is today&rsquo;s.
          </Meta>

          <div>
            {out.rows.map(r => (
              <AccountRow
                key={r.id}
                r={r}
                onOpenSheet={id => setTab(String(id))}
                onEdit={openCommitment}
                onRemove={deleteCommitment}
                onAddPlan={openCardPlan}
                onAddStatement={openCardStatement}
              />
            ))}
          </div>

          <TwoLimits rows={out.rows} />
        </CardContent>
      </Card>

      {/* Side by side, as the canvas pairs them: one says WHEN each account
          takes money and the other says WHAT it takes. Either stands alone when
          the other has nothing to show. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CycleCompare rows={out.rows} />
      {recurring.length ? (
        <Card>
          <CardContent className="grid gap-2 px-4">
            <span className="eyebrow">Which account collects what</span>
            {out.rows.map(card => {
              const mine = collected.filter(r => r.collectedBy.id === card.id)
              if (!mine.length) return null
              return (
                <div key={card.id} className="grid gap-1">
                  <Meta>
                    {card.name} · leaves on the {ordinal(card.commitment.due_day)}
                  </Meta>
                  {mine.map(r => (
                    <ChargeLine key={r.id} r={r} />
                  ))}
                </div>
              )
            })}
            {/* No card involved. Drawn beside the collected ones rather than
                left out, because "this one does not touch a card" is the fact
                the panel exists to make visible. */}
            {direct.length ? (
              <div className="grid gap-1">
                <Meta>Direct debit — no card involved</Meta>
                {direct.map(r => (
                  <ChargeLine key={r.id} r={r} />
                ))}
              </div>
            ) : null}
            <p className="text-faint m-0 mt-1 max-w-[70ch] text-[11.5px] leading-relaxed text-pretty">
              These are already subtracted from income on Commitments and are not added again here
              — this says where the money goes out through, not what it costs. Move a direct debit
              to the other account and the day it leaves moves with it, which is the whole reason
              it is stored per account rather than per charge.
            </p>
          </CardContent>
        </Card>
      ) : null}
      </div>

      <p className="text-faint m-0 max-w-[78ch] text-[11.5px] leading-relaxed text-pretty">
        What leaves on a due date is the minimum where a balance is carried and the whole bill
        where the account settles in full. A recorded payment always wins over either — anywhere
        between the minimum and the whole bill — which is why the month on{' '}
        <span className="text-muted-foreground">Overview</span> reads the payment rather than this
        figure.
      </p>

        </>
      )}
    </div>
  )
}
