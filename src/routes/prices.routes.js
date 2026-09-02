const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const prices = require('../controllers/prices.controller');

const router = Router();
router.post('/manual', asyncHandler(prices.setManual));
router.post('/refresh', asyncHandler(prices.refresh));

module.exports = router;
