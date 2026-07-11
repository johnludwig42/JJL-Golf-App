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

function buildSeed({ selectedGames = [{ key: 'sneaky_sandy_poley', pointValue: 1 }], scores = {}, inputs = {}, stats = {}, statTracking = false, playedHoleOrder = [] } = {}) {
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
    playedHoleOrder,
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

test('Sandy defensively implies Sneaky without changing unrelated SSP inputs', () => {
  const engine = loadLiveEngine();
  const state = engine.seedState(buildSeed());
  const match = state.matches[0];
  const normalized = engine.normalizeSneakySandyPoleyHoleInput(match, {
    players: { p1: { sneaky: false, sandy: true, poley: true }, p2: { sneaky: true, sandy: false } },
    bridge: true,
    notes: 'keep me',
  }, 1);
  assert.equal(normalized.players.p1.sandy, true);
  assert.equal(normalized.players.p1.sneaky, true);
  assert.equal(normalized.players.p1.poley, true);
  assert.equal(normalized.players.p2.sneaky, true);
  assert.equal(normalized.players.p2.sandy, false);
  assert.equal(normalized.bridge, true);
  assert.equal(normalized.notes, 'keep me');

  const ledger = getLedger({
    scores: { p1: [4], p2: [5], p3: [5], p4: [5] },
    inputs: { 1: { players: { p1: { sandy: true, sneaky: false } } } },
  });
  const categories = ledger.holes['1'].categoriesByTeam['1'].map(row => row.category);
  assert.equal(categories.includes('sandy'), true);
  assert.equal(categories.includes('sneaky'), true);
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

test('Take and Keep state machine awards only one team per eligible hole', () => {
  const ledger = getLedger({
    scores: { p1: [4, 4, 4, 4], p2: [4, 4, 4, 4], p3: [4, 4, 4, 4], p4: [4, 4, 4, 4] },
    inputs: {
      1: { players: { p1: { sneaky: true } } },
      2: { players: { p3: { sneaky: true } } },
      3: { players: { p3: { sneaky: true } } },
      4: { players: { p1: { sneaky: true }, p3: { sneaky: true } } },
    },
  });
  assert.equal(ledger.holes['1'].takeKeep.type, 'take');
  assert.equal(ledger.holes['1'].takeKeep.teamId, '1');
  assert.equal(ledger.holes['1'].takeKeep.points, 2);
  assert.equal(ledger.holes['2'].takeKeep.type, 'take');
  assert.equal(ledger.holes['2'].takeKeep.teamId, '2');
  assert.equal(ledger.holes['2'].takeKeep.points, 2);
  assert.equal(ledger.holes['3'].takeKeep.type, 'keep');
  assert.equal(ledger.holes['3'].takeKeep.teamId, '2');
  assert.equal(ledger.holes['3'].takeKeep.points, 1);
  assert.equal(ledger.holes['4'].takeKeep.type, 'keep');
  assert.equal(ledger.holes['4'].takeKeep.teamId, '2');
  assert.equal(ledger.holes['4'].takeKeep.points, 1);
  assert.equal(ledger.holes['4'].categoriesByTeam['1'].filter(row => row.category === 'keep').length, 0);
  assert.equal(ledger.holes['4'].categoriesByTeam['2'].filter(row => row.category === 'keep').length, 1);
});

test('Take and Keep are not awarded when base points are unavailable', () => {
  const ledger = getLedger({
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
  });
  assert.equal(ledger.holes['1'].basePointsByTeam['1'], 0);
  assert.equal(ledger.holes['1'].basePointsByTeam['2'], 0);
  assert.equal(ledger.holes['1'].takeKeep.type, null);
  assert.equal(ledger.holes['1'].finalPointsByTeam['1'], 0);
  assert.equal(ledger.holes['1'].finalPointsByTeam['2'], 0);
});

test('Honors follow cumulative final points and carry forward on ties', () => {
  const ledger = getLedger({
    scores: { p1: [4, 4, 4], p2: [4, 4, 4], p3: [4, 4, 4], p4: [4, 4, 4] },
    inputs: {
      1: { players: { p1: { sneaky: true } } },
      2: { players: { p3: { sneaky: true } } },
      3: { players: { p1: { sneaky: true }, p3: { sneaky: true } } },
    },
  });
  assert.equal(ledger.honorsByHole['1'], '1');
  assert.equal(ledger.honorsByHole['2'], '1');
  assert.equal(ledger.honorsByHole['3'], '1');
});

test('routing sequence skips missing holes and follows official hole order', () => {
  const ledger = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', sspSequenceMode: 'routing', pointValue: 1 }],
    playedHoleOrder: [5, 4],
    scores: { p1: [null, null, null, 4, 4], p2: [null, null, null, 4, 4], p3: [null, null, null, 4, 4], p4: [null, null, null, 4, 4] },
    inputs: { 4: { players: { p1: { sneaky: true } } }, 5: { players: { p1: { sneaky: true } } } },
  });
  assert.equal(Array.from(ledger.sequenceHoleNumbers).join(','), '4,5');
  assert.equal(ledger.holes['4'].takeKeep.type, 'take');
  assert.equal(ledger.holes['5'].takeKeep.type, 'keep');
  assert.equal(ledger.honorsByHole['5'], '1');
  assert.equal(ledger.holes['1'].takeKeep.type, null);
});

test('entry sequence follows first-completed order and carries honors in that order', () => {
  const ledger = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', sspSequenceMode: 'entry', pointValue: 1 }],
    playedHoleOrder: [5, 4],
    scores: { p1: [null, null, null, 4, 4], p2: [null, null, null, 4, 4], p3: [null, null, null, 4, 4], p4: [null, null, null, 4, 4] },
    inputs: { 4: { players: { p1: { sneaky: true } } }, 5: { players: { p1: { sneaky: true } } } },
  });
  assert.equal(Array.from(ledger.sequenceHoleNumbers).join(','), '5,4');
  assert.equal(ledger.holes['5'].takeKeep.type, 'take');
  assert.equal(ledger.holes['4'].takeKeep.type, 'keep');
  assert.equal(ledger.honorsByHole['4'], '1');
  assert.equal(ledger.entryOrderFallback, false);
});

