/**
 * History — every transaction and cash movement in one newest-first ledger.
 *
 * Port of legacy `renderHist()` + `srcTag()`: the same five filters over the
 * same seven columns (Date, Type, Instrument, Qty, Price, Amount, Source), the
 * same "Wallet · CURRENCY" line for a cash row and the same dashes where a row
 * has no quantity or price.
 *
 * The owner's ledger runs to a few hundred rows across nine months, so the
 * table scrolls inside the card under a sticky header rather than growing the
 * page, each filter carries its row count, and the date column marks the rows
 * that fall outside the current year.
 *
 * Every figure is shown in the currency it was settled in — nothing on this
 * screen sums MYR and USD together, so nothing here needs toRM().
 */

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import {
  HISTORY_DOMAIN,
  HISTORY_DOMAIN_LABEL,
  HISTORY_FILTERS,
  HISTORY_FILTER_LABELS,
  filterHistory,
  historyRows,
  pendingHistoryRows,
  slotColor,
  slotOf,
} from '@/lib/calc'
import { dfmt, dfmtLong, fmt, fmtS, fq, monthLabel, toneClass } from '@/lib/format'
import { useVantage } from '@/lib/store'

// Radix Select has no concept of "no selection", so the neutral options carry
// sentinel values rather than '' (which it treats as a placeholder).
const ALL = '__all__'
const CASH_ONLY = '__cash__'

const THIS_YEAR = new Date().getFullYear()

/** BUY green, SELL red, dividends amber, wallet rows quiet — as legacy chips. */
const KIND_VARIANT = {
  BUY: 'gain', SELL: 'loss', DIV: 'cash', DIVIDEND: 'cash',
  DISTRIBUTION: 'cash', PAY: 'gain', PAYMENT: 'loss',
}

/**
 * Which world a row belongs to, drawn as a dot beside its name.
 *
 * A moomoo row keeps the per-instrument slot colour it has everywhere else in
 * the app, so ETCO is the same hue here as on the allocation donut. The other
 * three get one colour each — there is nothing per-item to encode.
 */
const DOMAIN_COLOR = {
  SAVINGS: 'var(--chart-3)',
  INCOME: 'var(--gain)',
  OWED: 'var(--loss)',
}

/**
 * What the table says when the TYPE filter alone matches nothing. These read as
 * statements about the whole history, so they are only safe while no instrument
 * or month filter is narrowing the feed — see the empty state below.
 */
const EMPTY_COPY = {
  ALL: 'Nothing here yet — run the OpenD sync, or add a transaction under Positions.',
  MOOMOO: 'Nothing from the broker yet — run the OpenD sync, or add a transaction under Positions.',
  SAVINGS: 'No entries against ASB, Tabung Haji or EPF yet — add one under Assets.',
  INCOME: 'No payments recorded yet — add a source and a payslip under Money.',
  OWED: 'No loan payments recorded. Routine instalments are derived, never typed — this only fills up when something deviates from the schedule.',
  BUY: 'No buys recorded yet.',
  SELL: 'No sells yet — nothing has left the portfolio.',
  DIV: 'No dividends yet.',
  CASH: 'No deposits or withdrawals yet — record one under Wallet.',
}

const TH =
  'sticky top-0 z-10 h-8 bg-card px-2.5 text-left align-middle text-[10.5px] font-semibold ' +
  'tracking-[0.09em] whitespace-nowrap text-muted-foreground uppercase ' +
  'shadow-[inset_0_-1px_0_var(--border)]'

const TD = 'px-2.5 py-1.5 align-middle whitespace-nowrap'

const Dash = () => <span className="text-faint">—</span>

function DateCell({ date }) {
  const year = Number(String(date).slice(0, 4))
  return (
    <span className="num text-[12.5px]">
      {dfmt(date)}
      {year === THIS_YEAR ? null : (
        <span className="text-faint ml-1">{`’${String(year).slice(2)}`}</span>
      )}
    </span>
  )
}

/**
 * WHICH WORLD a row is from. Distinct from SourceTag below, which says HOW it
 * arrived — a hand-typed ETCO trade is moomoo by domain and manual by source, so
 * one badge could not carry both without lying about one of them.
 */
function DomainTag({ domain }) {
  if (!domain) return null
  return (
    <Badge
      // Neutral for every domain, moomoo included. It is on most rows in a typical
      // feed, and a loud badge repeated 26 times is noise rather than emphasis —
      // the coloured dot beside the name already carries the distinction.
      variant="neutral"
      className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em] uppercase"
    >
      {HISTORY_DOMAIN_LABEL[domain] || domain}
    </Badge>
  )
}

