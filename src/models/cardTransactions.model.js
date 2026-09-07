const { get, one, run } = require('../db');

/**
 * Every line a statement carried, in the order the card saw them.
 *
 * Ordered by transaction date rather than posting date, because that is the day
 * the owner remembers — the posting date is the bank's clerical fact and the gap
 * between the two is float, which the Cards screen explains separately.
 */
const listForStatement = statementId => get(
  `SELECT * FROM card_transactions WHERE statement_id=$1
   ORDER BY transacted_on, id`, statementId);

/** One card across every statement, newest first. */
const listForCard = commitmentId => get(
  `SELECT * FROM card_transactions WHERE commitment_id=$1
   ORDER BY transacted_on DESC, id DESC`, commitmentId);

/**
 * Upsert on `ext_id`, which is the same identity the expense booking uses.
 *
 * RE-IMPORTING THE SAME PDF MUST CHANGE NOTHING, and the conflict clause is what
 * makes that true whether or not the caller remembered to check. It updates
 * rather than doing nothing, because the case that matters is a line whose
 * DISPOSITION changed: a merchant that was unmatched last month and has a rule
 * written for it now should read as booked on the next import, not stay
 * unmatched forever because the row already existed.
 *
 * `statement_id` is deliberately in the update list. A row first seen on a
 * header-less import has no statement, and the import that later brings the
 * header should adopt it rather than leave it orphaned beside a duplicate.
 */
const upsert = ({
  commitmentId, statementId, transactedOn, postedOn, description, location,
  amount, kind, origCurrency, origAmount, fxRate, instalmentNo, instalmentOf,
  disposition, expenseId, extId,
}) => one(
  `INSERT INTO card_transactions
     (commitment_id,statement_id,transacted_on,posted_on,description,location,
      amount,kind,orig_currency,orig_amount,fx_rate,instalment_no,instalment_of,
      disposition,expense_id,ext_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
   ON CONFLICT (ext_id) DO UPDATE SET
     statement_id=EXCLUDED.statement_id,
     description=EXCLUDED.description,
     location=EXCLUDED.location,
     amount=EXCLUDED.amount,
     kind=EXCLUDED.kind,
     orig_currency=EXCLUDED.orig_currency,
     orig_amount=EXCLUDED.orig_amount,
     fx_rate=EXCLUDED.fx_rate,
     instalment_no=EXCLUDED.instalment_no,
     instalment_of=EXCLUDED.instalment_of,
     disposition=EXCLUDED.disposition,
     expense_id=EXCLUDED.expense_id
   RETURNING *`,
  commitmentId, statementId, transactedOn, postedOn, description, location,
  amount, kind, origCurrency, origAmount, fxRate, instalmentNo, instalmentOf,
  disposition, expenseId, extId);

/** Guards a statement delete the way the statement count guards a card. */
const countForStatement = async statementId =>
  Number((await one(
    `SELECT count(*)::int AS n FROM card_transactions WHERE statement_id=$1`,
    statementId)).n);

const countForCard = async commitmentId =>
  Number((await one(
    `SELECT count(*)::int AS n FROM card_transactions WHERE commitment_id=$1`,
    commitmentId)).n);

const remove = id => run(`DELETE FROM card_transactions WHERE id=$1`, id);

module.exports = {
  listForStatement, listForCard, upsert, countForStatement, countForCard, remove,
};