test('older entry-mode matches safely fall back to routing without order metadata', () => {
  const ledger = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', sspSequenceMode: 'entry', pointValue: 1 }],
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { players: { p1: { sneaky: true } } } },
  });
  assert.equal(ledger.entryOrderFallback, true);
  assert.equal(Array.from(ledger.sequenceHoleNumbers).join(','), '1');
});

test('Bridge and Re-Bridge multiply post-Take/Keep points only when enabled', () => {
  const bridge = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowBridgeRebridge: true, pointValue: 1 }],
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { bridge: true, players: { p1: { sneaky: true } } } },
  });
  assert.equal(bridge.holes['1'].bridge.multiplier, 2);
  assert.equal(bridge.holes['1'].finalPointsByTeam['1'], 6);

  const rebridge = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowBridgeRebridge: true, pointValue: 1 }],
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { rebridge: true, players: { p1: { sneaky: true } } } },
  });
  assert.equal(rebridge.holes['1'].bridge.multiplier, 4);
  assert.equal(rebridge.holes['1'].finalPointsByTeam['1'], 12);

  const disabled = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowBridgeRebridge: false, pointValue: 1 }],
    scores: { p1: [4], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { bridge: true, players: { p1: { sneaky: true } } } },
  });
  assert.equal(disabled.holes['1'].bridge.multiplier, 1);
  assert.equal(disabled.holes['1'].finalPointsByTeam['1'], 3);
});

test('Umbee doubles or quadruples qualifying birdie and eagle holes', () => {
  const singleBirdie = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowUmbee: true, pointValue: 1 }],
    scores: { p1: [3], p2: [4], p3: [4], p4: [4] },
  });
  assert.equal(singleBirdie.holes['1'].umbee.multiplier, 2);
  assert.equal(singleBirdie.holes['1'].finalPointsByTeam['1'], singleBirdie.holes['1'].pointsAfterTakeKeepByTeam['1'] * 2);

  const doubleBirdie = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowUmbee: true, pointValue: 1 }],
    scores: { p1: [3], p2: [3], p3: [4], p4: [4] },
  });
  assert.equal(doubleBirdie.holes['1'].umbee.multiplier, 4);

  const eagle = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowUmbee: true, pointValue: 1 }],
    scores: { p1: [2], p2: [4], p3: [4], p4: [4] },
  });
  assert.equal(eagle.holes['1'].umbee.multiplier, 4);
});