function SourceTag({ source }) {
  if (source === 'pending') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="cash" className="cursor-default px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]">
            PENDING
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          The fund has declared this and it is already in your moomoo cash balance, but moomoo only
          publishes the ledger entry at clearing — so no sync can import it yet. The figure is its
          own declared rate per share times what you hold, less the withholding this account is
          charged. It is not counted as income, and it replaces itself when the real row arrives.
        </TooltipContent>
      </Tooltip>
    )
  }
  // 'api' is only ever written by the moomoo ingest, and nothing writes 'csv' at
  // all. Neither word means anything to a reader; what they want to know is
  // whether they typed the row or something else did.
  const AUTO = { api: 'SYNCED', csv: 'IMPORTED', payroll: 'AUTO' }
  const label = AUTO[source]
  if (!label) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="gain"
          className="cursor-default px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]"
        >
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px]">
        {source === 'payroll'
          ? 'Written by a payslip you recorded under Money, not typed here — the EPF contribution books itself.'
          : 'Written by the moomoo sync rather than entered by hand.'}
      </TooltipContent>
    </Tooltip>
  )
}

// A row is a cash movement because of what it IS, not because it lacks a ticker —
// withholding tax is both a cash movement and attributable to a holding.
const CASH_KINDS = new Set(['DEPOSIT', 'WITHDRAW', 'FEE'])

function HistoryRow({ row, state }) {
  const isCash = CASH_KINDS.has(row.kind)
  const signed = row.direction * row.amount

  return (
    <TableRow className={row.pending ? 'opacity-70' : undefined}>
      <TableCell className={TD}>
        <DateCell date={row.date} />
      </TableCell>

      <TableCell className={TD}>
        <Badge
          variant={KIND_VARIANT[row.kind] || 'neutral'}
          className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]"
        >
          {row.kind}
        </Badge>
      </TableCell>

      <TableCell className={TD}>
        {row.domain !== HISTORY_DOMAIN.MOOMOO ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-[7px] shrink-0 rounded-full"
              style={{ background: DOMAIN_COLOR[row.domain] }}
            />
            <span className="font-semibold">{row.name}</span>
          </span>
        ) : isCash && !row.ticker ? (
          <span className="text-muted-foreground">
            Wallet <span className="text-faint">· {row.currency}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-[7px] shrink-0 rounded-full"
              style={{ background: slotColor(slotOf(state, row.ticker)) }}
            />
            <span className="font-semibold">{row.ticker}</span>
            {row.kind === 'FEE' ? (
              <span className="text-faint hidden text-[11.5px] sm:inline">· withholding tax</span>
            ) : null}
          </span>
        )}
      </TableCell>

      <TableCell className={`${TD} num text-right`}>{row.qty ? fq(row.qty) : <Dash />}</TableCell>

      <TableCell className={`${TD} num text-right`}>
        {row.price ? fmt(row.price, row.currency) : <Dash />}
      </TableCell>

      <TableCell className={`${TD} num text-right ${toneClass(signed)}`}>
        {fmtS(signed, row.currency)}
      </TableCell>

      <TableCell className={`${TD} text-right`}>
        <span className="inline-flex items-center justify-end gap-1.5">
          <DomainTag domain={row.domain} />
          <SourceTag source={row.source} />
        </span>
      </TableCell>
    </TableRow>
  )
}

