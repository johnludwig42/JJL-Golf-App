import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const branding = readFileSync(new URL('../docs/BRANDING.md', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

const players = [
  { id: 'p1', name: 'Alexandra Very Long Player Name', index: 4 },
  { id: 'p2', name: 'Blake', index: 8 },
  { id: 'p3', name: 'Casey', index: 12 },
  { id: 'p4', name: 'Drew', index: 16 },
];

function fixture(holeCount = 18, status = 'active') {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: [4, 4, 3, 5][index % 4], strokeIndex: index + 1, yardage: 350 + index * 5 }));
  const course = { id: 'course', name: 'Scroll Club', tees: [{ id: 'blue', teeName: 'Blue', rating: 72, slope: 125, par: 72, holes }] };
  const match = {
    id: `scroll-${holeCount}-${status}`, courseId: 'course', teeId: 'blue', holeCount, status,
    format: 'teams', teamCount: 2, playersPerTeam: 2, teamNames: ['A Team Name Long Enough To Test Bounds', 'Bravo'],
    selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }],
    players: players.map((player, index) => ({
      playerId: player.id, team: index < 2 ? 1 : 2, teeId: 'blue',
      scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: holeIndex < holeCount ? hole.par + ((holeIndex + index) % 3) - 1 : null })),
    })),
  };
  const live = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id }).matches[0];
  const metrics = engine.computeMatchMetrics(live);
  if (status === 'complete') {
    live.completedAt = '2026-07-15T20:00:00.000Z';
    live.roundRecordSnapshot = engine.buildFrozenRoundRecord(live, metrics, live.completedAt);
  }
  return { engine, match: live, metrics };
}

function count(value, pattern) {
  return (String(value).match(pattern) || []).length;
}

test('Classic Scorecard has one shared focusable scroller with sticky descriptive columns and complete 18-hole totals', () => {
  const { engine, match, metrics } = fixture(18);
  const classic = engine.buildClassicScorecard(match, metrics, { readOnly: true });
  assert.equal(count(classic, /data-scroll-table="classic-scorecard"/g), 1);
  assert.equal(count(classic, /class="scorecard-wrap table-scroll-region"/g), 1);
  assert.match(classic, /tabindex="0" role="region" aria-label="Classic scorecard; scroll horizontally to view all holes"/);
  for (const column of ['H1', 'H18', 'Out', 'In', 'Total']) assert.match(classic, new RegExp(`>${column}<`));
  assert.match(classic, /scorecard-sticky-name/);
  assert.match(classic, /scorecard-sticky-team/);
  assert.match(css, /\.scorecard-table\{width:100%;border-collapse:separate;border-spacing:0;min-width:1080px/);
  assert.match(css, /\.quick-classic-scorecard \.scorecard-sticky-team\{[^}]*min-width:96px[^}]*max-width:96px/);
  assert.match(css, /\.quick-classic-scorecard \.scorecard-table th:nth-child\(2\)[^}]*\{left:128px\}/);
});

test('9-hole and completed historical Quick Scoreboards retain one bounded Classic Scorecard scroller', () => {
  for (const [holeCount, status] of [[9, 'active'], [18, 'complete']]) {
    const { engine, match, metrics } = fixture(holeCount, status);
    const before = JSON.stringify(match.roundRecordSnapshot || null);
    const view = engine.buildQuickScoreboardView(match, metrics, { quickScoreboard: { classicScorecardExpanded: true, scoreDistributionExpanded: true } });
    assert.equal(count(view, /data-scroll-table="classic-scorecard"/g), 1);
    assert.match(view, /quick-classic-scorecard" open/);
    assert.match(view, />Out</);
    assert.match(view, />Total</);
    if (holeCount === 18) assert.match(view, />H18</);
    else assert.doesNotMatch(view, />In</);
    assert.equal(JSON.stringify(match.roundRecordSnapshot || null), before);
  }
  assert.match(css, /\.quick-scoreboard-modal\{[\s\S]*?max-width:100%;[\s\S]*?min-width:0;[\s\S]*?overflow-y:auto;[\s\S]*?overflow-x:hidden;/);
  assert.match(css, /\.quick-scoreboard-body\{[^}]*min-width:0[^}]*overflow-x:hidden/);
  assert.match(css, /\.quick-scoreboard-body\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.quick-scoreboard-body>\*\{min-width:0;max-width:100%\}/);
  assert.match(css, /html\.quick-scoreboard-open,body\.quick-scoreboard-open\{overflow:hidden!important/);
});

test('active and frozen Score Distribution use the same single scroll owner with sticky Player and every statistic', () => {
  for (const status of ['active', 'complete']) {
    const { engine, match, metrics } = fixture(18, status);
    const before = JSON.stringify(match.roundRecordSnapshot || null);
    const view = engine.buildQuickScoreboardView(match, metrics, { quickScoreboard: { scoreDistributionExpanded: true } });
    assert.equal(count(view, /data-scroll-table="score-distribution"/g), 1);
    assert.equal(count(view, /class="score-distribution-scroll table-scroll-region top-gap"/g), 1);
    assert.doesNotMatch(view, /quick-scroll-panel/);
    assert.match(view, /tabindex="0" role="region" aria-label="Score distribution; scroll horizontally to view all statistics"/);
    for (const column of ['Player', 'Eagle', 'Birdie', 'Par', 'Bogey', 'Double Bogey', 'Other']) assert.match(view, new RegExp(`>${column}<`));
    assert.match(view, /title="Alexandra Very Long Player Name"/);
    assert.equal(JSON.stringify(match.roundRecordSnapshot || null), before);
  }
  assert.match(css, /\.score-distribution-table\{[^}]*width:max-content[^}]*min-width:max\(680px,100%\)/);
  assert.match(css, /\.score-distribution-table th:first-child,[^}]*max-width:164px[^}]*position:sticky;left:0/);
  assert.match(css, /\.score-distribution-table th:not\(:first-child\),[^}]*min-width:78px/);
  assert.match(css, /\.quick-score-distribution>\.score-distribution-scroll\{[^}]*width:calc\(100% - 24px\)/);
});

