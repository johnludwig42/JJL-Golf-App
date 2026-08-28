import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const functionSource = readFileSync(new URL('../supabase/functions/round-recap/index.ts', import.meta.url), 'utf8');
const contentSpec = JSON.parse(readFileSync(new URL('../supabase/functions/round-recap/content-spec.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const acceptanceFixtures = JSON.parse(readFileSync(new URL('./fixtures/recap-content-fixtures.json', import.meta.url), 'utf8'));

function incompleteFixture({ trackedStats = false } = {}) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5, strokeIndex: index + 1, yardage: 150 + index * 20 }));
  const course = { id: 'recap-course', name: 'Recap Course', tees: [{ id: 'recap-tee', teeName: 'Club', rating: 72, slope: 113, par: 72, holes }] };
  const match = {
    id: 'recap-round', courseId: course.id, teeId: 'recap-tee', holeCount: 18, status: 'active', allowance: 100,
    teamCount: 2, playersPerTeam: 1, selectedGames: [], statTrackingEnabled: trackedStats, statTrackingPlayerIds: trackedStats ? ['a', 'b'] : [], memories: [{ id: 'm1', text: 'Alex holed a long putt on 1.', holeNumber: 1, category: 'Highlight' }],
    players: [
      { playerId: 'a', team: 1, teeId: 'recap-tee', scores: trackedStats ? [3, 4, 5].map((gross, index) => ({ holeNumber: index + 1, gross })) : [{ holeNumber: 1, gross: 3 }], stats: trackedStats ? [{ fairway: true, green: true }, { fairway: true, green: true }, { fairway: false, green: false }] : [] },
      { playerId: 'b', team: 2, teeId: 'recap-tee', scores: trackedStats ? [4, 5, 6].map((gross, index) => ({ holeNumber: index + 1, gross })) : [{ holeNumber: 1, gross: 4 }], stats: trackedStats ? [{ fairway: false, green: false }, { fairway: true, green: false }, { fairway: false, green: true }] : [] },
    ],
  };
  const state = engine.seedState({ players: [{ id: 'a', name: 'Alex', index: 4 }, { id: 'b', name: 'Blake', index: 7 }], courses: [course], matches: [match], activeMatchId: match.id });
  return { engine, match: state.matches[0], metrics: engine.computeMatchMetrics(state.matches[0]) };
}

test('one versioned content specification governs tone, authority, privacy, and publication', () => {
  assert.equal(contentSpec.version, '1.0.0');
  assert.equal(contentSpec.authorityOrder[0], 'authoritativeFacts');
  assert.match(contentSpec.rules.join('\n'), /Never invent shots/);
  assert.match(contentSpec.rules.join('\n'), /email addresses, phone numbers, device identifiers/);
  assert.equal(contentSpec.publication.generatedState, 'draft');
  assert.equal(contentSpec.publication.acceptanceRequired, true);
  assert.match(contentSpec.targetWords, /650–850/);
  assert.equal(contentSpec.maximumWords, 900);
  assert.ok(contentSpec.sections.includes('Player Improvement Opportunities'));
  assert.match(contentSpec.rules.join('\n'), /sample size/);
  assert.match(functionSource, /contentSpec\.version/);
  assert.match(functionSource, /OPENAI_API_KEY/);
  assert.match(functionSource, /OPENAI_RECAP_MODEL/);
  assert.doesNotMatch(functionSource, /sk-[A-Za-z0-9]/);
});

test('payload identifies the content contract and keeps deterministic facts authoritative', () => {
  const { engine, match, metrics } = incompleteFixture();
  const payload = engine.buildRoundRecapPayload(match, metrics);
  assert.equal(payload.recapContentSpecVersion, '1.0.0');
  assert.ok(payload.authoritativeFacts);
  assert.match(payload.recapInstructions, /Compatibility bridge/);
  assert.match(payload.recapInstructions, /authoritativeFacts override/);
  assert.doesNotMatch(JSON.stringify(payload), /password|otp|service.role/i);
});

