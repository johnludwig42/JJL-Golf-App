import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = fs.readFileSync('app.js', 'utf8');

function seed({ config = {}, inputs = {}, scores = [4, 4, 4, 4], playedHoleOrder = [1] } = {}) {
  const engine = loadLiveEngine();
  const players = ['p1', 'p2', 'p3', 'p4'].map((id, idx) => ({ id, name: id.toUpperCase(), index: 0, team: idx < 2 ? 1 : 2 }));
  const holes = Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: 4, strokeIndex: idx + 1 }));
  const match = {
    id: 'm', courseId: 'c', teeId: 't', format: 'teams', teamCount: 2, playersPerTeam: 2,
    teamNames: ['Alpha', 'Bravo'], selectedGames: [{ key: 'sneaky_sandy_poley', pointValue: 1, ...config }],
    statTrackingEnabled: false, sneakySandyPoleyInputs: inputs, playedHoleOrder,
    players: players.map((p, idx) => ({ playerId: p.id, team: p.team, scores: Array.from({ length: 18 }, (_, h) => ({ holeNumber: h + 1, gross: h === 0 ? scores[idx] : null })), stats: [] })),
  };
  const state = engine.seedState({ players, courses: [{ id: 'c', tees: [{ id: 't', rating: 72, slope: 113, par: 72, holes }] }], matches: [match], activeMatchId: 'm' });
  const hydrated = state.matches[0];
  return { engine, match: hydrated, ledger: engine.buildSneakySandyPoleyLedger(hydrated, { metrics: engine.computeMatchMetrics(hydrated) }) };
}

test('v30.3.76 config is additive and defaults Starting Honors to Team 1', () => {
  const { engine } = seed();
  const cfg = engine.normalizeSneakySandyPoleyConfig({ key: 'sneaky_sandy_poley', unknownFutureField: 'kept' });
  assert.equal(cfg.version, 2);
  assert.equal(cfg.startingHonorsTeamId, '1');
  assert.equal(cfg.unknownFutureField, 'kept');
});

test('Starting Honors may be Team 2 and carries on a cumulative tie', () => {
  const { ledger } = seed({ config: { startingHonorsTeamId: '2' } });
  assert.equal(ledger.honorsByHole['1'], '2');
});

test('sequence and Starting Honors stay frozen after the first eligible hole', () => {
  const { engine, match } = seed({ config: { sspSequenceMode: 'entry', startingHonorsTeamId: '2' } });
  match.sspSequenceLockedAt = '2026-07-22T12:00:00.000Z';
  match.sspSequenceLockedMode = 'routing';
  match.sspStartingHonorsTeamId = '1';
  const cfg = engine.buildSneakySandyPoleyLedger(match, { metrics: engine.computeMatchMetrics(match) }).settings;
  assert.equal(cfg.sspSequenceMode, 'routing');
  assert.equal(cfg.startingHonorsTeamId, '1');
});

test('equivalent two-device sequence locks converge without a false conflict', () => {
  const { engine } = seed();
  const base = { version: 2, settings: { key: 'sneaky_sandy_poley' }, inputs: {}, playedHoleOrder: [], holeFirstCompletedAt: {}, sequenceLock: null };
  const local = { ...structuredClone(base), sourceDeviceId: 'a', sequenceLock: { lockedAt: '2026-07-22T12:00:02.000Z', mode: 'entry', startingHonorsTeamId: '2', participantId: 'pa', deviceId: 'a' } };
  const remote = { ...structuredClone(base), sourceDeviceId: 'b', sequenceLock: { lockedAt: '2026-07-22T12:00:01.000Z', mode: 'entry', startingHonorsTeamId: '2', participantId: 'pb', deviceId: 'b' } };
  const result = engine.reconcileSharedSspFacts(local, remote, base, { isHost: true });
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts.sequenceLock.deviceId, 'b');
  assert.equal(result.facts.sequenceLock.lockedAt, '2026-07-22T12:00:01.000Z');
});

