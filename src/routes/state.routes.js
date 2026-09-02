const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const state = require('../controllers/state.controller');

const router = Router();
router.get('/', asyncHandler(state.getState));

module.exports = router;
