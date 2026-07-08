import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicFixtures } from './fixtures/rounds/simulation-fixtures.js';
import { DEFAULT_SEED, createRng, generateRandomRound } from '../scripts/simulation-engine.js';
import { compareRoundWithLiveEngine, evaluateRoundWithLiveEngine, loadLiveEngine } from '../scripts/live-engine-adapter.js';

test('live engine adapter exposes the expected app.js functions', () => {
  const engine = loadLiveEngine();
  [
    'seedState',
    'normalizeMatch',
    'computeMatchMetrics',
    'computeLivePayoutGames',
    'getPayoutReportContext',
    'optimalSettlementRows',
  ].forEach(name => assert.equal(typeof engine[name], 'function', `${name} should be exposed`));
});

test('live engine adapter evaluates deterministic fixtures without adapter failures', () => {
  const engine = loadLiveEngine();
  deterministicFixtures.forEach(fixture => {
    const live = evaluateRoundWithLiveEngine(fixture, { engine });
    assert.equal(live.adapterMode, 'vm-app-js');
    assert.ok(live.metrics);
    assert.deepEqual(Object.keys(live.finalTotals).sort(), fixture.players.map(player => player.id).sort());
  });
});

test('deterministic fixtures match between live app engine and mirrored simulation engine', () => {
  const engine = loadLiveEngine();
  const differences = deterministicFixtures.flatMap(fixture => {
    const result = compareRoundWithLiveEngine(fixture, { engine });
    return result.differences.map(message => `${fixture.scenario}: ${message}`);
  });
  assert.deepEqual(differences, []);
});

test('seeded random rounds match between live app engine and mirrored simulation engine', () => {
  const engine = loadLiveEngine();
  const rng = createRng(DEFAULT_SEED);
  const differences = Array.from({ length: 25 }, (_, idx) => generateRandomRound(rng, idx)).flatMap(round => {
    const result = compareRoundWithLiveEngine(round, { engine });
    return result.differences.map(message => `${round.scenario}: ${message}`);
  });
  assert.deepEqual(differences, []);
});
