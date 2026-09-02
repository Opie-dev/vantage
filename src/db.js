// Postgres connection and the small query helpers every model uses.
// Data lives in the `vantage` database on the devdata Postgres container
// (dev-postgres, 127.0.0.1:5433). Override with DATABASE_URL.
//
// The schema is NOT defined here. It lives in db/migrations and is applied with
// dbmate (`npm run db:up`, or the `migrate` service under Docker) — one source of
// truth, and a record of every change. This file only checks that it has run.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://semaisens:secret@127.0.0.1:5433/vantage',
  max: 10,
});

/* ---------- query helpers ----------
   Every one takes parameters variadically so callers read as SQL first, values
   second. `q` in the model layer is either this pool or a client checked out for
   a transaction — passing a client is what keeps a multi-statement write atomic. */
const get = async (sql, ...a) => (await pool.query(sql, a)).rows;
const one = async (sql, ...a) => (await pool.query(sql, a)).rows[0] || null;
const run = async (sql, ...a) => pool.query(sql, a);

/**
 * Runs `fn(client)` inside BEGIN/COMMIT, rolling back on any throw and always
 * returning the connection. Every multi-row write goes through this.
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Called once at startup, before the server listens.
 *
 * Refusing to boot against an unmigrated database is deliberate: the alternative
 * is a server that starts fine and then 500s on every request with a "relation
 * does not exist" nobody reads.
 */
async function init() {
  const { rows } = await pool.query(`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS tracked,
           to_regclass('public.instruments')       IS NOT NULL AS ready`);
  if (!rows[0].tracked || !rows[0].ready) {
    throw new Error('database has no schema — run the migrations first (npm run db:up)');
  }
}

module.exports = { pool, init, get, one, run, transaction };
