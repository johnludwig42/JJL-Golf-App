import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function players(count) {
  return Array.from({ length: count }, (_, index) => ({ playerId: `p${index + 1}`, team: index % 2 + 1 }));
}

function trackedMatch(count, overrides = {}) {
  const matchPlayers = players(count);
  return {
    id: `match-${count}`,
    status: 'active',
    storageMode: 'local',
    scoringAccessMode: 'single_device',
    statTrackingEnabled: true,
    statTrackingMode: 'GRIND',
    statTrackingPlayerIds: matchPlayers.map(player => player.playerId),
    players: matchPlayers,
    ...overrides,
  };
}

test('Player Mode exposes Add Memory and deletion is limited to editable local rounds', () => {
  const engine = loadLiveEngine();
  const memory = { memoryId: 'memory-1', text: 'Great approach' };
  assert.equal(engine.canDeleteRoundMemory({ status: 'active', storageMode: 'local' }, memory), true);
  assert.equal(engine.canDeleteRoundMemory({ status: 'active', storageMode: 'shared' }, memory), false);
  assert.equal(engine.canDeleteRoundMemory({ status: 'completed', storageMode: 'local' }, memory), false);
  assert.deepEqual(structuredClone(engine.removeRoundMemoryById([memory, { memoryId: 'memory-2' }], 'memory-1')), [{ memoryId: 'memory-2' }]);
  assert.match(app, /data-player-mode-add-memory>Add Memory/);
  assert.match(html, /id="deleteMemoryBtn"/);
  assert.match(app, /Confirm Delete/);
  assert.match(app, /match\.memories = priorMemories/);
});

test('Grind permits one through four editable golfers and falls back at five', () => {
  const engine = loadLiveEngine();
  for (let count = 1; count <= 4; count += 1) {
    const match = trackedMatch(count);
    const mode = engine.getEffectivePlayerStatTrackingMode(match, { players: players(count) });
    assert.equal(mode.active, 'GRIND');
    assert.equal(mode.editableCount, count);
  }
  const five = trackedMatch(5);
  const mode = engine.getEffectivePlayerStatTrackingMode(five, { players: players(5) });
  assert.equal(mode.active, 'ENHANCED');
  assert.equal(mode.grindRestricted, true);
  assert.equal(mode.maxEditablePlayers, 4);
});

test('Shared assigned-player Grind uses device workload even when the host views the field', () => {
  const engine = loadLiveEngine();
  for (const count of [8, 12]) {
    const match = trackedMatch(count, {
      storageMode: 'shared',
      scoringAccessMode: 'assigned_players',
      sharedParticipants: [],
      sharedPlayerAssignments: {},
      sharedShowOtherStats: true,
    });
    engine.getEffectivePlayerStatTrackingMode(match, { players: players(count) });
    const hostParticipantId = match.sharedParticipants[0]?.participantId;
    assert.ok(hostParticipantId);
    match.sharedPlayerAssignments = Object.fromEntries(match.players.map((player, index) => [player.playerId, index < 4 ? hostParticipantId : `participant-${Math.floor(index / 4) + 1}`]));
    const mode = engine.getEffectivePlayerStatTrackingMode(match, { players: players(count) });
    assert.equal(mode.active, 'GRIND');
    assert.equal(mode.editableCount, 4);
  }
});

test('Open-edit shared scoring counts the full editable field and protects viewers', () => {
  const engine = loadLiveEngine();
  const openEdit = trackedMatch(8, { storageMode: 'shared', scoringAccessMode: 'open_edit', activeScoreRole: 'official_scorer' });
  assert.equal(engine.getEffectivePlayerStatTrackingMode(openEdit, { players: players(8) }).active, 'ENHANCED');
  const viewer = trackedMatch(8, { storageMode: 'shared', scoringAccessMode: 'open_edit', activeScoreRole: 'viewer' });
  const viewerMode = engine.getEffectivePlayerStatTrackingMode(viewer, { players: players(8) });
  assert.equal(viewerMode.editableCount, 0);
  assert.equal(viewerMode.grindRestricted, false);
});