test('tracked-stat payload supports evidence-based improvement review without inferred mechanics', () => {
  const { engine, match, metrics } = incompleteFixture({ trackedStats: true });
  const payload = engine.buildRoundRecapPayload(match, metrics);
  assert.equal(payload.players[0].statsTracked, true);
  assert.equal(payload.players[0].approachPerformance.trackedScoredHoles, 3);
  assert.equal(payload.players[0].approachPerformance.fairwayHitOpportunities, 1);
  assert.match(payload.recapInstructions, /650–850 words/);
  assert.match(payload.recapInstructions, /sample size/);
  assert.match(payload.recapInstructions, /do not infer swing mechanics/);

  const missing = engine.validateRoundRecapContent(match, metrics, 'Three holes were completed. Alex holed a long putt on 1.');
  assert.ok(missing.issues.some(issue => issue.code === 'MISSING_IMPROVEMENT_REVIEW'));
  const valid = engine.validateRoundRecapContent(match, metrics, 'Three holes were completed. Alex holed a long putt on 1. Improvement opportunity: over this three-hole sample, Alex may consider making green-in-regulation consistency a next-round focus.');
  assert.equal(valid.valid, true);
});

test('verified recap weather requires temperature and humidity without exposing coordinates', () => {
  const { engine, match, metrics } = incompleteFixture();
  match.roundContext = { weather: { summary: 'Warm and breezy', temperature: 78, humidity: 64, latitudeApprox: 39.77, longitudeApprox: -86.16 } };
  const payload = engine.buildRoundRecapPayload(match, metrics);
  assert.equal(payload.roundContext.weather.temperature, 78);
  assert.equal(payload.roundContext.weather.humidity, 64);
  assert.equal('latitudeApprox' in payload.roundContext.weather, false);
  assert.equal('longitudeApprox' in payload.roundContext.weather, false);
  assert.match(payload.recapInstructions, /temperature in degrees Fahrenheit and humidity percentage/);

  const missing = engine.validateRoundRecapContent(match, metrics, 'Recorded conditions were warm and breezy. Alex holed a long putt on 1.');
  assert.ok(missing.issues.some(issue => issue.code === 'MISSING_WEATHER_TEMPERATURE'));
  assert.ok(missing.issues.some(issue => issue.code === 'MISSING_WEATHER_HUMIDITY'));
  const valid = engine.validateRoundRecapContent(match, metrics, 'Recorded conditions were warm and breezy at 78°F with 64% humidity. Alex holed a long putt on 1.');
  assert.equal(valid.valid, true);
});

test('verified weather is appended after uncovered Memories and is not duplicated when integrated', () => {
  const { engine, match } = incompleteFixture();
  match.roundContext = { weather: { conditionsText: 'Partly cloudy', temperature: 78, humidity: 64, windSpeed: 9, windDirection: 225 } };
  const uncovered = engine.ensureRoundRecapRequiredFacts(match, 'A short provisional round was played.');
  assert.match(uncovered, /Round Memories[\s\S]*Alex holed a long putt on 1\.[\s\S]*Weather[\s\S]*78°F[\s\S]*64% humidity/);
  assert.match(uncovered, /Recorded after the first completed hole/);

  const integrated = 'A short provisional round was played. Alex holed a long putt on 1. Conditions after the first completed hole were partly cloudy at 78°F with 64% humidity.';
  assert.equal(engine.ensureRoundRecapRequiredFacts(match, integrated), integrated);
});

test('deterministic checks block false completion, false finality, and missing Memories', () => {
  const { engine, match, metrics } = incompleteFixture();
  const falseFull = engine.validateRoundRecapContent(match, metrics, 'Alex completed all 18 holes. Alex holed a long putt on 1.');
  assert.equal(falseFull.valid, false);
  assert.ok(falseFull.issues.some(issue => issue.code === 'FALSE_FULL_ROUND'));
  const falseMoney = engine.validateRoundRecapContent(match, metrics, 'The final settlement was complete. Alex holed a long putt on 1.');
  assert.ok(falseMoney.issues.some(issue => issue.code === 'FALSE_FINAL_SETTLEMENT'));
  const missingMemory = engine.validateRoundRecapContent(match, metrics, 'A short provisional round was played.');
  assert.ok(missingMemory.issues.some(issue => issue.code === 'MISSING_MEMORIES'));
  const valid = engine.validateRoundRecapContent(match, metrics, 'One hole was completed. Alex holed a long putt on 1.');
  assert.equal(valid.valid, true);
});

