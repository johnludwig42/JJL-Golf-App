import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const players = [
  { id: 'p1', name: 'John Smith', index: 0 }, { id: 'p2', name: 'John Jones', index: 0 },
  { id: 'p3', name: 'Phil Longname', index: 0 }, { id: 'p4', name: 'Steve', index: 0 },
];
const course = { id: 'mobile-course', name: 'Mobile Club', tees: [{ id: 'blue', teeName: 'Blue', rating: 36, slope: 113, par: 36, holes: Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 390 })) }] };
const scoreRows = values => Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, gross: values?.[index] ?? null }));
function buildMatch({ id = 'mobile', selectedGames = [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }], scores = {}, inputs = {}, status = 'active', teamNames = ['Team 1', 'Team 2'], storageMode = 'local', sharedHostDeviceId = '' } = {}) {
  return { id, date: '2026-07-12', name: 'Mobile fixture', courseId: course.id, teeId: 'blue', format: 'teams', allowance: 100, holeCount: 9, teamCount: 2, playersPerTeam: 2, teamNames, selectedGames, status, completedAt: status === 'complete' ? '2026-07-12T20:00:00Z' : null, storageMode, sharedHostDeviceId,
    players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, slot: index, teeId: 'blue', scores: scoreRows(scores[player.id]) })), sneakySandyPoleyInputs: inputs };
}
function render(match) {
  const engine = loadLiveEngine();
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [structuredClone(match)], activeMatchId: match.id });
  const live = state.matches[0];
  return { engine, match: live, metrics: engine.computeMatchMetrics(live) };
}
const winningScores = { p1: [4,4,4,4,4,4,4,4,4], p2: [4,4,4,4,4,4,4,4,4], p3: [5,5,5,5,5,5,5,5,5], p4: [5,5,5,5,5,5,5,5,5] };

test('Play scoring groups players beneath full-width team headings without duplicating the Team column', () => {
  const fixture = render(buildMatch({ teamNames: ['Brian & Phil', 'Tom & John'], scores: winningScores }));
  const html = fixture.engine.buildTeamGroupedScoreGridRows(
    fixture.match,
    fixture.metrics.tee,
    fixture.metrics,
    fixture.metrics.players,
    fixture.metrics.tee.holes[0],
  );
  assert.match(html, /score-team-heading[^>]*data-score-team="1"[\s\S]*Brian &amp; Phil/);
  assert.match(html, /score-team-heading[^>]*data-score-team="2"[\s\S]*Tom &amp; John/);
  assert.equal((html.match(/score-team-heading/g) || []).length, 2);
  assert.doesNotMatch(html, />2 players</);
  assert.equal((html.match(/data-score-player=/g) || []).length, 4);
  assert.equal((html.match(/score-net-cell/g) || []).length, 4);
  assert.doesNotMatch(html, /<td>Brian &amp; Phil<\/td>|<td>Tom &amp; John<\/td>/);
});

test('Play shows actual Featured Competition Gets split from saved stroke indexes', () => {
  const engine = loadLiveEngine();
  const fullPlayers = [
    { id: 'low', name: 'Low', index: 0 },
    { id: 'six', name: 'Six', index: 6 },
    { id: 'other-a', name: 'Other A', index: 0 },
    { id: 'other-b', name: 'Other B', index: 0 },
  ];
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: 4,
    yardage: 400,
    strokeIndex: index < 9 ? (index * 2) + 1 : ((index - 9) * 2) + 2,
  }));
  const fullCourse = { id: 'full-course', name: 'Full Course', tees: [{ id: 'full-tee', teeName: 'White', rating: 72, slope: 113, par: 72, holes }] };
  const match = {
    id: 'stroke-distribution', courseId: fullCourse.id, teeId: 'full-tee', holeCount: 18,
    teamCount: 2, playersPerTeam: 2, teamNames: ['One', 'Two'], allowance: 100,
    featuredCompetition: 'nassau',
    selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 1, scoringPolicyVersion: 1, handicapAllowanceMode: 'recommended', handicapAllowancePercent: 90 }],
    players: fullPlayers.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, teeId: 'full-tee', scores: scoreRows([]) })),
  };
  const state = engine.seedState({ players: fullPlayers, courses: [fullCourse], matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  const distribution = engine.getFeaturedCompetitionStrokeDistribution(live, metrics.tee, metrics, metrics.players.find(player => player.playerId === 'six'));
  assert.deepEqual({ ...distribution }, { total: 5, front: 3, back: 2, label: 'Gets 5 · Front 3 · Back 2' });
});