test('shared table-scroll contract supports touch, trackpad, keyboard focus, and visible focus without nested owners', () => {
  assert.match(css, /\.table-scroll-region\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow-x:auto[^}]*overflow-y:hidden[^}]*-webkit-overflow-scrolling:touch[^}]*overscroll-behavior-inline:contain[^}]*touch-action:pan-x pan-y/);
  assert.match(css, /\.table-scroll-region:focus-visible\{outline:3px solid/);
  assert.match(css, /\.quick-scoreboard-backdrop\{[\s\S]*?overflow-x:hidden;[\s\S]*?overflow-y:auto;/);
  assert.doesNotMatch(app, /quick-scroll-panel/);
  assert.match(app, /document\.addEventListener\('keydown', handleTableScrollRegionKeydown\)/);
  const { engine } = fixture(18);
  const region = { scrollWidth: 920, clientWidth: 267, scrollLeft: 0, closest: selector => selector === '.table-scroll-region' ? region : null };
  let prevented = 0;
  assert.equal(engine.handleTableScrollRegionKeydown({ target: region, key: 'End', preventDefault: () => { prevented += 1; } }), true);
  assert.equal(region.scrollLeft, 653);
  assert.equal(engine.handleTableScrollRegionKeydown({ target: region, key: 'Home', preventDefault: () => { prevented += 1; } }), true);
  assert.equal(region.scrollLeft, 0);
  assert.equal(engine.handleTableScrollRegionKeydown({ target: region, key: 'ArrowRight', preventDefault: () => { prevented += 1; } }), true);
  assert.equal(region.scrollLeft, 48);
  assert.equal(prevented, 3);
});

function pngDimensions(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('header, Apple, desktop PWA, favicon, worker cache, and branding documentation agree without changing artwork bytes', () => {
  assert.match(htmlSource, /<img src="\.\/branding\/apple-touch-icon\.png" alt="The Dye Ledger"/);
  assert.equal(count(htmlSource, /rel="apple-touch-icon"/g), 1);
  assert.match(htmlSource, /rel="apple-touch-icon"[^>]+href="\.\/branding\/apple-touch-icon\.png"/);
  assert.doesNotMatch(htmlSource, /brand-mark[\s\S]{0,200}app-icon-192/);

  const expected = [
    ['./branding/app-icon-192.png?v=30.3.73&rev=1', '192x192'],
    ['./branding/app-icon-512.png?v=30.3.73&rev=1', '512x512'],
    ['./branding/apple-touch-icon.png', '180x180'],
  ];
  assert.deepEqual(manifest.icons.map(icon => [icon.src, icon.sizes]), expected);
  for (const [src, sizes] of expected) {
    const relative = src.replace(/^\.\//, '').split('?')[0];
    const path = new URL(`../${relative}`, import.meta.url);
    assert.equal(existsSync(path), true);
    const bytes = readFileSync(path);
    const [width, height] = sizes.split('x').map(Number);
    assert.deepEqual(pngDimensions(bytes), { width, height });
    assert.match(worker, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(worker, /cacheName: 'the-dye-ledger-v30\.3\.73'/);
  assert.match(htmlSource, /favicon-32\.png\?v=30\.3\.73&amp;rev=1/);
  assert.match(htmlSource, /favicon-16\.png\?v=30\.3\.73&amp;rev=1/);

  const master = readFileSync(new URL('../branding/app-icon-master.png', import.meta.url));
  const desktop512 = readFileSync(new URL('../branding/app-icon-512.png', import.meta.url));
  assert.equal(sha256(master), sha256(desktop512));
  assert.equal(sha256(desktop512), '1b0a37cd22c82572c8f078e8e951a69838052eaa886ad79019393dfaa423eb38');
  assert.equal(sha256(readFileSync(new URL('../branding/app-icon-192.png', import.meta.url))), 'faaa29cf23395b54f256a378040692fa1c20f32aa86892c894ae8dd6b6203965');
  assert.equal(sha256(readFileSync(new URL('../branding/apple-touch-icon.png', import.meta.url))), '5cb89e80dc9037f063f6f4c0eab700c5154ee1625033d2ae4ec445618d090507');
  assert.match(branding, /Desktop PWA 192 icon/);
  assert.match(branding, /Desktop PWA 512 icon/);
  assert.match(branding, /uninstall and reinstall/i);
  assert.match(branding, /favicon may remain cached separately/i);
});
