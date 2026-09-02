/**
 * Wallet — the two cash balances and the movement history behind them.
 *
 * Port of legacy `renderWallet()`, with one deliberate correction. The legacy
 * screen derived the balance by summing `cash_movements` plus the cash legs of
 * every trade; that never reconciled against the broker, because moomoo's
 * cash-flow ledger leaves trade fees out entirely. The figures shown here come
 * from portfolio(), which prefers the broker's own accinfo_query snapshot and
 * only falls back to the derived sum when no sync has ever run. The table below
 * is therefore presented as the movement *history*, not as the maths behind the
 * balance.
 *
 * The rows the owner actually has are DEPOSIT, WITHDRAW and FEE, where a FEE is
 * the FATCA withholding tax on a US dividend and most WITHDRAW/DEPOSIT pairs
 * are MYR↔USD conversions inside the account rather than money leaving it — so
 * both get labelled in place rather than left as bare type chips.
 */

import { useMemo } from 'react'
import { ArrowLeftRightIcon, PlusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'

import { cashSource, portfolio, toRM, walletMovements } from '@/lib/calc'
import { dfmt, dfmtLong, dtfmt, fmt, fmtS, toneClass } from '@/lib/format'
import { useVantage } from '@/lib/store'

const THIS_YEAR = new Date().getFullYear()

/** Money out of the wallet: WITHDRAW and FEE. Everything else is money in. */
const OUT = new Set(['WITHDRAW', 'FEE'])

const TH =
  'sticky top-0 z-10 h-8 bg-card px-2.5 text-left align-middle text-[10.5px] font-semibold ' +
  'tracking-[0.09em] whitespace-nowrap text-muted-foreground uppercase ' +
  'shadow-[inset_0_-1px_0_var(--border)]'

const TD = 'px-2.5 py-1.5 align-middle whitespace-nowrap'

/** fmt(), except a negative balance reads '−$42.45' rather than '$-42.45'. */
const money = (v, cur) => (v < 0 ? fmtS(v, cur) : fmt(v, cur))

function BalanceCard({ label, value, currency, children }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent>
        <p className="eyebrow">{label}</p>
        <div className={`stat mt-2 ${value < 0 ? 'text-loss' : ''}`}>{money(value, currency)}</div>
        <p className="text-muted-foreground mt-1.5 text-[12px]">{children}</p>
      </CardContent>
    </Card>
  )
}

