/**
 * Overview — what arrived, what was promised, and what living actually took.
 *
 * TWO QUESTIONS, KEPT APART, and this screen exists to keep them apart. The
 * column on the left is what HAPPENED: every figure in it actually arrived or
 * actually left, over the window two wallet readings bracket, and it closes
 * exactly. The card beside it is the run rate — what a usual month costs — and
 * it is forward-looking. Mixing a measured month with a monthly average is the
 * one mistake this layout exists to prevent, and money-redesign-plan.md §2.2 is
 * what it looks like when the mixing happens: a column out by exactly one
 * amortised road tax.
 *
 * TWO VIEWS, ONE SET OF FIGURES. Waterfall and Flow are a stored preference, and
 * neither holds a number of its own — both render overviewRows(), for the reason
 * §2.4 gives: the canvas drew both with their own copies and they disagreed
 * about the same ringgit.
 */
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  OVERVIEW_MODE,
  currentMonth,
  expensesFor,
  overviewMode,
  overviewRows,
  waterfall,
} from '@/lib/calc'
import { dfmt, fmt, fmtS, monthLabel, pct1 } from '@/lib/format'
import { useVantage } from '@/lib/store'

import { Line, Meta, MonthStrip, STICKY_TOP } from './money/parts'

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

/** The column, read downward. Every row is overviewRows(); none is computed here. */
function Waterfall({ view, monthShort }) {
  return (
    <div className="grid gap-1.5">
      {view.rows.map(r => (
        <Line
          key={r.key}
          label={r.label}
          value={fmtS(r.rm, 'MYR')}
          tone={r.tone === 'gain' ? 'text-gain' : r.tone === 'loss' ? 'text-loss' : ''}
          strong={!!r.total}
          rule={!!r.total}
        />
      ))}
      <Meta className="mt-1 block">
        Measured over the window two wallet readings bracket, closing on {monthShort}. Nothing in
        this column is an average.
      </Meta>
    </div>
  )
}

/** The same rows, laid out by where the money went rather than by subtraction. */
function Flow({ view }) {
  const arrives = view.rows.filter(r => r.rm > 0 && !r.total)
  const leaves = view.rows.filter(r => r.rm < 0)
  const left = view.rows.find(r => r.total)
  const share = rm => (view.incomeRM ? Math.min(100, (Math.abs(rm) / view.incomeRM) * 100) : 0)

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid content-start gap-1.5">
          <span className="eyebrow">Arrives</span>
          {arrives.map(r => (
            <div key={r.key}>
              <div className="num text-gain text-[14px] font-semibold">{fmt(r.rm, 'MYR')}</div>
              <Meta>{r.label}</Meta>
            </div>
          ))}
        </div>
        <div className="grid content-start gap-1.5">
          <span className="eyebrow">Promised, and spent</span>
          {leaves.map(r => (
            <div key={r.key}>
              <div className="flex items-baseline gap-2">
                <span className="num text-loss text-[14px] font-semibold">
                  {fmt(Math.abs(r.rm), 'MYR')}
                </span>
                <Meta>{pct1(share(r.rm))}</Meta>
              </div>
              <Meta>{r.label}</Meta>
              <div className="bg-muted mt-1 h-[4px] overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share(r.rm)}%`, background: 'var(--loss)' }}
                />
              </div>
            </div>
          ))}
        </div>
        {/* NOT A BALANCE, which is the trap this column fell into. The residual
            the other two columns leave is what living TOOK — money already gone,
            not money still to hand — so "Still here" stated the opposite of the
            row printed directly underneath it. */}
        <div className="grid content-start gap-1.5">
          <span className="eyebrow">What that leaves</span>
          {left ? (
            <div>
              <div className="num text-[14px] font-semibold">{fmt(left.rm, 'MYR')}</div>
              <Meta>{left.label}</Meta>
            </div>
          ) : null}
        </div>
      </div>
      <Meta className="block">
        Widths are shares of what arrived. Every figure is the one the waterfall shows — the two
        views cannot disagree, because neither computes anything.
      </Meta>
    </div>
  )
}

