import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const players = [
  { id: 'p1', name: 'John', index: 0 }, { id: 'p2', name: 'John', index: 0 },
  { id: 'p3', name: 'Phil', index: 0 }, { id: 'p4', name: 'Steve', index: 0 },
];
const course = { id: 'press-course', name: 'Press Club', tees: [{ id: 'blue', teeName: 'Blue', rating: 72, slope: 113, par: 72, holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 })) }] };
const rows = values => Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, gross: values?.[index] ?? null }));
function buildMatch(overrides = {}) {
  const scores = overrides.scores || {};
  return { id: 'press-round', date: '2026-07-12', name: 'Press design', courseId: course.id, teeId: 'blue', holeCount: overrides.holeCount || 18, format: 'teams', allowance: 100, teamCount: 2, playersPerTeam: 2, teamNames: ['Alpha', 'Bravo'], status: 'active', selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 10 }], pressConfig: { pressesEnabled: true }, presses: [], players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, slot: index, teeId: 'blue', scores: rows(scores[player.id]) })), ...overrides };
}
function scoredThrough(count, { team1 = 4, team2 = 5, tie = false } = {}) {
  const make = value => Array.from({ length: count }, () => value);
  return { p1: make(team1), p2: make(team1), p3: make(tie ? team1 : team2), p4: make(tie ? team1 : team2) };
}
function seed(match = buildMatch()) {
  const engine = loadLiveEngine();
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [structuredClone(match)], activeMatchId: match.id });
  return { engine, match: state.matches[0], metrics: engine.computeMatchMetrics(state.matches[0]) };
}

