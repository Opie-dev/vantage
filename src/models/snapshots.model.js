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

module.exports = { listAll, todayISO, upsert, upsertToday };
