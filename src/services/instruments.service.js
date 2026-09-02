const { pool } = require('../db');
const instruments = require('../models/instruments.model');
const { badRequest } = require('../middleware/errorHandler');

async function create(body) {
  const { ticker, market, currency } = body;
  if (!ticker || !market || !currency) throw badRequest('ticker, market, currency required');
  return instruments.ensure(pool, body);
}

module.exports = { create };
