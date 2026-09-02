const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const commitments = require('../controllers/commitments.controller');

const router = Router();
router.post('/', asyncHandler(commitments.create));
router.patch('/:id', asyncHandler(commitments.update));
router.delete('/:id', asyncHandler(commitments.remove));

// Nested for the same reason asset entries are: the parent id is then checked
// against the payment's own before a delete.
router.post('/:id/payments', asyncHandler(commitments.addPayment));
router.delete('/:id/payments/:paymentId', asyncHandler(commitments.removePayment));

module.exports = router;
