const cash = require('../models/cash.model');
const { badRequest } = require('../middleware/errorHandler');

// Mirrors the CHECK constraint on cash_movements.type.
const TYPES = ['DEPOSIT', 'WITHDRAW', 'DIVIDEND', 'FEE'];

async function create(body) {
  const { type, currency, amount, date } = body;
  if (!TYPES.includes(type)) throw badRequest('bad type');
  await cash.insertManual({ type, currency, amount, date });
}

module.exports = { create, TYPES };
