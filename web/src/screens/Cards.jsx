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
 * does — see calc.js commitmentRows(), and CardHeadroom, which only appears when
 * the two disagree.
 */
import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { commitmentRows, commitmentsTotal } from '@/lib/calc'
import { fmt } from '@/lib/format'
import { useVantage } from '@/lib/store'

import CardSheet from './money/CardSheet'
import CommitmentRow from './money/CommitmentRow'
import { Meta, MonthStepper } from './money/parts'

export default function Cards() {
  const {
    state,
    openCommitment,
    deleteCommitment,
    openCardPlan,
    deleteCardPlan,
    openCardStatement,
    openStatementImport,
  } = useVantage()

  const out = useMemo(() => commitmentsTotal(state, { kinds: ['REVOLVING'] }), [state])
  // The id and not the row: a row is rebuilt on every state change, so holding
  // one would pin a stale copy open behind a fresh list.
  const [sheetId, setSheetId] = useState(null)

  if (!out.rows.length) {
    return (
      <div className="grid gap-4">
        <MonthStepper />
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

  const cards = out.rows.length
  const withLimit = out.rows.filter(r => r.commitment.credit_limit)
  // Recurring charges these accounts collect. They are counted on Commitments and
  // NOT here — this panel says where the money goes out through, never what it
  // costs, which is why it prints no total of its own alongside the ones above.
  const collected = commitmentRows(state).filter(r => r.collectedBy)

  return (
    <div className="grid gap-4">
      <MonthStepper note="Minimums are a month's figure; what is owed is today's." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Minimums, a month</span>
            <div className="stat num text-loss">{fmt(out.monthlyOutRM, 'MYR')}</div>
            <Meta>
              across {cards} account{cards === 1 ? '' : 's'} · the minimum, never the balance
            </Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Owed today</span>
            <div className="stat num">{fmt(out.owedRM, 'MYR')}</div>
            <Meta>billed and unbilled instalments together</Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Accounts with a limit</span>
            <div className="stat num">
              {withLimit.length}
              <span className="text-faint text-[13px]"> of {cards}</span>
            </div>
            <Meta>what is free is stated per account below, and never added up</Meta>
          </CardContent>
        </Card>
      </div>

      {withLimit.length ? (
        <Card>
          <CardContent className="grid gap-2.5 px-4">
            <span className="eyebrow">Room, per account</span>
            {withLimit.map(r => (
              <div key={r.id} className="grid gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12.5px]">{r.name}</span>
                  <span className="num text-[12.5px] font-semibold">
                    {fmt(r.availableRM, r.cur)} free
                  </span>
                </div>
                <div className="bg-muted h-[5px] overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, r.utilisationPct || 0))}%`,
                      background: 'var(--loss)',
                    }}
                  />
                </div>
                <Meta>
                  {fmt(r.commitment.credit_limit, r.cur)} limit ·{' '}
                  {fmt(r.revolving, r.cur)} billed ·{' '}
                  {fmt(r.blocked, r.cur)} still blocked by instalments
                </Meta>
              </div>
            ))}
            {/* The one thing this screen must never do. Two limits added together
                make the tighter account disappear inside the total, and a total
                is what someone reads before deciding a purchase fits. */}
            <p className="text-faint m-0 mt-1 max-w-[70ch] text-[11.5px] leading-relaxed text-pretty">
              These are not added together, and there is no figure on this screen that adds them.
              Room free on one account cannot pay another&rsquo;s bill — it can only move the debt,
              usually at a worse rate. A combined total would make the tightest account vanish
              inside it, which is the one error this page exists to prevent.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {collected.length ? (
        <Card>
          <CardContent className="grid gap-2 px-4">
            <span className="eyebrow">Which account collects what</span>
            {out.rows.map(card => {
              const mine = collected.filter(r => r.collectedBy.id === card.id)
              if (!mine.length) return null
              return (
                <div key={card.id} className="grid gap-1">
                  <Meta>
                    {card.name} · leaves on the {card.commitment.due_day ?? '—'}
                  </Meta>
                  {mine.map(r => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]"
                    >
                      <span>
                        {r.name}
                        {r.everyMonths > 1 ? (
                          <Meta className="ml-1.5">every {r.everyMonths} months</Meta>
                        ) : null}
                      </span>
                      <span className="num">{fmt(r.monthlyOut, r.cur)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            <p className="text-faint m-0 mt-1 max-w-[70ch] text-[11.5px] leading-relaxed text-pretty">
              These are already subtracted from income on Commitments and are not added again here
              — this says where the money goes out through, not what it costs. Move a direct debit
              to the other account and the day it leaves moves with it, which is the whole reason
              it is stored per account rather than per charge.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="eyebrow">The accounts</span>
          <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {cards}
          </Badge>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => openStatementImport()}>
            Import a statement
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add a card account"
            title="Add a card account"
            onClick={() => openCommitment({ kind: 'REVOLVING' })}
          >
            <PlusIcon />
          </Button>
        </div>
        <div className="border-hairline border-t">
          {out.rows.map(r => (
            <CommitmentRow
              key={r.id}
              r={r}
              onEdit={openCommitment}
              onRemove={deleteCommitment}
              onAddPlan={openCardPlan}
              onRemovePlan={deleteCardPlan}
              onAddStatement={openCardStatement}
              onOpenSheet={setSheetId}
            />
          ))}
        </div>
      </Card>

      <p className="text-faint m-0 max-w-[78ch] text-[11.5px] leading-relaxed text-pretty">
        A card is the one commitment whose monthly figure is a guess. For a loan the instalment
        is the instalment; here what actually left is whatever was actually paid, anywhere between
        the minimum and the whole bill — so a recorded payment always wins over the derived
        minimum, and the month on {' '}
        <span className="text-muted-foreground">Overview</span> reads the payment rather than this
        figure.
      </p>

      <CardSheet
        row={out.rows.find(r => r.id === sheetId) || null}
        open={sheetId != null}
        onClose={() => setSheetId(null)}
      />
    </div>
  )
}
