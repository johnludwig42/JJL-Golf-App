import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const players = [
  { id: 'p1', name: 'Alex', index: 0 },
  { id: 'p2', name: 'Blake', index: 2 },
  { id: 'p3', name: 'Casey', index: 4 },
  { id: 'p4', name: 'Drew', index: 6 },
];
const course = { id: 'report-course', name: 'Analyst Club', tees: [{ id: 'blue', teeName: 'Blue', rating: 72, slope: 125, par: 72, holes: Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: [4, 4, 3, 5][idx % 4], strokeIndex: idx + 1, yardage: 360 + idx * 4 })) }] };
const scoreRows = (values = []) => Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, gross: values[idx] ?? null }));

function buildMatch({ id = 'report', selectedGames = [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }], scores = {}, inputs = {}, order = [], weather = null, timing = null, status = 'active', playerCount = 4, recap = '' } = {}) {
  return {
    id, date: '2026-07-12', name: 'Report Fixture', courseId: course.id, teeId: 'blue', format: 'teams', allowance: 100, holeCount: 18,
    teamCount: playerCount === 2 ? 2 : 2, playersPerTeam: playerCount === 2 ? 1 : 2, teamNames: ['Alpha', 'Bravo'], selectedGames, status,
    players: players.slice(0, playerCount).map((player, idx) => ({ playerId: player.id, team: playerCount === 2 ? idx + 1 : idx < 2 ? 1 : 2, slot: idx, teeId: 'blue', scores: scoreRows(scores[player.id]) })),
    sneakySandyPoleyInputs: inputs, playedHoleOrder: order, roundContext: weather ? { weather } : {}, roundTiming: timing || { startedAt: null, endedAt: null }, roundRecapFinal: recap,
  };
}

function render(match) {
  const engine = loadLiveEngine();
  const seed = JSON.parse(JSON.stringify({ players, courses: [course], matches: [match], activeMatchId: match.id }));
  const state = engine.seedState(seed);
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  const record = engine.buildRoundRecord(live, metrics);
  return { engine, match: live, metrics, record, html: engine.buildSummaryExportBody(live, metrics), snapshot: engine.buildRoundSnapshot(live, metrics, record) };
}

test('RoundRecord fixtures preserve three-layer order, structured settlement, and legacy safety', () => {
  const partial = { p1: [4, 4, 3], p2: [4, 5, 3], p3: [5, 5, 4], p4: [5, 4, 4] };
  const complete = Object.fromEntries(players.map((player, pIdx) => [player.id, Array.from({ length: 18 }, (_, idx) => 3 + ((idx + pIdx) % 3))]));
  const fixtures = [
    buildMatch({ id: 'non-ssp-incomplete', scores: partial }),
    buildMatch({ id: 'non-ssp-complete', scores: complete, status: 'complete', timing: { startedAt: '2026-07-12T13:00:00Z', endedAt: '2026-07-12T17:07:00Z' } }),
    buildMatch({ id: 'two-player', playerCount: 2, scores: { p1: [4, 4, 3], p2: [5, 4, 4] } }),
    buildMatch({ id: 'legacy', scores: partial, timing: undefined }),
    buildMatch({ id: 'all-square', scores: { p1: [4, 4], p2: [4, 4], p3: [4, 4], p4: [4, 4] } }),
  ];
  fixtures.forEach(fixture => {
    const { html, record } = render(fixture);
    const order = ['The Dye Ledger', 'Round Story', 'AI Round Recap', 'Round Analytics', 'Settlement', 'Game Drivers', 'Ledger / Audit Detail', 'Classic scorecard', 'Leaderboards'];
    order.forEach(label => assert.match(html, new RegExp(label)));
    order.slice(1).forEach((label, idx) => assert.ok(html.indexOf(label) > html.indexOf(order[idx]), `${fixture.id}: ${label} order`));
    assert.match(html, /data-report-section-type="main"/);
    assert.match(html, /data-report-section-type="appendix"/);
    assert.match(html, /Gross score shown above Course Net/);
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.meta.tripId, null);
    assert.equal(record.players.length, fixture.players.length);
    assert.equal(record.settlement.crossFoot, 0);
    assert.deepEqual(record.transactions, record.settlement.payments);
    assert.doesNotThrow(() => JSON.stringify(record));
  });
});

test('SSP pending and momentum-flip fixtures render the correct featured exhibit', () => {
  const selectedGames = [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }, { key: 'sneaky_sandy_poley', pointValue: 1 }];
  const pending = render(buildMatch({ id: 'ssp-pending', selectedGames }));
  assert.match(pending.html, /SSP selected — momentum pending/);
  assert.doesNotMatch(pending.html, /SSP Hole-by-Hole Audit/);
  const scores = { p1: [4, 3, 6], p2: [4, 4, 6], p3: [4, 6, 3], p4: [4, 6, 3] };
  const valid = render(buildMatch({ id: 'ssp-flip', selectedGames, scores, inputs: { 2: { players: { p1: { sneaky: true } } }, 3: { players: { p3: { sneaky: true }, p4: { sandy: true } } } } }));
  assert.match(valid.html, /SSP Momentum/);
  assert.match(valid.html, /<polyline[^>]*fill="none"/);
  assert.match(valid.html, /Primary swing:/);
  assert.ok(valid.html.indexOf('Ledger / Audit Detail') < valid.html.indexOf('SSP Hole-by-Hole Audit'));
});

