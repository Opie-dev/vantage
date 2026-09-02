const { get, one, run } = require('../db');

/**
 * Every entry, joined to its asset's slug.
 *
 * The join mirrors goals.model.listAll(): the client groups and labels by slug,
 * and making it do a second lookup against `assets` for every row would be work
 * the database has already done. INNER JOIN is right here — asset_id is NOT NULL
 * with a foreign key, so an orphan entry cannot exist.
 *
 * Newest first, with id as the tie-break because several entries commonly share
 * one date (a payroll month books EPF on the same day you record a deposit).
 */
const listAll = () => get(
  `SELECT e.*, a.slug FROM asset_entries e
   JOIN assets a ON a.id = e.asset_id
   ORDER BY e.date DESC, e.id DESC`);

const findById = id => one(`SELECT * FROM asset_entries WHERE id=$1`, id);

const insert = ({ assetId, type, date, amount, note, source }) => one(
  `INSERT INTO asset_entries (asset_id,type,date,amount,note,source)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
  assetId, type, date, amount, note, source);

const remove = id => run(`DELETE FROM asset_entries WHERE id=$1`, id);

/** Guards the asset delete: an asset with history is archived, never dropped. */
const countForAsset = async assetId =>
  Number((await one(`SELECT count(*)::int AS n FROM asset_entries WHERE asset_id=$1`, assetId)).n);

module.exports = { listAll, findById, insert, remove, countForAsset };
