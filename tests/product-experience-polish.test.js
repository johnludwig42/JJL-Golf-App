import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('Match setup presents the accepted destination-based round-preparation hierarchy without a snapshot hero', () => {
  const labels = ['Course &amp; Round', 'Players', 'Games &amp; Stat Tracking', 'Scoring Control', 'Advanced Options'];
  let cursor = -1;
  for (const label of labels) {
    const next = html.indexOf(label, cursor + 1);
    assert.ok(next > cursor, `${label} should follow the previous Match section`);
    cursor = next;
  }
  assert.doesNotMatch(html, /Today's Match|Today's Round|Round snapshot|setup-round-hero/);
  assert.match(html, /Player Handicap Preview/);
  assert.doesNotMatch(html, /Playing handicap preview/i);
  assert.match(html, /id="matchSubmitBtn"[^>]+aria-label="Start round"[^>]*>Start Round</);
  assert.doesNotMatch(html, /data-setup-destination="advanced" open/);
  assert.match(html, /id="setupDestinationBackBtn"/);
  for (const label of ['Smart Score Advance', 'Stat Tracking', 'Shared Match', 'Scoring Control']) assert.match(html, new RegExp(label));
  assert.doesNotMatch(app, /Tap an item to finish setup/);
  assert.doesNotMatch(html, /roundReadinessPanel/);
});

test('game selection is grouped by the golfer mental model', () => {
  for (const label of ['Nassau & Match Play', 'Stroke & Hole Games', 'Specialty Games']) assert.match(app, new RegExp(label.replace('&', '&')));
  assert.match(app, /keys: \['nassau', 'singles_match', 'individual_match', 'team_match'\]/);
  assert.match(app, /keys: \['team_stroke', 'skins', 'net_skins', 'greenies'\]/);
  assert.match(app, /keys: \['sneaky_sandy_poley', 'nine_point'\]/);
});

test('accepted Press terminology is used in setup and preferences', () => {
  assert.match(html, /Maximum Re-Presses/);
  assert.match(app, /Maximum Re-Presses/);
  assert.doesNotMatch(html, /Maximum depth/i);
  assert.doesNotMatch(app, /Maximum depth/i);
});

test('Library course tools are visually cohesive and maintenance is disclosed', () => {
  for (const id of ['courseEditorCard', 'teeEditorCard', 'scorecardImportCard']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /library-course-card library-course-actions-card/);
  assert.match(html, /id="cloudCoursesStatusMore" aria-hidden="true"/);
  assert.match(css, /#courses\.panel\.active\{display:flex;flex-direction:column/);
});

test('Home Screen branding is shared by the header while install assets remain complete', () => {
  assert.match(html, /src="\.\/branding\/apple-touch-icon-v31\.0\.03\.png" alt="The Dye Ledger"/);
  assert.match(html, /href="\.\/branding\/apple-touch-icon-v31\.0\.03\.png"/);
  assert.deepEqual(manifest.icons.map(icon => icon.src), [
    './branding/app-icon-192-v31.0.03.png',
    './branding/app-icon-512-v31.0.03.png',
    './branding/apple-touch-icon-v31.0.03.png',
  ]);
  for (const asset of ['app-icon-192-v31.0.03.png', 'app-icon-512-v31.0.03.png', 'apple-touch-icon-v31.0.03.png', 'favicon-32-v31.0.03.png', 'favicon-16-v31.0.03.png']) {
    assert.match(serviceWorker, new RegExp(`branding/${asset.replace('.', '\\.')}`));
  }
});

test('Install App supports native prompting and a dismissed iPhone instruction path', () => {
  assert.match(html, /id="installBtn"[^>]*>Install App</);
  assert.match(html, /id="iosInstallDialog"/);
  assert.match(html, /Add to Home Screen/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /appinstalled/);
  assert.match(app, /IOS_INSTALL_DISMISSAL_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(app, /await prompt\.userChoice;\s+deferredPrompt = null;/);
});
