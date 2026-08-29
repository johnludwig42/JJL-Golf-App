import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { composeCompetitionLabel, describeFinalCarry, describeMarginTurningPoint, getSegmentMarginPerspective, getWinningMarginPerspective } from '../ledger-report/logic.js';
import { marginEngine } from '../ledger-report/engines.js';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionPrefixed } from './support/release-identity.js';

const reportSource = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const reportShell = readFileSync(new URL('../ledger-report/shell.html', import.meta.url), 'utf8');
const reportBootstrap = readFileSync(new URL('../ledger-report/bootstrap.js', import.meta.url), 'utf8');

function singlesFixture(cum) {
  return {
    margin: { cum, bestN: 1, per: [{ win: 0, a: 3, b: 4 }] },
    game: { bestN: 1, sides: [{ key: 'JOHN' }, { key: 'TOM' }] },
    sides: { JOHN: { name: 'John' }, TOM: { name: 'Tom' } },
    players: [
      { name: 'John Ludwig', side: 'JOHN', fnet: [3] },
      { name: 'Tom O’Brien', side: 'TOM', fnet: [4] },
    ],
    holeIndex: 0,
  };
}

test('Turning Point describes the hole winner and actual post-hole margin', () => {
  const behind = describeMarginTurningPoint(singlesFixture([2, 1, 1, 0, -1]));
  assert.match(behind, /John Ludwig<\/b> posts net 3 to Tom O’Brien’s 4/);
  assert.match(behind, /cuts John’s deficit to 1 down/);
  assert.doesNotMatch(behind, /holds through the finish/);

  const lostLater = describeMarginTurningPoint(singlesFixture([0, -1, 0, 1]));
  assert.match(lostLater, /puts John 1 up/);
  assert.doesNotMatch(lostLater, /holds through the finish/);
});

test('Turning Point supports a losing-side hole and a genuine Best-2 team result', () => {
  const losingSideHole = singlesFixture([0, -1, -2]);
  losingSideHole.margin.per[0].win = 1;
  losingSideHole.margin.per[0].a = 5;
  losingSideHole.margin.per[0].b = 4;
  assert.match(describeMarginTurningPoint(losingSideHole), /Tom O’Brien<\/b> posts net 4 to John Ludwig’s 5/);

  const team = {
    margin: { cum: [0, -1, -1], bestN: 2, per: [{ win: 0, a: 7, b: 9 }] },
    game: { bestN: 2, sides: [{ key: 'BLUE' }, { key: 'GOLD' }] },
    sides: { BLUE: { name: 'Blue Team' }, GOLD: { name: 'Gold Team' } },
    players: [
      { name: 'John', side: 'BLUE', fnet: [3] }, { name: 'Drew', side: 'BLUE', fnet: [4] },
      { name: 'Tom', side: 'GOLD', fnet: [4] }, { name: 'Sam', side: 'GOLD', fnet: [5] },
    ], holeIndex: 0,
  };
  const text = describeMarginTurningPoint(team);
  assert.match(text, /John and Drew<\/b> post net 7 \(best 2\) to Tom and Sam’s 9/);
  assert.match(text, /That lead holds through the finish/);
});

test('Turning Point selection prefers the decisive late lead over an earlier deficit reduction', () => {
  const holes = Array.from({ length: 8 }, (_, index) => ({ number: index + 1 }));
  const strokes = Array(8).fill(0);
  const game = {
    id: 'featured', type: 'matchplay', archetype: 'margin', bestN: 1,
    allowance: { key: 'featured' }, segments: [{ label: 'Match', holes }],
    sides: [{ playerIds: ['john'] }, { playerIds: ['tom'] }],
  };
  const result = marginEngine(game, { holes, players: [
    { id: 'john', gross: [5, 5, 5, 4, 5, 5, 4, 4], strokes: { featured: strokes } },
    { id: 'tom', gross: [4, 4, 5, 5, 5, 5, 5, 5], strokes: { featured: strokes } },
  ] });
  assert.equal(result.turning.i, 7);
});