test('Umbee requires the other team to have zero post-Take/Keep points', () => {
  const ledger = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowUmbee: true, pointValue: 1 }],
    scores: { p1: [3], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { players: { p3: { sneaky: true } } } },
  });
  assert.equal(ledger.holes['1'].pointsAfterTakeKeepByTeam['2'] > 0, true);
  assert.equal(ledger.holes['1'].umbee.active, false);
});

test('Bridge and Umbee stack only when setup allows', () => {
  const stacked = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowBridgeRebridge: true, allowUmbee: true, allowUmbeeWithBridge: true, pointValue: 1 }],
    scores: { p1: [3], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { bridge: true } },
  });
  assert.equal(stacked.holes['1'].bridge.multiplier, 2);
  assert.equal(stacked.holes['1'].umbee.multiplier, 2);
  assert.equal(stacked.holes['1'].finalMultiplierByTeam['1'], 4);

  const unstacked = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', allowBridgeRebridge: true, allowUmbee: true, allowUmbeeWithBridge: false, pointValue: 1 }],
    scores: { p1: [3], p2: [4], p3: [4], p4: [4] },
    inputs: { 1: { bridge: true } },
  });
  assert.equal(unstacked.holes['1'].bridge.multiplier, 2);
  assert.equal(unstacked.holes['1'].umbee.active, false);
  assert.equal(unstacked.holes['1'].finalMultiplierByTeam['1'], 2);
});

test('Final totals and SSP settlement use net final team points', () => {
  const ledger = getLedger({
    selectedGames: [{ key: 'sneaky_sandy_poley', pointValue: 2 }],
    scores: { p1: [4, 4], p2: [4, 4], p3: [4, 4], p4: [4, 4] },
    inputs: {
      1: { players: { p1: { sneaky: true } } },
      2: { players: { p1: { sneaky: true } } },
    },
  });
  assert.equal(ledger.finalTotalsByTeam['1'], 5);
  assert.equal(ledger.finalTotalsByTeam['2'], 0);
  assert.equal(ledger.settlement.payerTeamId, '2');
  assert.equal(ledger.settlement.payeeTeamId, '1');
  assert.equal(ledger.settlement.amount, 10);
  assert.match(ledger.settlement.label, /Bravo pays Alpha \$10\.00/);
});

test('100 deterministic generated SSP cases preserve ledger and settlement invariants', () => {
  let state = 30355;
  const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let caseNo = 0; caseNo < 100; caseNo += 1) {
    const scores = {};
    ['p1', 'p2', 'p3', 'p4'].forEach(playerId => {
      scores[playerId] = Array.from({ length: 6 }, () => next() < 0.12 ? null : 2 + Math.floor(next() * 6));
    });
    const order = [1, 2, 3, 4, 5, 6].sort(() => next() - 0.5);
    const ledger = getLedger({
      selectedGames: [{
        key: 'sneaky_sandy_poley',
        pointValue: 2,
        sspSequenceMode: caseNo % 2 ? 'entry' : 'routing',
        allowBridgeRebridge: true,
        allowUmbee: true,
        allowUmbeeWithBridge: caseNo % 3 === 0,
      }],
      playedHoleOrder: order,
      scores,
      inputs: { 1: { bridge: caseNo % 4 === 0 }, 2: { rebridge: caseNo % 7 === 0 } },
    });
    assert.equal(Object.values(ledger.finalTotalsByTeam).every(Number.isFinite), true);
    assert.equal(ledger.settlement.amount, ledger.settlement.netPoints * 2);
    assert.equal(ledger.sequenceHoleNumbers.every(holeNumber => ledger.holes[String(holeNumber)].counted), true);
    Object.values(ledger.holes).forEach(hole => {
      assert.equal(Object.values(hole.finalPointsByTeam).every(points => Number.isFinite(points) && points >= 0), true);
    });
  }
});

