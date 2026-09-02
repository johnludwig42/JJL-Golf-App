import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentVersionBare } from './support/release-identity.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const report = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function sourceSection(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
}

test('release identity is aligned to the cleanup release', () => {
  assert.equal(packageJson.version, currentVersionBare);
});

test('shared Play header builders preserve the v31.0.33 text contracts exactly', () => {
  const holeSource = sourceSection('function buildPlayHoleMetaText', 'function buildPlayFeaturedStatusPair');
  const buildHoleMeta = Function('formatYardageValue', `${holeSource}; return buildPlayHoleMetaText;`)(value => String(value));
  assert.equal(buildHoleMeta({ par: 4, yardage: 433, strokeIndex: 2 }), 'Par 4 · 433 yd · SI 2');
  assert.equal(buildHoleMeta({ par: null, yardage: null, strokeIndex: null }), 'Par — · SI —');

  const featuredSource = sourceSection('function buildPlayFeaturedStatusPair', 'function buildPlaySaveState');
  const buildFeatured = Function(
    'getPrimaryMatchStatusLine', 'getMatchStatusOptions', 'getFeaturedGameLabel', 'escapeHtml',
    `${featuredSource}; return buildPlayFeaturedStatusPair;`
  )(
    () => 'Nassau: Blue +2 thru 8',
    () => [{ key: 'nassau' }],
    (_match, key) => key === 'team_match' ? 'Team Match' : 'Nassau',
    value => String(value)
  );
  assert.equal(buildFeatured({}, {}), '<span>Nassau</span><strong>Blue +2 thru 8</strong>');
  assert.equal(buildFeatured({}, {}, 'team_match'), '<span>Team Match</span><strong>Blue +2 thru 8</strong>');

  const saveSource = sourceSection('function buildPlaySaveState', 'function renderHoleSelector');
  const buildSave = Function('getPlayerModeSavePresentation', `${saveSource}; return buildPlaySaveState;`)(() => ({ tone: 'saved', label: 'Saved ✓' }));
  assert.deepEqual(buildSave({}), { tone: 'saved', label: 'Saved ✓' });
});

test('Classic and Player wrappers consume the shared builders without changing their classes', () => {
  const selector = sourceSection('function renderHoleSelector', 'function renderSneakySandyPoleyEntry');
  assert.match(selector, /player-mode-hole-meta">\$\{holeMetaText\}/);
  assert.match(selector, /player-mode-header-match-status">\$\{featuredStatusPair\}/);
  assert.match(selector, /player-mode-save-state" data-tone="\$\{saveState\.tone\}" aria-live="polite"/);
  assert.match(selector, /classic-hole-meta">\$\{holeMetaText\}/);
  assert.match(selector, /classic-header-match-status">\$\{featuredStatusPair\}/);
  assert.match(selector, /classic-header-save-state" data-tone="\$\{saveState\.tone\}"/);
  assert.equal((selector.match(/buildPlayHoleMetaText\(hole\)/g) || []).length, 2);
  assert.equal((selector.match(/buildPlaySaveState\(match\)/g) || []).length, 2);
});

test('retired hole-jump tiles and specifically identified dead helpers are fully removed', () => {
  for (const name of ['renderHoleJumpTiles', 'formatConciseTeamDiff', 'buildLiveScoringStatusLine']) {
    assert.doesNotMatch(app, new RegExp(`\\b${name}\\b`));
  }
  assert.doesNotMatch(html, /holeJumpTiles|hole-jump-tiles/);
  assert.doesNotMatch(css, /hole-jump-tiles|hole-jump-tile/);
});

test('Ledger Entry uses the clearer no-double label', () => {
  assert.match(report, /No<br>double\+/);
  assert.match(report, /"No double\+"/);
  assert.doesNotMatch(report, /Double(?:<br>| )avoid\./);
});
