const ingest = require('../services/ingest.service');
const statementIngest = require('../services/statementIngest.service');

const moomoo = async (req, res) => res.json(await ingest.ingest(req.body));

/** From sync/parse_maybank_statement.py --post. Re-runs the minimum gate before
 *  writing: a claim that arrives over HTTP is not a claim that has been checked. */
const statement = async (req, res) => res.json(await statementIngest.ingest(req.body));

module.exports = { moomoo, statement };
