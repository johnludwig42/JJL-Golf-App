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
