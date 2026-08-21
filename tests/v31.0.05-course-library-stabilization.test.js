import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const holeUpsertMigration = readFileSync(new URL('../supabase/migrations/202608210001_v31_0_05_course_hole_upsert_key.sql', import.meta.url), 'utf8');

function holes() {
  return Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: index % 4 === 2 ? 3 : 4, strokeIndex: index + 1, yardage: 150 + index * 10 }));
}

test('approved catalog courses are never selected for browser writes', () => {
  const engine = loadLiveEngine();
  const approved = { id: 'local-approved', name: 'Approved Club', source: 'manual', cloudCourseId: 'cloud-approved', cloudPublicationStatus: 'approved', cloudSyncState: 'pending-sync', tees: [] };
  assert.equal(engine.isProtectedCloudCourse({ publication_status: 'approved', source: 'user' }), true);
  assert.equal(engine.isProtectedCloudCourse({ publication_status: 'draft', source: 'user' }), false);
  assert.equal(engine.isCourseCloudWriteCandidate(approved), false);
  engine.markCourseFromCloudRow(approved, { id: 'cloud-approved', publication_status: 'approved', owner_user_id: 'owner-1' });
  assert.equal(approved.cloudSyncState, 'approved');
  assert.equal(approved.cloudSyncError, '');
  assert.equal(engine.getCourseLibraryStateLabel(approved), 'Approved');
});

test('course and tee comparisons skip timestamp-only rewrites', () => {
  const engine = loadLiveEngine();
  const course = { name: 'Bridgewater Club', city: 'Carmel', state: 'IN', country: 'United States of America' };
  assert.equal(engine.cloudCourseNeedsUpdate(course, { ...course, updated_at: 'yesterday' }), false);
  assert.equal(engine.cloudCourseNeedsUpdate({ ...course, city: 'Westfield' }, course), true);
  const tee = { teeName: 'Blue', rating: 72.1, slope: 130, holes: holes() };
  const totalYards = tee.holes.reduce((sum, hole) => sum + hole.yardage, 0);
  assert.equal(engine.cloudTeeNeedsUpdate('course-1', tee, { course_id: 'course-1', tee_name: 'Blue', rating: 72.1, slope: 130, total_yards: totalYards }), false);
});

test('all tee holes are sent in one conflict-safe batch', async () => {
  const engine = loadLiveEngine();
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, 'course_holes');
      return {
        upsert(payload, options) {
          calls.push({ payload, options });
          return { select: async () => ({ data: payload.map((row, index) => ({ id: `hole-${index + 1}`, hole_number: row.hole_number })), error: null }) };
        },
      };
    },
  };
  const result = await engine.insertOrUpdateCloudTeeHoles(client, 'course-1', 'tee-1', { holes: holes() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.length, 18);
  assert.equal(calls[0].options.onConflict, 'tee_id,hole_number');
  assert.equal(result.written, 18);
});

test('production schema provides the conflict key required by batched hole uploads', () => {
  assert.match(holeUpsertMigration, /group by tee_id, hole_number\s+having count\(\*\) > 1/i);
  assert.match(holeUpsertMigration, /unique \(tee_id, hole_number\)/i);
  assert.doesNotMatch(holeUpsertMigration, /delete\s+from\s+public\.course_holes/i);
  assert.doesNotMatch(holeUpsertMigration, /update\s+public\.course_holes/i);
});

test('course cloud operations retry once and remain bounded', async () => {
  const engine = loadLiveEngine();
  let attempts = 0;
  const result = await engine.runCourseCloudOperation(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary');
    return 'recovered';
  }, 'Test operation', { timeoutMs: 50, retries: 1 });
  assert.equal(result, 'recovered');
  assert.equal(attempts, 2);
  await assert.rejects(engine.runCourseCloudOperation(() => new Promise(() => {}), 'Stalled operation', { timeoutMs: 5, retries: 0 }), /timed out/);
});

test('sync refresh is scoped and maintainer approval is protected', () => {
  const syncStart = source.indexOf('async function syncCourseLibrary()');
  const syncEnd = source.indexOf('const syncLocalCoursesToCloud', syncStart);
  const syncSource = source.slice(syncStart, syncEnd);
  assert.match(syncSource, /refreshSupabaseCoursesByIds\(client, affectedCourseIds\)/);
  assert.doesNotMatch(syncSource, /loadSupabaseCourses\(/);
  assert.match(source, /client\.rpc\('publish_course', \{ p_course_id: cloudCourseId \}\)/);
  assert.match(source, /Approved catalog courses are protected/);
  assert.match(source, /Publishing course \$\{courseIndex \+ 1\} of \$\{localCourses\.length\}/);
  assert.match(syncSource, /course save`, \{ retries: existingCourse \? 1 : 0 \}/);
  assert.match(syncSource, /tee save`, \{ retries: existingTee \? 1 : 0 \}/);
});
