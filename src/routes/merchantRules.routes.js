const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const rules = require('../controllers/merchantRules.controller');

const router = Router();
// Upserts on the pattern: re-deciding a merchant corrects its rule rather than
// leaving two for the matcher to arbitrate between.
router.post('/', asyncHandler(rules.upsert));
router.delete('/:id', asyncHandler(rules.remove));

module.exports = router;
