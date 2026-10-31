import test from 'node:test';
import assert from 'node:assert/strict';
import { refuseReal } from '../lib/policy.js';
test('Phase B probes are not approved or enabled in the Phase A bundle', () => {
  assert.throws(refuseReal, { code: 'NOT_PLATFORM_ACCEPTED' });
});
