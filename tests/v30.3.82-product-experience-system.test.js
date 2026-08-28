import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const notes = readFileSync(new URL('../BUILD_NOTES_v30.3.82.md', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../docs/PRODUCT_EXPERIENCE_SYSTEM_v30.3.82.md', import.meta.url), 'utf8');

test('Scores, Library, and More use one shared overview and focused-destination grammar', () => {
  for (const tab of ['leaderboard', 'courses', 'settings']) {
    const start = html.indexOf(`id="${tab}"`);
    assert.ok(start >= 0, `${tab} exists`);
    const nextPanel = html.indexOf('<section id=', start + 20);
    const source = html.slice(start, nextPanel < 0 ? html.length : nextPanel);
    assert.match(source, /data-experience-overview/);
    assert.match(source, /data-experience-destination-header/);
    assert.match(source, /data-experience-back/);
    assert.match(source, /data-experience-target=/);
  }
  assert.ok((html.match(/data-experience-section=/g) || []).length >= 15);
  assert.match(app, /function openExperienceDestination\(tabId, destination/);
  assert.match(app, /function closeExperienceDestination\(tabId/);
  assert.match(css, /experience-panel:not\(\[data-active-destination\]\)>\[data-experience-section\]/);
});

test('Match, Scores, Library, Insights, and More share one tab-identity header treatment', () => {
  assert.match(html, /id="matchSectionHeader" class="card tight-card match-section-header product-tab-header"/);
  assert.equal((html.match(/class="[^"]*\bproduct-tab-header\b(?!-)[^"]*"/g) || []).length, 5);
  assert.match(css, /\.product-tab-header\{padding:16px!important;border-left:0!important;background:#fff!important;text-align:left\}/);
  assert.match(css, /\.product-tab-header h2\{margin:0 0 5px!important;font-size:1\.35rem!important;line-height:1\.2\}/);
  assert.match(css, /\.product-tab-header-copy\{flex:1 1 auto;width:100%;min-width:0;text-align:left\}/);
});

test('the destination model preserves distinct tab jobs and leaves Play unchanged', () => {
  for (const label of ['Results', 'Scorecards', 'Statistics', 'Round Story', 'Rounds', 'Courses', 'Players', 'Current Session', 'Account &amp; Security', 'Preferences', 'Golf Utilities', 'Shared Match', 'App Support']) {
    assert.ok(html.includes(label), `includes ${label}`);
  }
  const play = html.slice(html.indexOf('<section id="score"'), html.indexOf('<section id="leaderboard"'));
  assert.doesNotMatch(play, /data-experience-target|data-experience-section|experience-overview/);
  assert.match(contract, /The shared system does not make these tabs semantically identical/);
});

test('navigation remains ephemeral and introduces no persistence or cloud mutation path', () => {
  const navigation = app.slice(app.indexOf('const EXPERIENCE_DESTINATIONS'), app.indexOf('function activateTab'));
  assert.doesNotMatch(navigation, /persist\(|localStorage|supabase\.|upload|deleteMatch|deleteCourse|RoundRecord/);
  assert.match(notes, /No calculation, settlement, scoring, Shared Match, RoundRecord/);
  assert.match(contract, /Destination selection is ephemeral presentation state/);
});

test('print restores the complete Scores record independent of selected destination', () => {
  assert.match(css, /@media print\{\.experience-panel>\[data-experience-section\]\{display:block!important\}/);
  assert.match(html, /data-experience-section="results"/);
  assert.match(html, /data-experience-section="scorecards"/);
  assert.match(html, /data-experience-section="statistics"/);
  assert.match(html, /data-experience-section="story"/);
});

test('v30.3.82 Product Experience remains present after the current PWA upgrade', () => {
  assert.match(app, /version: 'v31\.0\.09'/);
  assert.match(html, /apple-touch-icon-v31\.0\.09\.png/);
  assert.match(html, /style\.css\?v=31\.0\.09/);
  assert.match(notes, /v30\.3\.82/);
});
