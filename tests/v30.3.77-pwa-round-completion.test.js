import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

const players = [{ id: 'a', name: 'Alpha', index: 0 }, { id: 'b', name: 'Bravo', index: 0 }];
const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
const course = { id: 'course', name: 'Completion Course', tees: [{ id: 'tee', teeName: 'Test', rating: 72, slope: 113, par: 72, holes }] };

function seed({ statTrackingEnabled = false, statsComplete = false, selectedGames = [], sspInputs = {} } = {}) {
  const engine = loadLiveEngine();
  const match = {
    id: 'round', courseId: 'course', teeId: 'tee', holeCount: 9, status: 'active',
    teamCount: 2, playersPerTeam: 1, teamNames: ['Alpha', 'Bravo'],
    statTrackingEnabled, statTrackingPlayerIds: statTrackingEnabled ? ['a', 'b'] : [],
    selectedGames, sneakySandyPoleyInputs: sspInputs,
    players: players.map((player, index) => ({
      playerId: player.id, team: index + 1, teeId: 'tee',
      scores: Array.from({ length: 9 }, (_, hole) => ({ holeNumber: hole + 1, gross: 4 })),
      stats: Array.from({ length: 9 }, (_, hole) => ({ holeNumber: hole + 1, putts: 2, puttsSource: 'user', entryCompleted: statsComplete })),
    })),
  };
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [match], activeMatchId: 'round' });
  return { engine, match: state.matches[0] };
}

test('automatic completion requires scores and only enabled data classes', () => {
  const plain = seed();
  assert.equal(plain.engine.getRoundDataCompletionState(plain.match).isReadyToFinish, true);
  const tracked = seed({ statTrackingEnabled: true });
  const incomplete = tracked.engine.getRoundDataCompletionState(tracked.match);
  assert.equal(incomplete.scoresComplete, true);
  assert.equal(incomplete.statsComplete, false);
  assert.equal(incomplete.isReadyToFinish, false);
  assert.match(tracked.engine.describeRoundDataCompletion(incomplete), /required stat entries remain/);
  tracked.match.players.forEach(player => player.stats.forEach(stat => { stat.entryCompleted = true; }));
  assert.equal(tracked.engine.getRoundDataCompletionState(tracked.match).isReadyToFinish, true);
});

test('unresolved SSP facts block automatic completion without changing gross completion', () => {
  const fixture = seed({
    selectedGames: [{ key: 'sneaky_sandy_poley', validateGreenyProx: true, pointValue: 1 }],
    sspInputs: { 1: { players: { a: { greeny: true, greenyValidation: 'pending' } } } },
  });
  const completion = fixture.engine.getRoundDataCompletionState(fixture.match);
  assert.equal(completion.scoresComplete, true);
  assert.equal(completion.gamesComplete, false);
  assert.equal(completion.isReadyToFinish, false);
  assert.match(fixture.engine.describeRoundDataCompletion(completion), /SSP has unresolved/);
});

test('final-hole save never opens early finish automatically and dismissal persists on the round', () => {
  assert.doesNotMatch(app, /else showRoundEndPrompt\('early', match\)/);
  assert.match(app, /match\.roundFinishPromptDismissedAt = match\.roundFinishPromptDismissedAt \|\| new Date\(\)\.toISOString\(\)/);
  assert.match(app, /dataCompletion\.isReadyToFinish\) showRoundCompletePrompt\(match\)/);
  assert.match(app, /dataCompletion\?\.isReadyToFinish \? 'Ready to Finish' : 'End Round Early'/);
});

test('all PWA branding surfaces use immutable v30.3.77 assets generated from canonical artwork', () => {
  const assetNames = ['app-icon-192-v30.3.77.png', 'app-icon-512-v30.3.77.png', 'apple-touch-icon-v30.3.77.png', 'favicon-32-v30.3.77.png', 'favicon-16-v30.3.77.png'];
  assetNames.forEach(name => {
    const versioned = readFileSync(new URL(`../branding/${name}`, import.meta.url));
    const canonical = readFileSync(new URL(`../branding/${name.replace('-v30.3.77', '')}`, import.meta.url));
    assert.equal(createHash('sha256').update(versioned).digest('hex'), createHash('sha256').update(canonical).digest('hex'), name);
  });
  assert.match(html, /apple-touch-icon-v30\.3\.77\.png/);
  assert.match(html, /favicon-32-v30\.3\.77\.png/);
  assert.deepEqual(manifest.icons.map(icon => icon.src), ['./branding/app-icon-192-v30.3.77.png', './branding/app-icon-512-v30.3.77.png', './branding/apple-touch-icon-v30.3.77.png']);
  assetNames.forEach(name => assert.match(worker, new RegExp(name.replaceAll('.', '\\.'))));
});

