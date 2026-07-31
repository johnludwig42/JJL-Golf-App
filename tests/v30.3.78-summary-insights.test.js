import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('v30.3.78 immutable PWA assets remain available after later upgrades', () => {
  const assets = [
    'app-icon-192-v30.3.78.png',
    'app-icon-512-v30.3.78.png',
    'apple-touch-icon-v30.3.78.png',
    'favicon-32-v30.3.78.png',
    'favicon-16-v30.3.78.png',
  ];
  assets.forEach(name => assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true));
});

test('hole navigation scrolls to the active-hole header only after a successful hole change', () => {
  assert.match(html, /id="activeHoleScoringTop" class="score-hole-nav/);
  assert.match(app, /function scrollToActiveHoleScoringTop\(\{ behavior = 'smooth' \} = \{\}\)/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /if \(!persist\(\)\) return false;\s*if \(currentHole !== savedPosition\) scrollToActiveHoleScoringTop\(\);/);
  assert.ok(app.indexOf('if (!persist()) return false;') < app.indexOf('scrollToActiveHoleScoringTop();'));
});

test('approved Scores sections are independent closed-by-default disclosures and remain printable', () => {
  const expected = [
    ['print-section-match-status', 'Match status'],
    ['print-section-classic-scorecard', 'Classic scorecard'],
    ['print-section-stat-tracking', 'Stats'],
    ['print-section-notes', 'Round Notes, Memories &amp; Recap'],
  ];
  expected.forEach(([className, title]) => {
    const pattern = new RegExp(`<details[^>]*class="[^"]*scoreboard-collapsible[^"]*${className}[^"]*"[^>]*>\\s*<summary><h2>${title}<\\/h2><\\/summary>`);
    assert.match(html, pattern);
  });
  assert.doesNotMatch(html, /<details[^>]*(?:print-section-match-status|print-section-classic-scorecard|print-section-stat-tracking|print-section-notes)[^>]*\sopen(?:\s|>)/);
  assert.match(css, /body\.printing-scorecard\.printing-summary details\.scoreboard-collapsible\{display:block !important;\}/);
  assert.match(css, /body\.printing-scorecard\.printing-summary details\.scoreboard-collapsible > \*\{display:block !important;\}/);
  assert.doesNotMatch(app, /(?:matchStatus|classicScorecard|statTrackingSummaryCard|roundStoryCard)\.open\s*=/);
});

test('End Round Early placement and behavior remain unchanged in this release', () => {
  assert.match(html, /id="scoreboardFinishRoundBtn"[^>]*>Finish \/ End Round<\/button>/);
  assert.ok(html.indexOf('id="scoreboardFinishRoundBtn"') < html.indexOf('print-section-match-status'));
  assert.match(app, /dataCompletion\?\.isReadyToFinish \? 'Ready to Finish' : 'End Round Early'/);
  assert.match(app, /scoreboardFinishRoundBtn\.addEventListener\('click', handleScoreboardFinishEndRound\)/);
});

test('Player Insights derive exact completed-hole rates and GIR-based birdie conversion without mutating the round', () => {
  const engine = loadLiveEngine();
  const pars = [3, 4, 5, 3, 4, 5];
  const course = {
    id: 'insight-course',
    name: 'Insight Course',
    tees: [{
      id: 'insight-tee',
      teeName: 'Insight',
      rating: 24,
      slope: 113,
      par: 24,
      holes: pars.map((par, index) => ({ holeNumber: index + 1, par, strokeIndex: index + 1, yardage: 150 + index * 50 })),
    }],
  };
  const scoreRows = values => values.map((gross, index) => ({ holeNumber: index + 1, gross }));
  const match = {
    id: 'insight-round',
    courseId: course.id,
    teeId: 'insight-tee',
    holeCount: 6,
    allowance: 100,
    status: 'active',
    teamCount: 2,
    playersPerTeam: 1,
    selectedGames: [],
    statTrackingEnabled: true,
    statTrackingPlayerIds: ['a', 'b'],
    players: [
      {
        playerId: 'a',
        team: 1,
        teeId: 'insight-tee',
        scores: scoreRows([2, 4, 6, 3, 5, 4]),
        stats: pars.map((_, index) => ({ holeNumber: index + 1, green: [0, 1, 5].includes(index), entryCompleted: true })),
      },
      {
        playerId: 'b',
        team: 2,
        teeId: 'insight-tee',
        scores: scoreRows([3, 5, 5, 4, 4, 6]),
        stats: pars.map((_, index) => ({ holeNumber: index + 1, green: false, entryCompleted: true })),
      },
    ],
  };
  const state = engine.seedState({
    players: [{ id: 'a', name: 'Alpha', index: 0 }, { id: 'b', name: 'Bravo', index: 0 }],
    courses: [course],
    matches: [match],
    activeMatchId: match.id,
  });
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  const before = JSON.stringify(live);
  const alpha = engine.computePlayerRoundInsights(live, metrics).find(row => row.playerId === 'a');
  assert.equal(alpha.totals.scoredHoles, 6);
  assert.equal(alpha.scoringAverage, 4);
  assert.equal(alpha.totals.birdieOrBetter, 2);
  assert.equal(alpha.birdieOrBetterRate, 2 / 6);
  assert.equal(alpha.totals.parOrBetter, 4);
  assert.equal(alpha.parOrBetterRate, 4 / 6);
  assert.equal(alpha.bogeyAvoidanceRate, 1);
  assert.equal(alpha.totals.greensInRegulation, 3);
  assert.equal(alpha.totals.convertedGreens, 2);
  assert.equal(alpha.birdieConversionRate, 2 / 3);
  const presentation = engine.buildPlayerRoundInsights(live, metrics);
  assert.match(presentation, /Alpha/);
  assert.match(presentation, /33%/);
  assert.match(presentation, /67% \(2\/3\)/);
  assert.doesNotMatch(presentation, /Provisional/);
  assert.equal(JSON.stringify(live), before);
  live.players.find(row => row.playerId === 'b').scores[5].gross = null;
  const partial = engine.buildPlayerRoundInsights(live, engine.computeMatchMetrics(live));
  assert.match(partial, /Provisional/);
});

test('Scores and Match Summary share one Player Insights derivation and preserve section order', () => {
  assert.match(app, /const playerInsightsHtml = buildPlayerRoundInsights\(match, metrics\)/);
  assert.match(app, /manualStatsHtml \+ playerInsightsHtml \+ scoringByParHtml \+ scoreDistributionHtml/);
  assert.ok(app.indexOf('<h2>Player Insights</h2>') < app.indexOf('<h2>Score Distribution</h2>'));
  assert.match(app, /buildPlayerRoundInsights\(match, metrics, \{ exportView: true \}\)/);
  assert.match(app, /Missing information is excluded rather than estimated/);
});

test('displayed yardages use US thousands separators without changing numeric inputs', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.formatYardageValue(999), '999');
  assert.equal(engine.formatYardageValue(1000), '1,000');
  assert.equal(engine.formatYardageValue(7159), '7,159');
  assert.match(app, /formatYardageValue\(turningHole\.yards\)/);
});

