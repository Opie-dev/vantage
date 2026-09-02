const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const assets = require('../controllers/assets.controller');

const router = Router();
router.post('/', asyncHandler(assets.create));
router.patch('/:id', asyncHandler(assets.update));
router.delete('/:id', asyncHandler(assets.remove));

// Entries are nested rather than given their own /api/asset-entries router: the
// asset id is then checked against the entry's own before a delete, so a stale
// link cannot remove a row from a different asset's ledger.
router.post('/:id/entries', asyncHandler(assets.addEntry));
router.delete('/:id/entries/:entryId', asyncHandler(assets.removeEntry));

module.exports = router;
