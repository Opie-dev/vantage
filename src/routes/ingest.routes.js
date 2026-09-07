const express = require('express');
const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const ingest = require('../controllers/ingest.controller');

const router = Router();
router.post('/moomoo', asyncHandler(ingest.moomoo));
router.post('/statement', asyncHandler(ingest.statement));

/*
 * The PDF itself, so nobody has to open a terminal.
 *
 * express.raw rather than a multipart parser: the body IS the file, there are no
 * other fields, and the password rides in a header. One dependency fewer for a
 * route that takes one thing. The limit here refuses before ten megabytes are
 * read into memory; the service's refuses a file that is the wrong shape.
 */
router.post(
  '/statement/pdf',
  express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '10mb' }),
  asyncHandler(ingest.statementPdf),
);

module.exports = router;
