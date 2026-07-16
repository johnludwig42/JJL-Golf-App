import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const branding = readFileSync(new URL('../docs/BRANDING.md', import.meta.url), 'utf8');
const appleIcon = readFileSync(new URL('../branding/apple-touch-icon.png', import.meta.url));

const players = [
  { id: 'a', name: 'Alpha One', index: 0 }, { id: 'b', name: 'Alpha Two', index: 0 },
  { id: 'c', name: 'Bravo One', index: 0 }, { id: 'd', name: 'Bravo Two', index: 0 },
];
const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
const course = { id: 'course', name: 'Press Course', tees: [{ id: 'tee', teeName: 'Test', rating: 72, slope: 113, par: 72, holes }] };

function scores(count, value) {
  return Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, gross: index < count ? value : null }));
}

function seed(game = { key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', declaringSideRule: 'EITHER_SIDE', maxPressesPerRound: 6, maxRePresses: 3 }, count = 5, overrides = {}) {
  const engine = loadLiveEngine();
  const match = {
    id: 'press-round', date: '2026-07-15', name: 'Press Completion', courseId: 'course', teeId: 'tee', holeCount: 18,
    status: 'active', storageMode: 'local', format: 'teams', allowance: 100, teamCount: 2, playersPerTeam: 2,
    teamNames: ['Alpha', 'Bravo'], selectedGames: [structuredClone(game)], pressConfig: structuredClone(game), presses: [],
    players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, slot: index, teeId: 'tee', scores: scores(count, index < 2 ? 4 : 5) })),
    ...overrides,
  };
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [match], activeMatchId: match.id });
  return { engine, match: state.matches[0], metrics: engine.computeMatchMetrics(state.matches[0]) };
}

function press(engine, match, values) {
  return engine.normalizePressRecord({
    pressId: values.pressId, parentGameId: values.parentGameId || 'team_match', rootGameId: values.rootGameId || 'team_match',
    parentSegmentId: values.parentSegmentId || 'team_match:overall', parentSegmentType: values.parentSegmentType || 'OVERALL',
    pressDepth: values.pressDepth || 1, startingHole: values.startingHole || 3, endingHole: values.endingHole || 18,
    declaredForHole: values.declaredForHole || values.startingHole || 3, declaredAtHole: values.declaredAtHole || values.startingHole || 3,
    wagerAmount: values.wagerAmount ?? 10, outcomeGameKey: values.outcomeGameKey || 'team_match', scoringMode: 'net', status: values.status || 'ACTIVE',
  }, match);
}