export default function History() {
  const { state } = useVantage()
  const [filter, setFilter] = useState('ALL')
  const [ticker, setTicker] = useState(ALL)
  const [month, setMonth] = useState(ALL)

  // Declared-but-unbooked payments sit at the top, marked. Without them History
  // reads as stale on the exact day the owner most wants to look at it — see
  // pendingHistoryRows() for why the broker's own API cannot supply them.
  const rows = useMemo(
    () => [...pendingHistoryRows(state), ...historyRows(state)].sort((a, b) => b.date.localeCompare(a.date)),
    [state],
  )

  // Only offer instruments that actually appear in the feed — a filter that can
  // only ever return nothing is worse than no filter.
  const tickers = useMemo(
    () => [...new Set(rows.map(r => r.ticker).filter(Boolean))].sort(),
    [rows],
  )
  const months = useMemo(
    () => [...new Set(rows.map(r => r.date.slice(0, 7)))].sort().reverse(),
    [rows],
  )

  // Instrument and period narrow the feed first; the type chips then filter what
  // is left, so their counts describe the current view rather than the whole
  // history. A chip reading 12 must mean 12 rows are one click away.
  const scoped = useMemo(
    () =>
      rows.filter(
        r =>
          (ticker === ALL ||
            // CASH_ONLY means the BROKER's wallet rows. Testing !r.ticker alone
            // used to be equivalent; now every ASB, salary and loan row also has
            // no ticker, and this filter would quietly become "everything else".
            (ticker === CASH_ONLY
              ? !r.ticker && r.domain === HISTORY_DOMAIN.MOOMOO
              : r.ticker === ticker)) &&
          (month === ALL || r.date.startsWith(month)),
      ),
    [rows, ticker, month],
  )

  const counts = useMemo(
    () => Object.fromEntries(HISTORY_FILTERS.map(f => [f, filterHistory(scoped, f).length])),
    [scoped],
  )
  const shown = useMemo(() => filterHistory(scoped, filter), [scoped, filter])
  const hasFees = useMemo(() => rows.some(r => r.kind === 'FEE'), [rows])
  const narrowed = filter !== 'ALL' || ticker !== ALL || month !== ALL

  const newest = shown.length ? shown[0].date : null
  const oldest = shown.length ? shown[shown.length - 1].date : null

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={ticker} onValueChange={setTicker}>
          <SelectTrigger size="sm" className="h-7 w-[168px] text-[12px]" aria-label="Filter by instrument">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All instruments</SelectItem>
            {tickers.map(t => (
              <SelectItem key={t} value={t}>
                {t}
                <span className="text-faint num ml-2 text-[11px]">
                  {rows.filter(r => r.ticker === t).length}
                </span>
              </SelectItem>
            ))}
            {/* Cash rows have no instrument, so they need their own way in. */}
            <SelectItem value={CASH_ONLY}>moomoo wallet only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger size="sm" className="h-7 w-[150px] text-[12px]" aria-label="Filter by month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All time</SelectItem>
            {months.map(m => {
              const [y, mm] = m.split('-').map(Number)
              return (
                <SelectItem key={m} value={m}>
                  {monthLabel(y, mm - 1)}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <span className="bg-border mx-0.5 h-5 w-px" aria-hidden="true" />

        {HISTORY_FILTERS.map(f => {
          const on = f === filter
          return (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={on ? 'default' : 'outline'}
              aria-pressed={on}
              onClick={() => setFilter(f)}
              className="h-7 gap-1.5 rounded-full px-3 text-[12px] font-semibold"
            >
              {HISTORY_FILTER_LABELS[f]}
              <span className={`num text-[11px] ${on ? 'opacity-70' : 'text-faint'}`}>
                {counts[f]}
              </span>
            </Button>
          )
        })}
        {narrowed ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilter('ALL')
              setTicker(ALL)
              setMonth(ALL)
            }}
            className="h-7 rounded-full px-2.5 text-[12px]"
          >
            Clear
          </Button>
        ) : null}
        <div className="flex-1" />
        {shown.length ? (
          <span className="text-faint text-[11.5px]">
            <span className="num">{shown.length}</span> row{shown.length === 1 ? '' : 's'} ·{' '}
            <span className="num">{dfmtLong(oldest)}</span>
            {oldest === newest ? null : (
              <>
                {' – '}
                <span className="num">{dfmtLong(newest)}</span>
              </>
            )}
          </span>
        ) : null}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {shown.length ? (
          <div className="max-h-[calc(100svh-16rem)] overflow-auto overscroll-contain">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Date
                  </th>
                  <th scope="col" className={TH}>
                    Type
                  </th>
                  <th scope="col" className={`${TH} w-full`}>
                    What
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Qty
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Price
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Amount
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Source
                  </th>
                </tr>
              </thead>
              <TableBody>
                {shown.map(row => (
                  <HistoryRow key={row.key} row={row} state={state} />
                ))}
              </TableBody>
            </table>
          </div>
        ) : (
          <div className="text-muted-foreground px-4 py-12 text-center text-[13.5px]">
            {ticker === ALL && month === ALL ? (
              EMPTY_COPY[filter]
            ) : (
              <>
                {/* Don't claim "no dividends yet" when the reader has simply
                    narrowed to a month that has none — say what was searched. */}
                Nothing matches {filter === 'ALL' ? 'this' : HISTORY_FILTER_LABELS[filter].toLowerCase()}
                {ticker === CASH_ONLY ? ' for wallet rows' : ticker === ALL ? '' : ` for ${ticker}`}
                {month === ALL ? '' : ` in ${monthLabel(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)}`}.
                <div className="pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFilter('ALL')
                      setTicker(ALL)
                      setMonth(ALL)
                    }}
                    className="h-7 rounded-full px-3 text-[12px]"
                  >
                    Clear filters
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {shown.length ? (
        <p className="text-faint text-[11.5px] leading-relaxed">
          Buy amounts include fees, sell amounts are net of them. A dividend appears once, as a DIV
          row against the holding that paid it. The <b className="font-semibold">moomoo</b> tag marks
          rows that belong to the broker account; savings, income and loan rows come from their own
          tables and never touch the wallet balance. A pay row shows what actually reached you, net
          of the statutory deductions.
          {hasFees ? ' FEE rows are the withholding tax moomoo deducts from US dividends.' : ''}
        </p>
      ) : null}
    </div>
  )
}
