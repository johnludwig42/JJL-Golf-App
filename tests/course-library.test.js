import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

function course(id = 'course', name = 'Pine Valley', city = 'Pine Hill') {
  return {
    id, name, city, state: 'NJ', country: 'USA',
    tees: [{
      id: `${id}-blue`, teeName: 'Blue', rating: 72, slope: 113, par: 72,
      holes: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, yardage: 400 + idx, par: 4, strokeIndex: idx + 1 })),
    }],
  };
}

function seedMatch(courseRow, overrides = {}) {
  return {
    players: [{ id: 'p1', name: 'Alex', index: 0 }],
    courses: [courseRow],
    matches: [{
      id: 'match', date: '2026-07-11', name: 'Round', courseId: courseRow.id, teeId: courseRow.tees[0].id,
      format: 'teams', allowance: 100, holeCount: 18, teamCount: 1, playersPerTeam: 1, selectedGames: [],
      players: [{ playerId: 'p1', team: 1, slot: 0, teeId: courseRow.tees[0].id, scores: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: idx === 0 ? 4 : null })) }],
      ...overrides,
    }],
    activeMatchId: 'match',
  };
}

test('round course snapshot remains stable after Library edits and cloud export reuses it', () => {
  const engine = loadLiveEngine();
  const libraryCourse = course();
  const state = engine.seedState(seedMatch(libraryCourse));
  const match = state.matches[0];
  match.courseSnapshot = JSON.parse(JSON.stringify(engine.getCourseSnapshotForMatch(match)));
  const before = engine.computeMatchMetrics(match);
  state.courses[0].name = 'Renamed Library Course';
  state.courses[0].tees[0].holes[0].yardage = 999;
  const after = engine.computeMatchMetrics(match);
  assert.equal(before.course.name, 'Pine Valley');
  assert.equal(after.course.name, 'Pine Valley');
  assert.equal(after.tee.holes[0].yardage, 400);
  assert.equal(after.courseSource, 'round-snapshot');
  assert.equal(engine.getCourseSnapshotForMatch(match).name, 'Pine Valley');
});

test('legacy matches use Library fallback and missing selected tee falls back safely', () => {
  const engine = loadLiveEngine();
  const libraryCourse = course();
  const state = engine.seedState(seedMatch(libraryCourse, { teeId: 'missing-tee' }));
  const match = state.matches[0];
  const metrics = engine.computeMatchMetrics(match);
  assert.equal(metrics.courseSource, 'legacy-library-fallback');
  assert.equal(metrics.tee.id, 'course-blue');
  assert.equal(metrics.teeFallbackUsed, true);
});

test('course identity normalizes punctuation but preserves distinct locations and hole counts', () => {
  const engine = loadLiveEngine();
  const a = course('a', "St. John’s  Golf Club", 'Indianapolis');
  const punctuationVariant = course('b', 'St Johns Golf Club', 'Indianapolis');
  const distinctLocation = course('c', 'St Johns Golf Club', 'Carmel');
  assert.equal(engine.normalizeCourseIdentityText(a.name), engine.normalizeCourseIdentityText(punctuationVariant.name));
  assert.equal(engine.isSameCourseIdentity(a, punctuationVariant), true);
  assert.equal(engine.isSameCourseIdentity(a, distinctLocation), false);
  const state = engine.seedState({ players: [], courses: [a, distinctLocation], matches: [], activeMatchId: null });
  assert.equal(engine.getDedupedCourseOptions().length, 2);
  assert.equal(engine.findLikelyDuplicateCourses(punctuationVariant).length, 1);
  assert.equal(state.courses.length, 2);
});

test('combo snapshots retain source tees for hole-specific display', () => {
  const engine = loadLiveEngine();
  const row = course();
  const red = JSON.parse(JSON.stringify(row.tees[0]));
  red.id = 'course-red'; red.teeName = 'Red'; red.holes.forEach(hole => { hole.yardage -= 80; });
  const combo = JSON.parse(JSON.stringify(row.tees[0]));
  combo.id = 'course-combo'; combo.teeName = 'Blue / Red Combo'; combo.isCombo = true;
  combo.comboSources = combo.holes.map((hole, idx) => ({ holeNumber: hole.holeNumber, sourceTeeId: idx % 2 ? red.id : row.tees[0].id }));
  combo.holes = combo.holes.map((hole, idx) => ({ ...(idx % 2 ? red.holes[idx] : hole) }));
  row.tees.push(red, combo);
  const state = engine.seedState(seedMatch(row, { teeId: combo.id, players: [{ playerId: 'p1', team: 1, slot: 0, teeId: combo.id, scores: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: null })) }] }));
  const match = state.matches[0];
  match.courseSnapshot = engine.getCourseSnapshotForMatch(match);
  assert.equal(match.courseSnapshot.tees.length, 3);
  state.courses[0].tees.find(tee => tee.id === red.id).teeName = 'Changed Library Red';
  assert.match(engine.getPlayerHoleTeeInfo(match, match.players[0], 1).label, /^Red ·/);
});

