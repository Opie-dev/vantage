const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const goals = require('../controllers/goals.controller');

const router = Router();
router.post('/', asyncHandler(goals.create));
router.patch('/:id', asyncHandler(goals.update));
router.delete('/:id', asyncHandler(goals.remove));

module.exports = router;