test('Play labels a nine-hole side from the selected holes rather than received strokes', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 1, scoringPolicyVersion: 1, handicapAllowancePercent: 90 }] }));
  fixture.match.featuredCompetition = 'nassau';
  const distribution = fixture.engine.getFeaturedCompetitionStrokeDistribution(
    fixture.match,
    fixture.metrics.tee,
    fixture.metrics,
    fixture.metrics.players[0],
  );
  assert.equal(distribution.total, 0);
  assert.equal(distribution.label, 'Gets 0 · Front 9');
});

test('player detail Classic scorecard offers the shared Course Net and Match Net controls', () => {
  const engine = loadLiveEngine();
  const handicapPlayers = players.map((player, index) => ({ ...player, index: [5, 10, 12, 15][index] }));
  const match = buildMatch({ selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 1, scoringPolicyVersion: 1, handicapAllowancePercent: 90 }], scores: winningScores });
  match.featuredCompetition = 'nassau';
  const state = engine.seedState({ players: handicapPlayers, courses: [structuredClone(course)], matches: [match], activeMatchId: match.id });
  const metrics = engine.computeMatchMetrics(state.matches[0]);
  const html = engine.buildPlayerDetailView(state.matches[0], metrics, metrics.players[0].playerId);
  assert.match(html, /<span>Gross<\/span><strong>36<\/strong>/);
  assert.match(html, /<span>Course Net<\/span><strong>31<\/strong>/);
  assert.match(html, /<span>Match Net<\/span><strong>36<\/strong>/);
  assert.doesNotMatch(html, /<span>Net<\/span>/);
  assert.match(html, /data-scorecard-net-view="course"[\s\S]*Course Net/);
  assert.match(html, /data-scorecard-net-view="match"[\s\S]*Match Net/);
});

test('completed Match Summary exposes a safe Create New Match action while retaining Save Hole Scores', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(html, /id="completedSummaryNewMatchBtn"[^>]*>Create New Match<\/button>/);
  assert.match(app, /completedSummaryNewMatchBtn[^\n]*startCleanNewMatchSetup/);
  assert.match(html, /id="saveScoresBtn"[^>]*>Save Hole Scores<\/button>/);
});

test('compact Play player metadata preserves a full-cell tap target without shrinking score controls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(html, /<th>Strokes<\/th>/);
  assert.doesNotMatch(html, /<th>Game Stroke<\/th>/);
  assert.match(css, /score-player-name\{[\s\S]*min-height:0!important;[\s\S]*height:auto;[\s\S]*line-height:1\.15;/);
  assert.match(css, /score-player-name\{[\s\S]*max-width:calc\(100% - 12px\);[\s\S]*margin-left:12px;/);
  assert.match(css, /score-player-name::after\{[\s\S]*position:absolute;[\s\S]*inset:0;/);
  assert.match(css, /score-team-heading th\{[\s\S]*background:#f4f8f5;[\s\S]*box-shadow:inset 3px 0 0/);
  assert.match(css, /gross-score-stepper \.score-input\{[\s\S]*min-height:34px!important/);
});

test('Quick Scoreboard Classic Scorecard offers Course Net and Match Net from the shared scorecard engine', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 1, scoringPolicyVersion: 1, handicapAllowancePercent: 90 }], scores: winningScores }));
  fixture.match.featuredCompetition = 'nassau';
  const html = fixture.engine.buildQuickScoreboardView(fixture.match, fixture.metrics, fixture.engine.getDefaultPlayerPreferences());
  assert.match(html, /data-scorecard-net-view="course"[\s\S]*Course Net/);
  assert.match(html, /data-scorecard-net-view="match"[\s\S]*Match Net/);
});

test('Scores escapes ampersands in team names exactly once', () => {
  const fixture = render(buildMatch({ teamNames: ['Brian & Phil', 'Tom & John'], scores: winningScores, status: 'complete' }));
  fixture.match.featuredCompetition = 'nassau';
  const context = fixture.engine.buildEffectiveScoresContext(fixture.match, fixture.metrics);
  const outcome = fixture.engine.getScoresFeaturedOutcome(context);
  const html = fixture.engine.buildScoresOutcomeHero(context);
  assert.match(outcome.result, /Brian & Phil/);
  assert.doesNotMatch(outcome.result, /&amp;/);
  assert.match(html, /Brian &amp; Phil/);
  assert.doesNotMatch(html, /Brian &amp;amp; Phil/);
});

