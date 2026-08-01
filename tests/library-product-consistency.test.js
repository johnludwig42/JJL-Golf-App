import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('Library uses a semantic page and section heading hierarchy', () => {
  assert.match(html, /<header class="card tight-card library-page-header experience-page-header product-tab-header">[\s\S]*?<h2>Library<\/h2>/);
  for (const heading of ['Rounds', 'Courses', 'Players', 'Current Session']) {
    assert.match(html, new RegExp(`<h3>${heading}<\\/h3>`));
  }
  for (const heading of ['Course Actions', 'Add Course Manually', 'Add Tee Manually']) {
    assert.match(html, new RegExp(`<h4(?: id="[^"]+")?>${heading}<\\/h4>`));
  }
  assert.doesNotMatch(html, /future memories and AI recaps/);
});

test('Library and Quick Scoreboard disclosures share touch and focus contracts', () => {
  assert.match(css, /\.library-section-disclosure>summary\{[^}]*min-height:48px/);
  assert.match(css, /\.library-section-disclosure>summary:focus-visible\{/);
  assert.match(css, /\.library-section-disclosure>summary::after\{[^}]*content:'›'/);
  assert.match(css, /\.quick-disclosure>summary\{[^}]*min-height:48px/);
  assert.match(css, /\.quick-disclosure>summary:focus-visible\{/);
  assert.match(css, /\.quick-disclosure>summary::after\{[^}]*content:'›'/);
  assert.match(css, /\.library-maintenance-card>summary,\.library-import-details>summary\{[^}]*min-height:48px/);
  assert.match(css, /\.library-maintenance-card\[open\]>summary::after,\.library-import-details\[open\]>summary::after\{[^}]*content:'›'/);
});

test('round cards separate state, facts, and actions without changing handlers', () => {
  assert.match(app, /round-library-card[^`]*data-round-status=/);
  assert.match(app, /class="library-status-badge"/);
  for (const label of ['Tee', 'Format', 'Progress', 'Players', 'Storage']) {
    assert.match(app, new RegExp(`<b>${label}<\\/b>`));
  }
  assert.match(app, /data-view-match=/);
  assert.match(app, /data-reopen-match=/);
  assert.match(app, /Only the Shared Match host can reopen/);
  assert.match(app, /Continue \/ Refresh/);
  assert.match(app, /data-load-match=/);
  assert.match(app, /data-share-match=/);
  assert.match(app, /data-delete-match=/);
  assert.match(app, /Scorecard PDF/);
  assert.match(app, /class="library-round-result"/);
  assert.match(app, /<b>Result<\/b>/);
  assert.match(app, /Remove Saved Round/);
});

test('course and player cards use consistent metadata and destructive hierarchy', () => {
  assert.match(app, /sourceLabel[^\n]*Cloud \+ device[^\n]*This device/);
  assert.match(app, /class="library-item-more-actions"/);
  assert.match(app, /aria-controls="course-tee-panel-\$\{escapeHtml\(c\.id\)\}"/);
  assert.match(app, /id="course-tee-panel-\$\{escapeHtml\(c\.id\)\}"/);
  assert.match(app, /<summary>More actions<\/summary>/);
  assert.match(app, /Delete from this device/);
  assert.match(app, /Delete cloud copy/);
  assert.match(app, /Delete everywhere/);
  assert.match(app, /aria-label="Player details"/);
  assert.match(app, /<b>Handicap Index<\/b>/);
  assert.match(app, /data-delete-player="\$\{p\.id\}"[^>]*danger-lite|danger-lite" data-delete-player/);
});

test('deleting a reusable tee preserves every saved round', () => {
  const courseHandler = app.slice(app.indexOf("document.getElementById('coursesList').addEventListener"), app.indexOf("document.getElementById('calcCourse').addEventListener"));
  assert.match(courseHandler, /Delete Library Tee/);
  assert.match(courseHandler, /Existing saved rounds and their course snapshots remain unchanged/);
  assert.doesNotMatch(courseHandler, /state\.matches\s*=\s*state\.matches\.filter/);
});

test('Library patterns remain responsive and long-name safe', () => {
  assert.match(css, /\.library-item-identity \.item-title\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.library-item-header\{display:grid/);
  assert.match(css, /@media \(max-width:390px\)[\s\S]*?\.library-item-actions-inline\{display:grid/);
  assert.match(css, /\.library-item-actions-inline button[^}]*min-height:44px/);
  assert.match(css, /\.library-section-disclosure button\{min-height:44px\}/);
  assert.match(css, /\.quick-scoreboard-topbar button\{min-height:44px\}/);
});

test('empty states explain what is missing and the next useful step', () => {
  for (const copy of ['No saved rounds', 'No saved courses', 'No saved players', 'No matching courses']) {
    assert.match(app, new RegExp(copy));
  }
  assert.match(css, /\.library-empty-state\{/);
});
