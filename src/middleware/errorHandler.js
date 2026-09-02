/**
 * Terminal middleware. Both must be registered after the routes.
 *
 * `HttpError` lets a service reject with a status without knowing anything about
 * Express — a controller throws it and the shape of the response is decided here,
 * in one place, rather than in every handler.
 */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 400 with a message, the common case for a bad request body. */
const badRequest = message => new HttpError(400, message);
/** 404 with a message. */
const notFound = message => new HttpError(404, message);

/** Anything under /api that matched no route is a 404 as JSON, not Express's HTML page. */
function apiNotFound(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars -- Express identifies the error handler by arity
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  // A 500 is a bug worth seeing in full; a 4xx is the client being told something
  // it already knows, so logging the stack for those is just noise.
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
}

module.exports = { HttpError, badRequest, notFound, apiNotFound, errorHandler };
