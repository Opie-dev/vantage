/**
 * The Sync button's server half.
 *
 * The app cannot talk to moomoo itself. OpenD listens on the HOST's loopback and
 * the app runs in a container, so this proxies to sync/moomoo_sync.py --serve,
 * which sits on the host and owns the OpenD session. That worker is read-only by
 * construction (every call a *_query / get_*), and its listener exposes exactly
 * one action — run the same sync the scheduled task already runs. There is no
 * path through here to an order.
 *
 * A failure to reach the agent is the ordinary case, not a bug: OpenD gets closed,
 * the agent window gets shut. It must come back as a sentence the owner can act
 * on, not a stack trace.
 */
const config = require('../config');
const { HttpError } = require('../middleware/errorHandler');

// A cold run scans ~14 clearing dates at ~1.7s each on top of the deal history,
// so the ceiling has to be generous or the button times out on a working sync.
const RUN_TIMEOUT_MS = 240000;

const START_HINT = 'start it with sync\\run_agent.cmd';

/** The PIN travels the same way the worker sends it, so the agent can gate too. */
const headers = () => (config.pin ? { 'X-Vantage-Pin': config.pin } : {});

async function call(path, { method = 'GET', timeout }) {
  let res;
  try {
    res = await fetch(`${config.syncAgentUrl}${path}`, {
      method,
      headers: headers(),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    // Connection refused, DNS, or the abort above — from the owner's side these
    // are one thing: nothing is listening for me right now.
    const why = e.name === 'TimeoutError' ? 'did not answer in time' : 'is not running';
    throw new HttpError(503, `The moomoo sync agent ${why} — ${START_HINT}`);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 409 ? 409 : 502, body.error || `sync agent ${res.status}`);
  return body;
}

/**
 * Runs one sync and returns what it stored.
 * @returns {Promise<{ok:true, counts:object}>}
 */
const run = () => call('/run', { method: 'POST', timeout: RUN_TIMEOUT_MS });

module.exports = { run };
