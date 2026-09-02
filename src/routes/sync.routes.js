const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const sync = require('../controllers/sync.controller');

const router = Router();
router.post('/', asyncHandler(sync.run));

module.exports = router;
