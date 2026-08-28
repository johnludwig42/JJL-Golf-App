import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function trackedSummaryFixture({ legacy = false } = {}) {
  const engine = loadLiveEngine();
  const pars = [4, 4, 3, 5, 3, 3, 3, 4, 5];
  const holes = pars.map((par, index) => ({ holeNumber: index + 1, par, strokeIndex: index + 1, yardage: 150 + index * 25 }));
  const tee = { id: 'stats-tee', teeName: 'Blue', rating: 36, slope: 113, par: pars.reduce((a, b) => a + b, 0), holes };
  const course = { id: 'stats-course', name: 'Statistics Test Club', tees: [tee] };
  const detailedStats = [
    { entryCompleted: true, fairwayResult: 'HIT', greenSource: 'unknown', putts: 2, puttsSource: 'user', recoveryLie: 'UNKNOWN' },
    { entryCompleted: true, fairwayResult: 'LEFT', green: false, greenSource: 'calculated', approachResult: '1', putts: 1, puttsSource: 'default', penaltyStrokes: 2, recoveryLie: 'BUNKER' },
    { entryCompleted: true, fairwayResult: 'NA', green: false, greenSource: 'calculated', approachResult: '3', putts: 2, puttsSource: 'user', recoveryLie: 'BUNKER' },
    { entryCompleted: true, fairwayResult: 'RIGHT', green: true, greenSource: 'calculated', approachResult: '5', putts: 1, puttsSource: 'user', recoveryLie: 'UNKNOWN' },
    { entryCompleted: true, fairwayResult: 'NA', green: false, greenSource: 'override', approachResult: '2', putts: 1, puttsSource: 'user', recoveryLie: 'UNKNOWN' },
    { entryCompleted: true, fairwayResult: 'NA', green: false, greenSource: 'calculated', approachResult: '4', putts: 1, puttsSource: 'user', recoveryLie: 'ROUGH' },
    { entryCompleted: true, fairwayResult: 'NA', green: true, greenSource: 'calculated', approachResult: '5', putts: 3, puttsSource: 'user', recoveryLie: 'UNKNOWN' },
    { entryCompleted: true, fairwayResult: 'HIT', green: false, greenSource: 'calculated', approachResult: '6', putts: 2, puttsSource: 'user', recoveryLie: 'ROUGH' },
    { entryCompleted: true, fairwayResult: 'HIT', green: true, greenSource: 'calculated', approachResult: '5', putts: 2, puttsSource: 'user', recoveryLie: 'UNKNOWN' },
  ];
  const scores = [4, 4, 4, 4, 3, 3, 4, 5, 5];
  const match = {
    id: legacy ? 'legacy-stats' : 'exact-stats', courseId: course.id, teeId: tee.id, holeCount: 9,
    status: 'complete', statTrackingEnabled: true, statTrackingPlayerIds: legacy ? ['p1'] : ['p1', 'p2'], statReviewContractVersion: 1,
    courseSnapshot: course,
    players: [
      { playerId: 'p1', teeId: tee.id, scores: scores.map((gross, index) => ({ holeNumber: index + 1, gross })), stats: legacy ? [{ entryCompleted: true }] : detailedStats },
      { playerId: 'p2', teeId: tee.id, scores: scores.map((gross, index) => ({ holeNumber: index + 1, gross })), stats: [] },
    ],
  };
  const players = [{ id: 'p1', name: 'Exact Player', index: 0 }, { id: 'p2', name: 'Zero Player', index: 0 }];
  const state = engine.seedState({ courses: [course], players, matches: [match], activeMatchId: match.id });
  const liveMatch = state.matches[0];
  const metrics = engine.computeMatchMetrics(liveMatch);
  return { rows: engine.computeStatTrackingSummary(liveMatch, metrics), engine };
}

test('v31.0.11 release identity and immutable assets are aligned', () => {
  assert.equal(pkg.version, '31.0.11');
  assert.equal(manifest.version, 'v31.0.11');
  assert.match(app, /version: 'v31\.0\.11'/);
  assert.match(app, /buildLabel: 'Player Memories and Four-Golfer Grind'/);
  assert.match(html, /id="appVersionFooter">v31\.0\.11</);
  for (const name of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(existsSync(new URL(`../branding/${name}-v31.0.11.png`, import.meta.url)), true);
  }
});

test('advanced Ledger calculations retain denominators and consequence facts', () => {
  const summary = app.slice(app.indexOf('function computeStatTrackingSummary'), app.indexOf('function getApproachDispersionSummary'));
  assert.match(summary, /unknownGirHoles/);
  assert.match(summary, /missingRecoveryLies/);
  assert.match(summary, /penaltyHoles/);
  assert.match(summary, /scramblingOpps: 0, scrambles: 0/);
  assert.match(summary, /approachOutcome\.scramblingOpps \+= 1/);
  assert.match(summary, /if \(recovery\.success\) approachOutcome\.scrambles \+= 1/);
  assert.match(summary, /stat\.puttsSource !== 'default'/);
  assert.match(summary, /stat\.greenSource !== 'unknown'/);
});

