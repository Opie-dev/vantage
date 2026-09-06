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

function CycleLine({ label, value, strong = false }) {
  return (
    <div className="flex items-baseline gap-3 text-[12.5px]">
      <span className={`flex-1 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`num ${strong ? 'font-semibold' : ''}`}>{value}</span>
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
                <div className="mt-2.5 grid gap-1.5">
                  <CycleLine label="Bill closes" value={dfmt(row.cycle.closesOn)} />
                  <CycleLine label="And falls due" value={dfmt(row.cycle.dueOn)} strong />
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
