import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function detailsById(id) {
  const start = html.search(new RegExp(`<details\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  assert.ok(start >= 0, `${id} should exist`);
  const tags = /<\/?details\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tags.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  assert.fail(`${id} should have a matching closing tag`);
}

function option(slot, playerId, rowSlot = slot) {
  return {
    dataset: { playerComboboxOption: String(slot), playerId },
    closest: selector => selector === '[data-assignment-slot]' ? { dataset: { assignmentSlot: String(rowSlot) } } : null,
  };
}

test('Courses owns every course-management control while Library disclosures remain independent', () => {
  const courses = detailsById('libraryCoursesSection');
  for (const marker of [
    'coursesSearchInput', 'cloudCoursesStatus', 'coursesList', 'Course Actions',
    'scorecardImportCard', 'Import &amp; AI Scorecard Analysis', 'courseEditorCard',
    'Add Course Manually', 'teeEditorCard', 'Add Tee Manually',
    'refreshCloudCoursesMoreBtn', 'Download Cloud Courses',
    'syncLocalCoursesMoreBtn', 'Publish Local Changes',
  ]) assert.ok(courses.includes(marker), `${marker} should be inside Courses`);
  assert.doesNotMatch(courses, /libraryRoundsSection|libraryPlayersSection|sessionSummaryCard/);
  assert.doesNotMatch(courses.match(/^<details\b[^>]*>/i)[0], /\bopen\b/);
  assert.equal((html.match(/>Download Cloud Courses<\/button>/g) || []).length, 1);
  assert.equal((html.match(/>Publish Local Changes<\/button>/g) || []).length, 1);
  assert.ok(html.indexOf('libraryRoundsSection') < html.indexOf('libraryCoursesSection'));
  assert.ok(html.indexOf('libraryPlayersSection') > html.indexOf('libraryCoursesSection'));
  assert.ok(html.indexOf('sessionSummaryCard') > html.indexOf('libraryPlayersSection'));
  assert.match(html, /id="libraryRoundsSection"[^>]*\bopen\b/);
  assert.match(html, /id="libraryPlayersSection"/);
  assert.match(html, /id="sessionSummaryCard"[^>]*\bhidden\b/);
});

test('Library markup has unique IDs and bounded course-management styling', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(css, /#libraryCoursesSection>\.library-course-card\{margin-top:14px/);
  assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.library-course-actions\{align-items:stretch;justify-content:stretch/);
});

test('mouse pointerdown selects once while touch waits for click so dragging can scroll', () => {
  const engine = loadLiveEngine();
  for (const pointerType of ['mouse', 'touch']) {
    const calls = [];
    let prevented = 0;
    const candidate = option(pointerType === 'mouse' ? 0 : 2, `${pointerType}-player`);
    const event = {
      target: { closest: selector => selector === '[data-player-combobox-option]' ? candidate : null },
      pointerType,
      button: 0,
      preventDefault: () => { prevented += 1; },
    };
    const handled = engine.handlePlayerComboboxOptionPointerDown(event, (...args) => calls.push(args));
    assert.equal(handled, pointerType === 'mouse');
    assert.equal(prevented, pointerType === 'mouse' ? 1 : 0);
    if (pointerType === 'touch') assert.equal(engine.selectPlayerComboboxOption(candidate, (...args) => calls.push(args)), true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[pointerType === 'mouse' ? 0 : 2, `${pointerType}-player`, { preserveFocus: false }]]);
    assert.equal(engine.selectPlayerComboboxOption(candidate, (...args) => calls.push(args)), false);
    assert.equal(calls.length, 1, 'the subsequent activation must not assign twice');
  }
});

test('selection validates slot identity and fresh rerenders remain selectable', () => {
  const engine = loadLiveEngine();
  const calls = [];
  assert.equal(engine.selectPlayerComboboxOption(option(0, 'wrong-row', 1), (...args) => calls.push(args)), false);
  for (let cycle = 0; cycle < 12; cycle += 1) {
    assert.equal(engine.selectPlayerComboboxOption(option(1, `player-${cycle}`), (...args) => calls.push(args)), true);
  }
  assert.equal(calls.length, 12);
  assert.ok(calls.every(call => call[0] === 1));
});

test('slot replacement and duplicate rejection preserve team and tee mapping', () => {
  const engine = loadLiveEngine();
  const original = [
    { slot: 0, team: 1, playerId: 'a', teeId: 'blue' },
    { slot: 1, team: 2, playerId: 'b', teeId: 'white' },
  ];
  const replaced = engine.updatePlayerDraftSlot(original, 0, 'c', { playersPerTeam: 1, defaultTeeId: 'gold' });
  assert.equal(JSON.stringify(replaced.map(row => [row.playerId, row.team, row.teeId])), JSON.stringify([['c', 1, 'blue'], ['b', 2, 'white']]));
  assert.equal(JSON.stringify(engine.updatePlayerDraftSlot(replaced, 0, 'b', { playersPerTeam: 1 })), JSON.stringify(replaced));
  assert.deepEqual(original.map(row => row.playerId), ['a', 'b']);
});

test('pointer, click, and Enter converge on one selection function and assignment refreshes setup truth', () => {
  assert.match(app, /addEventListener\('pointerdown', handlePlayerComboboxOptionPointerDown\)/);
  assert.match(app, /addEventListener\('click',[\s\S]*?selectPlayerComboboxOption\(option\)/);
  const keyboard = app.slice(app.indexOf('function handlePlayerComboboxKeydown'), app.indexOf('function getCurrentSetupPlayerIds'));
  assert.match(keyboard, /event\.key === 'Enter'[\s\S]*?selectPlayerComboboxOption\(option\)/);
  assert.match(keyboard, /event\.key === 'Escape'[\s\S]*?closePlayerCombobox\(input, \{ restoreInvalid: true \}\)/);
  const assignment = app.slice(app.indexOf('function assignPlayerToSlot'), app.indexOf('function refreshMatchPlayerSlots'));
  for (const refresh of ['syncReferenceTeeUi', 'populateMatchPlayerPicker', 'renderGamesPicker', 'renderSetupHandicapPreview', 'renderTodaysMatchSummary']) {
    assert.match(assignment, new RegExp(refresh));
  }
  assert.equal((app.match(/addEventListener\('pointerdown', handlePlayerComboboxOptionPointerDown\)/g) || []).length, 1);
});

test('Round Actions is a major white heading without changing action controls', () => {
  assert.match(html, /<h2 class="setup-round-actions-heading">Round Actions<\/h2>/);
  assert.match(css, /\.setup-start-round-card \.setup-round-actions-heading\{[^}]*color:#fff[^}]*font-size:clamp\(1\.25rem,2\.5vw,1\.5rem\)[^}]*font-weight:850[^}]*text-align:left/);
  assert.match(html, /id="matchSubmitBtn"[^>]+type="submit"[^>]+form="matchForm"[^>]*>Start Round<\/button>/);
  assert.match(html, /id="cancelMatchEditBtn"[^>]+type="button"[^>]+class="secondary setup-cancel-btn hidden"[^>]*>Cancel<\/button>/);
  assert.match(app, /const setupActionLabel = matchId \? 'Update Match' : 'Start Round'/);
  assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.setup-start-round-card\{align-items:stretch;flex-direction:column/);
});
