/**
 * The parser's logic, on lines shaped exactly as -table prints them.
 *
 * NO REAL STATEMENT IS COMMITTED. The port was verified identical to the Python
 * on one — to the key and the sen — but that file is someone's card statement
 * and stays out of the repository. This exercises the same code paths on a
 * synthetic one whose figures are chosen so every gate closes, and whose rows
 * cover each line shape the parser knows: an instalment, a payment, the rate
 * line, a foreign charge with its original amount, and an FPX reference.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHeader, parseRows, check, extract, parse, withYear, gatesPassed } = require('./maybankStatement');

// Chosen to reconcile: 400 + 100 + 1,000 + 5.55 = 1,505.55 of retail and
// instalment rows; previous 300 + debit 1,505.55 − credit 300 = 1,505.55; and
// 5% × (1,505.55 − 400) + 400 = 455.28 as the minimum.
const LINES = [
  'STATEMENT OF CREDIT CARD ACCOUNT',
  'Page/Halaman   001 OF 002',
  'Statement Date/   Payment Due Date/',
  '06 AUG 26   26 AUG 26',
  'Account Number/Nombor Akaun   Current Balance/Baki Semasa   Minimum Payment/Bayaran Minima',
  '4842 8109 3011 4018   0.00   0.00',
  '4966 2302 4004 2355   1,505.55   455.28',
  'YOUR COMBINED CREDIT LIMIT (RM)   15,000',
  'YOUR PREVIOUS STATEMENT BALANCE   300.00',
  '07/07   07/07   EZYPAY PLUS -E12   :002/012   400.00',
  '07/07   07/07   RETAIL INTEREST RATE = 15.00%',
  '08/07   08/07   PYMT@MAYBANK2U.COM   300.00CR',
  '09/07   08/07   SETEL FUEL PASSTHROUGH-EC   KUALA LUMPUR   MY   100.00',
  '26/07   25/07   ANTHROPIC* CLAUDE SUB   ANTHROPIC.COM US   1,000.00',
  '   TRANSACTED AMOUNT   USD   240.00',
  '01/08   31/07   FPX-STOREHUB SDN BHD   MY   5.55',
  '   2608011455170403',
  'Page/Halaman   002 OF 002',
  'TOTAL CREDIT THIS MONTH   300.00',
  'TOTAL DEBIT THIS MONTH   1,505.55',
  'SUB TOTAL/JUMLAH   1,505.55',
  'TreatsPoints Account Details',
  '4966 2302 4004 2355   64,284   6,066   0   0   70,350',
];

test('header: dates, both cards, the shared limit, and the totals', () => {
  const h = parseHeader(LINES);
  assert.equal(h.statement_date, '2026-08-06');
  assert.equal(h.due_date, '2026-08-26');
  assert.equal(h.combined_limit, 15000);
  assert.deepEqual(h.cards, [
    { number: '4842 8109 3011 4018', balance: 0, minimum: 0 },
    { number: '4966 2302 4004 2355', balance: 1505.55, minimum: 455.28 },
    // The TreatsPoints row carries a card number and five integers — no money
    // pattern with a decimal — so it must NOT be read as a third card.
  ]);
  assert.equal(h.previous_balance, 300);
  assert.equal(h.total_credit, 300);
  assert.equal(h.total_debit, 1505.55);
  assert.equal(h.closing_balance, 1505.55);
});

test('rows: every line shape, and the continuations attached to the right row', () => {
  const rows = parseRows(LINES, '2026-08-06');
  assert.deepEqual(rows.map(r => r.kind), ['instalment', 'rate', 'credit', 'retail', 'retail', 'retail']);

  const [inst, rate, pay, fuel, claude, fpx] = rows;
  assert.equal(inst.instalment_no, 2);
  assert.equal(inst.instalment_of, 12);
  assert.equal(inst.location, null, 'an instalment marker is not a location');
  assert.equal(inst.spending_candidate, false, 'EzyPay is never spending');

  assert.equal(rate.apr, 15);

  assert.equal(pay.credit, true);
  assert.equal(pay.amount, 300);
  assert.equal(pay.spending_candidate, false, 'a payment settles what is owed');

  assert.equal(fuel.location, 'KUALA LUMPUR MY');
  assert.equal(fuel.spending_candidate, true);

  // The only continuation worth structuring: the pre-conversion amount, and the
  // all-in rate it implies — scheme markup included.
  assert.deepEqual(claude.foreign, { currency: 'USD', amount: 240, rate: 4.1667 });
  assert.equal(claude.location, 'ANTHROPIC.COM US');

  // An FPX reference is kept but not structured, and it belongs to the row
  // above it — not to the page header that follows.
  assert.deepEqual(fpx.extra, ['2608011455170403']);
  assert.equal(fpx.transacted, '2026-07-31');
  assert.equal(fpx.posted, '2026-08-01');
});

test('rows: a posting month after the statement month belongs to the year before', () => {
  const rows = parseRows(['05/01   28/12   SOMETHING   MY   10.00'], '2027-01-10');
  assert.equal(rows[0].posted, '2027-01-05');
  assert.equal(rows[0].transacted, '2026-12-28');
});

test('gates: all three close on figures the bank printed', () => {
  const h = parseHeader(LINES);
  const gates = check(h, parseRows(LINES, h.statement_date));
  assert.deepEqual(gates.map(g => [g.gate, g.ok]), [['balance', true], ['rows', true], ['minimum', true]]);
  const min = gates.find(g => g.gate === 'minimum');
  assert.equal(min.instalments, 400);
  assert.equal(min.revolving, 1105.55);
});

test('gates: a dropped row fails the one gate that touches every row', () => {
  const h = parseHeader(LINES);
  const rows = parseRows(LINES, h.statement_date).filter(r => r.description !== 'SETEL FUEL PASSTHROUGH-EC');
  const gates = check(h, rows);
  assert.equal(gates.find(g => g.gate === 'balance').ok, true, 'the header still agrees with itself');
  assert.equal(gates.find(g => g.gate === 'rows').ok, false, 'but the rows no longer reach the balance');
});


/* ── through the PDF itself ─────────────────────────────────────────────────
 *
 * The tests above feed lines to the parser. These feed a PDF to the extractor,
 * because the join — what becomes a column and what stays a word — is the one
 * part of the port that could not be copied from the Python, and the one part a
 * pdf.js upgrade can change under it. The PDF is built here, by hand: Helvetica
 * text at exact positions, nothing else.
 */
