import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve('.');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };

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

function fixture(playInputMode) {
  const holes = name => Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: name === 'Blue' ? 400 : 320 }));
  const blue = { id: 'blue', teeName: 'Blue', rating: 36, slope: 125, par: 36, holes: holes('Blue') };
  const red = { id: 'red', teeName: 'Red', rating: 34, slope: 115, par: 36, holes: holes('Red') };
  const combo = {
    id: 'combo', teeName: 'Blue / Red Combo', rating: 35, slope: 120, par: 36, isCombo: true,
    holes: blue.holes.map((hole, index) => ({ ...(index % 2 ? red.holes[index] : hole) })),
    comboSources: blue.holes.map((hole, index) => ({ holeNumber: hole.holeNumber, sourceTeeId: index % 2 ? red.id : blue.id })),
  };
  const players = [{ id: 'p1', name: 'John', index: 8 }, { id: 'p2', name: 'Tom', index: 12 }];
  const course = { id: 'combo-course', name: 'Combo Club', tees: [blue, red, combo] };
  const scores = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, gross: index === 1 ? 4 : null }));
  const match = {
    id: `combo-${playInputMode.toLowerCase()}`, name: 'Combo Test', date: '2026-09-07', status: 'active', currentHole: 2,
    courseId: course.id, teeId: combo.id, holeCount: 9, format: 'teams', teamCount: 2, playersPerTeam: 1,
    teamNames: ['Blue Team', 'Gold Team'], allowance: 90, playInputMode, featuredCompetition: 'nassau', matchStatusGame: 'nassau',
    selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 1, handicapAllowancePercent: 90 }], storageMode: 'local',
    players: players.map((player, index) => ({ playerId: player.id, team: index + 1, teeId: combo.id, scores: structuredClone(scores) })),
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
    const match = state.matches[0];
    match.courseSnapshot = engine.getCourseSnapshotForMatch(match);
    const normalized = engine.seedState(state);
    localStorage.setItem('the-dye-ledger-v20', JSON.stringify(normalized));
  }, data);
  await page.close();
}

test('Player combo tee stays visible when collapsed and Classic header aligns at phone width', { skip: !chrome }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 60000, args: ['--disable-gpu', '--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    await seed(browser, url, fixture('PLAYER'));
    const playerPage = await browser.newPage();
    await playerPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await playerPage.goto(url, { waitUntil: 'load' });
    await playerPage.click('[data-tab="score"]');
    try {
      await playerPage.waitForSelector('.player-mode-hole-tee', { timeout: 8000 });
    } catch (error) {
      const diagnostic = await playerPage.evaluate(() => ({
        activeMatchId: localStorage.getItem('the-dye-ledger-v20')?.slice(0, 240),
        scoreEmpty: document.getElementById('scoreEntryEmpty')?.textContent,
        scoreWrapHidden: document.getElementById('scoreEntryWrap')?.classList.contains('hidden'),
        selectedMode: document.getElementById('playInputModeSelect')?.value,
        playerRows: document.querySelectorAll('[data-player-mode-row]').length,
      }));
      throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
    }
    const teeLabels = await playerPage.$$eval('.player-mode-hole-tee', nodes => nodes.map(node => node.textContent.trim()));
    assert.deepEqual(teeLabels, ['Red · 320y', 'Red · 320y']);
    assert.equal(await playerPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await playerPage.close();

    await seed(browser, url, fixture('CLASSIC'));
    const classicPage = await browser.newPage();
    await classicPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await classicPage.goto(url, { waitUntil: 'load' });
    await classicPage.click('[data-tab="score"]');
    await classicPage.waitForSelector('.classic-header-secondary');
    const layout = await classicPage.evaluate(() => {
      const context = document.getElementById('classicHoleContext').getBoundingClientRect();
      const actions = document.getElementById('classicHeaderActions').getBoundingClientRect();
      const save = document.getElementById('classicHeaderSaveState').getBoundingClientRect();
      const scoreboard = document.getElementById('quickScoreboardBtn').getBoundingClientRect();
      const overflow = document.querySelector('[data-classic-play-overflow]').getBoundingClientRect();
      return {
        aligned: Math.abs(context.top - actions.top) <= 2 && Math.abs((save.top + save.height / 2) - (scoreboard.top + scoreboard.height / 2)) <= 2 && Math.abs(scoreboard.top - overflow.top) <= 2,
        noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        tops: { context: context.top, actions: actions.top, save: save.top, scoreboard: scoreboard.top, overflow: overflow.top },
      };
    });
    assert.equal(layout.aligned, true, JSON.stringify(layout.tops));
    assert.equal(layout.noOverflow, true);
    await classicPage.close();
  } finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