test('scorecard import payload preserves single-file compatibility and combines multiple files', () => {
  const engine = loadLiveEngine();
  const front = { fileName: 'front.jpg', mimeType: 'image/jpeg', dataUrl: 'data:front', label: 'Front / Page 1' };
  const back = { fileName: 'back.jpg', mimeType: 'image/jpeg', dataUrl: 'data:back', label: 'Back / Page 2' };
  const single = engine.buildScorecardImportRequestBody([front]);
  assert.equal(single.fileName, 'front.jpg');
  assert.equal('files' in single, false);
  const multi = engine.buildScorecardImportRequestBody([front, back]);
  assert.deepEqual(JSON.parse(JSON.stringify(multi.files)), [front, back]);
  assert.equal(multi.requestedSchema, 'the-dye-ledger-scorecard-v1');
});

test('partial scorecard extraction produces explicit review guidance', () => {
  const engine = loadLiveEngine();
  const warnings = engine.getScorecardImportReviewWarnings({
    name: 'Partial Course',
    tees: [{ teeName: 'Blue', rating: null, slope: null, holes: [{ holeNumber: 1, par: 4, strokeIndex: null, yardage: null }] }],
  });
  assert.equal(warnings.some(message => /missing holes 2, 3/.test(message)), true);
  assert.equal(warnings.some(message => /SI missing/.test(message)), true);
  assert.equal(warnings.some(message => /yardage missing/.test(message)), true);
  assert.equal(warnings.some(message => /rating is missing/.test(message)), true);
});

test('16-hole and 17-hole imports identify exact missing holes and require confirmation', () => {
  const engine = loadLiveEngine();
  const makeDraft = count => ({
    name: 'Regression Course', holeCount: 18,
    tees: [{ teeName: 'Blue', rating: 72, slope: 113, holes: Array.from({ length: count }, (_, idx) => ({ holeNumber: idx + 1, par: 4, strokeIndex: idx + 1, yardage: 400 })) }],
  });
  const sixteen = engine.getScorecardImportSaveGuard(makeDraft(16));
  const seventeen = engine.getScorecardImportSaveGuard(makeDraft(17));
  assert.equal(sixteen.requiresConfirmation, true);
  assert.equal(sixteen.warnings.some(message => /missing holes 17, 18/.test(message)), true);
  assert.equal(seventeen.requiresConfirmation, true);
  assert.equal(seventeen.warnings.some(message => /missing hole 18/.test(message)), true);
});

test('missing non-terminal hole is named and a complete 18-hole import needs no confirmation', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: 4, strokeIndex: idx + 1, yardage: 400 }));
  const incomplete = engine.getScorecardImportSaveGuard({ name: 'Missing Nine', holeCount: 18, tees: [{ teeName: 'Blue', rating: 72, slope: 113, holes: holes.filter(hole => hole.holeNumber !== 9) }] });
  assert.equal(incomplete.warnings.some(message => /missing hole 9/.test(message)), true);
  const complete = engine.getScorecardImportSaveGuard({ name: 'Complete', holeCount: 18, tees: [{ teeName: 'Blue', rating: 72, slope: 113, holes }] });
  assert.equal(complete.requiresConfirmation, false);
  assert.equal(complete.warnings.length, 0);
});

test('Play status line stays hidden when no competition is selected', () => {
  const engine = loadLiveEngine();
  const libraryCourse = course();
  const state = engine.seedState(seedMatch(libraryCourse));
  const match = state.matches[0];
  assert.equal(engine.getPrimaryMatchStatusLine(match, engine.computeMatchMetrics(match)), '');
});

test('completed-summary session guard requires the same completed active match', () => {
  const engine = loadLiveEngine();
  const completed = { id: 'saved-round', status: 'complete' };
  const active = { id: 'live-round', status: 'active' };
  assert.equal(engine.isCompletedSummarySession(completed, completed.id, completed.id), true);
  assert.equal(engine.isCompletedSummarySession(completed, completed.id, 'different-round'), false);
  assert.equal(engine.isCompletedSummarySession(active, active.id, active.id), false);
  assert.equal(engine.isCompletedSummarySession(completed, null, completed.id), false);
});

test('scorecard import status safely no-ops when import DOM is absent', () => {
  const engine = loadLiveEngine();
  assert.doesNotThrow(() => engine.updateScorecardImportStatus());
});
