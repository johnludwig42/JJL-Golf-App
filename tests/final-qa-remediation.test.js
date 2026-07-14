import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('saved-player assignment uses one accessible searchable combobox per slot', () => {
  const engine = loadLiveEngine();
  const original = [{ slot: 0, team: 1, playerId: 'a', teeId: 'blue' }, { slot: 1, team: 2, playerId: 'b', teeId: 'white' }];
  const replaced = engine.updatePlayerDraftSlot(original, 0, 'c', { playersPerTeam: 1, defaultTeeId: 'blue' });
  assert.equal(replaced[0].playerId, 'c');
  assert.equal(replaced[1].playerId, 'b');
  assert.equal(replaced[0].teeId, 'blue');
  assert.deepEqual(original.map(row => row.playerId), ['a', 'b']);
  assert.deepEqual(engine.updatePlayerDraftSlot(replaced, 0, 'b', { playersPerTeam: 1 }), replaced);
  assert.match(appSource, /data-player-combobox-slot="\$\{idx\}"/);
  assert.match(appSource, /role="combobox"[^>]+aria-expanded="false"[^>]+aria-controls="\$\{listId\}"/);
  assert.match(appSource, /role="listbox"[^>]+data-player-combobox-list/);
  assert.match(appSource, /handlePlayerComboboxKeydown/);
  assert.match(appSource, /event\.key === 'Escape'/);
  assert.match(appSource, /data-clear-player-slot/);
  assert.doesNotMatch(appSource, /data-player-dropdown-slot|data-player-lookup-slot|<datalist/);
  assert.match(appSource, /getPlayerLookupLabel\(player\)/);
  assert.doesNotMatch(html, /id="playerSearchSheet"/);
  assert.doesNotMatch(appSource, /openPlayerSearchSheet|data-open-player-sheet/);
});

test('Shared Match mode changes preserve every non-shared draft field across repeated toggles', () => {
  const engine = loadLiveEngine();
  const draft = { date: '2026-07-14', name: 'QA Round', courseId: 'course', teeId: 'blue', courseSnapshot: { name: 'Course' }, holeCount: 18, allowance: 90, teamNames: ['Alpha', 'Beta'], players: [{ playerId: 'a', team: 1, teeId: 'blue' }], selectedGames: [{ key: 'nassau', stakesFront: 5 }], pressConfig: { maxPressesPerRound: 3, maxRePresses: 2 }, statTrackingEnabled: true, smartScoreAdvanceEnabled: false, featuredCompetition: 'nassau', templateId: 'template-1', roundRecordSnapshot: { isFrozen: true }, storageMode: 'local', cloudSyncState: 'local-only' };
  const stableKeys = Object.keys(draft).filter(key => !['storageMode', 'cloudSyncState'].includes(key));
  let toggled = draft;
  for (const enabled of [true, false, true, false, true]) toggled = engine.setSharedMatchDraftMode(toggled, enabled);
  stableKeys.forEach(key => assert.equal(JSON.stringify(toggled[key]), JSON.stringify(draft[key]), key));
  assert.equal(toggled.storageMode, 'shared');
  assert.equal(toggled.sharedMatchEnabled, true);
  assert.deepEqual(draft.roundRecordSnapshot, { isFrozen: true });
});

test('checklist and Start Round validation share one complete authoritative draft contract', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
  const course = { id: 'course', name: 'Course', tees: [{ id: 'blue', teeName: 'Blue', rating: 72, slope: 113, par: 72, holes }] };
  engine.seedState({ players: [{ id: 'a', name: 'Alex', index: 5 }, { id: 'b', name: 'Blake', index: 8 }], courses: [course], matches: [] });
  const draft = { active: null, teamCount: 2, playersPerTeam: 1, requiredSlotCount: 2, courseId: 'course', course, players: [{ playerId: 'a', team: 1, teeId: 'blue' }, { playerId: 'b', team: 2, teeId: 'blue' }], games: [{ key: 'nassau', basis: 'net' }], holeCount: 18, courseHolesLoaded: true, scoringAccessMode: 'single_device', sharedMatchEnabled: false };
  const ready = engine.getMatchSetupValidationState({ draft });
  assert.equal(ready.ready, true);
  assert.equal(ready.summary.courseSelected, true);
  assert.equal(ready.summary.teeSelected, true);
  assert.equal(ready.summary.courseHolesLoaded, true);
  const missingPlayer = engine.getMatchSetupValidationState({ draft: { ...draft, players: draft.players.slice(0, 1) } });
  assert.equal(missingPlayer.ready, false);
  assert.ok(missingPlayer.missingRequirements.some(item => /player slots/i.test(item)));
  const missingHoles = engine.getMatchSetupValidationState({ draft: { ...draft, courseHolesLoaded: false } });
  assert.equal(missingHoles.ready, false);
  assert.ok(missingHoles.missingRequirements.some(item => /course data/i.test(item)));
  assert.match(appSource, /if \(!wrap\) \{ renderRoundReadiness\(\); return; \}/);
  assert.equal((appSource.match(/function getMatchSetupValidationState\(/g) || []).length, 1);
});

