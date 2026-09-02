const snapshots = require('../services/snapshots.service');

const save = async (req, res) => res.json(await snapshots.save(req.body));

module.exports = { save };