test('Turning Point is the first permanent lead, even when a later hole has a larger score differential', () => {
  const holes = Array.from({ length: 5 }, (_, index) => ({ number: index + 1 }));
  const strokes = Array(5).fill(0);
  const game = {
    id: 'featured', type: 'matchplay', archetype: 'margin', bestN: 1,
    allowance: { key: 'featured' }, segments: [{ label: 'Match', holes }],
    sides: [{ playerIds: ['john'] }, { playerIds: ['tom'] }],
  };
  const result = marginEngine(game, { holes, players: [
    { id: 'john', gross: [5, 4, 4, 4, 3], strokes: { featured: strokes } },
    { id: 'tom', gross: [4, 5, 5, 4, 10], strokes: { featured: strokes } },
  ] });
  assert.equal(result.turning.i, 2);
  assert.deepEqual(getWinningMarginPerspective(result), { sideIndex: 0, sign: -1, tied: false });
  assert.deepEqual(getWinningMarginPerspective({ winner: null }), { sideIndex: 0, sign: -1, tied: true });
});

test('Prairie View match selects hole 7, where John takes the lead for good', () => {
  const holes = Array.from({ length: 9 }, (_, index) => ({ number: index + 1 }));
  const strokes = Array(9).fill(0);
  const result = marginEngine({
    id: 'prairie', type: 'matchplay', archetype: 'margin', bestN: 1,
    allowance: { key: 'featured' }, segments: [{ label: 'Match', holes }],
    sides: [{ playerIds: ['john'] }, { playerIds: ['tom'] }],
  }, { holes, players: [
    { id: 'john', gross: [6, 4, 4, 3, 5, 3, 4, 3, 4], strokes: { featured: strokes } },
    { id: 'tom', gross: [5, 3, 4, 4, 5, 4, 5, 4, 3], strokes: { featured: strokes } },
  ] });
  assert.equal(result.total, -1);
  assert.equal(result.turning.i, 6);
  assert.deepEqual(result.cum, [0, 1, 2, 2, 1, 1, 0, -1, -2, -1]);
});

test('each margin segment resets and uses its winner, or team 1 for a tie, as perspective', () => {
  const margin = {
    per: [
      { win: 1, scored: true }, { win: 0, scored: true }, { win: 1, scored: true },
      { win: 1, scored: true }, { win: null, scored: true }, { win: 0, scored: true },
    ],
  };
  const front = getSegmentMarginPerspective(margin, { margin: 1, idx: [0, 1, 2] });
  assert.equal(front.sideIndex, 1);
  assert.deepEqual(front.runningMargins, [1, 0, 1]);
  const tiedBack = getSegmentMarginPerspective(margin, { margin: 0, idx: [3, 4, 5] });
  assert.equal(tiedBack.sideIndex, 0);
  assert.equal(tiedBack.tied, true);
  assert.deepEqual(tiedBack.runningMargins, [-1, -1, 0]);
  assert.match(reportSource, /PERSPECTIVE · NET/);
});

test('competition labels de-duplicate embedded game names', () => {
  assert.equal(composeCompetitionLabel('Singles Match Play (Net · Per-Hole Stakes)', 'Singles Match Play (Net · Per-Hole Stakes) · Featured Competition settings'), 'Singles Match Play (Net · Per-Hole Stakes) · Featured Competition settings');
  assert.equal(composeCompetitionLabel('Net Nassau', 'Best 2 · 85% off the low'), 'Net Nassau · Best 2 · 85% off the low');
});

test('unclaimed final carries are disclosed without fabricating settlement', () => {
  assert.match(describeFinalCarry({ per: [{ carried: 1 }] }, 2), /\$1 remains unclaimed/);
  assert.match(describeFinalCarry({ per: [{ carried: 2 }] }, 2), /no player receives the carried pot/);
  assert.equal(describeFinalCarry({ per: [{ carried: 0 }] }, 2), '');
});

test('current release identity, report assets, and statistics-page contract are aligned', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, currentVersionBare);
  assert.equal(manifest.version, currentVersionPrefixed);
  for (const name of currentBrandingAssetNames) {
    assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true);
  }
  assert.match(reportSource, /buildTrackedStatisticsPage\("performance"\)/);
  assert.match(reportSource, /Player statistics · Shot patterns/);
  assert.match(reportSource, /buildTrackedStatisticsPage\("patterns"\)/);
  assert.match(reportSource, /Winning Side perspective/);
  assert.match(reportSource, /Approach<br>unknown/);
  assert.match(reportSource, /Recovery<br>lie unknown/);
  assert.match(reportSource, /LEDGER ENTRY/);
  assert.match(reportShell, /\.ledger-stat-page \.subhead/);
  assert.match(reportShell, /<title>Ledger Entry/);
  assert.match(reportShell, /turn off browser headers and footers/);
  assert.match(reportBootstrap, /history\.replaceState/);
  assert.match(reportBootstrap, /Report data is no longer available/);
});

