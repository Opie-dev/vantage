// The settings table is a tiny key/value store: fx rate, last sync time, and the
// broker's cash pockets as JSON.
const { pool, one } = require('../db');

/** Raw string value for a key, or undefined. */
async function get(key) {
  return ((await one(`SELECT value FROM settings WHERE key=$1`, key)) || {}).value;
}

/** Upsert. `q` is the pool, or a client when inside a transaction. */
function set(q, key, value) {
  return q.query(
    `INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, String(value)]);
}

/** Value parsed as JSON, or `fallback` when unset or unparseable. */
async function getJSON(key, fallback) {
  const raw = await get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

module.exports = { get, set, getJSON, pool };
