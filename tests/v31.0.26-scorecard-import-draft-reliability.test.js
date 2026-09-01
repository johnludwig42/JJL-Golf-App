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

test('working-draft merge retains metadata while accepting every edited course and tee value', () => {
  const engine = loadLiveEngine();
  const original = {
    name: '', city: '', state: '', country: 'United States of America', confidence: 88,
    uncertainFields: ['course name'], totalPar: 72,
    tees: [{ id: 'old-tee', teeName: 'Blue' }],
  };
  const reviewed = {
    courseName: 'Prairie Landing', city: 'West Chicago', state: 'IL', country: 'United States of America', holeCount: 18,
    tees: [{ id: 'old-tee', teeName: 'Green', rating: 71.2, slope: 128, par: 72, holes: [{ holeNumber: 1, par: 4, strokeIndex: 7, yardage: 412 }] }],
  };
  const merged = engine.mergeScorecardImportReviewDraft(original, reviewed);
  assert.equal(merged.name, 'Prairie Landing');
  assert.equal(merged.city, 'West Chicago');
  assert.equal(merged.state, 'IL');
  assert.equal(merged.tees[0].teeName, 'Green');
  assert.equal(merged.tees[0].holes[0].yardage, 412);
  assert.equal(merged.confidence, 88);
  assert.deepEqual(merged.uncertainFields, ['course name']);
});

test('review collection preserves tee identity instead of generating a new tee on every keystroke', () => {
  assert.match(app, /const existingTee = uiState\.scorecardImportData\?\.tees\?\.\[idx\] \|\| \{\}/);
  assert.match(app, /id: existingTee\.id \|\| uid\(\)/);
});

test('every editable imported-scorecard field updates the live working draft', () => {
  assert.match(app, /scorecardImportReview\.addEventListener\('input',[\s\S]*\[data-import-field\], \[data-tee-field\], \[data-hole-field\][\s\S]*syncScorecardImportReviewDraftFromDom\(\)/);
  assert.match(app, /scorecardImportReview\.addEventListener\('change',[\s\S]*syncScorecardImportReviewDraftFromDom\(\)/);
});

test('a review rerender captures the draft before rebuilding and restores editing context afterward', () => {
  assert.match(app, /function renderScorecardImportReview\(\) \{[\s\S]*captureScorecardImportReviewViewState\(el\);[\s\S]*syncScorecardImportReviewDraftFromDom\(\);[\s\S]*const data = uiState\.scorecardImportData/);
  assert.match(app, /restoreScorecardImportReviewViewState\(el, viewState\);/);
  assert.match(app, /active\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /active\.setSelectionRange\(viewState\.selectionStart/);
  assert.match(app, /openTees:/);
  assert.match(app, /window\.scrollTo\(Number\(viewState\.pageScrollX\)/);
});

test('save still collects the current controls as the final source of truth', () => {
  assert.match(app, /function saveImportedScorecardCourse\(\) \{\s*const reviewed = collectScorecardImportReviewData\(\)/);
});
