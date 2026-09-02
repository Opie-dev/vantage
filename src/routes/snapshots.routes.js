const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const snapshots = require('../controllers/snapshots.controller');

const router = Router();
router.post('/', asyncHandler(snapshots.save));

module.exports = router;
