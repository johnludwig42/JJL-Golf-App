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

test('course identity treats common United States country labels as equivalent', () => {
  const engine = loadLiveEngine();
  const usa = course('usa', 'Chatham Hills', 'Westfield');
  const full = course('full', 'Chatham Hills', 'Westfield');
  full.country = 'United States of America';
  const state = engine.seedState({ players: [], courses: [usa, full], matches: [], activeMatchId: null });
  assert.equal(engine.isSameCourseIdentity(usa, full), true);
  assert.equal(engine.normalizeCourseCountryIdentity('U.S.A.'), 'united states of america');
  assert.equal(engine.getDedupedCourseOptions().length, 1);
  assert.equal(state.courses.length, 2, 'deduplication must not delete stored records');
});

test('identical reviewed scorecards resolve to an existing saved course without mutating storage', () => {
  const engine = loadLiveEngine();
  const existing = course('existing', 'Chatham Hills', 'Westfield');
  existing.source = 'scorecard-import';
  existing.cloudSyncState = 'local-draft';
  const repeatedImport = JSON.parse(JSON.stringify(existing));
  repeatedImport.id = 'new-import-id';
  repeatedImport.country = 'United States of America';
  repeatedImport.importedAt = '2026-08-05T12:00:00.000Z';
  const state = engine.seedState({ players: [], courses: [existing], matches: [], activeMatchId: null });
  assert.equal(engine.findEquivalentSavedCourse(repeatedImport)?.id, existing.id);
  assert.equal(state.courses.length, 1);
});

test('cloud hole loading paginates beyond the Supabase 1,000-row response limit', async () => {
  const engine = loadLiveEngine();
  const sourceRows = Array.from({ length: 1116 }, (_, idx) => ({ id: `hole-${String(idx + 1).padStart(4, '0')}`, hole_number: (idx % 18) + 1 }));
  const requestedRanges = [];
  const client = {
    from(table) {
      assert.equal(table, 'course_holes');
      return {
        select() { return this; },
        order(column) { assert.equal(column, 'id'); return this; },
        async range(from, to) {
          requestedRanges.push([from, to]);
          return { data: sourceRows.slice(from, to + 1), error: null };
        },
      };
    },
  };
  const rows = await engine.fetchAllSupabaseRows(client, 'course_holes');
  assert.equal(rows.length, 1116);
  assert.deepEqual(JSON.parse(JSON.stringify(requestedRanges)), [[0, 999], [1000, 1999]]);
});

test('partial cloud tee data cannot replace a complete local 18-hole tee', () => {
  const engine = loadLiveEngine();
  const local = course('local', 'Chatham Hills', 'Westfield').tees[0];
  const cloud = JSON.parse(JSON.stringify(local));
  cloud.id = 'cloud-tee';
  cloud.cloudTeeId = 'cloud-tee';
  cloud.holes = cloud.holes.slice(0, 17);
  const merged = engine.mergeCloudTeePreservingCompleteLocal(local, cloud);
  assert.equal(engine.getCourseTeeHoleCoverage(local).complete, true);
  assert.equal(engine.getCourseTeeHoleCoverage(cloud, 18).complete, false);
  assert.equal(merged.holes.length, 18);
  assert.match(merged.cloudHoleCoverageWarning, /missing holes 18/);
});

test('cloud refresh cannot overwrite or absorb a complete unsynced scorecard import', () => {
  const engine = loadLiveEngine();
  const imported = course('local-import', 'Purgatory Golf Club', 'Noblesville');
  imported.source = 'scorecard-import';
  imported.cloudSyncState = 'local-draft';
  imported.tees[0].teeName = 'White';
  imported.tees[0].par = 72;

  const staleCloud = course('cloud-course', 'Purgatory Golf Club', 'Noblesville');
  staleCloud.source = 'supabase';
  staleCloud.cloudCourseId = staleCloud.id;
  staleCloud.tees[0].teeName = 'White';
  staleCloud.tees[0].holes = staleCloud.tees[0].holes.slice(0, 16);
  staleCloud.tees[0].par = 64;

  const state = engine.seedState({ players: [], courses: [imported], matches: [], activeMatchId: null });
  engine.mergeSupabaseCourses([staleCloud]);

  const savedImport = state.courses.find(row => row.id === imported.id);
  assert.equal(state.courses.length, 2);
  assert.equal(savedImport.cloudSyncState, 'local-draft');
  assert.equal(savedImport.tees[0].holes.length, 18);
  assert.equal(savedImport.tees[0].par, 72);
});

