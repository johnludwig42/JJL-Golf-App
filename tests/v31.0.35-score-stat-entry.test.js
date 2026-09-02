import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const contract = fs.readFileSync(new URL('../docs/architecture/PLAYER_MODE_CONTRACT_v31.0.07.md', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

test('release identity and immutable branding assets are aligned', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('active-mode resolvers return nodes from only the active entry container', () => {
  const source = section('function getActivePlayEntryContainer', 'function getPlayerModeSelectedPlayer');
  const classicInput = { id: 'visible-classic' };
  const stalePlayerInput = { id: 'stale-player' };
  const classicStat = { id: 'visible-classic-stat' };
  const roots = {
    scoreEntryWrap: { dataset: { playInputMode: 'CLASSIC' } },
    classicScoreGridWrap: { querySelector: () => classicInput },
    statTrackingEntryWrap: { querySelector: () => classicStat },
    playerModeScoreList: { querySelector: () => stalePlayerInput },
  };
  const document = { getElementById: id => roots[id] || null };
  const { findScore, findStat } = Function('document', 'PLAY_INPUT_MODES', 'cssEscape', `${source}; return { findScore: findActiveScoreInput, findStat: findActiveStatInput };`)(document, { PLAYER: { key: 'PLAYER' } }, String);
  assert.equal(findScore('p1'), classicInput);
  assert.equal(findStat('p1', 'putts'), classicStat);
  roots.scoreEntryWrap.dataset.playInputMode = 'PLAYER';
  assert.equal(findScore('p1'), stalePlayerInput);
});

test('mode rendering clears inactive markup after the shared model save path', () => {
  const classic = section('function renderClassicPlayInputMode', 'function getEffectivePlayerStatTrackingMode');
  const player = section('function renderPlayerPlayInputMode', 'function renderPlayInputMode(context)');
  assert.match(classic, /playerModeList\.innerHTML = ''/);
  assert.match(player, /classicBody\.innerHTML = ''/);
  const switching = section('async function switchPlayInputMode', 'function renderCurrentMatch');
  assert.match(switching, /persistCurrentMatch\(\{ applyDom: true, silent: true \}\)[\s\S]*match\.playInputMode = normalized[\s\S]*renderCurrentMatch\(\)/);
});

test('interactive score and stat writers use active-container lookup helpers', () => {
  const handlers = section('function installHandlers', 'function getActivePanelId');
  assert.match(handlers, /const input = findActiveScoreInput\(playerId\)/);
  assert.match(handlers, /const input = findActiveStatInput\(playerId, key\)/);
  assert.doesNotMatch(handlers, /document\.querySelector\(`input\[data-score-player=/);
  assert.doesNotMatch(handlers, /document\.querySelector\(`\[data-stat-player=/);
});

test('Classic putts starts unconfirmed and uses one existing stat commit input', () => {
  const stats = section('function renderStatTrackingEntry', 'function renderGreeniesEntry');
  assert.match(stats, /<option value="" \$\{!confirmed \? 'selected' : ''\}>Putts<\/option>/);
  assert.match(stats, /\[0,1,2,3,4,5\]/);
  assert.match(stats, /<option value="MORE"/);
  assert.match(stats, /class="score-input stat-putts-input classic-putts-more/);
  const handlers = section("document.getElementById('score').addEventListener('change'", "document.getElementById('score').addEventListener('input'");
  assert.match(handlers, /data-classic-putts-choice/);
  assert.match(handlers, /input\.dataset\.puttsSource = 'user'/);
  assert.match(handlers, /commitSmartPuttsDomValue\(input, 'user'\)/);
});

test('GIR unknown remains explicit and derivation invariants are unchanged', () => {
  const engine = loadLiveEngine();
  assert.deepEqual(structuredClone(engine.deriveGreenInRegulation({ gross: 4, putts: 2, par: 4, puttsSource: 'default' })), { value: null, source: 'unknown' });
  assert.deepEqual(structuredClone(engine.deriveGreenInRegulation({ gross: 4, putts: 2, par: 4, puttsSource: 'user' })), { value: true, source: 'calculated' });
  const stats = section('function renderStatTrackingEntry', 'function renderGreeniesEntry');
  assert.match(stats, /Enter score \+ putts/);
});

test('Classic and Player controls follow the authoritative stat-mode field sets', () => {
  const classic = section('function renderStatTrackingEntry', 'function renderGreeniesEntry');
  const player = section('function renderPlayerModeStatEntry', 'function renderPlayerPlayInputMode');
  assert.match(classic, /advanced \? \[\{ key: 'approachResult'[\s\S]*\{ key: 'recoveryLie'/);
  assert.match(classic, /grind \? \[\{ key: 'bunkerInvolved'/);
  assert.match(player, /\$\{advanced \? `<div class="player-mode-stat-section"><span class="player-mode-stat-label">Approach/);
  assert.match(player, /\$\{grind \? `<div class="player-mode-stat-section"><span class="player-mode-stat-label">Bunker involvement/);
});

test('bunker reconciliation is order-independent across Enhanced and Grind controls', () => {
  const engine = loadLiveEngine();
  const enhancedBunker = { recoveryLie: 'BUNKER', bunkerInvolved: false };
  assert.equal(engine.reconcileBunkerInvolvement(enhancedBunker, { recoveryLieEncountered: true }), true);
  enhancedBunker.recoveryLie = 'ROUGH';
  assert.equal(engine.reconcileBunkerInvolvement(enhancedBunker, { recoveryLieEncountered: true }), false, 'Enhanced correction clears stale involvement');

  const reloadedEnhanced = structuredClone({ recoveryLie: 'BUNKER', bunkerInvolved: true });
  reloadedEnhanced.recoveryLie = 'ROUGH';
  assert.equal(engine.reconcileBunkerInvolvement(reloadedEnhanced, { recoveryLieEncountered: true }), false, 'stored involvement is reconciled after reload');

  const grindRough = { recoveryLie: 'ROUGH', bunkerInvolved: false };
  assert.equal(engine.reconcileBunkerInvolvement(grindRough, { controlEncountered: true, controlValue: true, recoveryLieEncountered: true }), true);
  const grindBunker = { recoveryLie: 'BUNKER', bunkerInvolved: true };
  assert.equal(engine.reconcileBunkerInvolvement(grindBunker, { controlEncountered: true, controlValue: false, recoveryLieEncountered: true }), true);
  const grindClear = { recoveryLie: 'ROUGH', bunkerInvolved: true };
  assert.equal(engine.reconcileBunkerInvolvement(grindClear, { controlEncountered: true, controlValue: false, recoveryLieEncountered: true }), false);

  const hiddenInCasual = { recoveryLie: 'ROUGH', bunkerInvolved: true };
  assert.equal(engine.reconcileBunkerInvolvement(hiddenInCasual), true, 'hiding both controls never clears a recorded fact');
  assert.equal(engine.reconcileBunkerInvolvement(hiddenInCasual, { recoveryLieEncountered: true }), false, 'an Enhanced recovery correction clears it');

  const apply = section('function applyCurrentHoleDomToMatch', 'function getSharedMatchLastFullSyncAt');
  assert.match(apply, /bunkerControlValues = new Map\(\)/);
  assert.match(apply, /recoveryLiePlayers = new Set\(\)/);
  assert.match(apply, /reconcileBunkerInvolvement\(stat,/);
  assert.doesNotMatch(apply, /key === 'recoveryLie'[\s\S]{0,500}currentStat\.bunkerInvolved/);
  assert.match(app, /sandyOpportunity = String\(recoveryLie \|\| ''\)\.toUpperCase\(\) === 'BUNKER'/);
  assert.match(app, /recoveryLie:[\s\S]*stat\?\.bunkerInvolved \? 'BUNKER' : 'UNKNOWN'/);
});

test('non-Grind reporting inputs remain identical because recovery lie stays authoritative', () => {
  const engine = loadLiveEngine();
  const input = { gross: 4, par: 4, green: false, greenSource: 'calculated', recoveryLie: 'ROUGH' };
  const before = structuredClone(engine.deriveScramblingResult(input));
  const stat = { recoveryLie: 'ROUGH', bunkerInvolved: true };
  engine.reconcileBunkerInvolvement(stat, { recoveryLieEncountered: true });
  const after = structuredClone(engine.deriveScramblingResult({ ...input, recoveryLie: stat.recoveryLie }));
  assert.deepEqual(after, before);
  assert.equal(stat.recoveryLie, 'ROUGH');
  assert.equal(after.sandyOpportunity, false);
});

test('header alignment retains shared builders and keeps the Player-only counter', () => {
  const selector = section('function renderHoleSelector', 'function renderSneakySandyPoleyEntry');
  assert.equal((selector.match(/buildPlayHoleMetaText\(hole\)/g) || []).length, 2);
  assert.equal((selector.match(/buildPlaySaveState\(match\)/g) || []).length, 2);
  assert.equal((selector.match(/player-mode-entry-counter/g) || []).length, 1);
  assert.match(css, /\.player-mode-header-actions\{[^}]*align-self:end/);
});

test('contract documents four-golfer Grind and contains no obsolete two-golfer assertion', () => {
  assert.match(contract, /no more than four editable golfers/);
  assert.doesNotMatch(contract, /no more than two golfers/);
  assert.match(app, /const MAX_GRIND_EDITABLE_PLAYERS = 4/);
});
