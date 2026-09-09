import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const root = resolve('.');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };

function sourceSection(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
}

test('release identity and shared overflow presentation contract are complete', () => {
  assert.equal(pkg.version, currentVersionBare);
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.equal((html.match(/id="quickScoreboardBtn"/g) || []).length, 1);
  assert.match(html, /class="play-overflow-menu classic-play-overflow-menu hidden"/);
  assert.match(app, /class="play-overflow-menu player-mode-overflow-menu hidden"/);
  assert.match(css, /\.play-overflow-menu\{[^}]*width:min\(280px,calc\(100dvw - 32px - env\(safe-area-inset-left,0px\) - env\(safe-area-inset-right,0px\)\)\)[^}]*min-width:0[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.play-overflow-menu \*\{min-width:0;white-space:normal\}/);
  assert.match(css, /\.play-overflow-select-row select\{[^}]*min-height:44px/);
  assert.match(html, /role="group" aria-label="Classic Play options"/);
  assert.match(app, /role="group" aria-label="Player Mode Play options"/);
});

test('Classic menu order is compact and does not duplicate Scoreboard', () => {
  const menu = html.slice(html.indexOf('id="classicPlayOverflowMenu"'), html.indexOf('id="classicHeaderMatchStatus"'));
  const scoring = menu.indexOf('classicRoundScoringModeSelect');
  const stats = menu.indexOf('classicRoundStatModeSelect');
  const divider = menu.indexOf('play-overflow-divider');
  const end = menu.indexOf('endRoundEarlyBtn');
  assert.ok(scoring >= 0 && scoring < stats && stats < divider && divider < end);
  assert.doesNotMatch(menu, /Scoreboard|Complete Round in Round Progress/);
});

test('shared helper owns toggle, outside click, Escape, focus return, and close on both mode changes', () => {
  const helper = sourceSection('function getPlayOverflowMenu', 'function renderHoleSelector');
  assert.match(helper, /function closePlayOverflowMenus/);
  assert.match(helper, /trigger\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(helper, /document\.querySelector\(selector\)\?\.focus/);
  assert.match(helper, /function togglePlayOverflowMenu/);
  assert.match(helper, /trigger\.setAttribute\('aria-expanded', String\(opening\)\)/);
  assert.match(app, /e\.key === 'Escape' && closePlayOverflowMenus\(\{ restoreFocus: true \}\)/);
  assert.match(app, /e\.target\.closest\('\[data-play-overflow-trigger\], \[data-play-overflow-menu\]'\)/);
  assert.match(app, /\['playerModeRoundScoringModeSelect', 'classicRoundScoringModeSelect'\][\s\S]*closePlayOverflowMenus\(\)/);
  assert.match(app, /\['playerModeRoundStatModeSelect', 'classicRoundStatModeSelect'\][\s\S]*closePlayOverflowMenus\(\)/);
});

test('Classic featured competition has a dedicated full-width row and keeps the shared builder', () => {
  assert.match(html, /id="classicHoleContext"[\s\S]*id="classicHeaderActions"[\s\S]*id="classicHeaderMatchStatus"/);
  assert.match(css, /\.classic-header-match-status\{grid-column:1 \/ -1/);
  const selector = sourceSection('function renderHoleSelector', 'function renderSneakySandyPoleyEntry');
  assert.match(selector, /classicContext\.innerHTML = `<div class="classic-hole-meta">\$\{holeMetaText\}<\/div>`/);
  assert.match(selector, /classicMatchStatus\.innerHTML = featuredStatusPair/);
  assert.equal((selector.match(/buildPlayFeaturedStatusPair\(/g) || []).length, 2);
});

function startServer() {
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(root, pathname);
      if (!file.toLowerCase().startsWith(root.toLowerCase())) throw new Error('outside root');
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(readFileSync(file));
    } catch {
      if (!response.headersSent) response.writeHead(404);
      if (!response.writableEnded) response.end('Not found');
    }
  });
  return new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(server)));
}

function sixesFixture() {
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 438 }));
  const tee = { id: 'black', teeName: 'Black', rating: 72, slope: 125, par: 72, holes };
  const course = { id: 'sixes-course', name: 'Sixes Club', tees: [tee] };
  const players = ['Kim Howell', 'Todd E Irwin', 'Brian Warner', 'Phil Bounsall'].map((name, index) => ({ id: `p${index + 1}`, name, index: 5 + index * 3 }));
  const grossByPlayer = [4, 5, 6, 7];
  const match = {
    id: 'sixes-overflow', name: 'Sixes Overflow', date: '2026-09-08', status: 'active', currentHole: 12,
    courseId: course.id, teeId: tee.id, holeCount: 18, format: 'teams', teamCount: 2, playersPerTeam: 2,
    teamNames: ['Brian / Phil', 'Kim / Todd'], allowance: 90, playInputMode: 'CLASSIC', statTrackingMode: 'NONE',
    featuredCompetition: 'sixes', matchStatusGame: 'sixes', storageMode: 'local',
    selectedGames: [{ key: 'sixes', mode: 'points', basis: 'net', playerIds: players.map(player => player.id), pointValue: 1, pointsPerHoleWin: 1, handicapAllowancePercent: 90 }],
    players: players.map((player, index) => ({
      playerId: player.id, team: index < 2 ? 1 : 2, teeId: tee.id,
      scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: holeIndex < 11 ? grossByPlayer[(index + holeIndex) % 4] : null })),
    })),
  };
  return { players, course, match };
}

