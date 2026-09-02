const commitments = require('../services/commitments.service');
const { intId } = require('../lib/params');

const create = async (req, res) => res.json(await commitments.create(req.body));

async function update(req, res) {
  await commitments.update(intId(req.params.id), req.body);
  res.json({ ok: true });
}

async function remove(req, res) {
  await commitments.remove(intId(req.params.id));
  res.json({ ok: true });
}

const addPayment = async (req, res) =>
  res.json(await commitments.addPayment(intId(req.params.id), req.body));

async function removePayment(req, res) {
  await commitments.removePayment(intId(req.params.id), intId(req.params.paymentId));
  res.json({ ok: true });
}

module.exports = { create, update, remove, addPayment, removePayment };
