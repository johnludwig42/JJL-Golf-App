import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

function emptyScores(values = []) {
  return Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: values[idx] ?? null }));
}

function emptyStats(overrides = []) {
  return Array.from({ length: 18 }, (_, idx) => ({
    holeNumber: idx + 1,
    fairway: false,
    green: false,
    putts: 2,
    puttsSource: 'user',
    penaltyStrokes: 0,
    upAndDown: false,
    sandy: false,
    ...(overrides[idx] || {}),
  }));
}

function buildSeed({ selectedGames = [{ key: 'sneaky_sandy_poley', pointValue: 1 }], scores = {}, inputs = {}, stats = {}, statTracking = false } = {}) {
  const players = [
    { id: 'p1', name: 'Alex', index: 0 },
    { id: 'p2', name: 'Blake', index: 0 },
    { id: 'p3', name: 'Casey', index: 0 },
    { id: 'p4', name: 'Drew', index: 0 },
  ];
  const course = {
    id: 'course',
    name: 'SSP Test Course',
    tees: [{
      id: 'tee',
      teeName: 'Test',
      rating: 72,
      slope: 113,
      par: 72,
      holes: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: 4, strokeIndex: idx + 1, yardage: 400 })),
    }],
  };
  const match = {
    id: 'match',
    date: '2026-07-10',
    name: 'SSP Ledger Test',
    courseId: 'course',
    teeId: 'tee',
    format: 'teams',
    allowance: 100,
    holeCount: 18,
    teamCount: 2,
    playersPerTeam: 2,
    teamNames: ['Alpha', 'Bravo'],
    selectedGames,
    statTrackingEnabled: statTracking,
    statTrackingPlayerIds: statTracking ? players.map(player => player.id) : [],
    players: [
      { playerId: 'p1', team: 1, slot: 0, teeId: 'tee', scores: emptyScores(scores.p1), stats: emptyStats(stats.p1) },
      { playerId: 'p2', team: 1, slot: 1, teeId: 'tee', scores: emptyScores(scores.p2), stats: emptyStats(stats.p2) },
      { playerId: 'p3', team: 2, slot: 2, teeId: 'tee', scores: emptyScores(scores.p3), stats: emptyStats(stats.p3) },
      { playerId: 'p4', team: 2, slot: 3, teeId: 'tee', scores: emptyScores(scores.p4), stats: emptyStats(stats.p4) },
    ],
    sneakySandyPoleyInputs: inputs,
  };
  return { players, courses: [course], matches: [match], activeMatchId: 'match' };
}

function getLedger(seedOptions) {
  const engine = loadLiveEngine();
  const state = engine.seedState(buildSeed(seedOptions));
  const match = state.matches[0];
  const metrics = engine.computeMatchMetrics(match);
  return engine.buildSneakySandyPoleyLedger(match, { metrics });
}

function resolveProx(input, options = {}) {
  const engine = loadLiveEngine();
  const players = ['p1', 'p2', 'p3', 'p4'].map(playerId => ({ playerId }));
  return engine.resolveSneakySandyPoleyProxSelection(input, players, options);
}

test('old match without SSP returns disabled ledger', () => {
  const ledger = getLedger({ selectedGames: [], scores: { p1: [4], p2: [4], p3: [4], p4: [4] } });
  assert.equal(ledger.enabled, false);
  assert.equal(Object.keys(ledger.totalsByTeam).length, 0);
});

test('Prox resolver uses None, auto-select, TBD, and selected states from Greeny count', () => {
  const none = resolveProx({ proxPlayerId: 'p1', players: { p1: { greeny: false } } });
  assert.equal(none.mode, 'none');
  assert.equal(none.proxPlayerId, '');
  assert.equal(none.uiValue, '');

  const auto = resolveProx({ proxPlayerId: '', players: { p1: { greeny: true }, p2: { greeny: false } } });
  assert.equal(auto.mode, 'auto');
  assert.equal(auto.proxPlayerId, 'p1');
  assert.equal(auto.uiValue, 'p1');

  const tbd = resolveProx({ proxPlayerId: '', players: { p1: { greeny: true }, p2: { greeny: true } } });
  assert.equal(tbd.mode, 'tbd');
  assert.equal(tbd.proxPlayerId, '');
  assert.equal(tbd.uiValue, '__tbd');

  const selected = resolveProx({ proxPlayerId: 'p2', players: { p1: { greeny: true }, p2: { greeny: true } } });
  assert.equal(selected.mode, 'selected');
  assert.equal(selected.proxPlayerId, 'p2');

  const forcedTbd = resolveProx(
    { proxPlayerId: 'p1', players: { p1: { greeny: true }, p2: { greeny: true } } },
    { forceTbdOnMultiple: true }
  );
  assert.equal(forcedTbd.mode, 'tbd');
  assert.equal(forcedTbd.proxPlayerId, '');

  const recalculated = resolveProx({ proxPlayerId: 'p1', players: { p1: { greeny: false }, p2: { greeny: true } } });
  assert.equal(recalculated.mode, 'auto');
  assert.equal(recalculated.proxPlayerId, 'p2');
});