test('authoritative edit contract covers enablement, disable lock, limits, parent removal, and Shared authority', () => {
  const f = seed({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: false, maxPressesPerRound: 4, maxRePresses: 2 }, 6);
  let proposed = [{ ...f.match.selectedGames[0], pressesEnabled: true }];
  assert.equal(f.engine.validatePressEditContract(f.match, proposed, { isHost: true }).valid, true, 'Off to On is legal after scoring and creates nothing');
  assert.equal(f.match.presses.length, 0);
  assert.equal(f.engine.validatePressEditContract({ ...f.match, selectedGames: proposed }, [{ ...proposed[0], pressesEnabled: false }], { isHost: true }).valid, true, 'On to Off is legal before use');

  f.match.selectedGames = proposed;
  f.match.pressConfig = proposed[0];
  const root = press(f.engine, f.match, { pressId: 'root', startingHole: 3 });
  const re1 = press(f.engine, f.match, { pressId: 're-1', parentGameId: 'root', pressDepth: 2, startingHole: 5 });
  const re2 = press(f.engine, f.match, { pressId: 're-2', parentGameId: 're-1', pressDepth: 3, startingHole: 7 });
  f.match.presses = [root, re1, re2];
  const cases = [
    { games: [{ ...proposed[0], pressesEnabled: false }], code: 'PRESS_DISABLE_BLOCKED_EXISTING_PRESS' },
    { games: [{ ...proposed[0], maxPressesPerRound: 2 }], code: 'MAX_PRESSES_BELOW_EXISTING_COUNT' },
    { games: [{ ...proposed[0], maxRePresses: 1 }], code: 'MAX_REPRESSES_BELOW_EXISTING_DEPTH' },
    { games: [], code: 'PRESS_SETTING_LOCKED_AFTER_PRESS' },
  ];
  cases.forEach(row => assert.ok(f.engine.validatePressEditContract(f.match, row.games, { isHost: true }).reasons.some(reason => reason.code === row.code), row.code));
  assert.equal(f.engine.validatePressEditContract(f.match, [{ ...proposed[0], maxPressesPerRound: 3, maxRePresses: 2 }], { isHost: true }).valid, true, 'limits may equal existing usage');
  assert.equal(f.engine.validatePressEditContract(f.match, [{ ...proposed[0], maxPressesPerRound: 7, maxRePresses: 4, pressType: 'PROMPT_AT_THRESHOLD', autoPressThreshold: 3 }], { isHost: true }).valid, true, 'future-only settings and limits may increase');
  assert.equal(JSON.stringify(f.match.presses), JSON.stringify([root, re1, re2]), 'validation never rewrites existing Presses');

  f.match.storageMode = 'shared'; f.match.sharedHostDeviceId = 'host';
  const joined = f.engine.validatePressEditContract(f.match, [{ ...proposed[0], maxPressesPerRound: 4, maxRePresses: 2 }], { isHost: false });
  assert.ok(joined.reasons.some(reason => reason.code === 'JOINED_DEVICE_NOT_AUTHORIZED'));
  assert.equal(f.engine.validatePressEditContract(f.match, [{ ...proposed[0], maxPressesPerRound: 4, maxRePresses: 2 }], { isHost: true }).valid, true);
  assert.equal(JSON.stringify(f.engine.normalizePressEditDraft(f.match, [{ ...proposed[0], pressesEnabled: false }], { isHost: true }).selectedGames), JSON.stringify(f.match.selectedGames), 'invalid normalized drafts preserve authoritative settings');
});

