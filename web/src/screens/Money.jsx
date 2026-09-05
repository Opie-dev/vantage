/**
 * Money — the whole month: what arrived, what was owed, what living took.
 *
 * ONE SCREEN, BECAUSE IT IS ONE SENTENCE. Spending used to live on its own
 * screen, and the split was wrong in a way the statement below makes obvious:
 * "what was logged" and "what actually left the wallet" are two halves of the
 * same claim, and putting them on two screens meant the coverage figure was
 * always somewhere the itemised list was not. There was briefly a second rail
 * entry that opened this screen at the spending section; it is gone, because two
 * doors into one room read as two rooms to everyone but their author.
 *
 * TWO QUESTIONS, KEPT APART. The statement in the left column is what HAPPENED:
 * every figure in it actually arrived or actually left, over the window two
 * wallet readings bracket. The card beneath it is the run rate — what is free in
 * a usual month — and it is forward-looking, which is why it is labelled as the
 * other question rather than stacked into the same column of figures. Mixing a
 * measured month with a monthly average is the one mistake this layout exists to
 * prevent.
 *
 * NOTHING HERE TOUCHES THE BROKER. A salary is not a cash movement and never
 * reaches the wallet balance; it is not a dividend and never reaches the income
 * run rate. See the commitments and income sections of calc.js.
 *
 * Three distinctions the screen exists to keep straight:
 *
 *   A loan payment is not an expense. Most of an instalment moves cash into
 *   equity and only the interest is spent, so principal and interest are shown as
 *   separate figures and never totalled into one "cost".
 *
 *   A flat-rate loan's outstanding figure is the instalments still to run, NOT
 *   what the lender would settle for — that is lower, by a rebate this app does
 *   not model. Rows say so rather than letting the number pass as a payoff quote.
 *
 *   Uncommitted and unclaimed are different facts. The first is about what you
 *   owe, the second about what you intend, and the second can be negative while
 *   the first is healthy. Merging them would hide which one is the problem.
 */

import { useMemo, useState } from 'react'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import {
  SPEND_UNKNOWN,
  deductionsOf,
  expensesFor,
  netOf,
  waterfall,
} from '@/lib/calc'
import { dfmt, dfmtLong, fmt, fmtS, monthLabel, pct1 } from '@/lib/format'
import { useVantage } from '@/lib/store'
import Spending from '@/screens/Spending'

/** Where the sticky month bar ends and the statement column can begin. */
const STICKY_TOP = 'top-[112px]'

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

/** One colour per kind, so the eye can group without reading. */
const KIND_COLOR = {
  LOAN: 'var(--chart-1)',
  REVOLVING: 'var(--loss)',
  RECURRING: 'var(--chart-5)',
}

function Meta({ children }) {
  return <span className="text-faint text-[11.5px]">{children}</span>
}

