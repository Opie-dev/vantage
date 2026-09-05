/**
 * Positions — every open holding, one row each.
 *
 * Port of legacy `renderPos()`. Rows come straight from positions(state); money
 * stays in each instrument's OWN currency here (the ticker's symbol says which),
 * so nothing on this screen is summed across markets.
 *
 * A position with no known price shows a dash rather than a zero — a missing
 * quote must never read as a wipe-out.
 *
 * Dividends and Fees both sit against cost so they can be read against each other:
 * these are income funds, and what a position has PAID matters as much as what it
 * is worth. P&L alone reads far worse than the position has actually done.
 *
 * The income columns read left to right as one sentence: Dividends (gross) less
 * Withholding gives Net income — what actually reached the wallet.
 *
 * Fees sit apart from that arithmetic on purpose. They are a cost of ACQUIRING the
 * position, already inside avg cost, not a deduction from its income — subtracting
 * them from net income would both double-count them and answer no real question.
 *
 * They share the "Fees & tax" column to keep the table narrow, but they are NOT
 * added together there: one number comes off income and the other does not, so a
 * single total would be a figure nothing in the app could use and would invite
 * exactly the double-count above. Two lines, the deduction first.
 *
 * The P&L column follows the basis chosen in Settings, so under two of the three
 * options it already contains the income shown further right. The header names the
 * active basis whenever it is not plain price-only, so that overlap is never a
 * surprise.
 */

import { useMemo } from 'react'
import { PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useVantage } from '@/lib/store'
import {
  PNL_BASIS_LABEL,
  brokerDrift,
  feesByTicker,
  pnlBasis,
  positionsWithIncome,
  slotColor,
} from '@/lib/calc'
import { fmt, fmtS, fq, pct0, pct1, pctS, toneClass } from '@/lib/format'

/** A right-aligned figure, or an em dash when there is no price to work from. */
function Figure({ show, children, className = '' }) {
  if (!show) return <span className="text-faint">—</span>
  return <span className={className}>{children}</span>
}

