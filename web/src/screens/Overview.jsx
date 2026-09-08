/**
 * Overview — what arrived, what was promised, and what living actually took.
 *
 * TWO QUESTIONS IN ONE COLUMN NOW, AND THE SEAM IS DRAWN. They used to be two
 * cards side by side: what HAPPENED on the left — every figure actually arrived
 * or actually left, over the window two wallet readings bracket — and the run
 * rate beside it, what a usual month costs, which is forward-looking. The card
 * is gone and the column carries both, run rate first and measured after a
 * stated rule.
 *
 * THAT MOVES THE RISK RATHER THAN REMOVING IT, so read money-redesign-plan.md
 * §2.2 before touching monthShape(): mixing a measured month with a monthly
 * average is the mistake this screen was laid out to prevent, and §2.2 is what it
 * looked like — a column out by exactly one amortised road tax. What keeps it
 * honest now is arithmetic rather than distance: nothing sums across the rule,
 * the five rate rows close on `Uncommitted` exactly, and the measured half
 * carries no percentage because its three figures are not parts of one whole.
 * Both properties are asserted in smoke.mjs; if either goes, the column is lying.
 *
 * TWO VIEWS, ONE SET OF FIGURES. Waterfall and Flow are a stored preference and
 * neither holds a number of its own — both render monthShape(), which itself
 * derives nothing and reads waterfall() and overviewRows() straight through. The
 * reason is §2.4: the canvas drew both views with their own copies and they
 * disagreed about the same ringgit.
 */
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  OVERVIEW_MODE,
  VARIABLE_MONTHS,
  currentMonth,
  expensesFor,
  monthShape,
  overviewMode,
  waterfall,
} from '@/lib/calc'
import { dfmt, fmt, fmtS, monthLabel, pct1 } from '@/lib/format'
import { useVantage } from '@/lib/store'

import { Meta, MonthStrip } from './money/parts'

/** The declared half is solid; the averaged half is hatched, everywhere it appears. */
const INCOME_HATCH =
  'repeating-linear-gradient(115deg, color-mix(in srgb, var(--gain) 55%, transparent) 0 2px, transparent 2px 7px)'

/**
 * What arrives, and how much of it is a promise rather than a payment.
 *
 * THE HATCHING IS THE ARGUMENT. A salary is a floor and freelance is a guess, and
 * a total that draws them alike invites the reader to plan against the guess.
 * `variableParts` carries the individual months behind the mean, so the figure
 * shows its working instead of asserting itself — see incomeRows(): shorter than
 * three months is noise, longer is stale.
 */
