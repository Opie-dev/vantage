/**
 * Single-PIN gate for the API.
 *
 * Off by default: with no VANTAGE_PIN set the app behaves exactly as before, so
 * an existing local install is unaffected. Set the env var and every /api route
 * needs either a session cookie or the PIN as a header.
 *
 * The session token is an HMAC over its own expiry — no server-side store, so it
 * survives restarts and there is nothing to clean up. The key is derived from the
 * PIN, which means changing the PIN invalidates every existing session for free.
 *
 * Only the API is guarded. The static React bundle is served to anyone, which is
 * fine — it holds no data, and it renders the lock screen when /api/state 401s.
 */
const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'vantage_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days — this is a personal tracker
const OPEN_PATHS = new Set(['/health']);   // container healthcheck must not need a PIN

const key = pin => crypto.createHash('sha256').update(`vantage-session:${pin}`).digest();

/** Constant-time compare that tolerates different lengths without leaking them. */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function issue(pin) {
  const exp = Date.now() + TTL_MS;
  const sig = crypto.createHmac('sha256', key(pin)).update(String(exp)).digest('base64url');
  return `${exp}.${sig}`;
}

function valid(token, pin) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [exp, sig] = token.split('.', 2);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', key(pin)).update(exp).digest('base64url');
  return sameSecret(sig, expected);
}

/** One cookie, parsed without pulling in cookie-parser. */
function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(res, token) {
  // No Secure flag: this is served over plain http on loopback, and setting it
  // would make the browser drop the cookie entirely.
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}; HttpOnly; SameSite=Lax`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/* Failed-attempt throttle. In-memory and per-process, which is all a
   single-user app bound to loopback needs — it exists to make brute force
   tedious, not to survive a restart. */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function throttled(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW_MS) return false;
  return a.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(ip, { first: Date.now(), count: 1 });
  else a.count += 1;
}

const clearFailures = ip => attempts.delete(ip);

/** True when the caller already proved themselves, by cookie or by header. */
function authenticated(req) {
  const pin = config.pin;
  if (!pin) return true;
  // The sync worker is a script with no cookie jar, so it sends the PIN directly.
  const header = req.get('x-vantage-pin');
  if (header && sameSecret(header, pin)) return true;
  return valid(readCookie(req, COOKIE), pin);
}

/** Mounted under /api, so req.path here is '/state', '/auth/login', … */
function requireAuth(req, res, next) {
  if (!config.pin) return next();
  if (req.path.startsWith('/auth/') || OPEN_PATHS.has(req.path)) return next();
  if (authenticated(req)) return next();
  res.status(401).json({ error: 'PIN required' });
}

module.exports = {
  requireAuth, authenticated, issue, setCookie, clearCookie,
  sameSecret, throttled, recordFailure, clearFailures,
};