/**
 * A same-day WITHDRAW in one currency against a DEPOSIT in the other is how an
 * FX transfer reaches the database (see the ingest handler in server.js) — pair
 * them off so both rows can say so instead of reading as money in and out.
 * Returns a map of cash-movement id → label.
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

function noteFor(row, conversions) {
  if (row.type === 'FEE') {
    if (row.ticker) return `${row.ticker} withholding tax`
    return row.currency === 'USD' ? 'FATCA withholding on a US dividend' : 'Broker fee'
  }
  if (row.type === 'DIVIDEND') {
    return row.ticker ? `${row.ticker} dividend` : 'Dividend credited to the wallet'
  }
  return conversions[row.id] || ''
}

function MovementRow({ row, note }) {
  const out = OUT.has(row.type)
  const signed = out ? -row.amount : row.amount
  const year = Number(String(row.date).slice(0, 4))

  return (
    <TableRow className={row.pending ? 'opacity-70' : undefined}>
      <TableCell className={TD}>
        <span className="num text-[12.5px]">
          {dfmt(row.date)}
          {year === THIS_YEAR ? null : (
            <span className="text-faint ml-1">{`’${String(year).slice(2)}`}</span>
          )}
        </span>
      </TableCell>

      <TableCell className={`${TD} w-full`}>
        <span className="inline-flex items-center gap-2">
          <Badge
            variant={row.type === 'DIVIDEND' ? 'cash' : 'neutral'}
            className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]"
          >
            {row.type}
          </Badge>
          {note ? (
            <span className="text-faint inline-flex items-center gap-1 text-[12px]">
              {note.includes('conversion') ? (
                <ArrowLeftRightIcon aria-hidden="true" className="size-3" />
              ) : null}
              {note}
            </span>
          ) : null}
          {row.pending ? (
            <Badge variant="cash" className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em]">
              PENDING
            </Badge>
          ) : null}
        </span>
      </TableCell>

      <TableCell className={`${TD} num text-muted-foreground text-[12px]`}>
        {row.currency}
      </TableCell>

      <TableCell className={`${TD} num text-right ${toneClass(signed)}`}>
        {fmtS(signed, row.currency)}
      </TableCell>
    </TableRow>
  )
}

export default function Wallet() {
  const { state, openCash } = useVantage()

  const { cashMYR, cashUSD, cashRM } = useMemo(() => portfolio(state), [state])
  const source = cashSource(state)
  const movements = useMemo(() => walletMovements(state), [state])
  // Pairing works off the cash ledger alone — a dividend is never half of an FX leg.
  const conversions = useMemo(() => conversionLabels(state.cash), [state.cash])
  const oldest = movements.length ? movements[movements.length - 1].date : null
  const hasFee = useMemo(() => movements.some(c => c.type === 'FEE'), [movements])
  const hasConversion = Object.keys(conversions).length > 0

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceCard label="Cash · MYR wallet" value={cashMYR} currency="MYR">
          Buying power for Bursa
        </BalanceCard>
        <BalanceCard label="Cash · USD wallet" value={cashUSD} currency="USD">
          ≈ {money(toRM(state, cashUSD, 'USD'), 'MYR')} · buying power for US
        </BalanceCard>
      </div>

      <p className="text-faint text-[11.5px] leading-relaxed">
        {source === 'broker' ? (
          <>
            Balances are moomoo&rsquo;s own account figures
            {state.lastSync ? `, as of the sync at ${dtfmt(state.lastSync)}` : ''}. The movements
            below are the ledger history, not the arithmetic behind the balance: moomoo files the
            cash leg of every buy and sell separately and leaves trade fees out altogether, so
            these rows will never sum to the figures above.
          </>
        ) : (
          <>
            No broker sync yet, so these balances are computed here from the movements below plus
            the cash leg of every trade. Run the OpenD sync for moomoo&rsquo;s own figure.
            {cashMYR < 0 || cashUSD < 0
              ? ' A negative wallet usually means a deposit was never recorded.'
              : ''}
          </>
        )}{' '}
        Together ≈ <span className="num">{money(cashRM, 'MYR')}</span> at 1 USD ={' '}
        <span className="num">RM {(Number(state.fx) || 0).toFixed(2)}</span>.
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="num text-[15px] font-semibold">Cash movements</h2>
        {movements.length ? (
          <span className="text-faint text-[11.5px]">
            <span className="num">{movements.length}</span> since{' '}
            <span className="num">{dfmtLong(oldest)}</span>
          </span>
        ) : null}
        <div className="flex-1" />
        <Button size="sm" onClick={() => openCash()}>
          <PlusIcon />
          Add movement
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {movements.length ? (
          <div className="max-h-[calc(100svh-24rem)] overflow-auto overscroll-contain">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Date
                  </th>
                  <th scope="col" className={`${TH} w-full`}>
                    Type
                  </th>
                  <th scope="col" className={TH}>
                    Currency
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Amount
                  </th>
                </tr>
              </thead>
              <TableBody>
                {movements.map(row => (
                  <MovementRow key={row.key} row={row} note={noteFor(row, conversions)} />
                ))}
              </TableBody>
            </table>
          </div>
        ) : (
          <div className="text-muted-foreground px-4 py-12 text-center text-[13.5px]">
            Record your first deposit to start tracking cash.
          </div>
        )}
      </Card>

      {movements.length > 0 && (hasFee || hasConversion) ? (
        <p className="text-faint text-[11.5px] leading-relaxed">
          {hasFee
            ? 'A FEE row is the 30% FATCA withholding tax moomoo deducts from a US dividend. '
            : ''}
          {hasConversion
            ? 'A withdrawal and a deposit in different currencies on the same day are shown as a conversion — that money moved between your two wallets, it did not leave the account.'
            : ''}
        </p>
      ) : null}
    </div>
  )
}
