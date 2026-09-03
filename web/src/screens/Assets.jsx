/**
 * Assets — what you hold that is not in moomoo. Today ASB, Tabung Haji and EPF.
 *
 * Every figure here is derived from `assetEntries` on each render (see the assets
 * section of calc.js); no balance is stored, exactly as positions and the wallet
 * are derived from the transaction log.
 *
 * NOTHING ON THIS SCREEN TOUCHES THE BROKER. A contribution here is not a cash
 * movement and never reaches the wallet balance; an annual distribution is not a
 * DIV transaction and never reaches the income run rate, where one December
 * payout would triple a three-month average and then collapse it. The two worlds
 * meet in net worth and nowhere else, and net worth is not built yet.
 *
 * `contributed` can legitimately be negative once withdrawals exceed deposits, so
 * it is rendered as a plain figure rather than through toneClass() — a red number
 * there would read as a loss when it is nothing of the sort.
 */

import { useMemo } from 'react'
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { assetLedger, assetsTotal, distributionOutlook, toRM } from '@/lib/calc'
import { dfmt, dfmtLong, fmt, fmtBare, fmtS, pct1, toneClass } from '@/lib/format'
import { useVantage } from '@/lib/store'

const THIS_YEAR = new Date().getFullYear()

const TH =
  'sticky top-0 z-10 h-8 bg-card px-2.5 text-left align-middle text-[10.5px] font-semibold ' +
  'tracking-[0.09em] whitespace-nowrap text-muted-foreground uppercase ' +
  'shadow-[inset_0_-1px_0_var(--border)]'

const TD = 'px-2.5 py-1.5 align-middle whitespace-nowrap'

/**
 * How the provider computes what it pays. This is a real difference, not a label:
 * ASB and Tabung Haji pay on the mean of twelve monthly minimums, so a deposit
 * never lifts the month it lands in, while EPF's dividend accrues from the last
 * day of each contribution month — January money earns nearly a full year and
 * December money almost none.
 */
const BASIS_LABEL = {
  MIN_MONTHLY: 'average of monthly minimums',
  MADB: 'aggregate daily balance',
  NONE: 'no declared rate',
}

/** '5.75 sen' for ASB, '3.50%' for the rest. The provider's own unit, not ours. */
function rateText(a) {
  if (a.rate_basis === 'NONE') return null
  if (a.last_rate == null) return null
  const base = a.rate_quote === 'SEN_PER_UNIT' ? `${a.last_rate} sen` : `${a.last_rate}%`
  if (!a.last_bonus) return base
  // ASB's headline is two numbers: an income distribution from the fund plus a
  // bonus PNB pays at its own discretion. Adding them into one figure would hide
  // that the second half is not promised.
  const total = a.rate_quote === 'SEN_PER_UNIT'
    ? `${(a.last_rate + a.last_bonus).toFixed(2)} sen`
    : `${(a.last_rate + a.last_bonus).toFixed(2)}%`
  return `${total} (${a.last_rate} + ${a.last_bonus} bonus)`
}

/**
 * What this year's distribution is on track to be.
 *
 * Every figure is an estimate at a rate that has NOT been declared — this year's
 * comes in December (ASB) or March (Tabung Haji) — so the badge and the footnote
 * say so rather than leaving a confident number to be believed.
 *
 * The bar row is drawn only for MIN_MONTHLY, where each bar is that month's
 * lowest balance and the comparison between them is the thing worth seeing.
 * Under MADB the months hold contributions weighted by how long they earn, which
 * is a different quantity, and drawing both as "bars" would invite reading one
 * as the other.
 */
