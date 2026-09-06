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
const declaredRates = require('../models/declaredRates.model');
const commitments = require('../models/commitments.model');
const expensesModel = require('../models/expenses.model');
const brokerPositions = require('../models/brokerPositions.model');
const commitmentPayments = require('../models/commitmentPayments.model');
const cardPlans = require('../models/cardPlans.model');
const cardStatements = require('../models/cardStatements.model');
const merchantRules = require('../models/merchantRules.model');
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
    // The user's own record of what each fund declared. Overrides the
    // catalogue shipped in the frontend, per fund and financial year.
    declaredRates: await declaredRates.listAll(),
    // What you owe. The repayment schedule is NOT here — it is derived on the
    // client from each loan's terms; payments carry only the deviations.
    commitments: await commitments.listAll(),
    expenses: await expensesModel.listAll(),
    brokerPositions: await brokerPositions.listAll(),
    commitmentPayments: await commitmentPayments.listAll(),
    // The derivable half of a card. How many instalments have been paid is NOT
    // stored — calc.js works it out from the start date and the tenure, exactly as
    // it does for a loan. See cards-plan.md §5.
    cardPlans: await cardPlans.listAll(),
    // Dated readings of what a card owed. The float needs `owed` at TWO dates, and
    // a mutable balance column can only ever answer for today.
    cardStatements: await cardStatements.listAll(),
    // What a statement merchant IS. The importer applies these and never guesses;
    // an unmatched merchant is reported rather than filed. See §8.
    merchantRules: await merchantRules.listAll(),
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
    preferences: await preferences.get(),   // { pnlBasis, dashboardTheme, expenseTargetRM }
    lastSync: (await settings.get('last_sync')) || null,
  };
}

module.exports = { getState };
