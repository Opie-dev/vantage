const ingest = require('../services/ingest.service');
const statementIngest = require('../services/statementIngest.service');
const statementParse = require('../services/statementParse.service');
const { badRequest } = require('../middleware/errorHandler');

const moomoo = async (req, res) => res.json(await ingest.ingest(req.body));

/** From sync/parse_maybank_statement.py --post. Re-runs the minimum gate before
 *  writing: a claim that arrives over HTTP is not a claim that has been checked. */
const statement = async (req, res) => res.json(await statementIngest.ingest(req.body));

/**
 * Parse an uploaded PDF and return what it found. Nothing is written.
 *
 * TWO STEPS, KEPT TWO. The screen shows the gates and the undecided merchants
 * first, and confirming sends the parsed payload back through the ordinary
 * import, which re-runs the minimum gate before writing. A parse that happened
 * on the server is still a claim.
 *
 * The password comes in a header, not the query string: a query string is the
 * part of a request that ends up in access logs, proxy logs and the Docker log
 * driver, and a header is not.
 */
const statementPdf = async (req, res) => {
  const raw = req.get('x-statement-password');
  let password;
  try {
    password = raw ? decodeURIComponent(raw) : undefined;
  } catch {
    throw badRequest('the password header is not encoded correctly');
  }
  res.json(await statementParse.parse(req.body, { password }));
};

module.exports = { moomoo, statement, statementPdf };
