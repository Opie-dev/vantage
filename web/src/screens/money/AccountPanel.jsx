/**
 * One card account, opened in full.
 *
 * A PANEL BEHIND A TAB, NOT A SHEET. Credit cards is a rail entry, and that
 * entry lists the accounts; this is one of them opened over the list, so the
 * list stays behind it and a second account is one dismissal away rather than a
 * navigation. What the rail entry bought was room for the list and its totals —
 * two limits that are not one pool — not a page per piece of plastic.
 *
 * NOTHING HERE IS DERIVED. Every figure and every state is cardState()'s, read
 * off the row the screen already holds, so the sheet cannot disagree with the
 * row it was opened from, the calendar, or the header above them. What the
 * sheet adds is the sentence under each figure: why the cost is an em dash,
 * which bill a payment is missing against, what the third band hides.
 */
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { addMonthsISO, billFor, cardFloat, commitmentRows, daysBetween } from '@/lib/calc'
import {
  availabilityTone,
  dfmt,
  dfmtMonth,
  fmt,
  fmtBare,
  fq,
  monthYear,
  ordinal,
  pct0,
  pct1,
  symbol,
} from '@/lib/format'
import { useVantage } from '@/lib/store'

import { BandBar, Meta, RowAction, StateBadge } from './parts'

const PILL = 'px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase'

/**
 * One band of the limit, as a dot, a figure and a sentence. The dot takes the
 * same utility the bar does, so a legend cannot drift from the bar it explains;
 * the third is hollow because that band appears on no bill.
 */
function BandLine({ band, hollow = false, value, label }) {
  const dot = hollow ? 'border border-[color:var(--loss)] bg-transparent' : band
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`mt-1 size-2 shrink-0 rounded-full ${dot}`} />
      <span className="num text-[12.5px] font-semibold">{value}</span>
      <Meta className="min-w-0 flex-1">{label}</Meta>
    </div>
  )
}

/**
 * The cycle as a line rather than two dates.
 *
 * A BILL AND A DUE DATE ARE NOT THE SAME EVENT, and reading them as two rows
 * makes it easy to plan against the wrong one. Drawn in order — the bill that
 * closed, today, when it falls due, when the next one closes — the gap you are
 * actually spending into is the thing the eye lands on.
 *
 * Positions are proportional to real days, so a due date that is nearly here
 * looks nearly here. Every marker is clamped into the window it draws: a marker
 * off the end of its own line reads as a bug rather than as history.
 *
 * The due marker speaks in the past tense once the date has gone, and is hot
 * only while the bill is live: a due date behind today is history, not a
 * warning. A settled bill gets its payment on the line, because "paid in full"
 * before "was due" is the whole story of a card used as a payment method.
 */
