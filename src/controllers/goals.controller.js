const goals = require('../services/goals.service');
const { intId } = require('../lib/params');

async function create(req, res) {
  await goals.create(req.body);
  res.json({ ok: true });
}

async function update(req, res) {
  await goals.update(intId(req.params.id), req.body);
  res.json({ ok: true });
}

async function remove(req, res) {
  await goals.remove(intId(req.params.id));
  res.json({ ok: true });
}

module.exports = { create, update, remove };
