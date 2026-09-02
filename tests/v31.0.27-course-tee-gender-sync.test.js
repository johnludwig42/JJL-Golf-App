import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202609020001_v31_0_27_course_tee_gender_identity.sql', import.meta.url), 'utf8');
const rollback = fs.readFileSync(new URL('../supabase/rollbacks/202609020001_v31_0_27_course_tee_gender_identity_rollback.sql', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function holes() {
  return Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: idx % 4 === 0 ? 5 : 4, strokeIndex: idx + 1, yardage: 350 + idx }));
}

function tee(teeName, gender, cloudTeeId = '') {
  return { teeName, gender, cloudTeeId, rating: 72, slope: 130, holes: holes() };
}

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('seven local tees remain seven payload tees when names repeat across genders', () => {
  const engine = loadLiveEngine();
  const course = {
    id: 'promontory-nicklaus', name: 'Promontory Nicklaus',
    tees: [tee('Black', 'M'), tee('Gold', 'M'), tee('Gold', 'F'), tee('Blue', 'M'), tee('Blue', 'F'), tee('White', 'M'), tee('White', 'F')],
  };
  assert.equal(engine.getDuplicateCourseTeeIdentities(course).length, 0);
  const payload = engine.buildAtomicCoursePublishPayload(course);
  assert.equal(payload.tees.length, 7);
  assert.equal(new Set(payload.tees.map(row => `${row.tee_name.toLowerCase()}|${row.gender}`)).size, 7);
  assert.equal(payload.tees.filter(row => row.tee_name === 'Gold').length, 2);
});

test('same-name same-gender local collisions stop before publishing', () => {
  const engine = loadLiveEngine();
  const course = { name: 'Collision Course', tees: [tee('Blue', 'M'), tee('Blue', 'M')] };
  assert.equal(engine.getDuplicateCourseTeeIdentities(course).length, 1);
  assert.throws(() => engine.buildAtomicCoursePublishPayload(course), /Duplicate local tee identity: Blue \(Men\)/);
});

test('cloud tee payload persists normalized gender', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.buildCloudTeePayload('course-1', tee('Forward', 'F')).gender, 'F');
  assert.equal(engine.buildCloudTeePayload('course-1', tee('Back', 'anything')).gender, 'M');
});

test('migration makes tee identity course plus normalized name plus gender', () => {
  assert.match(migration, /add column if not exists gender text not null default 'M'/i);
  assert.match(migration, /unique index if not exists course_tees_course_name_gender_key[\s\S]*course_id, lower\(btrim\(tee_name\)\), gender/i);
  assert.match(migration, /lower\(btrim\(tee_name\)\) = lower\(btrim\(v_tee->>'tee_name'\)\)[\s\S]*gender = v_gender/i);
  assert.match(migration, /insert into public\.course_tees\(course_id, tee_name, gender,/i);
  assert.match(migration, /update public\.course_tees set[\s\S]*gender = v_gender/i);
});

test('atomic publish detects collapsed tee identities before commit', () => {
  assert.match(migration, /duplicate tee name and gender identities/i);
  assert.match(migration, /count\(distinct tee_id\)[\s\S]*<> v_expected_tee_count/i);
  assert.match(migration, /count\(\*\) from public\.course_tees where course_id::text = v_course_id\) <> v_expected_tee_count/i);
  assert.match(migration, /Cloud hole verification failed: every tee must retain 9 or 18 holes/i);
  assert.match(migration, /begin;[\s\S]*create or replace function[\s\S]*commit;/i);
});

test('migration and rollback preserve all Course Library rows and gender data', () => {
  assert.doesNotMatch(migration, /drop table|truncate table/i);
  assert.doesNotMatch(rollback, /drop column|delete from|truncate table|drop table/i);
  assert.match(rollback, /gender column and its values are intentionally retained/i);
});
