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

test('post-v30.3.80 release identity retains immutable PWA assets', () => {
  assert.equal(pkg.version, '31.0.09');
  assert.equal(manifest.version, 'v31.0.09');
  assert.match(app, /versionNumber:\s*'31\.0\.09'/);
  assert.match(worker, /cacheName:\s*'the-dye-ledger-v31\.0\.09'/);
  ['app-icon-192-v31.0.09.png', 'app-icon-512-v31.0.09.png', 'apple-touch-icon-v31.0.09.png', 'favicon-32-v31.0.09.png', 'favicon-16-v31.0.09.png']
    .forEach(name => assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true));
});

test('Match Setup is one non-linear five-destination form with one authoritative Start Round contract', () => {
  for (const destination of ['course', 'players', 'games', 'scoring', 'advanced']) {
    assert.match(html, new RegExp(`data-open-setup-destination="${destination}"`));
    assert.match(html, new RegExp(`data-setup-destination="${destination}"`));
  }
  assert.equal((html.match(/id="matchForm"/g) || []).length, 1);
  assert.equal((html.match(/id="matchCourseSelect"/g) || []).length, 1);
  assert.equal((html.match(/id="enableStatTrackingInput"/g) || []).length, 1);
  assert.equal((html.match(/id="scoreEntryModeSelect"/g) || []).length, 1);
  assert.match(app, /setupDraftForm\?\.addEventListener\('input', scheduleSetupDraftSave\)/);
  assert.match(app, /setupDraftForm\?\.addEventListener\('change', scheduleSetupDraftSave\)/);
  assert.match(app, /const validation = getMatchSetupValidationState\(\{ draft \}\)/);
  assert.match(css, /#matchForm\[data-active-setup-destination="course"\]/);
});

test('readiness issues route to the correct setup destination', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getSetupDestinationForReadinessItem({ label: 'Course selected' }), 'course');
  assert.equal(engine.getSetupDestinationForReadinessItem({ label: 'Player 2 tee' }), 'players');
  assert.equal(engine.getSetupDestinationForReadinessItem({ label: 'Featured Competition' }), 'games');
  assert.equal(engine.getSetupDestinationForReadinessItem({ label: 'Shared assignments' }), 'scoring');
  assert.equal(engine.getSetupDestinationForReadinessItem({ label: 'Allowance' }), 'players');
  assert.match(app, /data-readiness-destination/);
});

test('destination headings live in the Match header and supporting setup content is streamlined', () => {
  assert.match(html, /id="matchSectionTitle">Match</);
  assert.match(html, /id="setupDestinationBackBtn"[^>]*>‹ Match Setup</);
  assert.match(app, /title\.textContent = normalized \? copy\[0\] : 'Match Setup'/);
  assert.doesNotMatch(html, />Pre-Round Checklist</);
  assert.doesNotMatch(html, /id="setupCourseLibraryStatus"/);
  assert.match(html, /data-setup-destination="games"><span>Default handicap allowance/);
  const header = html.slice(html.indexOf('id="matchSectionHeader"'), html.indexOf('</div>\n\n', html.indexOf('id="matchSectionHeader"')));
  assert.ok(header.indexOf('id="matchSectionTitle"') < header.indexOf('id="setupDestinationBackBtn"'));
  const advancedStart = html.indexOf('Preferences for This Round');
  assert.ok(advancedStart < html.indexOf('Smart Score Advance', advancedStart));
  assert.ok(html.indexOf('Smart Score Advance', advancedStart) < html.indexOf('Match Templates', advancedStart));
  assert.match(css, /match-section-header \.item-header\{flex-direction:row/);
  assert.match(css, /\.match-templates-card\{order:3!important;border-left:1px solid var\(--border\)!important/);
});

test('reference tee manual selection is not reclassified as the automatic recommendation', () => {
  assert.match(app, /matchTeeSelect'\)\.addEventListener\('change',[\s\S]{0,220}uiState\.referenceTeeManual = true/);
  assert.doesNotMatch(app, /matchTeeSelect'\)\.addEventListener\('change',[\s\S]{0,220}referenceTeeAutoId = e\.target\.value/);
});

test('weather and Smart Score Advance are preferences with round-only overrides', () => {
  const engine = loadLiveEngine();
  const normalized = engine.normalizePlayerPreferences({ roundDefaults: { captureWeatherContext: false } });
  assert.equal(normalized.roundDefaults.captureWeatherContext, false);
  assert.equal(engine.getNewMatchDefaultsFromPreferences(normalized).captureWeatherContext, false);
  assert.match(html, /name="roundDefaults\.captureWeatherContext"/);
  assert.match(html, /id="captureWeatherContextInput" name="captureWeatherContext"/);
  assert.match(html, /Preferences for This Round/);
  assert.match(html, /Uses your saved preference unless changed for this round/);
  assert.match(html, /id="roundPreferenceSummary"/);
  assert.match(app, /data-open-player-preferences/);
  assert.match(app, /row\('Quick Scoreboard'/);
  const summary = app.slice(app.indexOf('function renderRoundPreferenceSummary()'), app.indexOf('function applySavedPressDefaultsToCurrentSetup()'));
  assert.doesNotMatch(summary, /row\('Smart Score Advance'|row\('Stat Tracking'|row\('Shared Match'|Scoring feedback/);
  assert.match(summary, /data-open-press-preferences/);
  assert.match(summary, /data-apply-press-defaults/);
  assert.match(app, /pressPreferencesHeading/);
  assert.match(app, /Saved changes do not silently rewrite this draft/);
});

test('nearby-course lookup is explicit, optional, approximate, and never required for setup', () => {
  const engine = loadLiveEngine();
  assert.match(html, /id="showNearbyCoursesBtn"[^>]*>Show Nearby Courses/);
  assert.match(html, /Location is requested only when you tap this button/);
  assert.match(app, /navigator\.onLine === false/);
  assert.match(app, /Location was not stored/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*nearbyCourse/i);
  assert.equal(engine.getCourseCoordinates({ latitude: 39.7684, longitude: -86.1581 }).latitude, 39.7684);
  const miles = engine.getDistanceMiles({ latitude: 39.7684, longitude: -86.1581 }, { latitude: 40.2672, longitude: -86.1349 });
  assert.ok(miles > 30 && miles < 40);
});

test('Recent App Errors uses readable labels and sanitized email support while preserving copy fallback', () => {
  assert.match(app, /Last Error:&nbsp;/);
  assert.match(app, /Error Count:&nbsp;/);
  assert.match(app, /mailto:support@dyeledger\.com/);
  assert.match(app, /Sanitized app diagnostics/);
  assert.match(app, /id="emailAppDiagnosticsBtn"[^>]*>Email Support/);
  assert.match(app, /id="copyAppDiagnosticsBtn"[^>]*>Copy Diagnostics/);
  assert.doesNotMatch(app, /paste useful details into ChatGPT/);
});

test('navigation release does not introduce destructive persistence or historical mutation paths', () => {
  assert.doesNotMatch(app, /localStorage\.clear\(\)/);
  assert.doesNotMatch(app, /removeItem\([^)]*(?:match|round)/i);
  assert.match(app, /function captureCurrentSetupDraft\(\)/);
  assert.match(app, /if \(editingMatchId \|\| setupWorkflowMode !== 'create'\) return/);
  assert.match(app, /if \(isFrozenRoundRecord\(match\.roundRecordSnapshot\)\) return match\.roundRecordSnapshot/);
});
