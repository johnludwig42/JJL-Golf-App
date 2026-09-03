import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve('.');
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find(existsSync);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

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

function completedRound(roundEndReason = null, { savedStory = false } = {}) {
  const holes = Array.from({ length: 18 }, (_, idx) => ({ holeNumber: idx + 1, par: idx % 6 === 2 ? 3 : idx % 6 === 5 ? 5 : 4, strokeIndex: idx + 1, yardage: 400 }));
  const players = ['John', 'Tom', 'Mark', 'Phil'].map((name, idx) => ({ id: `p${idx + 1}`, name, index: 8 + idx * 3 }));
  return {
    players,
    course: { id: 'course', name: 'Story Test Club', city: 'Test', state: 'IN', tees: [{ id: 'tee', teeName: 'Blue', rating: 72, slope: 125, par: 72, holes }] },
    match: {
      id: `story-${roundEndReason || 'full'}`,
      name: 'Story Review Test',
      date: '2026-09-02',
      status: 'complete',
      completedAt: '2026-09-02T18:00:00.000Z',
      roundEndReason,
      courseId: 'course',
      teeId: 'tee',
      holeCount: 18,
      format: 'teams',
      teamCount: 2,
      playersPerTeam: 2,
      teamNames: ['Blue', 'Gold'],
      allowance: 90,
      selectedGames: [{ key: 'nassau', basis: 'net', scoringPolicyVersion: 1, countingBalls: 1, handicapAllowancePercent: 90, stakesFront: 5, stakesBack: 5, stakesOverall: 5 }],
      featuredCompetition: 'nassau',
      matchStatusGame: 'nassau',
      storageMode: 'local',
      roundRecapGenerated: `A ${roundEndReason ? 'shortened' : 'complete'} round Story is ready for review.`,
      roundRecapFinal: savedStory ? `A ${roundEndReason ? 'shortened' : 'complete'} round Story is ready for review.` : '',
      players: players.map((player, idx) => ({
        playerId: player.id,
        team: idx % 2 === 0 ? 1 : 2,
        teeId: 'tee',
        scores: holes.map((hole, holeIdx) => ({ holeNumber: holeIdx + 1, gross: roundEndReason && holeIdx >= 9 ? null : hole.par + ((holeIdx + idx) % 3) })),
      })),
    },
  };
}

async function seedCompletedRound(browser, url, fixture) {
  const seedPage = await browser.newPage();
  await seedPage.evaluateOnNewDocument(() => { window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__ = true; });
  await seedPage.goto(url, { waitUntil: 'load' });
  await seedPage.waitForFunction(() => Boolean(window.__DYE_LEDGER_LIVE_ENGINE__));
  await seedPage.evaluate(({ players, course, match }) => {
    const engine = window.__DYE_LEDGER_LIVE_ENGINE__;
    engine.seedState({ players, courses: [course], matches: [match], activeMatchId: '__no-active-round__', completedSummaryMatchId: match.id });
    engine.setCompletedReviewMatch(match.id);
  }, fixture);
  await seedPage.close();
}

async function assertReviewFlow(browser, url, fixture) {
  await seedCompletedRound(browser, url, fixture);
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'load' });
  await page.click('[data-tab="leaderboard"]');
  await page.waitForSelector('#postRoundInlineGenerateRecapBtn:not([disabled])');
  await page.click('#postRoundInlineGenerateRecapBtn');
  await page.waitForFunction(() => {
    const panel = document.getElementById('leaderboardWrap');
    const card = document.getElementById('roundStoryCard');
    const story = document.getElementById('roundRecapStoryTarget');
    return panel?.dataset.activeDestination === 'story'
      && card?.open
      && story
      && getComputedStyle(card).display !== 'none'
      && story.getBoundingClientRect().height > 0;
  });
  const result = await page.evaluate(() => ({
    destination: document.getElementById('leaderboardWrap')?.dataset.activeDestination,
    story: document.getElementById('roundRecapStoryTarget')?.textContent?.trim(),
    saveVisible: document.getElementById('acceptRoundRecapBtn')?.getBoundingClientRect().height > 0,
    editVisible: document.getElementById('editRoundRecapBtn')?.getBoundingClientRect().height > 0,
  }));
  assert.equal(result.destination, 'story');
  assert.match(result.story, /Story is ready for review/);
  assert.equal(result.saveVisible, true);
  assert.equal(result.editVisible, true);
  await page.reload({ waitUntil: 'load' });
  await page.click('[data-tab="leaderboard"]');
  await page.waitForSelector('#postRoundInlineGenerateRecapBtn:not([disabled])');
  await page.click('#postRoundInlineGenerateRecapBtn');
  await page.waitForFunction(() => document.getElementById('leaderboardWrap')?.dataset.activeDestination === 'story' && document.getElementById('roundRecapStoryTarget')?.getBoundingClientRect().height > 0);
  await page.close();
}

test('Review Story visibly opens the correct early and full completed round before and after reload', { skip: !chrome }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 60000, args: ['--disable-gpu', '--no-sandbox'] });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/index.html`;
  try {
    await assertReviewFlow(browser, url, completedRound('weather'));
    await assertReviewFlow(browser, url, completedRound(null));
  } finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});

test('saving an existing Story from a reopened full or early-ended round continues into that round Ledger Entry', { skip: !chrome }, async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 60000, args: ['--disable-gpu', '--no-sandbox'] });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/index.html`;
  try {
    for (const roundEndReason of [null, 'weather']) {
      const fixture = completedRound(roundEndReason, { savedStory: true });
      fixture.match.selectedGames = [];
      await seedCompletedRound(browser, url, fixture);
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: 'load' });
      await page.click('[data-tab="leaderboard"]');
      await page.waitForSelector('#postRoundInlineGenerateRecapBtn:not([disabled])');
      await page.click('#postRoundInlineGenerateRecapBtn');
      await page.waitForSelector('#acceptRoundRecapBtn');
      assert.equal(await page.$eval('#acceptRoundRecapBtn', button => button.textContent.trim()), 'Save Story & Preview Ledger');
      const reportTargetPromise = browser.waitForTarget(target => /ledger-report\/shell\.html/.test(target.url()), { timeout: 30000 });
      await page.click('#acceptRoundRecapBtn');
      const reportTarget = await reportTargetPromise;
      assert.match(reportTarget.url(), /ledger-report\/shell\.html/);
      assert.match(reportTarget.url(), /reportKey=/);
      const reportPage = await reportTarget.page();
      await reportPage.close();
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
