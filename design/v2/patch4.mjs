import fs from 'fs';
const root = 'c:/Users/assya/OneDrive/Desktop/project/vantage/web/src/';

/* ── shell: full bleed, so the dashboard is not narrower than its own nav ── */
{
  const p = root + 'App.jsx';
  let s = fs.readFileSync(p, 'utf8');
  const a = '<div className="mx-auto max-w-[1180px] px-5">';
  const b = '<div className="w-full px-[clamp(14px,2.4vw,28px)]">';
  const c = '<main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pt-5 pb-20">';
  const d = '<main className="w-full flex-1 px-[clamp(14px,2.4vw,28px)] pt-5 pb-20">';
  if (!s.includes(a) || !s.includes(c)) { console.error('MISS shell'); process.exit(1); }
  s = s.replace(a, b).replace(c, d);
  fs.writeFileSync(p, s, 'utf8');
  console.log('App.jsx: shell is full-bleed');
}

/* ── dashboard ────────────────────────────────────────────────────────── */
const p = root + 'screens/Dashboard.jsx';
let s = fs.readFileSync(p, 'utf8');

// ReferenceArea marks the projected month; fundMetricsFor gives a real premium
// to NAV, which is the honest stand-in for a day change we cannot compute.
if (!s.includes('  ReferenceArea,')) {
  s = s.replace('  Pie,\n', '  Pie,\n  ReferenceArea,\n');
}
s = s.replace(`  equitySeries,
  goalProgress,`, `  equitySeries,
  fundMetricsFor,
  goalProgress,`);
s = s.replace(`  portfolio,
  slotColor,
} from '@/lib/calc'`, `  portfolio,
  positions,
  slotColor,
  slotOf,
} from '@/lib/calc'`);

// Replace the old card-bound hero with the full-bleed treatment.
const heroStart = s.indexOf('/**\n * The month\'s income: what has landed');
const heroEnd = s.indexOf('export default function Dashboard() {');
if (heroStart < 0 || heroEnd < 0) { console.error('MISS hero bounds'); process.exit(1); }

