import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202609020002_v31_0_29_course_approval_reliability.sql', import.meta.url), 'utf8');
const rollback = fs.readFileSync(new URL('../supabase/rollbacks/202609020002_v31_0_29_course_approval_reliability_rollback.sql', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('approval migration supports UUID-backed IDs and validates the complete draft', () => {
  assert.match(migration, /where id::text = v_course_id[\s\S]*publication_status = 'draft'/i);
  assert.doesNotMatch(migration, /where id = p_course_id/i);
  assert.match(migration, /every tee must contain exactly 9 or 18 holes/i);
  assert.match(migration, /duplicate tee name and gender identities/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.publish_course\(text\) to authenticated/i);
});

test('approval failure remains visible and retryable', () => {
  assert.match(app, /cloudPublicationStatus \|\| ''\)\.toLowerCase\(\) === 'draft'[\s\S]*data-approve-course[\s\S]*Retry Approval/);
  assert.match(app, /course\.cloudSyncError = error\?\.message[\s\S]*persist\(\{ skipRender: true \}\)/);
  assert.match(app, /approval needs attention: \$\{course\.cloudSyncError\}/);
  assert.match(app, /c\.cloudSyncError \? `<span class="tiny field-error course-meta-line">/);
});

test('approval rollback never removes Course Library data', () => {
  assert.doesNotMatch(rollback, /delete from|truncate table|drop table|drop column/i);
  assert.match(rollback, /disable approval rather than restore the UUID\/text mismatch/i);
});
