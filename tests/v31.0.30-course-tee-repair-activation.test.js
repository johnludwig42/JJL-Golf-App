import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('course tee repair ships under a distinct release and cache identity', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.match(worker, new RegExp(`cacheName: 'the-dye-ledger-${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('release retains the complete tee-count repair and approval gate', () => {
  assert.match(app, /const cloudNeedsTeeRepair = localOnlyTees\.length > 0/);
  assert.match(app, /cloudTeeRepairPending: cloudNeedsTeeRepair/);
  assert.match(app, /Cloud \$\{[^}]+\} has \$\{cloudTees\.length\} of \$\{cloudTees\.length \+ localOnlyTees\.length\} local tees/);
  assert.match(app, /const canApproveDraft = [^;]+&& !c\.cloudIncomplete;/);
});
