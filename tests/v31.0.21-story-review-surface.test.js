import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentBrandingAssetNames, currentVersionPrefixed, currentVersionRegexEscaped } from './support/release-identity.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test(`${currentVersionPrefixed} release identity and immutable assets are complete`, () => {
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.equal(existsSync(new URL(`../BUILD_NOTES_${currentVersionPrefixed}.md`, import.meta.url)), true);
  for (const name of currentBrandingAssetNames) assert.equal(existsSync(new URL(`../branding/${name}`, import.meta.url)), true, name);
});

test('an existing draft remains reviewable while generation or a joined-device wait is active', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.isPostRoundStoryReviewDisabled({ hasStory: true, generating: true }), false);
  assert.equal(engine.isPostRoundStoryReviewDisabled({ hasStory: true, joinedWaiting: true }), false);
  assert.equal(engine.isPostRoundStoryReviewDisabled({ hasStory: false, generating: true }), true);
  assert.equal(engine.isPostRoundStoryReviewDisabled({ hasStory: false, joinedWaiting: true }), true);
});

test('Story content and its primary actions precede supporting notes and transparency', () => {
  const engine = loadLiveEngine();
  const markup = engine.buildRoundRecapControls({ id: 'review-round', storageMode: 'local', roundRecapGenerated: 'A saved draft tells the story.' });
  const storyAt = markup.indexOf('id="roundRecapStoryTarget"');
  const actionsAt = markup.indexOf('round-recap-primary-actions');
  const notesAt = markup.indexOf('id="roundRecapNotesBox"');
  const inputsAt = markup.indexOf('round-recap-input-preview');
  assert.ok(storyAt >= 0 && storyAt < actionsAt);
  assert.ok(actionsAt < notesAt && notesAt < inputsAt);
  assert.match(markup, /<details class="round-recap-supporting-details" >/);
  assert.match(markup, /Save Story[\s\S]*Edit[\s\S]*Regenerate Story[\s\S]*Clear Story/);
});

test('a round without a Story exposes generation and opens its supporting inputs', () => {
  const engine = loadLiveEngine();
  const markup = engine.buildRoundRecapControls({ id: 'empty-round', storageMode: 'local' });
  assert.doesNotMatch(markup, /id="roundRecapStoryTarget"/);
  assert.match(markup, /<details class="round-recap-supporting-details" open>/);
  assert.match(markup, />Generate Story<\/button>/);
});

test('Review Story targets the Story itself and compensates for fixed app chrome', () => {
  assert.match(app, /getElementById\(hasStory \? 'roundRecapStoryTarget' : 'roundRecapControls'\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => scrollRoundRecapReviewIntoView\(match\)\)/);
  assert.match(style, /\.round-recap-story-target\s*\{[\s\S]*scroll-margin-top:\s*calc\(var\(--app-chrome-height/);
});

test('complete and early-ended rounds use the same Story review workflow', () => {
  const engine = loadLiveEngine();
  const complete = engine.getPostRoundWorkflowState({ id: 'complete', status: 'complete', storageMode: 'local', roundRecapGenerated: 'Draft.' });
  const early = engine.getPostRoundWorkflowState({ id: 'early', status: 'complete', roundEndReason: 'weather', storageMode: 'local', roundRecapGenerated: 'Draft.' });
  assert.equal(complete.storyAction, 'Review Story');
  assert.equal(early.storyAction, complete.storyAction);
  assert.equal(early.storyDisabled, false);
});

test('the visible early-ending default is also the persisted fallback', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.normalizeEarlyRoundEndReason(), 'darkness');
  assert.equal(engine.normalizeEarlyRoundEndReason('weather'), 'weather');
  assert.equal(engine.normalizeEarlyRoundEndReason('unsupported'), 'darkness');
  assert.match(app, /match\.roundEndReason = normalizeEarlyRoundEndReason\(document\.querySelector/);
});
