import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('complete and early-ending actions are explicit and mutually state driven', () => {
  assert.match(html, /id="finishRoundBtn"[^>]*>Complete Round<\/button>/);
  assert.match(html, /id="endRoundEarlyBtn"[^>]*>End Round Early<\/button>/);
  assert.match(html, /id="scoreboardFinishRoundBtn"[^>]*>Complete Round<\/button>/);
  assert.match(html, /id="scoreboardEndRoundEarlyBtn"[^>]*>End Round Early<\/button>/);
  assert.match(app, /show\(scoringFinishBtn, hasMatch && !isComplete && activeRound && dataCompletion\?\.scoresComplete\)/);
  assert.match(app, /show\(scoringEarlyBtn, hasMatch && !isComplete && activeRound && !dataCompletion\?\.scoresComplete\)/);
});

test('review sheet explains missing facts, provisional status, and routes to a hole', () => {
  assert.match(html, /id="roundEndReviewSummary"/);
  assert.match(app, /function buildRoundEndReviewHtml\(match, mode/);
  assert.match(app, /Missing scores/);
  assert.match(app, /Untouched entries will be excluded from summaries/);
  assert.match(app, /data-review-hole/);
  assert.match(css, /\.round-end-review-status\.provisional/);
  assert.doesNotMatch(app, /Statistics reviewed for this hole/);
});

test('review status remains provisional whenever required scoring or game facts are unresolved', () => {
  assert.match(app, /const provisional = !completion\.scoresComplete \|\| !allGamesFinal/);
  assert.doesNotMatch(app, /mode === 'early' && \(!completion\.scoresComplete \|\| !allGamesFinal\)/);
  assert.match(app, /Ready to save/);
});

test('review hole navigation maps selected course holes back to scoring positions', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
  const tee = { holes };
  assert.equal(engine.getReviewHolePosition({ holeCount: 9, nineHoleSegment: 'back' }, 10, tee), 1);
  assert.equal(engine.getReviewHolePosition({ holeCount: 9, nineHoleSegment: 'back' }, 18, tee), 9);
  assert.equal(engine.getReviewHolePosition({ holeCount: 9, nineHoleSegment: 'custom', customStartHole: 5 }, 7, tee), 3);
  assert.equal(engine.getReviewHolePosition({ holeCount: 18 }, 12, tee), 12);
});

test('Shared Match finalization is host-only and parity remains mandatory', () => {
  assert.match(app, /function getRoundFinalizationAuthority\(match\)/);
  assert.match(app, /if \(isCurrentDeviceMatchHost\(match\)\)/);
  assert.match(app, /Waiting for the host to complete the round/);
  assert.match(app, /reconcileSharedMatchBeforeSummary\(match/);
  assert.match(app, /if \(!parity\?\.parityConfirmed\)/);
});

test('finalization retains rollback recovery marker, frozen snapshot, and deterministic receipt', () => {
  const engine = loadLiveEngine();
  assert.match(app, /function createFinishRecoveryMarker\(candidate\)/);
  assert.match(app, /freezeRoundRecordIfEligible\(candidate, metrics\)/);
  assert.match(app, /recoveryMode: 'confirm-or-rollback'/);
  assert.match(app, /record\.finalizationReceipt = buildFinalizationReceipt\(match, record\)/);
  assert.match(app, /settlementFingerprint/);
  assert.match(app, /if \(match\.status === 'complete' && match\.completedAt\)/);
  const first = engine.settlementFingerprint({ payments: [{ amount: 5, payerId: 'a', payeeId: 'b' }], crossFoot: 0 });
  const reordered = engine.settlementFingerprint({ crossFoot: 0, payments: [{ payeeId: 'b', payerId: 'a', amount: 5 }] });
  assert.equal(first, reordered);
  assert.match(first, /^fnv1a32:[0-9a-f]{8}$/);
});

test('same-version service workers do not produce an update offer', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.shouldOfferServiceWorkerUpdate('31.0.10'), false);
  assert.equal(engine.shouldOfferServiceWorkerUpdate('v31.0.10'), false);
  assert.equal(engine.shouldOfferServiceWorkerUpdate('31.0.08'), true);
  assert.equal(engine.shouldOfferServiceWorkerUpdate(''), true);
});

test('completed-round destination exposes summary, ledger, return, and new-match paths', () => {
  assert.match(html, /id="postRoundViewSummaryBtn"/);
  assert.match(html, /id="postRoundLedgerBtn"[^>]*>Open Ledger Entry<\/button>/);
  assert.match(html, /id="postRoundReturnBtn"[^>]*>Return to Completed Round<\/button>/);
  assert.match(html, /id="postRoundNewMatchBtn"/);
  assert.match(app, /openUnifiedExport\(match, 'ledger'\)/);
});

test('release identity and immutable PWA assets are aligned', () => {
  assert.equal(pkg.version, '31.0.10');
  assert.equal(manifest.version, 'v31.0.10');
  assert.match(app, /version: 'v31\.0\.10'/);
  assert.match(worker, /cacheName: 'the-dye-ledger-v31\.0\.10'/);
  for (const name of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(existsSync(new URL(`../branding/${name}-v31.0.10.png`, import.meta.url)), true);
  }
});
