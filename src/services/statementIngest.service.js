/**
 * Take a parsed card statement and record what can be recorded.
 *
 * The payload comes from sync/parse_maybank_statement.py, which has already run
 * three arithmetic checks the statement states about itself. This re-runs the one
 * that matters most rather than trusting the sender: a claim that arrives over
 * HTTP is not a claim that has been checked.
 *
 * WHAT LANDS AUTOMATICALLY, AND WHAT DOES NOT. The statement header lands: it is
 * the load-bearing row, because the float reads two closing balances and nothing
 * else, so importing the header ALONE already makes the month's spending figure
 * exact. Transaction rows land only where a merchant rule already says what they
 * are. Everything else is reported back, unbooked.
 *
 * That boundary is the whole design. See cards-plan.md §8, and the header of
 * 20260906030000_merchant_rules.sql for the three ways an importer lies.
 */
const crypto = require('crypto');
const statements = require('../models/cardStatements.model');
const commitments = require('../models/commitments.model');
const rulesModel = require('../models/merchantRules.model');
const expenses = require('../models/expenses.model');
const { badRequest, notFound } = require('../middleware/errorHandler');
const { round2 } = require('../lib/round');

const sha = parts => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);

/**
 * The merchant and where it happened, as one string with one space between
 * words. Where a line breaks into those two fields is the ONE thing the two
 * extractors do not agree on: Xpdf's -table pads words onto a character grid,
 * and on a page whose glyphs run narrow it prints two spaces inside a name that
 * was set with one, so the Python reads "SETEL FUEL" + "PASSTHROUGH-EC KUALA
 * LUMPUR MY" where the PDF's positions say "SETEL FUEL PASSTHROUGH-EC" + "KUALA
 * LUMPUR MY". Joined and collapsed they are the same string, and everything
 * that must not care which extractor ran works on this.
 */
const placeText = r => `${r.description || ''} ${r.location || ''}`.replace(/\s+/g, ' ').trim();

/** A statement line is the same line whichever extractor saw it. */
const extIdOf = (cardId, r) => 'stmt:' + sha([cardId, r.posted, r.transacted, r.amount, placeText(r)]);

/**
 * The key an earlier import gave the same line, when identity still hashed the
 * description alone. Rows booked by the CLI before the app read PDFs itself
 * carry this; on the next import of that statement they are moved to today's
 * key rather than booked again. Drop once no row in the table starts with a
 * legacy key.
 */
const legacyExtIdOf = (cardId, r) => 'stmt:' + sha([cardId, r.posted, r.transacted, r.description, r.amount]);

/**
 * Longest pattern wins, so a specific rule beats a general one. Matched against
 * the merchant AND the place, joined, so a rule written from either extractor's
 * reading of a line matches the other's.
 */
function matchRule(rules, r) {
  const d = placeText(r).toUpperCase();
  return rules.find(x => d.startsWith(x.pattern.toUpperCase())) || null;
}