export default function Overview() {
  const { state, setTab, setPreference } = useVantage()
  // THE MONTH THAT IS HAPPENING, always. This screen has no control that moves
  // it and no way to be shown another one — Expenses drilling into July is a
  // fact about Expenses, and the whole point of taking the month out of the
  // store is that it can no longer drag this statement along with it.
  const { y, m } = currentMonth()

  const w = useMemo(() => waterfall(state), [state])
  const ex = useMemo(() => expensesFor(state, y, m), [state, y, m])
  const view = useMemo(() => overviewRows(state, y, m), [state, y, m])

  const mode = overviewMode(state)
  const monthShort = monthLabel(y, m).slice(0, 3)
  const over = w.rows.length > 0 && w.overclaimedRM > 0

  if (!w.rows.length && !w.commitments.rows.length && !ex.count) {
    return (
      <div className="grid gap-4">
        <MonthStrip />
        <Card>
          <CardContent className="grid gap-3 px-4 py-6">
            <span className="eyebrow">Nothing to show yet</span>
            <p className="text-muted-foreground m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty">
              This is the whole month: what arrives, what is owed, and what living actually took.
              It needs a source of income and something you owe before it can say anything — and
              it never needs you to record a purchase.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setTab('income')}>
                Add income
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTab('commitments')}>
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
      <MonthStrip />

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] lg:items-start">
        <div className={`grid content-start gap-3 lg:sticky ${STICKY_TOP}`}>
          <Card>
            <CardContent className="grid gap-2.5 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">What happened to the money</span>
                <div className="flex-1" />
                <div className="bg-muted flex rounded-md p-0.5">
                  {[OVERVIEW_MODE.WATERFALL, OVERVIEW_MODE.FLOW].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPreference({ overviewMode: v })}
                      className={`rounded-[5px] px-2 py-0.5 text-[11px] capitalize transition-colors ${
                        mode === v ? 'bg-background text-foreground font-semibold' : 'text-muted-foreground'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {view.reason ? (
                // SAID ONCE ON THIS SCREEN, and the strip is where. Both surfaces
                // used to print SPEND_WHY[reason] in full, forty words apart, so
                // the same sentence about the same missing reading appeared twice
                // on one page and only one of the two offered the form that fixes
                // it. This column still has to say why its own figures are absent
                // — leaving the space blank reads as a month that cost nothing —
                // so it says that, and points at the one statement of the reason.
                <p className="text-muted-foreground m-0 text-[12px] leading-relaxed text-pretty">
                  <b className="text-foreground font-semibold">
                    What living cost cannot be worked out for {monthShort}.
                  </b>{' '}
                  The strip above names the reading that is missing, and opens the form for it.
                </p>
              ) : mode === OVERVIEW_MODE.FLOW ? (
                <Flow view={view} />
              ) : (
                <Waterfall view={view} monthShort={monthShort} />
              )}

              {!view.reason && view.spend.floatRM != null ? (
                <Meta className="border-hairline block border-t pt-2">
                  The cards took on {fmt(view.spend.floatRM, 'MYR')} over the same window, which is
                  spending that has happened and has not left your account yet. Living cost{' '}
                  {fmt(view.spend.livingCostRM, 'MYR')} once it is counted.
                </Meta>
              ) : null}

              {!view.reason ? (
                <Meta className="block">
                  Window {dfmt(view.spend.from)} to {dfmt(view.spend.to)} · {view.spend.days} days
                  {view.closes ? '' : ' · this column does not close, which is a bug, not a rounding'}
                </Meta>
              ) : null}
            </CardContent>
          </Card>

          <Coverage ex={ex} />
        </div>

        <Card className="min-w-0">
          <CardContent className="grid gap-1.5 px-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">The other question · a usual month</span>
              {over ? (
                <Badge variant="loss" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  goals over by {fmt(w.overclaimedRM, 'MYR')}
                </Badge>
              ) : null}
            </div>
            {/* The stepper's caption, kept because it was never about the
                stepper: these rows are a run rate, and the column on the left is
                the measured month. Two bases on one screen, and this is the line
                that says which one you are reading. */}
            <Meta className="block">Run-rate figures say a month, never this month.</Meta>
            <Line label="Net income" value={fmt(w.incomeRM, 'MYR')} tone="text-gain" />
            {w.variableRM > 0 ? (
              <Line label="of which estimated" value={fmt(w.variableRM, 'MYR')} tone="text-faint" />
            ) : null}
            <Line label="− Commitments, a month" value={fmt(w.committedRM, 'MYR')} tone="text-loss" />
            <Line label="= Uncommitted" value={fmt(w.uncommittedRM, 'MYR')} strong rule />
            {w.claimedRM > 0 ? (
              <>
                <Line label="− Claimed by goals" value={fmt(w.claimedRM, 'MYR')} tone="text-loss" />
                <Line label="= Unclaimed" value={fmt(w.unclaimedRM, 'MYR')} strong rule />
              </>
            ) : null}
            <p className="text-faint m-0 mt-1.5 max-w-[62ch] text-[11.5px] leading-relaxed text-pretty">
              {over
                ? 'Uncommitted is healthy; it is the goals that do not fit. Those are different problems with different fixes, which is why they are two lines and not one.'
                : 'A ceiling, not a surplus. Everything you actually live on is still ahead of this figure — the column on the left is where it lands.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