test('legacy frozen Games Summary decodes stored entities and escapes them once for display', () => {
  const html = render(buildMatch()).engine.buildFrozenScoresGameSummary({
    games: [{ type: 'nassau', result: { result: 'Brian &amp; Phil (Brian Warner, Phil Bounsall) 3 up' }, amounts: { p1: 10 } }],
  });
  assert.match(html, /Brian &amp; Phil \(Brian Warner, Phil Bounsall\) 3 up/);
  assert.doesNotMatch(html, /Brian &amp;amp; Phil/);
});

test('truthful game status covers concrete live, final, tied, incomplete, and not-started states', () => {
  const liveNassau = render(buildMatch({ scores: Object.fromEntries(Object.entries(winningScores).map(([id, rows]) => [id, rows.slice(0, 4)])) }));
  assert.match(liveNassau.engine.getTruthfulGameStatus(liveNassau.match, liveNassau.metrics, 'nassau'), /Team|John|\+4|thru 4/i);
  assert.doesNotMatch(liveNassau.engine.getTruthfulGameStatus(liveNassau.match, liveNassau.metrics, 'nassau'), /^Live$/i);
  const finalNassau = render(buildMatch({ scores: winningScores, status: 'complete' }));
  assert.match(finalNassau.engine.getTruthfulGameStatus(finalNassau.match, finalNassau.metrics, 'nassau'), /^Final:/);
  const tied = render(buildMatch({ scores: Object.fromEntries(players.map(player => [player.id, [4,4,4]])) }));
  assert.match(tied.engine.getTruthfulGameStatus(tied.match, tied.metrics, 'nassau'), /Tied|All square/i);
  const notStarted = render(buildMatch());
  assert.equal(notStarted.engine.getTruthfulGameStatus(notStarted.match, notStarted.metrics, 'nassau'), 'Not started');

  const sspGames = [{ key: 'sneaky_sandy_poley', pointValue: 1 }];
  const sspScores = { p1: [4,3,4], p2: [4,4,4], p3: [5,6,5], p4: [5,6,5] };
  const sspInputs = { 2: { players: { p1: { sneaky: true } } } };
  const liveSsp = render(buildMatch({ selectedGames: sspGames, scores: sspScores, inputs: sspInputs }));
  assert.match(liveSsp.engine.getTruthfulGameStatus(liveSsp.match, liveSsp.metrics, 'sneaky_sandy_poley'), /\+\d+ thru/i);
  const incompleteSsp = render(buildMatch({ selectedGames: sspGames, scores: sspScores, inputs: sspInputs, status: 'complete' }));
  assert.match(incompleteSsp.engine.getTruthfulGameStatus(incompleteSsp.match, incompleteSsp.metrics, 'sneaky_sandy_poley'), /^Incomplete:/);
  const finalSsp = render(buildMatch({ selectedGames: sspGames, scores: winningScores, inputs: sspInputs, status: 'complete' }));
  assert.match(finalSsp.engine.getTruthfulGameStatus(finalSsp.match, finalSsp.metrics, 'sneaky_sandy_poley'), /^Final:/);
});

test('shared momentum presentation honors the selected perspective, labels sides, and preserves source data', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net', stake: 5 }], scores: winningScores, status: 'complete', teamNames: ['', ''] }));
  const before = JSON.stringify(fixture.match);
  const model = fixture.engine.buildMomentumPresentation(fixture.match, fixture.metrics, 'team_match');
  assert.equal(model.perspective, 1);
  assert.ok(model.series.at(-1).value > 0);
  assert.equal(model.upperLabel, 'John S./John J.');
  assert.equal(model.lowerLabel, 'Phil/Steve');
  const full = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match');
  const compact = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match', { compact: true });
  assert.match(full, /momentum-zero-baseline/);
  assert.match(compact, /momentum-zero-baseline/);
  assert.match(full, /momentum-side-label--upper/);
  assert.equal(JSON.stringify(fixture.match), before);
  fixture.match.momentumPerspective = 2;
  const reversed = fixture.engine.buildMomentumPresentation(fixture.match, fixture.metrics, 'team_match');
  assert.equal(reversed.perspective, 2);
  assert.ok(reversed.series.at(-1).value < 0);
  assert.equal(reversed.upperLabel, 'Phil/Steve');
  assert.equal(reversed.lowerLabel, 'John S./John J.');
  assert.equal(reversed.series.every((row, index) => row.value === -model.series[index].value), true);
  const tied = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net' }], scores: Object.fromEntries(players.map(player => [player.id, [4,4,4]])) }));
  assert.equal(tied.engine.buildMomentumPresentation(tied.match, tied.metrics, 'team_match').perspective, 1);
});

