const expenses = require('../services/expenses.service');
const { intId } = require('../lib/params');

async function create(req, res) {
  await expenses.create(req.body);
  res.json({ ok: true });
}

async function update(req, res) {
  await expenses.update(intId(req.params.id), req.body);
  res.json({ ok: true });
}

async function remove(req, res) {
  await expenses.remove(intId(req.params.id));
  res.json({ ok: true });
}

module.exports = { create, update, remove };
