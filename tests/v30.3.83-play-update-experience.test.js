import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('Play is current-hole-first and moves compact Round Progress below Add Memory', () => {
  const scorePanel = html.match(/<section id="score"[\s\S]*?<section id="leaderboard"/)?.[0] || '';
  assert.doesNotMatch(scorePanel, /<h2[^>]*>Scoring input/);
  assert.ok(scorePanel.indexOf('id="activeHoleScoringTop"') < scorePanel.indexOf('class="score-section-head'));
  assert.ok(scorePanel.indexOf('id="memoryQuickCaptureWrap"') < scorePanel.indexOf('id="playRoundProgress"'));
  assert.match(scorePanel, /id="currentMatchProgress"/);
  assert.match(scorePanel, /<summary>Round details<\/summary>/);
  assert.match(app, /currentMatchProgress/);
  assert.match(app, /of \$\{holeCount\} complete/);
  assert.match(app, /compactElapsedAvailable[\s\S]*12 \* 60 \* 60 \* 1000/);
  assert.match(css, /\.play-round-progress-summary/);
});

test('Quick Scoreboard and authoritative Play scoring controls remain intact', () => {
  for (const id of ['quickScoreboardBtn', 'quickScoreboardDialog', 'quickScoreboardBody', 'saveScoresBtn', 'scoreGridBody', 'addMemoryBtn']) {
    assert.match(`${html}\n${app}`, new RegExp(id));
  }
  assert.match(html, /id="quickScoreboardBtn"[^>]*>Scoreboard<\/button>/);
  assert.match(app, /openQuickScoreboardView/);
  assert.match(app, /buildQuickScoreboardView/);
  assert.match(css, /\.quick-scoreboard-momentum \.momentum-axis-tick\{font-size:12px!important;font-weight:850\}/);
  assert.match(css, /\.quick-scoreboard-momentum \.momentum-point-value\{font-size:12px;font-weight:900/);
});

test('fairway-conditioned GIR is derived from eligible tracked holes and preserved additively', () => {
  assert.match(app, /fairwayHitOpportunities/);
  assert.match(app, /fairwayMissedOpportunities/);
  assert.match(app, /par === 4 \|\| par === 5/);
  assert.match(app, /fairwayHitOpportunities >= 2 && totals\.fairwayMissedOpportunities >= 2/);
  assert.match(app, /— · limited sample/);
  assert.match(app, /buildApproachPerformanceStats\(match, metrics, \{ playerId: playerMetric\.playerId \}\)/);
  assert.match(app, /approachPerformance:/);
  assert.match(css, /\.approach-performance-table/);
  assert.match(app, /Unavailable for this round\. Enable Stat Tracking/);
});

test('updates are blocked by actual unfinished work rather than an active round or Play itself', () => {
  const safety = app.match(/function getUnsafeReloadReason\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(safety, /hasUnsavedVisibleScoreInputs/);
  assert.match(safety, /hasOpenBlockingUi/);
  assert.match(safety, /scorecardImportLoading/);
  assert.doesNotMatch(safety, /activePanel === 'score'/);
  assert.doesNotMatch(safety, /activeMatch\.status !== 'complete'/);
  assert.match(app, /function persistBeforeAppUpdate\(\)/);
  assert.match(app, /!persistBeforeAppUpdate\(\)/);
  assert.match(app, /The latest local save did not complete/);
});

test('update lifecycle identifies versions and confirms successful installation', () => {
  for (const copy of ['Checking for updates', 'Install Update', 'Installing v', 'Updated successfully to', 'App is up to date', 'Update paused']) {
    assert.match(`${html}\n${app}`, new RegExp(copy));
  }
  assert.match(app, /APP_UPDATE_CONFIRMATION_KEY/);
  assert.match(app, /getServiceWorkerVersion/);
  assert.match(app, /waitForWaitingServiceWorker/);
  assert.match(app, /function isServiceWorkerContextSupported\(\)/);
  assert.match(app, /Open the app from its local or deployed web address to install updates/);
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '', /skipWaiting/);
});

test('v30.3.83 metadata and immutable PWA assets are consistent', () => {
  assert.equal(pkg.version, '30.3.83');
  assert.equal(manifest.version, 'v30.3.83');
  assert.match(app, /version: 'v30\.3\.83'/);
  assert.match(worker, /cacheName: 'the-dye-ledger-v30\.3\.83'/);
  for (const name of ['app-icon-192-v30.3.83.png', 'app-icon-512-v30.3.83.png', 'apple-touch-icon-v30.3.83.png', 'favicon-32-v30.3.83.png', 'favicon-16-v30.3.83.png']) {
    assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true, name);
    assert.match(worker, new RegExp(name.replaceAll('.', '\\.')));
  }
  assert.deepEqual(manifest.icons.map(icon => icon.src), [
    './branding/app-icon-192-v30.3.83.png',
    './branding/app-icon-512-v30.3.83.png',
    './branding/apple-touch-icon-v30.3.83.png',
  ]);
  assert.match(html, /apple-touch-icon-v30\.3\.83\.png/);
  assert.match(html, /favicon-32-v30\.3\.83\.png/);
});
