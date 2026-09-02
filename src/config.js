// Everything environment-dependent, in one place.
const path = require('path');

module.exports = {
  port: process.env.PORT || 8123,
  // The React build lands here (web/vite.config.js writes to ../public) and is
  // served statically by the same Express app that serves /api.
  publicDir: path.join(__dirname, '..', 'public'),
  jsonLimit: '2mb',
  // Optional single-PIN gate. Unset (the default) means no auth at all, which
  // is fine while the app is bound to loopback. Set VANTAGE_PIN before exposing
  // it anywhere else. The sync worker sends the same value as X-Vantage-Pin.
  pin: process.env.VANTAGE_PIN || null,
  // The Sync button proxies here: sync/moomoo_sync.py --serve, running on the
  // HOST because OpenD does. From inside the container the host is
  // host.docker.internal; running the app with npm start it is 127.0.0.1.
  syncAgentUrl: process.env.SYNC_AGENT_URL || 'http://host.docker.internal:8124',
  // Used when nothing has synced yet; the sync worker overwrites it with the
  // rate moomoo itself is using (see moomoo_sync.py).
  defaultFxUsdMyr: '4.22',
};
