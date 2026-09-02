const instruments = require('../services/instruments.service');

const create = async (req, res) => res.json(await instruments.create(req.body));

module.exports = { create };
