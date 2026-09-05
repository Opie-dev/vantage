/**
 * Portfolio — what you hold, and everything the broker did about it.
 *
 * One screen where there were three. Positions listed the holdings, Instruments
 * described the funds behind them and Wallet held the cash they were bought
 * with — three rail entries, three page loads and three partial answers to a
 * single question: how is the moomoo account doing. Nothing in the old split
 * was wrong; the split itself was, because every real reading of it started by
 * visiting all three.
 *
 * WHAT SITS WHERE NOW.
 *
 *   ┌─ four figures, always ────────────────────────────────────────────────┐
 *   │ Portfolio value │ Unrealised P&L │ Net income · month │ Wallet        │
 *   ├─ Holdings ──────────────────────┬─ Ledger ────────────────────────────┤
 *   │ every position, one row each    │ every row that touched the account  │
 *   │ → a holding opens its income    │   filtered, paged, columns to taste │
 *   │   panel on the right            │                                     │
 *   └─────────────────────────────────┴─────────────────────────────────────┘
 *
 * The four figures stay put across both tabs. They are the answer most visits
 * are actually after, and putting them behind a tab would mean the commonest
 * question needed a click.
 *
 * THE HOLDING NAME IS THE CONTROL. There is no View button: the row's own name
 * opens the panel, with a hover wash to say so. A button in a column of its own
 * costs a column, and points at the thing it sits beside.
 *
 * WHAT THE FUND CARD LOST. Instruments carried fund size, NAV, price-vs-NAV and
 * your share of the vehicle. The panel that replaced it answers one question —
 * what has this paid me, and is the rate holding up — and those four figures
 * were not part of it. They are in fund_metrics still, and nothing here stops
 * them coming back if they are missed.
 *
 * NOT RADIX TABS, deliberately. The shell is a vertical Tabs whose panes the
 * smoke suite counts by `[data-slot=tabs-content][data-state=active]`, and a
 * nested Tabs would put a second active pane inside the first. Two buttons with
 * aria-current cost nothing here: there is no roving tabindex worth having for
 * a pair, and the tab order stays the reading order.
 *
 * Money stays in each instrument's own currency on both tabs — nothing in this
 * table sums MYR and USD. Only the four figures at the top convert, because a
 * total that skipped the US holdings would not be a total.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns3Icon, PlusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { useVantage } from '@/lib/store'
import {
  HISTORY_FILTER_LABELS,
  PNL_BASIS_LABEL,
  brokerDrift,
  declarationTrend,
  dividendSchedule,
  feesByTicker,
  filterHistory,
  firstBoughtOn,
  fundMetricsFor,
  incomeOutlook,
  instr,
  pnlBasis,
  portfolio,
  portfolioLedger,
  positionsWithIncome,
  slotColor,
  slotOf,
} from '@/lib/calc'
import {
  dfmt,
  dfmtLong,
  fmt,
  fmtS,
  fq,
  isPrivate,
  monthLabel,
  pct0,
  pct1,
  pctS,
  symbol,
  toneClass,
} from '@/lib/format'

/* ── shared bits ──────────────────────────────────────────────────────────── */

// Radix Select has no concept of "no selection", so the neutral options carry
// sentinel values rather than '' (which it treats as a placeholder).
const ALL = '__all__'
const CASH_ONLY = '__cash__'

const THIS_YEAR = new Date().getFullYear()

const TH =
  'sticky top-0 z-10 h-8 bg-card px-2.5 text-left align-middle text-[10.5px] font-semibold ' +
  'tracking-[0.09em] whitespace-nowrap text-muted-foreground uppercase ' +
  'shadow-[inset_0_-1px_0_var(--border)]'

const TD = 'px-2.5 py-1.5 align-middle whitespace-nowrap'

const Dash = () => <span className="text-faint">—</span>

/** BUY green, SELL red, dividends amber, wallet rows quiet — as everywhere else. */
const KIND_VARIANT = { BUY: 'gain', SELL: 'loss', DIV: 'cash', DIVIDEND: 'cash' }

/** The bleed used to run the header strips edge to edge, undoing `main`'s padding. */
const BLEED = '-mx-[clamp(14px,2.4vw,28px)]'
const GUTTER = 'px-[clamp(14px,2.4vw,28px)]'

/**
 * A per-share rate, to 4dp.
 *
 * fmt() is 2dp, which rounds a weekly payer's RM 0.0116 to RM 0.01 and makes
 * four different rates look like one figure. Private mode is honoured by hand
 * here for the same reason every other helper honours it — this is the one
 * place a figure is built outside format.js.
 */
const rate = (v, cur) => symbol(cur) + (isPrivate() ? '••••' : Number(v || 0).toFixed(4))

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

/* ── the four figures ─────────────────────────────────────────────────────── */

