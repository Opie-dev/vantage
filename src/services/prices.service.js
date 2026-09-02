// Price sources. OpenD quotes arrive through the ingest service; this covers the
// two fallbacks — Yahoo when OpenD is not running, and a manual override.
const instruments = require('../models/instruments.model');
const prices = require('../models/prices.model');
const { badRequest } = require('../middleware/errorHandler');

/** Unofficial endpoint, so treat any shape surprise as a failure for that ticker. */
async function yahooPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof p !== 'number') throw new Error('no price in response');
  return p;
}

/**
 * Refresh every instrument that has a Yahoo symbol. One ticker failing must not
 * abandon the rest, so each result is reported individually and the response is
 * always a 200 — the UI shows which ones failed.
 */
async function refreshFromYahoo() {
  const rows = await instruments.listWithYahooSymbol();
  const results = [];
  for (const i of rows) {
    try {
      const price = await yahooPrice(i.yahoo_symbol);
      await prices.upsert(null, i.id, price, 'yahoo');
      results.push({ ticker: i.ticker, price, ok: true });
    } catch (e) {
      results.push({ ticker: i.ticker, ok: false, error: e.message });
    }
  }
  return results;
}

async function setManual({ ticker, price }) {
  const instrument = await instruments.findByTicker(ticker);
  if (!instrument) throw badRequest('unknown ticker');
  await prices.setManual(instrument.id, price);
}

module.exports = { refreshFromYahoo, setManual, yahooPrice };
