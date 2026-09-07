/**
 * Every case is a value Python's round() was run on. The ties are exact binary
 * ties — dyadic rationals — because those are the only decimals that ARE ties
 * once stored as a double; 2.675 is not one, and rounds the way it is stored.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { pyRound, round2, round4 } = require('./round');

test('exact ties go to even, both directions', () => {
  assert.equal(round2(1667.625), 1667.62);
  assert.equal(round2(-1667.625), -1667.62);
  assert.equal(round2(0.125), 0.12);
  assert.equal(round2(0.375), 0.38);
  assert.equal(pyRound(2.5, 0), 2);
  assert.equal(pyRound(3.5, 0), 4);
  assert.equal(round4(0.03125), 0.0312);
  assert.equal(round4(0.09375), 0.0938);
});

test('what only looks like a tie rounds as stored', () => {
  assert.equal(round2(2.675), 2.67);
  assert.equal(round2(1.005), 1);
  assert.equal(round2(5092.49 - 1667.58), 3424.91);
  assert.equal(round2(0.9 * 0.05 + 1667.58), 1667.62);
});

test('carries through nines, and leaves nothing to chance at zero', () => {
  assert.equal(round2(9.996), 10);
  assert.equal(round2(9.995), 9.99);
  assert.equal(round2(999.999), 1000);
  assert.equal(round2(0.004), 0);
  assert.equal(round2(0), 0);
  assert.equal(round2(NaN), NaN);
});
