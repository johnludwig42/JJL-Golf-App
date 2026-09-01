import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fakeSelect(initialValue = '') {
  let html = '';
  const select = { value: initialValue, options: [] };
  Object.defineProperty(select, 'innerHTML', {
    get: () => html,
    set: value => {
      html = String(value);
      select.options = [...html.matchAll(/<option value="([^"]*)"/g)].map(match => ({ value: match[1] }));
      select.value = select.options[0]?.value || '';
    },
  });
  return select;
}

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
});

test('shared select rebuild preserves a valid value and fails closed when it disappears', () => {
  const engine = loadLiveEngine();
  const select = fakeSelect('course-b');
  assert.equal(engine.rebuildSelectOptionsPreservingValue(select, '<option value="">Select course</option><option value="course-a">A</option><option value="course-b">B</option>'), 'course-b');
  assert.equal(select.value, 'course-b');
  assert.equal(engine.rebuildSelectOptionsPreservingValue(select, '<option value="">Select course</option><option value="course-a">A</option>'), '');
  assert.equal(select.value, '');
});

test('unfiltered players are recency-first then alphabetical without stored ordering state', () => {
  const engine = loadLiveEngine();
  const players = [{ id: 'a', name: 'Amy' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cara' }];
  engine.seedState({ players, courses: [], activeMatchId: null, matches: [
    { id: 'old', date: '2026-01-01', players: [{ playerId: 'a' }] },
    { id: 'new', date: '2026-08-30', players: [{ playerId: 'c' }] },
  ] });
  assert.equal(engine.orderPlayerComboboxCandidates(players).map(player => player.id).join(','), 'c,a,b');
});

test('filtered players use exact, prefix, word-prefix, and substring quality', () => {
  const engine = loadLiveEngine();
  const players = [
    { id: 'substring', name: 'Atom Smith' },
    { id: 'word', name: 'John Tom' },
    { id: 'prefix', name: 'Tommy' },
    { id: 'exact', name: 'Tom' },
  ];
  engine.seedState({ players, courses: [], matches: [], activeMatchId: null });
  assert.equal(engine.orderPlayerComboboxCandidates(players, 'tom').map(player => player.id).join(','), 'exact,prefix,word,substring');
});

test('bottom-edge opening flips above and remains bounded', () => {
  const engine = loadLiveEngine();
  const classes = new Set();
  const list = { classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) }, style: {}, dataset: {} };
  const input = { dataset: { playerComboboxSlot: '0' }, getBoundingClientRect: () => ({ top: 760, bottom: 806 }) };
  const result = engine.positionPlayerCombobox(input, list);
  assert.equal(result.openAbove, true);
  assert.equal(classes.has('opens-above'), true);
  assert.ok(result.maxHeight <= 240);
  assert.equal(list.dataset.openDirection, 'above');
});

test('touch pointerdown preserves scrolling while mouse selection remains immediate', () => {
  const engine = loadLiveEngine();
  const row = { dataset: { assignmentSlot: '0' } };
  const option = { dataset: { playerComboboxOption: '0', playerId: 'p1' }, closest: () => row };
  let assignments = 0;
  let prevented = 0;
  const event = pointerType => ({ pointerType, button: 0, preventDefault: () => { prevented += 1; }, target: { closest: selector => selector === '[data-player-combobox-option]' ? option : null } });
  assert.equal(engine.handlePlayerComboboxOptionPointerDown(event('touch'), () => { assignments += 1; }), false);
  assert.equal(assignments, 0);
  assert.equal(prevented, 0);
  assert.equal(engine.handlePlayerComboboxOptionPointerDown(event('mouse'), () => { assignments += 1; }), true);
  assert.equal(assignments, 1);
  assert.equal(prevented, 1);
});

test('combobox presentation contains scroll containment, count, adaptive placement, and guarded dismissal', () => {
  assert.match(css, /\.player-combobox-list\{[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.player-combobox-list\.opens-above/);
  assert.match(css, /\.player-combobox-option\{[^}]*min-height:44px/);
  assert.match(app, /data-player-combobox-count/);
  assert.match(app, /\$\{visible\.length\} of \$\{optionPlayers\.length\} players/);
  assert.match(app, /list\?\.dataset\.pointerInteraction !== 'true'/);
  assert.match(app, /window\.addEventListener\('orientationchange', repositionOpenPlayerComboboxes\)/);
});
