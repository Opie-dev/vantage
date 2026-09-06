/**
 * Loans — four fields and today's date give the whole schedule.
 *
 * NOTHING HERE IS STORED. The instalment, what has been paid, what is left and
 * how this month's payment splits are all derived from principal, rate, rate
 * type, term and start date. Only deviations are recorded — an overpayment, a
 * missed month — because a stored schedule is a second copy of arithmetic that
 * can drift from the first.
 *
 * A LOAN PAYMENT IS NOT AN EXPENSE, and this screen is where that is easiest to
 * get wrong. Most of an instalment moves cash into equity; only the interest is
 * spent. Cash flow subtracts all of it and net worth must not, so the two halves
 * are shown apart and never totalled into one "cost".
 *
 * AND A FLAT-RATE LOAN OWES INSTALMENTS, NOT A BALANCE. Interest is charged on
 * the original principal for the whole term however much has been repaid, so
 * what is outstanding is the instalments still to run — which is higher than any
 * settlement figure, because settling early earns a rebate this app does not
 * model. The footnote says so rather than letting the number pass as a payoff
 * quote.
 */
import { useMemo } from 'react'
import { PlusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { commitmentsTotal } from '@/lib/calc'
import { fmt } from '@/lib/format'
import { useVantage } from '@/lib/store'

import CommitmentRow from './money/CommitmentRow'
import { Meta, MonthStepper } from './money/parts'

export default function Loans() {
  const { state, openCommitment, deleteCommitment } = useVantage()
  const out = useMemo(() => commitmentsTotal(state, { kinds: ['LOAN'] }), [state])
  const hasFlat = out.rows.some(r => r.flat)

  if (!out.rows.length) {
    return (
      <div className="grid gap-4">
        <MonthStepper />
        <Card>
          <CardContent className="grid gap-3 px-4 py-6">
            <span className="eyebrow">No loans</span>
            <p className="text-muted-foreground m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty">
              A mortgage or a hire purchase. Five fields and no schedule: the amount financed,
              the rate as the agreement quotes it, what that rate is computed on, the term, and
              the first payment. Everything else on this screen is worked out from those.
            </p>
            <div>
              <Button size="sm" onClick={() => openCommitment({ kind: 'LOAN' })}>
                <PlusIcon />
                Add a loan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <MonthStepper note="Instalments are the same every month; the split between them is not." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Instalments, a month</span>
            <div className="stat num text-loss">{fmt(out.monthlyOutRM, 'MYR')}</div>
            <Meta>
              {out.rows.length} loan{out.rows.length === 1 ? '' : 's'} · the whole payment, both
              halves
            </Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Of that, spent</span>
            <div className="stat num text-loss">{fmt(out.interestPerMonthRM, 'MYR')}</div>
            <Meta>interest — the only part that is a cost</Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Of that, kept</span>
            <div className="stat num text-gain">{fmt(out.principalPerMonthRM, 'MYR')}</div>
            <Meta>principal — cash moving into equity, not out of your pocket</Meta>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="eyebrow">Outstanding</span>
          <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {fmt(out.owedRM, 'MYR')}
          </Badge>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add a loan"
            title="Add a loan"
            onClick={() => openCommitment({ kind: 'LOAN' })}
          >
            <PlusIcon />
          </Button>
        </div>
        <div className="border-hairline border-t">
          {out.rows.map(r => (
            <CommitmentRow key={r.id} r={r} onEdit={openCommitment} onRemove={deleteCommitment} />
          ))}
        </div>
      </Card>

      <p className="text-faint m-0 max-w-[78ch] text-[11.5px] leading-relaxed text-pretty">
        Only the interest is spent. The rest of every instalment is a transfer from cash into
        equity, which is why cash flow subtracts the whole payment and net worth subtracts none of
        it.
        {hasFlat ? (
          <>
            {' '}
            A flat-rate loan&rsquo;s outstanding figure here is the instalments still to run, not
            what the lender would settle for — that is lower, by a rebate this app does not model,
            so nothing on this screen is a payoff quote.
          </>
        ) : null}{' '}
        Tracking a mortgage without tracking the house understates net worth by the whole value of
        the house; the Dashboard says so in words rather than absorbing the asymmetry quietly.
      </p>
    </div>
  )
}
