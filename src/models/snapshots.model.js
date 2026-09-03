const { get, one } = require('../db');

const listAll = () => get(`SELECT * FROM snapshots ORDER BY date`);

/** Today according to Postgres, so the app and the database never disagree on it. */
const todayISO = async () => (await one(`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS d`)).d;

const UPSERT = `
  INSERT INTO snapshots (date,value_rm,cash_rm) VALUES ($1,$2,$3)
  ON CONFLICT(date) DO UPDATE SET value_rm=excluded.value_rm, cash_rm=excluded.cash_rm`;

const upsert = (q, { date, value_rm, cash_rm }) => q.query(UPSERT, [date, value_rm, cash_rm]);

/** Today's row, written by the sync worker from the broker's own figures. */
const upsertToday = (q, valueRm, cashRm) => q.query(
  `INSERT INTO snapshots (date,value_rm,cash_rm) VALUES (to_char(CURRENT_DATE,'YYYY-MM-DD'),$1,$2)
   ON CONFLICT(date) DO UPDATE SET value_rm=excluded.value_rm, cash_rm=excluded.cash_rm`,
  [valueRm, cashRm]);

/**
 * Today's owned side: what the accounts outside moomoo hold, and what is owed.
 *
 * THE COLUMN LIST IS THE POINT. This sets assets_rm and liabilities_rm and names
 * neither value_rm nor cash_rm, exactly as upsertToday() sets those two and names
 * neither of these. Two writers, one column pair each, so a sync that knows
 * nothing about assets cannot blank them, and this cannot blank the broker's own
 * figures. The INSERT branch has to supply the broker columns because they are
 * NOT NULL — zeros there are a row this writer got to first, which the sync then
 * overwrites with real figures on its own next run.
 */
const upsertOwned = (q, assetsRm, liabilitiesRm) => q.query(
  `INSERT INTO snapshots (date,value_rm,cash_rm,assets_rm,liabilities_rm)
   VALUES (to_char(CURRENT_DATE,'YYYY-MM-DD'),0,0,$1,$2)
   ON CONFLICT(date) DO UPDATE SET assets_rm=excluded.assets_rm, liabilities_rm=excluded.liabilities_rm`,
  [assetsRm, liabilitiesRm]);

module.exports = { listAll, todayISO, upsert, upsertToday, upsertOwned };