test('manual Sneaky, Sandy, and Poley awards validate against gross score', () => {
  const ledger = getLedger({
    scores: { p1: [4], p2: [5], p3: [6], p4: [7] },
    inputs: {
      1: {
        players: {
          p1: { sneaky: true, sandy: true, poley: true, greeny: false },
          p2: { sneaky: true, sandy: true, poley: false, greeny: false },
          p3: { sneaky: false, sandy: false, poley: true, greeny: false },
          p4: { sneaky: false, sandy: false, poley: true, greeny: false },
        },
      },
    },
  });
  const hole = ledger.holes['1'];
  assert.equal(hole.basePointsByTeam['1'], 7);
  assert.equal(hole.basePointsByTeam['2'], 1);
  assert.ok(hole.warnings.some(text => /Sneaky requires par/.test(text)));
  assert.ok(hole.warnings.some(text => /Poley requires double bogey/.test(text)));
  assert.equal(hole.warnings.some(text => /not fully stat-validated/.test(text)), false);
});

test('Sneaky is scorer-confirmed on par without stat-validation warning noise', () => {
  const ledger = getLedger({
    statTracking: true,
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    stats: { p1: [{ green: true, putts: 2 }] },
    inputs: {
      1: {
        players: {
          p1: { sneaky: true },
        },
      },
    },
  });
  const hole = ledger.holes['1'];
  assert.equal(hole.categoriesByTeam['1'].some(row => row.category === 'sneaky'), true);
  assert.equal(hole.warnings.some(text => /Sneaky/.test(text)), false);
});

test('Validate requires putts for Greeny and Prox', () => {
  const ledger = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', validateGreenyProx: true, pointValue: 1 }],
    statTracking: true,
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    stats: { p1: [{ putts: 2 }], p2: [{ putts: 3 }] },
    inputs: {
      1: {
        proxPlayerId: 'p1',
        players: {
          p1: { greeny: true },
          p2: { greeny: true },
        },
      },
    },
  });
  const hole = ledger.holes['1'];
  assert.equal(hole.basePointsByTeam['1'], 3);
  assert.ok(hole.warnings.some(text => /Greeny requires 2 putts/.test(text)));
});

test('Prox requires an eligible Greeny', () => {
  const ledger = getLedger({
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { proxPlayerId: 'p1', players: { p1: { greeny: false } } } },
  });
  assert.equal(ledger.holes['1'].basePointsByTeam['1'], 0);
  assert.ok(ledger.holes['1'].warnings.some(text => /Prox requires an eligible Greeny/.test(text)));
});

test('TBD Prox awards no points until an eligible Greeny player is selected', () => {
  const tbdLedger = getLedger({
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: {
      1: {
        proxPlayerId: '',
        players: {
          p1: { greeny: true },
          p2: { greeny: true },
        },
      },
    },
  });
  const tbdCategories = tbdLedger.holes['1'].categoriesByTeam['1'];
  assert.equal(tbdCategories.filter(row => row.category === 'greeny').length, 2);
  assert.equal(tbdCategories.some(row => row.category === 'prox'), false);

  const selectedLedger = getLedger({
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: {
      1: {
        proxPlayerId: 'p2',
        players: {
          p1: { greeny: true },
          p2: { greeny: true },
        },
      },
    },
  });
  const selectedCategories = selectedLedger.holes['1'].categoriesByTeam['1'];
  assert.equal(selectedCategories.filter(row => row.category === 'greeny').length, 2);
  assert.equal(selectedCategories.find(row => row.category === 'prox')?.points, 2);
});

test('automatic Birdie, Eagle, Low Ball, and Low Total stack into base totals', () => {
  const ledger = getLedger({
    scores: { p1: [3], p2: [2], p3: [4], p4: [5] },
  });
  const hole = ledger.holes['1'];
  assert.equal(hole.basePointsByTeam['1'], 10);
  assert.equal(hole.basePointsByTeam['2'], 0);
  assert.equal(ledger.totalsByTeam['1'], 10);
  assert.equal(ledger.leader.teamId, '1');
  assert.equal(ledger.leader.margin, 10);
});

test('Low Ball push and Low Total push award no points', () => {
  const ledger = getLedger({
    scores: { p1: [4], p2: [5], p3: [4], p4: [5] },
  });
  const categories = Object.values(ledger.holes['1'].categoriesByTeam).flat();
  assert.equal(categories.some(row => row.category === 'lowBall'), false);
  assert.equal(categories.some(row => row.category === 'lowTotal'), false);
  assert.equal(ledger.holes['1'].basePointsByTeam['1'], 0);
  assert.equal(ledger.holes['1'].basePointsByTeam['2'], 0);
});

test('partial holes do not count missing scores as zero', () => {
  const ledger = getLedger({
    scores: { p1: [3], p2: [null], p3: [4], p4: [null] },
  });
  const hole = ledger.holes['1'];
  assert.equal(hole.basePointsByTeam['1'], 4);
  assert.equal(hole.basePointsByTeam['2'], 0);
  assert.ok(hole.warnings.some(text => /Low Total requires all players/.test(text)));
});
