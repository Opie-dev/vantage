const declaredRates = require('../services/declaredRates.service');
const { intId } = require('../lib/params');

const save = async (req, res) => res.json(await declaredRates.save(req.body));

async function remove(req, res) {
  await declaredRates.remove(intId(req.params.id));
  res.json({ ok: true });
}

module.exports = { save, remove };
