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

async function logReadinessTimeout(page, selector, sample, label) {
  try {
    const snapshot = await page.evaluate((target, state) => {
      const element = document.querySelector(target), rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      return {
        destination:document.getElementById('matchForm')?.getAttribute('data-active-setup-destination'),
        scoreActive:document.getElementById('score')?.classList.contains('active'),
        connected:element?.isConnected ?? false, disabled:element?.disabled ?? null,
        rect:rect ? { x:rect.x, y:rect.y, width:rect.width, height:rect.height } : null,
        display:style?.display ?? null, visibility:style?.visibility ?? null,
        scrollY:window.scrollY, lastY:state.lastY ?? null, quietSince:state.quietSince ?? null,
        scrollChanges:state.scrollChanges ?? 0, frames:state.frames,
        sameElement:state.node ? state.node === element : null, inputValue:element?.value ?? null,
      };
    }, selector, sample);
    console.error(`${label} readiness timeout: ${JSON.stringify(snapshot)}`);
  } catch (diagnosticError) {
    console.error(`${label} readiness diagnostics unavailable: ${diagnosticError.message}`);
  }
}

async function clickStartRoundWhenSettled(page, click = selector => page.click(selector), log = console.log) {
  let originalClickError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const sample = await page.evaluateHandle(() => ({ lastY:null, quietSince:null, frames:0, scrollChanges:0 }));
    try {
      const ready = await page.waitForFunction(state => {
        const form = document.getElementById('matchForm');
        const button = document.getElementById('matchSubmitBtn');
        const rect = button?.getBoundingClientRect();
        const style = button ? getComputedStyle(button) : null;
        const now = performance.now(), y = window.scrollY;
        if (state.lastY !== null && state.lastY !== y) state.scrollChanges++;
        const usable = form && !form.hasAttribute('data-active-setup-destination') && button?.isConnected && !button.disabled && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
        if (!usable || state.lastY !== y || state.quietSince === null) {
          state.lastY = y; state.quietSince = usable ? now : null; state.frames = 0;
          return false;
        }
        state.frames++;
        return state.frames >= 2 && now - state.quietSince >= 200;
      }, { polling:'raf', timeout:5000 }, sample);
      await ready.dispose();
    } catch (error) {
      if (error.name === 'TimeoutError') await logReadinessTimeout(page, '#matchSubmitBtn', sample, 'Start Round');
      throw error;
    } finally {
      await sample.dispose();
    }
    try {
      await click('#matchSubmitBtn');
      return;
    } catch (error) {
      if (error.message !== 'Node is either not clickable or not an Element') throw error;
      originalClickError ||= error;
      if (attempt === 3) throw originalClickError;
      const rounds = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('the-dye-ledger-v20'));
        return Array.isArray(saved?.matches) ? saved.matches.length : null;
      });
      assert.equal(rounds, 0, 'Start Round may already have executed; refusing retry');
      log(`Start Round pre-dispatch click retry ${attempt}/2`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
  }
}