test('momentum y-axis uses deterministic symmetric integer scales for full and compact charts', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net' }], scores: winningScores, status: 'complete' }));
  const small = fixture.engine.getMomentumYAxisScale([0, 1, 3, 5]);
  assert.deepEqual(JSON.parse(JSON.stringify(small.ticks)), [-6, -4, -2, 0, 2, 4, 6]);
  assert.equal(small.bound, 6);
  const medium = fixture.engine.getMomentumYAxisScale([-9, 4]);
  assert.equal(medium.bound, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(medium.ticks)), [-10, -5, 0, 5, 10]);
  const large = fixture.engine.getMomentumYAxisScale([-19, 8]);
  assert.equal(large.bound, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(large.ticks)), [-20, -10, 0, 10, 20]);
  const compactScale = fixture.engine.getMomentumYAxisScale([-19, 8], { compact: true });
  assert.deepEqual(JSON.parse(JSON.stringify(compactScale.ticks)), [-20, 0, 20]);
  assert.ok(compactScale.ticks.length < large.ticks.length);
  [...small.ticks, ...medium.ticks, ...large.ticks].forEach(value => assert.equal(Number.isInteger(value), true));

  const before = JSON.stringify(fixture.match);
  const full = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match');
  const compact = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match', { compact: true });
  assert.match(full, /class="momentum-y-axis"/);
  assert.match(compact, /class="momentum-y-axis"/);
  const zeroTickY = full.match(/data-momentum-tick="0" data-tick-y="([^"]+)"/)?.[1];
  const zeroBaselineY = full.match(/class="momentum-zero-baseline" data-zero-y="([^"]+)"/)?.[1];
  assert.ok(zeroTickY);
  assert.equal(zeroTickY, zeroBaselineY);
  assert.match(full, />\+\d+<\/text>/);
  assert.match(full, />-\d+<\/text>/);
  assert.match(full, /class="momentum-axis-unit">holes<\/text>/);
  assert.equal(fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match'), full);
  assert.equal(JSON.stringify(fixture.match), before);

  const empty = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net' }] }));
  assert.equal(empty.engine.renderMomentumChart(empty.match, empty.metrics, 'team_match'), '');
});

test('Quick Scoreboard prioritizes settlement and base games, preserves trusted money, and renders factual disclosures', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }, { key: 'team_match', basis: 'net', stake: 5 }], scores: winningScores, status: 'complete' }));
  const frozen = fixture.engine.buildFrozenRoundRecord(fixture.match, fixture.metrics, '2026-07-12T20:00:00Z');
  fixture.match.roundRecordSnapshot = structuredClone(frozen);
  const before = JSON.stringify(fixture.match.roundRecordSnapshot);
  const html = fixture.engine.buildQuickScoreboardView(fixture.match, fixture.metrics);
  assert.ok(html.indexOf('Final Settlement') < html.indexOf('Game Summary'));
  assert.ok(html.indexOf('Game Summary') < html.indexOf('Player Score Summary'));
  assert.ok(html.indexOf('Player Score Summary') < html.indexOf('Classic Scorecard'));
  assert.ok(html.indexOf('Classic Scorecard') < html.indexOf('Momentum Charts'));
  assert.ok(html.indexOf('Classic Scorecard') < html.indexOf('Momentum Charts'));
  assert.doesNotMatch(html, /quick-scoreboard-status/);
  assert.match(html, /quick-settlement-hero/);
  assert.match(html, /All games reconciled/);
  assert.match(html, /quick-nassau-component/);
  assert.doesNotMatch(html, /data-scorecard-edit/);
  assert.match(html, /quick-momentum-card/);
  assert.equal(JSON.stringify(fixture.match.roundRecordSnapshot), before);
  const payout = fixture.engine.getPayoutReportContext(fixture.match, fixture.metrics);
  const perGame = Object.fromEntries(players.map(player => [player.id, 0]));
  payout.payoutGames.forEach(game => Object.entries(game.amounts || {}).forEach(([id, amount]) => { perGame[id] = Number(perGame[id] || 0) + Number(amount || 0); }));
  assert.equal(JSON.stringify(perGame), JSON.stringify(payout.finalTotals));
});