async function seed(browser, url, data) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__ = true; });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__DYE_LEDGER_LIVE_ENGINE__));
  await page.evaluate(seedData => {
    const engine = window.__DYE_LEDGER_LIVE_ENGINE__;
    const state = engine.seedState({ players: seedData.players, courses: [seedData.course], matches: [seedData.match], activeMatchId: seedData.match.id });
    state.matches[0].courseSnapshot = engine.getCourseSnapshotForMatch(state.matches[0]);
    localStorage.setItem('the-dye-ledger-v20', JSON.stringify(engine.seedState(state)));
  }, data);
  await page.close();
}

async function assertMenuContained(page, kind, width) {
  const triggerSelector = `[data-play-overflow-trigger="${kind}"]`;
  await page.click(triggerSelector);
  const state = await page.evaluate(selector => {
    const trigger = document.querySelector(selector);
    const menu = document.getElementById(trigger.getAttribute('aria-controls'));
    const box = menu.getBoundingClientRect();
    return { expanded: trigger.getAttribute('aria-expanded'), hidden: menu.classList.contains('hidden'), left: box.left, right: box.right, width: box.width, scrollWidth: menu.scrollWidth, clientWidth: menu.clientWidth, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  }, triggerSelector);
  assert.equal(state.expanded, 'true');
  assert.equal(state.hidden, false);
  assert.ok(state.left >= 0, `${kind} menu left ${state.left} at ${width}px`);
  assert.ok(state.right <= width, `${kind} menu right ${state.right} at ${width}px`);
  assert.ok(state.width <= 280.5, `${kind} menu width ${state.width} at ${width}px`);
  assert.ok(state.scrollWidth <= state.clientWidth + 1, `${kind} menu content overflow at ${width}px`);
  assert.equal(state.pageOverflow, false);
  await page.keyboard.press('Escape');
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', {}, triggerSelector);
  assert.equal(await page.evaluate(selector => document.activeElement === document.querySelector(selector), triggerSelector), true);
}

test('both Play menus stay contained and preserve dismissal behavior across boundary widths', { skip: !chrome, timeout: 120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 60000, args: ['--disable-gpu', '--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    await seed(browser, url, sixesFixture());
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'load' });
    await page.click('[data-tab="score"]');
    await page.waitForSelector('[data-play-overflow-trigger="classic"]');
    const featured = await page.evaluate(() => {
      const status = document.getElementById('classicHeaderMatchStatus').getBoundingClientRect();
      const context = document.getElementById('classicHoleContext').getBoundingClientRect();
      return { text: document.getElementById('classicHeaderMatchStatus').textContent, statusWidth: status.width, contextWidth: context.width, statusTop: status.top, contextBottom: context.bottom };
    });
    assert.match(featured.text, /Sixes/i);
    assert.match(featured.text, /pts/i);
    assert.ok(featured.statusWidth > featured.contextWidth);
    assert.ok(featured.statusTop >= featured.contextBottom - 1);

    const widths = [320, 359, 360, 361, 375, 390, 429, 430, 431, 600, 601, 640, 641, 1024];
    for (const width of widths) {
      await page.setViewport({ width, height: width === 1024 ? 768 : 844, deviceScaleFactor: 1 });
      await assertMenuContained(page, 'classic', width);
    }
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await assertMenuContained(page, 'classic', 844);

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.click('[data-play-overflow-trigger="classic"]');
    await page.select('#classicRoundScoringModeSelect', 'PLAYER');
    await page.waitForSelector('[data-play-overflow-trigger="player"]');
    await page.waitForFunction(() => document.activeElement === document.querySelector('[data-play-overflow-trigger="player"]'));
    assert.equal(await page.$eval('[data-play-overflow-trigger="player"]', node => node.getAttribute('aria-expanded')), 'false');

    for (const width of widths) {
      await page.setViewport({ width, height: width === 1024 ? 768 : 844, deviceScaleFactor: 1 });
      await assertMenuContained(page, 'player', width);
    }
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.click('[data-play-overflow-trigger="player"]');
    await page.mouse.click(4, 4);
    assert.equal(await page.$eval('[data-play-overflow-trigger="player"]', node => node.getAttribute('aria-expanded')), 'false');
    await page.click('[data-play-overflow-trigger="player"]');
    await page.select('#playerModeRoundStatModeSelect', 'ENHANCED');
    await page.waitForFunction(() => document.activeElement === document.querySelector('[data-play-overflow-trigger="player"]'));
    assert.equal(await page.$eval('[data-play-overflow-trigger="player"]', node => node.getAttribute('aria-expanded')), 'false');
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