function Line({ label, value, tone = '', strong = false, rule = false }) {
  return (
    <div
      className={`flex items-baseline gap-3 text-[12.5px] ${rule ? 'border-hairline border-t pt-1.5' : ''}`}
    >
      <span className={`flex-1 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`num ${tone} ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

/** The header of a section that can be folded away. */
function SectionHead({ id, open, onToggle, label, badge, summary, add, addLabel }) {
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
      <Button variant="outline" size="icon-sm" aria-label={addLabel} title={addLabel} onClick={add}>
        <PlusIcon />
      </Button>
    </div>
  )
}

/* ── the statement ────────────────────────────────────────────────────────── */

/**
 * What happened to the money, in the order it moved.
 *
 * EVERY LINE IS spendingFor()'s OWN ARITHMETIC, rendered rather than
 * recalculated. That function already answers "what did living cost" as
 * `inflow − committed − saved − walletDelta`, so the statement is those four
 * terms in order with the fifth as the closing line. Recomputing any of it here
 * would be a second implementation of an identity that has exactly one.
 *
 * THE LAST LINE IS A REMAINDER, NOT AN INPUT. Nobody types what is left in the
 * wallet; it falls out of the other four, which is what makes the month closable
 * without a single purchase having been recorded.
 *
 * The window is stated on every render because it is rarely a calendar month:
 * readings land when the owner types them, so "over 38 days" is the truth and
 * "this month" would not be. With no window the statement does not print a
 * column of zeros — it says what is missing, the way the rest of the app does.
 */
function Statement({ spend, monthShort }) {
  if (spend.reason) {
    return (
      <div>
        <span className="eyebrow">What happened to the money</span>
        <p className="text-muted-foreground mt-2 text-[12.5px] leading-relaxed">
          {spend.reason === SPEND_UNKNOWN.NO_WALLET ? (
            <>
              Mark the account you spend from as a <b className="font-semibold">wallet</b> on the
              Assets screen and record its balance now and then. The month can then be closed —
              what arrived, what was owed, what living took — without entering a single purchase.
            </>
          ) : spend.reason === SPEND_UNKNOWN.NO_CLOSING_READING ? (
            <>
              One wallet reading so far, on <span className="num">{dfmt(spend.from)}</span>. Record
              a second and the month closes itself.
            </>
          ) : (
            <>
              No wallet reading before this month, so there is nothing to measure the gap from yet.
            </>
          )}
        </p>
        <p className="text-faint mt-2 text-[11px] leading-relaxed">
          Until then the figures below are run rates — what a usual month looks like — and the log
          on the right is a list rather than a reconciliation.
        </p>
      </div>
    )
  }

  const saved = spend.savedRM
  const wallet = spend.walletDeltaRM
  const rows = [
    { op: '', label: 'Income received', value: fmt(spend.inflowRM, 'MYR'), big: true },
    {
      op: '−',
      label: `Committed, paid in ${monthShort}`,
      value: fmt(spend.committedRM, 'MYR'),
      tone: 'text-loss',
    },
    // A net withdrawal is money coming BACK out of savings, and printing it as
    // "− RM −500" would make the reader do the double negative in their head.
    saved < 0
      ? { op: '+', label: 'Out of savings and the broker', value: fmt(-saved, 'MYR') }
      : { op: '−', label: 'Into savings and the broker', value: fmt(saved, 'MYR') },
    {
      op: '−',
      label: 'Living cost, measured',
      value: fmt(spend.spentRM, 'MYR'),
      big: true,
      tone: spend.spentRM < 0 ? 'text-loss' : '',
    },
    {
      op: '=',
      label: wallet < 0 ? 'Your wallet fell by' : 'Left in your wallet',
      value: fmt(Math.abs(wallet), 'MYR'),
      big: true,
      rule: true,
      tone: wallet < 0 ? 'text-loss' : 'text-gain',
    },
  ]

  return (
    <div>
      <span className="eyebrow">What happened to the money</span>
      <p className="text-faint mt-1.5 text-[11.5px] leading-relaxed">
        In the order it moved. Every figure here actually arrived or actually left — nothing is a
        run rate.
      </p>
      <div className="mt-3 flex flex-col">
        {rows.map(r => (
          <div
            key={r.label}
            className={`flex items-baseline gap-2.5 py-1.5 ${r.rule ? 'border-hairline mt-1 border-t pt-2' : ''}`}
          >
            <span className="num text-faint w-3 shrink-0 text-center text-[12px]">{r.op}</span>
            <span
              className={`min-w-0 flex-1 ${r.big ? 'text-[13px] font-semibold' : 'text-muted-foreground text-[12.5px]'}`}
            >
              {r.label}
            </span>
            <span
              className={`num font-semibold ${r.big ? 'text-[14.5px]' : 'text-[12.5px]'} ${r.tone || ''}`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <p className="text-faint mt-2 text-[11px] leading-relaxed">
        The last line is the remainder, not an input — it is what closes the month. Living cost is
        measured over <span className="num">{spend.days}</span>{' '}
        {spend.days === 1 ? 'day' : 'days'}, <span className="num">{dfmt(spend.from)}</span> to{' '}
        <span className="num">{dfmt(spend.to)}</span>, and inferred rather than recorded: nothing
        had to be typed for it to exist.
        {spend.spentRM < 0 ? (
          <>
            {' '}
            It is negative here, which means a destination is missing rather than that money was
            un-spent — something left the wallet into somewhere this app is not watching.
          </>
        ) : null}
      </p>
    </div>
  )
}

/**
 * How much of the measured living cost got itemised.
 *
 * IT STAYS ON SCREEN WHILE THE LIST IS READ, which is the whole reason these two
 * halves are now one screen. The hatched remainder has no category and giving it
 * one would be an invention — it is the part that left the wallet without being
 * typed, and the app knows the total without being told.
 */
function Coverage({ ex }) {
  if (ex.spend.reason) return null
  const known = ex.coveragePct != null

  return (
    <div className="border-hairline border-t pt-3.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="eyebrow">Of the living cost, itemised</span>
        <span
          className="num ml-auto text-[12px] font-semibold"
          style={{
            color: !known ? 'var(--faint)' : ex.unloggedRM > 1 ? 'var(--cash)' : 'var(--foreground)',
          }}
        >
          {known ? pct1(ex.coveragePct) : '—'}
        </span>
      </div>

      {known ? (
        <>
          <div className="border-hairline mt-2 flex h-[18px] overflow-hidden rounded-sm border">
            <div
              style={{
                width: `${ex.coveragePct}%`,
                backgroundColor: 'color-mix(in srgb, var(--chart-1) 70%, transparent)',
              }}
            />
            <div
              className="flex-1"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--cash) 12%, transparent)',
                backgroundImage:
                  'repeating-linear-gradient(115deg, color-mix(in srgb, var(--cash) 50%, transparent) 0 1.5px, transparent 1.5px 5px)',
              }}
            />
          </div>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-[2px]"
                style={{ backgroundColor: 'color-mix(in srgb, var(--chart-1) 70%, transparent)' }}
              />
              logged <b className="num font-semibold">{fmt(ex.loggedInWindowRM, 'MYR')}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="border-cash size-2.5 rounded-[2px] border"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(115deg, color-mix(in srgb, var(--cash) 50%, transparent) 0 1.5px, transparent 1.5px 5px)',
                }}
              />
              unlogged <b className="num text-cash font-semibold">{fmt(ex.unloggedRM, 'MYR')}</b>
            </span>
          </div>
        </>
      ) : null}

      <p className="text-faint mt-2 text-[11px] leading-relaxed">
        {known ? (
          ex.unloggedRM < -1 ? (
            <>
              More is logged than actually left the wallet, which points at a double entry or
              something dated into the wrong month rather than at overspending.
            </>
          ) : (
            <>
              It stays on screen while you read the list, because the list is what it is being
              checked against. The hatched remainder has no category, and giving it one would be an
              invention.
            </>
          )
        ) : (
          <>
            Nothing left the wallet over the measured window, so there is no gap to report and
            nothing for the list to be checked against.
          </>
        )}
      </p>
    </div>
  )
}

