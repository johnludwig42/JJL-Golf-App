import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionPrefixed, currentVersionRegexEscaped } from './support/release-identity.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../ledger-report/shell.html', import.meta.url), 'utf8');

test(`${currentVersionPrefixed} release identity and immutable assets are complete`, () => {
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.match(html, new RegExp(`id="appVersionFooter">${currentVersionRegexEscaped}`));
  assert.equal(existsSync(new URL(`../BUILD_NOTES_${currentVersionPrefixed}.md`, import.meta.url)), true);
  for (const name of currentBrandingAssetNames) assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true, name);
});

test('a backup warning does not misrepresent a successful primary save', () => {
  const engine = loadLiveEngine();
  assert.deepEqual({ ...engine.getLocalSavePresentation({ storageAvailable: true, lastFailureMessage: '', lastBackupWarning: '' }) }, { label: 'Saved ✓', tone: 'good' });
  assert.deepEqual({ ...engine.getLocalSavePresentation({ storageAvailable: true, lastFailureMessage: '', lastBackupWarning: 'Storage quota exceeded.' }) }, { label: 'Saved · Backup unavailable', tone: 'warning' });
  assert.deepEqual({ ...engine.getLocalSavePresentation({ storageAvailable: false, lastFailureMessage: 'Primary write failed.', lastBackupWarning: '' }) }, { label: 'Save needs attention', tone: 'attention' });
  assert.match(app, /lastFailureMessage = '';\s*localPersistenceDiagnostics\.lastBackupWarning = result\.backupError \|\| ''/);
});

test('round history sorts by round date and then newest completion or update time', () => {
  const engine = loadLiveEngine();
  const rounds = [
    { id: 'older-date', date: '2026-08-29', completedAt: '2026-08-30T20:00:00Z' },
    { id: 'same-day-early', date: '2026-08-30', completedAt: '2026-08-30T15:00:00Z' },
    { id: 'same-day-late', date: '2026-08-30', completedAt: '2026-08-30T19:00:00Z' },
  ];
  assert.deepEqual(rounds.sort(engine.compareRoundLibraryNewestFirst).map(round => round.id), ['same-day-late', 'same-day-early', 'older-date']);
  assert.match(app, /\? 'Active' : 'Paused'/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderMatches'), app.indexOf('function resetFinishRoundConfirmation')), /\? 'Active' : 'Saved'/);
});

test('Ledger actions match scorecard-sized controls and printing guidance is platform accurate', () => {
  assert.match(shell, /border-radius:999px/);
  assert.match(shell, /min-height:44px/);
  assert.match(shell, /font:600 1rem var\(--body\)/);
  assert.match(shell, /desktop print dialog offers Headers and footers/);
  assert.match(shell, /iPhone and iPad, AirPrint does not provide that browser setting/);
  assert.match(shell, /@media\(max-width:700px\)[^{]*\{\.report-nav button\{flex:1 1 calc\(50% - 4px\)/);
});