test('Catch-Up queue identifies only explicit missing holes and never fills blank scores', () => {
  const scores = { ...winningScores, p1: [4, null, 4, null, 4,4,4,4,4], p2: [4,4,4,null,4,4,4,4,4] };
  const fixture = render(buildMatch({ scores }));
  const before = JSON.stringify(fixture.match.players.map(player => player.scores));
  const queue = fixture.engine.getCatchUpMissingHoleQueue(fixture.match, fixture.metrics);
  assert.deepEqual(Array.from(queue, row => row.holeNumber), [2, 4]);
  assert.deepEqual(Array.from(queue[1].missingPlayerIds), ['p1', 'p2']);
  assert.equal(JSON.stringify(fixture.match.players.map(player => player.scores)), before);
  const complete = render(buildMatch({ scores: winningScores }));
  assert.equal(complete.engine.getCatchUpMissingHoleQueue(complete.match, complete.metrics).length, 0);
});

test('Play places the contextual Press action directly beside Scoreboard without a permanent opportunity card', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="quickScoreboardBtn"[^>]*>Scoreboard<\/button><button id="playPressBtn"[^>]*aria-label="Press"[^>]*>Press<\/button>/);
  assert.doesNotMatch(html, /id="pressActionsWrap"/);
});

test('settlement hero follows formal lifecycle without changing settlement amounts', () => {
  const active = render(buildMatch({ scores: Object.fromEntries(Object.entries(winningScores).map(([id, rows]) => [id, rows.slice(0, 3)])), status: 'active' }));
  const payout = active.engine.getPayoutReportContext(active.match, active.metrics);
  const before = JSON.stringify(payout.finalTotals);
  const provisional = active.engine.buildQuickSettlementHero(active.match, active.metrics, payout, active.engine.getEffectiveRoundRecord(active.match, active.metrics));
  assert.match(provisional, /Provisional Settlement/);
  assert.match(provisional, /would pay/);
  assert.match(provisional, /Based on scores currently entered/);
  assert.equal(JSON.stringify(payout.finalTotals), before);

  const complete = render(buildMatch({ scores: winningScores, status: 'complete' }));
  const frozen = complete.engine.buildFrozenRoundRecord(complete.match, complete.metrics, '2026-07-12T20:00:00Z');
  const final = complete.engine.buildQuickSettlementHero(complete.match, complete.metrics, complete.engine.getPayoutReportContext(complete.match, complete.metrics), frozen);
  assert.match(final, /Final Settlement/);
  assert.match(final, / pays /);
  assert.match(final, /All games reconciled/);

  complete.match.status = 'active'; complete.match.previousCompletedAt = complete.match.completedAt; complete.match.completedAt = null; complete.match.roundRecordSnapshot = null;
  const reopened = complete.engine.buildQuickSettlementHero(complete.match, complete.metrics, complete.engine.getPayoutReportContext(complete.match, complete.metrics), complete.engine.getEffectiveRoundRecord(complete.match, complete.metrics));
  assert.match(reopened, /Provisional Settlement/);
});

test('team fallback helper is deterministic, distinguishes duplicate names, and never mutates saved names', () => {
  const fixture = render(buildMatch({ teamNames: ['  ', 'Champions'] }));
  const before = JSON.stringify(fixture.match.teamNames);
  assert.equal(fixture.engine.getTeamDisplayName(fixture.match, 1), 'John S./John J.');
  assert.equal(fixture.engine.getTeamDisplayName(fixture.match, 2), 'Champions');
  assert.equal(JSON.stringify(fixture.match.teamNames), before);
  fixture.match.teamNames[1] = '';
  assert.equal(fixture.engine.getTeamDisplayName(fixture.match, 2), 'Phil/Steve');
  fixture.match.players.push({ ...fixture.match.players[3], team: 2, slot: 4 });
  assert.equal(fixture.engine.getTeamDisplayName(fixture.match, 2), 'Phil/Steve 1/Steve 2');
  fixture.match.players = fixture.match.players.slice(0, 1);
  assert.equal(fixture.engine.getTeamDisplayName(fixture.match, 1), 'John');
});

