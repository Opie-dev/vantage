/**
 * Read a Maybank credit card e-statement PDF into structured rows — in-process.
 *
 * A PORT OF sync/parse_maybank_statement.py, and deliberately a close one. That
 * script is the extractor cards-plan.md §8 describes, and it earned its shape
 * the hard way: its docstring records `pdftotext -layout` shearing an interest
 * line onto the wrong row with no error and a plausible total. Every regex,
 * every furniture and terminator string, and the three gates are carried over
 * unchanged, so the two extractors can be run over the same statement and
 * required to agree to the sen — which is how this port was verified.
 *
 * WHAT CHANGED IS ONLY WHERE THE LINES COME FROM. The Python shells out to
 * Xpdf's `pdftotext -table`, whose whole job is to turn positioned words back
 * into aligned rows. That flag exists in Xpdf alone: poppler never adopted it,
 * no distro packages Xpdf's tools, and so the parser could only ever run on a
 * machine someone had set up by hand. pdf.js gives every word with its x/y
 * directly, and this rebuilds the rows from those — the same information
 * `-table` worked from, with no binary, no Python, and nothing on the host.
 *
 * WHY REBUILD LINES RATHER THAN PARSE COLUMNS. pdf.js hands the columns over
 * already separated, and it is tempting to read them as fields. Reassembling
 * lines instead keeps the parsing logic byte-for-byte the Python's, which is
 * what makes "identical output on a real statement" a meaningful test rather
 * than two parsers that happen to agree today.
 *
 * NEVER GUESSES. A statement that does not reconcile against the figures the
 * bank printed on the same page fails a gate and says so; nothing here rounds a
 * column into agreement.
 */
const path = require('node:path');
const { badRequest } = require('../middleware/errorHandler');
const { round2, round4 } = require('./round');

/** pdf.js asks for its standard-font data even when nothing is rendered. Point
 *  it at the copy the package ships rather than let it warn on every parse. A
 *  filesystem path with a forward slash on the end: its Node loader reads the
 *  files with fs, but its argument check insists on a trailing `/`, which a
 *  Windows separator is not. */
const FONTS = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';

/* ── the five line shapes, verbatim from the Python ─────────────────────── */

// Two DD/MM dates anchor a new record. A line without them continues the one
// above it — an FPX reference number, or the foreign-currency original.
const ROW = /^\s*(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(\S.*?)\s*$/;

// The amount is always last, and `CR` suffixed to it is the ONLY sign marker on
// the statement. A payment is not a negative number; it is a suffixed one.
const AMOUNT = /(-?[\d,]+\.\d{2})(CR)?$/;

// `:004/012` is instalment 4 of 12 — the bank's own progress count, which
// cards-plan.md §8 reconciles against the count derived from dates.
const INSTALMENT = /:(\d{1,3})\/(\d{1,3})\b/;

// Printed as though it were a transaction. It is the card's tier rate, free.
const RATE = /RETAIL INTEREST RATE\s*=\s*([\d.]+)\s*%/;

// `TRANSACTED AMOUNT   USD   108.00` under a foreign charge.
const FOREIGN = /TRANSACTED AMOUNT\s+([A-Z]{3})\s+([\d,]+\.\d{2})/;

const CARD_NO = /\b(\d{4} \d{4} \d{4} \d{4})\b/;
const MONEY = /-?[\d,]+\.\d{2}/g;
const STATEMENT_DATES = /(\d{2} [A-Z]{3} \d{2})\s+(\d{2} [A-Z]{3} \d{2})/;

const MONTHS = Object.fromEntries(
  'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ').map((m, i) => [m, i + 1]),
);

// Lines that are furniture, not transactions. Matched on the English only; the
// Malay twin carries no figures and falls out on its own.
const FURNITURE = [
  'STATEMENT OF CREDIT CARD ACCOUNT', 'PENYATA AKAUN', 'Page/Halaman',
  'Posting Date', 'Tarikh Pos', 'WARNING ON PAYING', 'AMARAN KE ATAS',
  'Malayan Banking Berhad',
];