test('cloud refresh preserves pending local tee repairs for an established cloud course', () => {
  const engine = loadLiveEngine();
  const pending = course('local-cache', 'Purgatory Golf Club', 'Noblesville');
  pending.cloudCourseId = 'cloud-course';
  pending.source = 'scorecard-import';
  pending.cloudSyncState = 'pending-sync';
  pending.tees[0].teeName = 'White';

  const staleCloud = course('cloud-course', 'Purgatory Golf Club', 'Noblesville');
  staleCloud.source = 'supabase';
  staleCloud.cloudCourseId = staleCloud.id;
  staleCloud.tees[0].teeName = 'White';
  staleCloud.tees[0].holes = staleCloud.tees[0].holes.slice(0, 16);
  staleCloud.tees[0].par = 64;

  const state = engine.seedState({ players: [], courses: [pending], matches: [], activeMatchId: null });
  engine.mergeSupabaseCourses([staleCloud]);

  assert.equal(state.courses.length, 1);
  assert.equal(state.courses[0].cloudSyncState, 'pending-sync');
  assert.equal(state.courses[0].tees[0].holes.length, 18);
  assert.equal(state.courses[0].tees[0].par, 72);
});

test('course publishing selects local drafts without rewriting downloaded catalog courses', () => {
  const engine = loadLiveEngine();
  const catalog = course('cloud-course', 'Catalog Course', 'Noblesville');
  catalog.source = 'supabase';
  catalog.cloudCourseId = catalog.id;
  catalog.cloudSyncState = 'synced';
  const local = course('local-course', 'Local Course', 'Carmel');
  local.source = 'manual';
  local.cloudSyncState = 'pending-sync';

  assert.equal(engine.isCourseCloudWriteCandidate(catalog), false);
  assert.equal(engine.isCourseCloudWriteCandidate(local), true);
  assert.equal(engine.isCourseCloudWriteCandidate({ id: 'new', name: 'Unsaved Local', tees: [] }), true);
  assert.equal(engine.isCourseCloudWriteCandidate({ id: 'blank', name: '' }), false);
});

test('course publishing repairs stale pending flags left on downloaded catalog courses', () => {
  const engine = loadLiveEngine();
  const catalog = course('cloud-course', 'Catalog Course', 'Noblesville');
  catalog.source = 'supabase';
  catalog.cloudCourseId = catalog.id;
  catalog.cloudSyncState = 'pending-sync';
  catalog.cloudSyncError = 'Duplicate cloud course detected';

  assert.equal(engine.isCourseCloudWriteCandidate(catalog), false);

  const refreshed = JSON.parse(JSON.stringify(catalog));
  refreshed.cloudSyncState = 'synced';
  refreshed.cloudSyncError = '';
  const state = engine.seedState({ players: [], courses: [catalog], matches: [], activeMatchId: null });
  engine.mergeSupabaseCourses([refreshed]);

  assert.equal(state.courses.length, 1);
  assert.equal(state.courses[0].cloudSyncState, 'synced');
  assert.equal(state.courses[0].cloudSyncError, '');
});

test('course publishing distinguishes sign-in and Course Library authorization', async () => {
  const engine = loadLiveEngine();
  const signedOut = await engine.getCourseLibraryWriteAccess({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => ({ data: false, error: null }),
  });
  assert.equal(signedOut.code, 'SIGN_IN_REQUIRED');

  const unauthorized = await engine.getCourseLibraryWriteAccess({
    auth: { getUser: async () => ({ data: { user: { id: 'account-1', is_anonymous: false, app_metadata: {} } }, error: null }) },
    rpc: async () => ({ data: false, error: null }),
  });
  assert.equal(unauthorized.code, 'NOT_AUTHORIZED');

  const authorized = await engine.getCourseLibraryWriteAccess({
    auth: { getUser: async () => ({ data: { user: { id: 'account-1', is_anonymous: false, app_metadata: {} } }, error: null }) },
    rpc: async name => ({ data: name === 'course_library_can_write', error: null }),
  });
  assert.equal(authorized.allowed, true);
  assert.equal(authorized.code, 'AUTHORIZED');
  assert.equal(authorized.userId, 'account-1');
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

test('round timing starts once, formats elapsed time, and projects from completed-hole count', () => {
  const engine = loadLiveEngine();
  const match = { id: 'timed', status: 'active', holeCount: 18, roundTiming: { startedAt: null, endedAt: null } };
  assert.equal(engine.ensureRoundTimingStarted(match, '2026-07-11T13:00:00.000Z'), true);
  assert.equal(engine.ensureRoundTimingStarted(match, '2026-07-11T14:00:00.000Z'), false);
  assert.equal(match.roundTiming.startedAt, '2026-07-11T13:00:00.000Z');
  assert.equal(engine.ensureRoundTimingEnded(match, '2026-07-11T17:07:00.000Z'), true);
  assert.equal(engine.ensureRoundTimingEnded(match, '2026-07-11T18:00:00.000Z'), false);
  assert.equal(match.roundTiming.endedAt, '2026-07-11T17:07:00.000Z');
  match.roundTiming.endedAt = null;
  const beforeProjection = engine.getRoundElapsedTimeState(match, { holeResults: [], players: [], tee: { holes: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1 })) } }, Date.parse('2026-07-11T14:00:00.000Z'));
  assert.equal(beforeProjection.projectionAvailable, false);
  assert.match(beforeProjection.label, /Pace available after 3 completed holes/);
  assert.equal(engine.formatRoundDuration(4 * 3600000 + 7 * 60000), '4h 7m');
});

