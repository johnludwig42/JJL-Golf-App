import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = fs.readFileSync('app.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202610040001_v31_0_47_course_revision.sql', 'utf8');
const course = () => ({ id: 'local', name: 'Chatham Hills', source: 'supabase', cloudCourseId: 'cloud', cloudPublicationStatus: 'approved', tees: [{ id: 'blue', holes: [{ holeNumber: 1, par: 4 }] }] });
function client({ maintainer = true, error = null, row } = {}) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { id: 'editor', is_anonymous: false } } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'course_library_can_write') return { data: true };
      if (name === 'course_library_is_maintainer') return { data: maintainer };
      return { data: row ?? { id: 'cloud', publication_status: 'draft', owner_user_id: 'editor' }, error };
    } };
}
test('confirmed revision preserves local identities, tee content and historical snapshots', async () => {
  const engine = loadLiveEngine();
  const current = course();
  const snapshot = structuredClone(current);
  const api = client();
  await engine.requestCourseRevision(api, current);
  assert.equal(current.cloudPublicationStatus, 'draft');
  assert.equal(current.cloudOwnerUserId, 'editor');
  assert.deepEqual(current.tees, snapshot.tees);
  assert.equal(current.id, snapshot.id);
  assert.equal(snapshot.cloudPublicationStatus, 'approved');
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls.at(-1))), { name: 'revise_approved_course', args: { p_course_id: 'cloud' } });
  assert.equal(engine.isCourseCloudWriteCandidate(current), false);
  current.cloudSyncState = 'pending-sync';
  assert.equal(engine.isCourseCloudWriteCandidate(current), true);
});
test('non-maintainers cannot invoke the revision action', async () => {
  const engine = loadLiveEngine();
  const current = course(), before = structuredClone(current), api = client({ maintainer: false });
  await assert.rejects(engine.requestCourseRevision(api, current), /not authorized/);
  assert.deepEqual(current, before);
  assert.equal(api.calls.some(call => call.name === 'revise_approved_course'), false);
});
test('network, missing deployment and inconsistent responses leave approved data intact', async () => {
  for (const options of [{ error: { message: 'Network unavailable' } }, { error: { code: 'PGRST202' } }, { row: { id: 'wrong', publication_status: 'draft', owner_user_id: 'editor' } }]) {
    const engine = loadLiveEngine(), current = course(), before = structuredClone(current);
    await assert.rejects(engine.requestCourseRevision(client(options), current));
    assert.deepEqual(current, before);
  }
});
test('reapproval restores write protection and clears the revision marker', async () => {
  const engine = loadLiveEngine(), current = course();
  await engine.requestCourseRevision(client(), current);
  engine.markCourseFromCloudRow(current, { id: 'cloud', publication_status: 'approved' });
  current.cloudSyncState = 'pending-sync';
  assert.equal(current.cloudRevisionDraft, false);
  assert.equal(engine.isCourseCloudWriteCandidate(current), false);
});
test('draft edits survive cloud refresh without changing catalog identities', async () => {
  const engine = loadLiveEngine(), current = course();
  await engine.requestCourseRevision(client(), current);
  current.name = 'Corrected Chatham Hills'; current.cloudSyncState = 'pending-sync';
  const seeded = engine.seedState({ courses: [current], matches: [], players: [] });
  engine.mergeSupabaseCourses([{ ...course(), id: 'cloud', name: 'Chatham Hills', cloudPublicationStatus: 'draft' }]);
  assert.equal(seeded.courses[0].name, 'Corrected Chatham Hills');
  assert.equal(seeded.courses[0].id, 'local');
});
test('server action restricts transition and preserves related records', () => {
  assert.match(migration, /auth\.uid\(\) is null or not public\.course_library_is_maintainer/);
  assert.match(migration, /publication_status = 'approved'/);
  assert.match(migration, /owner_user_id = auth\.uid\(\)/);
  assert.match(migration, /revoke all .* from public, anon/);
  assert.doesNotMatch(migration, /delete from|truncate|update public\.(course_tees|course_holes|matches)/i);
  assert.match(source, /approvedReadOnly && uiState\.courseLibraryMaintainer && c\.cloudCourseId/);
  assert.match(source, /course\.cloudRevisionDraft && isCourseCloudWriteCandidate\(course\).*Publish Local Changes before approving/);
});
