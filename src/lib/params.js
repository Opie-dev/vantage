/**
 * Route params are strings. `intId` returns a number only for a clean integer,
 * and null otherwise — so a junk id becomes a 400 rather than reaching Postgres
 * as a type error.
 */
const intId = v => (/^\d+$/.test(String(v)) ? Number(v) : null);

module.exports = { intId };