function Estimator({ asset, outlook }) {
  const o = outlook
  if (!o || o.rate == null) {
    return (
      <p className="text-faint mt-3 text-[11.5px] leading-relaxed">
        No rate recorded yet, so there is nothing to project. Set the last declared rate on this
        account and the estimate appears.
      </p>
    )
  }

  const minMonthly = o.basis === 'MIN_MONTHLY'
  const peak = Math.max(...o.months.map(m => m.amount), 0) || 1

  return (
    <div className="mt-4 border-t pt-3">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Distribution on track for {o.year}</span>
        <Badge variant="cash" className="px-1.5 py-0 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
          estimate
        </Badge>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="num text-cash text-[26px] leading-none font-semibold tracking-[-0.025em]">
            {fmt(o.projected, asset.currency)}
          </div>
          <p className="text-faint mt-1.5 text-[11.5px]">
            <span className="num">{fmt(o.base, asset.currency)}</span>{' '}
            {minMonthly ? 'average monthly minimum' : 'weighted balance'} ×{' '}
            <span className="num">{rateText(asset)}</span>
          </p>
        </div>

        {minMonthly ? (
          <div className="min-w-[220px] flex-1">
            <p className="eyebrow text-[9.5px]">Minimum balance held, each month</p>
            <div className="mt-1.5 flex h-[38px] items-end gap-[3px]">
              {o.months.map(m => (
                <div
                  key={m.key}
                  title={`${m.label}: ${fmtBare(m.amount)}`}
                  className="flex-1 rounded-[1px]"
                  style={{
                    height: `${Math.max((m.amount / peak) * 100, 2)}%`,
                    // A month still to come is drawn hatched, exactly as a
                    // projected dividend is on the Calendar — a guess must never
                    // be drawn like a fact.
                    background:
                      m.status === 'projected'
                        ? 'repeating-linear-gradient(115deg, var(--gain) 0 4px, transparent 4px 9px)'
                        : 'var(--gain)',
                    opacity: m.status === 'projected' ? 0.5 : 0.85,
                  }}
                />
              ))}
            </div>
            <div className="num text-faint mt-1 flex justify-between text-[9.5px] tracking-[0.06em] uppercase">
              <span>{o.months[0].label}</span>
              <span>{o.months[11].label}</span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground min-w-[220px] flex-1 text-[12px] leading-relaxed">
            Carried in <b className="num text-foreground font-semibold">{fmt(o.opening, asset.currency)}</b>,
            earning the whole year. Each contribution since then earns only from the end of its own
            month, so a January one counts for <span className="num">11/12</span> and a December one
            for nothing.
          </p>
        )}
      </div>

      {o.nudge && o.nudge.monthsAhead > 0 ? (
        <div className="border-cash mt-3 border-l-2 pl-3">
          <p className="text-[12.5px] leading-relaxed">
            A deposit never lifts the month it lands in — only the months after it.{' '}
            <b className="num font-semibold">{fmt(1000, asset.currency)}</b> paid in before this
            month is out earns{' '}
            <b className="num text-gain font-semibold">{fmt(o.nudge.perThousand, asset.currency)}</b>;
            next month it earns{' '}
            <b className="num font-semibold">{fmt(o.nudge.ifYouWait, asset.currency)}</b>.{' '}
            <span className="text-muted-foreground">
              Waiting costs <span className="num">{fmt(o.nudge.costOfWaiting, asset.currency)}</span>{' '}
              per <span className="num">{fmt(1000, asset.currency)}</span>.
            </span>
          </p>
        </div>
      ) : null}

      <p className="text-faint mt-2.5 text-[11.5px] leading-relaxed">
        Priced at the last rate you recorded; {o.year} has not been declared.{' '}
        <span className="num">{o.settledMonths}</span> of{' '}
        <span className="num">12</span> months are settled — the rest assume you neither add nor
        withdraw.
      </p>
    </div>
  )
}

function Stat({ label, value, valueClass = '', sub }) {
  return (
    <Card className="gap-0 py-3.5">
      <CardContent className="px-4">
        <p className="eyebrow">{label}</p>
        <div className={`stat mt-2 ${valueClass}`}>{value}</div>
        <p className="text-faint mt-1.5 text-[11.5px]">{sub}</p>
      </CardContent>
    </Card>
  )
}

/**
 * An account that exists but has nothing in it.
 *
 * Deliberately NOT the full card. A summary card for an empty account is a wall
 * of zeros — RM 0.00 balance, 0% of the cap, no return, an estimator with nothing
 * to project — and every one of those figures is true only in the sense that
 * nothing has been entered. It reads as data when it is really an empty form.
 *
 * So the card is earned by the first entry. Until then this row says what the
 * account is configured as, which is the part worth checking before you start
 * typing balances into it.
 */
