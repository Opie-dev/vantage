/**
 * Express 4 does not catch rejected promises from async handlers — an unhandled
 * rejection would hang the request instead of returning a 500. Wrapping funnels
 * it into the error handler.
 *
 * Every async route handler must be wrapped. This was `wrap()` in the old
 * single-file server.
 */
module.exports = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
