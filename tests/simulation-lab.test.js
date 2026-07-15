import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicFixtures } from './fixtures/rounds/simulation-fixtures.js';
import { DEFAULT_SEED, createRng, generateRandomRound, validateRound } from '../scripts/simulation-engine.js';
import { runSimulationLab } from '../scripts/simulation-report.js';

test('deterministic fixtures satisfy simulation invariants', () => {
  const failures = deterministicFixtures.flatMap(fixture => {
    const result = validateRound(fixture);
    return result.failures.map(message => `${fixture.scenario}: ${message}`);
  });
  assert.deepEqual(failures, []);
});

test('deterministic Press regression fixture catalog covers the approved lifecycle matrix', () => {
  const pressFixtures = deterministicFixtures.filter(fixture => fixture.pressRegression);
  assert.deepEqual(pressFixtures.map(fixture => fixture.scenario), [
    'press_front_lane',
    'press_back_lane',
    'press_overall_lane',
    'press_match_play',
    'press_repress_chain_1',
    'press_repress_chain_2',
    'press_multiple_independent_chains',
    'press_round_limit_exhausted',
    'press_mid_round_enable',
    'press_disable_after_use_blocked',
    'press_limit_reduction_blocked',
    'press_shared_sync_reconnect',
    'press_reopen_refinish',
    'press_frozen_history_reload',
    'press_repeated_settlement',
  ]);
  assert.equal(pressFixtures.every(fixture => fixture.pressRegression.deterministic === true), true);
});

test('seeded random rounds satisfy simulation invariants', () => {
  const rng = createRng(DEFAULT_SEED);
  const failures = Array.from({ length: 25 }, (_, idx) => generateRandomRound(rng, idx)).flatMap(round => {
    const result = validateRound(round);
    return result.failures.map(message => `${round.scenario}: ${message}`);
  });
  assert.deepEqual(failures, []);
});

test('simulation lab compare mode records live adapter comparisons', () => {
  const summary = runSimulationLab({ rounds: 3, fixtures: true, adapterMode: 'compare' });
  assert.equal(summary.adapterMode, 'compare');
  assert.equal(summary.liveComparisons.length, summary.totalRounds);
  assert.deepEqual(summary.liveDifferences, []);
});
