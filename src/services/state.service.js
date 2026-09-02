// One payload the whole frontend renders from — it fetches this and derives
// everything else client-side (see web/src/lib/calc.js).
const config = require('../config');
const instruments = require('../models/instruments.model');
const transactions = require('../models/transactions.model');
const cash = require('../models/cash.model');
const prices = require('../models/prices.model');
const goals = require('../models/goals.model');
const assets = require('../models/assets.model');
const assetEntries = require('../models/assetEntries.model');
const commitments = require('../models/commitments.model');
const commitmentPayments = require('../models/commitmentPayments.model');
const income = require('../models/income.model');
const snapshots = require('../models/snapshots.model');
const fundMetrics = require('../models/fundMetrics.model');
const fundDistributions = require('../models/fundDistributions.model');
const settings = require('../models/settings.model');
const preferences = require('./preferences.service');

async function getState() {
  return {
    instruments: await instruments.listAll(),
    transactions: await transactions.listAll(),
    cash: await cash.listAll(),
    prices: await prices.listAll(),
    goals: await goals.listAll(),
    // Holdings outside moomoo. Balances are NOT stored — the client derives them
    // from assetEntries, as it derives positions from transactions.
    assets: await assets.listAll(),
    assetEntries: await assetEntries.listAll(),
    // What you owe. The repayment schedule is NOT here — it is derived on the
    // client from each loan's terms; payments carry only the deviations.
    commitments: await commitments.listAll(),
    commitmentPayments: await commitmentPayments.listAll(),
    // What arrives. Net pay is NOT stored: it is gross less the deducted half
    // of the statutory block, derived on the client so the two column groups
    // can never be conflated into one wrong figure.
    incomeSources: await income.listSources(),
    incomeEvents: await income.listEvents(),
    snapshots: await snapshots.listAll(),
    fundMetrics: await fundMetrics.listAll(),   // ETF facts per holding, see fund_metrics
    // What each fund DECLARED, distinct from the DIV transactions you received.
    distributions: await fundDistributions.listRecent(),
    fx: parseFloat((await settings.get('fx_usd_myr')) || config.defaultFxUsdMyr),
    // [{currency, cash}] — the broker's real per-wallet pockets. NOT summable with
    // each other in different currencies without the fx rate above.
    funds: await settings.getJSON('funds', []),
    preferences: await preferences.get(),   // { pnlBasis, dashboardTheme } — see preferences.service.js
    lastSync: (await settings.get('last_sync')) || null,
  };
}

module.exports = { getState };
