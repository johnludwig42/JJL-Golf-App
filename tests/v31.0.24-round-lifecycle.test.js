import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { currentBrandingAssetNames, currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('current release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  for (const name of currentBrandingAssetNames) assert.ok(fs.existsSync(new URL(`../branding/${name}`, import.meta.url)));
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
});

test('completion durably clears the live pointer and establishes completed review', () => {
  assert.match(app, /candidateState\.activeMatchId = null/);
  assert.match(app, /state\.activeMatchId = null;[\s\S]{0,900}setCompletedReviewMatch\(candidate\)/);
  assert.match(app, /function isCompletedSummarySession\(match, summaryMatchId = uiState\.completedSummaryMatchId\)/);
  assert.doesNotMatch(app, /function isCompletedSummarySession\([^)]*activeMatchId/);
});

test('review accessor selects a completed round independently and falls back to live play when cleared', () => {
  const engine = loadLiveEngine();
  const live = { id: 'live-round', status: 'active', players: [] };
  const completed = { id: 'completed-round', status: 'complete', completedAt: '2026-09-01T20:00:00.000Z', players: [] };
  engine.seedState({ players: [], courses: [], matches: [live, completed], activeMatchId: live.id });
  engine.setCompletedReviewMatch(completed);
  assert.equal(engine.getCompletedReviewMatch()?.id, completed.id);
  assert.equal(engine.getReviewOrActiveMatch()?.id, completed.id);
  engine.clearCompletedReviewMatch();
  assert.equal(engine.getReviewOrActiveMatch()?.id, live.id);
});

test('completed View is review-only while unfinished Load and Reopen restore live play', () => {
  assert.match(app, /if \(viewId\) \{[\s\S]{0,180}state\.activeMatchId = null;[\s\S]{0,180}setCompletedReviewMatch\(target\)/);
  assert.match(app, /markRoundReopenedForEditing\(target\);[\s\S]{0,180}state\.activeMatchId = target\.id;[\s\S]{0,100}clearCompletedReviewMatch\(\)/);
  assert.match(app, /state\.activeMatchId = selectedId;\s*clearCompletedReviewMatch\(\)/);
});

test('post-round Story and report surfaces resolve the review round', () => {
  assert.match(app, /function renderLeaderboard\(\) \{\s*const match = getReviewOrActiveMatch\(\)/);
  assert.match(app, /function renderRoundRecapControlPanel\(match = getReviewOrActiveMatch\(\)\)/);
  assert.match(app, /const match = matchId \? getMatch\(matchId\) : getReviewOrActiveMatch\(\)/);
  assert.match(app, /Generating Story of the Round…/);
  assert.match(html, /id="postRoundInlineGenerateRecapBtn"/);
});

test('Memory sheet clears fixed chrome and joined completion is visibly host-controlled', () => {
  assert.match(css, /#addMemoryDialog[\s\S]{0,300}z-index:3000/);
  assert.match(html, /id="joinedRoundCompletionMessage"[\s\S]{0,140}Waiting for the host to complete the match/);
  assert.match(app, /show\(joinedCompletionMessage, hasMatch && !isComplete && activeRound && !authority\.allowed\)/);
});

test('joined cloud completion transitions from live play into completed review', () => {
  assert.match(app, /select\('id,status,completed_at,course_snapshot,updated_at'\)/);
  assert.match(app, /meta\.status === 'complete'[\s\S]{0,500}state\.activeMatchId = null;[\s\S]{0,180}setCompletedReviewMatch\(match\)/);
});

test('completed discard is quiet, guarded, and local-only for Shared Match', () => {
  assert.match(html, /id="postRoundInlineDiscardBtn"[^>]*quiet-action/);
  assert.match(app, /Only the Shared Match host can discard the completed round/);
  assert.match(app, /This removes only the copy on this device; it does not delete the Shared Match from the cloud/);
  assert.match(app, /This round includes recorded financial results/);
});
