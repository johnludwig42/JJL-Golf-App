import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function section(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end));
}

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('Classic and Player modes expose only their own hole header', () => {
  const classic = section('function renderClassicPlayInputMode', 'function getEffectivePlayerStatTrackingMode');
  const player = section('function renderPlayerPlayInputMode', 'function renderPlayInputMode(context)');
  assert.match(classic, /activeHoleScoringTop'\)\?\.classList\.remove\('hidden'\)/);
  assert.match(classic, /playerModeHoleHeader'\)\?\.classList\.add\('hidden'\)/);
  assert.match(classic, /classList\.add\('classic-mode-play-active'\)/);
  assert.match(player, /activeHoleScoringTop'\)\?\.classList\.add\('hidden'\)/);
  assert.match(player, /playerModeBottomActions'\)\?\.classList\.remove\('hidden'\)/);
});

test('Classic header provides Prev, direct selection, Next, and the existing navigation path', () => {
  assert.match(html, /id="activeHoleScoringTop"[\s\S]*id="prevHoleBtn"[\s\S]*id="currentHoleBadge"[\s\S]*id="nextHoleBtn"/);
  assert.match(app, /currentHoleSelect'[\s\S]*saveCurrentHole\(\{ targetHole: selectedHole, silent: true \}\)/);
  assert.match(app, /prevHoleBtn'\)\.addEventListener\('click', \(\) => \{ saveCurrentHole\(\{ targetHole: 'previous', silent: true \}\)/);
  assert.match(app, /nextHoleBtn'\)\.addEventListener\('click', \(\) => \{ saveCurrentHole\(\{ advance: true, silent: true \}\)/);
});

test('Classic header renders current-hole facts and one resolved featured status', () => {
  const selector = section('function renderHoleSelector', 'function renderSneakySandyPoleyEntry');
  assert.match(selector, /playerHeader\.innerHTML = ''/);
  assert.match(selector, /classic-hole-meta">\$\{holeMetaText\}/);
  assert.match(selector, /classic-header-match-status">\$\{featuredStatusPair\}/);
  assert.match(selector, /buildPlayFeaturedStatusPair\(match, metrics, 'team_match'\)/);
  assert.match(selector, /buildPlaySaveState\(match\)/);
  const classic = section('function renderClassicPlayInputMode', 'function getEffectivePlayerStatTrackingMode');
  assert.match(classic, /playMatchSummary\.innerHTML = ''/);
  assert.match(classic, /playMatchSummary\.classList\.add\('hidden'\)/);
  assert.doesNotMatch(classic, /buildFeaturedMatchStatus/);
});

test('Classic exposes exactly one Save Hole Scores and one persistent Scoreboard control', () => {
  assert.equal((html.match(/id="saveScoresBtn"/g) || []).length, 1);
  assert.equal((html.match(/id="quickScoreboardBtn"/g) || []).length, 1);
  assert.match(html, /id="activeHoleScoringTop"[\s\S]*id="quickScoreboardBtn"/);
  assert.match(css, /#score \.score-hole-nav\{position:sticky/);
  assert.match(css, /body\.classic-mode-play-active\{overflow-x:clip!important;overflow-y:visible!important\}/);
  assert.match(css, /\.classic-header-actions button\{min-height:44px\}/);
});

test('Classic overflow relocates End Round Early without changing its completion gate', () => {
  assert.equal((html.match(/id="endRoundEarlyBtn"/g) || []).length, 1);
  assert.match(html, /id="classicPlayOverflowMenu"[\s\S]*id="endRoundEarlyBtn"/);
  assert.match(html, /id="classicRoundScoringModeSelect"/);
  assert.match(html, /id="classicRoundStatModeSelect"/);
  assert.match(app, /data-classic-play-overflow/);
  const finishUi = section('function syncFinishRoundUi', 'function renderScoreboard');
  assert.match(finishUi, /show\(scoringEarlyBtn, hasMatch && !isComplete && activeRound && !dataCompletion\?\.scoresComplete && \(!playerMode \|\| playerCompletionContext\)\)/);
  assert.match(html, /When every score is entered, use Complete Round in Round Progress\./);
});

test('Classic and Player remain adapters over one score, stat, GIR, net, and persistence contract', () => {
  const engine = loadLiveEngine();
  const match = {
    id: 'round-trip', playInputMode: 'CLASSIC', holeCount: 1,
    players: [{ playerId: 'p1', team: 1, scores: [{ holeNumber: 1, gross: 4 }], stats: [{ holeNumber: 1, putts: 2, puttsSource: 'user', green: true }] }],
  };
  const controller = engine.createPlayInputController(match, { tee: { holes: [{ holeNumber: 1, par: 4, strokeIndex: 1 }] }, scoringHoles: [{ holeNumber: 1, par: 4, strokeIndex: 1 }] });
  const before = JSON.stringify(match);
  assert.equal(controller.readGross('p1'), 4);
  assert.equal(controller.readStat('p1').putts, 2);
  match.playInputMode = 'PLAYER';
  assert.equal(controller.readGross('p1'), 4);
  assert.equal(controller.readStat('p1').green, true);
  match.playInputMode = 'CLASSIC';
  assert.equal(JSON.stringify({ ...match, playInputMode: 'CLASSIC' }), before);
  assert.doesNotMatch(app, /classicRoundSchema|classicScoreSchema|migrateClassicMode/);
});

test('Player Mode dedicated header and bottom markup remain intact', () => {
  const selector = section('function renderHoleSelector', 'function renderSneakySandyPoleyEntry');
  assert.match(selector, /player-mode-hole-title/);
  assert.match(selector, /player-mode-entry-counter/);
  assert.match(selector, /player-mode-overflow-menu/);
  assert.match(html, /id="playerModeBottomActions"[\s\S]*data-player-mode-previous[\s\S]*data-player-mode-save-next[\s\S]*data-player-mode-scoreboard/);
});
