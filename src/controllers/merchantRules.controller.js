const rules = require('../services/merchantRules.service');
const { intId } = require('../lib/params');

const upsert = async (req, res) => res.json(await rules.upsert(req.body));

async function remove(req, res) {
  await rules.remove(intId(req.params.id));
  res.json({ ok: true });
}

module.exports = { upsert, remove };
