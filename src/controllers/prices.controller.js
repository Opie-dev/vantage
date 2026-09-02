const prices = require('../services/prices.service');

async function refresh(req, res) {
  res.json({ results: await prices.refreshFromYahoo() });
}

async function setManual(req, res) {
  await prices.setManual(req.body);
  res.json({ ok: true });
}

module.exports = { refresh, setManual };
