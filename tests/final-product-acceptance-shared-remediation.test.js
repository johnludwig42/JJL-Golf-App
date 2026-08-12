import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function roundFixture(holeCount = 18, complete = true, storageMode = 'local') {
  const holes = Array.from({ length: holeCount }, (_, index) => ({ holeNumber: index + 1, par: index % 5 === 2 ? 3 : 4, strokeIndex: index + 1 }));
  const players = [{ id: 'a', name: 'Alpha Player', index: 4 }, { id: 'b', name: 'Beta Player With A Very Long Display Name', index: 9 }];
  const course = { id: 'c', name: 'Acceptance Club', tees: [{ id: 't', teeName: 'Ledger', rating: holeCount === 9 ? 36 : 72, slope: 120, par: holeCount === 9 ? 36 : 72, holes }] };
  const match = {
    id: `m-${holeCount}-${complete}`, date: '2026-07-15', courseId: 'c', teeId: 't', holeCount,
    teamCount: 2, playersPerTeam: 1, teamNames: ['Alpha', 'Beta'], storageMode,
    sharedHostDeviceId: 'host-device', selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }],
    players: players.map((player, playerIndex) => ({
      playerId: player.id, team: playerIndex + 1, slot: playerIndex, teeId: 't',
      scores: holes.map((hole, index) => ({ holeNumber: hole.holeNumber, gross: complete || index < holeCount - 1 ? 4 + ((index + playerIndex) % 2) : null })),
      stats: holes.map(hole => ({ holeNumber: hole.holeNumber, putts: null })),
    })),
  };
  const engine = loadLiveEngine();
  const live = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id }).matches[0];
  return { engine, live, metrics: engine.computeMatchMetrics(live), players, course };
}