test('press configuration and records normalize additively and survive reload', () => {
  const { engine } = seed();
  const defaults = engine.normalizePressConfig();
  assert.equal(defaults.pressesEnabled, false);
  assert.equal(defaults.maxPressesPerRootGame, 3);
  assert.equal(defaults.maxPressDepth, 1);
  assert.equal(defaults.pressValueRule, 'INHERIT_ROOT_STAKE');
  const invalid = engine.normalizePressConfig({ pressesEnabled: true, pressType: 'bad', pressAvailabilityRule: 'bad', maxPressesPerSegment: -4, pressAuthorityRule: 'ANYONE', autoPressThreshold: -1 });
  assert.equal(invalid.pressType, 'MANUAL');
  assert.equal(invalid.pressAvailabilityRule, 'OPEN_SEGMENT_ONLY');
  assert.equal(invalid.maxPressesPerSegment, 3);
  assert.equal(invalid.pressAuthorityRule, 'HOST_ONLY');
  const fixture = seed(buildMatch({ pressConfig: { pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', maxPressesPerSegment: 99 }, presses: [{ pressId: 'press-1', parentGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 7, endingHole: 9 }] }));
  assert.equal(fixture.match.pressConfig.maxPressesPerSegment, 10);
  const reloaded = seed(JSON.parse(JSON.stringify(fixture.match)));
  assert.equal(JSON.stringify(reloaded.match.pressConfig), JSON.stringify(fixture.match.pressConfig));
  assert.equal(reloaded.match.presses[0].pressId, 'press-1');
  assert.equal(reloaded.match.presses[0].status, 'PENDING');
});

test('press eligibility locks availability, authority, limits, wager, and starting-hole rules', () => {
  const open = seed(buildMatch({ scores: scoredThrough(6, { tie: true }) }));
  const eligible = open.engine.getPressEligibility(open.match, open.metrics, 'FRONT');
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.nextStartingHole, 7);
  assert.equal(eligible.remainingEligibleHoles, 3);
  assert.equal(open.engine.buildPressRecordDraft(open.match, open.metrics, 'FRONT').endingHole, 9);
  assert.equal(open.engine.getPressEligibility({ ...open.match, pressConfig: { pressesEnabled: false } }, open.metrics, 'FRONT').reasonCode, 'PRESSES_DISABLED');
  assert.equal(open.engine.getPressEligibility({ ...open.match, selectedGames: [] }, open.metrics, 'FRONT').reasonCode, 'INVALID_PARENT_GAME');
  assert.equal(open.engine.getPressEligibility(open.match, open.metrics, 'FRONT', { isHost: false }).reasonCode, 'HOST_ONLY');

  const clinched = seed(buildMatch({ scores: scoredThrough(6) }));
  assert.equal(clinched.engine.getPressEligibility(clinched.match, clinched.metrics, 'FRONT').reasonCode, 'PARENT_SEGMENT_DECIDED');
  clinched.match.pressConfig.pressAvailabilityRule = 'FUTURE_HOLES_REMAIN';
  assert.equal(clinched.engine.getPressEligibility(clinched.match, clinched.metrics, 'FRONT').eligible, true);

  const finalHole = seed(buildMatch({ scores: scoredThrough(8, { tie: true }) }));
  assert.equal(finalHole.engine.getPressEligibility(finalHole.match, finalHole.metrics, 'FRONT').nextStartingHole, 9);
  const noFuture = seed(buildMatch({ scores: scoredThrough(9, { tie: true }) }));
  assert.equal(noFuture.engine.getPressEligibility(noFuture.match, noFuture.metrics, 'FRONT').reasonCode, 'NO_FUTURE_HOLES');
  const back = seed(buildMatch({ scores: scoredThrough(10, { tie: true }) }));
  assert.equal(back.engine.getPressEligibility(back.match, back.metrics, 'BACK').nextStartingHole, 11);
  assert.equal(back.engine.getPressEligibility(back.match, back.metrics, 'OVERALL').nextStartingHole, 11);

  const duplicateRecord = open.engine.buildPressRecordDraft(open.match, open.metrics, 'FRONT');
  open.match.presses = [duplicateRecord];
  assert.equal(open.engine.getPressEligibility(open.match, open.metrics, 'FRONT').reasonCode, 'DUPLICATE_STARTING_HOLE');
  open.match.presses = [duplicateRecord, { ...duplicateRecord, pressId: 'two', startingHole: 8 }, { ...duplicateRecord, pressId: 'three', startingHole: 9 }];
  assert.equal(open.engine.getPressEligibility(open.match, open.metrics, 'FRONT').reasonCode, 'PRESS_LIMIT_REACHED');

  const zero = seed(buildMatch({ selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 0, stakesBack: 5, stakesOverall: 5 }], scores: scoredThrough(6, { tie: true }) }));
  assert.equal(zero.engine.getPressEligibility(zero.match, zero.metrics, 'FRONT').reasonCode, 'ZERO_PARENT_WAGER');
  const reopened = seed(buildMatch({ previousCompletedAt: '2026-07-12T20:00:00Z', scores: scoredThrough(6, { tie: true }) }));
  assert.equal(reopened.engine.getPressEligibility(reopened.match, reopened.metrics, 'FRONT').reasonCode, 'ROUND_REOPENED');
  const ended = seed(buildMatch({ roundEndReason: 'weather', scores: scoredThrough(6, { tie: true }) }));
  assert.equal(ended.engine.getPressEligibility(ended.match, ended.metrics, 'FRONT').reasonCode, 'ROUND_ENDED_EARLY');
  const settled = seed(buildMatch({ status: 'complete', completedAt: '2026-07-12T20:00:00Z', scores: scoredThrough(6, { tie: true }) }));
  assert.equal(settled.engine.getPressEligibility(settled.match, settled.metrics, 'FRONT').reasonCode, 'ROUND_SETTLED');
});

test('shortened rounds and both-basis Nassau produce deterministic parent contracts', () => {
  const short = seed(buildMatch({ holeCount: 9, scores: scoredThrough(6, { tie: true }) }));
  assert.equal(short.engine.getPressEligibility(short.match, short.metrics, 'BACK').reasonCode, 'INVALID_SEGMENT');
  const both = seed(buildMatch({ selectedGames: [{ key: 'nassau', basis: 'both', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }], scores: scoredThrough(6, { tie: true }) }));
  assert.equal(both.engine.getPressEligibility(both.match, both.metrics, 'FRONT').reasonCode, 'BASIS_REQUIRED');
  assert.equal(both.engine.getPressEligibility(both.match, both.metrics, 'FRONT', { scoringMode: 'gross' }).parentGameId, 'nassau_gross');
});

test('press lifecycle covers pending, active, final, halved, incomplete, voided, and superseded', () => {
  const base = seed(buildMatch({ scores: scoredThrough(6, { tie: true }) }));
  const press = base.engine.buildPressRecordDraft(base.match, base.metrics, 'FRONT');
  assert.equal(base.engine.getPressStatus(base.match, base.metrics, press).status, 'PENDING');
  const active = seed(buildMatch({ scores: scoredThrough(7, { tie: true }) }));
  assert.equal(active.engine.getPressStatus(active.match, active.metrics, press).status, 'ACTIVE');
  const final = seed(buildMatch({ scores: scoredThrough(8) }));
  assert.equal(final.engine.getPressStatus(final.match, final.metrics, press).status, 'FINAL');
  const halved = seed(buildMatch({ scores: scoredThrough(9, { tie: true }) }));
  assert.equal(halved.engine.getPressStatus(halved.match, halved.metrics, press).status, 'HALVED');
  const incomplete = seed(buildMatch({ status: 'complete', completedAt: '2026-07-12T20:00:00Z', scores: scoredThrough(7, { tie: true }) }));
  assert.equal(incomplete.engine.getPressStatus(incomplete.match, incomplete.metrics, press).status, 'INCOMPLETE');
  assert.equal(base.engine.getPressStatus(base.match, base.metrics, { ...press, status: 'VOIDED' }).status, 'VOIDED');
  assert.equal(base.engine.getPressStatus(base.match, base.metrics, { ...press, status: 'SUPERSEDED' }).status, 'SUPERSEDED');
});

test('settlement shape inherits parent identity and enters production totals exactly once', () => {
  const fixture = seed(buildMatch({ scores: scoredThrough(9) }));
  const press = fixture.engine.normalizePressRecord({ pressId: 'stable-press', parentGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 7, endingHole: 9, wagerAmount: 5, scoringMode: 'net', status: 'ACTIVE' }, fixture.match);
  const before = JSON.stringify({ match: fixture.match, metrics: fixture.metrics });
  const shape = fixture.engine.buildPressSettlementShape(fixture.match, fixture.metrics, press);
  assert.equal(shape.status, 'FINAL');
  assert.equal(shape.wagerAmount, 5);
  assert.equal(shape.parentSegmentId, 'nassau_net:front');
  assert.equal(shape.crossFoot, 0);
  assert.ok(shape.transactions.length > 0);
  assert.equal(new Set(shape.transactions.map(row => row.transactionId)).size, shape.transactions.length);
  assert.ok(shape.transactions.every(row => row.pressId === 'stable-press' && row.payerId.startsWith('p') && row.payeeId.startsWith('p')));
  assert.equal(JSON.stringify({ match: fixture.match, metrics: fixture.metrics }), before);
  const production = fixture.engine.getPayoutReportContext(fixture.match, fixture.metrics);
  fixture.match.presses = [press, structuredClone(press)];
  const withPress = fixture.engine.getPayoutReportContext(fixture.match, fixture.metrics);
  assert.equal(withPress.payoutGames.filter(game => game.key === 'press:stable-press').length, 1);
});

test('press preparation preserves frozen RoundRecords and report viewing remains non-mutating', () => {
  const fixture = seed(buildMatch({ scores: scoredThrough(18), status: 'complete', completedAt: '2026-07-12T20:00:00Z' }));
  fixture.engine.freezeRoundRecordIfEligible(fixture.match, fixture.metrics);
  const before = JSON.stringify(fixture.match.roundRecordSnapshot);
  fixture.match.pressConfig = fixture.engine.normalizePressConfig({ pressesEnabled: true });
  fixture.engine.buildSummaryExportBody(fixture.match, fixture.metrics);
  assert.equal(JSON.stringify(fixture.match.roundRecordSnapshot), before);
  const legacy = seed(buildMatch({ pressConfig: undefined, presses: undefined }));
  assert.equal(legacy.match.pressConfig.pressesEnabled, false);
  assert.deepEqual(Array.from(legacy.match.presses), []);
});

test('Quick Scoreboard presents base Nassau components before nested presses and factual disclosures', () => {
  const fixture = seed(buildMatch({ scores: scoredThrough(9), selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 10, pressesEnabled: true }], presses: [{ pressId: 'front-press', parentGameId: 'nassau_net', rootGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 8, endingHole: 9, declaredForHole: 8, initiatedByTeamId: '2', wagerAmount: 5, scoringMode: 'net', status: 'FINAL' }] }));
  const hierarchy = fixture.engine.buildQuickNassauResults(fixture.match, fixture.metrics);
  assert.match(hierarchy, /data-nassau-component="front"/);
  assert.match(hierarchy, /data-nassau-component="back"/);
  assert.match(hierarchy, /data-nassau-component="overall"/);
  assert.match(hierarchy, /data-press-parent="FRONT"/);
  assert.ok(hierarchy.indexOf('data-nassau-component="front"') < hierarchy.indexOf('data-press-parent="FRONT"'));
  const html = fixture.engine.buildQuickScoreboardView(fixture.match, fixture.metrics);
  assert.ok(html.indexOf('Final Settlement') < html.indexOf('Game Summary'));
  assert.ok(html.indexOf('Game Summary') < html.indexOf('Player Score Summary'));
  assert.ok(html.indexOf('Player Score Summary') < html.indexOf('Classic Scorecard'));
  assert.ok(html.indexOf('Classic Scorecard') < html.indexOf('Momentum Charts'));
  assert.match(html, /<details[^>]*quick-classic-scorecard/);
  assert.doesNotMatch(html, /quick-classic-scorecard[^>]*open/);
});

