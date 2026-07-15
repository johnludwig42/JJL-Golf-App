import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const players = Array.from({ length: 48 }, (_, index) => ({
  id: `p-${index}`,
  name: index < 2 ? 'Jordan Lee' : index % 9 === 0 ? `Extremely Long Player Name ${index} With Suffix` : `Player ${index}`,
  index: index - 12,
}));
const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: [4, 4, 3, 5][index % 4], strokeIndex: index + 1 }));
const course = {
  id: 'course', name: 'Order Independence Club',
  tees: [
    { id: 'blue', teeName: 'Blue', rating: 72, slope: 125, par: 72, holes },
    { id: 'white', teeName: 'White', rating: 69, slope: 118, par: 72, holes },
  ],
};

function fixture() {
  const engine = loadLiveEngine();
  engine.seedState({ players, courses: [course], matches: [] });
  return engine;
}

function assertSame(actual, expected, message = '') {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

function validate(engine, rows, teamCount, playersPerTeam, sharedMatchEnabled = false) {
  return engine.getMatchSetupValidationState({ draft: {
    active: null,
    teamCount,
    playersPerTeam,
    requiredSlotCount: teamCount * playersPerTeam,
    courseId: course.id,
    course,
    players: rows,
    games: [],
    holeCount: 18,
    courseHolesLoaded: true,
    scoringAccessMode: sharedMatchEnabled ? 'assigned_players' : 'single_device',
    sharedMatchEnabled,
  } });
}

function assign(engine, draft, slot, playerId, playersPerTeam) {
  return engine.updatePlayerDraftSlot(draft, slot, playerId, { playersPerTeam, validTeeIds: ['blue', 'white'] });
}

function setTee(engine, draft, slot, teeId, teamCount, playersPerTeam) {
  return engine.reconcilePlayerDraftSlots(draft, {
    teamCount, playersPerTeam, incomingRows: [{ slot, teeId }], validTeeIds: ['blue', 'white'],
  });
}

test('Sequences A-C allow player-first and mixed setup while identifying only the affected tee slot', () => {
  const engine = fixture();
  for (const sequence of ['A', 'B']) {
    let draft = engine.reconcilePlayerDraftSlots([], { teamCount: 2, playersPerTeam: 2 });
    for (let slot = 0; slot < 4; slot += 1) draft = assign(engine, draft, slot, `p-${slot}`, 2);
    const playersFirst = validate(engine, draft, 2, 2);
    assert.equal(playersFirst.ready, false, `${sequence}: players without tees must remain editable but blocked`);
    assertSame(playersFirst.summary.invalidTeeSlots, [0, 1, 2, 3]);
    for (let slot = 0; slot < 4; slot += 1) draft = setTee(engine, draft, slot, slot % 2 ? 'white' : 'blue', 2, 2);
    assert.equal(validate(engine, draft, 2, 2).ready, true, `${sequence}: completing tees must satisfy Start Round`);
  }

  let mixed = engine.reconcilePlayerDraftSlots([], { teamCount: 2, playersPerTeam: 2 });
  mixed = assign(engine, mixed, 0, 'p-0', 2);
  mixed = setTee(engine, mixed, 0, 'blue', 2, 2);
  mixed = assign(engine, mixed, 1, 'p-1', 2);
  mixed = assign(engine, mixed, 2, 'p-2', 2);
  mixed = setTee(engine, mixed, 2, 'white', 2, 2);
  mixed = assign(engine, mixed, 3, 'p-3', 2);
  mixed = setTee(engine, mixed, 3, 'blue', 2, 2);
  const state = validate(engine, mixed, 2, 2);
  assert.equal(state.ready, false);
  assertSame(state.summary.invalidTeeSlots, [1]);
  assertSame(state.summary.unassignedSlots, []);
  assert.equal(state.summary.playerSlotStates[1].label, 'Team 1 Player 2');
  assert.equal(state.summary.playerSlotStates.filter(slot => !slot.complete).length, 1);
});

test('Sequences D-E preserve valid replacement tees, clear invalid tees, and retain surviving slots through team changes', () => {
  const engine = fixture();
  let draft = engine.reconcilePlayerDraftSlots([], { teamCount: 3, playersPerTeam: 1 });
  draft = setTee(engine, draft, 0, 'blue', 3, 1);
  draft = assign(engine, draft, 0, 'p-0', 1);
  draft = assign(engine, draft, 1, 'p-1', 1);
  draft = assign(engine, draft, 2, 'p-2', 1);
  const beforeReplace = structuredClone(draft);
  draft = assign(engine, draft, 0, 'p-3', 1);
  assert.equal(draft[0].teeId, 'blue');
  assertSame(draft.slice(1), beforeReplace.slice(1));

  draft[0] = { ...draft[0], teeId: 'deleted-tee' };
  draft = assign(engine, draft, 0, 'p-4', 1);
  assert.equal(draft[0].teeId, '');
  assert.equal(draft[1].playerId, 'p-1');

  draft = setTee(engine, draft, 0, 'white', 3, 1);
  const shrunk = engine.reconcilePlayerDraftSlots(draft, { teamCount: 2, playersPerTeam: 1, validTeeIds: ['blue', 'white'] });
  assertSame(shrunk.map(row => [row.playerId, row.teeId]), draft.slice(0, 2).map(row => [row.playerId, row.teeId]));
  const expanded = engine.reconcilePlayerDraftSlots(shrunk, { teamCount: 4, playersPerTeam: 1, validTeeIds: ['blue', 'white'] });
  assertSame(expanded.slice(0, 2).map(row => [row.playerId, row.teeId]), shrunk.map(row => [row.playerId, row.teeId]));
  assert.equal(expanded[2].playerId, '');
  assert.equal(expanded[3].teeId, '');
});

test('Sequence F and reload preserve incomplete player-first and tee-first drafts without weakening host readiness', () => {
  const engine = fixture();
  const map = new Map();
  const storage = { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const partial = {
    id: 'draft', date: '2026-07-15', courseId: 'course', teeId: 'blue', teamCount: 2, playersPerTeam: 1,
    players: [{ slot: 0, team: 1, playerId: 'p-0', teeId: '' }, { slot: 1, team: 2, playerId: '', teeId: 'white' }],
    selectedGames: [], storageMode: 'shared', scoringAccessMode: 'assigned_players',
  };
  assert.equal(engine.saveSetupDraft(partial, storage).ok, true);
  const recovered = engine.loadSetupDraft(storage);
  assertSame(recovered.players.map(row => [row.slot, row.playerId, row.teeId]), [[0, 'p-0', ''], [1, '', 'white']]);
  const toggled = engine.setSharedMatchDraftMode(engine.setSharedMatchDraftMode(recovered, false), true);
  assertSame(toggled.players, recovered.players);

  let rows = engine.reconcilePlayerDraftSlots(recovered.players, { teamCount: 2, playersPerTeam: 1, validTeeIds: ['blue', 'white'] });
  let hostState = validate(engine, rows, 2, 1, true);
  assert.equal(hostState.ready, false);
  assertSame(hostState.summary.unassignedSlots, [1]);
  assertSame(hostState.summary.invalidTeeSlots, [0]);
  rows = setTee(engine, rows, 0, 'blue', 2, 1);
  rows = assign(engine, rows, 1, 'p-1', 1);
  hostState = validate(engine, rows, 2, 1, true);
  assert.equal(hostState.ready, true);
  assert.equal(hostState.summary.sharedMatch, true);
});

test('combobox and tee controls remain independently labelled, keyboard-operable, and free of forced tee focus', () => {
  assert.match(appSource, /<label class="lookup-field" for="\$\{inputId\}"><span class="tiny">\$\{escapeHtml\(slotLabel\)\}<\/span><\/label>/);
  assert.match(appSource, /\$\{escapeHtml\(slotLabel\)\} handicap tee/);
  assert.match(appSource, /role="combobox"[^>]+aria-autocomplete="list"[^>]+aria-controls="\$\{listId\}"/);
  assert.match(appSource, /event\.key === 'Escape'/);
  assert.match(appSource, /input\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(appSource, /scheduleAdvanceToNextIncompletePlayerSetupSlot|focusPlayerSetupSlot/);
  assert.match(appSource, /Assign players and tees in any order; every player needs a tee before the round can start\./);
  const staticIds = [...htmlSource.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(staticIds).size, staticIds.length);
});

test('180 varied setup sequences preserve slot isolation, tee ownership, readiness, reload, and handicap invariants', () => {
  const engine = fixture();
  for (let iteration = 0; iteration < 180; iteration += 1) {
    const teamCount = 1 + (iteration % 4);
    const playersPerTeam = 1 + (Math.floor(iteration / 4) % 3);
    const slotCount = teamCount * playersPerTeam;
    let draft = engine.reconcilePlayerDraftSlots([], { teamCount, playersPerTeam });
    const order = Array.from({ length: slotCount }, (_, index) => (index + iteration) % slotCount);
    const teeFirst = iteration % 3 === 1;

    for (const slot of order) {
      if (teeFirst || (iteration + slot) % 4 === 0) draft = setTee(engine, draft, slot, slot % 2 ? 'white' : 'blue', teamCount, playersPerTeam);
      const before = structuredClone(draft);
      const playerId = `p-${(iteration + slot) % 36}`;
      draft = assign(engine, draft, slot, playerId, playersPerTeam);
      assert.equal(draft[slot].playerId, playerId);
      assert.equal(draft[slot].teeId, before[slot].teeId);
      draft.forEach((row, index) => { if (index !== slot) assertSame(row, before[index]); });
      if (!draft[slot].teeId && (iteration + slot) % 2 === 0) draft = setTee(engine, draft, slot, 'blue', teamCount, playersPerTeam);
    }

    if (slotCount > 1) {
      const duplicate = engine.updatePlayerDraftSlot(draft, 0, draft[1].playerId, { playersPerTeam, validTeeIds: ['blue', 'white'] });
      assertSame(duplicate, draft);
    }

    const replacementSlot = iteration % slotCount;
    const replacementTee = draft[replacementSlot].teeId;
    const replacementId = `p-${36 + (iteration % 12)}`;
    draft = assign(engine, draft, replacementSlot, replacementId, playersPerTeam);
    assert.equal(draft[replacementSlot].teeId, replacementTee);
    const cleared = assign(engine, draft, replacementSlot, '', playersPerTeam);
    assert.equal(cleared[replacementSlot].teeId, replacementTee);
    draft = assign(engine, cleared, replacementSlot, replacementId, playersPerTeam);

    for (let slot = 0; slot < slotCount; slot += 1) if (!draft[slot].teeId) draft = setTee(engine, draft, slot, slot % 2 ? 'white' : 'blue', teamCount, playersPerTeam);
    const incompleteSlot = (replacementSlot + 1) % slotCount;
    draft = setTee(engine, draft, incompleteSlot, '', teamCount, playersPerTeam);
    const incomplete = validate(engine, draft, teamCount, playersPerTeam, iteration % 5 === 0);
    assert.equal(incomplete.ready, false);
    assertSame(incomplete.summary.invalidTeeSlots, [incompleteSlot]);

    draft = setTee(engine, draft, incompleteSlot, incompleteSlot % 2 ? 'white' : 'blue', teamCount, playersPerTeam);
    const ready = validate(engine, draft, teamCount, playersPerTeam, iteration % 5 === 0);
    assert.equal(ready.ready, true, `iteration ${iteration}`);
    assert.equal(new Set(draft.map(row => row.playerId)).size, slotCount);
    draft.forEach(row => {
      assert.ok(['blue', 'white'].includes(row.teeId));
      const player = players.find(candidate => candidate.id === row.playerId);
      const tee = course.tees.find(candidate => candidate.id === row.teeId);
      const courseValue = engine.courseHandicap(player.index, tee.slope, tee.rating, tee.par);
      assert.equal(Number.isFinite(courseValue), true);
      assert.equal(engine.playingHandicap(courseValue, 90), Math.round(courseValue * 0.9));
    });

    const recovered = engine.sanitizeSetupDraft({ id: `stress-${iteration}`, date: '2026-07-15', courseId: course.id, teamCount, playersPerTeam, players: draft, selectedGames: [] });
    assertSame(recovered.players.map(row => [row.playerId, row.teeId]), draft.map(row => [row.playerId, row.teeId]));
    if (slotCount > playersPerTeam) {
      const smaller = engine.reconcilePlayerDraftSlots(draft, { teamCount: teamCount - 1, playersPerTeam, validTeeIds: ['blue', 'white'] });
      assertSame(smaller.map(row => [row.playerId, row.teeId]), draft.slice(0, smaller.length).map(row => [row.playerId, row.teeId]));
    }
  }
});