test('SSP momentum uses final points, configured sequence, ties, and ignores unplayed holes without mutation', () => {
  const engine = loadLiveEngine();
  const ledger = {
    enabled: true,
    teams: [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Bravo' }],
    sequenceHoleNumbers: [3, 1, 4],
    holes: {
      1: { counted: true, finalPointsByTeam: { 1: 2, 2: 6 }, basePointsByTeam: { 1: 99, 2: 0 } },
      2: { counted: false, finalPointsByTeam: { 1: 50, 2: 0 } },
      3: { counted: true, finalPointsByTeam: { 1: 4, 2: 0 } },
      4: { counted: true, finalPointsByTeam: { 1: 1, 2: 1 } },
    },
  };
  const before = JSON.stringify(ledger);
  assert.deepEqual(JSON.parse(JSON.stringify(engine.buildSneakySandyPoleyMomentumData({}, { ledger }))), [
    { holeNumber: 3, margin: 4, cumulative: 4, leaderTeamId: '1' },
    { holeNumber: 1, margin: -4, cumulative: 0, leaderTeamId: null },
    { holeNumber: 4, margin: 0, cumulative: 0, leaderTeamId: null },
  ]);
  assert.equal(JSON.stringify(ledger), before);
});

test('SSP smart trend is deterministic and suppresses insufficient data', () => {
  const engine = loadLiveEngine();
  const base = { enabled: true, teams: [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Bravo' }] };
  const one = { ...base, sequenceHoleNumbers: [1], holes: { 1: { counted: true, finalPointsByTeam: { 1: 3, 2: 0 } } } };
  assert.equal(engine.getSneakySandyPoleySmartTrend({}, { ledger: one }), '');
  const change = { ...base, sequenceHoleNumbers: [1, 2], holes: {
    1: { counted: true, finalPointsByTeam: { 1: 1, 2: 4 } },
    2: { counted: true, finalPointsByTeam: { 1: 7, 2: 0 } },
  } };
  assert.equal(engine.getSneakySandyPoleySmartTrend({}, { ledger: change }), 'Trend: Alpha took the lead on Hole 2');
  assert.equal(engine.getSneakySandyPoleySmartTrend({}, { ledger: change }), engine.getSneakySandyPoleySmartTrend({}, { ledger: change }));
});

test('to-par formatter uses golf-native even par without changing signed values', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.formatToPar(0), 'E');
  assert.equal(engine.formatToPar(3), '+3');
  assert.equal(engine.formatToPar(-2), '-2');
});

test('featured SSP status distinguishes live preview from saved match and keeps honors separate', () => {
  const engine = loadLiveEngine();
  const liveState = engine.seedState(buildSeed({
    selectedGames: [{ key: 'nassau' }, { key: 'sneaky_sandy_poley', pointValue: 1 }],
    scores: { p1: [4] },
    inputs: { 1: { players: { p1: { sandy: true } } } },
  }));
  const liveMatch = liveState.matches[0];
  liveMatch.featuredCompetition = 'sneaky_sandy_poley';
  liveMatch.matchStatusGame = 'nassau';
  const liveMetrics = engine.computeMatchMetrics(liveMatch);
  assert.match(engine.getPrimaryMatchStatusLine(liveMatch, liveMetrics), /^Live SSP: Alpha \+/);
  assert.match(engine.getSneakySandyPoleyHonorsLine(liveMatch, liveMetrics), /^Honors: /);

  const savedState = engine.seedState(buildSeed({ scores: { p1: [4], p2: [4], p3: [5], p4: [5] } }));
  const savedMatch = savedState.matches[0];
  savedMatch.featuredCompetition = 'sneaky_sandy_poley';
  const savedMetrics = engine.computeMatchMetrics(savedMatch);
  assert.match(engine.getPrimaryMatchStatusLine(savedMatch, savedMetrics), /^SSP Match: /);

  savedMatch.featuredCompetition = 'none';
  savedMatch.selectedGames = [];
  assert.equal(engine.getSneakySandyPoleyHonorsLine(savedMatch, engine.computeMatchMetrics(savedMatch)), '');
});
