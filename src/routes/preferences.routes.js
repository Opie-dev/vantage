const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const preferences = require('../controllers/preferences.controller');

const router = Router();
router.get('/', asyncHandler(preferences.read));
// PATCH, not PUT: the body is a partial merge, not the whole object.
router.patch('/', asyncHandler(preferences.write));

module.exports = router;
