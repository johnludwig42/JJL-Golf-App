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

test('local Wolf setup submits, persists once, and can be edited without a finalization error', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let page;
  try {
    const seeded = await seedSetup(browser, url, setupFixture());
    page = seeded.page;
    const readiness = await page.evaluate(() => ({
      overall:document.getElementById('setupHubOverallStatus')?.textContent || '',
      players:document.querySelector('[data-setup-status="players"]')?.textContent || '',
      games:document.querySelector('[data-setup-status="games"]')?.textContent || '',
    }));
    assert.deepEqual(readiness, { overall:'Ready to play', players:'Ready', games:'Ready' });
    await page.evaluate(() => { document.getElementById('matchSubmitBtn').click(); document.getElementById('matchSubmitBtn').click(); });
    await page.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('the-dye-ledger-v20'));
      return saved.activeMatchId && saved.matches.length === 1;
    });
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('the-dye-ledger-v20')));
    assert.equal(saved.matches.length, 1);
    assert.equal(saved.matches[0].selectedGames.some(game => game.key === 'wolf'), true);
    assert.equal(seeded.errors.some(error => /sharedMatchEnabled.*initialization/i.test(error)), false);
    await page.click('[data-tab="setup"]');
    await page.waitForSelector('#editActiveMatchBtn:not(.hidden)');
    await page.click('#editActiveMatchBtn');
    await page.waitForFunction(() => document.getElementById('matchFormTitle')?.textContent.includes('Edit') && !document.getElementById('matchSubmitBtn')?.disabled);
    await page.evaluate(() => document.getElementById('matchForm').requestSubmit());
    await new Promise(resolve => setTimeout(resolve, 250));
    const editToast = await page.$eval('#toast', node => node.textContent || '');
    assert.match(editToast, /updated/i);
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('the-dye-ledger-v20')));
    assert.equal(saved.matches.length, 1);
  } finally {
    if (page) await page.close();
    await browser.close();
    await new Promise(done => server.close(done));
  }
});

test('Shared Match Wolf setup rejects locally before account authentication and preserves the setup draft', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let page;
  let errors = [];
  try {
    ({ page, errors } = await seedSetup(browser, url, setupFixture({ shared:true })));
    await page.evaluate(() => {
      window.supabase = { createClient() { throw new Error('Wolf rejection must occur before Supabase client creation.'); } };
      document.getElementById('matchForm').requestSubmit();
    });
    await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('local scoring only'));
    const result = await page.evaluate(() => ({
      toast:document.getElementById('toast')?.textContent || '',
      state:JSON.parse(localStorage.getItem('the-dye-ledger-v20')),
      draft:JSON.parse(localStorage.getItem('the-dye-ledger-v20:setup-draft')),
    }));
    assert.match(result.toast, /local scoring only/i);
    assert.doesNotMatch(result.toast, /sign in/i);
    assert.equal(result.state.matches.length, 0);
    assert.equal(result.state.activeMatchId, null);
    assert.equal(result.draft.selectedGames.some(game => game.key === 'wolf'), true);
    assert.equal(errors.some(error => /sharedMatchEnabled.*initialization/i.test(error)), false);
  } finally {
    if (page) await page.close();
    await browser.close();
    await new Promise(done => server.close(done));
  }
});

test('non-Wolf local setup still submits through the same finalization path', { skip:!chrome, timeout:120000 }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath:chrome, headless:true, timeout:60000, args:['--disable-gpu','--no-sandbox'] });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let page;
  try {
    ({ page } = await seedSetup(browser, url, setupFixture({ gameKey:'' })));
    await page.click('#matchSubmitBtn');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length === 1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('the-dye-ledger-v20')));
    assert.equal(saved.matches.length, 1);
    assert.equal(saved.matches[0].selectedGames.length, 0);
  } finally {
    if (page) await page.close();
    await browser.close();
    await new Promise(done => server.close(done));
  }
});
