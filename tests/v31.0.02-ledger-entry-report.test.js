import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../ledger-report/shell.html', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const edgeFunction = readFileSync(new URL('../supabase/functions/round-recap/index.ts', import.meta.url), 'utf8');

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
    statTrackingEnabled: true, statTrackingPlayerIds: players.map(player => player.id), statReviewContractVersion: 1,
    selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 2, handicapAllowanceMode: 'recommended', handicapAllowancePercent: 85, stakesFront: 5, stakesBack: 5, stakesOverall: 10, pressesEnabled: presses }],
    players: players.map((player, playerIndex) => ({
      playerId: player.id, team: playerIndex < 2 ? 1 : 2, teeId: 'ledger-tee',
      scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: holeIndex < scored ? hole.par + ((holeIndex + playerIndex) % 3 === 0 ? 1 : 0) : null })),
      stats: holes.map((hole, holeIndex) => holeIndex < scored ? ({ entryCompleted: true, fairway: hole.par >= 4 && (holeIndex + playerIndex) % 2 === 0, green: (holeIndex + playerIndex) % 3 !== 0, putts: 1 + ((holeIndex + playerIndex) % 3), upAndDown: (holeIndex + playerIndex) % 5 === 0, sandy: (holeIndex + playerIndex) % 7 === 0, penaltyStrokes: (holeIndex + playerIndex) % 11 === 0 ? 1 : 0 }) : ({ entryCompleted: false })),
    })),
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
  assert.ok(model.players.every(player => player.statistics?.scoredHoles === 18));
  assert.ok(model.players.every(player => player.statistics?.tracked?.trackedHoles === 18));
  assert.equal(model.games[0].type, 'nassau');
  assert.equal(model.games[0].bestN, 2);
  assert.match(model.games[0].allowance.label, /85% off the low/);
  assert.ok(model.games.some(game => game.type === 'matchplay' && game.parentGameId === 'nassau'), 'press is a separate nested ledger');
  assert.ok(model.memories.some(memory => memory.hole === 7));
  assert.match(model.meta.weather.note, /74/);
  assert.match(model.meta.weather.note, /Humidity \d+%/);
  assert.ok(model.payments.every(payment => payment.from && payment.to && payment.amt > 0));
  assert.match(shell, /Content-Security-Policy/);
  assert.match(shell, /fonts\/archivo-latin-700-normal\.woff2/);
  for (const asset of ['bootstrap.js', 'pack.js', 'engines.js', 'report.js']) {
    assert.match(shell, new RegExp(`${asset.replace('.', '\\.')}\\?v=31\\.0\\.12`), `${asset} must use the current release cache key`);
  }
  assert.match(renderer, /ROUND\.meta\.recap/);
  assert.match(renderer, /ROUND\.meta\.story \|\| ROUND\.meta\.recap/);
  assert.doesNotMatch(renderer, /localStorage|supabase|fetch\(/);
  assert.match(renderer, /data-ledger-stat-group/);
  assert.match(renderer, /Birdie\+ \/ GIR/);
  assert.match(renderer, /p\.tee/);
  assert.match(renderer, /MATCH MARGIN · HOLES/);
  assert.match(renderer, /CUMULATIVE \$\{String\(FR\.unit\)\.toUpperCase\(\)\}/);
  assert.match(renderer, /POT VALUE · \$/);
  assert.match(renderer, /listw\(grossNames\)/);
  assert.doesNotMatch(renderer, /ROUND\.meta\.course} · \$\{ROUND\.meta\.layout}/);
});