test('weather, out-of-sequence, legacy, and recap fixtures stay truthful and compact', () => {
  const scores = { p1: [4, null, 3, null, 5], p2: [4, null, 3, null, 5], p3: [5, null, 4, null, 6], p4: [5, null, 4, null, 6] };
  const weather = render(buildMatch({ id: 'weather', scores, order: [1, 3, 5], weather: { temperature: 72, windSpeed: 12, windDirection: 225, conditionsText: 'partly cloudy' }, recap: 'A concise supported recap.' }));
  assert.deepEqual(weather.record.notes.weather, weather.match.roundContext.weather);
  assert.deepEqual(Array.from(weather.record.meta.completedHoleNumbers), [1, 3, 5]);
  assert.doesNotMatch(weather.snapshot, /through Hole 5/i);
  assert.match(weather.html, /AI Round Recap/);
  assert.match(weather.html, /Accepted recap/);
  assert.match(weather.html, /A concise supported recap/);
  const malformed = render(buildMatch({ id: 'bad-weather', scores, weather: { nonsense: true } }));
  assert.doesNotMatch(malformed.snapshot, /<span>Weather<\/span>/);
  assert.doesNotThrow(() => malformed.engine.buildSummaryExportBody(malformed.match, malformed.metrics));
});

test('short SSP RoundRecord suppresses invalid timing, awards, distribution, and generic narrative', () => {
  const selectedGames = [{ key: 'sneaky_sandy_poley', pointValue: 1, allowBridgeRebridge: true }];
  const scores = { p1: [4, 3, 7], p2: [4, 4, 7], p3: [4, 6, 3], p4: [4, 6, 3] };
  const inputs = { 2: { bridge: true, players: { p1: { sandy: true, poley: true }, p2: { sandy: true, poley: true } } }, 3: { rebridge: true, players: { p3: { sneaky: true, poley: true }, p4: { sandy: true } } } };
  const fixture = buildMatch({ id: 'plum-creek-three', selectedGames, scores, inputs, timing: { startedAt: '2026-07-12T13:00:00Z', endedAt: '2026-07-12T13:04:00Z' }, status: 'complete' });
  fixture.roundEndReason = 'other';
  const { html, record, engine, match, metrics } = render(fixture);
  assert.equal(record.meta.timing.valid, false);
  assert.equal(engine.getRoundElapsedTimeState(match, metrics).available, false);
  assert.equal(record.events.filter(event => event.type === 'multiplier').length, 2);
  assert.equal(record.events.find(event => ['lead_change', 'swing', 'multiplier'].includes(event.type))?.holeNumber, 3);
  assert.equal(record.events.find(event => event.type === 'swing' && event.holeNumber === 3)?.magnitude, 40);
  assert.equal(record.transactions.length, 2);
  assert.equal(record.events.find(event => event.type === 'final_margin')?.magnitude, 20);
  assert.match(html, /Turning Point · H3/);
  assert.match(html, /Course HCP/);
  assert.doesNotMatch(html, /· CH\s/);
  assert.match(html, /Generated from scoring, games, settlement, and round events/);
  assert.doesNotMatch(html, /Round Time 4m/);
  assert.doesNotMatch(html, /Leaders & Awards/);
  assert.doesNotMatch(html, /Score Distribution/);
  assert.doesNotMatch(html, /Round ended due to another reason/);
  ['left room for improvement', 'look to build', 'effective handicap management', 'faced challenges'].forEach(phrase => assert.doesNotMatch(html, new RegExp(phrase, 'i')));
});

test('Round Story uses singular grammar and does not duplicate the Hero driver sentence', () => {
  const engine = loadLiveEngine();
  const record = {
    meta: { status: 'provisional', holesCompleted: 3, holesPlanned: 18 },
    players: [{ playerId: 'p1', displayName: 'Tom' }, { playerId: 'p2', displayName: 'Steve' }],
    settlement: { netPositions: { p1: 13, p2: -13 } },
    transactions: [{ payerId: 'p2', payeeId: 'p1', amount: 13 }],
    events: [
      { type: 'payout_driver', description: 'Nassau moved $10 to Steve', salience: 50 },
      { type: 'signature_score', playerId: 'p1', holeNumber: 3, description: 'Birdie', salience: 35 },
    ],
  };
  const story = engine.buildRoundRecordStory(record);
  assert.match(story.dek, /Tom leads, \+\$13\.00 provisional/);
  assert.equal((story.narrative.match(/Nassau moved \$10 to Steve/g) || []).length, 1);
  assert.ok(story.narrative.split(/(?<=[.!?])\s+/).length >= 2);
});

test('settlement presentation groups winners and owers and preserves blank Handicap totals', () => {
  const scores = { p1: [4, 4, 3], p2: [4, 4, 3], p3: [6, 6, 5], p4: [6, 6, 5] };
  const { html } = render(buildMatch({ id: 'settlement', scores }));
  assert.match(html, /settlement-balance-title">Winners/);
  assert.match(html, /settlement-balance-title">Owers/);
  assert.match(html, /Settle Up/);
  assert.match(html, /Cross-foot:/);
  const handicapRow = html.match(/<tr><td[^>]*><strong>Handicap<\/strong>[\s\S]*?<\/tr>/)?.[0] || '';
  assert.equal((handicapRow.match(/<strong>—<\/strong>/g) || []).length, 3);
});
