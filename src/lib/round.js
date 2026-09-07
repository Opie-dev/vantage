/**
 * Python's round(), because the reference parser is Python.
 *
 * Math.round(x * 100) / 100 rounds half UP, on a product that was itself
 * rounded. Python's round(x, 2) rounds the EXACT binary value, ties to EVEN.
 * They disagree on every decimal tie, and a card's minimum lands on one
 * whenever the revolving balance ends in 10, 30, 50, 70 or 90 sen: 1,667.625
 * is 1,667.62 to Python and 1,667.63 to Math.round. About one derived minimum
 * in fifty differs by a sen, the gate is two sen wide, and at its edge that sen
 * is the verdict — the CLI passing a statement the app refuses, or the reverse.
 * Same figure, same rounding, everywhere: the parser, the gates, the ingest.
 *
 * toFixed(60) is the exact decimal expansion of any double with |x| ≥ 2⁻⁸,
 * which is every amount and every rate this app sees; below that a value cannot
 * sit within 10⁻⁶⁰ of a tie without being one, so the verdict is still right.
 */
function pyRound(x, d) {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  // ES2018 raised toFixed's limit from 20 to 100 digits; the lint rule predates it.
  // eslint-disable-next-line oxc/number-arg-out-of-range
  const [ip, fp] = Math.abs(x).toFixed(60).split('.');
  const digits = (ip + fp.slice(0, d)).split('').map(Number);
  const rest = fp.slice(d);
  const first = rest.charCodeAt(0) - 48;
  const tie = first === 5 && /^0*$/.test(rest.slice(1));
  const up = first > 5 || (first === 5 && !tie) || (tie && digits[digits.length - 1] % 2 === 1);
  if (up) {
    let i = digits.length - 1;
    while (i >= 0 && digits[i] === 9) {
      digits[i] = 0;
      i -= 1;
    }
    if (i < 0) digits.unshift(1);
    else digits[i] += 1;
  }
  const s = digits.join('');
  const out = Number(d ? `${s.slice(0, s.length - d)}.${s.slice(s.length - d)}` : s);
  return neg ? -out : out;
}

const round2 = x => pyRound(x, 2);
const round4 = x => pyRound(x, 4);

module.exports = { pyRound, round2, round4 };