test('Ledger Story generation is version-bound, non-mutating, and isolated from the Match Summary recap', () => {
  assert.doesNotMatch(source, /ledgerEntryStoryCache|getLedgerEntryStoryCacheKey/);
  assert.match(source, /reportPurpose: 'ledger-story'/);
  assert.match(source, /Target 300–400 words and never exceed 450/);
  assert.match(source, /exactly 3–5 natural paragraphs separated by blank lines/);
  assert.match(source, /signed holes-up results such as \+2 or \+3/);
  assert.match(renderer, /function storyParagraphs\(text\)/);
  assert.match(renderer, /storyParagraphs\(supplied\)/);
  assert.match(shell, /\.prose p\{margin-bottom:6px;break-inside:auto\}/);
  assert.match(source, /reportModel\.meta\.story = ledgerStory\.text/);
  assert.match(source, /function validateGreeniesNarrativeClaims\(match, metrics, recapText\)/);
  assert.match(source, /FALSE_GREENIES_COUNT/);
  assert.match(source, /UNVERIFIABLE_GREENIES_COUNT/);
  assert.match(source, /issues\.push\(\.\.\.validateGreeniesNarrativeClaims\(match, metrics, recap\)\)/);
  assert.match(source, /const requestStory = async \(repair = null\)/);
  assert.match(source, /blockingIssues\.map\(issue => \(\{ code: issue\.code, message: issue\.message \}\)\)/);
  assert.match(source, /provenance: 'audited-generated-narrative'/);
  assert.match(source, /Generating a fresh Story of the Round/);
  assert.match(source, /window\.AbortController/);
  assert.match(source, /45000/);
  assert.match(source.slice(source.indexOf('async function prepareLedgerEntryStory'), source.indexOf('function buildLegacyRoundSnapshot')), /buildDeterministicLedgerEntryStory/);
  assert.match(edgeFunction, /Do not discuss Greenies/);
  assert.match(shell, /id="returnToMatchBtn"[^>]*>‹ Return to Match<\/button>/);
  assert.match(shell, /@media print\{[\s\S]*?\.report-nav\{display:none!important\}/);
  assert.match(renderer, /function returnToOriginatingMatch\(\)/);
  assert.match(renderer, /window\.location\.assign\(new URL\("\.\.\/",window\.location\.href\)\.href\)/);
  assert.doesNotMatch(source.slice(source.indexOf('async function prepareLedgerEntryStory'), source.indexOf('function buildLegacyRoundSnapshot')), /persist\(|roundRecapGenerated\s*=|roundRecapFinal\s*=/);
});

test('Ledger Entry uses a mobile-safe same-tab transfer after fresh story generation', () => {
  const bootstrap = readFileSync(new URL('../ledger-report/bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /function shouldUseSameTabLedgerReport\(\)/);
  assert.match(source, /mobileUserAgent \|\| standalone \|\| compactCoarsePointer/);
  assert.match(source, /sessionStorage\.setItem\(transferKey/);
  assert.match(source, /reportUrl\.searchParams\.set\('reportKey', transferKey\)/);
  assert.match(source, /if \(sameTabLedger\) window\.location\.assign\(reportUrl\.href\)/);
  assert.match(bootstrap, /sessionStorage\.getItem\(transferKey\)/);
  assert.match(bootstrap, /10 \* 60 \* 1000/);
  assert.match(bootstrap, /__DYE_LEDGER_RETURN_URL__/);
  assert.match(bootstrap, /__DYE_LEDGER_REPORT_TRANSFER_KEY__/);
  assert.match(renderer, /globalThis\.__DYE_LEDGER_RETURN_URL__/);
  assert.match(renderer, /sessionStorage\.removeItem\(globalThis\.__DYE_LEDGER_REPORT_TRANSFER_KEY__\)/);
});

test('Ledger Story Greenies audit distinguishes a count from hole numbers in the same sentence', () => {
  const result = fixture();
  result.match.selectedGames.push({ key: 'greenies', participants: result.match.players.map(player => player.playerId) });
  result.match.greeniesWinners = { 3: 'p1', 7: 'p1' };

  const accurate = result.engine.validateRoundRecapContent(
    result.match,
    result.metrics,
    'Alex Ledger claimed two Greenies by winning on holes 3 and 7.'
  );
  assert.equal(accurate.issues.some(issue => /GREENIES_COUNT/.test(issue.code)), false);

  const inaccurate = result.engine.validateRoundRecapContent(
    result.match,
    result.metrics,
    'Alex Ledger claimed three Greenies by winning on holes 3 and 7.'
  );
  assert.equal(inaccurate.issues.some(issue => issue.code === 'FALSE_GREENIES_COUNT'), true);
  assert.match(source, /blockingIssues\.map\(issue => \(\{ code: issue\.code, message: issue\.message \}\)\)/);
});

test('Ledger Entry always receives a verified deterministic story when the online service is unavailable', async () => {
  const result = fixture();
  const story = await result.engine.prepareLedgerEntryStory(result.match, result.metrics);
  assert.equal(story.provenance, 'deterministic-fallback');
  assert.equal(story.fallbackReason, 'service-not-configured');
  assert.ok(story.text.length > 40);
  assert.match(source, /console\.warn\(`Ledger Story used the verified deterministic fallback/);
  assert.doesNotMatch(source.slice(source.indexOf('async function prepareLedgerEntryStory'), source.indexOf('function buildLegacyRoundSnapshot')), /requires an internet connection|Configure Supabase before generating/);
});

test('Ledger Story replaces variable Greenies prose with deterministic recorded results', () => {
  const result = fixture();
  result.match.selectedGames.push({ key: 'greenies', participants: result.match.players.map(player => player.playerId) });
  result.match.greeniesWinners = { 3: 'p1', 7: 'p1', 11: 'p2' };
  const story = result.engine.addVerifiedGreeniesToLedgerStory(
    result.match,
    result.metrics,
    'North controlled the featured match.\n\nAlex won two Greenies, while Blake took another one. The teams traded pars through the middle stretch.\n\nThe closing holes settled the round.'
  );
  assert.doesNotMatch(story, /took another one/);
  assert.match(story, /Alex Ledger won 2 Greenies on holes 3 and 7\./);
  assert.match(story, /Blake Ledger won 1 Greenie on hole 11\./);
  assert.match(story, /The teams traded pars through the middle stretch\./);
  assert.equal(story.split(/\n\s*\n+/).length, 3);
  assert.equal(result.engine.validateRoundRecapContent(result.match, result.metrics, story).issues.some(issue => /GREENIES_COUNT/.test(issue.code)), false);
  assert.match(result.engine.buildLedgerEntryStoryPayload(result.match, result.metrics).recapInstructions, /Do not discuss Greenies/);
  assert.match(edgeFunction, /Do not discuss Greenies/);
});

test('Ledger Story records no Greenies winners without fabricating a count', () => {
  const result = fixture();
  result.match.selectedGames.push({ key: 'greenies', participants: result.match.players.map(player => player.playerId) });
  result.match.greeniesWinners = {};
  const story = result.engine.addVerifiedGreeniesToLedgerStory(result.match, result.metrics, 'The match stayed close.\n\nNo side game changed the result.\n\nThe finish decided the day.');
  assert.match(story, /No Greenies winners were recorded\./);
  assert.doesNotMatch(story, /0 Greenies/);
});

test('Ledger hero names each side explicitly and summarizes actual side-game results', () => {
  assert.match(renderer, /head = swept \? `\$\{SIDES\[WINK\]\.name\} \$\{verb\} the Nassau`/);
  assert.match(renderer, /function sideGameDeckResult\(game\)/);
  assert.match(renderer, /game\.R\.per\.forEach/);
  assert.match(renderer, /`\$\{game\.name\} went \$\{countsBySide\[winner\]\}–\$\{countsBySide\[loser\]\} to \$\{SIDES\[winner\]\.name\}\.`/);
  assert.match(renderer, /`\$\{game\.name\} split \$\{firstCount\}–\$\{secondCount\}\.`/);
  assert.doesNotMatch(renderer, /They lost the \$\{FEAT\.name\}/);
});

test('tracked statistics appear in Ledger Statistics and inform both story paths', () => {
  const final = fixture();
  assert.match(final.html, /<h3>Scoring<\/h3>/);
  assert.match(final.html, /<h3>Ball Striking<\/h3>/);
  assert.match(final.html, /<h3>Short Game &amp; Putting<\/h3>/);
  assert.match(final.html, /<h3>Recovery Performance<\/h3>/);
  assert.match(final.html, /<h3>Tee-Shot Results<\/h3>/);
  assert.doesNotMatch(final.html, /<h3>Tee-Shot Consequences<\/h3>/);
  assert.match(final.html, /<h3>Approach Dispersion · 3×3<\/h3>/);
  assert.match(final.html, /<h3>Putting Context<\/h3>/);
  assert.match(final.html, /<h3>Performance by Par<\/h3>/);
  assert.match(final.html, /<h3>Tracking Completeness<\/h3>/);
  assert.match(final.html, /Tracked Holes/);
  assert.match(final.html, /Fairways/);
  assert.match(final.html, /GIR/);
  assert.match(final.html, /Total Putts/);
  assert.match(final.html, /Birdie\+ Conversion on GIR/);
  assert.match(final.html, /regardless of putt count/);
  assert.match(final.html, /Overall Scrambling/);
  assert.match(final.html, /From Rough/);
  assert.match(final.html, /From Bunker/);
  assert.match(final.html, /From Fringe/);
  assert.match(final.html, /Unknown recovery lies remain in overall scrambling/);
  assert.match(final.html, /Frequency uses the same denominator of recorded par-4 and par-5 tee-shot outcomes/);
  assert.match(final.html, /Missing facts are never counted as failures/);
  assert.match(final.html, /\d+% \(\d+\/\d+\)/);
  const facts = final.engine.buildTrackedStatisticsStoryFacts(final.match, final.metrics);
  assert.equal(facts.length, 4);
  assert.ok(facts.every(fact => fact.trackedHoles === 18));
  assert.ok(facts.every(fact => fact.greenOpportunities === 18));
  const payload = final.engine.buildLedgerEntryStoryPayload(final.match, final.metrics);
  assert.deepEqual(payload.trackedStatistics, facts);
  assert.match(payload.trackedStatisticsInstruction, /never interpret an unrecorded field as zero/);
  const fallback = final.engine.buildLedgerEntryFactsOnlyStory(final.record, final.match, final.metrics);
  assert.match(fallback, /recorded statistics included/);
  assert.match(fallback, /greens in regulation/);
});

test('weather capture starts with the first completed hole rather than Match Setup', () => {
  const setupStart = source.indexOf("toast(wasEditingMatch ? 'Round setup updated.'");
  assert.ok(setupStart > 0);
  assert.doesNotMatch(source.slice(setupStart - 400, setupStart), /scheduleWeatherCaptureForMatch\(match\.id\)/);
  assert.match(source, /function shouldCaptureWeatherAfterFirstSavedHole\(match\)/);
  assert.match(source, /match\.playedHoleOrder\.length === 1/);
  assert.match(source, /if \(shouldCaptureWeatherAfterFirstSavedHole\(match\)\) scheduleWeatherCaptureForMatch\(match\.id\)/);
  assert.match(source, /Recorded after the first completed hole/);
});
