import fs from 'fs';
const p = 'c:/Users/assya/OneDrive/Desktop/project/vantage/web/src/lib/calc.js';
let s = fs.readFileSync(p, 'utf8');

const anchor = `/** The figure a goal is measured against, in MYR. */
export function goalCurrent(S, g) {`;
if (!s.includes(anchor)) { console.error('MISS anchor'); process.exit(1); }

const ADD = `/** Declarations inspected when working out how often a fund pays. */
const CADENCE_SAMPLE = 6

/**
 * How many days a fund leaves between distributions, from its own declared
 * ex-dates — the median gap, so one irregular declaration cannot skew it.
 *
 * Returns 0 when there is not enough history to tell, which callers must read
 * as "do not project" rather than "pays daily".
 */
export function paymentCadenceDays(S, ticker) {
  const dates = distributionsFor(S, ticker)
    .slice(0, CADENCE_SAMPLE)
    .map(d => Date.parse(d.ex_date + 'T00:00:00Z'))
    .filter(Number.isFinite)
  if (dates.length < 3) return 0

  const gaps = []
  for (let i = 1; i < dates.length; i += 1) gaps.push(Math.round((dates[i - 1] - dates[i]) / 86400000))
  const usable = gaps.filter(g => g > 0).sort((a, b) => a - b)
  if (!usable.length) return 0
  return usable[Math.floor(usable.length / 2)]
}

/**
 * What a month is likely to pay, and on which days.
 *
 * This is the one forward-looking figure in the app, so it is built only from
 * things the broker actually told us: each fund's real cadence (median gap
 * between its own declared ex-dates), projected on from its latest declaration,
 * priced at the average of its recent payments to this account.
 *
 * It is an ESTIMATE and the caller must label it as one. These funds declare
 * weekly — the DATES are reliable, the AMOUNTS are not, and per-share rates
 * have been falling, so a month built this way reads high more often than low.
 *
 * Dates already past in the current month are dropped: they either paid (and
 * are in \`received\`) or did not, and projecting into the past helps nobody.
 *
 * @returns {{received: number, estimated: number, dates: Array, perTicker: object, isEstimate: boolean}}
 *          money in MYR, \`dates\` newest-last as {date, total, parts:[{ticker, amount, slot}]}
 */
export function incomeOutlook(S, year, monthIndex) {
  const net = goalIncomeIsNet(S)
  const pad = n => String(n + 1).padStart(2, '0')
  const from = \`\${year}-\${pad(monthIndex)}-01\`
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const to = \`\${year}-\${pad(monthIndex)}-\${String(last).padStart(2, '0')}\`

  const got = incomeIn(S, { from, to })
  const received = net ? got.net : got.gross

  // Only project beyond the last day that could already have paid.
  const today = new Date()
  const todayISO = \`\${today.getFullYear()}-\${String(today.getMonth() + 1).padStart(2, '0')}-\${String(today.getDate()).padStart(2, '0')}\`
  const after = todayISO > from ? todayISO : from

  const byDate = new Map()
  for (const p of positions(S)) {
    const step = paymentCadenceDays(S, p.t)
    const each = averagePayment(S, p.t, net)
    if (!step || !each) continue

    const declared = distributionsFor(S, p.t)
    if (!declared.length) continue
    let cursor = Date.parse(declared[0].ex_date + 'T00:00:00Z')
    const stop = Date.parse(to + 'T00:00:00Z')

    // Walk the fund's own rhythm forward, one cadence at a time.
    for (let guard = 0; guard < 40; guard += 1) {
      cursor += step * 86400000
      if (cursor > stop) break
      const iso = new Date(cursor).toISOString().slice(0, 10)
      if (iso <= after) continue
      if (!byDate.has(iso)) byDate.set(iso, { date: iso, total: 0, parts: [] })
      const slot = byDate.get(iso)
      slot.total += each
      slot.parts.push({ ticker: p.t, amount: each, slot: slotOf(S, p.t) })
    }
  }

  const dates = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const perTicker = {}
  for (const d of dates) for (const part of d.parts) perTicker[part.ticker] = (perTicker[part.ticker] || 0) + part.amount

  return {
    received,
    estimated: dates.reduce((sum, d) => sum + d.total, 0),
    dates,
    perTicker,
    isEstimate: dates.length > 0,
  }
}

/** The figure a goal is measured against, in MYR. */
export function goalCurrent(S, g) {`;

s = s.replace(anchor, ADD);
fs.writeFileSync(p, s, 'utf8');
console.log('calc.js: incomeOutlook + paymentCadenceDays added');