async function ingest(body) {
  const cardId = Number(body.card_id);
  if (!Number.isInteger(cardId)) throw badRequest('card_id is required');
  const card = await commitments.findById(cardId);
  if (!card) throw notFound('no such commitment');
  if (card.kind !== 'REVOLVING') {
    throw badRequest(`${card.name} is a ${card.kind}, and only a card has statements`);
  }

  const h = body.statement || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!h.statement_date || !h.due_date) throw badRequest('statement is missing its dates');

  const carrying = (h.cards || []).filter(c => c.balance > 0);
  if (!carrying.length) throw badRequest('no card on this statement carries a balance');
  const summary = carrying[carrying.length - 1];

  // THE GATE, RE-RUN HERE. The parser checked it before sending; this checks it
  // before writing. 5% of the balance with the instalments taken out, plus 100%
  // of them — BNM/RH/PD 028-141 para 13.1.
  const instalments = rows
    .filter(r => r.kind === 'instalment')
    .reduce((t, r) => t + (r.amount || 0), 0);
  const revolving = round2(summary.balance - instalments);
  const derived = round2(revolving * 0.05 + instalments);
  if (summary.minimum != null && Math.abs(derived - summary.minimum) > 0.02) {
    throw badRequest(
      `refused: the minimum does not add up. 5% x ${revolving.toFixed(2)} + ${instalments.toFixed(2)} ` +
      `= ${derived.toFixed(2)}, but the statement says ${summary.minimum.toFixed(2)}. ` +
      'Nothing was written.');
  }

  // THE ROWS GATE, HERE TOO. The minimum above proves the header agrees with
  // itself; it would pass happily while a page had been silently dropped. This
  // is the only check that touches every row, and until now it ran only in the
  // browser — which a curl, or a bug in the screen, could walk straight past.
  // Skipped when no rows were sent at all: importing the header alone is a
  // legitimate use, and there is nothing to sum.
  const rowsTotal = round2(rows
    .filter(r => r.kind === 'retail' || r.kind === 'instalment')
    .reduce((t, r) => t + (r.amount || 0), 0));
  if (rows.length && Math.abs(rowsTotal - summary.balance) > 0.02) {
    throw badRequest(
      `refused: the rows do not reach the balance. They sum to ${rowsTotal.toFixed(2)}, but the ` +
      `statement says ${summary.balance.toFixed(2)} \u2014 a page is missing, or a row was dropped. ` +
      'Nothing was written.');
  }

  const statement = await statements.upsert({
    commitmentId: cardId,
    statementDate: h.statement_date,
    dueDate: h.due_date,
    closingBalance: summary.balance,
    minimumDue: summary.minimum ?? null,
    interestCharged: 0,
    feesCharged: 0,
    note: body.note || '',
    source: 'import',
  });

  // Now the transactions, against rules the owner has already written.
  const rules = await rulesModel.listAll();
  const booked = [];
  const alreadyThere = [];
  const asCommitment = [];
  const ignored = [];
  const unmatched = new Map();

  for (const r of rows) {
    // An instalment line is a plan's billing, not a purchase; a credit is a
    // payment. Neither is ever spending, whatever the rules say.
    if (r.kind !== 'retail') continue;
    if (r.spending_candidate === false) { ignored.push(r.description); continue; }

    const rule = matchRule(rules, r);
    if (!rule) {
      const m = unmatched.get(r.description) || { description: r.description, rows: 0, total: 0 };
      m.rows += 1;
      m.total = round2(m.total + r.amount);
      unmatched.set(r.description, m);
      continue;
    }
    if (rule.action === 'IGNORE') { ignored.push(r.description); continue; }
    if (rule.action === 'COMMITMENT') {
      // Recorded as seen, booked as nothing. It is already subtracted from income
      // on the Money screen, and booking it again would count it twice.
      asCommitment.push({ description: r.description, amount: r.amount, as: rule.commitment_name });
      continue;
    }

    const extId = extIdOf(cardId, r);
    // The same line, booked by the CLI under the key identity used to have, is
    // moved to today's key — not counted as new, not booked twice.
    if (await expenses.rekey(legacyExtIdOf(cardId, r), extId)) {
      alreadyThere.push(r.description);
      continue;
    }
    const row = await expenses.insertImported({
      date: r.transacted || r.posted,
      amount: r.amount,
      currency: card.currency || 'MYR',
      category: rule.category,
      note: r.description + (r.location ? ` · ${r.location}` : ''),
      extId,
    });
    if (row) booked.push(row);
    else alreadyThere.push(r.description);
  }

  const sum = a => round2(a.reduce((t, x) => t + (x.amount || 0), 0));
  return {
    statement,
    booked: { rows: booked.length, rm: sum(booked) },
    // Not an error: re-importing the same PDF should change nothing, and this is
    // the count that proves it did not.
    alreadyImported: alreadyThere.length,
    matchedToCommitments: asCommitment,
    ignored: ignored.length,
    // The only thing asking for a decision. Sorted by what it costs to keep
    // ignoring, so the biggest gap in the log is the first thing offered.
    unmatched: [...unmatched.values()].sort((a, b) => b.total - a.total),
  };
}

module.exports = { ingest };
