import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionPrefixed, currentVersionRegexEscaped } from './support/release-identity.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const report = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');

test(`${currentVersionPrefixed} release identity and immutable assets are complete`, () => {
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.match(html, new RegExp(`id="appVersionFooter">${currentVersionRegexEscaped}`));
  assert.equal(existsSync(new URL(`../BUILD_NOTES_${currentVersionPrefixed}.md`, import.meta.url)), true);
  for (const name of currentBrandingAssetNames) assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true, name);
});

test('automatic Story eligibility protects existing work, offline rounds, and joined devices', () => {
  const engine = loadLiveEngine();
  const local = { id: 'local', storageMode: 'local' };
  assert.deepEqual({ ...engine.getAutomaticRoundRecapEligibility(local, { online: true }) }, { eligible: true, reason: 'ready' });
  assert.equal(engine.getAutomaticRoundRecapEligibility({ ...local, roundRecapGenerated: 'Draft' }, { online: true }).reason, 'story-exists');
  assert.equal(engine.getAutomaticRoundRecapEligibility({ ...local, roundRecapFinal: 'Saved' }, { online: true }).reason, 'story-exists');
  assert.equal(engine.getAutomaticRoundRecapEligibility(local, { online: false }).reason, 'offline');
  assert.equal(engine.getAutomaticRoundRecapEligibility({ id: 'joined', storageMode: 'shared' }, { online: true, isHost: false }).reason, 'joined-device');
  assert.equal(engine.getAutomaticRoundRecapEligibility({ id: 'host', storageMode: 'shared' }, { online: true, isHost: true }).eligible, true);
});

test('one Finish Up workflow replaces duplicate post-round prompts and export chooser', () => {
  assert.equal((html.match(/id="postRoundActionsInline"/g) || []).length, 1);
  assert.match(html, /<h2>Finish up<\/h2>/);
  assert.doesNotMatch(html, /id="postRoundActionsPrompt"/);
  assert.doesNotMatch(html, /id="scoreboardPrintViewSelect"/);
  assert.doesNotMatch(html, /id="scoreboardShareRoundBtn"/);
  assert.match(html, /id="postRoundInlineClassicScorecardBtn"/);
});

test('completion schedules one deduplicated draft request without touching a saved Story', () => {
  assert.match(app, /const roundRecapGenerationInFlight = new Map\(\)/);
  assert.match(app, /const existing = roundRecapGenerationInFlight\.get\(key\);\s*if \(existing\) return existing/);
  assert.match(app, /scheduleAutomaticRoundRecap\(candidate\)/);
  assert.match(app, /if \(!String\(match\.roundRecapFinal \|\| ''\)\.trim\(\)\) match\.roundRecap = recap/);
  assert.match(app, /automatic: true, silent: true/);
});

test('Ledger preview remains available without a saved Story but cannot be finalized', () => {
  assert.match(app, /story-not-saved/);
  assert.match(app, /reportModel\.meta\.storyApprovalRequired = !savedStory/);
  assert.match(report, /Save Story to finalize/);
  assert.match(report, /Preview uses a verified facts-only Story/i);
});

test('manual Story recovery remains available after automatic service failure', () => {
  assert.match(app, /Story not generated\. Generate it when you are ready\./);
  assert.match(app, /if \(automatic\)[\s\S]*return \{ ok: false, error: err, automatic: true \}/);
  assert.match(html, /id="postRoundInlineGenerateRecapBtn"/);
});