// Where the transaction list stops. Without these the final row keeps swallowing
// every line after it — the totals block, then the whole TreatsPoints page — as
// though they were its own continuations.
const TERMINATORS = [
  'TOTAL CREDIT THIS MONTH', 'TOTAL DEBIT THIS MONTH', 'SUB TOTAL',
  'TreatsPoints', 'Mata Ganjaran', 'YOUR COMBINED CREDIT LIMIT',
  'YOUR PREVIOUS STATEMENT BALANCE',
];

// Not spending, whatever else they are. A cash-out moves money to your own
// account and a payment settles what you already owe — booking either as an
// expense would invent living costs that never happened. See §8.
const NOT_SPENDING = ['EZYCASH', 'PYMT@', 'EZYPAY', 'BALANCE TRANSFER'];

const money = s => parseFloat(String(s).replace(/,/g, ''));

/* ── lines from positions ───────────────────────────────────────────────── */

/**
 * Words on the same baseline are one row. The tolerance is generous against the
 * 13pt row pitch of the statement and tight against anything that would merge
 * two rows: items in one row share a y to the unit, and neighbouring rows sit
 * thirteen apart.
 */
const SAME_ROW = 3;
/**
 * How items are joined depends on the DISTANCE between them, because that is
 * what -table did and the parser's regexes were written against its output.
 *
 *   touching    — no separator. pdf.js splits a run of text wherever the font
 *                 changes, so "Page/" (regular) and "Halaman" (italic) arrive as
 *                 two items with no space between them on the page. Joined with
 *                 any gap they stop matching the furniture list, and page 3's
 *                 header gets filed as a continuation of the last row on page 2.
 *   a word gap  — one space, as printed. "KUALA LUMPUR" then "MY".
 *   a column    — three spaces. The Python splits fields on runs of TWO or more,
 *                 so anything wider than one keeps the column boundary it marks.
 *
 * Touching is absolute — a hair, at any size. A column is PROPORTIONAL to the
 * font size, because that is how -table decides. Measured against Xpdf 4.00 in
 * this statement's geometry, it prints two spaces from about 0.53 em (4.8 units
 * at 9pt, 4.5 at 8pt) and one below. The case that matters is a merchant set
 * with TWO space glyphs — "SHELL  SELECT" — which is 0.556 em: -table breaks it
 * into two fields, so the Python's description is "SHELL", and the absolute
 * threshold this replaced (7 units) called it one word.
 *
 * What the join can see is bounded by pdf.js, not by this: it keeps a whitespace
 * run INSIDE the string while the run is under 0.6 em, and only a wider one
 * arrives here as a gap. This statement's font sets its space at 0.301 em, so
 * one glyph stays in the string and two (0.602) arrive as a gap of 5.42 at 9pt.
 * A font whose space is narrower than 0.3 em would hide the two-glyph case
 * entirely; there is no reading of positions that recovers it.
 *
 * Where -table pads words onto a character grid it can also print two spaces at
 * a SINGLE glyph, depending on what else is on the page. That is not portable
 * from positions, and identity downstream is made not to depend on it — see
 * extIdOf in statementIngest.service.js.
 */
const TOUCHING = 1.5;
/** A column, as a fraction of the larger font size on either side of the gap. */
const COLUMN_EM = 0.52;
const COLUMN = '   ';

/** A statement is two to six pages. Anything past this is not one. */
const MAX_PAGES = 30;

function joinRow(words) {
  let out = '';
  let prev = null;
  for (const w of words) {
    if (prev) {
      const gap = w.x - (prev.x + prev.w);
      const column = COLUMN_EM * Math.max(prev.size, w.size);
      out += gap < TOUCHING ? '' : gap < column ? ' ' : COLUMN;
    }
    out += w.s;
    prev = w;
  }
  return out;
}

