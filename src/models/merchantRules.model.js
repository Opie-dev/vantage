const { get, one, run } = require('../db');

/**
 * Merchant rules, longest pattern first.
 *
 * The order is the whole matching strategy: a rule is applied by taking the first
 * one whose pattern is a prefix of the description, so a specific pattern must be
 * offered before a general one that also matches.
 */
const listAll = () => get(
  `SELECT r.*, c.name AS commitment_name FROM merchant_rules r
   LEFT JOIN commitments c ON c.id = r.commitment_id
   ORDER BY length(r.pattern) DESC, r.pattern`);

const findById = id => one(`SELECT * FROM merchant_rules WHERE id=$1`, id);

/** Upsert on the pattern: re-deciding a merchant corrects the rule rather than
 *  adding a second one that the longest-first order would then arbitrate. */
const upsert = ({ pattern, action, category, commitmentId, note }) => one(
  `INSERT INTO merchant_rules (pattern,action,category,commitment_id,note)
   VALUES ($1,$2,$3,$4,$5)
   ON CONFLICT (pattern) DO UPDATE SET
     action=EXCLUDED.action, category=EXCLUDED.category,
     commitment_id=EXCLUDED.commitment_id, note=EXCLUDED.note
   RETURNING *`,
  pattern, action, category, commitmentId, note);

const remove = id => run(`DELETE FROM merchant_rules WHERE id=$1`, id);

module.exports = { listAll, findById, upsert, remove };