function PositionRow({ p, fees }) {
  // positionsWithIncome() already attached these per the active basis.
  const { dividends, withheld: tax } = p
  const priced = p.px > 0
  const tone = toneClass(p.pnlShown)
  // Against cost, not market value: "how much of what I put in has come back as
  // income". Cumulative since the first purchase — NOT annualised, which is why it
  // reads "returned" rather than "yield", a word that implies a yearly rate.
  const returnedPct = p.cost > 0 ? (dividends / p.cost) * 100 : 0
  // Cost already contains the fees, so this is their share of it.
  const feePct = p.cost > 0 ? (fees / p.cost) * 100 : 0
  // Against the dividends it was taken from, not against cost — the interesting
  // number is the rate being withheld, which should sit at moomoo's flat 30%.
  const taxPct = dividends > 0 ? (tax / dividends) * 100 : 0
  // What actually landed: gross dividends less the tax withheld from them. Fees
  // are deliberately not subtracted — see the note at the top of this file.
  const netIncome = dividends - tax
  const netPct = p.cost > 0 ? (netIncome / p.cost) * 100 : 0

  return (
    <TableRow>
      <TableCell className="py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="size-[9px] shrink-0 translate-y-px rounded-full" style={{ background: slotColor(p.slot) }} />
          <span className="font-bold">{p.t}</span>
          <span className="text-faint text-[10.5px] tracking-[0.05em]">{p.mkt}</span>
        </div>
        {p.name ? (
          <div className="text-muted-foreground ml-[17px] max-w-[300px] truncate text-[12px]" title={p.name}>
            {p.name}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="num text-right">{fq(p.qty)}</TableCell>
      <TableCell className="num text-right">{fmt(p.avg, p.cur)}</TableCell>
      <TableCell className="num text-right">
        <Figure show={priced}>{fmt(p.px, p.cur)}</Figure>
      </TableCell>
      <TableCell className="num text-right">
        <Figure show={priced}>{fmt(p.val, p.cur)}</Figure>
      </TableCell>
      <TableCell className="num text-right">
        <Figure show={priced} className={tone}>
          {fmtS(p.pnlShown, p.cur)}
        </Figure>
      </TableCell>
      <TableCell className="num text-right">
        <Figure show={priced} className={tone}>
          {pctS(p.pctShown)}
        </Figure>
      </TableCell>
      <TableCell className="num text-right">
        {dividends > 0 ? (
          <>
            <div className="text-cash">{fmt(dividends, p.cur)}</div>
            <div className="text-faint text-[11px]">{pct0(returnedPct)} returned</div>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </TableCell>
      <TableCell className="num text-right">
        {tax > 0 || fees > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default">
                {tax > 0 ? (
                  <div className="text-loss">
                    {fmtS(-tax, p.cur)} <span className="text-faint text-[11px]">tax</span>
                  </div>
                ) : null}
                {fees > 0 ? (
                  <div className="text-faint text-[11px]">{fmt(fees, p.cur)} fees</div>
                ) : null}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[290px]">
              {tax > 0 ? `Withholding is ${pct0(taxPct)} of this fund's dividends and comes straight off your income. ` : ''}
              {fees > 0
                ? `Trading fees are ${pct1(feePct)} of cost and are already inside avg cost, so they are not taken off net income as well.`
                : ''}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-faint">—</span>
        )}
      </TableCell>
      <TableCell className="num border-hairline border-l text-right">
        {netIncome > 0 ? (
          <>
            <div className="text-gain font-semibold">{fmt(netIncome, p.cur)}</div>
            <div className="text-faint text-[11px]">{pct0(netPct)} after tax</div>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * Where the broker and the ledger disagree about what you hold.
 *
 * The ledger stays the source of truth — this reports a gap rather than closing
 * it, because closing it silently would mean inventing a transaction that never
 * happened. What it buys is that the gap is impossible to miss: a free
 * promotional share sat unnoticed until someone counted positions by hand.
 */
function BrokerDrift({ drift, onAdd }) {
  if (!drift.length) return null
  return (
    <Card className="border-cash/40 gap-2 py-3.5">
      <CardContent className="px-4">
        <span className="eyebrow">moomoo and your ledger disagree</span>
        <div className="mt-2 grid gap-1.5">
          {drift.map(d => (
            <div key={d.ticker} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
              <b className="num font-semibold">{d.ticker}</b>
              {d.kind === 'missing' ? (
                <span className="text-muted-foreground">
                  moomoo holds <span className="num">{fq(d.brokerQty)}</span>, nothing in your
                  transactions accounts for it
                  {d.avgCost === 0 ? ' — cost 0.00, so probably a free share' : ''}
                </span>
              ) : d.kind === 'short' ? (
                <span className="text-muted-foreground">
                  moomoo holds <span className="num">{fq(d.brokerQty)}</span>, your transactions
                  explain <span className="num">{fq(d.ledgerQty)}</span> — a buy is missing
                </span>
              ) : (
                <span className="text-muted-foreground">
                  your transactions explain <span className="num">{fq(d.ledgerQty)}</span>, moomoo
                  reports <span className="num">{fq(d.brokerQty)}</span> — a sell is missing
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="text-faint mt-2.5 text-[11.5px] leading-relaxed">
          Positions are derived from your transactions, never from the broker&rsquo;s own count, so
          a holding nothing explains is not drawn. Record the missing entry and it appears.
        </p>
        <Button size="sm" variant="outline" className="mt-2.5" onClick={onAdd}>
          <PlusIcon />
          Add transaction
        </Button>
      </CardContent>
    </Card>
  )
}

export default function Positions() {
  const { state, openTransaction } = useVantage()
  const basis = pnlBasis(state)
  const pos = useMemo(() => positionsWithIncome(state, basis), [state, basis])
  const fees = useMemo(() => feesByTicker(state), [state])
  const drift = useMemo(() => brokerDrift(state), [state])

  return (
    <div className="grid gap-3">
      <BrokerDrift drift={drift} onAdd={() => openTransaction()} />
      <div className="flex flex-wrap items-center gap-2">
        {basis === 'price' ? null : (
          <span className="text-faint text-[11.5px]">
            P&amp;L basis: <span className="text-muted-foreground">{PNL_BASIS_LABEL[basis]}</span> — change in
            Settings
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => openTransaction()}>
          <PlusIcon />
          Add transaction
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {pos.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">P&L %</TableHead>
                  <TableHead className="text-right">Dividends</TableHead>
                  <TableHead className="text-right">Fees &amp; tax</TableHead>
                  <TableHead className="border-hairline border-l text-right">Net income</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pos.map(p => (
                  <PositionRow key={p.t} p={p} fees={fees[p.t] || 0} />
                ))}
              </TableBody>
            </Table>
            <p className="text-faint border-hairline border-t px-2.5 py-2.5 text-[12px]">
              Prices: OpenD sync when running, ↻ Prices (Yahoo) otherwise. Avg cost includes fees. Dividends are
              gross of withholding tax; the percentage is cumulative income against cost since you first bought,
              not an annual yield. Fees &amp; tax holds two figures that are not added together: the tax is withheld
              from dividends and gives Net income (Dividends less tax — what actually reached your wallet), while
              the fees are trading costs already inside avg cost, shown so you can see them but never charged twice.
            </p>
          </>
        ) : (
          <CardContent className="text-muted-foreground px-6 py-14 text-center">
            No positions yet — sync from OpenD or add a BUY transaction.
          </CardContent>
        )}
      </Card>
    </div>
  )
}
