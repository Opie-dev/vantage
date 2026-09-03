const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const expenses = require('../controllers/expenses.controller');

const router = Router();
router.post('/', asyncHandler(expenses.create));
router.patch('/:id', asyncHandler(expenses.update));
router.delete('/:id', asyncHandler(expenses.remove));

module.exports = router;
