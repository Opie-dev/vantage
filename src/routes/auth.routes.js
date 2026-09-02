const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const auth = require('../controllers/auth.controller');

// These are the only /api routes reachable without a PIN — the gate itself.
const router = Router();
router.get('/status', asyncHandler(auth.status));
router.post('/login', asyncHandler(auth.login));
router.post('/logout', asyncHandler(auth.logout));

module.exports = router;
