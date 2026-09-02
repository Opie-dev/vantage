const cash = require('../services/cash.service');

async function create(req, res) {
  await cash.create(req.body);
  res.json({ ok: true });
}

module.exports = { create };