test('Quick settlement uses lifecycle grammar and correct singular/plural reconciliation copy', () => {
  const fixture = seed(buildMatch({ scores: scoredThrough(2) }));
  const singular = fixture.engine.buildQuickSettlementHero(fixture.match, fixture.metrics, { finalTotals: { p1: 10, p3: -10 } });
  assert.match(singular, /Provisional Settlement/);
  assert.match(singular, /Phil<\/strong> would pay <strong>John/);
  assert.match(singular, /\$10/);
  assert.match(singular, /Based on scores currently entered/);
  fixture.match.status = 'complete'; fixture.match.completedAt = '2026-07-12T20:00:00Z';
  const plural = fixture.engine.buildQuickSettlementHero(fixture.match, fixture.metrics, { finalTotals: { p1: 10.5, p2: 4, p3: -10.5, p4: -4 } });
  assert.match(plural, /Final Settlement/);
  assert.match(plural, / pays /);
  assert.match(plural, /2 payments · All games reconciled/);
  assert.match(plural, /\$10\.50/);
});

test('Nassau momentum renders visible signed point labels and an explicit orientation', () => {
  const leading = seed(buildMatch({ scores: scoredThrough(3) }));
  const chart = leading.engine.renderMomentumChart(leading.match, leading.metrics, 'nassau_front', { compact: true });
  assert.match(chart, /Positive = .* ahead/);
  assert.match(chart, /data-momentum-value="1">\+1</);
  assert.match(chart, /data-momentum-value="2">\+2</);
  const tied = seed(buildMatch({ scores: scoredThrough(2, { tie: true }) }));
  assert.match(tied.engine.renderMomentumChart(tied.match, tied.metrics, 'nassau_front', { compact: true }), /data-momentum-value="0">E</);
});

