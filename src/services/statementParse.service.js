/**
 * Read a statement PDF the owner just uploaded — in-process, in memory.
 *
 * NOTHING TOUCHES DISK. The bytes arrive in the request body, go to pdf.js as a
 * buffer, and are gone when the request is. A card statement is the single most
 * sensitive document this app handles and it has no business surviving the
 * request that carried it — not in a temp file, not in a log.
 *
 * NOTHING IS TRUSTED BECAUSE IT WAS PARSED HERE. This returns the parser's
 * output unchanged — header, gates, rows — and the caller feeds it to the same
 * ingest a pasted payload goes through, which re-runs the minimum gate before
 * writing. A parse that happened in-process is still a claim.
 *
 * WHY THIS EXISTS. The first import screen asked the owner to open a terminal
 * and run a Python parser, because that parser needed Xpdf's `pdftotext -table`
 * and no container image has it. The answer was never a queue or a host agent;
 * it was an extractor that runs where the app runs. src/lib/maybankStatement.js
 * is that, verified identical to the Python on a real statement.
 */
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { badRequest, HttpError } = require('../middleware/errorHandler');

const WORKER = path.join(__dirname, '..', 'lib', 'statementWorker.js');
/** Long past any real statement, short of a container going unhealthy. */
const TIMEOUT_MS = 20000;
/** V8 heap only — see the worker's header for what this does not bound. */
const HEAP_MB = 512;

/** A Maybank e-statement is a few hundred kilobytes. Ten megabytes is a
 *  generous ceiling that still refuses anything that is not a statement. */
const MAX_BYTES = 10 * 1024 * 1024;

/** `%PDF-` — so a mistyped upload fails here rather than inside the parser. */
const looksLikePdf = buf =>
  buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

/**
 * Parse `buffer` and return `{ statement, gates, rows, gatesPassed }` — the shape
 * the CLI prints, so nothing downstream can tell which extractor ran.
 *
 * A FAILED GATE IS NOT AN ERROR HERE. The parser still returns the JSON that
 * says which gate failed and by how much, and the screen shows the refusal with
 * the figures behind it — which is more use than a message saying no.
 */
async function parse(buffer, { password } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw badRequest('no file was uploaded');
  if (buffer.length > MAX_BYTES) {
    throw badRequest(
      `that file is ${(buffer.length / 1024 / 1024).toFixed(1)}MB — statements are a few hundred KB`);
  }
  if (!looksLikePdf(buffer)) throw badRequest('that is not a PDF');
  return parseOnThread(buffer, password ? String(password) : undefined);
}

/**
 * Run the parser where a wall clock can stop it.
 *
 * pdf.js holds the event loop while it works, so this is the only timeout that
 * is real — see statementWorker.js. The bytes are copied once into a standalone
 * ArrayBuffer and transferred, so the request body is never shared with the
 * thread and nothing here can detach it.
 */
function parseOnThread(buffer, password) {
  return new Promise((resolve, reject) => {
    const data = new Uint8Array(buffer);
    const worker = new Worker(WORKER, {
      workerData: { data, password },
      transferList: [data.buffer],
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    });

    let settled = false;
    const settle = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(v);
    };
    const timer = setTimeout(() => {
      settle(reject, badRequest(
        `gave up on that PDF after ${TIMEOUT_MS / 1000} seconds \u2014 it is not a statement`));
      worker.terminate();
    }, TIMEOUT_MS);

    worker.once('message', m => {
      if (m.error) {
        // The parser's refusals cross the thread as data and are rebuilt as
        // the same HTTP error they would have been in-process.
        settle(reject, new HttpError(m.error.status || 400, m.error.message));
      } else {
        settle(resolve, m.result);
      }
    });
    worker.once('error', e => settle(reject,
      e && e.code === 'ERR_WORKER_OUT_OF_MEMORY'
        ? badRequest('that PDF needs more memory than any statement')
        : e));
    worker.once('exit', code => settle(reject, new Error(`statement worker exited ${code}`)));
  });
}

module.exports = { parse, MAX_BYTES };
