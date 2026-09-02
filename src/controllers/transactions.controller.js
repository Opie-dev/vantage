const transactions = require('../services/transactions.service');
const { intId } = require('../lib/params');

async function create(req, res) {
  await transactions.create(req.body);
  res.json({ ok: true });
}

async function remove(req, res) {
  await transactions.remove(intId(req.params.id));
  res.json({ ok: true });
}

module.exports = { create, remove };
