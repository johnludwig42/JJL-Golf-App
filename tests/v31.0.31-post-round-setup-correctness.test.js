import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function makeMatch({ id = 'round-1', status = 'complete', holesPlayed = 18, featuredCompetition = 'auto', matchStatusGame = '', selectedGames = [{ key: 'nassau' }], storageMode = 'local' } = {}) {
  return {
    id, status, holeCount: 18, teamCount: 2, playersPerTeam: 1, teamNames: ['Blue', 'Gold'],
    selectedGames, featuredCompetition, matchStatusGame, storageMode,
    players: ['a', 'b'].map((playerId, playerIdx) => ({
      playerId, team: playerIdx + 1, teeId: 'tee',
      scores: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: idx < holesPlayed ? 4 + playerIdx : null })),
    })),
  };
}

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('completed review pointer normalizes safely for new, legacy, missing, and active rounds', () => {
  const engine = loadLiveEngine();
  const complete = makeMatch();
  assert.equal(engine.sanitizePersistentState({ matches: [complete], completedSummaryMatchId: complete.id }).completedSummaryMatchId, complete.id);
  assert.equal(engine.sanitizePersistentState({ matches: [complete] }).completedSummaryMatchId, null);
  assert.equal(engine.sanitizePersistentState({ matches: [complete], completedSummaryMatchId: 'missing' }).completedSummaryMatchId, null);
  assert.equal(engine.sanitizePersistentState({ matches: [{ ...complete, status: 'active' }], completedSummaryMatchId: complete.id }).completedSummaryMatchId, null);
});

test('completed review pointer persists and resolves the same round after a simulated reload', () => {
  const first = loadLiveEngine();
  const complete = makeMatch();
  first.seedState({ matches: [complete], players: [], courses: [], activeMatchId: null });
  first.setCompletedReviewMatch(complete.id);
  const saved = first.loadStateFromStorage();
  assert.equal(saved.completedSummaryMatchId, complete.id);
  const reloaded = loadLiveEngine();
  reloaded.seedState(saved);
  assert.equal(reloaded.getReviewOrActiveMatch()?.id, complete.id);
});

test('unresolvable Review Story action fails visibly and routes to saved rounds', () => {
  assert.match(app, /That completed round could not be reopened\. Choose it from Saved Rounds\./);
  assert.match(app, /activateTab\('courses'\);[\s\S]*openExperienceDestination\('courses', 'rounds'\)/);
});

test('Ledger Entry status distinguishes completed, clinched-early, and provisional rounds', () => {
  const engine = loadLiveEngine();
  const metricsFor = match => ({
    tee: { holes: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: 4, strokeIndex: idx + 1 })) },
    players: match.players,
    holeCount: 18,
    holeResults: Array.from({ length: 18 }, (_, idx) => ({
      holeNumber: idx + 1,
      playerScores: match.players.map(player => ({ playerId: player.playerId, gross: player.scores[idx]?.gross })),
    })),
  });
  const complete = makeMatch();
  assert.equal(engine.getLedgerEntryStatus({ meta: { status: 'final' } }, complete, metricsFor(complete)), 'FINAL');
  const clinched = makeMatch({ id: 'round-2', holesPlayed: 12 });
  engine.normalizeMatch(clinched);
  assert.equal(engine.getLedgerEntryStatus({ meta: { status: 'final' } }, clinched, metricsFor(clinched)), 'CLINCHED EARLY');
  assert.equal(engine.getLedgerEntryStatus({ meta: { status: 'draft' } }, clinched, metricsFor(clinched)), 'PROVISIONAL');
});

