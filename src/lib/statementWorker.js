/**
 * The statement parser, on its own thread.
 *
 * WHY A THREAD AND NOT A TIMER. pdf.js in Node runs its "worker" on the main
 * thread — there is no worker_threads anywhere in the build — and it yields only
 * via microtasks. A pathological PDF therefore blocks the event loop completely:
 * no timer fires, no other request is served, /api/health included. Measured on
 * the real parse path: a 2.7 KB file built to fan out form XObjects took five
 * minutes; a one-megabyte Flate bomb inflated to 2.2 GB. A Promise.race against
 * a timer is theatre — the timer cannot fire while the parse holds the loop.
 *
 * Here the parse happens where terminate() can reach it. The parent keeps
 * serving, the clock is real, and a file that is not a statement is refused in
 * twenty seconds with a sentence instead of an unhealthy container.
 *
 * WHAT THIS DOES NOT BOUND. resourceLimits caps the V8 heap; pdf.js's decoded
 * streams are ArrayBuffers, which are external memory the cap does not see. The
 * ceiling for those is the container's memory limit in compose.yml — this thread
 * bounds time, and the container bounds space.
 */
const { workerData, parentPort } = require('node:worker_threads');
const statement = require('./maybankStatement');

const { data, password } = workerData;
const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

statement
  .parse(buffer, { password })
  .then(result => parentPort.postMessage({ result }))
  .catch(e => parentPort.postMessage({ error: { message: e.message, status: e.status } }));