test('availability matrix covers Nassau lanes, standalone parents, ties, limits, future holes, and host authority', () => {
  const nassauGame = { key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', declaringSideRule: 'EITHER_SIDE', maxPressesPerRound: 5, maxRePresses: 1 };
  const front = seed(nassauGame, 5);
  for (const segment of ['FRONT', 'OVERALL']) assert.equal(front.engine.getPressEligibility(front.match, front.metrics, segment, { gameKey: 'nassau', pressConfig: nassauGame, currentPosition: 5, declaringSideId: '2', isHost: true }).reasonCode, 'ELIGIBLE');
  assert.equal(front.engine.getPressEligibility(front.match, front.metrics, 'BACK', { gameKey: 'nassau', pressConfig: nassauGame, currentPosition: 5, declaringSideId: '1', isHost: true }).nextStartingHole, 10);
  assert.equal(front.engine.getPressEligibility(front.match, front.metrics, 'FRONT', { gameKey: 'nassau', pressConfig: nassauGame, currentPosition: 9, declaringSideId: '2', isHost: true }).reasonCode, 'NO_FUTURE_HOLES');
  assert.equal(front.engine.getPressEligibility(front.match, front.metrics, 'OVERALL', { gameKey: 'nassau', pressConfig: nassauGame, currentPosition: 18, declaringSideId: '2', isHost: true }).reasonCode, 'NO_FUTURE_HOLES');
  assert.equal(front.engine.getPressEligibility(front.match, front.metrics, 'OVERALL', { gameKey: 'nassau', pressConfig: nassauGame, currentPosition: 5, declaringSideId: '2', isHost: false }).reasonCode, 'HOST_ONLY');

  const tied = seed({ ...nassauGame, declaringSideRule: 'LOSING_SIDE_ONLY' }, 5);
  tied.match.players.forEach(player => { player.scores = scores(5, 4); }); tied.metrics = tied.engine.computeMatchMetrics(tied.match);
  assert.equal(tied.engine.getPressEligibility(tied.match, tied.metrics, 'OVERALL', { gameKey: 'nassau', pressConfig: tied.match.selectedGames[0], currentPosition: 5, declaringSideId: '1', isHost: true }).reasonCode, 'DECLARING_SIDE_NOT_ALLOWED');
  const either = { ...tied.match.selectedGames[0], declaringSideRule: 'EITHER_SIDE' };
  assert.equal(tied.engine.getPressEligibility(tied.match, tied.metrics, 'OVERALL', { gameKey: 'nassau', pressConfig: either, currentPosition: 5, declaringSideId: '1', isHost: true }).reasonCode, 'ELIGIBLE');

  for (const key of ['team_match', 'singles_match']) {
    const standalone = seed({ key, basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', declaringSideRule: 'EITHER_SIDE', maxPressesPerRound: 2, maxRePresses: 0 }, 5);
    assert.equal(standalone.engine.getPressEligibility(standalone.match, standalone.metrics, 'OVERALL', { gameKey: key, pressConfig: standalone.match.selectedGames[0], currentPosition: 5, declaringSideId: '2', isHost: true }).reasonCode, 'ELIGIBLE');
  }
  const before = JSON.stringify(front.match.presses);
  const opportunities = front.engine.getCurrentPressOpportunities(front.match, front.metrics, { viewedPosition: 6, isHost: true });
  assert.ok(opportunities.length >= 2);
  assert.equal(JSON.stringify(front.match.presses), before, 'opening or rerendering the chooser creates nothing');
  assert.equal(JSON.stringify(front.engine.getCurrentPressOpportunities(front.match, front.metrics, { viewedPosition: 6, isHost: true }).map(row => row.opportunity?.key || `${row.gameKey}:${row.segment}`)), JSON.stringify(opportunities.map(row => row.opportunity?.key || `${row.gameKey}:${row.segment}`)));
});

test('Re-Press inherits the stored root wager after a mid-round base-game stake edit', () => {
  const f = seed(undefined, 5);
  const root = f.engine.buildPressRecordDraft(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', pressConfig: f.match.selectedGames[0], currentPosition: 2, declaringSideId: '2' });
  assert.equal(root.wagerAmount, 10);
  f.match.presses = [root];
  f.match.selectedGames[0].stake = 25;
  const child = f.engine.buildPressRecordDraft(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', parentPressId: root.pressId, pressConfig: f.match.selectedGames[0], currentPosition: 5, declaringSideId: '2' });
  assert.equal(child.wagerAmount, 10);
  assert.equal(root.wagerAmount, 10);
});

test('Press trees survive reload, authoritative merge, finish, reopen, refinish, and next-round reset exactly once', () => {
  const f = seed(undefined, 18);
  const root = press(f.engine, f.match, { pressId: 'root', startingHole: 3 });
  const child = press(f.engine, f.match, { pressId: 'child', parentGameId: 'root', pressDepth: 2, startingHole: 6 });
  f.match.presses = [root, child];
  const reloaded = JSON.parse(JSON.stringify(f.match));
  f.engine.normalizeMatch(reloaded);
  assert.equal(JSON.stringify(reloaded.presses.map(row => row.pressId)), JSON.stringify(['root', 'child']));
  reloaded.presses = f.engine.mergeAuthoritativePressRecords(reloaded.presses, [structuredClone(root), structuredClone(child)], {});
  assert.equal(reloaded.presses.length, 2);
  const completed = f.engine.buildFinishedMatchCandidate(reloaded, '2026-07-15T20:00:00.000Z').candidate;
  assert.equal(completed.roundRecordSnapshot.games.filter(game => game.type === 'press').length, 2);
  assert.equal(new Set(completed.roundRecordSnapshot.pressTransactions.map(row => row.transactionId)).size, completed.roundRecordSnapshot.pressTransactions.length);
  const firstFrozen = JSON.stringify(completed.roundRecordSnapshot);
  const firstTransactions = JSON.stringify(completed.roundRecordSnapshot.transactions);
  assert.equal(f.engine.markRoundReopenedForEditing(completed), true);
  assert.equal(completed.roundRecordSnapshotHistory.length, 1);
  assert.equal(JSON.stringify({ ...completed.roundRecordSnapshotHistory[0], supersededAt: undefined, supersededReason: undefined }), JSON.stringify({ ...JSON.parse(firstFrozen), supersededAt: undefined, supersededReason: undefined }));
  const refinished = f.engine.buildFinishedMatchCandidate(completed, '2026-07-15T21:00:00.000Z').candidate;
  assert.equal(refinished.roundRecordSnapshot.games.filter(game => game.type === 'press').length, 2);
  assert.equal(JSON.stringify(refinished.roundRecordSnapshot.transactions), firstTransactions);
  assert.equal(refinished.roundRecordSnapshotHistory.length, 1);
  const next = f.engine.buildNextRoundDraft(refinished);
  assert.equal(JSON.stringify(next.presses), '[]');
  assert.equal(next.roundRecordSnapshot, null);
});

test('completed Press Activity audit is frozen, concise, correct, idempotent, and settlement-neutral', () => {
  const f = seed(undefined, 18);
  f.match.presses = [
    press(f.engine, f.match, { pressId: 'root', startingHole: 3, declaredAtHole: 2 }),
    press(f.engine, f.match, { pressId: 'child', parentGameId: 'root', pressDepth: 2, startingHole: 6, declaredAtHole: 5 }),
  ];
  const completed = f.engine.buildFinishedMatchCandidate(f.match, '2026-07-15T20:00:00.000Z').candidate;
  const frozen = completed.roundRecordSnapshot;
  const before = JSON.stringify(frozen);
  const transactions = JSON.stringify(frozen.transactions);
  const audit = f.engine.buildPressAuditSection(completed, f.engine.computeMatchMetrics(completed), frozen);
  assert.match(audit, /Press Activity/);
  assert.match(audit, /Team Match Play Press/);
  assert.match(audit, /Team Match Play Re-Press/);
  assert.match(audit, /Hole 2/);
  assert.match(audit, /Original wager: \$10/);
  assert.match(audit, /Alpha won/);
  assert.equal((audit.match(/data-press-audit-id=/g) || []).length, 2);
  assert.equal(f.engine.buildPressAuditSection(completed, f.engine.computeMatchMetrics(completed), frozen), audit);
  assert.equal(JSON.stringify(frozen), before);
  assert.equal(JSON.stringify(frozen.transactions), transactions);
  const noPress = seed(undefined, 18);
  assert.equal(noPress.engine.buildPressAuditSection(noPress.match, noPress.metrics), '');
});

test('UI/save source locks, v30.3.74 icon references, cache paths, and branding docs are consistent', () => {
  assert.match(app, /PRESS_DISABLE_BLOCKED_EXISTING_PRESS/);
  assert.match(app, /data-press-edit-helper/);
  assert.match(app, /disabled aria-disabled="true"/);
  assert.match(app, /validatePressEditContract\(existing, selectedGames/);
  assert.equal((html.match(/rel="apple-touch-icon"/g) || []).length, 1);
  assert.match(html, /<img src="\.\/branding\/apple-touch-icon\.png" alt="The Dye Ledger"/);
  assert.match(html, /rel="apple-touch-icon"[^>]+href="\.\/branding\/apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /<img src="\.\/branding\/app-icon-192\.png" alt="The Dye Ledger"/);
  assert.match(worker, /branding\/apple-touch-icon\.png/);
  assert.match(worker, /the-dye-ledger-v30\.3\.74/);
  assert.match(branding, /Header \/ iPhone Home Screen[^\n]*`branding\/apple-touch-icon\.png`/);
  assert.match(branding, /Existing Home Screen icons may remain cached until the user removes and re-adds the app from Safari/);
  assert.equal(createHash('sha256').update(appleIcon).digest('hex'), '5cb89e80dc9037f063f6f4c0eab700c5154ee1625033d2ae4ec445618d090507');
});
