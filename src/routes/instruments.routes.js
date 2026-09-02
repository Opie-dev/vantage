const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const instruments = require('../controllers/instruments.controller');

const router = Router();
router.post('/', asyncHandler(instruments.create));

module.exports = router;
