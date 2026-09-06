const { get, one, run } = require('../db');

/**
 * Instalment plans sitting on a card, oldest start first.
 *
 * The SCHEDULE is not here, for the reason loans have no schedule either: how many
 * instalments have been paid follows from `started_on`, `tenure_months` and today's
 * date, and is derived in calc.js. What a schedule cannot know — an early
 * settlement, a retracted 0% — is `settled_on` and `status`.
 */
const listAll = () => get(
  `SELECT p.*, c.name AS card_name FROM card_plans p
   JOIN commitments c ON c.id = p.commitment_id
   ORDER BY p.started_on, p.id`);

const findById = id => one(`SELECT * FROM card_plans WHERE id=$1`, id);

const insert = ({
  commitmentId, kind, name, merchant, amount, tenureMonths, instalment,
  rate, upfrontFee, purchasedOn, startedOn, settledOn, status, category, note, source,
}) => one(
  `INSERT INTO card_plans
     (commitment_id,kind,name,merchant,amount,tenure_months,instalment,
      rate,upfront_fee,purchased_on,started_on,settled_on,status,category,note,source)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
   RETURNING *`,
  commitmentId, kind, name, merchant, amount, tenureMonths, instalment,
  rate, upfrontFee, purchasedOn, startedOn, settledOn, status, category, note, source);

/** `commitment_id` is deliberately not updatable: a plan belongs to the card whose
 *  limit it consumed, and moving it would silently restate both cards' utilisation. */
const update = (id, {
  kind, name, merchant, amount, tenureMonths, instalment,
  rate, upfrontFee, purchasedOn, startedOn, settledOn, status, category, note,
}) => run(
  `UPDATE card_plans SET
     kind=$1, name=$2, merchant=$3, amount=$4, tenure_months=$5, instalment=$6,
     rate=$7, upfront_fee=$8, purchased_on=$9, started_on=$10, settled_on=$11,
     status=$12, category=$13, note=$14
   WHERE id=$15`,
  kind, name, merchant, amount, tenureMonths, instalment,
  rate, upfrontFee, purchasedOn, startedOn, settledOn, status, category, note, id);

const remove = id => run(`DELETE FROM card_plans WHERE id=$1`, id);

/** Guards the card delete the way commitment_payments already does. */
const countForCard = async commitmentId =>
  Number((await one(`SELECT count(*)::int AS n FROM card_plans WHERE commitment_id=$1`, commitmentId)).n);

module.exports = { listAll, findById, insert, update, remove, countForCard };
