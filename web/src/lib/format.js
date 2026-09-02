/**
 * Display formatting for Vantage.
 *
 * These mirror the helpers from the original single-file UI so the numbers on
 * screen read exactly as they always have. The locale is 'en-MY' throughout —
 * do not swap it for the browser locale, the owner reads RM figures.
 *
 * NOTE ON SIGNS: a signed figure uses the typographic minus U+2212 ('−'),
 * not an ASCII hyphen. That is deliberate — it lines up with '+' in a
 * tabular-nums column.
 */

const LOCALE = 'en-MY'
const MINUS = '−'

/** 'MYR' -> 'RM ' , 'USD' -> '$'. Note the MYR symbol carries a trailing space. */
export function symbol(cur) {
  return cur === 'USD' ? '$' : 'RM '
}

/**
 * Money, always 2dp, with the currency symbol.
 * fmt(1234.5, 'MYR') -> 'RM 1,234.50'
 * fmt(1234.5, 'USD') -> '$1,234.50'
 * A negative reads '−$42.45', not '$-42.45' — the sign belongs outside the
 * symbol, and it is the same U+2212 the signed helpers use.
 */
export function fmt(v, cur) {
  const n = Number(v) || 0
  const abs = Math.abs(n).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? MINUS : '') + symbol(cur) + abs
}

/** Money without the currency symbol — for a column that already has a header. */
export function fmtBare(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? MINUS : '') + abs
}

/** Share quantity. Locale grouping, up to 3dp, no forced decimals. fq(1000) -> '1,000' */
export function fq(v) {
  return (Number(v) || 0).toLocaleString(LOCALE)
}

/** '+' for zero and above, '−' below. */
export function sign(v) {
  return v >= 0 ? '+' : MINUS
}

/** Signed money: fmtS(-12.3, 'MYR') -> 'RM 12.30' prefixed with the minus sign. */
export function fmtS(v, cur) {
  return sign(v) + fmt(Math.abs(Number(v) || 0), cur)
}

/** Signed percentage, 1dp. pctS(-4.27) -> '−4.3%' */
export function pctS(v) {
  return sign(v) + Math.abs(Number(v) || 0).toFixed(1) + '%'
}

/** Unsigned percentage, 0dp — for progress chips. pct0(63.4) -> '63%' */
export function pct0(v) {
  return (Number(v) || 0).toFixed(0) + '%'
}

/**
 * Unsigned percentage, 1dp — for small figures where pct0 would round to '0%'
 * and say nothing. pct1(0.42) -> '0.4%'
 */
export function pct1(v) {
  return (Number(v) || 0).toFixed(1) + '%'
}

/**
 * Tailwind text colour for a gain/loss figure. Use this rather than picking
 * green-500/red-500 by hand — it tracks the theme tokens in index.css.
 * toneClass(4.2) -> 'text-gain'   toneClass(-1) -> 'text-loss'
 */
export function toneClass(v) {
  return v >= 0 ? 'text-gain' : 'text-loss'
}

/** 'gain' | 'loss' — when you need the word rather than the class. */
export function tone(v) {
  return v >= 0 ? 'gain' : 'loss'
}

/** 'YYYY-MM-DD' -> '3 Mar'. Dates from the API are always plain date strings. */
export function dfmt(d) {
  if (!d) return ''
  return new Date(d + 'T00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
}

/** 'YYYY-MM-DD' -> '3 Mar 2026'. */
export function dfmtLong(d) {
  if (!d) return ''
  return new Date(d + 'T00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** An ISO timestamp (state.lastSync) -> '3 Mar, 09:14'. Returns '' for null. */
export function dtfmt(iso) {
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Today as 'YYYY-MM-DD', in local time — the format every date field wants. */
export function today() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Short money for CHART AXES and tick labels: 12400 -> '12.4k'.
 *
 * NOT FOR A FIGURE THE READER WILL TAKE AS EXACT. The 'k' and 'm' suffixes
 * announce their own approximation, but the sub-1000 branch does not: RM 147.70
 * comes out as '148', which reads as a real number and is 30 sen wrong. On an
 * axis that is fine — nobody reconciles a gridline. Anywhere a specific amount is
 * being stated, use fmt() or fmtS() and let it wrap or truncate.
 */
export function compact(v) {
  const n = Math.abs(Number(v) || 0)
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'm'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toFixed(0)
}

/** 'RM 12.4k' / '$1.2k' — compact() with the symbol. */
export function fmtCompact(v, cur) {
  return symbol(cur) + compact(v)
}

/** Month label for the calendar header: monthLabel(2026, 2) -> 'March 2026'. */
export function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
}

export { MINUS, LOCALE }
