const preferences = require('../services/preferences.service');

const read = async (req, res) => res.json(await preferences.get());
const write = async (req, res) => res.json(await preferences.update(req.body));

module.exports = { read, write };
