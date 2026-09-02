/**
 * Goals — accumulation targets, one card per goal.
 *
 * Two families:
 *
 *   SHARES        "1,000 shares of ETCO" — progress is what you hold against the
 *                 target, and the capital that costs at the current price.
 *   INCOME_*      a dividend target: all-time, this calendar year, or a monthly
 *                 run rate. Scope is per holding or the whole portfolio.
 *
 * Currency is the trap here, and the two families resolve it differently. A share
 * goal's price and capital are in the instrument's own currency (ETCO trades in
 * USD) while its monthly budget is RM, so goalProgress() converts before dividing.
 * Income targets are ALWAYS RM, so that a portfolio-wide goal and a per-holding
 * one can be compared with each other. Every figure says which it is.
 *
 * Whether income counts gross or net follows the P&L basis in Settings, falling
 * back to net — see goalIncomeIsNet(). The cards say which is in force, because
 * the same goal reads ~30% further along under one than the other.
 */

import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import {
  GOAL_KIND,
  GOAL_NEEDS_INSTRUMENT,
  INCOME_RATE_MONTHS,
  PAYMENTS_AVERAGED,
  goalFunding,
  goalIncomeIsNet,
  goalProgress,
  instr,
  toRM,
} from '@/lib/calc'
import { fmt, fq, pct0 } from '@/lib/format'
import { useVantage } from '@/lib/store'

/** Sentinel for "no instrument" in the scope select — Radix rejects ''. */
const WHOLE = '__whole__'

const KIND_OPTIONS = [
  { id: GOAL_KIND.SHARES, label: 'Shares held', hint: 'Accumulate a number of shares' },
  { id: GOAL_KIND.INCOME_TOTAL, label: 'Total dividends', hint: 'All-time income received' },
  { id: GOAL_KIND.INCOME_YEAR, label: 'Dividends this year', hint: 'Resets each January' },
  { id: GOAL_KIND.INCOME_MONTHLY, label: 'Monthly income', hint: `Average of the last ${INCOME_RATE_MONTHS} months` },
  {
    id: GOAL_KIND.INCOME_PER_PAYMENT,
    label: 'Per dividend payment',
    hint: `Average of the last ${PAYMENTS_AVERAGED} payments`,
  },
]

const isIncome = kind => kind && kind !== GOAL_KIND.SHARES

/**
 * A number field that writes on commit, not on keystroke — legacy used the DOM
 * `onchange` event, so a value is saved when the field is left or Enter is hit.
 * `onCommit` returns false when the value is rejected or the write fails, and
 * the field snaps back to what the server still holds.
 */
function InlineNumber({ id, label, value, placeholder, min, step, width = 'w-[150px]', onCommit }) {
  const [draft, setDraft] = useState(value ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commit = async () => {
    const next = String(draft).trim()
    if (next === String(value ?? '')) return
    setBusy(true)
    const ok = await onCommit(next)
    setBusy(false)
    if (!ok) setDraft(value ?? '')
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="eyebrow">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        className={`num h-8 ${width}`}
        min={min}
        step={step}
        placeholder={placeholder}
        value={draft}
        disabled={busy}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(value ?? '')
        }}
      />
    </div>
  )
}

function Fact({ children }) {
  return <span className="text-muted-foreground">{children}</span>
}

function RemoveButton({ label, onClick }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          <XIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Remove goal</TooltipContent>
    </Tooltip>
  )
}

/* ── shares ───────────────────────────────────────────────────────────────── */

/**
 * What the goals claim, against what the month actually has.
 *
 * Hidden entirely until income exists: with none recorded, uncommitted is
 * negative because nothing has been entered, and every goal would appear to
 * overshoot a pool that was never filled.
 */
/**
 * Which account a goal is measured against.
 *
 * Every goal is a moomoo one today — shares of a holding, or dividends from the
 * portfolio — so this reads as uniform. It is here rather than waiting because
 * an ASSET_BALANCE goal (RM 300,000 in ASB) is the obvious next kind, and an
 * untagged list would then be genuinely ambiguous: nothing on a card otherwise
 * says whether "5,000 shares" lives at the broker or somewhere else.
 *
 * Quiet on purpose, for the same reason as History: a badge on every row is
 * provenance, not emphasis.
 */
function SourceTag() {
  return (
    <Badge variant="neutral" className="px-1.5 py-0 text-[10px] font-semibold tracking-[0.08em] uppercase">
      moomoo
    </Badge>
  )
}