test('Bridge declarer rules enforce non-Honors then Honors while legacy booleans remain valid', () => {
  const valid = seed({ config: { allowBridgeRebridge: true }, inputs: { 1: { bridge: true, rebridge: true, bridgeDeclaredByTeamId: '2', rebridgeDeclaredByTeamId: '1' } } }).ledger.holes['1'].bridge;
  assert.equal(valid.multiplier, 4);
  const invalid = seed({ config: { allowBridgeRebridge: true }, inputs: { 1: { bridge: true, bridgeDeclaredByTeamId: '1' } } }).ledger.holes['1'].bridge;
  assert.equal(invalid.invalid, true);
  const legacy = seed({ config: { allowBridgeRebridge: true }, inputs: { 1: { bridge: true } } }).ledger.holes['1'].bridge;
  assert.equal(legacy.multiplier, 2);
  assert.equal(legacy.legacyAttribution, true);
});

test('legacy pending Greeny stays unresolved and cannot create final settlement', () => {
  const { ledger } = seed({ config: { validateGreenyProx: true }, inputs: { 1: { players: { p1: { greeny: true, greenyValidation: 'pending' } } } } });
  assert.equal(ledger.unresolved, true);
  assert.equal(ledger.settlement.valid, false);
  assert.equal(ledger.settlement.provisional, true);
});

test('incomplete scored facts preview locally but cannot advance authoritative SSP settlement', () => {
  const { ledger } = seed({ scores: [4, null, null, null], inputs: { 1: { players: { p1: { sandy: true } } } } });
  assert.equal(ledger.holes['1'].counted, true);
  assert.equal(ledger.holes['1'].sequenceEligible, false);
  assert.equal(ledger.holes['1'].finalPointsByTeam['1'] > 0, true);
  assert.equal(ledger.finalTotalsByTeam['1'], 0);
  assert.equal(ledger.unresolved, true);
  assert.equal(ledger.settlement.valid, false);
});

test('invalid Bridge or Re-Bridge attribution blocks final settlement', () => {
  const { ledger } = seed({ config: { allowBridgeRebridge: true }, inputs: { 1: { bridge: true, bridgeDeclaredByTeamId: '1' } } });
  assert.equal(ledger.holes['1'].bridge.invalid, true);
  assert.equal(ledger.unresolved, true);
  assert.equal(ledger.settlement.valid, false);
});

test('active host correction requires confirmation and reason, recalculates, and retains audit attribution', () => {
  const { engine, match } = seed();
  match.sspSequenceLockedAt = '2026-07-22T12:00:00.000Z';
  match.sspSequenceLockedMode = 'routing';
  match.sspStartingHonorsTeamId = '1';
  assert.throws(() => engine.correctActiveSspSequenceSettings(match, { sspSequenceMode: 'entry', startingHonorsTeamId: '2', reason: 'Wrong setup' }), /confirmation/i);
  const correction = engine.correctActiveSspSequenceSettings(match, {
    sspSequenceMode: 'entry',
    startingHonorsTeamId: '2',
    reason: 'Corrected host setup',
    confirmed: true,
    correctedAt: '2026-07-22T12:05:00.000Z',
    participantId: 'host-participant',
    deviceId: 'host-device',
  });
  assert.equal(correction.priorMode, 'routing');
  assert.equal(correction.newMode, 'entry');
  assert.equal(correction.reason, 'Corrected host setup');
  assert.equal(correction.participantId, 'host-participant');
  assert.equal(match.sspSequenceLockedMode, 'entry');
  assert.equal(match.sspStartingHonorsTeamId, '2');
  assert.equal(match.sspSequenceCorrections.length, 1);
});

test('one-tap Greeny and progressive Bridge UX are present without confirm/reject controls', () => {
  assert.match(source, /greenyValidationSource = 'scorer-confirmed'/);
  assert.doesNotMatch(source, /data-ssp-greeny-validation=/);
  assert.match(source, /Bridge — \$\{escapeHtml\(nonHonorsName\)\}/);
  assert.match(source, /Re-Bridge — \$\{escapeHtml\(honorsName\)\}/);
});

test('release contract documents constitutional boundaries and no database migration', () => {
  const rules = fs.readFileSync('docs/SSP_RULES_v30.3.76.md', 'utf8');
  const review = fs.readFileSync('docs/architecture/CONSTITUTIONAL_REVIEW_v30.3.76.md', 'utf8');
  const notes = fs.readFileSync('BUILD_NOTES_v30.3.76.md', 'utf8');
  assert.match(rules, /team without Honors may declare Bridge/);
  assert.match(review, /Participant, Device, scoring assignment, and Owner\/host remain distinct/);
  assert.match(notes, /No database migration is included or required/);
});