test('Fairway is a first-class recovery lie and approach completeness remains independently auditable', () => {
  const engine = loadLiveEngine();
  const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1, yardage: 400 }];
  const tee = { id: 'tee', teeName: 'Gold', rating: 36, slope: 113, par: 36, holes };
  const course = { id: 'course', name: 'Prairie View', tees: [tee] };
  const match = {
    id: 'fairway-recovery', courseId: 'course', teeId: 'tee', holeCount: 1, status: 'complete',
    statTrackingEnabled: true, statTrackingPlayerIds: ['john'], courseSnapshot: course,
    players: [{ playerId: 'john', team: 1, teeId: 'tee', scores: [{ holeNumber: 1, gross: 4 }],
      stats: [{ entryCompleted: true, green: false, greenSource: 'calculated', approachResult: 'UNKNOWN', putts: 1, puttsSource: 'user', fairwayResult: 'HIT', recoveryLie: 'FAIRWAY' }] }],
  };
  const state = engine.seedState({ courses: [course], players: [{ id: 'john', name: 'John Ludwig', index: 4.9 }], matches: [match], activeMatchId: match.id });
  const liveMatch = state.matches[0];
  const totals = engine.computeStatTrackingSummary(liveMatch, engine.computeMatchMetrics(liveMatch))[0].totals;
  assert.deepEqual(structuredClone(totals.recoveryByLie.FAIRWAY), { opportunities: 1, successes: 1 });
  assert.equal(totals.missingRecoveryLies, 0);
  assert.equal(totals.approachOpps, 0);
  assert.equal(totals.trackedHoles - totals.approachOpps, 1);
});

test('Story validation blocks impossible par-scoped and overall GIR claims', () => {
  const engine = loadLiveEngine();
  const pars = [4, 4, 5, 3, 4, 3, 5, 4, 4];
  const holes = pars.map((par, index) => ({ holeNumber: index + 1, par, strokeIndex: index + 1, yardage: 300 }));
  const tee = { id: 'tee', teeName: 'Gold', rating: 36, slope: 113, par: 36, holes };
  const course = { id: 'course', name: 'Prairie View', tees: [tee] };
  const match = {
    id: 'gir-validation', courseId: 'course', teeId: 'tee', holeCount: 9, status: 'complete',
    statTrackingEnabled: true, statTrackingPlayerIds: ['john'], courseSnapshot: course,
    players: [{ playerId: 'john', team: 1, teeId: 'tee', scores: pars.map((par, index) => ({ holeNumber: index + 1, gross: par })),
      stats: pars.map((par, index) => ({ entryCompleted: true, green: index < 4, greenSource: 'calculated', putts: 2, puttsSource: 'user', fairwayResult: par === 3 ? 'NA' : 'HIT', recoveryLie: index < 4 ? 'UNKNOWN' : 'ROUGH' })) }],
  };
  const state = engine.seedState({ courses: [course], players: [{ id: 'john', name: 'John Ludwig', index: 4.9 }], matches: [match], activeMatchId: match.id });
  const liveMatch = state.matches[0];
  const metrics = engine.computeMatchMetrics(liveMatch);
  const impossiblePar = engine.validateRoundRecapContent(liveMatch, metrics, 'John Ludwig had an effective showing on par 5s with four greens in regulation. Improvement opportunity.');
  assert.equal(impossiblePar.valid, false);
  assert.ok(impossiblePar.issues.some(issue => issue.code === 'FALSE_PAR_TYPE_GIR_COUNT'));
  const wrongScope = engine.validateRoundRecapContent(liveMatch, metrics, 'John Ludwig showed accuracy while missing four of seven greens. Improvement opportunity.');
  assert.equal(wrongScope.valid, false);
  assert.ok(wrongScope.issues.some(issue => issue.code === 'FALSE_GIR_SCOPE'));
  const inheritedPronoun = engine.validateRoundRecapContent(liveMatch, metrics, "Ludwig's performance stood out. He recorded four greens in regulation on par 5s. Improvement opportunity.");
  assert.ok(inheritedPronoun.issues.some(issue => issue.code === 'FALSE_PAR_TYPE_GIR_COUNT'));
});
