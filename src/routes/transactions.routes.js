const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const transactions = require('../controllers/transactions.controller');

const router = Router();
router.post('/', asyncHandler(transactions.create));
router.delete('/:id', asyncHandler(transactions.remove));

module.exports = router;
