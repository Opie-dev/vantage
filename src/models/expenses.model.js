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

/**
 * An imported expense, keyed so the same statement line can never land twice.
 *
 * ON CONFLICT DO NOTHING against the UNIQUE `ext_id` is what makes re-running the
 * importer a no-op rather than a duplicate — enforced by the database, not by the
 * importer remembering to check. Returns null when the row was already there,
 * which is how the caller counts what it actually added.
 */
const insertImported = ({ date, amount, currency, category, note, extId }) => one(
  `INSERT INTO expenses (date,amount,currency,category,note,source,ext_id)
   VALUES ($1,$2,$3,$4,$5,'import',$6)
   ON CONFLICT (ext_id) DO NOTHING
   RETURNING *`,
  date, amount, currency, category, note, extId);

/**
 * Move a row from the key an earlier import gave it to the key it has now.
 * Null when there is no such row — or when the new key is already taken, in
 * which case the insert that follows sees the conflict and books nothing.
 */
const rekey = (from, to) => one(
  `UPDATE expenses SET ext_id=$2
   WHERE ext_id=$1 AND NOT EXISTS (SELECT 1 FROM expenses WHERE ext_id=$2)
   RETURNING *`,
  from, to);

/**
 * The row an earlier import of the same statement already booked.
 *
 * `insertImported` returns null on conflict, which says "already there" without
 * saying WHICH row is there — enough while the answer was only a count, not
 * enough now that a card_transactions line has to point at the expense it
 * produced. A re-import must reach the same row rather than record that it
 * booked nothing.
 */
const findByExtId = extId => one(`SELECT * FROM expenses WHERE ext_id=$1`, extId);

const remove = id => run(`DELETE FROM expenses WHERE id=$1`, id);

/** Guards the asset delete the same way asset entries do. */
const countForAsset = async assetId =>
  Number((await one(`SELECT count(*)::int AS n FROM expenses WHERE asset_id=$1`, assetId)).n);

module.exports = {
  listAll, findById, findByExtId, insert, insertImported, rekey, update, remove, countForAsset,
};
