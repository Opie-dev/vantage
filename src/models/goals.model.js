const { get, one, run } = require('../db');

/**
 * Joined to ticker and currency, which the goal maths on the client needs, and
 * to the account name for an ASSET_BALANCE goal, so a goal row says what it is
 * measured against without the client having to go looking.
 *
 * LEFT JOIN on both, because an income goal names neither — it is portfolio-wide
 * — and an inner join would silently drop those rows. A goal never names both:
 * goals_shape_check makes sure of it.
 */
const listAll = () => get(
  `SELECT g.*, i.ticker, i.currency, a.name AS asset_name, a.slug AS asset_slug
     FROM goals g
     LEFT JOIN instruments i ON i.id=g.instrument_id
     LEFT JOIN assets a ON a.id=g.asset_id
    ORDER BY g.id`);

const findById = id => one(`SELECT * FROM goals WHERE id=$1`, id);

const insert = ({ kind, instrumentId, assetId, targetQty, targetAmount, monthlyBudget }) => run(
  `INSERT INTO goals (kind,instrument_id,asset_id,target_qty,target_amount,monthly_budget)
   VALUES ($1,$2,$3,$4,$5,$6)`,
  kind, instrumentId, assetId ?? null, targetQty || 0, targetAmount, monthlyBudget);

const update = (id, { targetQty, targetAmount, monthlyBudget }) => run(
  `UPDATE goals SET target_qty=$1, target_amount=$2, monthly_budget=$3 WHERE id=$4`,
  targetQty || 0, targetAmount, monthlyBudget, id);

const remove = id => run(`DELETE FROM goals WHERE id=$1`, id);

module.exports = { listAll, findById, insert, update, remove };
