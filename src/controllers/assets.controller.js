const assets = require('../services/assets.service');
const { intId } = require('../lib/params');

const create = async (req, res) => res.json(await assets.create(req.body));

async function update(req, res) {
  await assets.update(intId(req.params.id), req.body);
  res.json({ ok: true });
}

async function remove(req, res) {
  await assets.remove(intId(req.params.id));
  res.json({ ok: true });
}

const addEntry = async (req, res) => res.json(await assets.addEntry(intId(req.params.id), req.body));

async function removeEntry(req, res) {
  await assets.removeEntry(intId(req.params.id), intId(req.params.entryId));
  res.json({ ok: true });
}

module.exports = { create, update, remove, addEntry, removeEntry };
