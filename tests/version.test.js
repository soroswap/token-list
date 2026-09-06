'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { incrementVersion } = require('../scripts/lib/version');

test('increments the patch number', () => {
  assert.equal(incrementVersion('1.5.1'), '1.5.2');
});

test('rolls patch over into minor past 9', () => {
  assert.equal(incrementVersion('1.5.9'), '1.6.0');
});

test('rolls minor over into major past 9', () => {
  assert.equal(incrementVersion('1.9.9'), '2.0.0');
});

test('caps major at 999', () => {
  assert.equal(incrementVersion('999.9.9'), '999.0.0');
});
