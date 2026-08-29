import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionBare, currentVersionPrefixed, currentVersionRegexEscaped } from './support/release-identity.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('current release identity and immutable assets are aligned', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.equal(manifest.version, currentVersionPrefixed);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.match(app, /buildLabel:\s*'[^']+'/);
  assert.match(worker, new RegExp(`cacheName: 'the-dye-ledger-${currentVersionRegexEscaped}'`));
  assert.match(html, new RegExp(`id="appVersionFooter">${currentVersionRegexEscaped}<`));
  for (const name of currentBrandingAssetNames) {
    assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true);
  }
});

test('the default release gate automatically discovers every test file', () => {
  assert.equal(pkg.scripts.pretest, undefined);
  assert.equal(pkg.scripts.test, 'node --test tests');
  const testFiles = readdirSync(new URL('./', import.meta.url)).filter(name => name.endsWith('.test.js'));
  assert.ok(testFiles.length >= 58);
});

test('Ledger Story fallback reasons are deterministic and auditable', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getLedgerEntryStoryFallbackReason(null, { offline: true, configured: true }), 'offline');
  assert.equal(engine.getLedgerEntryStoryFallbackReason(null, { offline: false, configured: false }), 'service-not-configured');
  assert.equal(engine.getLedgerEntryStoryFallbackReason(new Error('The Story timed out.')), 'timeout');
  assert.equal(engine.getLedgerEntryStoryFallbackReason(new Error('The generated Story could not be verified.')), 'verification-failed');
  assert.equal(engine.getLedgerEntryStoryFallbackReason(new Error('network failed')), 'service-unavailable');
});

test('failed online Story generation falls back without aborting Ledger Entry export', () => {
  const storyPath = app.slice(app.indexOf('async function prepareLedgerEntryStory'), app.indexOf('function buildLegacyRoundSnapshot'));
  assert.match(storyPath, /return buildDeterministicLedgerEntryStory/);
  assert.match(storyPath, /provenance: 'audited-generated-narrative'/);
  assert.doesNotMatch(storyPath, /requires an internet connection|Configure Supabase before generating/);
  assert.match(app, /reportModel\.meta\.story = ledgerStory\.text/);
  assert.match(app, /reportModel\.meta\.storyFallbackReason = ledgerStory\.fallbackReason \|\| null/);
});

test('Player Mode accordion retains the shared DOM-driven save invariant', () => {
  const applyPath = app.slice(app.indexOf('function applyCurrentHoleDomToMatch'), app.indexOf('function persistCurrentHoleEntries'));
  assert.match(applyPath, /querySelectorAll\('input\[data-score-player\]'\)/);
  assert.match(applyPath, /querySelectorAll\('input\[data-stat-player\]\[data-stat-key\], select\[data-stat-player\]\[data-stat-key\]'\)/);
  assert.ok(applyPath.indexOf("querySelectorAll('input[data-score-player]')") < applyPath.indexOf('match.players.forEach'));
  assert.match(app, /data-player-mode-detail-slot/);
  assert.match(app, /'__COLLAPSED__'/);
});
