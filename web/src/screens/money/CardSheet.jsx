/**
 * One card account, opened in full.
 *
 * A SHEET AND NOT A SCREEN, EVEN NOW. Credit cards is a rail entry, but that
 * entry lists the accounts; this is one of them opened over the list, so the
 * list stays behind it and a second account is one dismissal away rather than a
 * navigation. What the rail entry bought was room for the list and its totals —
 * two limits that are not one pool — not a page per piece of plastic.
 */
import { PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cardFloat } from '@/lib/calc'
import { dfmt, fmt, pct1 } from '@/lib/format'
import { useVantage } from '@/lib/store'

import { Meta, RowAction } from './parts'

function BandLine({ colour, value, label, dim = false }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        className="mt-1 size-2 shrink-0 rounded-full"
        style={{ background: colour, opacity: dim ? 0.45 : 1 }}
      />
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
 */
function Timeline({ row }) {
  const at = iso => new Date(`${iso}T00:00:00Z`).getTime()
  const closedISO = row.statement ? row.statement.statement_date : null
  const dueISO = row.statement ? row.statement.due_date : null

  const marks = [
    closedISO && { iso: closedISO, label: 'bill closed', hot: true },
    { iso: null, label: 'today', now: true },
    dueISO && { iso: dueISO, label: `${fmt(row.minimum, row.cur)} minimum`, hot: true },
    { iso: row.cycle.closesOn, label: 'next closes' },
    { iso: row.cycle.dueOn, label: 'and is due' },
  ].filter(Boolean)

  const today = Date.now()
  const times = marks.map(m => (m.iso ? at(m.iso) : today))
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
            <span className={m.now ? 'text-loss font-semibold' : 'num'}>
              {m.iso ? dfmt(m.iso) : 'today'}
            </span>
            <span className="text-faint block">{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
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

  const rows = [
    { label: `Owed on ${dfmt(f.from)}`, rm: f.owedBefore },
    { label: 'Paid off it', rm: -f.paidRM, tone: 'text-gain' },
    { label: `Owed on ${dfmt(f.to)}`, rm: f.owedAfter },
  ]

  return (
    <div className="border-hairline border-t pt-4">
      <span className="eyebrow">Float, over the cycle just closed</span>
      <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
        <span className="num text-loss text-[26px] leading-none font-semibold">
          {f.rm >= 0 ? '+' : ''}
          {fmt(f.rm, f.cur)}
        </span>
        <Meta>
          {dfmt(f.from)} &rarr; {dfmt(f.to)}
        </Meta>
      </div>
      <p className="text-muted-foreground mt-2 mb-2.5 text-[12px] leading-relaxed text-pretty">
        Owed went from {fmt(f.owedBefore, f.cur)} to {fmt(f.owedAfter, f.cur)} while{' '}
        {fmt(f.paidRM, f.cur)} was paid off it. That difference is spending that has already
        happened and has not left your account — the whole of a cycle&rsquo;s activity, in one
        subtraction. No transaction was needed to know it.
      </p>
      <div className="grid gap-1">
        {rows.map(r => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`num ${r.tone || ''}`}>
              {r.rm < 0 ? '\u2212' : ''}
              {fmt(Math.abs(r.rm), f.cur)}
            </span>
          </div>
        ))}
        <div className="border-hairline flex items-baseline justify-between gap-3 border-t pt-1.5 text-[12px] font-semibold">
          <span>Spent on the card</span>
          <span className="num text-loss">{fmt(f.rm, f.cur)}</span>
        </div>
      </div>
      <p className="text-faint m-0 mt-2.5 text-[11.5px] leading-relaxed text-pretty">
        This is why Expenses lags: {fmt(f.rm, f.cur)} was lived in one cycle and pays in the next.
        The residual there reports money leaving your wallet, and the card is where that promise
        waits.
      </p>
    </div>
  )
}

/**
 * One card account, opened from its row on Money.
 *
 * NOT A FIFTH RAIL ITEM. Two cards do not justify a screen, and commit 654ad24
 * took Expenses off the rail for the same reason — two doors into one room read
 * as two rooms to everyone but their author.
 *
 * The three-band bar is the whole argument of the card work. Revolving at APR,
 * instalments billed each cycle, and instalments NOT YET BILLED — and the third
 * band is the one no statement prints anywhere. A bill showing a third of the
 * limit used can sit on an account with almost nothing free, because the unbilled
 * principal keeps blocking it until each month's share is repaid.
 */