function Timeline({ row }) {
  const at = iso => new Date(`${iso}T00:00:00Z`).getTime()
  const s = row.statement
  const bill = row.bill
  const closedISO = s ? s.statement_date : null
  const dueISO = s ? s.due_date : null
  const live = !!(s && s.live)
  const settled = !!(bill && bill.settled)

  let dueLabel
  if (!live) dueLabel = settled ? 'was due' : `${fmt(row.minimum, row.cur)} was due`
  else if (settled) dueLabel = 'due'
  else if (row.dueNext.met) dueLabel = 'minimum met'
  else dueLabel = `${fmt(row.dueNext.rm, row.cur)} ${row.state === 'SETTLED' ? 'in full' : 'minimum'}`

  const today = Date.now()
  /* SORTED BY DATE, because the dots are positioned by date and the labels are
     laid out in array order. Left unsorted they disagree the moment today moves
     past the due date — the dot sits fourth on the line while its label sits
     second underneath, which reads as a rendering bug rather than as a month
     further along than you thought. */
  const marks = [
    closedISO && { iso: closedISO, label: 'bill closed', hot: true },
    { iso: null, label: 'today', now: true },
    settled && bill.settledOn && { iso: bill.settledOn, label: 'paid in full' },
    dueISO && { iso: dueISO, label: dueLabel, hot: live },
    { iso: row.cycle.closesOn, label: 'next closes' },
    { iso: row.cycle.dueOn, label: 'and is due' },
  ]
    .filter(Boolean)
    .map(m => ({ ...m, t: m.iso ? at(m.iso) : today }))
    .sort((a, b) => a.t - b.t)

  const times = marks.map(m => m.t)
  const start = Math.min(...times)
  const end = Math.max(...times)
  const span = end - start || 1
  const pos = t => Math.max(0, Math.min(100, ((t - start) / span) * 100))

  return (
    <div className="mt-3">
      <div className="relative h-[3px] rounded-full" style={{ background: 'var(--muted)' }}>
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${pos(today)}%`, background: 'var(--loss)' }}
        />
        {marks.map((m, i) => (
          <span
            key={i}
            className="absolute size-[9px] -translate-x-1/2 rounded-full"
            style={{
              left: `${pos(times[i])}%`,
              top: '-3px',
              background: m.hot || m.now ? 'var(--loss)' : 'var(--background)',
              border: `1.5px solid ${m.hot || m.now ? 'var(--loss)' : 'var(--border)'}`,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1">
        {marks.map((m, i) => (
          <span key={i} className="text-[10.5px] leading-tight">
            {/* The date on top, the word underneath — "today / today" reads as a
                bug, and the canvas shows the date because knowing WHERE today
                falls between the two dates either side of it is the point. */}
            <span className={m.now ? 'num text-loss font-semibold' : 'num'}>
              {m.iso ? dfmt(m.iso) : dfmt(new Date().toISOString().slice(0, 10))}
            </span>
            <span className="text-faint block">{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * What leaves next, as a chip on the cycle's head. The figure is dueNext's —
 * the same one the row, the calendar and the header print — so the chip can
 * only ever restate it, in capitals, with the tone the state earns: a carried
 * bill is a loss, an unproven one is a caution, a settled one is done.
 */
function duePill(row) {
  const s = row.statement
  const d = row.dueNext
  const upper = iso => dfmt(iso).toUpperCase()
  if (s && row.bill && row.billedUnpaid > 0) {
    // A carried bill past its date names what is still owed on it, whether
    // its due figure has moved to the next cycle (past the grace, dueNext is
    // the next minimum) or is still inside the four days.
    const pastDue = d.basis === 'BILL' ? d.days < 0 : !row.open
    if (row.state === 'CARRYING' && pastDue) {
      return {
        text: `${fmt(row.billedUnpaid, row.cur)} PAST DUE SINCE ${upper(s.due_date)}`,
        tone: 'loss',
      }
    }
    if (d.basis === 'BILL') {
      if (d.days >= 0) {
        const when = d.days === 0 ? 'TODAY' : `IN ${d.days} DAY${d.days === 1 ? '' : 'S'}`
        if (d.met) return { text: `MINIMUM MET · DUE ${when}`, tone: 'neutral' }
        return {
          text: `${d.atLeast ? 'AT LEAST ' : ''}${fmt(d.rm, row.cur)} DUE ${when}`,
          tone: row.state === 'CARRYING' ? 'loss' : 'neutral',
        }
      }
      if (d.met) return { text: `MINIMUM MET · WAS DUE ${upper(s.due_date)}`, tone: 'neutral' }
      return {
        text: `${d.atLeast ? 'AT LEAST ' : ''}${fmt(d.rm, row.cur)} WAS DUE ${upper(s.due_date)}`,
        tone: 'cash',
      }
    }
  }
  if (row.bill && row.bill.settled && row.bill.settledOn) {
    return { text: `PAID ${upper(row.bill.settledOn)}`, tone: 'gain' }
  }
  if (row.cycle) return { text: `NEXT BILL CLOSES ${upper(row.cycle.closesOn)}`, tone: 'neutral' }
  return null
}

/** Which limb of BNM 13.1 bound the minimum — or that the bank printed it. */
function minimumNote(row) {
  const m = row.minimumDetail
  let note
  if (row.minimumIsStated) note = 'as the bill printed it'
  else if (m.limb === 'PCT') {
    note = `${m.pct}% of the revolving balance${m.instalments > 0 ? ', plus contracted instalments in full' : ''}`
  } else if (m.limb === 'FLOOR') {
    note = `${m.pct}% of the balance or ${fmt(m.floor, row.cur)}, whichever is higher`
  } else if (m.limb === 'BILLED') {
    note = `everything billed — less than the ${fmt(m.floor, row.cur)} floor`
  } else note = 'nothing is billed'
  // A settling account never pays the minimum: the figure is what the bill
  // printed, and the sentence says it was never the amount that left.
  return row.state === 'SETTLED' ? `${note} — never used` : note
}

/** What happened to the bill: paid, part paid, or still asked for. */
function statementNote(row) {
  const s = row.statement
  const b = row.bill
  if (!s) return 'no bill recorded yet'
  if (b.settled) {
    const on = `paid in full on ${dfmtMonth(b.settledOn)}`
    if (b.timing === 'LATE') {
      return `${on}, ${b.lateDays} day${b.lateDays === 1 ? '' : 's'} late — the next bill will carry finance charges for those days`
    }
    if (b.timing === 'IN_GRACE') return `${on}, inside the four-day grace`
    const early = daysBetween(b.settledOn, s.due_date)
    return early > 0 ? `${on}, ${early} day${early === 1 ? '' : 's'} early` : `${on}, on the due date`
  }
  if (b.paidRM > 0) {
    const last = b.payments[b.payments.length - 1]
    return `${fmt(b.paidRM, row.cur)} paid on ${dfmtMonth(last.date)} · ${fmt(b.billedUnpaid, row.cur)} still to go`
  }
  return s.live
    ? `what the bill asked for on ${dfmtMonth(s.statement_date)}`
    : `was due ${dfmtMonth(s.due_date)} — no payment recorded`
}

/**
 * The cost cell. AN EM DASH IS NOT A ZERO: a settled card has no cost, an
 * unproven one has no figure, and only a carried balance has a number — and
 * the sentence under the dash says which of the two it is.
 */
function costCell(row) {
  const c = row.commitment
  const s = row.statement
  const s0 = row.previousStatement
  if (row.state === 'CARRYING') {
    if (c.apr == null) return { value: '—', cls: 'text-faint', note: 'no rate recorded' }
    if (!(c.apr > 0)) {
      return {
        value: fmt(0, row.cur),
        cls: 'text-muted-foreground',
        perMonth: true,
        note: 'carried at 0% — a promotional rate, so nothing is charged while it lasts',
      }
    }
    return {
      value: fmt(row.costOfCarrying, row.cur),
      cls: 'text-loss',
      perMonth: true,
      note: `${pct1(c.apr)} on the revolving band only`,
    }
  }
  if (row.state === 'SETTLED') {
    return {
      value: '—',
      cls: 'text-faint',
      note: 'an em dash, not a zero: nothing is carried, so there is no cost',
    }
  }
  const unpaid = bill =>
    `no payment recorded against the bill of ${dfmt(bill.statement_date)} — record one and this can be stated`
  const note =
    row.evidence === 'NO_PAYMENT_RECORDED' && s
      ? unpaid(s)
      : row.evidence === 'PREVIOUS_UNPAID' && s0
        ? unpaid(s0)
        : row.evidence === 'FIRST_BILL'
          ? 'one bill so far — whether a balance was carried into it needs the one before'
          : 'no bill recorded — carrying cannot be read from a balance alone'
  return { value: '—', cls: 'text-faint', note }
}

/** The three legend sentences, one per band, by what the state can say. */
function bandLabels(row) {
  const c = row.commitment
  const s = row.statement
  const apr = c.apr

  let b1
  if (row.state === 'CARRYING') {
    b1 =
      apr > 0
        ? `revolving, at ${apr}% — costs ${fmt(row.costOfCarrying, row.cur)} a month`
        : apr === 0
          ? 'revolving, at 0% — a promotional rate'
          : 'revolving — no rate recorded'
  } else if (row.state === 'SETTLED') b1 = 'revolving — nothing is carried'
  else if (s) {
    // The bill a payment is missing against: the one before, when the live
    // bill's state is decided by it.
    const at = row.evidence === 'PREVIOUS_UNPAID' && row.previousStatement ? row.previousStatement : s
    b1 = `revolving — not known until a payment is recorded against the bill of ${dfmt(at.statement_date)}`
  } else b1 = 'revolving — not known; no bill recorded yet'

  let b2
  if (s) {
    if (row.billedInterestFree > 0) {
      if (s.live) b2 = `billed and unpaid, due on the ${ordinal(Number(s.due_date.slice(8, 10)))}`
      else if (row.bill.paidRM > 0) {
        b2 = `billed on ${dfmt(s.statement_date)}, was due ${dfmt(s.due_date)} — ${fmt(row.bill.paidRM, row.cur)} paid against it`
      } else {
        b2 = `billed on ${dfmt(s.statement_date)}, was due ${dfmt(s.due_date)} — no payment recorded`
      }
    } else if (row.state === 'CARRYING' && row.billedUnpaid > 0) {
      // Under 13.4 the whole unpaid bill is the carried base, so this band is
      // empty by construction, not because the bill was paid.
      b2 = 'billed and unpaid — the whole of it is carried, above'
    } else b2 = `billed and unpaid — nothing outstanding on the bill of ${dfmt(s.statement_date)}`
  } else if (row.basis === 'READING') {
    b2 = `the balance you recorded${c.balance_as_of ? ` on ${dfmt(c.balance_as_of)}` : ''}`
  } else b2 = 'no balance recorded'

  const b3 =
    row.blocked > 0 ? 'unbilled instalment principal, still blocking the limit' : 'unbilled instalments — none'
  return [b1, b2, b3]
}

/**
 * The sentence under the bar. THE THIRD BAND IS THE ONE NO STATEMENT SHOWS:
 * a bill reading a third used can sit on an account with almost nothing free,
 * because the unbilled principal keeps blocking the limit until each month's
 * share is repaid. Where nothing is hidden, saying so is worth as much —
 * especially beside an account where it is not true.
 */
function bandNote(row, other) {
  const c = row.commitment
  const s = row.statement
  const limit = c.credit_limit
  const parts = []
  if (limit && s && row.blocked > 0) {
    const release =
      c.limit_release === 'ON_SETTLEMENT'
        ? `${fmt(row.blocked, row.cur)} comes back only as each plan finishes${row.plansAt
            .filter(p => p.blocked > 0)
            .map(p => ` — ${p.name} in ${monthYear(p.endsOn)}`)
            .join('')}.`
        : `It comes back ${fmt(row.releasePerMonth, row.cur)} a month, as each instalment’s principal is paid.`
    parts.push(
      `The third band is the one no statement shows you. The bill says ${fmt(s.closing_balance, row.cur)} against ${fmt(limit, row.cur)} and reads as ${pct0(row.apparentPct)} used. Add the instalments not yet billed and the account is ${pct1(row.utilisationPct)} used, with ${fmt(row.availableRM, row.cur)} free rather than ${fmt(row.apparentFree, row.cur)}. ${release}`,
    )
  } else if (limit && row.blocked === 0 && row.basis !== 'NONE') {
    const beside = other
      ? ` That is worth stating precisely because it is not true of the ${other.commitment.lender || other.name} account.`
      : ''
    // Named by what the figure actually reads: a card with no bill has only the
    // balance the user typed, and "the statement says" would name a paper that
    // does not exist. With neither there is nothing to compare, so no sentence.
    const source = s ? 'the statement' : 'the balance you recorded'
    parts.push(
      `Nothing is hidden behind the third band here, so what ${source} says is free and what is actually free are the same figure — ${fmt(row.availableRM, row.cur)}.${beside}`,
    )
  }
  if (row.balanceNewer && s) {
    parts.push(
      `A balance of ${fmt(c.balance, row.cur)} was recorded on ${dfmt(c.balance_as_of)}, after the bill of ${dfmt(s.statement_date)} closed. It does not move these figures — a bill is settled by a recorded payment, not by a reading.`,
    )
  }
  return parts.length ? parts.join(' ') : null
}

/**
 * What the card took on over the cycle that just closed.
 *
 * THIS IS WHY EXPENSES LAGS, and it is the only place the app can say so. Money
 * spent on a card in July leaves your account in August, so the residual — which
 * reads wallet balances — reports it a month late and looks wrong to anyone who
 * lived the month. Two closing balances and the payment between them give the
 * whole of a cycle's card activity in one subtraction, with no transaction ever
 * entered.
 *
 * THE VOICE IS THE STATE'S, NOT THE ARITHMETIC'S. A card settled every cycle
 * still carries float, and the panel says so in a different register: the
 * figure is spending waiting to leave the wallet, not debt, so it is not painted
 * as a loss. cardFloat decides which from the bill before, by the same rule as
 * the badge, so the two cannot disagree about the same card.
 */
function Float({ row }) {
  const { state } = useVantage()
  const f = cardFloat(state, row.id)
  if (!f) return null

  if (f.reason) {
    return (
      <div className="border-hairline border-t pt-4">
        <span className="eyebrow">Float, over the cycle just closed</span>
        <p className="text-muted-foreground mt-2 mb-0 text-[12px] leading-relaxed text-pretty">
          {f.reason === 'NO_STATEMENTS'
            ? 'No bill recorded yet. This reads what was owed on two dates, so it needs two.'
            : 'One bill recorded. A second gives the window — until then there is a balance but no movement, and a float from a single reading would be the balance wearing another name.'}
        </p>
      </div>
    )
  }

  const settled = f.voice === 'SETTLED'
  const carrying = f.voice === 'CARRYING'
  const ps = f.payments || []
  const paidLabel =
    ps.length === 0
      ? 'Paid off it'
      : ps.length === 1
        ? `Paid off it on ${dfmtMonth(ps[0].date)}`
        : ps.length === 2
          ? `Paid off it on ${dfmtMonth(ps[0].date)} and ${dfmtMonth(ps[1].date)}`
          : `Paid off it in ${ps.length} payments, ${dfmtMonth(ps[0].date)} to ${dfmtMonth(ps[ps.length - 1].date)}`

  const lead = settled
    ? `A card settled every cycle still carries float. The balance closed at ${fmt(f.owedAfter, f.cur)} having opened at ${fmt(f.owedBefore, f.cur)}, and the whole of the opening balance was paid. Float is not debt — it is spending that has happened and has not yet left your wallet.`
    : `Owed went from ${fmt(f.owedBefore, f.cur)} to ${fmt(f.owedAfter, f.cur)} while ${f.paidRM > 0 ? `${fmt(f.paidRM, f.cur)} was paid off it` : 'no payment was recorded against it'}. That difference is spending and charges that have already happened and have not left your account — it is the whole of last month’s card activity, in one subtraction. Two closing balances. No transaction was needed to know it.`
  const note = settled
    ? 'Small and steady, which is what a card used as a payment method rather than as credit looks like. The float still belongs to the month the money leaves the wallet, not the month the card was swiped.'
    : `This is why Expenses lags: ${fmt(f.rm, f.cur)} was lived in ${f.livedMonth} and pays in ${f.paysMonth}. The residual on Expenses reports the money leaving your wallet, and the card is where that promise waits.`

  const rows = [
    {
      label: `Owed on ${dfmtMonth(f.from)}`,
      value: fmt(f.owedBefore, f.cur),
      tone: 'text-muted-foreground',
    },
    {
      label: paidLabel,
      value: f.paidRM > 0 ? fmt(-f.paidRM, f.cur) : fmt(0, f.cur),
      tone: f.paidRM > 0 ? 'text-gain' : 'text-muted-foreground',
    },
    { label: `Owed on ${dfmtMonth(f.to)}`, value: fmt(f.owedAfter, f.cur), tone: 'text-muted-foreground' },
  ]

  return (
    <div className="border-hairline border-t pt-4">
      <span className="eyebrow">Float, over the cycle just closed</span>
      <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
        <span
          className={`num text-[26px] leading-none font-semibold ${carrying ? 'text-loss' : 'text-muted-foreground'}`}
        >
          {f.rm >= 0 ? '+' : ''}
          {fmt(f.rm, f.cur)}
        </span>
        <Meta className="num">
          {dfmtMonth(f.rangeStartISO)} → {dfmtMonth(f.to)}
        </Meta>
      </div>
      <p className="text-muted-foreground mt-2 mb-2.5 text-[12.5px] leading-relaxed text-pretty">
        {lead}
      </p>
      <div>
        {rows.map(r => (
          <div
            key={r.label}
            className="border-hairline flex items-baseline justify-between gap-3 border-t py-[7px] text-[12.5px]"
          >
            <span>{r.label}</span>
            <span className={`num ${r.tone}`}>{r.value}</span>
          </div>
        ))}
        <div className="border-border flex items-baseline justify-between gap-3 border-t py-[9px] text-[12.5px] font-semibold">
          <span>Spent on the card in {f.livedMonth}</span>
          <span className={`num ${carrying ? 'text-loss' : 'text-foreground'}`}>{fmt(f.rm, f.cur)}</span>
        </div>
      </div>
      <p className="text-faint m-0 mt-2.5 text-[11px] leading-relaxed text-pretty">{note}</p>
    </div>
  )
}

/**
 * One card account, opened from its row on Credit cards.
 *
 * NOT A FIFTH RAIL ITEM. Two cards do not justify a screen, and commit 654ad24
 * took Expenses off the rail for the same reason — two doors into one room read
 * as two rooms to everyone but their author.
 *
 * The three-band bar is the whole argument of the card work. Carried at APR,
 * billed and unpaid but interest-free, and instalment principal NOT YET BILLED
 * — and the third band is the one no statement prints anywhere. A bill showing
 * a third of the limit used can sit on an account with almost nothing free,
 * because the unbilled principal keeps blocking it until each month's share is
 * repaid.
 */
export default function AccountPanel({ row }) {
  const {
    state,
    deleteCardStatement,
    openCardStatement,
    openStatementImport,
    openCardPlan,
    deleteCardPlan,
    openCardPayment,
  } = useVantage()
  if (!row) return null
  const c = row.commitment
  const limit = c.credit_limit || 0
  // The row's clock, not the browser's local date: the state, the pill and the
  // timeline were all read against it, and a chip read a day later would say
  // PAID beside a badge that says nothing.
  const nowISO = row.nowISO

  const committedSub =
    row.unbilled > 0
      ? row.billed === 0
        ? `nothing billed · ${fmtBare(row.unbilled)} still to be`
        : `${fmtBare(row.billed)} billed · ${fmtBare(row.unbilled)} still to be`
      : 'all of it billed · no instalment plans'
  const [b1, b2, b3] = bandLabels(row)
  // The account this one is compared with: another active card whose limit is
  // still blocked by unbilled principal. Read only when there is a comparison
  // to make, so a card that hides nothing can say so beside one that does.
  const other =
    limit && row.blocked === 0
      ? commitmentRows(state).find(r => r.kind === 'REVOLVING' && r.id !== row.id && r.blocked > 0)
      : null
  const note = bandNote(row, other)
  const pill = duePill(row)
  const cost = costCell(row)

  // What happened to each bill: paid, part paid, or still open. Read up to the
  // next close for an older bill and up to today for the latest, the same
  // window the state itself reads.
  const chipFor = (st, i) => {
    const next = row.statements[i - 1]
    const b = billFor(state, st, { until: next ? next.statement_date : nowISO })
    if (b.settled) return ['PAID', 'gain']
    if (b.paidRM > 0) return ['PART PAID', 'cash']
    if (st.due_date >= nowISO) return ['UNPAID', 'cash']
    return null
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline gap-2 text-[17px] font-semibold">
            {row.name}
            <StateBadge row={row} />
            {/* Neutral on purpose. How many cards share a limit is a fact about
                the account, not a judgement on it — a loss or gain tone here
                would make two cards read as a problem. Absent entirely when the
                count was never given, because "1 CARD" asserted by default is
                the invention the nullable column exists to avoid. */}
            {c.card_count > 0 ? (
              <Badge variant="neutral" className={PILL}>
                {c.card_count === 1 ? '1 card' : `${c.card_count} cards, 1 limit`}
              </Badge>
            ) : null}
          </div>
          <div className="text-muted-foreground text-[12.5px]">
            {/* The limit as a bank prints it, without sen — the row's terms line
                and the canvas both read 'RM 15,000'. */}
            {limit ? `Limit ${symbol(row.cur)}${fq(limit)} · ` : ''}
            {c.apr}% if carried
            {row.cycle ? ` · statement ${ordinal(c.statement_day)}, due ${ordinal(c.due_day)}` : ''}
          </div>
        </div>

        <div className="grid gap-5 px-4 pb-6">
          <div>
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div>
                <span className="eyebrow">Committed on this account</span>
                <div className="stat mt-1.5">{fmt(row.owed, row.cur)}</div>
                <Meta className="num mt-1 block">{committedSub}</Meta>
              </div>
              {row.availableRM != null ? (
                <div>
                  <span className="eyebrow">Actually available</span>
                  <div className={`stat mt-1.5 ${availabilityTone(row.utilisationPct)}`}>
                    {fmt(row.availableRM, row.cur)}
                  </div>
                  <Meta className="num mt-1 block">
                    of a {symbol(row.cur)}
                    {fq(limit)} limit · {pct1(row.utilisationPct)} used
                  </Meta>
                </div>
              ) : null}
            </div>

            {limit ? (
              <>
                <BandBar pct={row.bandPct} className="mt-4 h-2" />
                <div className="mt-3 grid gap-1.5">
                  <BandLine band="band-1" value={fmt(row.carried || 0, row.cur)} label={b1} />
                  <BandLine band="band-2" value={fmt(row.billedInterestFree, row.cur)} label={b2} />
                  <BandLine band="band-3" hollow value={fmt(row.blocked, row.cur)} label={b3} />
                </div>
              </>
            ) : (
              <Meta className="mt-2 block">
                No credit limit recorded, so utilisation and headroom cannot be shown.
              </Meta>
            )}
            {note ? (
              <p className="text-muted-foreground border-hairline mt-3 mb-0 border-t pt-2.5 text-[12.5px] leading-relaxed text-pretty">
                {note}
              </p>
            ) : null}
          </div>

          <div className="border-hairline border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">The cycle</span>
              {pill ? (
                <Badge variant={pill.tone} className={PILL}>
                  {pill.text}
                </Badge>
              ) : null}
              <div className="flex-1" />
              {/* A card is the one commitment whose monthly figure is a guess, so
                  what was actually paid outranks anything derived here. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openCardPayment({ commitment_id: row.id })}
              >
                Pay this card
              </Button>
            </div>
            {row.stale && row.statement ? (
              <Meta className="mt-1 block">
                A newer bill closed on {dfmt(addMonthsISO(row.statement.statement_date, 1))} and is
                not here — import it.
              </Meta>
            ) : null}
            {row.cycle ? <Timeline row={row} /> : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <span className="eyebrow">Minimum due</span>
                <div
                  className={`num text-[15px] font-semibold ${row.state === 'SETTLED' ? 'text-muted-foreground' : ''}`}
                >
                  {fmt(row.minimum, row.cur)}
                </div>
                <Meta>{minimumNote(row)}</Meta>
              </div>
              <div>
                <span className="eyebrow">Statement balance</span>
                <div className="num text-[15px] font-semibold">
                  {row.statement ? fmt(row.statement.closing_balance, row.cur) : '—'}
                </div>
                <Meta>{statementNote(row)}</Meta>
              </div>
              <div>
                {/* The rate runs on the CARRIED band alone, and only where
                    carrying is proven. A settled card costs nothing; an unproven
                    one has no figure, not a zero — the old cell charged apr/12 on
                    the balance regardless and invented interest nobody was paying. */}
                <span className="eyebrow">Cost of carrying</span>
                <div className={`num text-[15px] font-semibold ${cost.cls}`}>
                  {cost.value}
                  {cost.perMonth ? <span className="text-faint text-[11px]">/mo</span> : null}
                </div>
                <Meta>{cost.note}</Meta>
              </div>
            </div>
            {row.cycle ? (
              <p className="text-muted-foreground mt-2.5 mb-0 text-[12px] leading-relaxed text-pretty">
                {row.cycle.graceDays} days from statement to due date —{' '}
                {row.cycle.graceDays >= 20
                  ? 'the minimum Bank Negara requires'
                  : 'less than the twenty days Bank Negara requires'}
                , and only while nothing is carried forward. Anything bought today lands on the bill
                closing {dfmt(row.cycle.closesOn)}, due {dfmt(row.cycle.dueOn)}:{' '}
                <b className="font-semibold">
                  {row.cycle.daysOfFloat} {row.cycle.daysOfFloat === 1 ? 'day' : 'days'}
                </b>
                . The interest-free period runs from the day the bill closes, not the day it is
                due, which is why both are stored.
              </p>
            ) : (
              <p className="text-muted-foreground mt-2.5 mb-0 text-[12px] leading-relaxed text-pretty">
                No statement day recorded. Without it this card cannot say when a purchase stops
                being interest-free — the period runs from the close, and only the due day is known.
              </p>
            )}
          </div>

          <Float row={row} />

          <div className="border-hairline border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Instalment plans</span>
              {row.plans.length ? (
                <Badge variant="neutral" className={PILL}>
                  {fmt(row.instalments, row.cur)} a month
                </Badge>
              ) : null}
              <div className="flex-1" />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Add an instalment plan"
                onClick={() => openCardPlan({ commitment_id: c.id })}
              >
                <PlusIcon />
              </Button>
            </div>

            {row.plans.length ? (
              <div className="mt-3 grid gap-3.5">
                {row.plans.map(p => (
                  <div key={p.id}>
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="text-[13px] font-semibold">{p.name}</span>
                      {p.merchant ? <Meta>{p.merchant}</Meta> : null}
                      <div className="flex-1" />
                      <span className="num text-[13px] font-semibold">
                        {fmt(p.instalment, row.cur)}
                      </span>
                      <Meta>&times; {p.left} left</Meta>
                      {/* The plan's own actions live here now that the list
                          does: the row on Credit cards no longer carries them,
                          and a plan nothing can edit or remove is a plan typed
                          wrong forever. */}
                      <RowAction
                        icon={PencilIcon}
                        label={`Edit ${p.name}`}
                        onClick={() => openCardPlan({ ...p.plan })}
                      />
                      <RowAction
                        icon={TrashIcon}
                        label={`Remove ${p.name}`}
                        onClick={() => deleteCardPlan(c.id, p.id)}
                      />
                    </div>
                    <Progress
                      value={p.tenure ? (p.paid / p.tenure) * 100 : 0}
                      aria-label={`${p.name}: ${p.paid} of ${p.tenure} paid`}
                      className="mt-1.5 h-1.5"
                    />
                    <div className="mt-1 flex flex-wrap justify-between gap-2">
                      <Meta>
                        <span className="num">{p.paid}</span> of{' '}
                        <span className="num">{p.tenure}</span> paid · {fmt(p.amount, row.cur)}{' '}
                        financed
                      </Meta>
                      <Meta>
                        <span className="num">{fmt(p.outstanding, row.cur)}</span> left
                        {p.endsOn ? ` · ends ${p.endsOn.slice(0, 7)}` : ''}
                      </Meta>
                    </div>
                    <p className="text-faint mt-1.5 mb-0 text-[11.5px] leading-relaxed text-pretty">
                      {p.effective == null ? (
                        <>
                          <b className="text-gain font-semibold">Genuinely 0%.</b> No rate, no
                          upfront fee — a merchant plan that really is free.
                        </>
                      ) : (
                        <>
                          <b className="text-loss font-semibold">{pct1(p.effective)} effective.</b>{' '}
                          {p.upfront_fee > 0
                            ? `The ${fmt(p.upfront_fee, row.cur)} upfront fee is where the cost of a 0% plan lives.`
                            : 'Converted by the Seventh Schedule formula, so it compares with every other rate on screen.'}
                        </>
                      )}
                      {p.isSpending ? '' : ' Not spending — never reaches the expense log.'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Meta className="mt-2 block">
                None recorded. An EPP, a balance transfer or a cash instalment.
              </Meta>
            )}
          </div>

          <div className="border-hairline border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Statements</span>
              <div className="flex-1" />
              {/* Importing reads the whole bill — the header, the plans and the rows
                  a merchant rule already explains. Recording one by hand enters the
                  header alone, which is still the load-bearing half. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openStatementImport({ commitment_id: c.id })}
              >
                Import
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Record a statement"
                onClick={() => openCardStatement({ commitment_id: c.id })}
              >
                <PlusIcon />
              </Button>
            </div>

            {row.statements.length ? (
              <div className="border-hairline mt-2 border-t">
                {row.statements.map((st, i) => {
                  const chip = chipFor(st, i)
                  return (
                    <div
                      key={st.id}
                      className="border-hairline flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
                    >
                      <span className="num min-w-[92px] text-[12.5px]">{dfmt(st.statement_date)}</span>
                      <div className="min-w-0 flex-1">
                        <Meta>
                          due {dfmt(st.due_date)}
                          {st.interest_charged > 0
                            ? ` · ${fmt(st.interest_charged, row.cur)} interest`
                            : ''}
                          {st.fees_charged > 0 ? ` · ${fmt(st.fees_charged, row.cur)} fees` : ''}
                        </Meta>
                      </div>
                      {chip ? (
                        <Badge variant={chip[1]} className={PILL}>
                          {chip[0]}
                        </Badge>
                      ) : null}
                      <div className="text-right">
                        <div className="num text-[12.5px] font-semibold">
                          {fmt(st.closing_balance, row.cur)}
                        </div>
                        {st.minimum_due != null ? (
                          <Meta>{fmt(st.minimum_due, row.cur)} minimum</Meta>
                        ) : null}
                      </div>
                      <RowAction
                        icon={TrashIcon}
                        label={`Remove the statement of ${st.statement_date}`}
                        onClick={() => deleteCardStatement(c.id, st.id)}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <Meta className="mt-2 block">
                None recorded. A statement is what lets the spending figure survive this card: the
                float reads what was owed on two dates, and a single balance can only answer for
                today.
              </Meta>
            )}
            {row.statements.length === 1 ? (
              <p className="text-faint mt-2 mb-0 text-[11px] leading-relaxed text-pretty">
                One so far. {c.lender || 'The bank'} keeps twelve months online — importing the rest
                would give the float a year of history rather than a single window.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
