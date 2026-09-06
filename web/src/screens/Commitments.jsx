/**
 * Commitments — money known in advance. Enter it once and it stays correct.
 *
 * EVERY KIND, ON PURPOSE. Loans and cards have their own screens because they
 * carry maths this list cannot show, but they appear here too, because they are
 * money promised and leaving out the two biggest promises would make the total
 * a lie. The row opens the screen that owns it.
 *
 * A COMMITMENT IS NOT AN EXPENSE. It is known in advance and correct for years
 * after one entry — rent, a phone plan, an instalment. Spending is not
 * predictable and is never entered anywhere: it is inferred as a residual on
 * Expenses, which is why nothing here asks you to log a purchase.
 *
 * TWO TOTALS, TWO QUESTIONS. The run rate spreads an annual charge over twelve
 * months and answers "what does a usual month cost". What falls this month
 * answers "what happens in August". They differ by exactly the annual items that
 * do not land, and both are shown because a screen with one of them invites the
 * other to be guessed at.
 */
import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { commitmentsTotal, expensesFor } from '@/lib/calc'
import { fmt, monthLabel } from '@/lib/format'
import { useVantage } from '@/lib/store'

import CommitmentRow from './money/CommitmentRow'
import { Meta, MonthStepper } from './money/parts'

const TABS = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'recurring', label: 'Recurring', kinds: ['RECURRING'] },
  { id: 'loans', label: 'Loans', kinds: ['LOAN'] },
  { id: 'cards', label: 'Cards', kinds: ['REVOLVING'] },
]

export default function Commitments() {
  const { state, moneyMonth, setTab, openCommitment, deleteCommitment } = useVantage()
  const { y, m } = moneyMonth
  const [tab, setKindTab] = useState('all')

  const out = useMemo(() => commitmentsTotal(state), [state])
  // What actually fell in the chosen month, as opposed to what a usual month
  // costs. spendingFor() derives it from the schedule, so it is a fact about
  // this month rather than an average wearing this month's label.
  const ex = useMemo(() => expensesFor(state, y, m), [state, y, m])
  const monthShort = monthLabel(y, m).slice(0, 3)

  const kinds = TABS.find(t => t.id === tab)?.kinds
  const shown = kinds ? out.rows.filter(r => kinds.includes(r.kind)) : out.rows

  if (!out.rows.length) {
    return (
      <div className="grid gap-4">
        <MonthStepper />
        <Card>
          <CardContent className="grid gap-3 px-4 py-6">
            <span className="eyebrow">Nothing committed yet</span>
            <p className="text-muted-foreground m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty">
              Rent, insurance, a phone plan, a loan, a card. Anything you know the shape of in
              advance goes here once and stays right for years. Anything you do not — groceries,
              petrol, a night out — never goes anywhere: Expenses infers it.
            </p>
            <div>
              <Button size="sm" onClick={() => openCommitment()}>
                <PlusIcon />
                Add a commitment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <MonthStepper note="The run rate is a usual month; the second figure is this one." />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Committed run rate · monthly</span>
            <div className="stat num text-loss">{fmt(out.monthlyOutRM, 'MYR')}</div>
            <Meta>annual charges spread over twelve months, so no month reads as a spike</Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Falling in {monthShort}</span>
            <div className="stat num text-loss">
              {ex.spend?.reason ? '—' : fmt(ex.spend.committedRM, 'MYR')}
            </div>
            <Meta>
              {ex.spend?.reason
                ? 'needs a wallet reading bracketing the month'
                : 'what these commitments actually took out of this month'}
            </Meta>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <span className="eyebrow">Commitments</span>
          <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {out.rows.length}
          </Badge>
          <div className="bg-muted ml-1 flex rounded-md p-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKindTab(t.id)}
                className={`rounded-[5px] px-2.5 py-1 text-[11.5px] transition-colors ${
                  tab === t.id
                    ? 'bg-background text-foreground font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add a commitment"
            title="Add a commitment"
            onClick={() => openCommitment()}
          >
            <PlusIcon />
          </Button>
        </div>

        <div className="border-hairline border-t">
          {shown.length ? (
            shown.map(r => (
              <CommitmentRow key={r.id} r={r} onEdit={openCommitment} onRemove={deleteCommitment} />
            ))
          ) : (
            <p className="text-faint m-0 px-4 py-6 text-[12px]">Nothing of that kind yet.</p>
          )}
        </div>
      </Card>

      <p className="text-faint m-0 max-w-[78ch] text-[11.5px] leading-relaxed text-pretty">
        Loans and cards are entered on their own screens — they carry maths this list cannot ask
        for. They appear here because they are money promised.{' '}
        <button
          type="button"
          onClick={() => setTab('loans')}
          className="text-muted-foreground underline underline-offset-2"
        >
          Loans
        </button>{' '}
        and{' '}
        <button
          type="button"
          onClick={() => setTab('cards')}
          className="text-muted-foreground underline underline-offset-2"
        >
          Credit cards
        </button>{' '}
        own their rows. And a loan instalment is only part cost: most of it moves cash into equity,
        so cash flow subtracts all of it and net worth must not.
      </p>
    </div>
  )
}
