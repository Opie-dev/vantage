const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const commitments = require('../controllers/commitments.controller');
const cards = require('../controllers/cards.controller');

const router = Router();
router.post('/', asyncHandler(commitments.create));
router.patch('/:id', asyncHandler(commitments.update));
router.delete('/:id', asyncHandler(commitments.remove));

// Nested for the same reason asset entries are: the parent id is then checked
// against the payment's own before a delete.
router.post('/:id/payments', asyncHandler(commitments.addPayment));
router.delete('/:id/payments/:paymentId', asyncHandler(commitments.removePayment));

// Instalment plans and statements hang off a REVOLVING commitment, nested for the
// same reason: the card id in the path is checked against the child's own before
// anything is edited or dropped. The service refuses both on a LOAN or RECURRING.
router.post('/:id/plans', asyncHandler(cards.addPlan));
router.patch('/:id/plans/:planId', asyncHandler(cards.updatePlan));
router.delete('/:id/plans/:planId', asyncHandler(cards.removePlan));

router.post('/:id/statements', asyncHandler(cards.addStatement));
router.delete('/:id/statements/:statementId', asyncHandler(cards.removeStatement));

module.exports = router;
