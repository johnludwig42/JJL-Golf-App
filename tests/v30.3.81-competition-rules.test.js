import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const engine = loadLiveEngine();

function skinsMetrics() {
  const players = [{ playerId: 'a', team: 1 }, { playerId: 'b', team: 2 }];
  return {
    players,
    teams: [{ team: 1 }, { team: 2 }],
    holeResults: [
      { holeNumber: 1, completed: true, playerScores: [{ playerId: 'a', team: 1, gross: 4, net: 4 }, { playerId: 'b', team: 2, gross: 4, net: 4 }] },
      { holeNumber: 2, completed: true, playerScores: [{ playerId: 'a', team: 1, gross: 3, net: 3 }, { playerId: 'b', team: 2, gross: 4, net: 4 }] },
    ],
  };
}

test('v30.3.81 removes the redundant setup checklist while retaining destination status and validation routing', () => {
  assert.doesNotMatch(app, /Tap an item to finish setup|readiness-check-list/);
  assert.doesNotMatch(html, /roundReadinessPanel/);
  assert.match(app, /renderSetupDestinationStatuses\(state\)/);
  assert.match(app, /openSetupDestination\(getSetupDestinationForReadinessItem\(firstWarning\)\)/);
});

test('new game defaults are stamped with a versioned rules catalog and expose complete contracts', () => {
  const defaults = engine.getDefaultGameConfigs();
  assert.equal(defaults.length, 10);
  assert.ok(defaults.every(game => game.rulesCatalogVersion === 1));
  for (const game of defaults) {
    const contract = engine.getCompetitionRulesContract(game.key, game);
    assert.equal(contract.catalogVersion, 1);
    for (const key of ['basis', 'scoringMethod', 'allowance', 'tieTreatment', 'stakeMeaning', 'escalation', 'finality']) assert.ok(contract[key], `${game.key} missing ${key}`);
  }
  assert.match(engine.buildCompetitionRulesSummary(defaults.slice(0, 2)), /Rules used for this round/);
});

test('WHS allowance uses the unrounded Course Handicap and rounds only the final Playing Handicap', () => {
  const unrounded = engine.unroundedCourseHandicap(8.6, 125, 71, 71);
  assert.ok(Math.abs(unrounded - 9.513274336283185) < 1e-12);
  assert.equal(engine.courseHandicap(8.6, 125, 71, 71), 10);
  assert.equal(engine.playingHandicapFromInputs(8.6, 125, 71, 71, 85), 8);
  assert.equal(engine.playingHandicapFromInputs(10.3, 125, 71, 71, 85), 10);
});

test('explicit Skins carryover awards accumulated units while legacy and no-carry configs retain one skin', () => {
  const metrics = skinsMetrics();
  const match = { players: [{ playerId: 'a', team: 1 }, { playerId: 'b', team: 2 }] };
  const carried = engine.computeSkinResults(match, metrics, { key: 'skins', basis: 'gross', skinsType: 'individual', carryoverMode: 'carry', finalCarryTreatment: 'expire' });
  assert.equal(carried.counts.a, 2);
  assert.equal(JSON.stringify(carried.winnersByHole.map(row => [row.holeNumber, row.value, row.carried])), JSON.stringify([[2, 2, 1]]));
  assert.equal(carried.unresolvedCarry, 0);

  const noCarry = engine.computeSkinResults(match, metrics, { key: 'skins', basis: 'gross', skinsType: 'individual', carryoverMode: 'none' });
  assert.equal(noCarry.counts.a, 1);
  assert.equal(noCarry.winnersByHole[0].value, 1);

  const legacy = engine.computeSkinResults(match, metrics, { key: 'skins', basis: 'gross', skinsType: 'individual' });
  assert.equal(legacy.counts.a, 1);
});

test('Skins settlement multiplies the saved stake by the carried skin value exactly once', () => {
  const match = {
    id: 'skins-carry', status: 'complete', teamCount: 2,
    players: [{ playerId: 'a', team: 1 }, { playerId: 'b', team: 2 }],
    selectedGames: [{ key: 'skins', basis: 'gross', skinsType: 'individual', carryoverMode: 'carry', finalCarryTreatment: 'expire', stake: 5, rulesCatalogVersion: 1 }],
  };
  const payout = engine.computeLivePayoutGames(match, skinsMetrics()).find(game => game.sourceKey === 'skins' || game.key === 'individual_skins');
  assert.ok(payout);
  assert.equal(payout.amounts.a, 10);
  assert.equal(payout.amounts.b, -10);
});
