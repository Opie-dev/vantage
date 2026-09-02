const { get, one, run } = require('../db');

/** Ordered by sort_order so the owner controls the list, id as a total tie-break. */
const listAll = () => get(`SELECT * FROM commitments ORDER BY sort_order, id`);

const findById = id => one(`SELECT * FROM commitments WHERE id=$1`, id);

const insert = ({
  kind, name, lender, currency, dueDay, note,
  principal, rate, rateType, termMonths, startedOn, instalment,
  creditLimit, balance, balanceAsOf, apr, minPaymentPct, minPaymentFloor,
  amount, everyMonths, sortOrder,
}) => one(
  `INSERT INTO commitments
     (kind,name,lender,currency,due_day,note,
      principal,rate,rate_type,term_months,started_on,instalment,
      credit_limit,balance,balance_as_of,apr,min_payment_pct,min_payment_floor,
      amount,every_months,sort_order)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
   RETURNING *`,
  kind, name, lender, currency, dueDay, note,
  principal, rate, rateType, termMonths, startedOn, instalment,
  creditLimit, balance, balanceAsOf, apr, minPaymentPct, minPaymentFloor,
  amount, everyMonths, sortOrder);

/** `kind` is not updatable: it decides which columns the shape check requires,
 *  and changing it would need every other field rewritten in the same breath. */
const update = (id, {
  name, lender, currency, dueDay, note,
  principal, rate, rateType, termMonths, startedOn, instalment,
  creditLimit, balance, balanceAsOf, apr, minPaymentPct, minPaymentFloor,
  amount, everyMonths, active, endedOn, sortOrder,
}) => run(
  `UPDATE commitments SET
     name=$1, lender=$2, currency=$3, due_day=$4, note=$5,
     principal=$6, rate=$7, rate_type=$8, term_months=$9, started_on=$10, instalment=$11,
     credit_limit=$12, balance=$13, balance_as_of=$14, apr=$15,
     min_payment_pct=$16, min_payment_floor=$17,
     amount=$18, every_months=$19, active=$20, ended_on=$21, sort_order=$22
   WHERE id=$23`,
  name, lender, currency, dueDay, note,
  principal, rate, rateType, termMonths, startedOn, instalment,
  creditLimit, balance, balanceAsOf, apr, minPaymentPct, minPaymentFloor,
  amount, everyMonths, active, endedOn, sortOrder, id);

const remove = id => run(`DELETE FROM commitments WHERE id=$1`, id);

module.exports = { listAll, findById, insert, update, remove };