function IncomeThisMonth({ shape, monthName }) {
  const { firmRM, variableRM, incomeRM, variableParts } = shape
  if (!incomeRM) return null
  const firmPct = incomeRM > 0 ? (firmRM / incomeRM) * 100 : 0
  const months = variableParts.flatMap(p => p.recentRM)

  return (
    <div className="grid gap-3">
      <div className="eyebrow">Income this month · {monthName}</div>

      <div className="num text-[clamp(32px,5vw,58px)] leading-[0.95] font-semibold tracking-[-0.04em]">
        {variableRM > 0 ? <span className="text-faint">≈</span> : null}
        {fmt(incomeRM, 'MYR')}
      </div>

      <p className="text-muted-foreground m-0 max-w-[68ch] text-[12.5px] leading-relaxed text-pretty">
        <b className="num text-foreground font-semibold">{fmt(firmRM, 'MYR')}</b> is declared — what
        a recorded payment says, net of statutory deductions.
        {variableRM > 0 ? (
          <>
            {' '}
            The remaining <b className="num text-foreground font-semibold">≈{fmt(variableRM, 'MYR')}</b>{' '}
            is the mean of the last {VARIABLE_MONTHS} months
            {months.length ? <> — {months.map(v => fmt(v, 'MYR')).join(', ')}</> : null} — and is
            hatched everywhere it appears. A salary is a floor; irregular work is not a baseline.
          </>
        ) : (
          <> Nothing irregular fed this month, so none of it is an estimate.</>
        )}
      </p>

      <div className="border-hairline flex h-6 overflow-hidden rounded-sm border">
        <div
          className="bg-gain flex items-center px-2"
          style={{ width: `${firmPct}%` }}
          title={`declared ${fmt(firmRM, 'MYR')}`}
        >
          <span className="num text-[10.5px] font-semibold whitespace-nowrap text-black/70">
            {fmt(firmRM, 'MYR')} declared
          </span>
        </div>
        {variableRM > 0 ? (
          <div
            className="flex-1"
            style={{ backgroundImage: INCOME_HATCH }}
            title={`projected ≈${fmt(variableRM, 'MYR')}`}
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * One row of the column: what it is, what it cost, and what fraction of WHAT.
 *
 * The bar and the percentage are one expression read twice, never two copies —
 * money-redesign-plan.md §2.4 is what happens when a label and a bar each carry
 * their own arithmetic. A row with no share prints no bar: the measured rows
 * share no denominator worth drawing, and a bar with an invented width would be
 * the same lie as an invented percentage.
 */
function ShapeRow({ row, tone }) {
  return (
    <div className="border-hairline grid gap-1 border-b py-2 last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="flex-1 text-[12.5px] font-semibold">{row.label}</span>
        {row.sharePct == null ? null : (
          <span className="num text-faint text-[11px]">{pct1(row.sharePct)}</span>
        )}
        <span className={`num w-[104px] text-right text-[12.5px] font-semibold ${tone}`}>
          {fmtS(row.rm, 'MYR')}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Meta className="flex-1">{row.note}</Meta>
      </div>
      {row.sharePct == null ? null : (
        <div className="bg-muted h-[3px] overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, row.sharePct)}%`, background: `var(${tone === 'text-gain' ? '--gain' : tone === 'text-loss' ? '--loss' : '--cash'})` }}
          />
        </div>
      )}
    </div>
  )
}

const toneOf = row =>
  row.key === 'income' ? 'text-gain'
    : row.key === 'uncommitted' ? 'text-cash'
      : row.rm > 0 ? 'text-gain'
        : row.rm < 0 ? 'text-loss'
          : ''

/**
 * The column, read downward — and it changes basis halfway, which is stated.
 *
 * THE SEAM IS DRAWN, NOT HIDDEN. Above it every figure is a run rate: what a
 * usual month owes, quoted against declared income, and the five rows close on
 * `Uncommitted` exactly. Below it every figure is measured over the window two
 * wallet readings bracket, which is not the calendar month and does not have to
 * be. money-redesign-plan.md §2.2 is what happens when the halves get added
 * together, so nothing here adds across the rule — and the measured half prints
 * no percentage, because its three figures are not parts of one whole.
 */
function Waterfall({ shape, monthShort, monthName }) {
  return (
    <div className="grid gap-4">
      <IncomeThisMonth shape={shape} monthName={monthName} />

      <div className="grid">
        {shape.rateRows.map(r => (
          <ShapeRow key={r.key} row={r} tone={toneOf(r)} />
        ))}
      </div>

      {shape.reason ? (
        <Meta className="block">
          What living cost cannot be worked out for {monthShort} — the strip above names the reading
          that is missing. Everything above this line is a run rate and is unaffected.
        </Meta>
      ) : (
        <>
          <div className="border-hairline flex items-center gap-2 border-t pt-2.5">
            <span className="eyebrow">And what {monthShort} actually did</span>
            <Meta>measured, not owed — over the reading window, not the calendar month</Meta>
          </div>
          <div className="grid">
            {shape.measuredRows.map(r => (
              <ShapeRow key={r.key} row={r} tone={toneOf(r)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** The same rows, laid out by where the money went rather than by subtraction. */
function Flow({ shape, w }) {
  const promised = shape.rateRows.filter(r => r.rm < 0)
  const uncommitted = shape.rateRows.find(r => r.key === 'uncommitted')
  const stayed = shape.measuredRows.find(r => r.key === 'stayed')
  const living = shape.measuredRows.find(r => r.key === 'living')

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[14px] font-semibold">Where the month goes</span>
        <Meta className="flex-1">
          Arrives on the left, promised in the middle, where it stands on the right. Widths are
          shares of declared income.
        </Meta>
        <Meta className="num">
          {fmt(shape.firmRM, 'MYR')} declared
          {shape.variableRM > 0 ? <> · ≈{fmt(shape.variableRM, 'MYR')} projected</> : null}
        </Meta>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ARRIVES. The declared sources are drawn solid and the irregular mean
            hatched, the same treatment the hero above uses, so one glance says
            which half of the income could fail to turn up. */}
        <div className="grid content-start gap-2">
          <span className="eyebrow">Arrives</span>
          {w.rows.filter(r => !r.variable && r.monthlyRM > 0).map(r => (
            <div key={r.id} className="border-hairline rounded-md border px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 text-[12.5px] font-semibold">{r.name}</span>
                <span className="num text-gain text-[12.5px] font-semibold">
                  {fmt(r.monthlyRM, 'MYR')}
                </span>
              </div>
              <Meta>
                net{r.nextDate ? <> · lands {dfmt(r.nextDate)}</> : null} · declared
              </Meta>
            </div>
          ))}
          {w.rows.filter(r => r.variable && r.monthlyRM > 0).map(r => (
            <div
              key={r.id}
              className="border-hairline rounded-md border border-dashed px-3 py-2.5"
              style={{ backgroundImage: INCOME_HATCH }}
            >
              <div className="flex items-baseline gap-2">
                <span className="flex-1 text-[12.5px] font-semibold">{r.name}</span>
                <span className="num text-[12.5px] font-semibold">≈{fmt(r.monthlyRM, 'MYR')}</span>
              </div>
              <Meta>irregular · projected from {VARIABLE_MONTHS} months</Meta>
            </div>
          ))}
        </div>

        {/* PROMISED. Run-rate rows only — what is owed in a usual month. What
            living actually took is measured and belongs in the third column,
            beside the balance it was measured against. */}
        <div className="grid content-start gap-2">
          <span className="eyebrow">Promised</span>
          {promised.map(r => (
            <div key={r.key} className="border-hairline rounded-md border px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 text-[12.5px] font-semibold">{r.label}</span>
                {r.sharePct == null ? null : (
                  <span className="num text-faint text-[11px]">{pct1(r.sharePct)}</span>
                )}
                <span className="num text-loss text-[12.5px] font-semibold">
                  {fmtS(r.rm, 'MYR')}
                </span>
              </div>
              <div className="bg-muted mt-1.5 h-[3px] overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, r.sharePct || 0)}%`, background: 'var(--loss)' }}
                />
              </div>
              <Meta className="mt-1 block">{r.note}</Meta>
            </div>
          ))}
        </div>

        {/* WHERE IT STANDS, and not "Still here" — the heading this column was
            given once and lost for good reason. Two of the three things in it are
            not money to hand: a wallet balance that FELL is the buffer being
            spent, and a liability is owed. "Still here" over those would state
            the opposite of the figures printed beneath it. */}
        <div className="grid content-start gap-2">
          <span className="eyebrow">Where it stands</span>
          {stayed ? (
            <div className="border-hairline rounded-md border px-3 py-2.5">
              <span className="eyebrow">What stayed</span>
              <div className={`num mt-0.5 text-[17px] font-semibold ${toneOf(stayed)}`}>
                {fmtS(stayed.rm, 'MYR')}
              </div>
              <Meta className="mt-1 block">Measured, not derived — {stayed.note}.</Meta>
            </div>
          ) : null}
          <div className="border-hairline rounded-md border px-3 py-2.5">
            <span className="eyebrow">Uncommitted</span>
            <div className="num text-cash mt-0.5 text-[17px] font-semibold">
              {fmt(uncommitted.rm, 'MYR')}
            </div>
            <Meta className="mt-1 block">{uncommitted.note}.</Meta>
          </div>
          {living ? (
            <div className="border-hairline rounded-md border px-3 py-2.5">
              <span className="eyebrow">What living took</span>
              <div className={`num mt-0.5 text-[17px] font-semibold ${toneOf(living)}`}>
                {fmtS(living.rm, 'MYR')}
              </div>
              <Meta className="mt-1 block">{living.note}.</Meta>
            </div>
          ) : null}
        </div>
      </div>

      <Meta className="block max-w-[74ch] leading-relaxed">
        Widths are shares of declared income, and only the promised column has them: the right-hand
        figures are measured over the window two wallet readings bracket, so they share no
        denominator with the left. Every figure here is the one the waterfall shows — the two views
        cannot disagree, because neither computes anything.
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

  // One call, both views. Neither holds a figure of its own — §2.4 again: the
  // canvas drew waterfall and flow with their own copies and they disagreed
  // about the same ringgit.
  const shape = useMemo(() => monthShape(state, y, m), [state, y, m])

  const mode = overviewMode(state)
  const monthName = monthLabel(y, m)
  const monthShort = monthName.slice(0, 3)

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

      {/* ONE PANEL, FULL WIDTH. It carries a run-rate half and a measured half and
          has to keep them apart on the page as well as in the arithmetic — eight
          rows with their own bars and denominators never fitted the 420px rail
          this screen used to put them in. The two cards that sat beside it are
          gone: "a usual month" restated the run rate the column now opens with,
          and the coverage bar answered a question Expenses asks on its own page. */}
      <div className="grid gap-4">
        <div className="grid content-start gap-3">
          <Card>
            <CardContent className="grid gap-2.5 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">Overview, drawn two ways</span>
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

              {/* THE RUN-RATE HALF SURVIVES A MISSING READING, which is why the
                  refusal moved inside the views. It used to replace the whole
                  column: no reading, no income, no commitments, nothing but a
                  sentence — and what a usual month owes was never the figure that
                  went missing. Each view now draws what it still knows and says
                  where the measured half went. The reason itself is still stated
                  once, on the strip, which is the surface that can fix it. */}
              {mode === OVERVIEW_MODE.FLOW ? (
                <Flow shape={shape} w={w} />
              ) : (
                <Waterfall shape={shape} monthShort={monthShort} monthName={monthName} />
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
