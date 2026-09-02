const state = require('../services/state.service');

const getState = async (req, res) => res.json(await state.getState());

module.exports = { getState };
