const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const health = require('../controllers/health.controller');

const router = Router();
router.get('/', asyncHandler(health.health));

module.exports = router;
