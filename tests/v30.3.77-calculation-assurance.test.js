import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const holes = Array.from({ length: 18 }, (_, index) => ({
  holeNumber: index + 1,
  par: 4,
  strokeIndex: index + 1,
  yardage: 400,
}));
const course = {
  id: 'assurance-course',
  name: 'Calculation Assurance',
  tees: [
    { id: 'standard', teeName: 'Standard', rating: 72, slope: 113, par: 72, holes },
    { id: 'rated', teeName: 'Rated', rating: 74, slope: 130, par: 72, holes },
    { id: 'forward-nine', teeName: 'Forward 9', rating: 35, slope: 120, par: 36, holes: holes.slice(0, 9) },
  ],
};

function scoreRows(value, count = 18) {
  return Array.from({ length: count }, (_, index) => ({ holeNumber: index + 1, gross: Array.isArray(value) ? value[index] : value }));
}

function fixture({
  playerRows = [{ id: 'a', name: 'Alpha', index: 0 }, { id: 'b', name: 'Bravo', index: 0 }],
  scores = { a: scoreRows(4), b: scoreRows(4) },
  selectedGames = [{ key: 'singles_match', basis: 'net', stakeType: 'match', stake: 10 }],
  momentumPerspective = 1,
  holeCount = 18,
  teeId = 'standard',
  allowance = 100,
  courseData = course,
} = {}) {
  const engine = loadLiveEngine();
  const match = {
    id: 'assurance-round',
    courseId: courseData.id,
    teeId,
    holeCount,
    allowance,
    status: 'active',
    teamCount: 2,
    playersPerTeam: 1,
    teamNames: ['Alpha', 'Bravo'],
    selectedGames,
    featuredCompetition: selectedGames[0]?.key || 'stroke_net',
    momentumGame: selectedGames[0]?.key || '',
    momentumPerspective,
    players: playerRows.map((player, index) => ({
      playerId: player.id,
      team: index + 1,
      teeId,
      scores: structuredClone(scores[player.id] || []),
    })),
  };
  const state = engine.seedState({
    players: structuredClone(playerRows),
    courses: [structuredClone(courseData)],
    matches: [match],
    activeMatchId: match.id,
  });
  const live = state.matches[0];
  return { engine, match: live, metrics: engine.computeMatchMetrics(live) };
}

test('known-answer Course and Playing Handicap matrix covers standard, rated, plus, allowance, and nine-hole inputs', () => {
  const engine = loadLiveEngine();
  const cases = [
    { index: 10, slope: 113, rating: 72, par: 72, expected: 10 },
    { index: 10, slope: 130, rating: 74, par: 72, expected: 14 },
    { index: -2, slope: 125, rating: 71, par: 72, expected: -3 },
    { index: 8.4, slope: 120, rating: 35, par: 36, expected: 8 },
  ];
  cases.forEach(row => assert.equal(engine.courseHandicap(row.index, row.slope, row.rating, row.par), row.expected));
  assert.equal(engine.playingHandicap(14, 90), 13);
  assert.equal(engine.playingHandicap(-3, 85), -3);
});

