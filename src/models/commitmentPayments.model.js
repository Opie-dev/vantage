const { get, one, run } = require('../db');

/**
 * Deviations from the derived schedule, newest first — an overpayment, a missed
 * month, a settlement. An empty result means everything went to plan, which is
 * the common case; the schedule itself is derived on the client and never stored.
 */
const listAll = () => get(
  `SELECT p.*, c.name FROM commitment_payments p
   JOIN commitments c ON c.id = p.commitment_id
   ORDER BY p.date DESC, p.id DESC`);

const findById = id => one(`SELECT * FROM commitment_payments WHERE id=$1`, id);

const insert = ({ commitmentId, date, amount, extraPrincipal, note, source }) => one(
  `INSERT INTO commitment_payments (commitment_id,date,amount,extra_principal,note,source)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
  commitmentId, date, amount, extraPrincipal, note, source);

const remove = id => run(`DELETE FROM commitment_payments WHERE id=$1`, id);

/** Guards the delete: a commitment with recorded payments is ended, not dropped. */
const countForCommitment = async commitmentId =>
  Number((await one(`SELECT count(*)::int AS n FROM commitment_payments WHERE commitment_id=$1`, commitmentId)).n);

module.exports = { listAll, findById, insert, remove, countForCommitment };
