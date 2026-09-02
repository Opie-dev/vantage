const ingest = require('../services/ingest.service');

const moomoo = async (req, res) => res.json(await ingest.ingest(req.body));

module.exports = { moomoo };
