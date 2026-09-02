import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('a verified publish clears obsolete attention flags', () => {
  const engine = loadLiveEngine();
  const course = { cloudSyncError: 'Cloud verification failed: expected 7 tees, found 4.', cloudIncomplete: true };
  assert.equal(engine.markCoursePublishVerified(course), course);
  assert.equal(course.cloudSyncError, '');
  assert.equal(course.cloudIncomplete, false);
});

test('attention flags clear only after complete cloud verification', () => {
  assert.match(app, /await verifyPublishedCourse\(client, cloudCourseId, course\);\s*markCoursePublishVerified\(course\);/);
  assert.doesNotMatch(app, /markCoursePublishVerified\(course\);\s*await verifyPublishedCourse/);
});

test('verified draft returns to Draft Uploaded instead of Needs Attention', () => {
  const engine = loadLiveEngine();
  const course = {
    cloudPublicationStatus: 'draft', cloudSyncState: 'draft-uploaded',
    cloudSyncError: 'old failure', cloudIncomplete: true, cloudCourseId: 'cloud-course',
  };
  assert.equal(engine.getCourseLibraryStateLabel(course), 'Needs Attention');
  engine.markCoursePublishVerified(course);
  assert.equal(engine.getCourseLibraryStateLabel(course), 'Draft Uploaded');
});

test('a complete cloud refresh clears stale attention state without another upload', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: 4, strokeIndex: idx + 1, yardage: 400 }));
  const existing = {
    id: 'local-promontory', name: 'Promontory Nicklaus', source: 'scorecard-import',
    cloudCourseId: 'cloud-promontory', cloudPublicationStatus: 'draft', cloudSyncState: 'draft-uploaded',
    cloudSyncError: 'old verification failure', cloudIncomplete: true,
    tees: [{ id: 'local-blue', cloudTeeId: 'cloud-blue', teeName: 'Blue', gender: 'M', holes }],
  };
  const seeded = engine.seedState({ courses: [existing], players: [], matches: [], activeMatchId: null });
  engine.mergeSupabaseCourses([{
    id: 'cloud-promontory', cloudCourseId: 'cloud-promontory', name: 'Promontory Nicklaus', source: 'supabase',
    cloudPublicationStatus: 'draft', cloudIncomplete: false,
    tees: [{ id: 'cloud-blue', cloudTeeId: 'cloud-blue', teeName: 'Blue', gender: 'M', holes }],
  }]);
  const refreshed = seeded.courses[0];
  assert.equal(engine.getCourseLibraryStateLabel(refreshed), 'Draft Uploaded');
  assert.equal(refreshed.cloudSyncError, '');
  assert.equal(refreshed.cloudIncomplete, false);
});

test('Publish Local Changes refreshes cloud-backed attention courses even when no upload is pending', () => {
  assert.match(app, /if \(!localCourses\.length\) \{[\s\S]*getCourseLibraryStateLabel\(course\) === 'Needs Attention'[\s\S]*refreshSupabaseCoursesByIds\(client, attentionCourseIds\)/);
  assert.match(app, /Cloud verification refreshed\. Repaired course status is current\./);
});
