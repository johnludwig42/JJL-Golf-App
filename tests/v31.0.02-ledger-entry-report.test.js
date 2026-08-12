import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../ledger-report/shell.html', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');

function fixture({ complete = true, presses = true } = {}) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: [4, 4, 3, 5][i % 4], strokeIndex: i + 1, yardage: 350 + i * 7 }));
  const course = { id: 'ledger-course', name: 'Ledger Club', tees: [{ id: 'ledger-tee', teeName: 'Ledger', rating: 72, slope: 125, par: 72, holes }] };
  const players = [
    { id: 'p1', name: 'Alex Ledger', index: 4 }, { id: 'p2', name: 'Blake Ledger', index: 9 },
    { id: 'p3', name: 'Casey Ledger', index: 13 }, { id: 'p4', name: 'Drew Ledger', index: 18 },
  ];
  const scored = complete ? 18 : 12;
  const match = {
    id: complete ? 'ledger-final' : 'ledger-provisional', name: 'Ledger Entry Fixture', date: '2026-08-11',
    courseId: course.id, teeId: 'ledger-tee', holeCount: 18, status: complete ? 'complete' : 'active',
    format: 'teams', teamCount: 2, playersPerTeam: 2, teamNames: ['North', 'South'], allowance: 100,
    selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 2, handicapAllowanceMode: 'recommended', handicapAllowancePercent: 85, stakesFront: 5, stakesBack: 5, stakesOverall: 10, pressesEnabled: presses }],
    players: players.map((player, playerIndex) => ({ playerId: player.id, team: playerIndex < 2 ? 1 : 2, teeId: 'ledger-tee', scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: holeIndex < scored ? hole.par + ((holeIndex + playerIndex) % 3 === 0 ? 1 : 0) : null })) })),
    memories: [{ id: 'memory-1', holeNumber: 7, text: 'A long birdie putt turned the match.' }],
    roundContext: { weather: { conditionsText: 'Clear', temperature: 74, humidity: 52, windSpeed: 8, windDirection: 225 } },
    roundRecapFinal: 'North and South traded momentum before the closing stretch decided the result.',
    presses: presses ? [{ pressId: 'press-1', parentGameId: 'nassau_net', rootGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 6, endingHole: 9, declaredForHole: 6, initiatedByTeamId: '2', wagerAmount: 5, scoringMode: 'net', status: complete ? 'FINAL' : 'ACTIVE', outcomeGameKey: 'nassau' }] : [],
  };
  const state = engine.seedState({ courses: [course], players, matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  const html = engine.buildUnifiedExportDocument(live, metrics, 'ledger');
  return { engine, match: live, metrics, html, record: engine.buildRoundRecord(live, metrics) };
}

test('Ledger Entry v31.0.02 satisfies the 61-assertion non-browser contract', () => {
  const final = fixture();
  const provisional = fixture({ complete: false });
  const checks = [
    ['Ledger title', final.html.includes('Ledger Entry')],
    ['contract version', final.html.includes('data-ledger-entry-version="1"')],
    ['final state', final.html.includes('data-ledger-status="FINAL"')],
    ['provisional state', provisional.html.includes('data-ledger-status="PROVISIONAL"')],
    ['Result subject', final.html.includes('data-ledger-page-subject="Result"')],
    ['Round Story subject', final.html.includes('data-ledger-page-subject="Round Story"')],
    ['Leaderboards subject', final.html.includes('data-ledger-page-subject="Leaderboards"')],
    ['Games subject', final.html.includes('data-ledger-page-subject="Games"')],
    ['Statistics subject', final.html.includes('data-ledger-page-subject="Statistics"')],
    ['Appendix subject', final.html.includes('data-ledger-page-subject="Appendix"')],
    ['subject order 1', final.html.indexOf('Result') < final.html.indexOf('Round Story')],
    ['subject order 2', final.html.indexOf('Round Story') < final.html.indexOf('Leaderboards')],
    ['subject order 3', final.html.indexOf('Leaderboards') < final.html.indexOf('data-ledger-page-subject="Games"')],
    ['subject order 4', final.html.indexOf('data-ledger-page-subject="Games"') < final.html.indexOf('data-ledger-page-subject="Statistics"')],
    ['subject order 5', final.html.indexOf('data-ledger-page-subject="Statistics"') < final.html.indexOf('data-ledger-page-subject="Appendix"')],
    ['gross basis', final.html.includes('>Gross</th>')],
    ['full CH basis', final.html.includes('Full CH')],
    ['100 off low basis', final.html.includes('100% Off Low')],
    ['85 off low basis', final.html.includes('85% off the low')],
    ['Course Net scorecard', final.html.includes('Course Net')],
    ['Match Net scorecard', final.html.includes('Match Net')],
    ['settlement dollars', final.html.includes('data-ledger-unit="dollars"')],
    ['settlement present', final.html.includes('<h2>Settlement</h2>')],
    ['games present', final.html.includes('<h2>Games</h2>')],
    ['statistics present', final.html.includes('<h2>Player Statistics</h2>')],
    ['leaderboard present', final.html.includes('<h2>Player Leaderboard</h2>')],
    ['scorecard present', final.html.includes('Classic Scorecard')],
    ['Ledger Story present', renderer.includes('The Story of the Round') && final.html.includes('ledger-entry-recap')],
    ['recap provenance', final.html.includes('data-ledger-provenance="generated-narrative"')],
    ['memory present', final.html.includes('A long birdie putt turned the match.')],
    ['weather present', final.html.includes('74') && final.html.includes('52% humidity')],
    ['press section', final.html.includes('Press Activity')],
    ['press id', final.html.includes('data-press-audit-id="press-1"')],
    ['press separate section', final.html.includes('export-section-press-audit')],
    ['press wager', final.html.includes('Original wager')],
    ['press range', final.html.includes('Holes 6')],
    ['no email', !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(final.html)],
    ['no phone label', !final.html.includes('Phone')],
    ['no GHIN label', !final.html.includes('GHIN')],
    ['no device IDs', !final.html.includes('deviceId')],
    ['no install IDs', !final.html.includes('installId')],
    ['no access token', !final.html.includes('access_token')],
    ['no refresh token', !final.html.includes('refresh_token')],
    ['no diagnostic payload', !final.html.includes('Recent App Errors')],
    ['record memories', final.record.notes.memories.length === 1],
    ['record weather', final.record.notes.weather.temperature === 74],
    ['record recap', final.record.notes.aiRecap.includes('North and South')],
    ['record provenance', final.record.notes.recapProvenance === 'generated-narrative'],
    ['record serializable', (() => { try { JSON.stringify(final.record); return true; } catch { return false; } })()],
    ['provisional does not award final', !provisional.html.includes('data-ledger-status="FINAL"')],
    ['provisional badge', provisional.html.includes('PROVISIONAL')],
    ['default option first', index.indexOf('value="ledger"') < index.indexOf('value="summary"')],
    ['default option selected', /option value="ledger" selected/.test(index)],
    ['recommended label', index.includes('Ledger Entry (Recommended)')],
    ['summary preserved', index.includes('value="summary">Match Summary')],
    ['scorecard preserved', index.includes('value="scorecard">Classic Scorecard')],
    ['default function ledger', source.includes("printView = 'ledger'")],
    ['valid view list', source.includes("['ledger', 'summary', 'scorecard']")],
    ['no recap toggle', !index.includes('ledgerRecapToggle')],
    ['report is read only', !source.includes('saveLedgerEntry')],
    ['dedicated renderer route', source.includes('ledger-report/shell.html')],
  ];
  checks.forEach(([label, condition]) => assert.ok(condition, label));
  assert.equal(checks.length, 61);
});

test('dedicated Ledger Entry adapter maps existing authoritative facts without changing the round', () => {
  const final = fixture();
  const before = JSON.stringify(final.match);
  const model = final.engine.buildLedgerEntryReportModel(final.match, final.metrics);
  assert.ok(model);
  assert.equal(JSON.stringify(final.match), before, 'report mapping must not mutate the round');
  assert.equal(model.meta.course, 'Ledger Club');
  assert.equal(model.meta.layout, 'Ledger');
  assert.equal(model.meta.date, '2026-08-11');
  assert.match(model.meta.recap, /North and South/);
  assert.equal(model.meta.recapProvenance, 'generated-narrative');
  assert.equal(model.holes.length, 18);
  assert.equal(model.card.yds.length, 18);
  assert.ok(model.card.yds.every(value => value > 0));
  assert.deepEqual(model.card.par, final.metrics.holeResults.map(hole => hole.par));
  assert.equal(model.players.length, 4);
  assert.ok(model.players.every(player => player.gross.length === 18));
  assert.ok(model.players.every(player => player.strokes.courseNet.length === 18));
  assert.ok(model.players.every(player => player.strokes.featured.length === 18));
  assert.ok(model.players.every(player => player.strokes.offLow.length === 18));
  assert.equal(model.games[0].type, 'nassau');
  assert.equal(model.games[0].bestN, 2);
  assert.match(model.games[0].allowance.label, /85% off the low/);
  assert.ok(model.games.some(game => game.type === 'matchplay' && game.parentGameId === 'nassau'), 'press is a separate nested ledger');
  assert.ok(model.memories.some(memory => memory.hole === 7));
  assert.match(model.meta.weather.note, /74/);
  assert.ok(model.payments.every(payment => payment.from && payment.to && payment.amt > 0));
  assert.match(shell, /Content-Security-Policy/);
  assert.match(shell, /fonts\/archivo-latin-700-normal\.woff2/);
  assert.match(renderer, /ROUND\.meta\.recap/);
  assert.match(renderer, /ROUND\.meta\.story \|\| ROUND\.meta\.recap/);
  assert.doesNotMatch(renderer, /localStorage|supabase|fetch\(/);
});

test('Ledger Story generation is version-bound, non-mutating, and isolated from the Match Summary recap', () => {
  assert.match(source, /const ledgerEntryStoryCache = new Map\(\)/);
  assert.match(source, /getLedgerEntryStoryCacheKey\(record\)/);
  assert.match(source, /reportPurpose: 'ledger-story'/);
  assert.match(source, /Target 300–400 words and never exceed 450/);
  assert.match(source, /reportModel\.meta\.story = ledgerStory\.text/);
  assert.doesNotMatch(source.slice(source.indexOf('async function prepareLedgerEntryStory'), source.indexOf('function buildLegacyRoundSnapshot')), /persist\(|roundRecapGenerated\s*=|roundRecapFinal\s*=/);
});
