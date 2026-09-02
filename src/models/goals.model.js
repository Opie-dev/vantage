const { get, one, run } = require('../db');

/**
 * Joined to ticker and currency, which the goal maths on the client needs.
 * LEFT JOIN, because an income goal with no instrument is portfolio-wide — an
 * inner join would silently drop those rows.
 */
const listAll = () => get(
  `SELECT g.*, i.ticker, i.currency FROM goals g LEFT JOIN instruments i ON i.id=g.instrument_id ORDER BY g.id`);

const findById = id => one(`SELECT * FROM goals WHERE id=$1`, id);

const insert = ({ kind, instrumentId, targetQty, targetAmount, monthlyBudget }) => run(
  `INSERT INTO goals (kind,instrument_id,target_qty,target_amount,monthly_budget)
   VALUES ($1,$2,$3,$4,$5)`,
  kind, instrumentId, targetQty || 0, targetAmount, monthlyBudget);

const update = (id, { targetQty, targetAmount, monthlyBudget }) => run(
  `UPDATE goals SET target_qty=$1, target_amount=$2, monthly_budget=$3 WHERE id=$4`,
  targetQty || 0, targetAmount, monthlyBudget, id);

const remove = id => run(`DELETE FROM goals WHERE id=$1`, id);

module.exports = { listAll, findById, insert, update, remove };