test('all newly created Presses use the original game wager and no stake selector is exposed', () => {
  const engine = loadLiveEngine();
  const players = [{ id: 'a', name: 'A', index: 0 }, { id: 'b', name: 'B', index: 0 }];
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
  const course = { id: 'course', name: 'Course', tees: [{ id: 'blue', teeName: 'Blue', rating: 72, slope: 113, par: 72, holes }] };
  const scores = value => Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, gross: index < 5 ? value : null }));
  const match = { id: 'round', courseId: 'course', teeId: 'blue', holeCount: 18, status: 'active', teamCount: 2, playersPerTeam: 1, selectedGames: [{ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', declaringSideRule: 'EITHER_SIDE', maxPressesPerRound: 4, maxRePresses: 2, pressValueRule: 'INHERIT_PARENT_STAKE' }], players: [{ playerId: 'a', team: 1, teeId: 'blue', scores: scores(4) }, { playerId: 'b', team: 2, teeId: 'blue', scores: scores(5) }], presses: [] };
  const live = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: 'round' }).matches[0];
  let metrics = engine.computeMatchMetrics(live);
  const root = engine.buildPressRecordDraft(live, metrics, 'OVERALL', { gameKey: 'team_match', pressConfig: live.selectedGames[0], currentPosition: 2, declaringSideId: '2' });
  root.wagerAmount = 25; root.stake = 25;
  live.presses = [root];
  const rePress = engine.buildPressRecordDraft(live, metrics, 'OVERALL', { gameKey: 'team_match', parentPressId: root.pressId, pressConfig: live.selectedGames[0], currentPosition: 5, declaringSideId: '2' });
  live.presses.push(rePress);
  live.players[0].scores[5].gross = 4; live.players[1].scores[5].gross = 5;
  live.players[0].scores[6].gross = 4; live.players[1].scores[6].gross = 5;
  metrics = engine.computeMatchMetrics(live);
  const secondRePress = engine.buildPressRecordDraft(live, metrics, 'OVERALL', { gameKey: 'team_match', parentPressId: rePress.pressId, pressConfig: live.selectedGames[0], currentPosition: 7, declaringSideId: '2' });
  assert.equal(root.wagerAmount, 25);
  assert.equal(rePress.wagerAmount, 10);
  assert.equal(secondRePress.wagerAmount, 10);
  assert.equal(engine.getOriginalPressWager(live, root), 10);
  assert.doesNotMatch(html, /Press Stake|Root Stake|Parent Stake/);
  assert.doesNotMatch(appSource, /data-field="pressValueRule"/);
  assert.match(html, /All Presses and Re-Presses use the original wager for the game or Nassau segment\./);
});

test('Match setup headings use the accepted hierarchy and shared visual treatment', () => {
  for (const heading of ['Round Setup', 'Advanced Options', 'Pre-Round Checklist']) assert.match(html, new RegExp(`setup-major-heading[^>]*>${heading}`));
  for (const heading of ['Players &amp; Teams', 'Games', 'Match Templates']) assert.match(html, new RegExp(`setup-section-heading[^>]*>${heading}`));
  assert.match(css, /\.setup-major-heading\{[^}]*text-align:left[^}]*font-weight:800/);
  assert.doesNotMatch(html, /setup-advanced-card top-gap" open/);
});
