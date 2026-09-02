const income = require('../services/income.service');
const { intId } = require('../lib/params');

const create = async (req, res) => res.json(await income.createSource(req.body));

async function update(req, res) {
  await income.updateSource(intId(req.params.id), req.body);
  res.json({ ok: true });
}

async function remove(req, res) {
  await income.removeSource(intId(req.params.id));
  res.json({ ok: true });
}

const addEvent = async (req, res) => res.json(await income.addEvent(intId(req.params.id), req.body));

const removeEvent = async (req, res) =>
  res.json(await income.removeEvent(intId(req.params.id), intId(req.params.eventId)));

module.exports = { create, update, remove, addEvent, removeEvent };
