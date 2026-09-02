const sync = require('../services/sync.service');

async function run(req, res) {
  res.json(await sync.run());
}

module.exports = { run };
