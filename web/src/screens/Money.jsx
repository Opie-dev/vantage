/**
 * Money — what arrives each month, what leaves it, and what is left.
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
 *
 * And the whole thing stops at `unclaimed`, never "surplus": this tracks what is
 * known in advance and not what you spend, so everything you live on is still
 * ahead of that figure.
 */

import { useMemo, useState } from 'react'
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { SPEND_UNKNOWN, deductionsOf, netOf, spendingFor, waterfall } from '@/lib/calc'
import { dfmt, dfmtLong, fmt, fmtS, pct1 } from '@/lib/format'
import { useVantage } from '@/lib/store'

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
      className={`flex items-baseline gap-3 text-[13px] ${rule ? 'border-hairline border-t pt-2' : ''}`}
    >
      <span className={`w-[190px] shrink-0 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`num flex-1 text-right ${tone} ${strong ? 'font-semibold' : ''}`}>{value}</span>
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
    <div className="border-hairline border-b py-3 last:border-b-0">
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
    <div className="border-hairline flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0">
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

/**
 * What living actually cost — the one line the waterfall never had.
 *
 * NEVER A GUESS. Spending here is inferred from a wallet reading, and with no
 * reading to anchor it the component says what is missing instead of showing a
 * figure. The badge above still reads "before living costs" until this can
 * answer, which is the honest pairing.
 *
 * The window is stated on every render because it is rarely a calendar month:
 * readings land when the owner types them, so "over 38 days" is the truth and
 * "this month" would not be.
 */
function LivingCost({ spend }) {
  if (spend.reason === SPEND_UNKNOWN.NO_WALLET) {
    return (
      <p className="text-faint mt-2.5 max-w-[460px] text-[11.5px] leading-relaxed">
        Mark the account you spend from as a <b className="font-semibold">wallet</b> on the Assets
        screen and record its balance now and then, and this becomes what living actually cost —
        without entering a single purchase.
      </p>
    )
  }
  if (spend.reason) {
    return (
      <p className="text-faint mt-2.5 max-w-[460px] text-[11.5px] leading-relaxed">
        {spend.reason === SPEND_UNKNOWN.NO_CLOSING_READING
          ? 'One wallet reading so far. Record a second and the gap between them becomes what you spent.'
          : 'No wallet reading before this month, so there is nothing to measure the gap from yet.'}
      </p>
    )
  }
  return (
    <div className="border-hairline mt-3 border-t pt-2.5">
      <span className="eyebrow">Living cost</span>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          className={`num text-[19px] font-semibold ${spend.spentRM < 0 ? 'text-loss' : 'text-foreground'}`}
        >
          {fmt(spend.spentRM, 'MYR')}
        </span>
        <span className="text-faint num text-[11.5px]">
          over {spend.days} day{spend.days === 1 ? '' : 's'} · {dfmt(spend.from)} to {dfmt(spend.to)}
        </span>
      </div>
      <p className="text-faint mt-1.5 max-w-[460px] text-[11.5px] leading-relaxed">
        {spend.spentRM < 0 ? (
          <>
            Negative, which means a destination is missing rather than that you un-spent money —
            something left the wallet into somewhere this app is not watching.
          </>
        ) : (
          <>
            Not recorded — inferred. Everything that arrived, less obligations, less what moved
            somewhere you can see, less the change in the wallet itself.
          </>
        )}
      </p>
    </div>
  )
}

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
  const w = useMemo(() => waterfall(state), [state])
  // This month, because that is the month the headline above is about. The
  // window it actually reconciles is whatever the wallet readings bracket, and
  // LivingCost prints those dates rather than implying they are the month.
  const now = new Date()
  const spend = useMemo(() => spendingFor(state, now.getFullYear(), now.getMonth()), [state])
  const out = w.commitments
  const hasFlat = out.rows.some(r => r.kind === 'LOAN' && r.flat)
  const hasIncome = w.rows.length > 0
  // Only meaningful once income exists: with none recorded, uncommitted is
  // negative because nothing has been entered, and any goal budget would
  // "overshoot" it. Blaming the goals there is exactly backwards.
  const over = hasIncome && w.overclaimedRM > 0

  if (!hasIncome && !out.rows.length) {
    return (
      <Card className="py-10">
        <CardContent className="text-center">
          <h2 className="num text-[16px] font-semibold">Nothing recorded yet</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-[470px] text-[13px] leading-relaxed">
            This tracks what is <b className="font-semibold">known in advance</b> — a salary, loans,
            rent, insurance, a card balance. Not what you spend: an app that asks for groceries
            becomes a chore, and the figures here would be no truer for it.
          </p>
          <div className="mt-4 flex justify-center gap-2">
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

  // With no income recorded there is no waterfall to show — obligations alone,
  // rather than a "free cash" figure computed against nothing.
  const headline = !hasIncome
    ? { label: 'Leaves each month', value: out.monthlyOutRM, tone: '' }
    : w.claimedRM > 0
      ? { label: 'Unclaimed this month', value: w.unclaimedRM, tone: w.unclaimedRM < 0 ? 'text-loss' : 'text-gain' }
      : { label: 'Uncommitted this month', value: w.uncommittedRM, tone: w.uncommittedRM < 0 ? 'text-loss' : 'text-gain' }

  return (
    <div className="grid gap-3">
      <Card className="gap-4 py-5">
        <CardContent className="px-5">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
            <div className="min-w-[300px] flex-1">
              <div className="flex items-center gap-2">
                <span className="eyebrow">{headline.label}</span>
                {over ? (
                  <Badge variant="loss" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                    goals over by {fmt(w.overclaimedRM, 'MYR')}
                  </Badge>
                ) : hasIncome ? (
                  <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                    before living costs
                  </Badge>
                ) : null}
              </div>
              <div
                className={`num mt-2 text-[clamp(30px,4vw,46px)] leading-none font-semibold tracking-[-0.035em] ${headline.tone}`}
              >
                {fmt(headline.value, 'MYR')}
              </div>
              <p className="text-muted-foreground mt-3 max-w-[460px] text-[12.5px] leading-relaxed">
                {!hasIncome ? (
                  <>
                    Add what you earn and this becomes what is actually free to invest. Until then
                    it is only what is committed.
                  </>
                ) : over ? (
                  <>
                    Your obligations are comfortable —{' '}
                    <b className="num font-semibold">{fmt(w.uncommittedRM, 'MYR')}</b> is
                    uncommitted. It is the <b className="font-semibold">goals</b> that do not fit.
                    Two different facts, kept apart because one is about what you owe and the other
                    about what you intend.
                  </>
                ) : (
                  <>
                    What is left after every fixed obligation
                    {w.claimedRM > 0 ? ' and every goal budget' : ''} — and before groceries, petrol
                    or anything else you live on. This app tracks what is{' '}
                    <b className="font-semibold">known in advance</b>, never what you spend, so this
                    is a ceiling and not a surplus.
                  </>
                )}
              </p>
              {hasIncome ? <LivingCost spend={spend} /> : null}
            </div>

            {hasIncome ? (
              <div className="grid min-w-[300px] flex-1 gap-1.5">
                <Line label="Net income" value={fmt(w.incomeRM, 'MYR')} strong />
                {w.variableRM > 0 ? (
                  <Line
                    label="of which estimated"
                    value={fmt(w.variableRM, 'MYR')}
                    tone="text-muted-foreground"
                  />
                ) : null}
                <Line label="− Commitments" value={fmt(w.committedRM, 'MYR')} tone="text-loss" />
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
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="gap-3">
          <CardContent className="px-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="eyebrow">Coming in</span>
              {hasIncome ? (
                <Badge variant="gain" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  {fmt(w.incomeRM, 'MYR')} net
                </Badge>
              ) : null}
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={openIncome}>
                <PlusIcon />
                Source
              </Button>
            </div>

            {hasIncome ? (
              <div className="mt-1">
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
                <p className="text-faint mt-3 text-[11.5px] leading-relaxed">
                  A salary is a floor; an irregular source is the mean of the last three months and
                  is drawn faded wherever it appears — the same way a projected dividend is never
                  drawn like a declared one. A good quarter must not quietly become the baseline you
                  plan against.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                Nothing recorded. Add a salary or a client and the waterfall above becomes real.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardContent className="px-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="eyebrow">Going out</span>
              {out.rows.length ? (
                <Badge variant="loss" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  {fmt(out.monthlyOutRM, 'MYR')} a month
                </Badge>
              ) : null}
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={openCommitment}>
                <PlusIcon />
                Commitment
              </Button>
            </div>

            {out.rows.length ? (
              <div className="mt-1">
                {out.rows.map(r => (
                  <CommitmentRow
                    key={r.id}
                    r={r}
                    onEdit={openCommitment}
                    onRemove={deleteCommitment}
                  />
                ))}
                <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
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
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                Nothing recorded. Loans, rent, insurance, subscriptions, a card balance.
              </p>
            )}
          </CardContent>
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
