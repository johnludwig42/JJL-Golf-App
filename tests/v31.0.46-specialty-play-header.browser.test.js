import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
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
      response.writeHead(200, { 'Content-Type':contentTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(readFileSync(file));
    } catch {
      if (!response.headersSent) response.writeHead(404);
      if (!response.writableEnded) response.end('Not found');
    }
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

function specialtyFixture({ game = 'sixes', mode = 'CLASSIC', sixesMode = 'points', wolfCurrentChoice = '' } = {}) {
  const holes = Array.from({ length:18 }, (_, index) => ({ holeNumber:index + 1, par:4, strokeIndex:index + 1, yardage:410 }));
  const tee = { id:'blue', teeName:'Blue', rating:72, slope:125, par:72, holes };
  const course = { id:'header-course', name:'Header Course', tees:[tee] };
  const players = ['Alpha One','Bravo Two','Charlie Three','Delta Four'].map((name, index) => ({ id:`p${index + 1}`, name, index:index * 4 }));
  const playerIds = players.map(player => player.id);
  const selectedGames = game === 'nine_point'
    ? [{ key:'nine_point', basis:'gross', playerIds:playerIds.slice(0, 3), stakePerPoint:1 }]
    : game === 'wolf'
      ? [{ key:'wolf', basis:'gross', playerIds, allowLoneWolf:true, allowBlindWolf:false, finalHolesRule:'continue', pointValue:1 }]
      : [{ key:'sixes', mode:sixesMode, basis:'gross', playerIds, pointValue:1, pointsPerHoleWin:1, stakePerSegment:5 }];
  const match = {
    id:`${game}-${mode}-${sixesMode}`, name:'Specialty Header', date:'2026-09-12', status:'active', currentHole:7,
    courseId:course.id, teeId:tee.id, holeCount:18, format:'teams', teamCount:2, playersPerTeam:2, allowance:100,
    playInputMode:mode, statTrackingMode:'NONE', storageMode:'local', featuredCompetition:game, matchStatusGame:game, selectedGames,
    wolfInputs:game === 'wolf' ? Object.fromEntries([
      ...holes.slice(0, 6).map((hole, index) => [String(hole.holeNumber), { choice:'partner', partnerPlayerId:playerIds[(index + 1) % 4], declaredAt:'saved' }]),
      ...(wolfCurrentChoice ? [['7', { choice:wolfCurrentChoice, partnerPlayerId:wolfCurrentChoice === 'partner' ? 'p4' : '', declaredAt:'saved' }]] : []),
    ]) : {},
    players:players.map((player, playerIndex) => ({
      playerId:player.id, team:playerIndex < 2 ? 1 : 2, slot:playerIndex, teeId:tee.id,
      scores:holes.map((hole, holeIndex) => ({ holeNumber:hole.holeNumber, gross:holeIndex < 6 ? 4 + ((playerIndex + holeIndex) % 3) : null })),
    })),
  };
  return { players, course, match };
}

async function openPlay(browser, url, fixture, width = 375) {
  const seedPage = await browser.newPage();
  await seedPage.evaluateOnNewDocument(() => { window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__ = true; });
  await seedPage.goto(url, { waitUntil:'load' });
  await seedPage.waitForFunction(() => Boolean(window.__DYE_LEDGER_LIVE_ENGINE__));
  await seedPage.evaluate(data => {
    const engine = window.__DYE_LEDGER_LIVE_ENGINE__;
    const state = engine.seedState({ players:data.players, courses:[data.course], matches:[data.match], activeMatchId:data.match.id });
    state.matches[0].courseSnapshot = engine.getCourseSnapshotForMatch(state.matches[0]);
    localStorage.setItem('the-dye-ledger-v20', JSON.stringify(engine.seedState(state)));
  }, fixture);
  await seedPage.close();
  const page = await browser.newPage();
  await page.setViewport({ width, height:844, deviceScaleFactor:1 });
  await page.goto(url, { waitUntil:'load' });
  await page.click('[data-tab="score"]');
  await page.waitForSelector(fixture.match.playInputMode === 'PLAYER' ? '#playerModeHoleHeader:not(.hidden)' : '#activeHoleScoringTop:not(.hidden)');
  return page;
}

test('Sixes shows the current segment pairing before standings in Classic and Player Mode', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    for (const mode of ['CLASSIC','PLAYER']) {
      for (const sixesMode of ['points','segments']) {
        const page = await openPlay(browser, url, specialtyFixture({ game:'sixes', mode, sixesMode }));
        const result = await page.evaluate(() => {
          const pairing = document.querySelector('.classic-header-current-pairing,.player-mode-header-current-pairing');
          const standings = document.querySelector('.classic-header-match-status,.player-mode-header-match-status');
          return { pairing:pairing?.textContent || '', standings:standings?.textContent || '', pairingTop:pairing?.getBoundingClientRect().top, standingsTop:standings?.getBoundingClientRect().top, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth };
        });
        assert.match(result.pairing, /Segment 2 pairing/i);
        assert.match(result.pairing, /Alpha One & Charlie Three vs Bravo Two & Delta Four/);
        assert.match(result.standings, /Sixes standings/i);
        assert.ok(result.pairingTop <= result.standingsTop);
        assert.equal(result.overflow, false);
        if (mode === 'CLASSIC' && sixesMode === 'points') await page.screenshot({ path:join(tmpdir(), 'dye-ledger-sixes-header-classic.png'), fullPage:true });
        if (mode === 'PLAYER' && sixesMode === 'points') await page.screenshot({ path:join(tmpdir(), 'dye-ledger-sixes-header-player.png'), fullPage:true });
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});

test('Wolf identifies the golfer who must declare in both Play modes', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    for (const mode of ['CLASSIC','PLAYER']) {
      const page = await openPlay(browser, url, specialtyFixture({ game:'wolf', mode }));
      const header = await page.$eval('.classic-header-current-pairing,.player-mode-header-current-pairing', node => node.textContent || '');
      assert.match(header, /Current Wolf/i);
      assert.match(header, /Charlie Three to declare/);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});

test('Wolf shows the declared partnership in both Play modes', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    for (const mode of ['CLASSIC','PLAYER']) {
      const page = await openPlay(browser, url, specialtyFixture({ game:'wolf', mode, wolfCurrentChoice:'partner' }));
      const header = await page.$eval('.classic-header-current-pairing,.player-mode-header-current-pairing', node => node.textContent || '');
      assert.match(header, /Current pairing/i);
      assert.match(header, /Charlie Three \/ Delta Four vs Alpha One \/ Bravo Two/);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});

test('9-Point uses a standings label, all three players, and no pairing row', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    for (const mode of ['CLASSIC','PLAYER']) {
      const page = await openPlay(browser, url, specialtyFixture({ game:'nine_point', mode }));
      assert.equal(await page.$('.classic-header-current-pairing,.player-mode-header-current-pairing'), null);
      const standings = await page.$eval('.classic-header-match-status,.player-mode-header-match-status', node => node.textContent || '');
      assert.match(standings, /9-Point standings/i);
      for (const name of ['Alpha','Bravo','Charlie']) assert.match(standings, new RegExp(name));
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
