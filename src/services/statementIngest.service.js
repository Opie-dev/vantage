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

/** A statement line is the same line whichever run sees it. */
const extIdOf = (cardId, r) =>
  'stmt:' + crypto.createHash('sha1')
    .update([cardId, r.posted, r.transacted, r.description, r.amount].join('|'))
    .digest('hex').slice(0, 24);

/** Longest pattern wins, so a specific rule beats a general one. */
function matchRule(rules, description) {
  const d = (description || '').toUpperCase();
  return rules.find(r => d.startsWith(r.pattern.toUpperCase())) || null;
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
  const revolving = Math.round((summary.balance - instalments) * 100) / 100;
  const derived = Math.round((revolving * 0.05 + instalments) * 100) / 100;
  if (summary.minimum != null && Math.abs(derived - summary.minimum) > 0.02) {
    throw badRequest(
      `refused: the minimum does not add up. 5% x ${revolving.toFixed(2)} + ${instalments.toFixed(2)} ` +
      `= ${derived.toFixed(2)}, but the statement says ${summary.minimum.toFixed(2)}. ` +
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

    const rule = matchRule(rules, r.description);
    if (!rule) {
      const m = unmatched.get(r.description) || { description: r.description, rows: 0, total: 0 };
      m.rows += 1;
      m.total = Math.round((m.total + r.amount) * 100) / 100;
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

    const row = await expenses.insertImported({
      date: r.transacted || r.posted,
      amount: r.amount,
      currency: card.currency || 'MYR',
      category: rule.category,
      note: r.description + (r.location ? ` · ${r.location}` : ''),
      extId: extIdOf(cardId, r),
    });
    if (row) booked.push(row);
    else alreadyThere.push(r.description);
  }

  const sum = a => Math.round(a.reduce((t, x) => t + (x.amount || 0), 0) * 100) / 100;
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
