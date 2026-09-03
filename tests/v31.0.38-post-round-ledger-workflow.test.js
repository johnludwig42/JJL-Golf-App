import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('completed-round progress distinguishes saved Story and finalized Ledger states', () => {
  const engine = loadLiveEngine();
  const base = { id: 'round-38', status: 'complete', storageMode: 'local' };
  const initial = engine.getPostRoundWorkflowState(base);
  assert.equal(initial.storyReviewed, false);
  assert.equal(initial.ledgerFinalized, false);
  const storySaved = engine.getPostRoundWorkflowState({ ...base, roundRecapFinal: 'Saved Story' });
  assert.equal(storySaved.storyReviewed, true);
  assert.equal(storySaved.ledgerFinalized, false);
  const finalized = engine.getPostRoundWorkflowState({
    ...base,
    roundRecapFinal: 'Saved Story',
    ledgerEntrySnapshot: {
      schemaVersion: 1,
      status: 'accepted',
      roundId: base.id,
      acceptedAt: '2026-09-03T10:00:00.000Z',
      story: 'Saved Story',
      report: { meta: { roundId: base.id, status: 'final', story: 'Saved Story' } },
    },
  });
  assert.equal(finalized.storyReviewed, true);
  assert.equal(finalized.ledgerFinalized, true);
});

test('every completed host Story save establishes a Ledger continuation', () => {
  assert.match(source, /const continueToLedger = match\.status === 'complete'/);
  assert.match(source, /if \(continueToLedger\) uiState\.pendingLedgerOpenMatchId = match\.id/);
  assert.match(source, /if \(openLedgerAfterSave\) uiState\.pendingLedgerOpenMatchId = match\.id/);
  assert.doesNotMatch(source, /openLedgerAfterSave && !getFinalRoundRecap/);
  assert.match(source, /pendingLedgerOpenMatchId[\s\S]*openUnifiedExport\(match, 'ledger'\)/);
});

test('Story review communicates the save-and-preview outcome and Finish Up exposes progress', () => {
  const engine = loadLiveEngine();
  const controls = engine.buildRoundRecapControls({ id: 'round-38', status: 'complete', storageMode: 'local', roundRecapGenerated: 'Draft Story' });
  assert.match(controls, />Save Story &amp; Preview Ledger<|>Save Story & Preview Ledger</);
  assert.match(html, /id="postRoundStepSaved"[\s\S]*Round saved/);
  assert.match(html, /id="postRoundStepStory"[\s\S]*Story review/);
  assert.match(html, /id="postRoundStepLedger"[\s\S]*Ledger finalization/);
});

test('joined Shared Match devices remain read-only and cannot author the Story continuation', () => {
  const engine = loadLiveEngine();
  const controls = engine.buildRoundRecapControls({ id: 'joined-38', status: 'complete', storageMode: 'shared', sharedHostDeviceId: 'another-device', roundRecapGenerated: 'Host draft' });
  assert.doesNotMatch(controls, /id="acceptRoundRecapBtn"/);
  assert.match(controls, /read-only on this device/);
});

for (let scenarioIndex = 0; scenarioIndex < 250; scenarioIndex += 1) {
  test(`post-round workflow scenario ${String(scenarioIndex + 1).padStart(3, '0')} preserves authority, Story, and Ledger state`, () => {
    const engine = loadLiveEngine();
    const shared = scenarioIndex % 3 !== 0;
    const joined = shared && scenarioIndex % 3 === 2;
    const shortened = scenarioIndex % 2 === 1;
    const storyState = scenarioIndex % 4;
    const roundId = `matrix-${scenarioIndex + 1}`;
    const match = {
      id: roundId,
      status: 'complete',
      storageMode: shared ? 'shared' : 'local',
      sharedHostDeviceId: joined ? `remote-host-${scenarioIndex}` : '',
      roundEndReason: shortened ? 'weather' : null,
      roundRecapGenerated: storyState >= 1 ? `Draft Story ${scenarioIndex}` : '',
      roundRecapFinal: storyState >= 2 ? `Saved Story ${scenarioIndex}` : '',
    };
    if (storyState === 3) {
      match.ledgerEntrySnapshot = {
        schemaVersion: 1,
        status: 'accepted',
        roundId,
        acceptedAt: '2026-09-03T10:00:00.000Z',
        story: match.roundRecapFinal,
        report: { meta: { roundId, status: 'final', story: match.roundRecapFinal } },
      };
    }

    const workflow = engine.getPostRoundWorkflowState(match);
    assert.equal(workflow.storyReviewed, storyState >= 2);
    assert.equal(workflow.ledgerFinalized, storyState === 3);
    assert.equal(workflow.ledgerReady, storyState >= 2);
    assert.equal(workflow.joinedWaiting, joined && storyState !== 3);
    assert.equal(workflow.storyDisabled, joined && storyState === 0);

    const controls = engine.buildRoundRecapControls(match);
    if (joined) {
      assert.doesNotMatch(controls, /id="acceptRoundRecapBtn"/);
      assert.doesNotMatch(controls, /id="editRoundRecapBtn"/);
    } else if (storyState >= 1) {
      assert.match(controls, /id="acceptRoundRecapBtn"/);
      assert.match(controls, /Save Story &amp; Preview Ledger|Save Story & Preview Ledger/);
    } else {
      assert.match(controls, /id="generateRoundRecapBtn"/);
    }
  });
}