const HELV = {
  ' ': 278, '(': 333, ')': 333, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, '%': 889, '@': 1015, '=': 584,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, e: 556, g: 556, l: 222, m: 833, n: 556,
};
const width = (text, size) => [...text].reduce((t, c) => t + (HELV[c] || 556), 0) * size / 1000;

/**
 * The statement's font sets its space at 0.301 em; Helvetica's is 0.278. That
 * difference is the whole two-glyph story: pdf.js keeps a whitespace run inside
 * the string while it is under 0.6 em, and only a wider run reaches the join as
 * a gap. Two of the statement's spaces are 0.602 em and do; two of Helvetica's
 * are 0.556 and never will. Word spacing brings Helvetica's up to the
 * statement's, so these pages have the geometry of the real file.
 */
const TW = 0.21;
const esc = t => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** pages: arrays of [x, y, size, text, font?] — font 1 is Helvetica, 2 its oblique. */
function pdf(pages, { tw = 0 } = {}) {
  const objs = [];
  const add = s => objs.push(s);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const contents = pages.map(pg => {
    const ops = ['BT', `${tw} Tw`, ...pg.map(([x, y, size, text, font = 1]) =>
      `/F${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(text)}) Tj`), 'ET'].join('\n');
    return add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
  });
  const pagesId = objs.length + pages.length + 1;
  const pageIds = contents.map(c => add(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] ` +
    `/Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents ${c} 0 R >>`));
  add(`<< /Type /Pages /Kids [${pageIds.map(p => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('extract: two space glyphs are a column, one is a word, a font change is nothing', async () => {
  const x = 60;
  const page = [
    // Two glyphs: -table breaks the field here, so the join must too.
    [x, 800, 9, 'SHELL  SELECT'],
    // One glyph: one field.
    [x, 780, 9, 'KUALA LUMPUR'],
    [x, 760, 8, 'KUALA LUMPUR'],
    // "Page/" regular then "Halaman" italic, touching — the furniture line.
    [x, 740, 8, 'Page/'],
    [x + width('Page/', 8), 740, 8, 'Halaman', 2],
    [x + width('Page/Halaman', 8) + 12, 740, 8, '001 OF 001'],
    // A real column gap, and a real word gap between separate items.
    [x, 720, 9, '07/07'], [x + 70, 720, 9, '07/07'],
    [x, 700, 9, 'KUALA LUMPUR'], [x + width('KUALA LUMPUR', 9) + 2.7, 700, 9, 'MY'],
  ];
  const lines = await extract(pdf([page], { tw: TW }));
  assert.deepEqual(lines, [
    'SHELL   SELECT',
    'KUALA LUMPUR',
    'KUALA LUMPUR',
    'Page/Halaman   001 OF 001',
    '07/07   07/07',
    'KUALA LUMPUR MY',
  ]);
});

test('parse: a statement page, end to end, reads as the Python read it', async () => {
  // The geometry of the real template: these x positions are its columns.
  const amt = (y, s) => [573.38 - width(s, 9), y, 9, s];
  let y = 560;
  const page = [
    [181.5, 853, 12, 'STATEMENT OF CREDIT CARD ACCOUNT'],
    [405.73, 809, 8, 'Page/Halaman   001 OF 001'],
    [413.49, 756, 8, '06 AUG 26'], [520.51, 756, 8, '26 AUG 26'],
    [51.96, 642.6, 9, '4966 2302 4004 2355'], [250.48, 642.6, 9, '30.00'], [402.6, 642.6, 9, '1.50'],
    [28.41, 600, 8, 'Posting Date /'], [89.66, 600, 8, 'Transaction Date /'],
    [288.69, 600, 8, 'Transaction Description /'], [521.38, 600, 8, 'Amount(RM) /'],
    [166.5, 580, 9, 'YOUR PREVIOUS STATEMENT BALANCE'], [538.48, 580, 9, '0.00'],
    // Two glyphs, then three: the Python splits both, so both must read the same.
    [42.34, y, 9, '07/07'], [113.09, y, 9, '07/07'], [166.5, y, 9, 'SHELL  SELECT'],
    [404.22, y, 9, 'KUALA LUMPUR  MY'], amt(y, '10.00'),
  ];
  y -= 13;
  page.push(
    [42.34, y, 9, '08/07'], [113.09, y, 9, '08/07'], [166.5, y, 9, 'SHELL   SELECT'],
    [404.22, y, 9, 'KUALA LUMPUR  MY'], amt(y, '20.00'),
    [166.5, y - 10, 9, 'TOTAL CREDIT THIS MONTH'], [538.48, y - 10, 9, '0.00'],
    [166.5, y - 23, 9, 'TOTAL DEBIT THIS MONTH'], [538.48, y - 23, 9, '30.00'],
    [420.85, y - 36, 9, 'SUB TOTAL/JUMLAH'], [555.93, y - 36, 9, '30.00'],
  );
  const out = await parse(pdf([page], { tw: TW }));
  assert.equal(out.statement.statement_date, '2026-08-06');
  assert.equal(out.statement.closing_balance, 30);
  assert.deepEqual(
    out.rows.map(r => [r.description, r.location, r.amount]),
    [['SHELL', 'SELECT KUALA LUMPUR MY', 10], ['SHELL', 'SELECT KUALA LUMPUR MY', 20]],
  );
  assert.deepEqual(out.gates.map(g => [g.gate, g.ok]), [['balance', true], ['rows', true], ['minimum', true]]);
  assert.equal(out.gatesPassed, true);
});

test('withYear: a day that does not exist is refused, not written', () => {
  assert.equal(withYear('29/02', '2028-03-06'), '2028-02-29');
  assert.throws(() => withYear('29/02', '2027-03-06'), /not a date/);
  assert.throws(() => withYear('31/06', '2026-08-06'), /not a date/);
  assert.throws(() => withYear('00/08', '2026-08-06'), /not a date/);
  assert.throws(() => withYear('05/13', '2026-08-06'), /not a date/);
});

test('gatesPassed: three closed gates, and nothing less', () => {
  const ok = { ok: true };
  assert.equal(gatesPassed([ok, ok, ok]), true);
  assert.equal(gatesPassed([ok, ok, { ok: false }]), false);
  assert.equal(gatesPassed([ok, ok]), false);
  assert.equal(gatesPassed([]), false);
});
