const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const declaredRates = require('../controllers/declaredRates.controller');

const router = Router();

// POST alone, no PATCH: a rate is identified by its fund and year rather than by
// its row id, and an institution declares once per year — so recording 2026
// twice is a correction of the same fact, which the model upserts.
router.post('/', asyncHandler(declaredRates.save));
router.delete('/:id', asyncHandler(declaredRates.remove));

module.exports = router;
