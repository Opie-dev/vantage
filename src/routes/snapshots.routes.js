const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const snapshots = require('../controllers/snapshots.controller');

const router = Router();
router.post('/', asyncHandler(snapshots.save));
// The owned side of today's row. Touches assets_rm and liabilities_rm only.
router.post('/owned', asyncHandler(snapshots.saveOwned));

module.exports = router;
