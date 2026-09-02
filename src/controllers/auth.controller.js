const config = require('../config');
const auth = require('../middleware/auth');

/** Whether a PIN is configured at all, and whether this caller is past it. */
function status(req, res) {
  res.json({ required: Boolean(config.pin), authenticated: auth.authenticated(req) });
}

function login(req, res) {
  if (!config.pin) return res.json({ ok: true, required: false });

  const ip = req.ip || 'local';
  if (auth.throttled(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  }
  const pin = req.body && req.body.pin;
  if (typeof pin !== 'string' || !auth.sameSecret(pin, config.pin)) {
    auth.recordFailure(ip);
    return res.status(401).json({ error: 'Wrong PIN' });
  }
  auth.clearFailures(ip);
  auth.setCookie(res, auth.issue(config.pin));
  res.json({ ok: true });
}

function logout(req, res) {
  auth.clearCookie(res);
  res.json({ ok: true });
}

module.exports = { status, login, logout };
