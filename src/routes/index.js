/**
 * Every /api route, in one place. Each resource's paths live in its own router;
 * this file is the map of what exists.
 *
 *   GET    /api/auth/status        is a PIN set, and am I past it
 *   POST   /api/auth/login         { pin } -> session cookie
 *   POST   /api/auth/logout
 *   GET    /api/preferences        display preferences
 *   PATCH  /api/preferences        merge a partial update
 *   GET    /api/state              everything the frontend renders from
 *   POST   /api/instruments
 *   POST   /api/transactions
 *   DELETE /api/transactions/:id
 *   POST   /api/cash
 *   POST   /api/goals
 *   PATCH  /api/goals/:id
 *   DELETE /api/goals/:id
 *   POST   /api/assets                     ASB, Tabung Haji, EPF — not moomoo holdings
 *   PATCH  /api/assets/:id
 *   DELETE /api/assets/:id                 refused once it has entries; archive instead
 *   POST   /api/assets/:id/entries         a deposit, withdrawal, distribution or fee
 *   DELETE /api/assets/:id/entries/:entryId
 *   POST   /api/commitments                loans, cards, rent — what leaves each month
 *   PATCH  /api/commitments/:id
 *   DELETE /api/commitments/:id            refused once payments exist; end it instead
 *   POST   /api/commitments/:id/payments   a deviation from the derived schedule
 *   DELETE /api/commitments/:id/payments/:paymentId
 *   POST   /api/income                     salary, freelance — what arrives
 *   PATCH  /api/income/:id
 *   DELETE /api/income/:id                 refused once payments exist; end it instead
 *   POST   /api/income/:id/events          one payslip; books its EPF into the asset
 *   DELETE /api/income/:id/events/:eventId
 *   POST   /api/prices/manual
 *   POST   /api/prices/refresh
 *   POST   /api/ingest/moomoo      from sync/moomoo_sync.py
 *   POST   /api/declared-rates    record an institution's rate for one financial year
 *   DELETE /api/declared-rates/:id  drop it, falling back to the shipped catalogue
 *   POST   /api/sync              ask the host's sync agent to pull from moomoo
 *   POST   /api/snapshot           one row, or an array from sync/backfill_equity.py
 *   GET    /api/health             container healthcheck
 */
const { Router } = require('express');

const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/preferences', require('./preferences.routes'));
router.use('/state', require('./state.routes'));
router.use('/instruments', require('./instruments.routes'));
router.use('/transactions', require('./transactions.routes'));
router.use('/cash', require('./cash.routes'));
router.use('/goals', require('./goals.routes'));
router.use('/assets', require('./assets.routes'));
router.use('/commitments', require('./commitments.routes'));
router.use('/income', require('./income.routes'));
router.use('/declared-rates', require('./declaredRates.routes'));
router.use('/prices', require('./prices.routes'));
router.use('/ingest', require('./ingest.routes'));
router.use('/sync', require('./sync.routes'));
router.use('/snapshot', require('./snapshots.routes'));
router.use('/health', require('./health.routes'));

module.exports = router;