function Fold({ label, value, tone = '', children }) {
  return (
    <div className={`border-hairline min-w-[210px] flex-1 border-r py-3.5 last:border-r-0 ${GUTTER}`}>
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1.5 text-[25px] leading-none font-semibold tracking-[-0.02em] ${tone}`}>
        {value}
      </div>
      <p className="text-faint mt-1 text-[11.5px]">{children}</p>
    </div>
  )
}

/**
 * The header: what the account is worth, what it has gained, what it earned this
 * month, and what is left to spend.
 *
 * These four are the only figures on the screen that combine MYR and USD, at
 * today's rate. Everything below stays in the currency it was settled in.
 */
function Figures({ state, fold, basis }) {
  // The month comes from the clock rather than from state, so it is not a
  // dependency: this recomputes when the data changes, which is often enough for
  // a figure whose month lasts four weeks.
  const now = new Date()
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const outlook = useMemo(
    () => incomeOutlook(state, year, monthIndex),
    [state, year, monthIndex],
  )

  return (
    <div className="flex flex-wrap border-b">
      <Fold label="Portfolio value" value={fmt(fold.totalRM, 'MYR')}>
        holdings <span className="num">{fmt(fold.invRM, 'MYR')}</span> · wallet{' '}
        <span className="num">{fmt(fold.cashRM, 'MYR')}</span>
      </Fold>

      <Fold
        label="Unrealised P&L"
        value={fmtS(fold.pnlRM, 'MYR')}
        tone={toneClass(fold.pnlRM)}
      >
        <span className="num">{pctS(fold.pnlPct)}</span> on a{' '}
        <span className="num">{fmt(fold.costRM, 'MYR')}</span> basis ·{' '}
        {basis === 'price' ? 'price only, dividends not counted' : PNL_BASIS_LABEL[basis].toLowerCase()}
      </Fold>

      <Fold
        label={`Net income · ${monthLabel(year, monthIndex)}`}
        value={fmt(outlook.received, 'MYR')}
        tone="text-gain"
      >
        {outlook.declaredDue > 0 ? (
          <>
            ≈ <span className="num">{fmt(outlook.declaredDue, 'MYR')}</span> declared, not yet
            booked
          </>
        ) : (
          'everything declared for this month has been booked'
        )}
      </Fold>

      <Fold label="Wallet" value={fmt(fold.cashMYR, 'MYR')} tone="text-cash">
        <span className="num">{fmt(fold.cashUSD, 'USD')}</span> USD · together ≈{' '}
        <span className="num">{fmt(fold.cashRM, 'MYR')}</span> at 1 USD ={' '}
        <span className="num">RM {(Number(state.fx) || 0).toFixed(2)}</span>
      </Fold>
    </div>
  )
}

/* ── holdings ─────────────────────────────────────────────────────────────── */

/**
 * Dividends that have arrived since this holding was last looked at.
 *
 * The watermark is per device and per ticker, written when the panel is opened.
 * It is seeded on first sight rather than starting empty: a browser that has
 * never seen this app would otherwise flag every holding that has ever paid,
 * which is a chip that means "you have dividends" — true of the whole portfolio
 * and worth nothing.
 *
 * localStorage, like private mode and for the same reason: it answers "have I
 * read this yet", which belongs to the screen in front of you rather than to the
 * account.
 */
const SEEN_KEY = 'vantage.seenDividends'

function useSeenDividends(latestByTicker) {
  const [seen, setSeen] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    } catch {
      // Private windows, storage-blocking browsers, and anything that has left
      // junk under the key. A missing watermark costs a chip, never a figure.
      return {}
    }
  })

  const save = next => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
    } catch {
      // Nothing to do — the watermark still holds for this session.
    }
    return next
  }

  /**
   * Seeding happens ONCE, ever, and records that it happened.
   *
   * The first visit from a given browser marks everything already paid as seen,
   * so the chip starts quiet instead of flagging nine months of history. After
   * that flag is set nothing is auto-seeded again — a ticker with no watermark
   * is a holding whose first dividend has just landed, which is exactly what
   * this is for. Seeding on every mount instead would have swallowed anything
   * that arrived while the screen was closed, which is most of what there is to
   * notice.
   */
  useEffect(() => {
    if (seen.$seeded) return
    setSeen(prev => save({ ...latestByTicker, ...prev, $seeded: true }))
  }, [latestByTicker, seen.$seeded])

  const markSeen = useCallback(ticker => {
    const date = latestByTicker[ticker]
    if (!date) return
    setSeen(prev => (prev[ticker] === date ? prev : save({ ...prev, [ticker]: date })))
  }, [latestByTicker])

  return { seen, markSeen }
}

function HoldingRow({ p, fees, color, isNew, newHint, onOpen }) {
  const { dividends, withheld: tax } = p
  const priced = p.px > 0
  const tone = toneClass(p.pnlShown)
  // Against cost, not market value: how much of what went in has come back as
  // income. Cumulative since the first purchase — NOT annualised, which is why
  // it reads "returned" rather than "yield".
  const returnedPct = p.cost > 0 ? (dividends / p.cost) * 100 : 0
  const netIncome = dividends - tax
  const netPct = p.cost > 0 ? (netIncome / p.cost) * 100 : 0
  const taxPct = dividends > 0 ? (tax / dividends) * 100 : 0
  const feePct = p.cost > 0 ? (fees / p.cost) * 100 : 0

  return (
    <TableRow>
      {/* The name is the control. Padding lives on the button rather than the
          cell so the whole row-height of it is clickable, and the wash covers
          the cell rather than a rectangle floating inside it. */}
      <TableCell className="p-0">
        <button
          type="button"
          onClick={onOpen}
          title={`What ${p.t} has paid you`}
          className="hover:bg-muted/50 focus-visible:ring-ring block w-full cursor-pointer px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="size-[9px] shrink-0 translate-y-px rounded-full"
              style={{ background: color }}
            />
            <span className="font-bold">{p.t}</span>
            <span className="text-faint text-[10.5px] tracking-[0.05em]">{p.mkt}</span>
            {isNew ? (
              <Badge
                variant="cash"
                title={newHint}
                className="px-1.5 py-0 text-[9.5px] font-semibold tracking-[0.08em]"
              >
                NEW DIV
              </Badge>
            ) : null}
          </span>
          {p.name ? (
            <span className="text-muted-foreground ml-[17px] block max-w-[300px] truncate text-[12px]">
              {p.name}
            </span>
          ) : null}
        </button>
      </TableCell>

      <TableCell className="num px-2.5 py-2 text-right whitespace-nowrap">
        <div>{priced ? fmt(p.px, p.cur) : <Dash />}</div>
        <div className="text-faint text-[11.5px]">{fmt(p.avg, p.cur)} cost</div>
      </TableCell>

      <TableCell className="num px-2.5 py-2 text-right whitespace-nowrap">
        <div>{priced ? fmt(p.val, p.cur) : <Dash />}</div>
        <div className="text-faint text-[11.5px]">{fq(p.qty)} units</div>
      </TableCell>

      <TableCell className="num px-2.5 py-2 text-right whitespace-nowrap">
        {priced ? (
          <>
            <div className={tone}>{fmtS(p.pnlShown, p.cur)}</div>
            <div className={`${tone} text-[11.5px] opacity-75`}>{pctS(p.pctShown)}</div>
          </>
        ) : (
          <Dash />
        )}
      </TableCell>

      <TableCell className="num px-2.5 py-2 text-right whitespace-nowrap">
        {dividends > 0 ? (
          <>
            <div className="text-cash">{fmt(dividends, p.cur)}</div>
            <div className="text-faint text-[11px]">{pct0(returnedPct)} returned</div>
          </>
        ) : (
          <Dash />
        )}
      </TableCell>

      {/* Two figures that are NOT added together: the tax comes off income and
          the fees do not. A single total here would invite the double-count the
          net column exists to avoid. */}
      <TableCell className="num px-2.5 py-2 text-right whitespace-nowrap">
        {tax > 0 || fees > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default">
                {tax > 0 ? (
                  <div className="text-loss">
                    {fmtS(-tax, p.cur)} <span className="text-faint text-[11px]">tax</span>
                  </div>
                ) : (
                  <div className="text-faint">—</div>
                )}
                {fees > 0 ? (
                  <div className="text-faint text-[11px]">{fmt(fees, p.cur)} fees</div>
                ) : null}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[290px]">
              {tax > 0
                ? `Withholding is ${pct0(taxPct)} of this fund's dividends and comes straight off your income. `
                : ''}
              {fees > 0
                ? `Trading fees are ${pct1(feePct)} of cost and are already inside avg cost, so they are not taken off net income as well.`
                : ''}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Dash />
        )}
      </TableCell>

      <TableCell className="num border-hairline border-l px-2.5 py-2 text-right whitespace-nowrap">
        {netIncome > 0 ? (
          <>
            <div className="text-gain font-semibold">{fmt(netIncome, p.cur)}</div>
            <div className="text-faint text-[11px]">{pct0(netPct)} after tax</div>
          </>
        ) : (
          <>
            <Dash />
            {priced ? null : (
              <div className="text-faint text-[11px]">no quote for this holding</div>
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * Where the broker and the ledger disagree, as one line rather than a card.
 *
 * The card that used to carry this was three times the height of the fact it
 * reported and sat above the table it was about. The ledger is still the source
 * of truth and this still only REPORTS the gap — closing it silently would mean
 * inventing a transaction that never happened — but a chip beside the basis note
 * is enough to make it impossible to miss, which was the whole point.
 */
function DriftChip({ drift }) {
  if (!drift.length) return null
  return (
    <>
      {drift.map(d => (
        <span key={d.ticker} className="inline-flex items-center gap-2">
          <Badge
            variant="cash"
            className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]"
          >
            {d.ticker} DRIFT
          </Badge>
          <span className="text-faint text-[11.5px]">
            {d.kind === 'missing' ? (
              <>
                moomoo holds <span className="num">{fq(d.brokerQty)}</span>, nothing in your
                transactions accounts for it
                {d.avgCost === 0 ? ' — cost 0.00, so probably a free share' : ''}
              </>
            ) : d.kind === 'short' ? (
              <>
                moomoo holds <span className="num">{fq(d.diff)}</span> more than your transactions
                account for
              </>
            ) : (
              <>
                your transactions explain <span className="num">{fq(-d.diff)}</span> more than
                moomoo reports
              </>
            )}
          </span>
        </span>
      ))}
    </>
  )
}

function Holdings({ state, pos, fees, drift, basis, onOpen, isNew, hintFor }) {
  if (!pos.length) {
    return (
      <Card className="gap-0 py-0">
        <div className="text-muted-foreground px-6 py-14 text-center">
          No positions yet — sync from OpenD, or add a BUY transaction.
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-faint text-[11.5px]">
          P&amp;L basis: <span className="text-muted-foreground">{PNL_BASIS_LABEL[basis]}</span> —
          change in Settings
        </span>
        <DriftChip drift={drift} />
        <div className="flex-1" />
        <span className="text-faint text-[11.5px]">
          Money stays in each instrument&rsquo;s own currency
        </span>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={`${TH} w-full`}>
                  Holding
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Price <span className="text-faint">/ cost</span>
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Value <span className="text-faint">/ units</span>
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Unrealised P&amp;L
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Dividends
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Fees &amp; tax
                </th>
                <th scope="col" className={`${TH} border-hairline border-l text-right`}>
                  Net income
                </th>
              </tr>
            </thead>
            <TableBody>
              {pos.map(p => (
                <HoldingRow
                  key={p.t}
                  p={p}
                  fees={fees[p.t] || 0}
                  color={slotColor(slotOf(state, p.t))}
                  isNew={isNew(p.t)}
                  newHint={hintFor(p.t)}
                  onOpen={() => onOpen(p.t)}
                />
              ))}
            </TableBody>
          </table>
        </div>
      </Card>

      <p className="text-faint max-w-[760px] text-[11.5px] leading-relaxed">
        A position with no known price shows a dash rather than a zero — a missing quote must never
        read as a wipe-out. Withholding comes off income; fees do not, because they are a cost of
        acquiring the position and already sit inside avg cost. Pick a holding to see every payment
        it has made you.
      </p>
    </div>
  )
}

/* ── ledger ───────────────────────────────────────────────────────────────── */

const PAGE_SIZES = [25, 50, 100, 0]
const pageSizeLabel = n => (n === 0 ? 'All' : String(n))

const LEDGER_FILTERS = ['ALL', 'BUY', 'SELL', 'DIV', 'CASH']

/**
 * The table's columns, and which of them can be hidden.
 *
 * Date, Type and What stay: a row with none of them is not a shorter row, it is
 * an anonymous one.
 */
const COLUMNS = [
  { key: 'date', label: 'Date', fixed: true },
  { key: 'type', label: 'Type', fixed: true },
  { key: 'what', label: 'What', fixed: true, grow: true },
  { key: 'deal', label: 'Qty and price', right: true },
  { key: 'amount', label: 'Amount', fixed: true, right: true },
  { key: 'wallet', label: 'Wallet after', right: true },
  { key: 'source', label: 'Source', right: true },
]

const EMPTY_COPY = {
  ALL: 'Nothing here yet — run the OpenD sync, or add a transaction.',
  BUY: 'No buys recorded yet.',
  SELL: 'No sells yet — nothing has left the portfolio.',
  DIV: 'No dividends yet.',
  CASH: 'No deposits or withdrawals yet — record one with Add movement.',
}

function LedgerRow({ row, state, show, note }) {
  const signed = row.direction * row.amount
  // A row is the wallet's own when nothing else claims it. Withholding tax is a
  // cash movement AND attributable to a holding, so it is the ticker that
  // decides this, never the kind.
  const isCash = !row.ticker

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

      <TableCell className={`${TD} w-full`}>
        {isCash ? (
          <span className="text-muted-foreground inline-flex items-center gap-2">
            Wallet
            <span className="text-faint text-[11.5px]">
              {note || `· ${row.currency}`}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-[7px] shrink-0 rounded-full"
              style={{ background: slotColor(slotOf(state, row.ticker)) }}
            />
            <span className="font-semibold">{row.ticker}</span>
            {note ? <span className="text-faint text-[11.5px]">{note}</span> : null}
          </span>
        )}
      </TableCell>

      {show.deal ? (
        <>
          <TableCell className={`${TD} num text-right`}>
            {row.qty ? fq(row.qty) : <Dash />}
          </TableCell>
          <TableCell className={`${TD} num text-right`}>
            {row.price ? rate(row.price, row.currency) : <Dash />}
          </TableCell>
        </>
      ) : null}

      <TableCell className={`${TD} num text-right ${toneClass(signed)}`}>
        {row.pending ? <span className="text-faint">≈ </span> : null}
        {fmtS(signed, row.currency)}
      </TableCell>

      {show.wallet ? (
        <TableCell className={`${TD} border-hairline num border-l text-right`}>
          {row.pending ? (
            <Dash />
          ) : (
            <>
              <span className="text-cash">{fmt(row.walletAfter, row.currency)}</span>
              <span className="text-faint ml-1.5 text-[11px]">{row.currency}</span>
            </>
          )}
        </TableCell>
      ) : null}

      {show.source ? (
        <TableCell className={`${TD} text-right`}>
          {row.pending ? (
            <Badge variant="cash" className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]">
              PENDING
            </Badge>
          ) : row.source && row.source !== 'manual' ? (
            <Badge variant="gain" className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]">
              SYNCED
            </Badge>
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  )
}

/**
 * A same-day WITHDRAW in one currency against a DEPOSIT in the other is how an
 * FX transfer reaches the database — pair them off so both rows can say so
 * instead of reading as money in and out of the account.
 */
function conversionLabels(cash) {
  const byDate = {}
  for (const c of cash) (byDate[c.date] ??= []).push(c)

  const labels = {}
  for (const list of Object.values(byDate)) {
    const ins = list.filter(c => c.type === 'DEPOSIT')
    for (const out of list) {
      if (out.type !== 'WITHDRAW') continue
      const match = ins.find(i => i.currency !== out.currency && !labels[i.id])
      if (!match) continue
      const label = `${out.currency} → ${match.currency} conversion`
      labels[out.id] = label
      labels[match.id] = label
    }
  }
  return labels
}

function Ledger({ state, rows, onAddMovement }) {
  const [filter, setFilter] = useState('ALL')
  const [ticker, setTicker] = useState(ALL)
  const [month, setMonth] = useState(ALL)
  const [hidden, setHidden] = useState(() => new Set())
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)

  const show = useMemo(
    () => Object.fromEntries(COLUMNS.map(c => [c.key, c.fixed || !hidden.has(c.key)])),
    [hidden],
  )

  const conversions = useMemo(() => conversionLabels(state.cash), [state.cash])
  const noteFor = row => {
    if (row.kind === 'FEE') return '· withholding tax'
    if (row.pending) return '· declared, not booked by moomoo yet'
    return conversions[row.id] ? `· ${conversions[row.id]}` : ''
  }

  const tickers = useMemo(
    () => [...new Set(rows.map(r => r.ticker).filter(Boolean))].sort(),
    [rows],
  )
  const months = useMemo(
    () => [...new Set(rows.map(r => r.date.slice(0, 7)))].sort().reverse(),
    [rows],
  )

  // Instrument and month narrow the feed first; the type chips then filter what
  // is left, so their counts describe the current view. A chip reading 12 must
  // mean 12 rows are one click away.
  const scoped = useMemo(
    () =>
      rows.filter(
        r =>
          (ticker === ALL || (ticker === CASH_ONLY ? !r.ticker : r.ticker === ticker)) &&
          (month === ALL || r.date.startsWith(month)),
      ),
    [rows, ticker, month],
  )
  const counts = useMemo(
    () => Object.fromEntries(LEDGER_FILTERS.map(f => [f, filterHistory(scoped, f).length])),
    [scoped],
  )
  const shown = useMemo(() => filterHistory(scoped, filter), [scoped, filter])
  const narrowed = filter !== 'ALL' || ticker !== ALL || month !== ALL
  const clear = () => {
    setFilter('ALL')
    setTicker(ALL)
    setMonth(ALL)
  }

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(shown.length / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(0)
  }, [page, pageCount])
  const safePage = Math.min(page, pageCount - 1)
  const from = pageSize === 0 ? 0 : safePage * pageSize
  const paged = useMemo(
    () => (pageSize === 0 ? shown : shown.slice(from, from + pageSize)),
    [shown, from, pageSize],
  )
  useEffect(() => setPage(0), [filter, ticker, month, pageSize])

  const newest = shown.length ? shown[0].date : null
  const oldest = shown.length ? shown[shown.length - 1].date : null
  const hasFee = useMemo(() => rows.some(r => r.kind === 'FEE'), [rows])
  const hasConversion = Object.keys(conversions).length > 0

  const columns = COLUMNS.filter(c => show[c.key])

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
            <SelectItem value={CASH_ONLY}>Wallet rows only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger size="sm" className="h-7 w-[150px] text-[12px]" aria-label="Filter by month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All time</SelectItem>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {monthLabel(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="bg-border mx-0.5 h-5 w-px" aria-hidden="true" />

        {LEDGER_FILTERS.map(f => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={f === filter ? 'default' : 'outline'}
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
            className="h-7 gap-1.5 rounded-full px-3 text-[12px] font-semibold"
          >
            {HISTORY_FILTER_LABELS[f]}
            <span className={`num text-[11px] ${f === filter ? 'opacity-70' : 'text-faint'}`}>
              {counts[f]}
            </span>
          </Button>
        ))}

        {narrowed ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            className="h-7 rounded-full px-2.5 text-[12px]"
          >
            Clear
          </Button>
        ) : null}

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-[12px]">
              <Columns3Icon />
              Columns
              {hidden.size ? <span className="num text-faint">{columns.length}</span> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[190px]">
            <DropdownMenuLabel className="text-[11px]">Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMNS.map(c => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={show[c.key]}
                disabled={c.fixed}
                onSelect={e => e.preventDefault()}
                onCheckedChange={on =>
                  setHidden(prev => {
                    const next = new Set(prev)
                    if (on) next.delete(c.key)
                    else next.add(c.key)
                    return next
                  })
                }
              >
                {c.label}
                {c.fixed ? <span className="text-faint ml-auto text-[10.5px]">always</span> : null}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-[12px]" onClick={onAddMovement}>
          <PlusIcon />
          Add movement
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {shown.length ? (
          <div className="max-h-[calc(100svh-27rem)] overflow-auto overscroll-contain">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {columns.map(c =>
                    c.key === 'deal' ? (
                      <th key="deal" scope="col" className={`${TH} text-right`} colSpan={2}>
                        Qty <span className="text-faint">/ price</span>
                      </th>
                    ) : (
                      <th
                        key={c.key}
                        scope="col"
                        className={`${TH}${c.grow ? ' w-full' : ''}${c.right ? ' text-right' : ''}${
                          c.key === 'wallet' ? ' border-hairline border-l' : ''
                        }`}
                      >
                        {c.label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <TableBody>
                {paged.map(row => (
                  <LedgerRow key={row.key} row={row} state={state} show={show} note={noteFor(row)} />
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
                Nothing matches{' '}
                {filter === 'ALL' ? 'this' : HISTORY_FILTER_LABELS[filter].toLowerCase()}
                {ticker === CASH_ONLY ? ' for wallet rows' : ticker === ALL ? '' : ` for ${ticker}`}
                {month === ALL
                  ? ''
                  : ` in ${monthLabel(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)}`}
                .
                <div className="pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={clear}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-muted-foreground text-[12px]">
            Showing <span className="num">{from + 1}</span>–
            <span className="num">{from + paged.length}</span> of{' '}
            <span className="num">{shown.length}</span> row{shown.length === 1 ? '' : 's'} ·{' '}
            <span className="num">{dfmtLong(oldest)}</span>
            {oldest === newest ? null : (
              <>
                {' – '}
                <span className="num">{dfmtLong(newest)}</span>
              </>
            )}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <span className="text-faint text-[11.5px]">Per page</span>
            {PAGE_SIZES.map(n => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={pageSize === n ? 'default' : 'outline'}
                aria-pressed={pageSize === n}
                onClick={() => setPageSize(n)}
                className="num h-7 rounded-full px-2.5 text-[12px]"
              >
                {pageSizeLabel(n)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-faint max-w-[880px] text-[11.5px] leading-relaxed">
        Wallet after is this ledger&rsquo;s own running balance in the currency that moved, so an
        MYR row and a USD row do not continue one another. Where a sync has run the newest row is
        pinned to moomoo&rsquo;s own figure and the rest are worked back from it — moomoo leaves
        trade fees out of its cash-flow ledger entirely, so an older balance is only as right as
        the rows above it are complete. Buy amounts include fees, sell amounts are net of them.
        {hasFee
          ? ' A FEE row is the 30% FATCA withholding on a US dividend.'
          : ''}
        {hasConversion
          ? ' A withdrawal and a deposit in different currencies on the same day are a conversion — that money moved between your two wallets, it did not leave the account.'
          : ''}{' '}
        Savings, salary and loan rows never touch this wallet, so they stay in History.
      </p>
    </div>
  )
}

/* ── the income panel ─────────────────────────────────────────────────────── */

const CHART_W = 640
const CHART_TOP = 5
const CHART_BOT = 115

function Stat({ label, value, tone = '' }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`num mt-0.5 text-[14px] font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

/**
 * The declared-per-share rate, oldest first.
 *
 * A line rather than the bars this used to be. Bars said "here are forty
 * separate payments"; the question the panel is actually asked is whether the
 * rate is holding up, and that is a shape. The solid run is money that arrived,
 * the dashed tail is declared and not yet booked, and the marker is where your
 * money entered a schedule the fund had already been running.
 *
 * Drawn by hand rather than with recharts: it is one series with no interaction,
 * and a 40-line SVG renders in a panel that opens and closes without dragging a
 * chart library's layout pass along with it.
 */
function RateChart({ rows, cur, color, firstBought }) {
  // Oldest first for reading left to right.
  const series = useMemo(() => [...rows].reverse(), [rows])
  if (series.length < 2) return null

  const vals = series.map(r => r.perShare || 0)
  const hi = Math.max(...vals, 0)
  const lo = Math.min(...vals, hi)
  const range = Math.max(1e-6, hi - lo)
  const y = v => CHART_BOT - ((v - lo) / range) * (CHART_BOT - CHART_TOP - 14) - 7
  const x = i => (i / (series.length - 1)) * CHART_W
  const pt = (r, i) => `${x(i).toFixed(1)},${y(r.perShare || 0).toFixed(1)}`

  const firm = series.filter(r => !r.pending)
  const lastI = firm.length - 1
  const dLine = firm.length ? 'M' + firm.map(pt).join(' L') : ''
  const tail = series.slice(Math.max(0, lastI))
  const dPending = tail.length > 1 ? 'M' + tail.map((r, i) => pt(r, lastI + i)).join(' L') : ''
  const entry = firstBought ? series.findIndex(r => r.date >= firstBought) : -1
  const gradId = `rate-${cur}-${series.length}`

  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2 pt-1">
        <div className="flex h-[120px] w-[56px] flex-none flex-col justify-between text-right">
          <span className="num text-faint text-[10px] leading-none">{rate(hi, cur)}</span>
          <span className="num text-faint text-[10px] leading-none">{rate((hi + lo) / 2, cur)}</span>
          <span className="num text-faint text-[10px] leading-none">{rate(lo, cur)}</span>
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} 120`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="h-[120px] w-full min-w-0 flex-1 overflow-visible"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[CHART_TOP, 60, CHART_BOT].map(gy => (
            <line
              key={gy}
              x1="0"
              y1={gy}
              x2={CHART_W}
              y2={gy}
              stroke="var(--hairline)"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {entry > 0 ? (
            <line
              x1={x(entry)}
              y1={CHART_TOP}
              x2={x(entry)}
              y2={CHART_BOT}
              stroke="var(--faint)"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {firm.length ? (
            <path
              d={`${dLine} L${x(lastI).toFixed(1)},${CHART_BOT} L${x(0).toFixed(1)},${CHART_BOT} Z`}
              fill={`url(#${gradId})`}
              stroke="none"
            />
          ) : null}
          <path
            d={dLine}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {dPending ? (
            <path
              d={dPending}
              fill="none"
              stroke={color}
              strokeOpacity="0.55"
              strokeWidth="2.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {firm.length ? (
            <circle
              cx={x(lastI)}
              cy={y(firm[lastI].perShare || 0)}
              r="3.5"
              fill="var(--card)"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      </div>
      <div className="flex min-w-0 gap-2">
        <span className="w-[56px] flex-none" />
        <div className="flex min-w-0 flex-1 justify-between">
          <span className="num text-faint text-[10px]">{dfmt(series[0].date)}</span>
          {entry > 0 ? <span className="text-faint text-[10px]">you bought</span> : null}
          <span className="num text-faint text-[10px]">{dfmt(series[series.length - 1].date)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Every payment one holding has made, and what the rate behind them is doing.
 *
 * The panel that replaced the fund card. It answers one question rather than
 * five, and it answers it in the instrument's own currency — a US fund's
 * payments are dollars, and restating them at today's rate would misreport money
 * that arrived at last year's.
 *
 * A holding the sync has never returned a schedule for still opens: it says so,
 * rather than drawing a row of dashes or failing on the missing figures.
 */
function IncomePanel({ state, ticker, open, onClose }) {
  const i = ticker ? instr(state, ticker) : null
  const cur = i ? i.currency : 'MYR'
  const rows = useMemo(
    () => (ticker ? dividendSchedule(state, ticker) : []),
    [state, ticker],
  )
  const pos = useMemo(
    () => positionsWithIncome(state).find(p => p.t === ticker) || null,
    [state, ticker],
  )
  const metrics = ticker ? fundMetricsFor(state, ticker) : null
  const declarations = useMemo(
    () => rows.map(r => ({ per_share: r.perShare || 0 })),
    [rows],
  )

  const paid = rows.filter(r => !r.pending)
  const pending = rows.filter(r => r.pending)
  const netSum = paid.reduce((s, r) => s + r.net, 0)
  const taxSum = paid.reduce((s, r) => s + r.tax, 0)
  const owed = pending.reduce((s, r) => s + r.net, 0)
  const largest = paid.reduce((m, r) => Math.max(m, r.net), 0)
  const trend = declarationTrend(declarations, 4)
  const invested = pos ? pos.cost : 0
  const returnedPct = invested > 0 ? (netSum / invested) * 100 : null
  const firstBought = ticker ? firstBoughtOn(state, ticker) : null

  return (
    <Sheet open={open} onOpenChange={v => (v ? null : onClose())}>
      <SheetContent className="w-full sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>
            {ticker}
            {i && i.name ? ` · ${i.name}` : ''}
          </SheetTitle>
          <SheetDescription>
            Every payment this holding has made you, and what the rate behind them is doing.
            Figures come from moomoo and refresh with each sync.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 overflow-y-auto px-4 pb-6">
          {/* Has really paid you sits BESIDE the quoted yield, not under it. They
              are the same kind of claim about the same fund and the reader is
              being asked to compare them — moomoo annualises one recent
              distribution, which for a fund whose rate is falling extrapolates
              hard. */}
          <div className="border-hairline grid grid-cols-2 items-end gap-x-6 gap-y-3.5 border-b pb-3.5">
            <div>
              <div className="eyebrow">Paid you, net</div>
              <div className="num text-gain mt-1 text-[30px] leading-none font-semibold tracking-[-0.02em]">
                {paid.length ? fmt(netSum, cur) : '—'}
              </div>
              <p className="text-faint mt-1.5 text-[11.5px]">
                {paid.length ? (
                  <>
                    {fmt(netSum + taxSum, cur)} gross, less{' '}
                    {taxSum > 0 ? fmt(taxSum, cur) : 'nothing'} withheld
                    {firstBought ? ` since ${dfmtLong(firstBought)}` : ''}
                  </>
                ) : (
                  'nothing received yet'
                )}
              </p>
            </div>
            <div>
              <div className="eyebrow">Quoted yield</div>
              <div className="num text-cash mt-1 text-[30px] leading-none font-semibold tracking-[-0.02em]">
                {metrics && metrics.dividend_yield != null ? pct1(metrics.dividend_yield) : '—'}
              </div>
              <p className="text-faint mt-1.5 text-[11.5px]">
                moomoo&rsquo;s projection, annualised — against{' '}
                <span className="num">{returnedPct == null ? '—' : pct1(returnedPct)}</span> really
                returned
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label="Payments" value={paid.length ? fq(paid.length) : '—'} />
            <Stat label="Average" value={paid.length ? fmt(netSum / paid.length, cur) : '—'} />
            <Stat label="Largest" value={paid.length ? fmt(largest, cur) : '—'} />
            <Stat
              label="Per share trend"
              value={trend == null ? '—' : pctS(trend)}
              tone={trend == null ? 'text-faint' : trend < 0 ? 'text-loss' : 'text-gain'}
            />
            <Stat
              label="Withheld"
              value={taxSum > 0 ? fmt(taxSum, cur) : '—'}
              tone={taxSum > 0 ? 'text-loss' : 'text-faint'}
            />
            <Stat label="Last paid" value={paid.length ? dfmtLong(paid[0].date) : '—'} />
            <Stat
              label="Owed to you"
              value={owed > 0 ? `≈ ${fmt(owed, cur)}` : '—'}
              tone={owed > 0 ? 'text-cash' : 'text-faint'}
            />
            <Stat label="You hold" value={pos ? fq(pos.qty) : '—'} />
          </div>

          {rows.length ? (
            <>
              <div className="border-hairline grid gap-1.5 border-t pt-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="eyebrow">Declared per share</span>
                  {trend == null ? null : (
                    <span className={`num text-[11.5px] ${trend < 0 ? 'text-loss' : 'text-gain'}`}>
                      {pctS(trend)} on the previous 4
                    </span>
                  )}
                </div>
                <RateChart
                  rows={rows}
                  cur={cur}
                  color={slotColor(slotOf(state, ticker))}
                  firstBought={firstBought}
                />
                <p className="text-faint text-[11px] leading-relaxed">
                  Every payment this holding has made you, oldest first, at what it worked out to
                  per share on the day. The dashed tail is declared but not yet booked by moomoo,
                  so it is not counted as income above.
                </p>
              </div>

              <Card className="gap-0 overflow-hidden py-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr>
                        <th scope="col" className={TH}>
                          Paid
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Per share
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Gross <span className="text-faint">/ units</span>
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Withheld
                        </th>
                        <th scope="col" className={`${TH} border-hairline border-l text-right`}>
                          Net
                        </th>
                      </tr>
                    </thead>
                    <TableBody>
                      {rows.map(r => (
                        <TableRow key={r.date} className={r.pending ? 'opacity-70' : undefined}>
                          <TableCell className={TD}>
                            <DateCell date={r.date} />
                            {r.pending ? (
                              <Badge
                                variant="cash"
                                className="ml-1.5 px-1.5 py-0 text-[9.5px] font-semibold tracking-[0.08em]"
                              >
                                PENDING
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className={`${TD} num text-right`}>
                            {r.perShare == null ? <Dash /> : rate(r.perShare, cur)}
                          </TableCell>
                          <TableCell className={`${TD} num text-right`}>
                            <div className="text-cash">{fmt(r.gross, cur)}</div>
                            <div className="text-faint text-[11px]">{fq(r.units)} units</div>
                          </TableCell>
                          <TableCell
                            className={`${TD} num text-right ${r.tax > 0 ? 'text-loss' : 'text-faint'}`}
                          >
                            {r.tax > 0 ? fmtS(-r.tax, cur) : '—'}
                          </TableCell>
                          <TableCell
                            className={`${TD} border-hairline num border-l text-right font-semibold ${
                              r.pending ? 'text-cash' : 'text-gain'
                            }`}
                          >
                            {r.pending ? '≈ ' : ''}
                            {fmt(r.net, cur)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              </Card>

              <p className="text-faint text-[11.5px] leading-relaxed">
                {taxSum > 0
                  ? 'Withholding is the 30% FATCA charge moomoo deducts from a US distribution before the money reaches your wallet. Net is what actually arrived.'
                  : 'Nothing is withheld on a Malaysian distribution, so gross and net are the same figure. Trading fees are not taken off income — they already sit inside avg cost.'}
              </p>
            </>
          ) : (
            <div className="border-hairline rounded-lg border px-4 py-10 text-center">
              <p className="text-muted-foreground text-[13.5px]">
                Nothing paid out against {ticker} yet.
              </p>
              <p className="text-faint mx-auto mt-2 max-w-[340px] text-[11.5px] leading-relaxed">
                {metrics
                  ? 'A dividend appears here when the sync imports it, or when you record a DIV transaction against this holding yourself.'
                  : 'No fund figures have ever synced for this holding, so there is no schedule to draw. A dividend appears here when the sync imports one, or when you record a DIV transaction against it yourself.'}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ── the screen ───────────────────────────────────────────────────────────── */

export default function Portfolio() {
  const { state, openTransaction, openCash, openInstrument } = useVantage()
  const [tab, setTab] = useState('holdings')
  const [selected, setSelected] = useState(null)

  const basis = pnlBasis(state)
  const pos = useMemo(() => positionsWithIncome(state, basis), [state, basis])
  const fees = useMemo(() => feesByTicker(state), [state])
  const drift = useMemo(() => brokerDrift(state), [state])
  const fold = useMemo(() => portfolio(state, basis), [state, basis])
  const ledger = useMemo(() => portfolioLedger(state), [state])

  // The newest money each holding has seen, booked or merely declared — the
  // watermark the NEW DIV chip is read against.
  const latest = useMemo(() => {
    const out = {}
    for (const p of pos) {
      const rows = dividendSchedule(state, p.t)
      if (rows.length) out[p.t] = rows[0].date
    }
    return out
  }, [state, pos])
  const { seen, markSeen } = useSeenDividends(latest)

  const hints = useMemo(() => {
    const out = {}
    for (const p of pos) {
      const rows = dividendSchedule(state, p.t).filter(r => !seen[p.t] || r.date > seen[p.t])
      if (!rows.length) continue
      out[p.t] = rows
        .map(r =>
          r.pending
            ? `≈ ${fmt(r.net, p.cur)} declared for ${dfmtLong(r.date)}, not booked by moomoo yet`
            : `${fmt(r.net, p.cur)} credited on ${dfmtLong(r.date)}${
                r.tax > 0 ? `, after ${fmt(r.tax, p.cur)} withheld` : ''
              }`,
        )
        .join('. ')
    }
    return out
  }, [state, pos, seen])

  const openHolding = ticker => {
    setSelected(ticker)
    markSeen(ticker)
  }

  const wallets = useMemo(
    () => new Set([...(state.funds || []).map(f => f.currency), ...state.cash.map(c => c.currency)]).size,
    [state.funds, state.cash],
  )

  const TAB_BUTTON =
    'relative h-[38px] px-3.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors'

  return (
    <>
      {/* The header runs edge to edge, undoing `main`'s gutter and top padding.
          The four figures and the tab strip are the frame of this screen rather
          than cards inside it, and a card would draw a box around the one thing
          that is not optional. */}
      <div className={`${BLEED} -mt-5`}>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2.5 ${GUTTER}`}>
          <span className="text-faint text-[11.5px]">
            moomoo · <span className="num">{pos.length}</span> position
            {pos.length === 1 ? '' : 's'}, <span className="num">{wallets}</span> wallet
            {wallets === 1 ? '' : 's'}
          </span>
          <div className="flex-1" />
          {/* Adding an instrument outlived the screen it used to live on, and a
              BUY has nothing to attach to until one exists — so it keeps a home
              here, quieter than the action beside it. */}
          <Button size="sm" variant="outline" onClick={openInstrument}>
            <PlusIcon />
            Add instrument
          </Button>
          {/* One Add transaction on this screen, not one per tab. It writes a
              holding row, so it belongs beside the holdings. */}
          <Button size="sm" onClick={() => openTransaction()}>
            <PlusIcon />
            Add transaction
          </Button>
        </div>

        <Figures state={state} fold={fold} basis={basis} />

        <div className={`flex gap-1 border-b ${GUTTER}`}>
          {[
            { id: 'holdings', label: 'Holdings', count: pos.length },
            { id: 'ledger', label: 'Ledger', count: ledger.length },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'true' : undefined}
              className={`${TAB_BUTTON} ${
                tab === t.id
                  ? 'border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {t.label}
              <span className="num text-faint ml-1.5 text-[11px]">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4">
        {tab === 'holdings' ? (
          <Holdings
            state={state}
            pos={pos}
            fees={fees}
            drift={drift}
            basis={basis}
            onOpen={openHolding}
            isNew={t => Boolean(hints[t])}
            hintFor={t => hints[t]}
          />
        ) : (
          <Ledger state={state} rows={ledger} onAddMovement={() => openCash()} />
        )}
      </div>

      <IncomePanel
        state={state}
        ticker={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
