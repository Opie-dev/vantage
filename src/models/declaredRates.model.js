const { get, one, run } = require('../db');

/**
 * The rates the user has recorded for an institution's funds.
 *
 * Ordered newest first within a fund, because that is the order the form and the
 * settings screen both read them in and it saves both a sort.
 */
const listAll = () => get(
  `SELECT * FROM declared_rates ORDER BY product_id, year DESC`);

const findById = id => one(`SELECT * FROM declared_rates WHERE id=$1`, id);

const findByProductYear = (productId, year) => one(
  `SELECT * FROM declared_rates WHERE product_id=$1 AND year=$2`, productId, year);

/**
 * Upsert on (product_id, year).
 *
 * Recording a year twice is a correction, not a second rate — an institution
 * declares once per year — so the unique index turns what would be a duplicate
 * into an update of the row already there.
 */
const upsert = ({ institutionId, productId, year, rate, bonus, shariah, note }) => one(
  `INSERT INTO declared_rates (institution_id,product_id,year,rate,bonus,shariah,note)
   VALUES ($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT (product_id, year) DO UPDATE SET
     institution_id=excluded.institution_id,
     rate=excluded.rate, bonus=excluded.bonus, shariah=excluded.shariah,
     note=excluded.note, updated_at=now()
   RETURNING *`,
  institutionId, productId, year, rate, bonus, shariah, note);

const remove = id => run(`DELETE FROM declared_rates WHERE id=$1`, id);

module.exports = { listAll, findById, findByProductYear, upsert, remove };