/* ── coming in ────────────────────────────────────────────────────────────── */

function SourceRow({ r, onRecord, onEdit, onRemove, onRemoveEvent }) {
  const s = r.source
  const d = r.last ? deductionsOf(r.last) : null
  // Collapsed by default. A monthly salary accumulates twelve of these a year
  // and the row exists to show what the source pays, not to list its history —
  // but a payment you cannot see is one you cannot correct, which is how a
  // mistyped freelance invoice became permanent.
  const [open, setOpen] = useState(false)
  const events = r.events || []

  return (
    <div className="border-hairline border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className="size-[9px] shrink-0 rounded-full"
          style={{ background: 'var(--gain)', opacity: r.isEstimate ? 0.45 : 1 }}
        />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-semibold">{r.name}</span>
            {r.isEstimate ? (
              <Badge variant="cash" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                {r.variable ? 'variable' : 'not recorded'}
              </Badge>
            ) : null}
          </div>
          <Meta>
            {r.variable
              ? 'Irregular · 3-month average'
              : `Monthly · ${s.pay_day === -1 ? 'last working day' : `day ${s.pay_day}`}`}
            {r.last ? (
              <>
                {' '}· last <span className="num">{fmt(r.last.gross, r.cur)}</span> gross on{' '}
                <span className="num">{dfmtLong(r.last.date)}</span>
              </>
            ) : (
              ' · nothing recorded yet'
            )}
          </Meta>
        </div>
        <div className="text-right">
          <div className="num text-[13.5px] font-semibold">
            {r.isEstimate ? '≈ ' : ''}
            {fmt(r.monthly, r.cur)}
          </div>
          <Meta>{r.variable ? 'estimate' : 'net'}</Meta>
        </div>
        <Button size="sm" variant="outline" onClick={() => onRecord(r.id)}>
          <PlusIcon />
          Record
        </Button>
        <RowAction icon={PencilIcon} label={`Edit ${r.name}`} onClick={() => onEdit(r.source)} />
        <RowAction icon={TrashIcon} label={`Remove ${r.name}`} onClick={() => onRemove(r.id)} />
      </div>

      {events.length ? (
        <div className="mt-2 ml-[21px]">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
          >
            {open ? 'Hide' : 'Show'} {events.length} recorded payment
            {events.length === 1 ? '' : 's'}
          </button>

          {open ? (
            <div className="mt-1.5 grid gap-0.5">
              {events.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-[12px]">
                  <span className="num text-muted-foreground w-[74px]">{dfmt(e.date)}</span>
                  <span className="num w-[92px]">{fmt(netOf(e), r.cur)}</span>
                  {/* Gross only when something was taken off it, so a freelance
                      payment that nets what it grossed does not read as two
                      different numbers side by side. */}
                  <span className="text-faint num flex-1 text-[11px]">
                    {netOf(e) !== e.gross ? `of ${fmt(e.gross, r.cur)} gross` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                  <RowAction
                    icon={TrashIcon}
                    label={`Remove the ${dfmt(e.date)} payment`}
                    onClick={() => onRemoveEvent(r.id, e.id)}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {d && d.deducted > 0 ? (
        <div className="mt-2.5 ml-[21px]">
          <p className="eyebrow text-[9.5px]">Deducted from your pay</p>
          <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {[
              ['EPF', r.last.epf_employee],
              ['SOCSO', r.last.socso_employee],
              ['EIS', r.last.eis_employee],
              ['SKBBK', r.last.skbbk],
              ['PCB', r.last.pcb],
              ['Zakat', r.last.zakat],
              ['Other', r.last.other_deducted],
            ]
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <span key={k}>
                  {k} <span className="num text-foreground">{v.toFixed(2)}</span>
                </span>
              ))}
          </div>
          {d.onTop > 0 ? (
            <>
              <p className="eyebrow mt-2.5 text-[9.5px]">Paid on top by your employer</p>
              <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {[
                  ['EPF', r.last.epf_employer],
                  ['SOCSO', r.last.socso_employer],
                  ['EIS', r.last.eis_employer],
                ]
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <span key={k}>
                      {k} <span className="num text-foreground">{v.toFixed(2)}</span>
                    </span>
                  ))}
              </div>
              <p className="text-faint mt-2 max-w-[520px] text-[11.5px] leading-relaxed">
                That second group never passes through your pay, so it is not subtracted from net —
                but <span className="num">{fmt(d.epfTotal, r.cur)}</span> of EPF lands in your
                account either way, and Vantage books it there in the same write.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ── going out ────────────────────────────────────────────────────────────── */

function CommitmentRow({ r, onEdit, onRemove }) {
  const c = r.commitment

  return (
    <div className="border-hairline flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0">
      <span className="size-[9px] shrink-0 rounded-full" style={{ background: KIND_COLOR[r.kind] }} />

      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold">{r.name}</span>
          {c.lender ? <Meta>{c.lender}</Meta> : null}
          {r.kind === 'LOAN' && r.flat ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="cash"
                  className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                >
                  {r.quoted}% flat = {pct1(r.effective)} real
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                A flat rate charges interest on the original amount for the whole term, so its true
                cost is close to double the number on the agreement. Converted by the Hire-Purchase
                Act&rsquo;s own Seventh Schedule formula.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {r.kind === 'REVOLVING' && r.staleDays != null && r.staleDays > 7 ? (
            <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
              {r.staleDays}d old
            </Badge>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {r.kind === 'LOAN' ? (
            <>
              <Meta>
                {/* A loan recorded without its rate says so by omission rather
                    than by printing "null% reducing" — the progress and the due
                    day are the parts that were actually given. */}
                {r.rated ? `${r.quoted}% ${r.flat ? 'flat' : 'reducing'}` : 'rate not recorded'}
                {c.due_day ? ` · due ${c.due_day}` : ''} · <span className="num">{r.paid}</span> of{' '}
                <span className="num">{c.term_months}</span> paid
              </Meta>
              <div className="min-w-[110px] flex-1 sm:max-w-[170px]">
                <Progress
                  value={r.progressPct}
                  aria-label={`${pct1(r.progressPct)} of ${r.name} paid`}
                  className="h-1.5"
                />
              </div>
            </>
          ) : r.kind === 'REVOLVING' ? (
            <Meta>
              <span className="num">{fmt(r.owed, r.cur)}</span>
              {c.credit_limit ? (
                <>
                  {' '}
                  of <span className="num">{fmt(c.credit_limit, r.cur)}</span> ·{' '}
                  <span className="num">{pct1(r.utilisationPct)}</span> used
                </>
              ) : null}{' '}
              · <span className="num">{r.quoted}%</span> if carried
            </Meta>
          ) : (
            <Meta>
              <span className="num">{fmt(r.amount, r.cur)}</span>
              {r.everyMonths === 1 ? ' monthly' : ` every ${r.everyMonths} months`}
              {c.due_day ? ` · due ${c.due_day}` : ''} · no balance, pure expense
            </Meta>
          )}
        </div>
      </div>

      <div className="ml-auto text-right">
        <div className="num text-[13.5px] font-semibold">{fmt(r.monthlyOut, r.cur)}</div>
        {r.kind === 'LOAN' ? (
          <Meta>
            {r.owed > 0 ? (
              <>
                <span className="num">{fmt(r.owed, r.cur)}</span>{' '}
                {r.owedIsInstalments ? 'of instalments' : 'left'}
              </>
            ) : (
              'settled'
            )}
          </Meta>
        ) : r.kind === 'REVOLVING' ? (
          <Meta>minimum</Meta>
        ) : (
          <Meta>{r.everyMonths === 1 ? 'per month' : 'per month, spread'}</Meta>
        )}
      </div>
      <RowAction icon={PencilIcon} label={`Edit ${r.name}`} onClick={() => onEdit(r.commitment)} />
      <RowAction icon={TrashIcon} label={`Remove ${r.name}`} onClick={() => onRemove(r.id)} />
    </div>
  )
}

/* ── screen ───────────────────────────────────────────────────────────────── */

export default function Money() {
  const {
    state,
    openCommitment,
    openIncome,
    openIncomeEvent,
    deleteIncomeSource,
    deleteIncomeEvent,
    deleteCommitment,
  } = useVantage()

  const now = new Date()
  const [{ y, m }, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  // Both folded to start with. The statement and the log are what gets read
  // daily; the source and commitment lists are setup, visited when something
  // changes. Jumping to either section opens it.
  const [openIn, setOpenIn] = useState(false)
  const [openOut, setOpenOut] = useState(false)

  const w = useMemo(() => waterfall(state), [state])
  // One call, both halves: expensesFor() carries the residual it reconciles
  // against, so the statement and the log cannot end up reading different months.
  const ex = useMemo(() => expensesFor(state, y, m), [state, y, m])
  const spend = ex.spend
  const out = w.commitments
  const hasFlat = out.rows.some(r => r.kind === 'LOAN' && r.flat)
  const hasIncome = w.rows.length > 0
  // Only meaningful once income exists: with none recorded, uncommitted is
  // negative because nothing has been entered, and any goal budget would
  // "overshoot" it. Blaming the goals there is exactly backwards.
  const over = hasIncome && w.overclaimedRM > 0

  const thisMonth = y === now.getFullYear() && m === now.getMonth()
  const label = monthLabel(y, m)
  const monthShort = label.slice(0, 3)

  const jump = (id, open) => {
    if (open) open()
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id)
      // An explicit offset rather than scrollIntoView, so the sticky bars never
      // eat the heading they just jumped to.
      if (el) window.scrollTo({ top: Math.max(0, el.offsetTop - 120), behavior: 'smooth' })
    })
  }

  const move = n => {
    const next = new Date(y, m + n, 1)
    setMonth({ y: next.getFullYear(), m: next.getMonth() })
  }

  if (!hasIncome && !out.rows.length && !ex.count) {
    return (
      <Card className="py-10">
        <CardContent className="text-center">
          <h2 className="num text-[16px] font-semibold">Nothing recorded yet</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-[470px] text-[13px] leading-relaxed">
            This is the whole month: what arrives, what is owed, and what living actually took. The
            first two are <b className="font-semibold">known in advance</b>; the third is measured
            from a wallet balance rather than from a list of purchases.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={openIncome}>
              <PlusIcon />
              Add income
            </Button>
            <Button size="sm" variant="outline" onClick={openCommitment}>
              <PlusIcon />
              Add commitment
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {/* One month control for both halves. Sticky, because the figure you are
          reading three sections down is still about the month chosen up here. */}
      <div className="bg-background/85 sticky top-[60px] z-10 -mx-[clamp(14px,2.4vw,28px)] flex flex-wrap items-center gap-2 border-b px-[clamp(14px,2.4vw,28px)] py-2.5 backdrop-blur-md">
        <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Previous month">
          <ChevronLeftIcon />
        </Button>
        <span className="num min-w-[140px] text-center text-[13.5px] font-semibold">{label}</span>
        <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Next month">
          <ChevronRightIcon />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={thisMonth}
          onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}
        >
          This month
        </Button>
        <span className="text-faint text-[11px]">
          Governs both halves. Run-rate figures say <i>a month</i>, never this month.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start">
        <div className={`grid content-start gap-3 lg:sticky ${STICKY_TOP}`}>
          <Card>
            <CardContent className="px-4">
              <Statement spend={spend} monthShort={monthShort} />
              <Coverage ex={ex} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="px-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="eyebrow">The other question</span>
                <span className="text-faint text-[11px]">forward-looking, not {monthShort}</span>
                {over ? (
                  <Badge
                    variant="loss"
                    className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                  >
                    goals over by {fmt(w.overclaimedRM, 'MYR')}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2.5 grid gap-1">
                <Line label="Net income" value={fmt(w.incomeRM, 'MYR')} strong />
                {w.variableRM > 0 ? (
                  <Line
                    label="of which estimated"
                    value={fmt(w.variableRM, 'MYR')}
                    tone="text-muted-foreground"
                  />
                ) : null}
                <Line label="− Commitments, a month" value={fmt(w.committedRM, 'MYR')} tone="text-loss" />
                <Line label="= Uncommitted" value={fmt(w.uncommittedRM, 'MYR')} strong rule />
                {w.claimedRM > 0 ? (
                  <>
                    <Line
                      label="− Claimed by goals"
                      value={fmt(w.claimedRM, 'MYR')}
                      tone="text-[var(--chart-4)]"
                    />
                    <Line
                      label="= Unclaimed"
                      value={fmtS(w.unclaimedRM, 'MYR')}
                      tone={w.unclaimedRM < 0 ? 'text-loss' : 'text-gain'}
                      strong
                      rule
                    />
                  </>
                ) : null}
              </div>
              <p className="text-faint mt-2.5 text-[11px] leading-relaxed">
                {over ? (
                  <>
                    Your obligations are comfortable — it is the{' '}
                    <b className="font-semibold">goals</b> that do not fit. Two different facts,
                    kept apart because one is about what you owe and the other about what you
                    intend.
                  </>
                ) : (
                  <>
                    A ceiling, not a surplus — what is free in a usual month, before anything you
                    live on. The statement above is what living actually took.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 gap-0 overflow-hidden py-0">
          <section id="coming-in" className="border-hairline border-b">
            <SectionHead
              id="coming-in"
              open={openIn}
              onToggle={() => setOpenIn(v => !v)}
              label="Income · known in advance"
              badge={
                hasIncome ? (
                  <Badge
                    variant="gain"
                    className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                  >
                    {fmt(w.incomeRM, 'MYR')} net
                  </Badge>
                ) : null
              }
              summary={
                hasIncome
                  ? `${w.rows.length} ${w.rows.length === 1 ? 'source' : 'sources'}${w.variableRM > 0 ? ` · ${fmt(w.variableRM, 'MYR')} of it estimated` : ''}`
                  : 'nothing recorded'
              }
              add={openIncome}
              addLabel="Add an income source"
            />
            {openIn ? (
              <div id="coming-in-body" className="border-hairline border-t">
                {hasIncome ? (
                  <>
                    {w.rows.map(r => (
                      <SourceRow
                        key={r.id}
                        r={r}
                        onRecord={id => openIncomeEvent({ source_id: id })}
                        onEdit={openIncome}
                        onRemove={deleteIncomeSource}
                        onRemoveEvent={deleteIncomeEvent}
                      />
                    ))}
                    <p className="text-faint px-4 py-3 text-[11.5px] leading-relaxed">
                      A salary is a floor; an irregular source is the mean of the last three months
                      and is drawn faded wherever it appears — the same way a projected dividend is
                      never drawn like a declared one. A good quarter must not quietly become the
                      baseline you plan against.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground px-4 py-3 text-[13px] leading-relaxed">
                    Nothing recorded. Add a salary or a client and the run rate becomes real.
                  </p>
                )}
              </div>
            ) : null}
          </section>

          <section id="going-out" className="border-hairline border-b">
            <SectionHead
              id="going-out"
              open={openOut}
              onToggle={() => setOpenOut(v => !v)}
              label="Commitments · known in advance"
              badge={
                out.rows.length ? (
                  <Badge
                    variant="loss"
                    className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                  >
                    {fmt(out.monthlyOutRM, 'MYR')} a month
                  </Badge>
                ) : null
              }
              summary={
                out.rows.length
                  ? `${out.rows.length} ${out.rows.length === 1 ? 'commitment' : 'commitments'}${
                      spend.reason ? '' : ` · ${fmt(spend.committedRM, 'MYR')} actually fell in ${monthShort}`
                    }`
                  : 'nothing recorded'
              }
              add={openCommitment}
              addLabel="Add a commitment"
            />
            {openOut ? (
              <div id="going-out-body" className="border-hairline border-t">
                {out.rows.length ? (
                  <>
                    {out.rows.map(r => (
                      <CommitmentRow
                        key={r.id}
                        r={r}
                        onEdit={openCommitment}
                        onRemove={deleteCommitment}
                      />
                    ))}
                    <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-[12.5px]">
                      <span>
                        Debt falling{' '}
                        <b className="num text-gain font-semibold">
                          {fmt(out.principalPerMonthRM, 'MYR')}
                        </b>
                      </span>
                      <span>
                        Interest{' '}
                        <b className="num text-loss font-semibold">
                          {fmt(out.interestPerMonthRM, 'MYR')}
                        </b>
                      </span>
                      <span>
                        Owed <b className="num font-semibold">{fmt(out.owedRM, 'MYR')}</b>
                      </span>
                      {spend.reason ? null : (
                        <span>
                          Paid in {monthShort}{' '}
                          <b className="num font-semibold">{fmt(spend.committedRM, 'MYR')}</b>
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground px-4 py-3 text-[13px] leading-relaxed">
                    Nothing recorded. Loans, rent, insurance, subscriptions, a card balance.
                  </p>
                )}
              </div>
            ) : null}
          </section>

          <Spending
            y={y}
            m={m}
            ex={ex}
            onMonth={(year, monthIndex) => setMonth({ y: year, m: monthIndex })}
            onJumpCommitments={() => jump('going-out', () => setOpenOut(true))}
          />
        </Card>
      </div>

      <p className="text-faint text-[11.5px] leading-relaxed">
        Only the interest is spent — the principal moves from cash into equity, which is why the two
        are never added together here. Every loan figure is derived from its terms, so no instalment
        was typed in; only deviations get recorded.
        {hasFlat ? (
          <>
            {' '}
            A flat-rate loan&rsquo;s figure is the <b className="font-semibold">instalments still to
            run</b>, not a settlement quote: settling early is cheaper, by a rebate this app does not
            model, and its monthly interest is apportioned straight-line because a flat loan has no
            contractual monthly split.
          </>
        ) : null}
      </p>
    </div>
  )
}