test('Shared Match details have a bounded visible exit, Escape handling, focus restoration, and no duplicate static IDs', () => {
  assert.match(app, /data-close-shared-details="1">Done</);
  assert.match(app, /function closeSharedMatchDetails\(\{ restoreFocus = true \} = \{\}\)/);
  assert.match(app, /details\.open = false/);
  assert.match(app, /summary\?\.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(app, /if \(e\.key === 'Escape' && closeSharedMatchDetails\(\)\) return/);
  assert.match(css, /\.shared-title-sync-diagnostics-head\{position:sticky/);
  assert.match(css, /\.shared-title-sync-close\{[^}]*min-height:40px/);
  assert.match(css, /\.shared-title-sync-diagnostics\{position:fixed[^}]*max-height:70vh[^}]*overflow:auto/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(row => row[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((app.match(/addEventListener\('click', async e => \{/g) || []).length >= 1, true);
});

test('player clear pointer handling runs before blur, preserves the tee, and permits immediate reassignment', () => {
  const engine = loadLiveEngine();
  let draft = [{ slot: 0, team: 1, playerId: 'a', teeId: 'blue' }, { slot: 1, team: 2, playerId: 'b', teeId: 'white' }];
  for (const pointerType of ['touch', 'pen', 'mouse']) {
    const calls = [];
    const event = {
      pointerType, button: 0, preventDefault() {},
      target: { closest: selector => selector === '[data-clear-player-slot]' ? { dataset: { clearPlayerSlot: '0' } } : null },
    };
    assert.equal(engine.handlePlayerComboboxClearPointerDown(event, (...args) => calls.push(args)), true);
    assert.deepEqual(structuredClone(calls[0].slice(0, 2)), [0, '']);
    const beforeOther = structuredClone(draft[1]);
    draft = engine.updatePlayerDraftSlot(draft, 0, '', { playersPerTeam: 1, validTeeIds: ['blue', 'white'] });
    assert.equal(draft[0].teeId, 'blue');
    assert.deepEqual(structuredClone(draft[1]), beforeOther);
    draft = engine.updatePlayerDraftSlot(draft, 0, 'replacement', { playersPerTeam: 1, validTeeIds: ['blue', 'white'] });
    assert.equal(draft[0].playerId, 'replacement');
    assert.equal(draft[0].teeId, 'blue');
  }
  assert.match(app, /matchPlayersPickerEl\.addEventListener\('pointerdown', handlePlayerComboboxClearPointerDown\)/);
});

test('Nassau defaults to Net while explicit Gross source and template values remain authoritative', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getDefaultGameConfigs().find(game => game.key === 'nassau').basis, 'net');
  assert.equal(engine.getGameConfig('nassau', []).basis, 'net');
  const explicit = [{ key: 'nassau', basis: 'gross', stakesFront: 3, stakesBack: 4, stakesOverall: 5 }];
  assert.equal(engine.getGameConfig('nassau', explicit).basis, 'gross');
  assert.deepEqual(structuredClone(engine.getGameConfig('nassau', explicit)), explicit[0]);
  const source = engine.createEmptyMatch({ selectedGames: explicit });
  engine.normalizeMatch(source);
  assert.equal(source.selectedGames[0].basis, 'gross');
});

test('Handicap Preview uses one shared five-column grid on mobile and desktop without name-driven numeric shifts', () => {
  assert.match(app, /class="handicap-preview-header"/);
  assert.match(app, /class="handicap-preview-meta handicap-preview-row"/);
  assert.match(css, /--handicap-preview-columns:minmax\(100px,1\.8fr\) repeat\(4,minmax\(42px,\.65fr\)\)/);
  assert.match(css, /grid-template-columns:var\(--handicap-preview-columns\)/);
  assert.match(css, /@media \(max-width:560px\)[\s\S]*--handicap-preview-columns:minmax\(86px,1\.7fr\) repeat\(4,minmax\(38px,\.6fr\)\)/);
  assert.doesNotMatch(css.slice(css.indexOf('/* v27.20 Handicap Preview'), css.indexOf('/* v27.23')), /overflow-x:auto|min-width:max-content/);
});

test('saved preferences immediately seed the next new draft without mutating a prior draft or global preferences', () => {
  const engine = loadLiveEngine();
  const store = storage();
  engine.updatePlayerPreference('scoring.smartScoreAdvanceEnabled', false, store);
  engine.updatePlayerPreference('scoring.smartScoreAdvancePreset', 'RELAXED', store);
  engine.updatePlayerPreference('scoring.statTrackingDefault', true, store);
  engine.updatePlayerPreference('roundDefaults.sharedMatchEnabled', true, store);
  const firstPreferences = engine.getPlayerPreferences(store);
  const firstDraft = engine.createBlankSetupDraft(firstPreferences);
  assert.equal(firstDraft.smartScoreAdvanceEnabled, false);
  assert.equal(firstDraft.smartScoreAdvancePreset, 'relaxed');
  assert.equal(firstDraft.statTrackingEnabled, true);
  assert.equal(firstDraft.storageMode, 'shared');
  const firstSnapshot = JSON.stringify(firstDraft);
  engine.updatePlayerPreference('scoring.smartScoreAdvanceEnabled', true, store);
  engine.updatePlayerPreference('scoring.smartScoreAdvancePreset', 'FAST', store);
  const secondDraft = engine.createBlankSetupDraft(engine.getPlayerPreferences(store));
  assert.equal(secondDraft.smartScoreAdvanceEnabled, true);
  assert.equal(secondDraft.smartScoreAdvancePreset, 'fast');
  assert.equal(JSON.stringify(firstDraft), firstSnapshot);
  secondDraft.smartScoreAdvanceEnabled = false;
  assert.equal(engine.getPlayerPreferences(store).scoring.smartScoreAdvanceEnabled, true);
});

test('1,000 generated Match Codes are canonical, zero-free, collision-aware, normalized, and retryable', async () => {
  const engine = loadLiveEngine();
  let seed = 246813579;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const codes = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const code = engine.generateSharedMatchCode(random);
    assert.match(code, /^DYE-[1-9]{6}$/);
    assert.equal(code.includes('0'), false);
    assert.equal(engine.isCanonicalSharedMatchCode(code), true);
    codes.add(code);
  }
  assert.ok(codes.size > 990);
  assert.equal(engine.normalizeJoinMatchCode('  dye-532835  '), 'DYE-532835');
  for (const invalid of ['DYE-502835', 'DYE-12345', 'DYE-1234567', 'DYE-A23456', '532835', 'DYE-O32835']) assert.equal(engine.normalizeJoinMatchCode(invalid), '');
  const values = [...Array(6).fill(0), ...Array(6).fill(0.15)];
  const unique = await engine.generateUniqueSharedMatchCode(async code => code === 'DYE-111111', { random: () => values.shift(), maxAttempts: 2 });
  assert.equal(unique, 'DYE-222222');
  let attempts = 0;
  const bundle = await engine.fetchSharedMatchBundleWithRetry('DYE-532835', { attempts: 3, delayMs: 0, fetcher: async id => {
    attempts += 1;
    if (attempts < 3) throw new Error('publication pending');
    return { matchRow: { id } };
  } });
  assert.equal(attempts, 3);
  assert.equal(bundle.matchRow.id, 'DYE-532835');
  const joinMatch = { id: 'DYE-532835', storageMode: 'shared', players: [], sharedDevices: [], sharedParticipants: [] };
  const joinCalls = [];
  const joinResult = await engine.registerSharedJoinDevice(joinMatch, {
    requireRegistration: true,
    register: async match => { joinCalls.push(`register:${match.id}`); return true; },
    publish: async match => { joinCalls.push(`publish:${match.id}`); },
    merge: async (match, options) => { joinCalls.push(`merge:${match.id}:${options.includeAssignments}`); },
    isHost: () => false,
  });
  assert.deepEqual(structuredClone(joinResult), { registered: true, published: true });
  assert.deepEqual(joinCalls, ['publish:DYE-532835', 'merge:DYE-532835:true']);
  const refreshCalls = [];
  const refreshResult = await engine.registerSharedJoinDevice(joinMatch, {
    requireRegistration: false,
    register: async () => { refreshCalls.push('register'); return false; },
    publish: async () => { refreshCalls.push('publish'); },
    merge: async () => { refreshCalls.push('merge'); },
    isHost: () => false,
  });
  assert.deepEqual(structuredClone(refreshResult), { registered: false, published: true });
  assert.deepEqual(refreshCalls, ['register', 'publish', 'merge']);
  assert.match(app, /requireRegistration: true/);
  assert.match(app, /This device could not be registered for the Shared Match\. Tap Retry Join\./);
});

test('complete 9- and 18-hole rounds route normally while incomplete and reloaded rounds route deterministically', () => {
  for (const holeCount of [9, 18]) {
    const complete = roundFixture(holeCount, true);
    assert.equal(complete.engine.getRoundCompletionState(complete.live, complete.metrics).isComplete, true);
    assert.equal(complete.engine.getFinishRoundRoutingMode(complete.live, complete.metrics), 'complete');
    const reloaded = complete.engine.seedState({ players: complete.players, courses: [complete.course], matches: [JSON.parse(JSON.stringify(complete.live))], activeMatchId: complete.live.id }).matches[0];
    assert.equal(complete.engine.getFinishRoundRoutingMode(reloaded, complete.engine.computeMatchMetrics(reloaded)), 'complete');
    const incomplete = roundFixture(holeCount, false, 'shared');
    assert.equal(incomplete.engine.getFinishRoundRoutingMode(incomplete.live, incomplete.metrics), 'early');
  }
  assert.match(app, /showRoundEndPrompt\(mode \|\| getFinishRoundRoutingMode\(match\), match\)/);
});

test('Scores momentum reuses the shared renderer for Front 9, Back 9, and Full 18 at full card width', () => {
  const { engine, live, metrics } = roundFixture(18, true);
  assert.deepEqual(structuredClone(engine.getMomentumRangeOptions(live, metrics).map(option => option.label)), ['Front 9', 'Back 9', 'Full 18']);
  const front = engine.renderMomentumChart(live, metrics, engine.getMomentumChartKeyForRange('nassau', 'front'), { range: 'front' });
  const back = engine.renderMomentumChart(live, metrics, engine.getMomentumChartKeyForRange('nassau', 'back'), { range: 'back' });
  const full = engine.renderMomentumChart(live, metrics, engine.getMomentumChartKeyForRange('nassau', 'full'), { range: 'full' });
  assert.match(front, /data-momentum-game="nassau_front"/);
  assert.match(back, /data-momentum-game="nassau_back"/);
  assert.match(full, /data-momentum-game="nassau_overall"/);
  for (const chart of [front, back, full]) assert.match(chart, /momentum-zero-baseline/);
  assert.match(css, /#leaderboard \.hole-momentum\{display:block;width:100%;max-width:100%;min-width:0;overflow:hidden\}/);
  assert.equal(engine.getMomentumRangeOptions(roundFixture(9, true).live, roundFixture(9, true).metrics).length, 1);
  assert.doesNotMatch(html, /all 19/i);
});

test('stand-alone Greenies are host-authored, replace deterministically, sync once, and remain separate from SSP Prox', () => {
  const { engine, live } = roundFixture(18, true, 'shared');
  live.selectedGames.push({ key: 'greenies', stakePerPlayer: 1, participants: ['a', 'b'], winnersByHole: {} });
  live.sneakySandyPoleyInputs = { 3: { players: { a: { greeny: true }, b: { greeny: false } }, proxPlayerId: 'a' } };
  assert.equal(engine.canEditGreenies(live, 1, 'a', { isHost: true }), true);
  assert.equal(engine.canEditGreenies(live, 1, 'a', { isHost: false }), false);
  let result = engine.reconcileSharedGreenies(live, { 3: 'a' }, { isHost: false, updatedAt: '2026-07-15T12:00:00Z' });
  assert.equal(result.changed, true);
  assert.deepEqual(structuredClone(live.greeniesWinners), { 3: 'a' });
  result = engine.reconcileSharedGreenies(live, { 3: 'a' }, { isHost: false, updatedAt: '2026-07-15T12:00:00Z' });
  assert.equal(result.changed, false);
  result = engine.reconcileSharedGreenies(live, { 3: 'b' }, { isHost: false, updatedAt: '2026-07-15T12:01:00Z' });
  assert.equal(result.changed, true);
  assert.deepEqual(structuredClone(live.greeniesWinners), { 3: 'b' });
  assert.equal(live.sneakySandyPoleyInputs[3].proxPlayerId, 'a');
  const hostBefore = JSON.stringify(live.greeniesWinners);
  assert.equal(engine.reconcileSharedGreenies(live, { 3: 'a' }, { isHost: true }).changed, false);
  assert.equal(JSON.stringify(live.greeniesWinners), hostBefore);
  assert.match(app, /Stand-alone Greenies are official group results entered by the host/);
  assert.match(app, /greeniesWinners: isCurrentDeviceMatchHost\(match\)/);
});