test('SSP momentum uses point geometry and one cumulative-dollar label per data point', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.formatMomentumMoneyValue(0), '$0');
  assert.equal(engine.formatMomentumMoneyValue(6), '+$6');
  assert.equal(engine.formatMomentumMoneyValue(-2.5), '−$2.50');
  assert.match(app, /formatMomentumMoneyValue\(row\.value \* sspPointValue\)/);
  assert.match(app, /data-momentum-money=/);
  assert.match(app, /formatMomentumMoneyValue\(row\.cumulative \* pointValue\)/);
  assert.match(app, /Line = cumulative SSP point margin; labels = cumulative team money position/);
});

test('Scores score distribution hides all-zero categories while reusable summaries remain fixed', () => {
  const engine = loadLiveEngine();
  const rows = [
    { name: 'Alpha', totals: { eagle: 0, birdie: 1, par: 2, bogey: 0, doubleBogey: 0, other: 0 } },
    { name: 'Bravo', totals: { eagle: 0, birdie: 0, par: 3, bogey: 0, doubleBogey: 0, other: 0 } },
  ];
  const adaptive = engine.buildScoreDistributionPresentation(rows, { hideAllZeroColumns: true });
  assert.match(adaptive, />Birdie</);
  assert.match(adaptive, />Par</);
  assert.doesNotMatch(adaptive, />Eagle</);
  assert.doesNotMatch(adaptive, />Bogey</);
  assert.doesNotMatch(adaptive, />Double Bogey</);
  assert.doesNotMatch(adaptive, />Other</);
  assert.match(adaptive, /Only scoring categories recorded in this round are shown/);
  const fixed = engine.buildScoreDistributionPresentation(rows);
  ['Eagle', 'Birdie', 'Par', 'Bogey', 'Double Bogey', 'Other'].forEach(label => assert.match(fixed, new RegExp(`>${label}<`)));
  assert.match(app, /buildScoreDistributionSummary\(match, metrics, \{ hideAllZeroColumns: true \}\)/);
});
