import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractResponsesApiText, parseRecapResponse } from '../supabase/functions/round-recap/response-utils.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const edgeFunction = readFileSync(new URL('../supabase/functions/round-recap/index.ts', import.meta.url), 'utf8');

test('raw Responses API output is parsed without relying on SDK-only convenience fields', () => {
  const raw = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"recap":"A governed round story."}' }] }] };
  assert.equal(extractResponsesApiText(raw), '{"recap":"A governed round story."}');
  assert.equal(parseRecapResponse(raw), 'A governed round story.');
  assert.equal(parseRecapResponse({ output_text: '{"recap":"Compatibility path."}' }), 'Compatibility path.');
  assert.equal(parseRecapResponse({ output: [] }), '');
  assert.equal(parseRecapResponse({ output_text: 'not json' }), '');
});

test('Edge Function returns stable sanitized failure codes and supports one repair request', () => {
  assert.match(edgeFunction, /CONTENT_SPEC_MISMATCH/);
  assert.match(edgeFunction, /SERVICE_NOT_CONFIGURED/);
  assert.match(edgeFunction, /PROVIDER_FAILED/);
  assert.match(edgeFunction, /RATE_LIMITED/);
  assert.match(edgeFunction, /const repair =/);
  assert.match(edgeFunction, /Prior recap:/);
  assert.doesNotMatch(edgeFunction, /console\.(?:log|error).*apiKey/i);
});

test('client performs one repair attempt and replaces an unverified result with the deterministic Story', () => {
  assert.match(app, /let recap = await requestRecap\(\)/);
  assert.match(app, /const repaired = await requestRecap\(\{/);
  assert.match(app, /match\.roundRecapGenerated = recap/);
  assert.match(app, /buildDeterministicLedgerEntryStory\(match, metrics, 'verification-failed'\)/);
  assert.match(app, /roundRecapValidationIssues/);
  assert.match(app, /const recap = draftRecap \|\| finalRecap/);
  assert.match(app, /getDraftRoundRecap\(match\) \|\| getStoredRoundRecap\(match\)/);
});

test('client distinguishes deployment, contract, configuration, authorization, rate, and provider failures', () => {
  for (const expected of [
    'service is not deployed',
    'authorization is not configured correctly',
    'service version does not match this app',
    'request limit reached',
    'service is not fully configured',
    'provider could not complete the request',
  ]) assert.match(app, new RegExp(expected, 'i'));
  assert.match(app, /roundRecapLastError/);
  assert.doesNotMatch(app, /function setRoundRecapFailure/);
});

test('recap failures remain isolated from scoring and local round persistence', () => {
  assert.match(app, /Scores, Memories, and round data remain saved/);
  assert.match(app, /A verified facts-only Story is ready to review/);
  assert.match(app, /persist\(\{ skipRender: true \}\);\s*renderLeaderboard\(\);/s);
  assert.doesNotMatch(edgeFunction, /service_role|SUPABASE_SERVICE_ROLE/i);
});