test('setup player selection advances independently without requiring the current player tee', () => {
  assert.match(app, /String\(match\.id\) !== currentPlayerId[\s\S]*?assignPlayerToSlot\(slot, match\.id, \{ preserveFocus: false \}\)/);
  assert.match(app, /Closing an unchanged field must not rebuild the picker or recapture focus/);
  assert.match(app, /inputEl\.isConnected === false/);
  assert.match(app, /if \(!input\.isConnected\) return;/);
  assert.doesNotMatch(app, /focusNextUnfilledPlayerSlot/);
  assert.match(app, /Assign players and tees in any order; every player needs a tee before the round can start\./);
});

test('clear-player reset preserves team and tee, releases the golfer, and leaves neighboring slots untouched', () => {
  const engine = loadLiveEngine();
  const original = [
    { slot: 0, team: 1, playerId: 'a', teeId: 'tee' },
    { slot: 1, team: 2, playerId: 'b', teeId: 'tee' },
  ];
  const cleared = engine.updatePlayerDraftSlot(original, 0, '', { playersPerTeam: 1, validTeeIds: ['tee'] });
  assert.deepEqual(structuredClone(cleared[0]), { slot: 0, team: 1, playerId: '', teeId: 'tee' });
  assert.deepEqual(structuredClone(cleared[1]), original[1]);
  const available = engine.getSelectablePlayersForDraftSlot(players, cleared, 1).map(player => player.id);
  assert.ok(available.includes('a'));
  const reassigned = engine.updatePlayerDraftSlot(cleared, 0, 'b', { playersPerTeam: 1, validTeeIds: ['tee'] });
  assert.deepEqual(structuredClone(reassigned), structuredClone(cleared), 'duplicate players remain rejected');
  const replacement = engine.updatePlayerDraftSlot(cleared, 0, 'a', { playersPerTeam: 1, validTeeIds: ['tee'] });
  assert.equal(replacement[0].teeId, 'tee');
  assert.match(app, /assign\(Number\(clear\.dataset\.clearPlayerSlot\), '', \{ preserveFocus: false \}\)/);
});

test('Quick Scoreboard momentum shows one competitive-state label per data point', () => {
  const fixture = seed({ selectedGames: [{ key: 'team_match', basis: 'net', stake: 5 }] });
  fixture.match.players[1].scores.forEach(score => { score.gross = 5; });
  const metrics = fixture.engine.computeMatchMetrics(fixture.match);
  const compact = fixture.engine.renderMomentumChart(fixture.match, metrics, 'team_match', { compact: true, showPointValues: true });
  assert.match(compact, /class="momentum-point-value" data-momentum-value="1">\+1<\/text>/);
  assert.doesNotMatch(compact, /data-momentum-money|momentum-point-money|\$5\.00/);
  assert.match(compact, /class="momentum-axis-unit">holes/);
  assert.doesNotMatch(app, /getMomentumPointMoneyValue|showMoney/);
  assert.match(app, /renderMomentumChart\(match, metrics, chartGameKey, \{ range: activeMomentumRange, showPointValues: true \}\)/);
});

