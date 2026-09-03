const { get, one, run } = require('../db');

/** Slugs are the stable key the UI addresses an asset by, stored and compared lowercase. */
const norm = s => String(s || '').toLowerCase();

/**
 * Every asset, archived ones included — the client decides what to show. Ordered
 * by sort_order so the owner controls the card order on the Assets screen, with
 * id as the tie-break so the order is total and never flickers between renders.
 */
const listAll = () => get(`SELECT * FROM assets ORDER BY sort_order, id`);

const findById = id => one(`SELECT * FROM assets WHERE id=$1`, id);

const findBySlug = slug => one(`SELECT * FROM assets WHERE slug=$1`, norm(slug));

const insert = ({
  kind, name, slug, currency, institution, accountRef, unitLabel, unitCap,
  fiscalYear, rateBasis, rateQuote, lastRate, lastBonus, sortOrder, productId, liquidity,
}) => one(
  `INSERT INTO assets
     (kind,name,slug,currency,institution,account_ref,unit_label,unit_cap,
      fiscal_year,rate_basis,rate_quote,last_rate,last_bonus,sort_order,product_id,liquidity)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
  kind, name, norm(slug), currency, institution, accountRef, unitLabel, unitCap,
  fiscalYear, rateBasis, rateQuote, lastRate, lastBonus, sortOrder, productId, liquidity);

/** Accounts created from one catalogue entry. Used to split a payroll EPF
 *  contribution across the three accounts it is actually allocated to. */
const findByProductIds = ids => get(
  `SELECT * FROM assets WHERE product_id = ANY($1) AND NOT archived ORDER BY id`, ids);

/** Every column the service lets you change. `slug` is not one of them — it is the
 *  key the UI addresses the asset by, and renaming it would orphan those links. */
const update = (id, {
  name, currency, institution, accountRef, unitLabel, unitCap,
  fiscalYear, rateBasis, rateQuote, lastRate, lastBonus, sortOrder, archived, liquidity,
}) => run(
  `UPDATE assets SET
     name=$1, currency=$2, institution=$3, account_ref=$4, unit_label=$5, unit_cap=$6,
     fiscal_year=$7, rate_basis=$8, rate_quote=$9, last_rate=$10, last_bonus=$11,
     sort_order=$12, archived=$13, liquidity=$14
   WHERE id=$15`,
  name, currency, institution, accountRef, unitLabel, unitCap,
  fiscalYear, rateBasis, rateQuote, lastRate, lastBonus, sortOrder, archived, liquidity, id);

const remove = id => run(`DELETE FROM assets WHERE id=$1`, id);

module.exports = { norm, listAll, findById, findBySlug, findByProductIds, insert, update, remove };
