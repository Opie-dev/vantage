/**
 * What was actually spent, month by month.
 *
 * Its own screen rather than a card on Money, because the two answer different
 * questions. Money is the waterfall — what arrives, what is owed, what is left
 * before living costs. This is the half after that line, and it needs room the
 * waterfall cannot give it: a month to navigate, every row rather than the last
 * six, and the reconciliation stated rather than squeezed into a sentence.
 *
 * THE RECONCILIATION IS WHY THIS SCREEN IS HONEST. commitments-and-income-plan.md
 * §2 argued against an expense log because one gets abandoned and then silently
 * under-reports. spendingFor() already infers what actually left the wallets from
 * balance readings, without anything being entered, so the log is measured
 * against it and told to say when it has gone stale. A log that reports its own
 * incompleteness is a different thing from one that quietly lies.
 */
import { useMemo, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { EXPENSE_LABEL, SPEND_UNKNOWN, expensesFor } from '@/lib/calc'
import { dfmt, fmt, monthLabel, pct1 } from '@/lib/format'
import { useVantage } from '@/lib/store'

/** An action on a row: an icon, with the words in a tooltip and on the button. */
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

/**
 * How much of what left the wallet actually got typed.
 *
 * Four states, and three of them are "cannot know yet" rather than a number.
 * That is deliberate: a coverage figure invented from a missing wallet reading
 * would be worse than no figure, because it would look like an answer.
 */
function Coverage({ ex }) {
  const { spend } = ex

  if (spend.reason === SPEND_UNKNOWN.NO_WALLET) {
    return (
      <p className="text-faint text-[12px] leading-relaxed">
        Mark the account you spend from as a <b className="font-semibold">wallet</b> on the Assets
        screen and record its balance now and then. The app can work out what actually left it, and
        will tell you how much of that is on this list.
      </p>
    )
  }
  if (spend.reason) {
    return (
      <p className="text-faint text-[12px] leading-relaxed">
        {spend.reason === SPEND_UNKNOWN.NO_CLOSING_READING
          ? 'One wallet reading so far. Record a second and this list gets checked against what actually left.'
          : 'No wallet reading before this month, so there is nothing to measure the gap from yet.'}
      </p>
    )
  }

  const missing = ex.unloggedRM > 1
  return (
    <div className={`border-l-2 pl-3 ${missing ? 'border-cash' : 'border-gain'}`}>
      <p className="text-[12.5px] leading-relaxed">
        {missing ? (
          <>
            About <b className="num text-cash font-semibold">{fmt(ex.unloggedRM, 'MYR')}</b> left
            your wallet without being logged
            {ex.coveragePct != null ? (
              <>
                {' '}
                — <b className="num font-semibold">{pct1(ex.coveragePct)}</b> of what actually went
                out is on this list
              </>
            ) : null}
            . Not a judgement, just the arithmetic: the app can see the total without being told.
          </>
        ) : ex.unloggedRM < -1 ? (
          <>
            <b className="num font-semibold">{fmt(Math.abs(ex.unloggedRM), 'MYR')}</b> more is
            logged than actually left the wallet. That usually means something was entered twice, or
            dated into the wrong month — not that you spent less than you thought.
          </>
        ) : (
          <>This matches what actually left your wallet, so the list looks complete.</>
        )}
      </p>
      <p className="text-faint num mt-1 text-[11px]">
        measured {dfmt(spend.from)} to {dfmt(spend.to)} · {spend.days} days
      </p>
    </div>
  )
}

export default function Expenses() {
  const { state, openExpense, deleteExpense } = useVantage()
  const now = new Date()
  const [{ y, m }, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })

  const ex = useMemo(() => expensesFor(state, y, m), [state, y, m])
  const thisMonth = y === now.getFullYear() && m === now.getMonth()

  const move = n => {
    const next = new Date(y, m + n, 1)
    setMonth({ y: next.getFullYear(), m: next.getMonth() })
  }
  const goToday = () => setMonth({ y: now.getFullYear(), m: now.getMonth() })

  return (
    <div className="grid gap-3">
      <Card>
        <CardContent className="grid gap-4 px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Previous month">
              <ChevronLeftIcon />
            </Button>
            <h3 className="num min-w-[150px] text-center text-[15px] font-semibold">
              {monthLabel(y, m)}
            </h3>
            <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Next month">
              <ChevronRightIcon />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday} disabled={thisMonth}>
              This month
            </Button>
            <div className="ml-auto">
              <Button size="sm" onClick={() => openExpense()}>
                <PlusIcon />
                Add expense
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
            <div className="min-w-[260px]">
              <span className="eyebrow">Spent</span>
              <div className="num mt-1.5 text-[clamp(28px,3.4vw,40px)] leading-none font-semibold tracking-[-0.03em]">
                {fmt(ex.loggedRM, 'MYR')}
              </div>
              <p className="text-faint mt-2 text-[11.5px]">
                {ex.count} {ex.count === 1 ? 'entry' : 'entries'} · groceries, fuel and the rest.
                Rent and subscriptions are <b className="font-semibold">commitments</b> and live on
                Money.
              </p>
            </div>
            <div className="min-w-[300px] flex-1">
              <Coverage ex={ex} />
            </div>
          </div>
        </CardContent>
      </Card>

      {ex.categories.length ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
          <Card className="gap-3">
            <CardHeader className="px-4">
              <span className="eyebrow">By category</span>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 pb-4">
              {ex.categories.map(c => (
                <div key={c.category} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="num">
                      {fmt(c.amountRM, 'MYR')}
                      <span className="text-faint ml-1.5 text-[11px]">{pct1(c.share * 100)}</span>
                    </span>
                  </div>
                  <Progress value={c.share * 100} aria-label={`${c.label} ${pct1(c.share * 100)}`} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader className="px-4">
              <span className="eyebrow">Every entry</span>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              {/* Every row, not a recent few. A log you cannot audit in full is a
                  log you cannot correct, and correcting it is most of what makes
                  the coverage figure above worth reading. */}
              {ex.rows.map(e => (
                <div
                  key={e.id}
                  className="hover:bg-muted/40 flex items-baseline gap-2 rounded-sm px-2 py-1 text-[12.5px]"
                >
                  <span className="num text-muted-foreground w-[72px] shrink-0">{dfmt(e.date)}</span>
                  <Badge variant="neutral" className="shrink-0 px-1.5 py-0 text-[10px]">
                    {EXPENSE_LABEL[e.category] || e.category}
                  </Badge>
                  {e.note ? <span className="text-faint truncate">{e.note}</span> : null}
                  <span className="num ml-auto shrink-0 font-semibold">
                    {fmt(e.amount, e.currency)}
                  </span>
                  <RowAction
                    icon={PencilIcon}
                    label={`Edit the ${dfmt(e.date)} expense`}
                    onClick={() => openExpense(e)}
                  />
                  <RowAction
                    icon={TrashIcon}
                    label={`Remove the ${dfmt(e.date)} expense`}
                    onClick={() => deleteExpense(e.id)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="py-10">
          <CardContent className="text-center">
            <h2 className="num text-[16px] font-semibold">Nothing recorded in {monthLabel(y, m)}</h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed">
              Groceries, fuel, eating out — the spending that is not the same every month. Rent,
              insurance and subscriptions are commitments and belong on Money; entering them here as
              well would count them twice against your income.
            </p>
            <Button size="sm" className="mt-4" onClick={() => openExpense()}>
              <PlusIcon />
              Add expense
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