/** An icon action on a card, with the words in the tooltip and on the button. */
function CardAction({ icon: Icon, label, onClick, tip }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip || label}</TooltipContent>
    </Tooltip>
  )
}

function SetupRow({ row, onAdd, onEdit, onRemove }) {
  const { asset: a } = row
  const rate = rateText(a)

  return (
    <div className="border-hairline flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2.5 last:border-b-0">
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold">{a.name}</span>
          {a.institution ? (
            <span className="text-faint text-[10.5px] tracking-[0.05em]">{a.institution}</span>
          ) : null}
        </div>
        <p className="text-faint mt-0.5 text-[11.5px]">
          {BASIS_LABEL[a.rate_basis] || a.rate_basis}
          {rate ? <> · <span className="num">{rate}</span></> : ' · no rate recorded'}
          {a.unit_cap ? <> · cap <span className="num">{fmt(a.unit_cap, row.cur)}</span></> : null}
        </p>
      </div>
      <span className="text-muted-foreground text-[12.5px]">Add the opening balance</span>
      <Button size="sm" variant="outline" onClick={() => onAdd(a.id)}>
        <PlusIcon />
        Entry
      </Button>
      <CardAction icon={PencilIcon} label={`Edit ${a.name}`} onClick={() => onEdit(a)} />
      <CardAction
        icon={TrashIcon}
        label={`Remove the ${a.name} account`}
        tip="Remove — only possible while it has no entries"
        onClick={() => onRemove(a.id)}
      />
    </div>
  )
}

