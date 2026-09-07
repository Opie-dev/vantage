/**
 * Income — two sources, and they are never averaged together.
 *
 * A SALARY IS A FLOOR; FREELANCE IS A GUESS. A monthly source contributes its
 * most recent net, which is a firm figure. An irregular one contributes the mean
 * of the last three months, which is an estimate and is drawn faded wherever it
 * appears. Averaging the two into one number would hide both facts at once — the
 * part you can safely commit against, and the part that must never quietly
 * become a baseline after one good quarter.
 *
 * NET IS DERIVED, NEVER STORED. It is gross less the DEDUCTED half of the
 * statutory block. Employer EPF, SOCSO and EIS are paid on top and never pass
 * through your pay, so subtracting them would understate take-home and adding
 * them would invent money you never saw. The two column groups are kept apart in
 * the schema for exactly that reason and are shown apart here.
 *
 * NOTHING HERE IS A BROKER FIGURE. A salary is not a cash movement and never
 * reaches the wallet balance; it is not a dividend and never reaches the income
 * run rate on Portfolio. A month with a bonus in it would otherwise read as a
 * spectacular month for the ETFs.
 */
import { useMemo, useState } from 'react'
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { deductionsOf, netOf, waterfall } from '@/lib/calc'
import { dfmt, dfmtLong, fmt } from '@/lib/format'
import { useVantage } from '@/lib/store'

import { Line, Meta, MonthStepper, RowAction } from './money/parts'

function SourceRow({ r, onRecord, onEdit, onRemove, onRemoveEvent }) {
  const s = r.source
  const d = r.last ? deductionsOf(r.last) : null
  // Collapsed by default. A monthly salary accumulates twelve of these a year
  // and the row exists to show what the source pays, not to list its history —
  // but a payment you cannot see is one you cannot correct, which is how a
  // mistyped freelance invoice became permanent.
  const [open, setOpen] = useState(false)
  const events = r.events || []
  // A source paid in something else keeps two figures, and the row has to carry
  // both: the page totals in ringgit, the invoice was written in dollars, and
  // showing one without the other makes the row either untotalable or
  // impossible to check against the payment it came from.
  const foreign = r.cur !== 'MYR'

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
            {/* Who pays it, first. The form has captured this since the source
                table existed and no screen has ever said it, which left two
                clients with similar names indistinguishable on the one page
                that lists them. */}
            {s.payer ? `${s.payer} · ` : ''}
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
          {/* Ringgit leads, because the three tiles above and every commitment
              this is weighed against are ringgit. The '≈' covers both ways the
              figure can be soft — an averaged source, and a conversion at
              today's rate rather than at the one the payment landed on. */}
          <div className="num text-[13.5px] font-semibold">
            {r.isEstimate || !r.fxDated ? '≈ ' : ''}
            {fmt(r.monthlyRM, 'MYR')}
          </div>
          <Meta className="block">{r.variable ? 'estimate' : 'net'}</Meta>
          {/* Only when there is something to twin. A source with no payment in
              the window averages to zero, and "$0.00 at some rate" is a sentence
              about a payment that does not exist — the meta line already says
              nothing was recorded. */}
          {foreign && r.monthly ? (
            <Meta className="block">
              <span className="num">{fmt(r.monthly, r.cur)}</span>
              {/* An average has no single day behind it: the ringgit figure is
                  the mean of several payments, each converted on its own day, so
                  naming one day would be a claim that divides out to no rate at
                  all. The last payment's day is not the mean's day. */}
              {r.variable
                ? r.fxDated
                  ? ' · each payment at the rate on its own day'
                  : ' · at today’s rate where a payment carried none, so it moves'
                : r.fxDated
                  ? ' · at the rate on the day it landed'
                  : ' · at today’s rate, so it moves'}
            </Meta>
          ) : null}
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
        <div className="mt-2.5 ml-[21px] max-w-[520px]">
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
          {/* THE SUM IS THE LOAD-BEARING FIGURE, not the six lines above it. It
              is the whole of what turned gross into net, and leaving it off made
              the reader add six numbers to find the one that decides how much
              money there was. Signed, because it is a subtraction from gross —
              the group below it is not. */}
          <div className="mt-1.5">
            <Line
              label="Total deducted"
              value={`−${fmt(d.deducted, r.cur)}`}
              tone="text-loss"
              strong
              rule
            />
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
              {/* Unsigned and untoned. This total is what the employer paid, not
                  what you lost, and drawing it in --loss beside the one above
                  would say the two groups do the same thing to your money. */}
              <div className="mt-1.5">
                <Line label="Total on top" value={fmt(d.onTop, r.cur)} strong rule />
              </div>
              <p className="text-faint mt-2 text-[11.5px] leading-relaxed">
                That second group never passes through your pay, so it is not subtracted from net —
                but <span className="num">{fmt(d.epfTotal, r.cur)}</span> of EPF lands in your
                account either way. Vantage does not put it there: EPF splits a contribution across
                three accounts, so it is recorded on Assets from the statement that shows the split.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default function Income() {
  const { state, openIncome, openIncomeEvent, deleteIncomeSource, deleteIncomeEvent } = useVantage()
  const w = useMemo(() => waterfall(state), [state])
  const estimated = w.rows.filter(r => r.isEstimate).length

  if (!w.rows.length) {
    return (
      <div className="grid gap-4">
        <MonthStepper />
        <Card>
          <CardContent className="grid gap-3 px-4 py-6">
            <span className="eyebrow">No income sources</span>
            <p className="text-muted-foreground m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty">
              Where money arrives from. A monthly source names the day it lands; an irregular one
              cannot, so it is projected from its last three months instead — storing a pay day
              for it would invent a certainty it does not have.
            </p>
            <div>
              <Button size="sm" onClick={() => openIncome()}>
                <PlusIcon />
                Add an income source
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <MonthStepper note="Income is a run rate, not a month — it says a month, never this month." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Net, a month</span>
            <div className="stat num text-gain">{fmt(w.incomeRM, 'MYR')}</div>
            <Meta>after the deducted half of the statutory block</Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Of that, firm</span>
            <div className="stat num">{fmt(w.firmRM, 'MYR')}</div>
            <Meta>the part a commitment can safely be planned against</Meta>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <span className="eyebrow">Of that, estimated</span>
            <div className="stat num text-faint">{fmt(w.variableRM, 'MYR')}</div>
            <Meta>
              {estimated} source{estimated === 1 ? '' : 's'} · a three-month mean, and none of it
              promised
            </Meta>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="eyebrow">Sources</span>
          <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
            {w.rows.length}
          </Badge>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add an income source"
            title="Add an income source"
            onClick={() => openIncome()}
          >
            <PlusIcon />
          </Button>
        </div>
        <div className="border-hairline border-t">
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
        </div>
      </Card>

      <p className="text-faint m-0 max-w-[78ch] text-[11.5px] leading-relaxed text-pretty">
        A salary is a floor; an irregular source is the mean of the last three months and is drawn
        faded wherever it appears. A payslip records both halves of EPF — yours and your employer's
        — and only yours comes out of net; neither is booked into an account here, because EPF
        splits every contribution across three and this page knows about none of them. Record the
        contribution on Assets, from the statement.
      </p>
    </div>
  )
}