const NEW = `/**
 * The price strip under the nav.
 *
 * NOT a day change — the app stores one price per instrument and no prior
 * close, so a daily percentage would have to be invented. What it shows instead
 * is real and, for funds like these, more use: how far the market price sits
 * from what the fund actually holds per unit.
 */
function Ticker({ rows, lastSync, fx }) {
  if (!rows.length) return null
  return (
    <div className="border-hairline flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-[clamp(14px,2.4vw,28px)] py-2">
      {rows.map(r => (
        <span key={r.ticker} className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="size-[6px] shrink-0 rounded-full"
            style={{ background: slotColor(r.slot) }}
          />
          <span className="num text-muted-foreground text-[11px]">
            {r.ticker} {fmtBare(r.price)}
          </span>
          {r.premium == null ? null : (
            <span className={\`num text-[11px] \${r.premium > 0 ? 'text-loss' : 'text-gain'}\`}>
              {pctS(r.premium)} vs NAV
            </span>
          )}
        </span>
      ))}
      <span className="text-faint num text-[11px] whitespace-nowrap">
        synced {lastSync} · 1 USD = RM {fx.toFixed(2)}
      </span>
    </div>
  )
}

/** One cell of the full-bleed figures row along the bottom of the fold. */
function Cell({ label, value, valueClass = '', sub, subClass = 'text-faint' }) {
  return (
    <div className="border-hairline flex-1 border-r px-[clamp(14px,2.4vw,28px)] py-4 last:border-r-0">
      <div className="eyebrow">{label}</div>
      <div className={\`num mt-2 text-[clamp(19px,2vw,25px)] font-semibold tracking-[-0.02em] \${valueClass}\`}>
        {value}
      </div>
      <div className={\`mt-1 text-[11.5px] \${subClass}\`}>{sub}</div>
    </div>
  )
}

/**
 * The month's income: what has landed, and what the funds' own rhythm says is
 * still to come — with the three figures that give it a scale down the side.
 *
 * The forward half is an ESTIMATE and the block never lets that blur: the bar
 * hatches the unpaid portion, the sub-line says in words how much has really
 * arrived, and the run rate is amber because it extrapolates per-share rates
 * that are currently falling. See incomeOutlook() for how the dates are found.
 */
function IncomeHero({ outlook, monthLabel, receivedToDate, monthsPaid, best, runRate }) {
  const received = outlook.received
  const total = received + outlook.estimated
  if (!total && !receivedToDate) return null
  const paidPct = total ? (received / total) * 100 : 0
  const whole = Math.floor(total)
  const cents = (total - whole).toFixed(2).slice(1)

  return (
    <div className="border-hairline flex flex-wrap items-start justify-between gap-x-10 gap-y-7 border-b px-[clamp(14px,2.4vw,28px)] pt-[clamp(22px,3.4vw,38px)] pb-[clamp(18px,2.6vw,28px)]">
      <div className="min-w-[300px] flex-1">
        <div className="eyebrow">Income this month · {monthLabel}</div>

        <div className="num mt-3 text-[clamp(44px,7.4vw,92px)] leading-[0.92] font-semibold tracking-[-0.045em]">
          {fmt(whole, 'MYR')}
          <span className="text-faint">{cents}</span>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-[13px]">
          <span className="text-muted-foreground">
            estimated across {outlook.dates.length} payout date{outlook.dates.length === 1 ? '' : 's'} ·{' '}
            {received > 0 ? (
              <>
                <b className="num text-gain font-semibold">{fmt(received, 'MYR')}</b> landed so far
              </>
            ) : (
              'no amounts declared yet'
            )}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="cash" className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                net of withholding
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]">
              Dates come from each fund's own declaration rhythm and are reliable. Amounts are the average of
              recent payments, after the 30% withheld — and per-share rates have been falling, so read this as a
              direction rather than a figure to spend against.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-5 max-w-[560px]">
          <div className="bg-muted flex h-3 overflow-hidden rounded-full">
            <div className="bg-gain" style={{ width: \`\${paidPct}%\` }} />
            <div
              className="flex-1"
              style={{ background: 'repeating-linear-gradient(115deg, var(--gain) 0 6px, transparent 6px 13px)', opacity: 0.42 }}
            />
          </div>
          <div className="num text-faint mt-2 flex justify-between text-[10.5px] tracking-[0.06em] uppercase">
            <span>received {fmt(received, 'MYR')}</span>
            <span>estimated {fmt(outlook.estimated, 'MYR')}</span>
          </div>
        </div>

        {outlook.dates.length > 0 && (
          <div className="border-hairline mt-6 flex flex-wrap overflow-hidden rounded-md border">
            {outlook.dates.map((d, i) => (
              <div
                key={d.date}
                className="border-hairline min-w-[128px] flex-1 border-r px-4 py-3 last:border-r-0"
                style={i === 0 ? { borderTop: '2px solid var(--primary)' } : undefined}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="eyebrow">{dfmt(d.date)}</span>
                  {i === 0 ? <span className="text-primary text-[9px] font-semibold tracking-[0.07em] uppercase">next up</span> : null}
                </div>
                <div className={\`num mt-1.5 text-[17px] font-semibold \${i === 0 ? 'text-gain' : ''}\`}>
                  ≈ {fmt(d.total, 'MYR')}
                </div>
                <div className="text-faint mt-1 text-[10.5px]">{d.parts.map(x => x.ticker).join(' + ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-[190px] flex-col gap-6 pt-1">
        <div>
          <div className="eyebrow">Received to date</div>
          <div className="num mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">{fmt(receivedToDate, 'MYR')}</div>
          <div className="text-faint mt-1 text-[11.5px]">
            {monthsPaid} month{monthsPaid === 1 ? '' : 's'} paid
          </div>
        </div>
        {best ? (
          <div>
            <div className="eyebrow">Best month</div>
            <div className="num text-gain mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">
              {fmt(best.net, 'MYR')}
            </div>
            <div className="text-faint mt-1 text-[11.5px]">{best.label}</div>
          </div>
        ) : null}
        <div>
          <div className="eyebrow">Run rate</div>
          <div className="num text-cash mt-1.5 text-[25px] font-semibold tracking-[-0.02em]">
            {fmt(runRate, 'MYR')}
            <span className="text-faint text-[15px]">/yr</span>
          </div>
          <div className="text-faint mt-1 text-[11.5px]">if per-share rates hold — they are falling</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Net income by month, edge to edge, with the projected month hatched off.
 *
 * This replaces the old dividend bar card rather than sitting beside it: same
 * data, same tooltip, but as the shape of the income stream instead of nine
 * separate columns. The hatch and the dashed segment mark where fact stops.
 */
function IncomeCurve({ months, projected, monthLabel }) {
  if (!months.length) return null
  const data = months.map((m, i) => ({
    ...m,
    actual: m.net,
    projected: i === months.length - 1 ? m.net : null,
  }))
  if (projected > 0) data.push({ label: monthLabel.slice(0, 3), net: projected, tax: 0, byTicker: {}, projected, actual: null })

  return (
    <div className="border-hairline border-b">
      <ResponsiveContainer width="100%" height={224}>
        <AreaChart data={data} margin={{ top: 18, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gain)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--gain)" stopOpacity={0} />
            </linearGradient>
            <pattern id="incHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--gain)" strokeWidth="1.4" strokeOpacity="0.28" />
            </pattern>
          </defs>
          <CartesianGrid horizontal vertical={false} stroke="var(--hairline)" strokeDasharray="2 5" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
          <YAxis
            width={62}
            orientation="left"
            mirror
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--faint)', fontSize: 10 }}
            tickFormatter={v => fmtCompact(v, 'MYR')}
          />
          <ChartTooltip content={<DividendTooltip />} cursor={{ stroke: 'var(--border)' }} />
          {projected > 0 && <ReferenceArea x1={months[months.length - 1].label} fill="url(#incHatch)" fillOpacity={1} />}
          <Area type="linear" dataKey="actual" stroke="var(--gain)" strokeWidth={2.5} fill="url(#incFill)" connectNulls={false} dot={false} />
          <Area type="linear" dataKey="projected" stroke="var(--gain)" strokeWidth={2} strokeDasharray="4 5" strokeOpacity={0.65} fill="none" connectNulls dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Dashboard() {`;