test('repository package documents unknown live state and forbids unapproved production deployment', () => {
  for (const path of ['../docs/AI_RECAP_CONTENT_SPEC_v1.0.md', '../docs/AI_RECAP_DEPLOYMENT_v30.3.84.md', '../docs/architecture/CONSTITUTIONAL_REVIEW_v30.3.84.md']) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true);
  }
  const deployment = readFileSync(new URL('../docs/AI_RECAP_DEPLOYMENT_v30.3.84.md', import.meta.url), 'utf8');
  assert.match(deployment, /No production inventory, deployment, secret change, or function mutation was performed/);
  assert.match(deployment, /source as unknown/);
  assert.match(deployment, /separate Product Owner approval/);
});

test('content acceptance matrix covers normal, incomplete, social, statistical, and sensitive rounds', () => {
  assert.deepEqual(acceptanceFixtures.map(row => row.id), [
    'normal-18', 'incomplete-round', 'no-notes', 'weather-heavy', 'dramatic-finish',
    'one-sided-match', 'shared-match', 'stats-heavy', 'social-round', 'sensitive-content',
  ]);
  assert.ok(acceptanceFixtures.every(row => Array.isArray(row.expect) && row.expect.length >= 2));
});

test('current metadata and immutable PWA assets remain consistent', () => {
  assert.equal(pkg.version, '31.0.09');
  assert.equal(manifest.version, 'v31.0.09');
  assert.match(app, /version: 'v31\.0\.09'/);
  for (const name of ['app-icon-192-v31.0.09.png', 'app-icon-512-v31.0.09.png', 'apple-touch-icon-v31.0.09.png', 'favicon-32-v31.0.09.png', 'favicon-16-v31.0.09.png']) {
    assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true, name);
  }
});

test('Add Memory uses the Quick Scoreboard floating mobile-window treatment', () => {
  assert.match(css, /#addMemoryDialog\s*\{[\s\S]*?padding:calc\(var\(--app-chrome-height,[\s\S]*?\) 12px/s);
  assert.match(css, /#addMemoryDialog \.memory-sheet\s*\{[\s\S]*?max-width:100%;[\s\S]*?overflow-y:auto;[\s\S]*?overflow-x:hidden;[\s\S]*?border-radius:16px;/s);
  assert.match(css, /\.memory-sheet > label,[\s\S]*?margin-left:14px;[\s\S]*?margin-right:14px;/s);
});

test('More shows exactly the current and four preceding release notes', () => {
  const source = html.match(/<script id="appReleaseNotesData" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  const notes = JSON.parse(source);
  assert.deepEqual(notes.slice(0, 5).map(note => note.version), ['v31.0.09', 'v31.0.08', 'v31.0.07', 'v31.0.06', 'v31.0.05']);
  assert.match(app, /function renderAppReleaseNotes\(\)/);
  assert.match(app, /renderAppReleaseNotes\(\);\s*\n\s*renderAll\(\);/);
});

test('current assets refresh and Play exposes the authoritative End Round workflow', () => {
  const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  for (const asset of ['manifest.json', 'style.css', 'supabase-config.js', 'identity-security.js', 'app.js']) {
    assert.match(html, new RegExp(`${asset.replace('.', '\\.') }\\?v=31\\.0\\.09`));
    assert.match(worker, new RegExp(`${asset.replace('.', '\\.') }\\?v=31\\.0\\.09`));
  }
  assert.match(html, /<details class="play-round-details[\s\S]*?<button id="finishRoundBtn"[^>]*>Complete Round<\/button>[\s\S]*?<button id="endRoundEarlyBtn"[^>]*>End Round Early<\/button>/);
  assert.doesNotMatch(html, /id="confirmFinishRoundBtn"/);
  assert.match(app, /show\(scoringFinishBtn, hasMatch && !isComplete && activeRound && dataCompletion\?\.scoresComplete\)/);
  assert.match(app, /finishRoundBtn'\)\.addEventListener\('click', \(\) => handleScoreboardFinishEndRound\('complete'\)\)/);
});
