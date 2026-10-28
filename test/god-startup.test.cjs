'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { godSessionFactsFromTail } = loadTs('src/main/godStartup.ts');

test('malformed transcript JSON returns safe empty session facts and warns without echoing it', () => {
  const secret = 'transcript-secret-that-must-not-be-logged';
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let facts;
  try { facts = godSessionFactsFromTail(`{"type":"assistant","usage":${secret}`); }
  finally { console.warn = originalWarn; }

  assert.deepEqual(facts, { contextTokens: null, lastRequestAt: null, cliVersion: null, model: null });
  assert.deepEqual(warnings, ['[god-startup] ignoring malformed transcript row']);
  assert.equal(warnings.join(' '), '[god-startup] ignoring malformed transcript row');
});
