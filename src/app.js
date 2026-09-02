// Assembles the Express app: middleware, routes, error handling. Exported without
// listening so server.js owns startup and tests could mount it directly.
const express = require('express');

const config = require('./config');
const routes = require('./routes');
const { apiNotFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(express.json({ limit: config.jsonLimit }));
// The React build. Registered before the API so an asset never falls through to
// a route, and it also serves index.html at /.
app.use(express.static(config.publicDir));

// The PIN gate sits in front of every route; it lets /api/auth/* and /api/health
// through, and is a no-op when no PIN is configured.
app.use('/api', requireAuth, routes);

// Order matters: unmatched /api paths become JSON 404s, then anything thrown
// anywhere above lands in the single error handler.
app.use(apiNotFound);
app.use(errorHandler);

module.exports = app;
