import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/202607160001_v30_3_75a_course_library_security.sql','utf8');
const rollback = readFileSync('supabase/rollbacks/202607160001_v30_3_75a_course_library_security_rollback.sql','utf8');
const policyTest = readFileSync('supabase/tests/course_library_rls_test.sql','utf8');
const rollbackTest = readFileSync('supabase/tests/course_library_rollback_test.sql','utf8');
const runner = readFileSync('scripts/test-course-library-rls.ps1','utf8');

test('migration contains inventory, relationship, and legacy preservation gates', () => {
  assert.match(migration, /10::bigint, 54::bigint, 972::bigint/);
  assert.match(migration, /orphan or cross-course hole/);
  assert.match(migration, /source = coalesce\(source, 'legacy'\)/);
});

test('Course Library writes never use unrestricted policy predicates', () => {
  const writePolicies = [...migration.matchAll(/create policy[\s\S]*?(?=create policy|-- Postflight)/gi)]
    .map(match => match[0]).filter(sql => /for (insert|update|delete)/i.test(sql));
  assert.ok(writePolicies.length >= 9);
  for (const policy of writePolicies) {
    assert.doesNotMatch(policy, /(?:using|with check)\s*\(\s*true\s*\)/i);
  }
});

test('rollback preserves data and keeps schema cleanup explicitly manual', () => {
  assert.doesNotMatch(rollback, /^\s*drop table public\.(courses|course_tees|course_holes)/mi);
  assert.match(rollback, /STAGE 2 IS INTENTIONALLY NOT AUTOMATIC/);
});

test('real SQL suite covers public, anonymous, owner, non-owner, and maintainer actors', () => {
  for (const actor of ['Public','Anonymous Auth','Permanent owner','Non-owner','Maintainer']) {
    assert.match(policyTest, new RegExp(actor,'i'));
  }
  assert.match(policyTest, /cross-course hole denied/);
  assert.match(policyTest, /owner cannot approve/);
});

test('SECURITY DEFINER functions pin search_path and protected publication grants', () => {
  for (const name of ['course_library_is_permanent_user','course_library_is_maintainer','publish_course']) {
    assert.match(migration, new RegExp(`function public\\.${name}[\\s\\S]*?security definer set search_path = ''`,'i'));
  }
  assert.match(migration,/revoke all on function public\.publish_course\(text\) from public/i);
  assert.match(migration,/grant execute on function public\.publish_course\(text\) to authenticated/i);
  assert.match(policyTest,/PUBLIC cannot execute publisher/);
  assert.match(policyTest,/non-maintainer cannot publish/);
});

test('explicit grants and role-table isolation match the RLS contract', () => {
  assert.match(migration,/revoke all on table public\.course_library_roles from public, anon, authenticated/i);
  assert.match(migration,/grant select on table public\.courses, public\.course_tees, public\.course_holes to anon/i);
  assert.match(migration,/grant select, insert, update, delete on table public\.courses, public\.course_tees, public\.course_holes to authenticated/i);
});

test('rollback probe preserves baseline and runner blocks production reference', () => {
  assert.match(rollbackTest,/10::bigint,54::bigint,972::bigint/);
  assert.match(rollbackTest,/rollback-availability-probe/);
  assert.match(runner,/ueallqqmdyzwdlmoyxfo/);
  assert.match(runner,/AllowRemoteDisposable/);
  assert.match(runner,/ValidateTargetOnly/);
});
