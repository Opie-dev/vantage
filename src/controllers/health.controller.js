const { pool } = require('../db');

/** Used by the container healthcheck (see compose.yml), so it must touch the DB. */
async function health(req, res) {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}

module.exports = { health };