function BudgetCheck({ funding }) {
  if (!funding.meaningful || !funding.claimedRM) return null
  const over = funding.overclaimedRM > 0

  return (
    <Card className="gap-3">
      <CardContent className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-[260px]">
            <div className="flex items-center gap-2">
              <span className="eyebrow">Claimed each month</span>
              {over ? (
                <Badge variant="loss" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  over by {fmt(funding.overclaimedRM, 'MYR')}
                </Badge>
              ) : (
                <Badge variant="gain" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  all funded
                </Badge>
              )}
            </div>
            <div className="stat mt-2">{fmt(funding.claimedRM, 'MYR')}</div>
            <p className="text-muted-foreground mt-1.5 text-[12.5px]">
              against <b className="num text-foreground font-semibold">{fmt(funding.uncommittedRM, 'MYR')}</b>{' '}
              uncommitted
              {over ? (
                <>
                  {' '}&mdash; the money runs out inside the last goal below, and it says so rather than
                  every target being quietly shaved.
                </>
              ) : funding.spareRM > 0 ? (
                <>
                  . <span className="num">{fmt(funding.spareRM, 'MYR')}</span> is spare, before
                  anything you actually live on.
                </>
              ) : null}
            </p>
          </div>

          <div className="min-w-[240px] flex-1">
            <div className="bg-muted flex h-3 overflow-hidden rounded-full">
              {funding.rows
                .filter(r => r.claimed > 0)
                .map(r => (
                  <div
                    key={r.goal.id}
                    className="h-3"
                    title={`${r.goal.ticker || 'goal'} · ${fmt(r.claimed, 'MYR')}`}
                    style={{
                      width: `${(r.claimed / Math.max(funding.claimedRM, funding.uncommittedRM)) * 100}%`,
                      background: r.shortfall > 0 ? 'var(--loss)' : 'var(--chart-4)',
                      opacity: r.shortfall > 0 ? 0.85 : 1,
                    }}
                  />
                ))}
            </div>
            <div className="num text-faint mt-2 flex justify-between text-[10.5px] tracking-[0.06em] uppercase">
              <span>{fmt(funding.incomeRM, 'MYR')} in</span>
              <span>{fmt(funding.committedRM, 'MYR')} committed</span>
              <span className={over ? 'text-loss' : ''}>
                {over ? `${fmt(funding.overclaimedRM, 'MYR')} short` : `${fmt(funding.spareRM, 'MYR')} spare`}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The reprojection: what a goal's own budget promises, against what the month can
 * actually give it. Rendered only when those differ, so a fully-funded goal says
 * nothing extra.
 */
function Shortfall({ row, needRM }) {
  if (!row || row.shortfall <= 0) return null
  const asked = row.claimed ? Math.ceil(needRM / row.claimed) : null
  const real = row.funded > 0 ? Math.ceil(needRM / row.funded) : null

  return (
    <div className="border-loss mt-1 border-l-2 pl-3">
      <p className="text-[12.5px] leading-relaxed">
        Only <b className="num text-loss font-semibold">{fmt(row.funded, 'MYR')}</b> of the{' '}
        <b className="num font-semibold">{fmt(row.claimed, 'MYR')}</b> you asked for is left once the
        goals above are funded.
        {asked && real ? (
          <>
            {' '}That is <b className="num font-semibold">{real}</b>{' '}
            {real === 1 ? 'month' : 'months'} rather than <b className="num font-semibold">{asked}</b>.
          </>
        ) : real === null ? (
          <> Nothing reaches it this month.</>
        ) : null}
      </p>
    </div>
  )
}

function SharesCard({ goal, funding }) {
  const { state, fx, updateGoal, deleteGoal } = useVantage()
  const { qty, remain, px, need, prog, months, cur } = goalProgress(state, goal)
  const i = instr(state, goal.ticker)
  const foreign = cur !== 'MYR'
  const needRM = toRM(state, need, cur)
  const row = funding && funding.meaningful ? funding.rows.find(r => r.goal.id === goal.id) : null

  const saveTarget = raw => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return false
    return updateGoal(goal.id, { target_qty: n })
  }

  const saveBudget = raw => {
    if (raw === '') return updateGoal(goal.id, { monthly_budget: null })
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return false
    return updateGoal(goal.id, { monthly_budget: n || null })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="num text-[16px]">
          {fq(goal.target_qty)} shares of {goal.ticker}
        </CardTitle>
        <CardDescription className="text-[12px]">
          {i?.name ? `${i.name} · ` : ''}
          {i?.market ? `${i.market} · ` : ''}
          priced in {cur}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <SourceTag />
          <Badge variant={prog >= 100 ? 'gain' : 'cash'} className="num">
            {pct0(prog)} there
          </Badge>
          <RemoveButton label={`Remove the ${goal.ticker} goal`} onClick={() => deleteGoal(goal.id)} />
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-3">
        <Progress value={prog} aria-label={`${pct0(prog)} of the ${goal.ticker} target`} />

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-[13px]">
          <Fact>
            You hold <b className="num text-foreground font-semibold">{fq(qty)}</b>
          </Fact>
          <Fact>
            Still need <b className="num text-foreground font-semibold">{fq(remain)}</b>
          </Fact>
          {px ? (
            <Fact>
              @ <span className="num text-foreground">{fmt(px, cur)}</span> → capital{' '}
              <b className="num text-foreground font-semibold">{fmt(need, cur)}</b>
              {foreign ? <span className="num text-faint"> ≈ {fmt(needRM, 'MYR')}</span> : null}
            </Fact>
          ) : (
            <b className="text-cash font-semibold">no price yet — hit ↻ Prices</b>
          )}
        </div>

        <Separator className="bg-hairline" />

        <div className="flex flex-wrap items-end gap-3">
          <InlineNumber
            id={`goal-${goal.id}-target`}
            label="Target shares"
            value={goal.target_qty}
            min="1"
            step="1"
            width="w-[130px]"
            onCommit={saveTarget}
          />
          <InlineNumber
            id={`goal-${goal.id}-budget`}
            label="Monthly budget (RM)"
            value={goal.monthly_budget ?? ''}
            placeholder="—"
            min="0"
            step="10"
            width="w-[160px]"
            onCommit={saveBudget}
          />
        </div>

        {months ? (
          <p className="text-faint text-[12px]">
            At RM {fq(goal.monthly_budget)}/month ≈{' '}
            <b className="num text-muted-foreground font-semibold">
              {months} {months === 1 ? 'month' : 'months'}
            </b>{' '}
            to finish (assumes price stays put — it won&rsquo;t).
            {foreign ? (
              <>
                {' '}
                The budget is in RM and {goal.ticker} trades in {cur} — the {fmt(need, cur)} still
                needed converts to {fmt(needRM, 'MYR')} at RM {Number(fx).toFixed(2)} per 1 {cur}.
              </>
            ) : null}
          </p>
        ) : null}
        <Shortfall row={row} needRM={needRM} />
      </CardContent>
    </Card>
  )
}

/* ── income ───────────────────────────────────────────────────────────────── */

/** "RM 12,000 in 2026", "RM 2,000 a month", "RM 200 per payment", "RM 10,000 of dividends". */
function incomeTitle(goal) {
  const amount = fmt(goal.target_amount || 0, 'MYR')
  if (goal.kind === GOAL_KIND.INCOME_MONTHLY) return `${amount} a month`
  if (goal.kind === GOAL_KIND.INCOME_PER_PAYMENT) return `${amount} per payment`
  if (goal.kind === GOAL_KIND.INCOME_YEAR) return `${amount} in ${new Date().getFullYear()}`
  return `${amount} of dividends`
}

function IncomeCard({ goal }) {
  const { state, updateGoal, deleteGoal } = useVantage()
  const { current, remain, prog, rate, months, net, qty, perShare, sharesNeeded, capital, capitalRM, px, priceCur } =
    goalProgress(state, goal)
  const monthly = goal.kind === GOAL_KIND.INCOME_MONTHLY
  const perPayment = goal.kind === GOAL_KIND.INCOME_PER_PAYMENT
  // Both of these are rates, not running totals: reached by holding more.
  const isRate = monthly || perPayment
  const scope = goal.ticker ? goal.ticker : 'all holdings'

  const saveTarget = raw => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return false
    return updateGoal(goal.id, { target_amount: n })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="num text-[16px]">{incomeTitle(goal)}</CardTitle>
        <CardDescription className="text-[12px]">
          {goal.ticker ? `From ${goal.ticker}` : 'Across all holdings'} ·{' '}
          {net ? 'after withholding tax' : 'before tax, as declared'}
          {monthly ? ` · averaged over the last ${INCOME_RATE_MONTHS} months` : ''}
          {perPayment ? ` · averaged over the last ${PAYMENTS_AVERAGED} payments` : ''}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <SourceTag />
          <Badge variant={prog >= 100 ? 'gain' : 'cash'} className="num">
            {pct0(prog)} there
          </Badge>
          <RemoveButton label={`Remove the ${scope} income goal`} onClick={() => deleteGoal(goal.id)} />
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-3">
        <Progress value={prog} aria-label={`${pct0(prog)} of the income target`} />

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-[13px]">
          <Fact>
            {perPayment ? 'Averaging' : monthly ? 'Earning now' : 'Received'}{' '}
            <b className="num text-gain font-semibold">{fmt(current, 'MYR')}</b>
          </Fact>
          <Fact>
            Still need <b className="num text-foreground font-semibold">{fmt(remain, 'MYR')}</b>
            {monthly ? ' a month' : perPayment ? ' per payment' : ''}
          </Fact>
          {perPayment && sharesNeeded > 0 ? (
            <Fact>
              Buy <b className="num text-foreground font-semibold">{fq(Math.ceil(sharesNeeded))}</b> more →
              capital{' '}
              {px ? (
                <>
                  <b className="num text-foreground font-semibold">{fmt(capital, priceCur)}</b>
                  {priceCur === 'MYR' ? null : (
                    <span className="num text-faint"> ≈ {fmt(capitalRM, 'MYR')}</span>
                  )}
                </>
              ) : (
                <b className="text-cash font-semibold">no price yet — hit ↻ Prices</b>
              )}
            </Fact>
          ) : null}
          {isRate ? null : (
            <Fact>
              at <span className="num text-foreground">{fmt(rate, 'MYR')}</span>/month
            </Fact>
          )}
        </div>

        <Separator className="bg-hairline" />

        <InlineNumber
          id={`goal-${goal.id}-amount`}
          label={monthly ? 'Target per month (RM)' : perPayment ? 'Target per payment (RM)' : 'Target (RM)'}
          value={goal.target_amount ?? ''}
          min="1"
          step="100"
          width="w-[160px]"
          onCommit={saveTarget}
        />

        {months ? (
          <p className="text-faint text-[12px]">
            At the current {fmt(rate, 'MYR')}/month ≈{' '}
            <b className="num text-muted-foreground font-semibold">
              {months} {months === 1 ? 'month' : 'months'}
            </b>{' '}
            to go — and that rate rises as you buy more, so this is the pessimistic reading.
          </p>
        ) : null}
        {perPayment && remain > 0 ? (
          <p className="text-faint text-[12px]">
            Your last {PAYMENTS_AVERAGED} {goal.ticker} payments averaged{' '}
            <b className="num text-muted-foreground font-semibold">{fmt(current, 'MYR')}</b> on {fq(qty)} shares —
            about <span className="num">{fmt(perShare, 'MYR')}</span> per share each time. Reaching{' '}
            {fmt(goal.target_amount || 0, 'MYR')} needs roughly{' '}
            <b className="num text-muted-foreground font-semibold">{fq(Math.ceil(sharesNeeded))}</b> more shares.
            That assumes the fund keeps paying at the same rate per share, which is the shaky part — {goal.ticker}
            &rsquo;s payout has been moving, so treat this as a direction, not a promise.
          </p>
        ) : monthly && remain > 0 ? (
          <p className="text-faint text-[12px]">
            Your last {INCOME_RATE_MONTHS} months averaged {fmt(rate, 'MYR')}. This target is a rate, not a
            total, so it is reached by holding more — not by waiting.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ── new goal ─────────────────────────────────────────────────────────────── */

function NewGoalForm() {
  const { state, addGoal } = useVantage()
  const [kind, setKind] = useState(GOAL_KIND.SHARES)
  const [ticker, setTicker] = useState('')
  const [target, setTarget] = useState('500')
  const [amount, setAmount] = useState('1000')
  const [monthly, setMonthly] = useState('')
  const [busy, setBusy] = useState(false)

  const instruments = state.instruments
  const income = isIncome(kind)
  // Per-payment is per holding only: combined across holdings it would measure
  // which funds happened to pay that day rather than the portfolio.
  const needsInstrument = GOAL_NEEDS_INSTRUMENT.has(kind)
  const picked = needsInstrument
    ? ticker && ticker !== WHOLE
      ? ticker
      : instruments[0]?.ticker || ''
    : ticker || WHOLE
  const blocked = needsInstrument && !instruments.length

  const submit = async () => {
    if (blocked || busy) return
    setBusy(true)
    const ok = await addGoal(
      income
        ? {
            kind,
            ticker: picked === WHOLE ? undefined : picked,
            target_amount: Number(amount) || 0,
          }
        : {
            kind: GOAL_KIND.SHARES,
            ticker: picked,
            target_qty: Number(target) || 1,
            monthly_budget: monthly ? Number(monthly) : null,
          },
    )
    setBusy(false)
    if (ok) {
      setTarget('500')
      setAmount('1000')
      setMonthly('')
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="g-kind" className="eyebrow">
              Goal type
            </Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="g-kind" size="sm" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                    <span className="text-faint ml-1.5 text-[11px]">{o.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="g-t" className="eyebrow">
              {income ? 'Scope' : 'Instrument'}
            </Label>
            <Select value={picked} onValueChange={setTicker} disabled={blocked}>
              <SelectTrigger id="g-t" size="sm" className="w-[190px]">
                <SelectValue placeholder="No instruments yet" />
              </SelectTrigger>
              <SelectContent>
                {income && !needsInstrument ? <SelectItem value={WHOLE}>All holdings</SelectItem> : null}
                {instruments.map(i => (
                  <SelectItem key={i.ticker} value={i.ticker}>
                    {i.ticker}
                    <span className="text-faint ml-1">{i.currency}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {income ? (
            <div className="grid gap-1.5">
              <Label htmlFor="g-amount" className="eyebrow">
                {kind === GOAL_KIND.INCOME_MONTHLY
                  ? 'Target per month (RM)'
                  : kind === GOAL_KIND.INCOME_PER_PAYMENT
                    ? 'Target per payment (RM)'
                    : 'Target (RM)'}
              </Label>
              <Input
                id="g-amount"
                type="number"
                min="1"
                step="100"
                className="num h-8 w-[160px]"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="g-target" className="eyebrow">
                  Target shares
                </Label>
                <Input
                  id="g-target"
                  type="number"
                  min="1"
                  step="1"
                  className="num h-8 w-[130px]"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-monthly" className="eyebrow">
                  Monthly budget (RM)
                </Label>
                <Input
                  id="g-monthly"
                  type="number"
                  min="0"
                  step="10"
                  placeholder="optional"
                  className="num h-8 w-[160px]"
                  value={monthly}
                  onChange={e => setMonthly(e.target.value)}
                />
              </div>
            </>
          )}

          <Button size="sm" onClick={submit} disabled={busy || blocked}>
            <PlusIcon />
            Add goal
          </Button>
        </div>

        {blocked ? <p className="text-faint text-[12px]">Add an instrument first (top right).</p> : null}
        {income ? (
          <p className="text-faint text-[12px]">
            Income targets are in RM so every goal is comparable, and count{' '}
            {goalIncomeIsNet(state) ? 'what reached your wallet after tax' : 'dividends as declared, before tax'}{' '}
            — set by the P&amp;L basis in Settings.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Goals() {
  const { state } = useVantage()
  const funding = useMemo(() => goalFunding(state), [state])
  // Shares first, then income — they answer different questions and interleaving
  // them by id makes the list read as a jumble.
  const goals = useMemo(
    () => [...state.goals].sort((a, b) => Number(isIncome(a.kind)) - Number(isIncome(b.kind)) || a.id - b.id),
    [state.goals],
  )

  return (
    <div>
      <BudgetCheck funding={funding} />
      {goals.length ? (
        <div className="mt-3.5 grid gap-3.5">
          {goals.map(g =>
            isIncome(g.kind) ? (
              <IncomeCard key={g.id} goal={g} />
            ) : (
              <SharesCard key={g.id} goal={g} funding={funding} />
            ),
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-9 text-center">
            No goals yet — set one below, e.g. 1,000 shares of ETCO, or RM 1,000 a month of dividends.
          </CardContent>
        </Card>
      )}

      <h2 className="num mt-6 mb-3 text-[16px] font-semibold">New goal</h2>
      <NewGoalForm />
    </div>
  )
}
