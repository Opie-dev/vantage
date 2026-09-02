const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const income = require('../controllers/income.controller');

const router = Router();
router.post('/', asyncHandler(income.create));
router.patch('/:id', asyncHandler(income.update));
router.delete('/:id', asyncHandler(income.remove));

// Nested, so the source id can be checked against the event's own before a
// delete — and so an EPF-bearing event is always created against a known source.
router.post('/:id/events', asyncHandler(income.addEvent));
router.delete('/:id/events/:eventId', asyncHandler(income.removeEvent));

module.exports = router;
