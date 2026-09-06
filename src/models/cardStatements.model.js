const { get, one, run } = require('../db');

/**
 * The bills, newest first. These are dated READINGS of what a card owed, and the
 * float in calc.js reads two of them — which is the reason the table exists at all
 * rather than a mutable balance column that can only be read as at today.
 */
const listAll = () => get(
  `SELECT s.*, c.name AS card_name FROM card_statements s
   JOIN commitments c ON c.id = s.commitment_id
   ORDER BY s.statement_date DESC, s.id DESC`);

const findById = id => one(`SELECT * FROM card_statements WHERE id=$1`, id);

/**
 * Upsert on (commitment_id, statement_date).
 *
 * Re-reading the same PDF must be a no-op, and the UNIQUE constraint is what makes
 * that true regardless of whether the caller remembered to check. A corrected
 * statement — the bank reissues one occasionally — overwrites rather than
 * duplicating, because two rows for one cycle would make owedOn() pick arbitrarily.
 */
const upsert = ({
  commitmentId, statementDate, dueDate, closingBalance, minimumDue,
  interestCharged, feesCharged, note, source,
}) => one(
  `INSERT INTO card_statements
     (commitment_id,statement_date,due_date,closing_balance,minimum_due,
      interest_charged,fees_charged,note,source)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT (commitment_id, statement_date) DO UPDATE SET
     due_date=EXCLUDED.due_date,
     closing_balance=EXCLUDED.closing_balance,
     minimum_due=EXCLUDED.minimum_due,
     interest_charged=EXCLUDED.interest_charged,
     fees_charged=EXCLUDED.fees_charged,
     note=EXCLUDED.note,
     source=EXCLUDED.source
   RETURNING *`,
  commitmentId, statementDate, dueDate, closingBalance, minimumDue,
  interestCharged, feesCharged, note, source);

const remove = id => run(`DELETE FROM card_statements WHERE id=$1`, id);

const countForCard = async commitmentId =>
  Number((await one(`SELECT count(*)::int AS n FROM card_statements WHERE commitment_id=$1`, commitmentId)).n);

module.exports = { listAll, findById, upsert, remove, countForCard };
