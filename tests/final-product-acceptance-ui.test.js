import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('player slots expose one keyboard-operable searchable combobox and no parallel selector', () => {
  assert.match(app, /role="combobox"[^>]+aria-autocomplete="list"[^>]+aria-expanded="false"/);
  assert.match(app, /role="listbox"/);
  assert.match(app, /ArrowDown.*ArrowUp.*Enter/s);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /filterPlayerCombobox/);
  assert.match(app, /data-clear-player-slot/);
  assert.doesNotMatch(app, /data-player-dropdown-slot|data-player-lookup-slot|playerSearchSheet|<datalist/);
  assert.match(css, /\.player-combobox-list\{[^}]*max-height:240px[^}]*overflow:auto/);
  assert.match(css, /\.player-combobox-option\{[^}]*min-height:44px/);
});

test('team labels and handicap preview follow descriptive-left numeric-centered alignment', () => {
  assert.match(app, /player-assignment-slot-heading/);
  assert.match(css, /\.player-assignment-slot-heading strong\{[^}]*font-size:1rem[^}]*font-weight:800/);
  assert.match(app, /handicap-preview-description/);
  assert.equal((app.match(/class="handicap-preview-number"/g) || []).length, 8);
  for (const label of ['Index', 'Course HCP', 'Playing', 'Gets']) assert.match(app, new RegExp(`handicap-preview-number[^>]*>${label}`));
  assert.match(css, /\.handicap-preview-description\{text-align:left/);
  assert.match(css, /\.handicap-preview-number\{text-align:center/);
  assert.match(css, /--handicap-preview-columns:minmax\(100px,1\.8fr\) repeat\(4,minmax\(42px,\.65fr\)\)/);
  assert.match(css, /grid-template-columns:var\(--handicap-preview-columns\)/);
});

test('Allowance communicates percent while round storage remains numeric', () => {
  const engine = loadLiveEngine();
  const match = engine.createEmptyMatch({ allowance: 100 });
  assert.equal(match.allowance, 100);
  assert.match(html, /class="percentage-input"><input[^>]+name="allowance"[^>]+type="number"[^>]+value="100"[^>]+aria-label="Allowance percentage"[^>]*\/><span aria-hidden="true">%<\/span>/);
  assert.doesNotMatch(app, /allowance:\s*Number\([^\n]+\)\s*\/\s*100/);
});

test('Shared Match Round Default normalizes, persists, resets, and seeds only new drafts', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.normalizePlayerPreferences({}).roundDefaults.sharedMatchEnabled, false);
  assert.equal(engine.normalizePlayerPreferences({ roundDefaults: { sharedMatchEnabled: 'yes' } }).roundDefaults.sharedMatchEnabled, false);
  assert.equal(engine.normalizePlayerPreferences({ roundDefaults: { sharedMatchEnabled: true, future: 7 } }).roundDefaults.future, 7);
  const store = storage();
  engine.updatePlayerPreference('roundDefaults.sharedMatchEnabled', true, store);
  assert.equal(engine.getPlayerPreferences(store).roundDefaults.sharedMatchEnabled, true);
  assert.equal(engine.createBlankSetupDraft(engine.getPlayerPreferences(store)).storageMode, 'shared');
  const explicitLocal = engine.mergeNewMatchDefaults({ sharedMatchEnabled: false }, engine.getPlayerPreferences(store));
  assert.equal(explicitLocal.sharedMatchEnabled, false);
  assert.equal(engine.resetPlayerPreferences(store).roundDefaults.sharedMatchEnabled, false);
  assert.match(app, /sharedMatchEnabled: Object\.prototype\.hasOwnProperty\.call\(template, 'sharedMatchEnabled'\)/);
  assert.match(app, /storageMode: prior\.storageMode === 'shared' \? 'shared' : 'local'/);
  assert.doesNotMatch(app.slice(app.indexOf('function buildCloudMatchPayload'), app.indexOf('async function uploadSharedMatch')), /playerPreferences|roundDefaults/);
});

test('compact readiness guidance remains actionable and location stays outside required validation checks', () => {
  const render = app.slice(app.indexOf('function renderRoundReadiness()'), app.indexOf('function renderSetupConfidencePanels'));
  assert.match(render, /Tap an item to finish setup/);
  assert.match(render, /data-readiness-destination/);
  assert.doesNotMatch(render, /Everything looks good|readiness-count|>Ready</);
  const truth = app.slice(app.indexOf('function getRoundReadinessState()'), app.indexOf('function initializeSetupDisclosures'));
  assert.doesNotMatch(truth, /location|weather/i);
  assert.doesNotMatch(render, /buildRoundReadinessWeatherStatus\(\)/);
});

test('Round actions preserve semantics with a dominant primary and balanced secondary button', () => {
  assert.match(html, /id="matchSubmitBtn"[^>]+class="setup-action-btn"/);
  assert.match(html, /id="cancelMatchEditBtn"[^>]+secondary setup-cancel-btn/);
  assert.doesNotMatch(html, /Your setup stays editable until scoring begins\./);
  assert.match(app, /const setupActionLabel = matchId \? 'Update Match' : 'Start Round'/);
  assert.match(app, /setAttribute\('aria-label', setupActionLabel\)/);
  assert.match(css, /setup-action-btn[^}]+setup-cancel-btn\{width:100%;min-height:50px/);
  assert.match(css, /setup-start-round-card \.setup-action-btn\{background:#0b7a45!important;color:#fff!important/);
});

test('Play keeps compact expandable Shared Match trust and removes routine expanded diagnostics', () => {
  assert.match(app, /shared-title-sync-details/);
  assert.match(app, /<summary class="shared-title-sync-pill"/);
  for (const label of ['Mode', 'Connection', 'Sync', 'Score parity', 'Last sync']) assert.match(app, new RegExp(label));
  assert.match(app, /card\.classList\.toggle\('hidden', !showToggles\)/);
  assert.doesNotMatch(app, /card\.innerHTML = statusHtml \+/);
  assert.match(html, /id="memoryQuickCaptureWrap"/);
});

test('Library disclosures, cloud action authority, labels, and empty Current Session are accepted', () => {
  assert.doesNotMatch(html, /Continue Playing &amp; Saved Matches/);
  assert.match(html, /id="libraryRoundsSection"[^>]*open>[\s\S]*?<summary>[\s\S]*?<h3>Rounds<\/h3>/);
  assert.match(html, /id="libraryCoursesSection" class="[^"]*library-section-disclosure"(?![^>]*open)/);
  assert.match(html, /id="libraryPlayersSection" class="[^"]*library-section-disclosure"(?![^>]*open)/);
  assert.match(html, /id="sessionSummaryCard" class="[^"]*library-section-disclosure hidden"/);
  assert.equal((html.match(/>Download Cloud Courses<\/button>/g) || []).length, 1);
  assert.equal((html.match(/>Publish Local Changes<\/button>/g) || []).length, 1);
  assert.match(html, /Add Course Manually/);
  assert.match(app, /Add Tee Manually/);
  assert.match(app, /card\?\.classList\.add\('hidden'\)/);
  assert.match(css, /\.library-section-disclosure>summary\{[^}]*text-align:left/);
  assert.match(html, /id="coursesSearchInput"/);
  assert.match(html, /id="scorecardImportCard"/);
});
