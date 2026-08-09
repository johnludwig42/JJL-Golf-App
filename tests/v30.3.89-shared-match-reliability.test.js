import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  compareScoredLedgers,
  extractLocalScoredLedger,
  extractRemoteScoredLedger,
  mergeRemoteLedgerIntoLocalMatch,
} from '../scripts/shared-match-ledger.js';

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const worker = fs.readFileSync('service-worker.js', 'utf8');

test('Round Progress exposes an explicit Sync Now action and no mojibake disclosure glyph', () => {
  assert.match(html, /id="sharedRoundSyncNowBtn"[^>]*data-retry-shared-sync="1"[^>]*>Sync Now</);
  assert.match(app, /class="shared-sync-disclosure"/);
  assert.doesNotMatch(app, /ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¾/);
  assert.match(css, /\.shared-sync-disclosure\{/);
});

test('manual sync reports confirmed parity or the exact pending entry count', () => {
  assert.match(app, /All shared scores are confirmed\./);
  assert.match(app, /score entr\$\{pendingEntries === 1 \? 'y is' : 'ies are'\} still awaiting confirmation/);
  assert.match(app, /function getSharedPendingEntryCount/);
});

test('Shared Match completion reconciles before publishing a completed local record', () => {
  const handler = app.slice(app.indexOf('async function handleRoundEndPrimary'), app.indexOf('function handleRoundEndSecondary'));
  assert.match(handler, /await flushSharedMatchSync/);
  assert.match(handler, /await reconcileSharedMatchBeforeSummary/);
  assert.ok(handler.indexOf('parityConfirmed') < handler.indexOf('completeActiveRound()'));
});

test('a delayed older-hole score from another device converges without losing later scores', () => {
  const host = {
    players: [
      { playerId: 'host-player', playerName: 'Host', scores: Array.from({ length: 4 }, (_, i) => ({ holeNumber: i + 1, gross: 4 })) },
      { playerId: 'remote-player', playerName: 'Remote', scores: [
        { holeNumber: 1, gross: 5 }, { holeNumber: 2, gross: 5 }, { holeNumber: 3, gross: null }, { holeNumber: 4, gross: 5 },
      ] },
    ],
  };
  const remoteRows = [
    ...host.players[0].scores.map(row => ({ player_id: 'host-player', hole_number: row.holeNumber, gross: row.gross })),
    1, 2, 3, 4,
  ].flatMap(row => typeof row === 'number'
    ? [{ player_id: 'remote-player', hole_number: row, gross: row === 3 ? 4 : 5, participant_id: 'joined-device' }]
    : [row]);
  const remote = extractRemoteScoredLedger(host, remoteRows);
  const merged = mergeRemoteLedgerIntoLocalMatch(host, remote);
  assert.equal(merged.changed, true);
  assert.equal(host.players[1].scores[2].gross, 4);
  assert.equal(host.players[1].scores[3].gross, 5);
  assert.equal(compareScoredLedgers(extractLocalScoredLedger(host), remote).parityConfirmed, true);
});

test('settlement layout reserves the money column and permits long names to wrap', () => {
  assert.match(css, /\.final-net-settlement-row\{[\s\S]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /\.final-net-settlement-player\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.settle-up-route\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.settle-up-amount\{[^}]*white-space:nowrap/);
});

test('Greenies shows every player net position and turning-point titles use plain language', () => {
  assert.match(app, /cfg\.key === 'greenies'[\s\S]*Final'} net position/);
  assert.match(app, /Turning Point: Hole/);
  assert.doesNotMatch(app, /The \$\{Number\(turningPoint\.magnitude\)\}-Point/);
});

test('golfer profiles separate full name from optional nickname without identity merging', () => {
  assert.match(html, /name="formalName"/);
  assert.match(html, /name="nickname"/);
  assert.match(app, /p\.name = p\.nickname \|\| p\.formalName/);
  assert.doesNotMatch(app, /find\([^\n]*(?:formalName|nickname)[^\n]*===/);
});

test('PDF preflight moves whole fitting sections to a fresh page', () => {
  assert.match(app, /function paginateWholeSections\(\)/);
  assert.match(app, /export-auto-page-before/);
  assert.match(app, /paginateWholeSections\(\)/);
});

test('release metadata includes a real non-midnight build timestamp', () => {
  assert.match(app, /version: 'v30\.3\.99'/);
  assert.match(worker, /version: 'v30\.3\.99'/);
  assert.match(app, /buildDate: '2026-08-09T12:18:24\.564Z'/);
  assert.doesNotMatch(app, /buildDate: '2026-08-05T04:00:00\.000Z'/);
});
