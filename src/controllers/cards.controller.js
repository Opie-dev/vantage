const cards = require('../services/cards.service');
const { intId } = require('../lib/params');

const addPlan = async (req, res) =>
  res.json(await cards.addPlan(intId(req.params.id), req.body));

async function updatePlan(req, res) {
  await cards.updatePlan(intId(req.params.id), intId(req.params.planId), req.body);
  res.json({ ok: true });
}

async function removePlan(req, res) {
  await cards.removePlan(intId(req.params.id), intId(req.params.planId));
  res.json({ ok: true });
}

const addStatement = async (req, res) =>
  res.json(await cards.addStatement(intId(req.params.id), req.body));

async function removeStatement(req, res) {
  await cards.removeStatement(intId(req.params.id), intId(req.params.statementId));
  res.json({ ok: true });
}

module.exports = { addPlan, updatePlan, removePlan, addStatement, removeStatement };