test('tracked statistics calculate exact opportunities, rates, penalties, dispersion, and par outcomes', () => {
  const { rows } = trackedSummaryFixture();
  const totals = rows.find(row => row.playerMetric.playerId === 'p1').totals;
  assert.equal(totals.trackedHoles, 9);
  assert.deepEqual({ greens: totals.greens, greenOpps: totals.greenOpps, unknown: totals.unknownGirHoles }, { greens: 3, greenOpps: 8, unknown: 1 });
  assert.deepEqual({ putts: totals.putts, opps: totals.puttOpps, one: totals.onePutts, three: totals.threePutts }, { putts: 14, opps: 8, one: 3, three: 1 });
  assert.deepEqual({ girPutts: totals.girPutts, girOpps: totals.girPuttOpps, missedPutts: totals.missedGirPutts, missedOpps: totals.missedGirPuttOpps }, { girPutts: 6, girOpps: 3, missedPutts: 6, missedOpps: 4 });
  assert.deepEqual({ scrambles: totals.upAndDowns, opps: totals.scramblingOpps, sandies: totals.sandies, sandOpps: totals.sandSaveOpps }, { scrambles: 3, opps: 5, sandies: 1, sandOpps: 2 });
  assert.equal(totals.missingRecoveryLies, 1);
  assert.deepEqual({ strokes: totals.penaltyStrokes, holes: totals.penaltyHoles }, { strokes: 2, holes: 1 });
  assert.equal(totals.fairwayOpps, 5, 'par-3 holes do not enter fairway outcomes');
  assert.deepEqual(['HIT', 'LEFT', 'RIGHT'].map(key => totals.fairwayOutcomes[key].opportunities), [3, 1, 1]);
  assert.deepEqual({ strokes: totals.fairwayOutcomes.LEFT.penalties, holes: totals.fairwayOutcomes.LEFT.penaltyHoles }, { strokes: 2, holes: 1 });
  assert.deepEqual({ strokes: totals.approachOutcomes['1'].penalties, holes: totals.approachOutcomes['1'].penaltyHoles }, { strokes: 2, holes: 1 });
  assert.deepEqual({ strokes: totals.parTypes['4'].penalties, holes: totals.parTypes['4'].penaltyHoles }, { strokes: 2, holes: 1 });
  assert.deepEqual(['3', '4', '5'].map(key => totals.parTypes[key].scoreToPar), [2, 1, -1]);
  assert.deepEqual({ opps: totals.approachOutcomes['1'].scramblingOpps, successes: totals.approachOutcomes['1'].scrambles }, { opps: 1, successes: 1 });
  assert.deepEqual({ opps: totals.approachOutcomes['3'].scramblingOpps, successes: totals.approachOutcomes['3'].scrambles }, { opps: 1, successes: 0 });
  assert.equal(totals.approachOutcomes['5'].scramblingOpps, 0, 'GIR positions never become scrambling opportunities');
});

test('zero-tracked and partial legacy stats remain zero-filled without fabricated opportunities', () => {
  const current = trackedSummaryFixture();
  const zero = current.rows.find(row => row.playerMetric.playerId === 'p2').totals;
  assert.equal(zero.trackedHoles, 0);
  for (const key of ['greenOpps', 'puttOpps', 'scramblingOpps', 'sandSaveOpps', 'penaltyStrokes', 'penaltyHoles', 'approachOpps']) {
    assert.equal(zero[key], 0, `${key} should remain zero`);
    assert.equal(Number.isNaN(zero[key]), false, `${key} must not be NaN`);
  }
  const legacy = trackedSummaryFixture({ legacy: true }).rows[0].totals;
  assert.equal(legacy.trackedHoles, 1);
  assert.equal(legacy.greenOpps, 0);
  assert.equal(legacy.unknownGirHoles, 1);
  assert.equal(legacy.puttOpps, 0);
  assert.equal(legacy.scramblingOpps, 0);
  assert.equal(legacy.sandSaveOpps, 0);
  assert.equal(legacy.approachOpps, 0);
});

test('small-sample rates show fractions without percentages and the shared threshold applies to clean rates', () => {
  assert.match(renderer, /const MIN_RATE_SAMPLE=5/);
  assert.match(renderer, /num\(d\)<MIN_RATE_SAMPLE\?`<span class="dim">\(\$\{num\(n\)\}\/\$\{num\(d\)\}\)<\/span>`/);
  assert.match(renderer, /rate\(num\(x\.opportunities\)-num\(x\.penaltyHoles\),x\.opportunities\)/);
});

test('dedicated Ledger renders every advanced family only from available facts', () => {
  for (const heading of ['Short Game & Recovery', 'Recovery by Lie', 'Tee-Shot Dispersion', 'Tee-Shot Consequences', 'Approach Dispersion', 'Scrambling by Approach Miss', 'Putting Context', 'Performance by Par', 'Tracking Completeness']) {
    assert.match(renderer, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(renderer, /const obj=v=>v&&typeof v==="object"\?v:\{\}/);
  assert.match(renderer, /const num=v=>Number\.isFinite\(Number\(v\)\)\?Number\(v\):0/);
  assert.match(renderer, /Unknown values are disclosed and excluded, never counted as misses/);
  assert.match(renderer, /Only recorded opportunities enter each denominator/);
  assert.doesNotMatch(renderer, /t\.upAndDowns<\/td><td class="n">\$\{t\.sandies/);
});

test('None, Casual, partial, and legacy records remain supported by conditional rendering', () => {
  assert.match(renderer, /if\(!P\.some\(p=>p\.statistics\)\)/, 'None mode keeps scoring-only fallback');
  assert.match(renderer, /const tracked=P\.filter\(p=>p\.statistics\?\.tracked\?\.trackedHoles\)/, 'advanced tables require tracked holes');
  assert.match(renderer, /obj\(obj\(p\.statistics\.tracked\)\.recoveryByLie\)/, 'partial recovery objects are safe');
  assert.match(renderer, /obj\(obj\(p\.statistics\.tracked\)\.approachPositions\)/, 'partial approach objects are safe');
  assert.match(renderer, /obj\(obj\(p\.statistics\.tracked\)\.parTypes\)/, 'legacy records without par types are safe');
  assert.match(renderer, /num\(t\.puttOpps\)/, 'putting context requires a real denominator');
});
