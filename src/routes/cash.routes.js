const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const cash = require('../controllers/cash.controller');

const router = Router();
router.post('/', asyncHandler(cash.create));

module.exports = router;
