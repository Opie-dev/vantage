const instruments = require('../models/instruments.model');
const transactions = require('../models/transactions.model');
const { badRequest } = require('../middleware/errorHandler');

const SIDES = ['BUY', 'SELL', 'DIV'];

async function create(body) {
  const { ticker, side, trade_date } = body;
  const instrument = await instruments.findByTicker(ticker);
  if (!instrument) throw badRequest(`Unknown ticker ${ticker} — add the instrument first`);
  if (!SIDES.includes(side)) throw badRequest('side must be BUY/SELL/DIV');
  if (!trade_date) throw badRequest('trade_date required');
  const { qty, price, fees = 0, amount = null } = body;
  await transactions.insertManual(instrument.id, { side, qty, price, fees, amount, trade_date });
}

async function remove(id) {
  if (id === null) throw badRequest('bad id');
  await transactions.remove(id);
}

module.exports = { create, remove, SIDES };