test('scorecard arithmetic allocates relative and posting strokes and preserves exact gross, net, and totals', () => {
  const players = [{ id: 'a', name: 'Scratch', index: 0 }, { id: 'b', name: 'High', index: 24 }];
  const view = fixture({
    playerRows: players,
    scores: { a: scoreRows(4), b: scoreRows(5) },
    selectedGames: [{ key: 'singles_match', basis: 'net', stakeType: 'match', stake: 10 }],
  });
  const scratch = view.metrics.players.find(row => row.playerId === 'a');
  const high = view.metrics.players.find(row => row.playerId === 'b');
  assert.equal(scratch.courseHdcp, 0);
  assert.equal(high.courseHdcp, 24);
  assert.equal(high.playHdcp, 24);
  assert.deepEqual(
    Array.from(view.metrics.holeResults, hole => hole.playerScores.find(row => row.playerId === 'b').strokes),
    [2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  );
  assert.equal(scratch.grossTotal, 72);
  assert.equal(scratch.netTotal, 72);
  assert.equal(high.grossTotal, 90);
  assert.equal(high.netTotal, 66);
  assert.equal(high.leaderboardNetTotal, 66);
  const scorecard = view.engine.buildClassicScorecard(view.match, view.metrics, { readOnly: true });
  assert.match(scorecard, /<strong>90<\/strong><div class="score-sub total-sub">66<\/div>/);

  const plus = fixture({
    playerRows: [{ id: 'a', name: 'Plus', index: -2 }, { id: 'b', name: 'Scratch', index: 0 }],
    scores: { a: scoreRows(4), b: scoreRows(4) },
  });
  assert.equal(plus.metrics.players.find(row => row.playerId === 'a').playHdcp, -2);
  assert.deepEqual(
    Array.from(plus.metrics.holeResults.slice(0, 3), hole => hole.playerScores.find(row => row.playerId === 'b').strokes),
    [1, 1, 0]
  );
});

test('momentum values, ranges, and both selected perspectives remain exact and presentation-only', () => {
  const scores = {
    a: scoreRows([4, 4, 5, 4, 4, 5, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4]),
    b: scoreRows([5, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5]),
  };
  const view = fixture({ scores });
  const before = JSON.stringify(view.match);
  const alpha = view.engine.buildMomentumPresentation(view.match, view.metrics, 'singles_match', { range: 'full' });
  view.match.momentumPerspective = 2;
  const bravo = view.engine.buildMomentumPresentation(view.match, view.metrics, 'singles_match', { range: 'full' });
  assert.equal(alpha.perspective, 1);
  assert.equal(bravo.perspective, 2);
  assert.equal(bravo.upperLabel, 'Bravo');
  assert.equal(bravo.lowerLabel, 'Alpha');
  assert.deepEqual(bravo.series.map(row => row.value), alpha.series.map(row => -row.value));
  const front = view.engine.buildMomentumPresentation(view.match, view.metrics, 'singles_match', { range: 'front' });
  const back = view.engine.buildMomentumPresentation(view.match, view.metrics, 'singles_match', { range: 'back' });
  assert.equal(front.series.length, 9);
  assert.equal(back.series.length, 9);
  assert.equal(back.series[0].holeNumber, 10);
  const chart = view.engine.renderMomentumChart(view.match, view.metrics, 'singles_match', { range: 'back', showPointValues: true });
  assert.match(chart, /data-momentum-perspective="2"/);
  assert.equal((chart.match(/class="momentum-point-value"/g) || []).length, 9);
  assert.equal(JSON.parse(before).momentumPerspective, 1);
  assert.equal(view.match.players.map(row => JSON.stringify(row.scores)).join('|'), JSON.parse(before).players.map(row => JSON.stringify(row.scores)).join('|'));
});

test('completed Singles Match status and settlement agree exactly once with the same scored facts', () => {
  const view = fixture({
    scores: { a: scoreRows([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]), b: scoreRows([5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]) },
  });
  const featured = view.engine.getFeaturedCompetitionResult(view.match, view.metrics);
  assert.equal(featured.result, 'Alpha defeated Bravo 1 & 0');
  const payout = view.engine.getPayoutReportContext(view.match, view.metrics);
  const singles = payout.payoutGames.find(game => game.key === 'singles_match');
  assert.equal(singles.amounts.a, 10);
  assert.equal(singles.amounts.b, -10);
  assert.deepEqual(
    JSON.parse(JSON.stringify(singles.paymentLines.map(line => ({ from: line.from, to: line.to, amount: line.amount })))),
    [{ from: 'b', to: 'a', amount: 10 }]
  );
  assert.equal(Object.values(singles.amounts).reduce((sum, value) => sum + Number(value), 0), 0);
});

test('Scoring by Hole Par calculates exact gross averages, relative-to-par values, and scored-hole counts', () => {
  const parPattern = [3, 4, 5, 3, 4, 5, 3, 4, 5];
  const mixedCourse = {
    id: 'mixed-par-course',
    name: 'Mixed Par Assurance',
    tees: [{
      id: 'mixed-nine',
      teeName: 'Mixed 9',
      rating: 36,
      slope: 113,
      par: 36,
      holes: parPattern.map((par, index) => ({
        holeNumber: index + 1,
        par,
        strokeIndex: index + 1,
        yardage: par === 3 ? 170 : par === 4 ? 400 : 520,
      })),
    }],
  };
  const view = fixture({
    courseData: mixedCourse,
    teeId: 'mixed-nine',
    holeCount: 9,
    scores: {
      a: scoreRows([3, 5, 4, 4, 4, 6, 2, 5, 5], 9),
      b: scoreRows([4, 4, 5, null, 3, 6, 3, null, 4], 9),
    },
  });
  const before = JSON.stringify(view.match);
  const rows = view.engine.buildScoringByParRows(view.match, view.metrics);
  const alpha = rows.find(row => row.playerId === 'a');
  const bravo = rows.find(row => row.playerId === 'b');

  assert.deepEqual([3, 4, 5].map(par => alpha.byPar[par].count), [3, 3, 3]);
  assert.equal(alpha.byPar[3].average, 3);
  assert.equal(alpha.byPar[3].relativeToPar, 0);
  assert.ok(Math.abs(alpha.byPar[4].average - (14 / 3)) < Number.EPSILON * 4);
  assert.ok(Math.abs(alpha.byPar[4].relativeToPar - (2 / 3)) < Number.EPSILON * 4);
  assert.equal(alpha.byPar[5].average, 5);
  assert.equal(alpha.byPar[5].relativeToPar, 0);
  assert.equal(bravo.byPar[3].count, 2);
  assert.equal(bravo.byPar[4].count, 2);
  assert.equal(bravo.byPar[5].count, 3);
  assert.equal(bravo.byPar[5].average, 5);

  const screen = view.engine.buildScoringByParSummary(view.match, view.metrics);
  assert.match(screen, /Scoring by Hole Par/);
  assert.match(screen, /4\.67 \(\+0\.67\).*3 holes/);
  assert.match(screen, /3\.00 \(E\).*3 holes/);
  assert.match(screen, /Provisional/);
  assert.match(screen, /scoring-by-par-cards/);

  const compact = view.engine.buildScoringByParSummary(view.match, view.metrics, { compact: true });
  assert.match(compact, /scoring-by-par-summary-compact/);
  assert.match(compact, />4\.67</);
  assert.doesNotMatch(compact, /\(\+0\.67\)|3 holes|scoring-by-par-cards/);
  assert.equal(JSON.stringify(view.match), before);

  view.match.statTrackingEnabled = true;
  view.match.statTrackingPlayerIds = ['a', 'b'];
  view.match.players.forEach(player => {
    player.stats = Array.from({ length: 9 }, (_, index) => ({
      holeNumber: index + 1,
      entryCompleted: Number(player.scores?.[index]?.gross) > 0,
    }));
  });
  const statsMetrics = view.engine.computeMatchMetrics(view.match);
  const statsBox = view.engine.buildStatTrackingSummary(view.match, statsMetrics);
  assert.ok(statsBox.indexOf('Manual stat tracking') < statsBox.indexOf('Scoring by Hole Par'));
  assert.ok(statsBox.indexOf('Scoring by Hole Par') < statsBox.indexOf('Score distribution'));
  assert.match(statsBox, /scoring-by-par-summary-compact/);

  const exportView = view.engine.buildScoringByParSummary(view.match, view.metrics, { exportView: true });
  assert.match(exportView, /export-table scoring-by-par-table/);
  assert.doesNotMatch(exportView, /scoring-by-par-cards/);
  const matchSummary = view.engine.buildUnifiedExportDocument(view.match, view.metrics, 'summary');
  assert.ok(matchSummary.indexOf('Player leaderboard') < matchSummary.indexOf('Scoring by Hole Par'));
  assert.ok(matchSummary.indexOf('Scoring by Hole Par') < matchSummary.indexOf('Score Distribution'));
  assert.match(matchSummary, /4\.67 \(\+0\.67\).*3 holes/);
});