test('Scores hero prefers the featured competition and labels best-net fallback explicitly', () => {
  const featured = seed({ selectedGames: [{ key: 'team_match', basis: 'net', stake: 5 }] });
  const featuredMetrics = featured.engine.computeMatchMetrics(featured.match);
  const featuredOutcome = featured.engine.getScoresFeaturedOutcome(featured.engine.buildEffectiveScoresContext(featured.match, featuredMetrics));
  assert.equal(featuredOutcome.type, 'featured');
  assert.match(featuredOutcome.label, /^Featured Competition · Team Match/);
  const frozenOutcome = featured.engine.getScoresFeaturedOutcome({
    match: featured.match,
    metrics: featuredMetrics,
    frozen: true,
    record: { featuredCompetition: { selection: 'team_match', resolved: 'team_match', label: 'Team Match', result: 'Frozen final result' } },
    leaders: [],
  });
  assert.equal(frozenOutcome.result, 'Frozen final result');

  const social = seed();
  const socialMetrics = social.engine.computeMatchMetrics(social.match);
  const fallback = social.engine.getScoresFeaturedOutcome(social.engine.buildEffectiveScoresContext(social.match, socialMetrics));
  assert.equal(fallback.type, 'best-net');
  assert.equal(fallback.label, 'Best Net Score');
  assert.match(fallback.result, /Alpha|Bravo/);
  featured.match.featuredCompetition = 'none';
  const noFeatured = featured.engine.getScoresFeaturedOutcome(featured.engine.buildEffectiveScoresContext(featured.match, featuredMetrics));
  assert.equal(noFeatured.type, 'best-net');
});

test('Scores hero always uses the authoritative Singles Match status while preserving hole completion', () => {
  const completed = seed({ selectedGames: [{ key: 'singles_match', basis: 'net', stakeType: 'match', stake: 5 }] });
  completed.match.featuredCompetition = 'singles_match';
  completed.match.players[1].scores[0].gross = 5;
  const completedMetrics = completed.engine.computeMatchMetrics(completed.match);
  const completedContext = completed.engine.buildEffectiveScoresContext(completed.match, completedMetrics);
  const completedOutcome = completed.engine.getScoresFeaturedOutcome(completedContext);
  assert.equal(completedOutcome.type, 'featured');
  assert.equal(completedOutcome.label, 'Featured Competition · Singles Match Play');
  assert.equal(completedOutcome.result, 'Alpha defeated Bravo 1 & 0');
  assert.equal(completedContext.completion.label, '9 of 9 holes completed');
  assert.doesNotMatch(completedOutcome.result, /unavailable|more holes/i);

  const provisional = seed({ selectedGames: [{ key: 'singles_match', basis: 'net' }] });
  provisional.match.featuredCompetition = 'singles_match';
  provisional.match.players[1].scores[0].gross = 5;
  provisional.match.players.forEach(player => player.scores.slice(4).forEach(score => { score.gross = null; }));
  const provisionalMetrics = provisional.engine.computeMatchMetrics(provisional.match);
  assert.equal(
    provisional.engine.getFeaturedCompetitionResult(provisional.match, provisionalMetrics).result,
    'Alpha leads 1 up through 4 holes — provisional'
  );

  const tied = seed({ selectedGames: [{ key: 'singles_match', basis: 'net' }] });
  tied.match.featuredCompetition = 'singles_match';
  tied.match.players.forEach(player => player.scores.slice(4).forEach(score => { score.gross = null; }));
  const tiedMetrics = tied.engine.computeMatchMetrics(tied.match);
  assert.equal(
    tied.engine.getFeaturedCompetitionResult(tied.match, tiedMetrics).result,
    'All square through 4 holes — provisional'
  );
});

test('Player leaderboard reserves equal centered widths for the four result columns without changing Classic Scorecard styles', () => {
  assert.match(css, /\.quick-player-table th:nth-child\(2\),\.quick-player-table td:nth-child\(2\)\{width:29%/);
  assert.match(css, /\.quick-player-table th:nth-child\(6\),\.quick-player-table td:nth-child\(6\)\{width:16%;text-align:center/);
  assert.match(app, /class="export-table export-player-leaderboard"/);
  assert.match(app, /export-player-leaderboard th:nth-last-child\(-n\+4\)/);
  assert.doesNotMatch(css, /\.quick-classic-scorecard[^}]*width:29%/);
});

test('Classic Scorecard keeps only Player fixed while Team scrolls beneath it', () => {
  assert.match(css, /\.scorecard-table:not\(\.nine-point-scorecard-table\) tbody \.scorecard-sticky-team\{[\s\S]*?position:static!important/);
  assert.match(css, /\.scorecard-table:not\(\.nine-point-scorecard-table\) \.scorecard-sticky-name\{[\s\S]*?left:0!important[\s\S]*?z-index:6!important[\s\S]*?background:#fff!important/);
  assert.match(css, /\.scorecard-table:not\(\.nine-point-scorecard-table\) thead \.scorecard-sticky-name\{[\s\S]*?z-index:7!important/);
});