function AccountCard({ row, onAdd, onEdit }) {
  const { asset: a } = row
  const rate = rateText(a)

  return (
    <Card className="gap-3">
      <CardContent className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold">{a.name}</span>
              {a.institution ? (
                <span className="text-faint text-[10.5px] tracking-[0.05em]">{a.institution}</span>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-0.5 text-[12px]">
              {BASIS_LABEL[a.rate_basis] || a.rate_basis}
              {rate ? <> · last declared <span className="num">{rate}</span></> : null}
            </p>
          </div>
          {/* One group, so justify-between has two children to separate rather
              than three to spread — otherwise Entry lands in the middle of the
              card, adrift from the pencil it belongs beside. */}
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => onAdd(a.id)}>
              <PlusIcon />
              Entry
            </Button>
            {/* The rate basis, financial year and cap all live behind this, and
                all three change what the estimator says — a wrong one was
                uncorrectable once the account was saved. */}
            <CardAction icon={PencilIcon} label={`Edit ${a.name}`} onClick={() => onEdit(a)} />
          </div>
        </div>

        <div className="stat mt-3">{fmt(row.balance, row.cur)}</div>
        {a.unit_label ? (
          <p className="text-faint mt-1 text-[11.5px]">
            <span className="num">{row.balance.toLocaleString('en-MY')}</span> {a.unit_label}
          </p>
        ) : null}

        {row.capPct != null ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground text-[12px]">
                Toward the <span className="num">{fmt(a.unit_cap, row.cur)}</span> cap
              </span>
              <span className="num text-muted-foreground text-[12px]">{pct1(row.capPct)}</span>
            </div>
            <Progress value={row.capPct} aria-label={`${pct1(row.capPct)} of the ${a.name} cap`} />
            <p className="text-faint mt-1.5 text-[11.5px]">
              <span className="num">{fmt(row.headroom, row.cur)}</span> of headroom left
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
          <span className="text-muted-foreground">
            Contributed <b className="num text-foreground font-semibold">{fmt(row.contributed, row.cur)}</b>
          </span>
          <span className="text-muted-foreground">
            Earned <b className="num text-gain font-semibold">{fmtS(row.earned, row.cur)}</b>
          </span>
          {/* "of it" pointed at the Contributed figure beside it, which reads as a
              tighter claim than the ledger supports: an opening balance is one
              DEPOSIT carrying years of earnings inside it, so what it is a
              percentage OF is not purely contributions. Same scope as the summary
              tile, and now the same words. */}
          {row.returnedPct != null ? (
            <span className="text-muted-foreground">
              Returned <b className="num text-foreground font-semibold">{pct1(row.returnedPct)}</b> since
              tracking began
            </span>
          ) : null}
        </div>

        {row.entries.length === 0 ? (
          <p className="text-faint mt-3 text-[11.5px]">
            No entries yet — add a deposit and the balance follows.
          </p>
        ) : (
          <>
            <p className="text-faint mt-3 text-[11.5px]">
              <span className="num">{row.entries.length}</span>{' '}
              {row.entries.length === 1 ? 'entry' : 'entries'} · last on{' '}
              <span className="num">{dfmtLong(row.lastEntry.date)}</span>
            </p>
            {/* Nothing to project for a cash pot: the estimator's whole job is
                to apply a declared rate over a financial year, and this kind of
                account has neither. */}
            {a.rate_basis === 'NONE' ? null : <Estimator asset={a} outlook={row.outlook} />}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function EntryRow({ row, onDelete }) {
  const year = Number(String(row.date).slice(0, 4))

  return (
    <TableRow>
      <TableCell className={TD}>
        <span className="num text-[12.5px]">
          {dfmt(row.date)}
          {year === THIS_YEAR ? null : (
            <span className="text-faint ml-1">{`’${String(year).slice(2)}`}</span>
          )}
        </span>
      </TableCell>

      <TableCell className={`${TD} w-full`}>
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-semibold">{row.name}</span>
          <Badge
            variant={row.type === 'DISTRIBUTION' ? 'cash' : 'neutral'}
            className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]"
          >
            {row.type}
          </Badge>
          {row.source === 'payroll' ? (
            <Badge variant="gain" className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]">
              AUTO
            </Badge>
          ) : null}
          {row.note ? <span className="text-faint text-[12px]">{row.note}</span> : null}
        </span>
      </TableCell>

      <TableCell className={`${TD} num text-right ${toneClass(row.signed)}`}>
        {fmtS(row.signed, row.asset ? row.asset.currency : 'MYR')}
      </TableCell>

      <TableCell className={`${TD} text-right`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove the ${row.name} entry on ${row.date}`}
              onClick={() => onDelete(row.asset_id, row.id)}
            >
              <TrashIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove this entry</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

export default function Assets() {
  const { state, openAsset, openAssetEntry, deleteAsset, deleteAssetEntry } = useVantage()

  // An account earns its card by having something in it. Until then it is setup,
  // and mixing the two would put a row of zeros beside real balances.
  const live = total => total.rows.filter(r => r.entries.length > 0)
  const pending = total => total.rows.filter(r => r.entries.length === 0)

  const total = useMemo(() => {
    const t = assetsTotal(state)
    // Computed here rather than inside assetRows() because it needs today's date,
    // and a pure function of state alone cannot have one.
    const rows = t.rows.map(r => ({ ...r, outlook: distributionOutlook(state, r.asset) }))

    // What every account is on track to declare, added up.
    //
    // Kept well away from `earned`, which counts distributions actually
    // recorded. Nothing has been declared yet — that is what makes these
    // estimates — so folding them together would turn a projection into
    // history, and the return figure into something no statement will ever
    // agree with.
    //
    // The years being summed are not the same year: ASB 2 is mid-2027 while EPF
    // is mid-2026, because their financial years end in different months. Each
    // is the year that account is currently earning, which is the only sense in
    // which "this year" means anything across a mixed set, and the label says so.
    const onTrackRM = rows.reduce(
      (sum, r) => sum + (r.outlook?.projected == null ? 0 : toRM(state, r.outlook.projected, r.cur)),
      0,
    )
    const rated = rows.filter(r => r.outlook?.projected != null).length

    return { ...t, rows, onTrackRM, rated }
  }, [state])
  const ledger = useMemo(() => assetLedger(state), [state])
  const oldest = ledger.length ? ledger[ledger.length - 1].date : null

  if (!total.rows.length) {
    return (
      <Card className="py-10">
        <CardContent className="text-center">
          <h2 className="num text-[16px] font-semibold">No accounts yet</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed">
            This is for what you hold outside moomoo — ASB, Tabung Haji, EPF. They sit in their own
            tables and never touch your broker positions, wallet or income figures.
          </p>
          <Button size="sm" className="mt-4" onClick={openAsset}>
            <PlusIcon />
            Add account
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3">
      {live(total).length ? (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Stat label="Outside moomoo" value={fmt(total.valueRM, 'MYR')} sub="combined balance" />
        <Stat
          label="Contributed"
          value={fmt(total.contributedRM, 'MYR')}
          sub="yours and your employer’s, net of withdrawals"
        />
        <Stat
          label="Earned"
          value={fmtS(total.earnedRM, 'MYR')}
          valueClass={total.earnedRM ? 'text-gain' : ''}
          sub="distributions, hibah and dividends"
        />
        {/* NOT "return on contributed", which is what this said and could not
            deliver. An opening balance is entered as one DEPOSIT, so the
            58k that started EPF Akaun Persaraan carries years of dividends
            inside it — earnings sitting in the denominator, counted as though
            they were money paid in. The ratio would understate the real return
            for as long as those entries exist, and no restatement fixes it
            without splitting every opening balance by hand.
            So the label claims only what the ledger can support: what has come
            back since these accounts were first entered here. */}
        <Stat
          label="Return since tracking began"
          value={total.returnPct == null ? '—' : pct1(total.returnPct)}
          valueClass={total.returnPct ? 'text-gain' : ''}
          sub={
            total.declared
              ? 'cumulative — not annualised'
              : 'nothing declared yet, so nothing realised'
          }
        />
        {/* Only once something can actually be projected. A fifth tile reading
            zero would say the accounts are heading nowhere, when the truth is
            that none of them has a rate recorded. */}
        {total.rated ? (
          <Stat
            label="On track this year"
            value={fmtS(total.onTrackRM, 'MYR')}
            valueClass="text-cash"
            sub={`estimate · ${total.rated} account${total.rated === 1 ? '' : 's'}, each in its own financial year`}
          />
        ) : null}
      </div>
      ) : null}

      {live(total).length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {live(total).map(row => (
            <AccountCard
              key={row.id}
              row={row}
              onAdd={id => openAssetEntry({ asset_id: id })}
              onEdit={openAsset}
            />
          ))}
        </div>
      ) : null}

      {pending(total).length ? (
        <Card className="gap-2 py-3.5">
          <CardContent className="px-4">
            <span className="eyebrow">Set up, nothing entered</span>
            <div className="mt-1">
              {pending(total).map(row => (
                <SetupRow
                  key={row.id}
                  row={row}
                  onAdd={id => openAssetEntry({ asset_id: id })}
                  onEdit={openAsset}
                  onRemove={deleteAsset}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="num text-[15px] font-semibold">Entries</h2>
        {ledger.length ? (
          <span className="text-faint text-[11.5px]">
            <span className="num">{ledger.length}</span> since{' '}
            <span className="num">{dfmtLong(oldest)}</span>
          </span>
        ) : null}
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={openAsset}>
          <PlusIcon />
          Account
        </Button>
        <Button size="sm" onClick={() => openAssetEntry()}>
          <PlusIcon />
          Add entry
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {ledger.length ? (
          <div className="max-h-[calc(100svh-24rem)] overflow-auto overscroll-contain">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Date
                  </th>
                  <th scope="col" className={`${TH} w-full`}>
                    Account
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Amount
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <TableBody>
                {ledger.map(row => (
                  <EntryRow key={row.id} row={row} onDelete={deleteAssetEntry} />
                ))}
              </TableBody>
            </table>
          </div>
        ) : (
          <div className="text-muted-foreground px-4 py-12 text-center text-[13.5px]">
            Record a deposit to start tracking these balances.
          </div>
        )}
      </Card>

      <p className="text-faint text-[11.5px] leading-relaxed">
        Every balance above is derived from these entries — nothing is stored as a running total,
        the same way positions come from the transaction log. Contributions here are{' '}
        <b className="font-semibold">not</b> moomoo cash movements and never reach the wallet
        balance or the income run rate.
      </p>
    </div>
  )
}