s = s.slice(0, heroStart) + NEW + s.slice(heroEnd + 'export default function Dashboard() {'.length);

// Rebuild the body in the order the design lays it out.
const bodyStart = s.indexOf('  const monthLabel = now.toLocaleDateString');
if (bodyStart < 0) { console.error('MISS body'); process.exit(1); }

s = s.slice(0, bodyStart) + `  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long' })
  const best = divMonths.length ? divMonths.reduce((a, b) => (b.net > a.net ? b : a)) : null
  const runRate = (outlook.received + outlook.estimated) * 12
  const ticker = positions(state).map(q => {
    const m = fundMetricsFor(state, q.t)
    return { ticker: q.t, price: q.px, premium: m ? m.premium : null, slot: slotOf(state, q.t) }
  })

  return (
    <>
      {/* Edge to edge: the shell's padding is re-applied per block, so the
          hairlines run the full width the way they do in the design. */}
      <div className="-mx-[clamp(14px,2.4vw,28px)] -mt-5">
        <Ticker rows={ticker} lastSync={state.lastSync ? dtfmt(state.lastSync) : 'never'} fx={fx} />

        <IncomeHero
          outlook={outlook}
          monthLabel={monthLabel}
          receivedToDate={p.divNetRM}
          monthsPaid={divMonths.length}
          best={best}
          runRate={runRate}
        />

        <IncomeCurve months={divMonths} projected={outlook.estimated} monthLabel={monthLabel} />

        <div className="border-hairline flex flex-wrap border-b">
          <Cell
            label="Portfolio value"
            value={fmt(p.totalRM, 'MYR')}
            sub={\`1 USD = RM \${fx.toFixed(2)}\`}
            subClass="num text-faint"
          />
          <Cell
            label={basis === 'price' ? 'Unrealized P&L' : \`P&L · \${PNL_BASIS_LABEL[basis].toLowerCase()}\`}
            value={fmtS(p.pnlRM, 'MYR')}
            valueClass={toneClass(p.pnlRM)}
            sub={\`\${p.costRM ? pctS(p.pnlPct) : '—'} on cost\`}
            subClass={\`num \${toneClass(p.pnlRM)}\`}
          />
          <Cell
            label="Invested"
            value={fmt(p.invRM, 'MYR')}
            sub={\`\${p.pos.length} position\${p.pos.length === 1 ? '' : 's'}\`}
          />
          <Cell
            label="Idle cash"
            value={fmt(p.cashRM, 'MYR')}
            valueClass={p.cashRM < 0 ? 'text-loss' : 'text-cash'}
            sub={
              p.cashRM < 0
                ? 'Negative? Record your deposits in Wallet'
                : \`MYR \${fmtBare(p.cashMYR)} · USD \${fmtBare(p.cashUSD)}\`
            }
            subClass={p.cashRM < 0 ? 'text-faint' : 'num text-faint'}
          />
        </div>
      </div>

      <div className="grid gap-3.5 pt-5">
        <TwoTruths income={p.divNetRM} priceLoss={p.pricePnlRM} />

        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <EquityCard series={series} />
          <AllocationCard parts={parts} />
        </div>

        {goals.length > 0 && (
          <>
            <h2 className="num mt-3 text-[17px] font-semibold">Goals in progress</h2>
            <div className="grid gap-3.5 md:grid-cols-2">
              {goals.map(({ goal, progress }) => (
                <GoalCard key={goal.id ?? goal.ticker} goal={goal} progress={progress} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
`;

fs.writeFileSync(p, s, 'utf8');
console.log('Dashboard.jsx: ticker, full-bleed hero + rail, income curve, figures row');