test('Quick Scoreboard inserts collapsed Score Distribution in order and preserves frozen data', () => {
  const fixture = render(buildMatch({ scores: winningScores, status: 'complete' }));
  const frozen = fixture.engine.buildFrozenRoundRecord(fixture.match, fixture.metrics, '2026-07-12T20:00:00Z');
  fixture.match.roundRecordSnapshot = structuredClone(frozen);
  const before = JSON.stringify(fixture.match.roundRecordSnapshot);
  const html = fixture.engine.buildQuickScoreboardView(fixture.match, fixture.metrics);
  assert.ok(html.indexOf('Player Score Summary') < html.indexOf('Score Distribution'));
  assert.ok(html.indexOf('Score Distribution') < html.indexOf('Classic Scorecard'));
  assert.match(html, /<details class="quick-scoreboard-section quick-disclosure quick-score-distribution"><summary>Score Distribution/);
  assert.match(html, /score-distribution-scroll/);
  assert.equal(JSON.stringify(fixture.match.roundRecordSnapshot), before);
});

test('responsive source paths contain internal scrolling, width-fit momentum, desktop summary reuse, and canonical branding', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(html, /src="\.\/branding\/apple-touch-icon-v31\.0\.03\.png" alt="The Dye Ledger"/);
  assert.match(html, /id="playMatchSummary"[^>]*aria-label="Match Summary"/);
  assert.match(css, /\.table-scroll-region\{[^}]*overflow-x:auto[^}]*overflow-y:hidden/);
  assert.match(css, /\.quick-scoreboard-modal\{[^}]*overflow-x:hidden/s);
  assert.match(css, /\.quick-momentum-card \.momentum-chart\{[^}]*min-width:0[^}]*max-width:100%/);
  const renderCurrentMatch = app.slice(app.indexOf('function renderCurrentMatch()'), app.indexOf('function getShortStatusName'));
  assert.ok(renderCurrentMatch.indexOf('renderScoreGrid(match, tee, metrics, scoringHoles);') < renderCurrentMatch.indexOf('renderPressActions(match, metrics);'));
  assert.match(app, /playMatchSummary\.innerHTML = buildFeaturedMatchStatus/);
});

test('Quick Scoreboard reuses the native bounded scorecard scroller and Play Greenies stay compact without changing controls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(css, /body\s*\{\s*touch-action:\s*auto;/);
  assert.match(app, /quick-classic-scorecard"\$\{quickPreferences\.classicScorecardExpanded \? ' open' : ''\}><summary>Classic Scorecard<\/summary>\$\{buildClassicScorecardPanel\(match, metrics, \{ readOnly: true \}\)\}<\/details>/);
  assert.doesNotMatch(app, /quick-classic-scorecard[^\n]*quick-scroll-panel/);
  assert.match(app, /class="scorecard-wrap table-scroll-region" data-scroll-table="classic-scorecard" tabindex="0" role="region" aria-label="Classic scorecard; scroll horizontally to view all holes"/);
  assert.match(css, /\.scorecard-wrap\{position:relative;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;/);
  assert.match(css, /@media \(max-width:760px\)\{\.scorecard-table\{min-width:920px\}\}/);
  assert.match(css, /\.quick-classic-scorecard>\.scorecard-wrap,\.quick-score-distribution>\.score-distribution-scroll\{width:calc\(100% - 24px\);max-width:calc\(100% - 24px\);/);
  assert.match(html, /style\.css\?v=31\.0\.03&amp;rev=1/);
  assert.match(app, /cacheName: 'the-dye-ledger-v31\.0\.03'/);
  assert.match(css, /#greeniesEntryWrap \.greenies-check\{min-height:44px;padding:4px 9px;gap:7px\}/);
  assert.match(css, /#greeniesEntryWrap \.greenies-check input\[type="checkbox"\]\{width:20px;height:20px;min-height:20px;padding:0\}/);
  assert.match(html, /id="greeniesEntryWrap" class="top-gap hidden"/);
  assert.match(app, /class="mini-check greenies-check/);
  assert.match(app, /type="checkbox" data-greenies-winner=/);
});
