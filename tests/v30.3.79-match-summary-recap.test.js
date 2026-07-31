import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fixture(recap = {}) {
  const players = [{ id: 'a', name: 'Alex', index: 0 }, { id: 'b', name: 'Blake', index: 0 }];
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: [4, 3, 5][index % 3], strokeIndex: index + 1, yardage: 340 + index * 15 }));
  const course = { id: 'c', name: 'Recap Club', tees: [{ id: 't', teeName: 'Member', rating: 36, slope: 113, par: 36, holes }] };
  const match = {
    id: 'legacy-round-79', name: 'Friday Match', date: '2026-07-31', courseId: 'c', teeId: 't', holeCount: 9,
    status: 'complete', completedAt: '2026-07-31T18:00:00.000Z', format: 'singles', allowance: 100,
    teamCount: 2, playersPerTeam: 1, selectedGames: [{ key: 'match_play', basis: 'net', stake: 5 }],
    players: players.map((player, p) => ({ playerId: player.id, team: p + 1, teeId: 't', scores: holes.map((hole, h) => ({ holeNumber: h + 1, gross: hole.par + (p && h === 8 ? 1 : 0) })) })),
    memories: [{ id: 'memory-1', holeNumber: 7, createdByName: 'Alex', category: 'Shot', text: 'Alex nearly holed the bunker shot.' }],
    unknownFutureField: { preserve: true },
    ...recap,
  };
  const engine = loadLiveEngine();
  const state = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  return { engine, live, metrics: engine.computeMatchMetrics(live) };
}

test('v30.3.79 release identity and immutable PWA assets are consistent', () => {
  assert.equal(pkg.version, '30.3.79');
  assert.equal(manifest.version, 'v30.3.79');
  assert.match(app, /versionNumber:\s*'30\.3\.79'/);
  assert.match(worker, /cacheName:\s*'the-dye-ledger-v30\.3\.79'/);
  ['app-icon-192-v30.3.79.png', 'app-icon-512-v30.3.79.png', 'apple-touch-icon-v30.3.79.png', 'favicon-32-v30.3.79.png', 'favicon-16-v30.3.79.png']
    .forEach(name => assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true));
});

test('Match Summary presents accepted AI recap in the main narrative hierarchy', () => {
  const { engine, live, metrics } = fixture({ roundRecapFinal: 'Alex won a close Friday match.' });
  const before = JSON.stringify(live);
  const summary = engine.buildSummaryExportBody(live, metrics);
  assert.match(summary, /AI Round Recap/);
  assert.match(summary, /Accepted recap/);
  assert.match(summary, /Alex won a close Friday match/);
  assert.match(summary, /Alex nearly holed the bunker shot/);
  assert.ok(summary.indexOf('Round Story') < summary.indexOf('AI Round Recap'));
  assert.ok(summary.indexOf('AI Round Recap') < summary.indexOf('Round Analytics'));
  assert.ok(summary.indexOf('Round Analytics') < summary.indexOf('Final Net Settlement'));
  assert.equal(JSON.stringify(live), before);
});

test('draft and absent AI recaps are labeled truthfully without hiding the rest of the summary', () => {
  const draftFixture = fixture({ roundRecapGenerated: 'A draft account of the match.' });
  const draft = draftFixture.engine.buildSummaryExportBody(draftFixture.live, draftFixture.metrics);
  assert.match(draft, /Draft recap/);
  assert.match(draft, /A draft account of the match/);
  const emptyFixture = fixture();
  const empty = emptyFixture.engine.buildSummaryExportBody(emptyFixture.live, emptyFixture.metrics);
  assert.match(empty, /No AI recap has been generated/);
  assert.match(empty, /Generate and review an AI recap/);
  assert.match(empty, /Final Net Settlement/);
});

test('summary generation and late recap presentation do not mutate frozen or legacy local records', () => {
  const { engine, live, metrics } = fixture();
  live.roundRecordSnapshot = engine.buildFrozenRoundRecord(live, metrics, '2026-07-31T18:01:00.000Z');
  const frozenBefore = JSON.stringify(live.roundRecordSnapshot);
  const legacyBefore = JSON.stringify({ players: live.players, memories: live.memories, unknownFutureField: live.unknownFutureField });
  live.roundRecapFinal = 'Accepted after the RoundRecord was frozen.';
  const summary = engine.buildSummaryExportBody(live, metrics);
  assert.match(summary, /Accepted after the RoundRecord was frozen/);
  assert.equal(JSON.stringify(live.roundRecordSnapshot), frozenBefore);
  assert.equal(JSON.stringify({ players: live.players, memories: live.memories, unknownFutureField: live.unknownFutureField }), legacyBefore);
});

test('new RoundRecords add recap attribution fields without changing score or settlement facts', () => {
  const { engine, live, metrics } = fixture({ roundRecapFinal: 'Accepted recap artifact.' });
  const record = engine.buildRoundRecord(live, metrics);
  assert.match(record.notes.aiRecap, /^Accepted recap artifact\./);
  assert.match(record.notes.aiRecap, /Alex nearly holed the bunker shot/);
  assert.equal(record.notes.aiRecapStatus, 'accepted');
  assert.equal(record.players.length, 2);
  assert.equal(record.holes.length, 9);
  assert.equal(record.meta.roundId, 'legacy-round-79');
});
