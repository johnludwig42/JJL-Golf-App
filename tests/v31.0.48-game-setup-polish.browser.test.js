import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve('.');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2' };

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
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

function setupFixture({ shared = false, gameKey = 'wolf' } = {}) {
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber:index + 1, par:4, strokeIndex:index + 1, yardage:410 }));
  const tee = { id:'blue', teeName:'Blue', rating:72, slope:125, par:72, holes };
  const course = { id:'setup-course', name:'Setup Course', tees:[tee] };
  const players = ['Alpha One','Bravo Two','Charlie Three','Delta Four'].map((name, index) => ({ id:`p${index + 1}`, name, index:index * 4 }));
  const selectedGames = gameKey === 'wolf' ? [{ key:'wolf', basis:'net', playerIds:players.map(player => player.id), allowLoneWolf:true, allowBlindWolf:false, finalHolesRule:'continue', pointValue:1 }] : [];
  const draft = {
    id:'setup-draft', date:'2026-09-12', name:'Wolf Setup Test', courseId:course.id, teeId:tee.id,
    holeCount:18, teamCount:2, playersPerTeam:2, allowance:100, scoringAccessMode:shared ? 'assigned_players' : 'single_device',
    storageMode:shared ? 'shared' : 'local', featuredCompetition:gameKey === 'wolf' ? 'wolf' : 'auto', selectedGames,
    players:players.map((player, slot) => ({ playerId:player.id, team:slot < 2 ? 1 : 2, slot, teeId:tee.id })),
  };
  return { players, course, draft };
}

async function seedSetup(browser, url, fixture) {
  const seedPage = await browser.newPage();
  await seedPage.evaluateOnNewDocument(() => { window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__ = true; });
  await seedPage.goto(url, { waitUntil:'load' });
  await seedPage.waitForFunction(() => Boolean(window.__DYE_LEDGER_LIVE_ENGINE__));
  await seedPage.evaluate(data => {
    const engine = window.__DYE_LEDGER_LIVE_ENGINE__;
    localStorage.clear();
    localStorage.setItem('the-dye-ledger-v20', JSON.stringify(engine.seedState({ players:data.players, courses:[data.course], matches:[], activeMatchId:null })));
    engine.saveSetupDraft(data.draft, localStorage);
  }, fixture);
  await seedPage.close();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(url, { waitUntil:'load' });
  await page.waitForSelector('#matchSubmitBtn:not(.hidden)');
  return { page, errors };
}

test('game guidance and collapsed handicap options preserve edited settings through setup and scoring', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    const fixture = setupFixture({ gameKey:'' });
    fixture.draft.selectedGames = [{ key:'nassau', basis:'net', countingBalls:1, handicapAllowanceMode:'custom', handicapAllowancePercent:85, stakesFront:6, stakesBack:7, stakesOverall:8 }];
    const { page, errors } = await seedSetup(browser, url, fixture);
    await page.setViewport({ width:375, height:812, deviceScaleFactor:1 });
    await page.click('[data-open-setup-destination="games"]');
    const details = '[data-game-advanced="nassau"]';
    assert.equal(await page.$eval(details, node => node.open), false);
    assert.match(await page.$eval(details+' summary', node => node.textContent), /85%/);
    assert.equal(await page.$$eval('.game-choice-description', nodes => nodes.filter(node => node.textContent).length), 12);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.click(details+' summary');
    const allowance = '[data-game-config="nassau"][data-field="handicapAllowancePercent"]';
    await page.click(allowance, { clickCount:3 });
    await page.type(allowance, '80');
    await page.keyboard.press('Tab');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await page.$eval(details+' summary', node => node.textContent), /80%/);
    await page.select('[data-game-config="nassau"][data-field="countingBalls"]', '2');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => document.querySelector('[data-game-config="nassau"][data-field="countingBalls"]')?.value === '2');
    assert.equal(await page.$eval(details, node => node.open), true);
    assert.equal(await page.$eval(allowance, node => node.value), '80');
    await page.click(details+' summary');
    await page.select('#roundPlayInputModeSelect', 'PLAYER');
    await page.waitForFunction(() => document.getElementById('roundPlayInputModeSelect')?.value === 'PLAYER');
    await page.click('#setupDestinationBackBtn');
    await page.click('#matchSubmitBtn');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length === 1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
    const game = saved.selectedGames.find(game => game.key === 'nassau');
    assert.equal(game.handicapAllowancePercent, 80);
    assert.equal(game.countingBalls, 2);
    assert.deepEqual([game.stakesFront, game.stakesBack, game.stakesOverall].map(Number), [6,7,8]);
    await page.click('[data-tab="score"]');
    await page.waitForSelector('.player-mode-more-score input');
    const scoreInput = '.player-mode-more-score input';
    assert.match(await page.$eval(scoreInput, node => node.getAttribute('aria-label')), /Other gross score/);
    await page.click(scoreInput);
    await page.type(scoreInput, '9');
    await page.keyboard.press('Tab');
    await page.waitForSelector('.player-mode-more-score.is-active');
    assert.equal(await page.$eval('.player-mode-more-score.is-active>span', node => getComputedStyle(node).color), 'rgb(255, 255, 255)');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
