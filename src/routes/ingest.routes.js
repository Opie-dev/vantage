const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const ingest = require('../controllers/ingest.controller');

const router = Router();
router.post('/moomoo', asyncHandler(ingest.moomoo));
router.post('/statement', asyncHandler(ingest.statement));

module.exports = router;