let pdfjs = null;
async function lib() {
  // pdf.js ships as ESM. A dynamic import from CommonJS is the one form that
  // works on every Node this app runs on, flagged or not.
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

/** One page's text, as the lines Xpdf's -table would have printed. */
async function pageLines(page) {
  const { items } = await page.getTextContent();
  const words = items
    .filter(it => it.str && it.str.trim())
    .map(it => ({
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      // The font size is folded into the matrix; its length is the size.
      size: Math.hypot(it.transform[0], it.transform[1]),
      s: it.str,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  let row = null;
  for (const w of words) {
    if (!row || Math.abs(row.y - w.y) > SAME_ROW) {
      row = { y: w.y, words: [] };
      lines.push(row);
    }
    row.words.push(w);
  }
  return lines.map(r => joinRow(r.words.sort((a, b) => a.x - b.x)));
}

/**
 * Every line of the statement, page by page, from the PDF's own text layer.
 *
 * WHY NOT OCR — verbatim from the Python: the file has a text layer, and every
 * figure in it is already exact. OCR would turn `900.00` into a probabilistic
 * guess at `90000`, silently, in a column nobody re-reads.
 */
async function extract(buffer, { password } = {}) {
  const { getDocument, VerbosityLevel } = await lib();
  const task = getDocument({
    // A COPY, AND IT IS LOAD-BEARING. pdf.js 6 refuses a Node Buffer outright,
    // and a zero-copy view over the request body gets DETACHED by getDocument —
    // measured: req.body's byteLength went to 0. Do not "optimise" this away.
    data: new Uint8Array(buffer),
    password: password || undefined,
    standardFontDataUrl: FONTS,
    // Default in Node already; kept explicit because its one effect here is to
    // read the standard-14 fonts from the path above rather than the system.
    disableFontFace: true,
    // One Warning line per anomaly otherwise, and a hostile file can produce
    // thousands, some carrying PDF-controlled strings. Errors only.
    verbosity: VerbosityLevel.ERRORS,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = e && e.name;
    if (name === 'PasswordException') {
      throw badRequest(
        password
          ? 'that password did not open the statement'
          : 'this statement is locked — Maybank passwords its emailed ones');
    }
    throw badRequest(`could not read that PDF: ${String(e && e.message || e).slice(0, 200)}`);
  }

  const lines = [];
  try {
    // A statement is two to six pages. Twenty thousand pages sharing one content
    // stream is a three-megabyte file that parses for seventy seconds; this
    // refuses it before the first page is read. (pdf.js corrects a lying
    // /Count, so numPages is what is actually there.)
    if (doc.numPages > MAX_PAGES) {
      throw badRequest(`${doc.numPages} pages \u2014 a statement is a handful`);
    }
    for (let p = 1; p <= doc.numPages; p += 1) {
      let page;
      let text;
      try {
        page = await doc.getPage(p);
        text = await pageLines(page);
      } catch (e) {
        // A malformed page tree rejects HERE, not at getDocument, and without
        // this it surfaces as a 500 with a stack for what is a bad upload.
        if (e && e.status) throw e;
        throw badRequest(`could not read page ${p}: ${String(e && e.message || e).slice(0, 200)}`);
      }
      lines.push(...text);
    }
  } finally {
    // The document's worker and buffers go with the task, not the proxy.
    await task.destroy().catch(() => {});
  }

  if (!lines.some(l => l.trim())) {
    throw badRequest(
      'no text layer in this PDF — it is a scan, and needs OCR first, which the gates below would then check');
  }
  return lines;
}

/* ── the parse, verbatim in behaviour ───────────────────────────────────── */

function asIso(s) {
  const [d, mon, y] = s.split(' ');
  return `20${y}-${String(MONTHS[mon]).padStart(2, '0')}-${String(parseInt(d, 10)).padStart(2, '0')}`;
}

/**
 * Transaction lines carry no year. It comes from the statement date, and a
 * posting month AFTER the statement month belongs to the year before — the one
 * place this parser can be wrong by twelve months and not notice, so it is the
 * one place worth writing down.
 */
function withYear(ddmm, statementIso) {
  const [d, m] = ddmm.split('/').map(x => parseInt(x, 10));
  let y = parseInt(statementIso.slice(0, 4), 10);
  const sm = parseInt(statementIso.slice(5, 7), 10);
  if (m > sm) y -= 1;
  // The Python's date() raises on 31/06 and the whole parse stops. Without this
  // the port wrote "2026-06-31" into the expense log instead. Only a file that
  // is not a statement gets here; it still deserves a refusal, not a record.
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw badRequest(`${ddmm} is not a date`);
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Statement date, due date, the per-card summary, and the shared limit. */
function parseHeader(lines) {
  const h = {
    statement_date: null, due_date: null, combined_limit: null,
    cards: [], previous_balance: null,
    total_credit: null, total_debit: null, closing_balance: null,
  };

  for (const ln of lines) {
    if (h.statement_date === null) {
      const m = STATEMENT_DATES.exec(ln);
      if (m) {
        h.statement_date = asIso(m[1]);
        h.due_date = asIso(m[2]);
      }
    }

    // The account summary block: card number, balance, minimum, on one row.
    const m = CARD_NO.exec(ln);
    if (m && !ln.includes('Account Number')) {
      const amounts = ln.match(MONEY) || [];
      if (amounts.length >= 2) {
        h.cards.push({
          number: m[1],
          balance: money(amounts[amounts.length - 2]),
          minimum: money(amounts[amounts.length - 1]),
        });
      }
    }

    if (ln.includes('COMBINED CREDIT LIMIT')) {
      const tail = ln.split(')').pop();
      const n = tail.match(/[\d,]+/g);
      if (n) {
        const last = n[n.length - 1];
        h.combined_limit = money(last.includes('.') ? last : `${last}.00`);
      }
    }

    // These appear once per card section; the LAST one is the card that
    // actually carries a balance, which is the account the rows belong to.
    for (const [key, label] of [
      ['previous_balance', 'YOUR PREVIOUS STATEMENT BALANCE'],
      ['total_credit', 'TOTAL CREDIT THIS MONTH'],
      ['total_debit', 'TOTAL DEBIT THIS MONTH'],
      ['closing_balance', 'SUB TOTAL'],
    ]) {
      if (ln.includes(label)) {
        const n = ln.match(MONEY);
        if (n) h[key] = money(n[n.length - 1]);
      }
    }
  }
  return h;
}

function parseRows(lines, statementIso) {
  const rows = [];
  let prev = null;
  for (const ln of lines) {
    // Collapse runs of spaces before matching furniture: the same banner is set
    // with one space on one page and two on another.
    const flat = ln.replace(/\s+/g, ' ');
    if (FURNITURE.some(f => flat.includes(f))) continue;
    if (TERMINATORS.some(t => flat.includes(t))) {
      prev = null;
      continue;
    }

    const m = ROW.exec(ln);
    if (!m) {
      // A continuation of the row above: an FPX reference, or the original
      // foreign amount. Kept, because `TRANSACTED AMOUNT USD 108.00` is the only
      // place the pre-conversion figure appears.
      const t = ln.trim();
      if (prev !== null && t && !t.startsWith('JUMLAH') && !t.startsWith('(')) {
        const fx = FOREIGN.exec(t);
        if (fx) {
          prev.foreign = {
            currency: fx[1],
            amount: money(fx[2]),
            rate: round4(prev.amount / money(fx[2])),
          };
        } else {
          (prev.extra = prev.extra || []).push(t);
        }
      }
      continue;
    }

    const [, posting, txn, rest] = m;

    const rate = RATE.exec(rest);
    if (rate) {
      rows.push({ kind: 'rate', posted: withYear(posting, statementIso), apr: parseFloat(rate[1]) });
      prev = null;
      continue;
    }

    const a = AMOUNT.exec(rest);
    if (!a) {
      prev = null;
      continue;
    }

    const amount = money(a[1]);
    const credit = Boolean(a[2]);
    const text = rest.slice(0, a.index).trim();

    // Columns are separated by runs of two or more spaces; the first field is
    // the merchant, the rest is where it happened (or the instalment marker).
    const fields = text.split(/\s{2,}/).filter(Boolean);
    const description = fields[0] || '';
    const tail = fields.slice(1).join(' ');

    const inst = INSTALMENT.exec(text);
    const kind = inst ? 'instalment' : credit ? 'credit' : 'retail';

    const row = {
      kind,
      posted: withYear(posting, statementIso),
      transacted: withYear(txn, statementIso),
      description,
      location: inst ? null : (tail || null),
      amount,
      credit,
    };
    if (inst) {
      row.instalment_no = parseInt(inst[1], 10);
      row.instalment_of = parseInt(inst[2], 10);
    }
    // Never a candidate for the expense log, by rule rather than by judgement.
    row.spending_candidate =
      kind === 'retail' && !NOT_SPENDING.some(p => description.toUpperCase().includes(p));
    rows.push(row);
    prev = row;
  }
  return rows;
}

/**
 * The gates. Computed from figures the bank printed on the same page, and an
 * import that fails any of them is REFUSED rather than corrected — the same
 * instinct as SPEND_UNKNOWN. See cards-plan.md §8.
 */
function check(header, rows) {
  const out = [];
  const { previous_balance: prev, total_credit: cr, total_debit: db, closing_balance: close } = header;

  if ([prev, cr, db, close].every(v => v !== null && v !== undefined)) {
    const got = round2(prev + db - cr);
    out.push({
      gate: 'balance', expected: close, derived: got,
      ok: Math.abs(got - close) < 0.005,
      how: 'previous + debit - credit = closing',
    });
  }

  // Do the rows we parsed actually add up to the balance the bank printed? The
  // gate above only checks the header against itself, so it would pass happily
  // while the parser silently dropped a page. This one cannot: it is the only
  // check that touches every row.
  const carrying = header.cards.filter(c => c.balance > 0);
  if (carrying.length) {
    const booked = round2(rows
      .filter(r => r.kind === 'retail' || r.kind === 'instalment')
      .reduce((t, r) => t + r.amount, 0));
    const target = carrying[carrying.length - 1].balance;
    out.push({
      gate: 'rows', expected: target, derived: booked,
      ok: Math.abs(booked - target) < 0.02,
      how: 'every parsed retail + instalment row = closing balance',
    });
  }

  // 5% of the balance with the instalments taken out, plus 100% of them.
  // BNM/RH/PD 028-141 para 13.1.
  if (carrying.length) {
    const card = carrying[carrying.length - 1];
    const inst = rows.filter(r => r.kind === 'instalment').reduce((t, r) => t + r.amount, 0);
    const revolving = round2(card.balance - inst);
    const got = round2(revolving * 0.05 + inst);
    out.push({
      gate: 'minimum', expected: card.minimum, derived: got,
      ok: Math.abs(got - card.minimum) < 0.02,
      how: '5% x (balance - instalments) + 100% x instalments',
      instalments: round2(inst), revolving,
    });
  }
  return out;
}

/**
 * The whole thing: `{ statement, gates, rows, gatesPassed }`, shaped exactly as
 * the CLI prints it, so nothing downstream can tell which extractor ran.
 */
async function parse(buffer, opts = {}) {
  const lines = await extract(buffer, opts);
  const header = parseHeader(lines);
  if (!header.statement_date) {
    throw badRequest('could not find the statement date — is this a Maybank card statement?');
  }
  const rows = parseRows(lines, header.statement_date);
  const gates = check(header, rows);
  return { statement: header, gates, rows, gatesPassed: gatesPassed(gates) };
}

/**
 * Three gates, all closed. Fewer is not a pass: each is skipped when the figure
 * it needs was not found, and a summary line -table drifted past CARD_NO loses
 * two of them at once — [].every() would have called that clean.
 */
const gatesPassed = gates => gates.length === 3 && gates.every(g => g.ok);

module.exports = { parse, extract, parseHeader, parseRows, check, withYear, gatesPassed };