test('projection and incomplete copy use completed-hole count for out-of-sequence play', () => {
  const engine = loadLiveEngine();
  const row = course();
  const scores = Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: [0, 1, 2, 5, 7].includes(idx) ? 4 : null }));
  const state = engine.seedState(seedMatch(row, {
    roundTiming: { startedAt: '2026-07-11T13:00:00.000Z', endedAt: null },
    players: [{ playerId: 'p1', team: 1, slot: 0, teeId: row.tees[0].id, scores }],
  }));
  const match = state.matches[0];
  const metrics = engine.computeMatchMetrics(match);
  const completion = engine.getRoundCompletionState(match, metrics);
  assert.equal(completion.completedHoleCount, 5);
  assert.equal(completion.completedHolesLabel, '1, 2, 3, 6, 8');
  assert.equal(completion.isSequential, false);
  assert.doesNotMatch(engine.buildRoundStatusSummary(match, metrics).headline, /through Hole 8/i);
  const timing = engine.getRoundElapsedTimeState(match, metrics, Date.parse('2026-07-11T14:00:00.000Z'));
  assert.equal(timing.projectionAvailable, true);
  assert.equal(Math.round(timing.projectedTotalMs / 60000), 216);
});

test('first hole completion timestamp is immutable and Handicap row has no totals', () => {
  const engine = loadLiveEngine();
  const match = { holeFirstCompletedAt: {} };
  assert.equal(engine.recordHoleFirstCompletedAt(match, 6, '2026-07-11T13:30:00.000Z'), true);
  assert.equal(engine.recordHoleFirstCompletedAt(match, 6, '2026-07-11T14:30:00.000Z'), false);
  assert.equal(match.holeFirstCompletedAt['6'], '2026-07-11T13:30:00.000Z');
  const row = course();
  const state = engine.seedState(seedMatch(row));
  const html = engine.buildClassicScorecard(state.matches[0], engine.computeMatchMetrics(state.matches[0]));
  const handicapRow = html.match(/<tr><td[^>]*><strong>Handicap<\/strong>[\s\S]*?<\/tr>/)?.[0] || '';
  assert.equal((handicapRow.match(/<strong>—<\/strong>/g) || []).length, 3);
});

test('nine-hole projection uses the selected nine-hole denominator', () => {
  const engine = loadLiveEngine();
  const row = course();
  const scores = Array.from({ length: 9 }, (_, idx) => ({ holeNumber: idx + 1, gross: idx < 3 ? 4 : null }));
  const state = engine.seedState(seedMatch(row, {
    holeCount: 9,
    roundTiming: { startedAt: '2026-07-11T13:00:00.000Z', endedAt: null },
    players: [{ playerId: 'p1', team: 1, slot: 0, teeId: row.tees[0].id, scores }],
  }));
  const match = state.matches[0];
  const timing = engine.getRoundElapsedTimeState(match, engine.computeMatchMetrics(match), Date.parse('2026-07-11T14:00:00.000Z'));
  assert.equal(timing.selectedHoleCount, 9);
  assert.equal(Math.round(timing.projectedTotalMs / 60000), 180);
});

test('pace projection suppresses implausibly short rounds and weather display is best-effort', () => {
  const engine = loadLiveEngine();
  const row = course();
  const scores = Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: idx < 3 ? 4 : null }));
  const state = engine.seedState(seedMatch(row, {
    roundTiming: { startedAt: '2026-07-11T13:00:00.000Z', endedAt: null },
    roundContext: { weather: { temperature: 72, windSpeed: 12, windDirection: 225, conditionsText: 'partly cloudy' } },
    players: [{ playerId: 'p1', team: 1, slot: 0, teeId: row.tees[0].id, scores }],
  }));
  const match = state.matches[0];
  const metrics = engine.computeMatchMetrics(match);
  const tooShort = engine.getRoundElapsedTimeState(match, metrics, Date.parse('2026-07-11T13:01:00.000Z'));
  assert.equal(tooShort.projectionAvailable, false);
  assert.equal(tooShort.valid, false);
  assert.equal(tooShort.label, 'Timing unavailable');
  const plausible = engine.getRoundElapsedTimeState(match, metrics, Date.parse('2026-07-11T13:42:00.000Z'));
  assert.equal(plausible.projectionAvailable, true);
  assert.match(plausible.label, /Projected pace 4h 12m/);
  assert.equal(engine.formatRoundWeatherDisplay({}), '');
  assert.equal(engine.formatRoundWeatherDisplay(match), 'Weather: 72°F · Wind 12 mph southwest · Partly cloudy');
  assert.equal(engine.buildRoundRecord(match, metrics).notes.weather.temperature, 72);
});
