import fs from 'fs';
const p = 'c:/Users/assya/OneDrive/Desktop/project/vantage/web/src/screens/Dashboard.jsx';
let s = fs.readFileSync(p, 'utf8');
const hits = [];
function rep(label, a, b) {
  if (!s.includes(a)) { console.error('MISS: ' + label); process.exit(1); }
  s = s.replace(a, b); hits.push(label);
}

rep('imports', `import {
  PNL_BASIS_LABEL,
  allocation,
  cashSource,
  dividendMonths,
  equitySeries,
  goalProgress,
  pnlBasis,
  portfolio,
} from '@/lib/calc'`,
`import {
  PNL_BASIS_LABEL,
  allocation,
  cashSource,
  dividendMonths,
  equitySeries,
  goalProgress,
  incomeOutlook,
  pnlBasis,
  portfolio,
  slotColor,
} from '@/lib/calc'`);

rep('header-doc', ` * Cash deliberately comes from portfolio(), which prefers the broker's own
 * figure: moomoo's cash-flow ledger omits trade fees, so summing movements
 * never reconciles. When no sync has run the figures are locally derived and
 * the Cash card says so, quietly.
 */`,
` * Cash deliberately comes from portfolio(), which prefers the broker's own
 * figure: moomoo's cash-flow ledger omits trade fees, so summing movements
 * never reconciles. When no sync has run the figures are locally derived and
 * the Cash card says so, quietly.
 *
 * The screen opens on INCOME, not on portfolio value. These holdings are bought
 * for what they pay: price is down 21.6% while they have paid out RM 5,033 net,
 * and a dashboard led by the value card tells the wrong story every morning.
 * The loss is not hidden for it — TwoTruths puts both figures side by side, and
 * the stat row below carries the same P&L it always did.
 */`);

const HERO = `/**
 * The month's income: what has landed, and what the funds' own rhythm says is
 * still to come.
 *
 * The forward half is an ESTIMATE and the card never lets that blur — the bar
 * hatches the unpaid portion and the subline says in words how much has really
 * arrived. See incomeOutlook(): dates come from each fund's real cadence, but
 * amounts are averages of recent payments and per-share rates are falling, so
 * this figure reads high more often than low.
 */
function IncomeHero({ outlook, received, monthLabel }) {
  const total = received + outlook.estimated
  if (!total) return null
  const paidPct = total ? (received / total) * 100 : 0
  const dates = outlook.dates.slice(0, 6)

  return (
    <Card className="gap-0 py-5">
      <CardContent className="px-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-[280px] flex-1">
            <div className="eyebrow">Income this month · {monthLabel}</div>
            <div className="num mt-2.5 text-[clamp(38px,6vw,64px)] leading-[0.95] font-semibold tracking-[-0.035em]">
              {fmt(total, 'MYR')}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
              <span className="text-muted-foreground">
                <b className="num text-gain font-semibold">{fmt(received, 'MYR')}</b> received ·{' '}
                <b className="num text-foreground font-semibold">{fmt(outlook.estimated, 'MYR')}</b> still expected
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="cash" className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                    estimated
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  Dates come from each fund's own declaration rhythm and are reliable. Amounts are the average of
                  recent payments — these funds declare weekly, and their per-share rates have been falling, so
                  treat this as a direction rather than a figure to spend against.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="mt-4 max-w-[520px]">
              <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                <div className="bg-gain" style={{ width: \`\${paidPct}%\` }} />
                <div
                  className="flex-1"
                  style={{
                    background:
                      'repeating-linear-gradient(115deg, var(--gain) 0 5px, transparent 5px 11px)',
                    opacity: 0.4,
                  }}
                />
              </div>
            </div>
          </div>

          {dates.length > 0 && (
            <div className="border-hairline flex flex-wrap overflow-hidden rounded-md border">
              {dates.map(d => (
                <div key={d.date} className="border-hairline min-w-[112px] flex-1 border-r px-3.5 py-2.5 last:border-r-0">
                  <div className="eyebrow">{dfmt(d.date)}</div>
                  <div className="num mt-1 text-[15px] font-semibold">≈ {fmt(d.total, 'MYR')}</div>
                  <div className="mt-1 flex items-center gap-1">
                    {d.parts.map(part => (
                      <span
                        key={part.ticker}
                        aria-hidden="true"
                        className="size-[6px] shrink-0 rounded-full"
                        style={{ background: slotColor(part.slot) }}
                      />
                    ))}
                    <span className="text-faint ml-0.5 text-[10.5px]">
                      {d.parts.map(x => x.ticker).join(' + ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Both facts at once: what the holdings have paid, against what they have lost
 * on price. A dashboard that leads with income owes the reader this card — it
 * is the one place the drawdown is stated in full, unsoftened by distributions.
 */
function TwoTruths({ income, priceLoss }) {
  if (!income && !priceLoss) return null
  const covered = priceLoss < 0 ? Math.min((income / Math.abs(priceLoss)) * 100, 100) : 100
  const scale = Math.max(income, Math.abs(priceLoss)) || 1

  return (
    <Card className="gap-3">
      <CardHeader className="px-4">
        <span className="eyebrow">Paid out, against paid for</span>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        <div className="grid gap-2.5">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-[92px] shrink-0 text-[12px]">Distributions</span>
            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <div className="bg-gain h-2" style={{ width: \`\${(income / scale) * 100}%\` }} />
            </div>
            <span className="num text-gain w-[104px] shrink-0 text-right text-[12.5px] font-semibold">
              {fmtS(income, 'MYR')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-[92px] shrink-0 text-[12px]">Price change</span>
            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <div className="bg-loss h-2" style={{ width: \`\${(Math.abs(priceLoss) / scale) * 100}%\` }} />
            </div>
            <span className="num text-loss w-[104px] shrink-0 text-right text-[12.5px] font-semibold">
              {fmtS(priceLoss, 'MYR')}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          Income has covered <b className="num text-foreground font-semibold">{pct0(covered)}</b> of the price
          decline so far. You are being paid well; the capital is still falling faster than the income replaces it.
          Both of these are true and the app shows you the one you asked for in Settings.
        </p>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {`;

rep('components', 'export default function Dashboard() {', HERO);

rep('hooks', `  const divMonths = useMemo(() => dividendMonths(state), [state])`,
`  const divMonths = useMemo(() => dividendMonths(state), [state])
  const now = useMemo(() => new Date(), [])
  const outlook = useMemo(() => incomeOutlook(state, now.getFullYear(), now.getMonth()), [state, now])`);

rep('render', `  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">`,
`  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long' })

  return (
    <div className="grid gap-3.5">
      <IncomeHero outlook={outlook} received={outlook.received} monthLabel={monthLabel} />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">`);

rep('truths', `      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <EquityCard series={series} />
        <AllocationCard parts={parts} />
      </div>`,
`      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <EquityCard series={series} />
        <AllocationCard parts={parts} />
      </div>

      <TwoTruths income={p.divNetRM} priceLoss={p.pricePnlRM} />`);

fs.writeFileSync(p, s, 'utf8');
console.log('Dashboard.jsx: ' + hits.join(', '));