async function clickScoreInputWhenStable(page, selector, click = target => page.click(target), log = console.log) {
  let originalClickError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const sample = await page.evaluateHandle(() => ({ node:null, frames:0 }));
    try {
      const ready = await page.waitForFunction((target, state) => {
        const input = document.querySelector(target), rect = input?.getBoundingClientRect();
        const style = input ? getComputedStyle(input) : null;
        const usable = document.getElementById('score')?.classList.contains('active') && input?.isConnected && !input.disabled && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
        state.frames = usable ? (state.node === input ? state.frames + 1 : 1) : 0;
        state.node = input;
        return state.frames >= 2;
      }, { polling:'raf', timeout:5000 }, selector, sample);
      await ready.dispose();
    } catch (error) {
      if (error.name === 'TimeoutError') await logReadinessTimeout(page, selector, sample, 'Score input');
      throw error;
    } finally {
      await sample.dispose();
    }
    try {
      await click(selector);
      return;
    } catch (error) {
      if (error.message !== 'Node is detached from document') throw error;
      originalClickError ||= error;
      if (attempt === 3) throw originalClickError;
      const untouched = await page.evaluate(target => {
        const input = document.querySelector(target);
        const saved = JSON.parse(localStorage.getItem('the-dye-ledger-v20'));
        const match = saved?.matches?.find(row => row.id === saved.activeMatchId);
        // This fixture is on hole 1. Fail closed if any player's saved gross or the input is nonempty.
        return Boolean(input?.isConnected && input.value === '' && match?.players?.length && match.players.every(player =>
          Array.isArray(player.scores) && player.scores[0] && [null, undefined, ''].includes(player.scores[0].gross)));
      }, selector);
      assert.equal(untouched, true, 'A score may already be entered; refusing retry');
      log(`Score input pre-dispatch click retry ${attempt}/2`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
  }
}

function readyPageDouble(rounds = 0) {
  const handle = () => ({ dispose:async () => {} });
  return {
    evaluateHandle:async () => handle(),
    waitForFunction:async () => handle(),
    evaluate:async () => rounds,
  };
}

test('Start Round retries one exact pre-dispatch error then succeeds', async () => {
  let attempts = 0;
  await clickStartRoundWhenSettled(readyPageDouble(), async selector => {
    assert.equal(selector, '#matchSubmitBtn');
    if (++attempts === 1) throw new Error('Node is either not clickable or not an Element');
  });
  assert.equal(attempts, 2);
});

test('Start Round stops after three exact errors and preserves the first error', async () => {
  let attempts = 0;
  const original = new Error('Node is either not clickable or not an Element');
  await assert.rejects(clickStartRoundWhenSettled(readyPageDouble(), async () => {
    attempts++;
    throw attempts === 1 ? original : new Error(original.message);
  }), error => error === original);
  assert.equal(attempts, 3);
});

test('Start Round does not retry a different error or a near-match message', async () => {
  for (const message of ['Unrelated click failure', 'Node is either not clickable or not an Element: changed message']) {
    let attempts = 0;
    const original = new Error(message);
    await assert.rejects(clickStartRoundWhenSettled(readyPageDouble(), async () => {
      attempts++; throw original;
    }), error => error === original);
    assert.equal(attempts, 1);
  }
});

test('Start Round refuses to retry when a round already exists', async () => {
  let attempts = 0;
  await assert.rejects(clickStartRoundWhenSettled(readyPageDouble(1), async () => {
    attempts++; throw new Error('Node is either not clickable or not an Element');
  }), /may already have executed; refusing retry/);
  assert.equal(attempts, 1);
});

test('Score input retries one exact detached error then succeeds', async () => {
  let attempts = 0;
  const page = readyPageDouble(true), messages = [];
  await clickScoreInputWhenStable(page, '.score', async selector => {
    assert.equal(selector, '.score');
    if (++attempts === 1) throw new Error('Node is detached from document');
  }, message => messages.push(message));
  assert.equal(attempts, 2);
  assert.deepEqual(messages, ['Score input pre-dispatch click retry 1/2']);
});

test('Score input stops after three detached errors and preserves the first error', async () => {
  let attempts = 0;
  const original = new Error('Node is detached from document');
  await assert.rejects(clickScoreInputWhenStable(readyPageDouble(true), '.score', async () => {
    attempts++;
    throw attempts === 1 ? original : new Error(original.message);
  }, () => {}), error => error === original);
  assert.equal(attempts, 3);
});

test('Score input does not retry a different error or a near-match message', async () => {
  for (const message of ['Unrelated click failure', 'Node is detached from document: changed message']) {
    let attempts = 0;
    const original = new Error(message);
    await assert.rejects(clickScoreInputWhenStable(readyPageDouble(true), '.score', async () => {
      attempts++; throw original;
    }), error => error === original);
    assert.equal(attempts, 1);
  }
});

test('Score input refuses to retry when a score already exists', async () => {
  let attempts = 0;
  await assert.rejects(clickScoreInputWhenStable(readyPageDouble(false), '.score', async () => {
    attempts++; throw new Error('Node is detached from document');
  }), /score may already be entered; refusing retry/);
  assert.equal(attempts, 1);
});

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
    await clickStartRoundWhenSettled(page);
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
    await clickScoreInputWhenStable(page, scoreInput);
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
