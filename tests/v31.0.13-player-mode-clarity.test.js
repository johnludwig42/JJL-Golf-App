import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('v31.0.13 release identity and immutable assets are complete', () => {
  assert.match(app, /version: 'v31\.0\.13'/);
  assert.match(html, /id="appVersionFooter">v31\.0\.13/);
  assert.equal(existsSync(new URL('../BUILD_NOTES_v31.0.13.md', import.meta.url)), true);
  for (const name of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(existsSync(new URL(`../branding/${name}-v31.0.13.png`, import.meta.url)), true);
  }
});

test('Player Mode presents one sticky hole and featured-match header', () => {
  const selector = app.slice(app.indexOf('function renderHoleSelector'), app.indexOf('function renderSneakySandyPoleyEntry'));
  assert.match(selector, /player-mode-hole-meta/);
  assert.match(selector, /player-mode-header-match-status/);
  assert.doesNotMatch(selector, /<small>\$\{Number\(metrics\?\.completed/);
  assert.match(selector, /player-mode-entry-counter/);
  assert.match(css, /\.player-mode-hole-header\{position:sticky/);
  assert.match(css, /\.player-mode-hole-header\{position:sticky;top:calc\(var\(--app-chrome-height, 0px\) \+ 8px\);z-index:1400/);
  assert.match(css, /body\.player-mode-play-active\{overflow-x:clip!important;overflow-y:visible!important\}/);
  const playerRenderer = app.slice(app.indexOf('function renderPlayerPlayInputMode'), app.indexOf('function renderHoleJumpTiles'));
  assert.match(playerRenderer, /playMatchSummary\.classList\.add\('hidden'\)/);
  const classicRenderer = app.slice(app.indexOf('function renderClassicPlayInputMode'), app.indexOf('function renderPlayerPlayInputMode'));
  assert.match(classicRenderer, /playMatchSummary\.classList\.remove\('hidden'\)/);
});

test('Player Mode removes duplicate header actions while keeping persistent bottom actions', () => {
  const selector = app.slice(app.indexOf('function renderHoleSelector'), app.indexOf('function renderSneakySandyPoleyEntry'));
  assert.doesNotMatch(selector, /data-player-mode-save-next/);
  assert.doesNotMatch(selector, /Open Scoreboard/);
  assert.match(html, /id="playerModeBottomActions"/);
  assert.match(html, /data-player-mode-save-next/);
  assert.match(html, /data-player-mode-scoreboard/);
});

test('Player Mode entry progress and initial expansion use the existing completion contract', () => {
  const helpers = app.slice(app.indexOf('function getPlayerModeEntryProgress'), app.indexOf('function getPlayerModeSavePresentation'));
  assert.match(helpers, /getVisibleScoringPlayers/);
  assert.match(helpers, /getPlayerModeEntryStatus/);
  assert.match(helpers, /canEditPlayerScore/);
  assert.match(helpers, /!row\.status\.complete/);
  assert.match(helpers, /'__COLLAPSED__'/);
  assert.match(helpers, /match\?\.id/);
});

test('saved messaging distinguishes local persistence from Shared Match synchronization', () => {
  const presentation = app.slice(app.indexOf('function getPlayerModeSavePresentation'), app.indexOf('function renderPlayerModeScoreGrid'));
  assert.match(presentation, /getSharedSyncStatus\(match\)/);
  assert.match(presentation, /Saved on device · Syncing…/);
  assert.match(presentation, /This device synced ✓/);
  assert.match(presentation, /Sync needs attention/);
  assert.match(presentation, /Saved on device · Offline/);
  assert.match(presentation, /localPersistenceDiagnostics/);
  assert.match(presentation, /Saved ✓/);
});

test('round-ending actions are contextual without changing completion logic', () => {
  const selector = app.slice(app.indexOf('function renderHoleSelector'), app.indexOf('function renderSneakySandyPoleyEntry'));
  assert.match(selector, /!completionContext \? '<button[^']+data-player-mode-end-early/);
  assert.match(app, /\[data-player-mode-end-early\]/);
  assert.match(app, /handleScoreboardFinishEndRound\('early'\)/);
  const finishUi = app.slice(app.indexOf('function syncFinishRoundUi'), app.indexOf('function renderScoreboard'));
  assert.match(finishUi, /playerCompletionContext/);
  assert.match(finishUi, /\(!playerMode \|\| playerCompletionContext\)/);
});