test('featured competition invariant holds for explicit, auto, fallback, and cloud-authoritative mutations', () => {
  const engine = loadLiveEngine();
  const cases = [
    { label: 'explicit setup', match: makeMatch({ status: 'active', featuredCompetition: 'nassau' }), options: {} },
    { label: 'auto setup', match: makeMatch({ status: 'active', featuredCompetition: 'auto' }), options: {} },
    { label: 'removed option fallback', match: makeMatch({ status: 'active', featuredCompetition: 'nine_point', selectedGames: [{ key: 'nassau' }] }), options: {} },
    { label: 'joined cloud hydration', match: makeMatch({ status: 'active', featuredCompetition: 'nassau', matchStatusGame: 'team_match', storageMode: 'shared' }), options: { authority: 'cloud', requestedStatusGame: 'team_match' } },
  ];
  for (const entry of cases) {
    engine.synchronizeFeaturedCompetition(entry.match, entry.options);
    assert.equal(engine.resolveFeaturedCompetitionKey(entry.match), entry.match.matchStatusGame, entry.label);
  }
  assert.equal(cases[3].match.featuredCompetition, 'team_match');
});

test('all live featured-game mutation paths invoke the authoritative resolver', () => {
  assert.match(app, /function normalizeMatch\(match\)[\s\S]*synchronizeFeaturedCompetition\(match, \{ requestedStatusGame: match\.matchStatusGame \}\)/);
  assert.match(app, /if \(!statusOptions\.find[\s\S]*synchronizeFeaturedCompetition\(match, \{ requestedSelection:/);
  assert.match(app, /function hydrateMatchFromCloudBundle[\s\S]*synchronizeFeaturedCompetition\(hydrated, \{ authority: 'cloud'/);
  assert.match(app, /function applyMatchTemplate[\s\S]*synchronizeFeaturedCompetition\(draft, \{ requestedSelection: draft\.featuredCompetition \}\)/);
  assert.match(app, /function buildNextRoundDraft[\s\S]*synchronizeFeaturedCompetition\(draft, \{ requestedSelection: 'auto' \}\)/);
  assert.match(app, /e\.target\.id === 'matchStatusGameSelect'[\s\S]*synchronizeFeaturedCompetition\(match, \{ requestedSelection: e\.target\.value \}\)/);
});

test('next-round draft starts with an aligned featured-game state', () => {
  const engine = loadLiveEngine();
  const prior = makeMatch({ featuredCompetition: 'nassau', matchStatusGame: 'nassau' });
  const next = engine.buildNextRoundDraft(prior);
  assert.equal(engine.resolveFeaturedCompetitionKey(next), next.matchStatusGame);
});

function fakeSelect(initialValue, initialValues = []) {
  let html = '';
  return {
    value: initialValue,
    options: initialValues.map(value => ({ value })),
    set innerHTML(value) {
      html = value;
      this.options = [...value.matchAll(/value="([^"]*)"/g)].map(match => ({ value: match[1] }));
      this.value = this.options[0]?.value || '';
    },
    get innerHTML() { return html; },
  };
}

test('shared select helper preserves valid values across repeated renders and fails closed', () => {
  const engine = loadLiveEngine();
  const select = fakeSelect('course-b', ['course-a', 'course-b']);
  const options = '<option value="">Select</option><option value="course-a">A</option><option value="course-b">B</option>';
  assert.equal(engine.rebuildSelectOptionsPreservingValue(select, options), 'course-b');
  assert.equal(engine.rebuildSelectOptionsPreservingValue(select, options), 'course-b');
  assert.equal(engine.rebuildSelectOptionsPreservingValue(select, '<option value="">Select</option><option value="course-a">A</option>'), '');
});

test('course, calculator player, and calculator course populators use the shared preservation helper', () => {
  assert.match(app, /function populateCourseSelects\([\s\S]*rebuildSelectOptionsPreservingValue\(select,/);
  assert.match(app, /function populateCalcPlayers\([\s\S]*rebuildSelectOptionsPreservingValue\(document\.getElementById\('calcPlayer'\),/);
  assert.match(app, /function populateCalcCourses\([\s\S]*rebuildSelectOptionsPreservingValue\(courseSelect,/);
});
