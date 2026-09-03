const { get, one, run } = require('../db');

/**
 * Every expense, joined to the slug of the wallet it came from.
 *
 * LEFT JOIN, unlike assetEntries.listAll(): `asset_id` is nullable here because
 * the log is useful before any wallet exists, and cash has no account at all. An
 * inner join would silently drop exactly the rows a new owner enters first.
 *
 * Newest first, with id as the tie-break — a day commonly carries several.
 */
const listAll = () => get(
  `SELECT e.*, a.slug AS asset_slug FROM expenses e
   LEFT JOIN assets a ON a.id = e.asset_id
   ORDER BY e.date DESC, e.id DESC`);

const findById = id => one(`SELECT * FROM expenses WHERE id=$1`, id);

const insert = ({ date, amount, currency, category, note, assetId, source }) => one(
  `INSERT INTO expenses (date,amount,currency,category,note,asset_id,source)
   VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
  date, amount, currency, category, note, assetId, source);

const update = (id, { date, amount, currency, category, note, assetId }) => run(
  `UPDATE expenses SET date=$1, amount=$2, currency=$3, category=$4, note=$5, asset_id=$6
   WHERE id=$7`,
  date, amount, currency, category, note, assetId, id);

const remove = id => run(`DELETE FROM expenses WHERE id=$1`, id);

/** Guards the asset delete the same way asset entries do. */
const countForAsset = async assetId =>
  Number((await one(`SELECT count(*)::int AS n FROM expenses WHERE asset_id=$1`, assetId)).n);

module.exports = { listAll, findById, insert, update, remove, countForAsset };