export default function CardSheet({ row, open, onClose }) {
  const { deleteCardStatement, openCardStatement, openStatementImport, openCardPlan, openCardPayment } =
    useVantage()
  if (!row) return null
  const c = row.commitment
  const limit = c.credit_limit || 0
  const pct = v => (limit ? `${Math.max(0, Math.min(100, (v / limit) * 100))}%` : '0%')
  const billed = row.instalments
  const unbilled = Math.max(row.blocked - billed, 0)

  return (
    <Sheet open={open} onOpenChange={v => (v ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-baseline gap-2">{row.name}</SheetTitle>
          <SheetDescription>
            {limit ? `Limit ${fmt(limit, row.cur)} · ` : ''}
            {c.apr}% if carried
            {row.cycle ? ` · statement ${c.statement_day}, due ${c.due_day}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 px-4 pb-6">
          <div>
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div>
                <span className="eyebrow">Committed on this account</span>
                <div className="stat mt-1.5">{fmt(row.owed, row.cur)}</div>
              </div>
              {row.availableRM != null ? (
                <div>
                  <span className="eyebrow">Actually available</span>
                  <div className="stat mt-1.5" style={{ color: 'var(--chart-2)' }}>
                    {fmt(row.availableRM, row.cur)}
                  </div>
                </div>
              ) : null}
            </div>

            {limit ? (
              <>
                <div className="bg-muted mt-4 flex h-2 overflow-hidden rounded-full">
                  <div style={{ width: pct(row.revolving), background: 'var(--loss)' }} />
                  <div style={{ width: pct(billed), background: 'var(--chart-2)' }} />
                  <div
                    style={{ width: pct(unbilled), background: 'var(--chart-2)', opacity: 0.45 }}
                  />
                </div>
                <div className="mt-3 grid gap-1.5">
                  <BandLine
                    colour="var(--loss)"
                    value={fmt(row.revolving, row.cur)}
                    label={`revolving, at ${c.apr}% — costs ${fmt(row.interestThisMonth, row.cur)} a month`}
                  />
                  {billed > 0 ? (
                    <BandLine
                      colour="var(--chart-2)"
                      value={fmt(billed, row.cur)}
                      label="instalments billed each cycle"
                    />
                  ) : null}
                  {unbilled > 0 ? (
                    <BandLine
                      colour="var(--chart-2)"
                      dim
                      value={fmt(unbilled, row.cur)}
                      label="unbilled principal, still blocking the limit"
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <Meta className="mt-2 block">
                No credit limit recorded, so utilisation and headroom cannot be shown.
              </Meta>
            )}
          </div>

          <div className="border-hairline border-t pt-4">
            <div className="flex items-center gap-2">
              <span className="eyebrow">The cycle</span>
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
            {row.cycle ? (
              <>
                <Timeline row={row} />
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <span className="eyebrow">Minimum due</span>
                    <div className="num text-[15px] font-semibold">{fmt(row.minimum, row.cur)}</div>
                    <Meta>
                      {row.minimumIsStated
                        ? 'as the bill printed it'
                        : '5% of retail, plus contracted instalments in full'}
                    </Meta>
                  </div>
                  <div>
                    <span className="eyebrow">Statement balance</span>
                    <div className="num text-[15px] font-semibold">
                      {row.statement ? fmt(row.statement.closing_balance, row.cur) : '—'}
                    </div>
                    <Meta>
                      {row.statement
                        ? `what the bill asked for on ${dfmt(row.statement.statement_date)}`
                        : 'no bill recorded yet'}
                    </Meta>
                  </div>
                  <div>
                    {/* The rate runs on the REVOLVING band alone. A 0% instalment
                        plan sits inside the balance and costs nothing, so charging
                        the APR across the whole figure would invent interest. */}
                    <span className="eyebrow">Cost of carrying</span>
                    <div className="num text-loss text-[15px] font-semibold">
                      {fmt(row.interestThisMonth, row.cur)}
                      <span className="text-faint text-[11px]">/mo</span>
                    </div>
                    <Meta>
                      {row.commitment.apr
                        ? `${pct1(row.commitment.apr)} on the revolving band only`
                        : 'no rate recorded'}
                    </Meta>
                  </div>
                </div>
                <p className="text-muted-foreground mt-2.5 mb-0 text-[12px] leading-relaxed text-pretty">
                  Anything bought today lands on that bill —{' '}
                  <b className="font-semibold">
                    {row.cycle.daysOfFloat} {row.cycle.daysOfFloat === 1 ? 'day' : 'days'}
                  </b>{' '}
                  before it has to be paid. The interest-free period runs from the day the bill
                  closes, not the day it is due, which is why both are stored.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mt-2 mb-0 text-[12px] leading-relaxed text-pretty">
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
                <Badge
                  variant="neutral"
                  className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                >
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
                {row.statements.map(st => (
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
                ))}
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
                One so far. Maybank keeps twelve months online — importing the rest would give the
                float a year of history rather than a single window.
              </p>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
