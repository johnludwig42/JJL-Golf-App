import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine, buildLiveMatchFromRound } from '../scripts/live-engine-adapter.js';
import { createRng, generateRandomRound } from '../scripts/simulation-engine.js';
import { deterministicFixtures } from './fixtures/rounds/simulation-fixtures.js';

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

function fixture() {
  const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:360}));
  const course={id:'wager-course',name:'Wager QA Club',tees:[{id:'white',teeName:'White',rating:72,slope:113,par:72,holes}]};
  const players=['Alex','Blake','Casey','Drew'].map((name,i)=>({id:'p'+i,name,index:0}));
  const match={id:'wager-round',date:'2026-10-08',courseId:course.id,teeId:'white',holeCount:18,status:'active',playInputMode:'CLASSIC',smartScoreAdvanceEnabled:false,teamCount:2,playersPerTeam:2,allowance:100,featuredCompetition:'nassau',selectedGames:[{key:'nassau',basis:'gross',countingBalls:1,stakesFront:5,stakesBack:5,stakesOverall:5},{key:'skins',basis:'gross',skinsType:'individual',stake:2,carryoverMode:'carry'}],
    players:players.map((player,i)=>({playerId:player.id,team:i<2?1:2,slot:i,teeId:'white',scores:holes.map(hole=>({holeNumber:hole.holeNumber,gross:i===0?3:i===1?4:5}))}))};
  return {course,players,match};
}

test('50 varied rounds reconcile every explanation with authoritative payouts without mutating scores',()=>{
  const engine=loadLiveEngine(),rng=createRng('wager-explanations-50');
  for(let n=0;n<50;n++){
    const data=buildLiveMatchFromRound(n<deterministicFixtures.length?deterministicFixtures[n]:generateRandomRound(rng,n));
    const state=engine.seedState({courses:[data.course],players:data.players,matches:[data.match],activeMatchId:data.match.id});
    const match=state.matches[0],metrics=engine.computeMatchMetrics(match);
    const before=JSON.stringify(match);
    const payout=engine.getPayoutReportContext(match,metrics);
    for(const player of metrics.players){
      const model=engine.buildBalanceExplanation(match,metrics,player.playerId);
      assert.equal(model.reconciles,true,`case ${n}: ${player.playerId}`);
      assert.ok(Math.abs(model.total-Number(payout.finalTotals[player.playerId]||0))<0.0001);
      assert.ok(Math.abs(model.explained-model.total)<0.0001);
    }
    assert.equal(JSON.stringify(match),before);
  }
});

test('saved records keep their frozen totals and nested press information without double counting',()=>{
  const engine=loadLiveEngine(),data=fixture();
  data.match.selectedGames[0].pressesEnabled=true;
  data.match.presses=[{pressId:'wager-press',gameId:'press:wager-press',parentGameId:'nassau_gross',rootGameId:'nassau_gross',parentSegmentId:'nassau_gross:back',parentSegmentType:'BACK',startingHole:10,endingHole:18,declaredForHole:10,pressDepth:1,initiatedByTeamId:'2',wagerAmount:5,status:'FINAL',outcomeGameKey:'nassau',scoringMode:'gross'}];
  data.match.presses.push({...data.match.presses[0],pressId:'wager-repress',gameId:'press:wager-repress',parentGameId:'press:wager-press',startingHole:14,declaredForHole:14,pressDepth:2});
  data.match.status='complete';data.match.completedAt='2026-10-08T17:00:00Z';
  const state=engine.seedState({courses:[data.course],players:data.players,matches:[data.match],activeMatchId:data.match.id});
  const match=state.matches[0],metrics=engine.computeMatchMetrics(match);
  const liveModel=engine.buildBalanceExplanation(match,metrics,'p0');
  assert.ok(liveModel.groups.find(group=>group.key==='nassau').entries.some(entry=>/Press/.test(entry.label)));
  assert.equal(liveModel.groups.find(group=>group.key==='nassau').entries.filter(entry=>/Press/.test(entry.label)).length,2);
  engine.freezeRoundRecordIfEligible(match,metrics);
  assert.ok(match.roundRecordSnapshot?.isFrozen);
  const expected=match.roundRecordSnapshot.settlement.netPositions.p0;
  match.players[0].scores[0].gross=25;
  const model=engine.buildBalanceExplanation(match,engine.computeMatchMetrics(match),'p0');
  assert.equal(model.source,'Saved round record');assert.equal(model.total,expected);assert.equal(model.reconciles,true);
  assert.match(engine.renderBalanceExplanation(model),/Press: holes 10–18/);
  assert.match(engine.renderBalanceExplanation(model),/Press: holes 14–18/);
  assert.match(engine.renderBalanceExplanation(model),/your recorded contribution \+\$5\.00/);
  const incomplete=structuredClone(model);incomplete.groups[0].amount+=1;
  incomplete.explained+=1;incomplete.reconciles=false;
  assert.match(engine.renderBalanceExplanation(incomplete),/Historical detail is incomplete/);
});

test('cent rounding is explained and early-ended incomplete games stay projected',()=>{
  const engine=loadLiveEngine(),data=fixture();
  data.match.status='complete';data.match.completedAt='2026-10-08T17:00:00Z';
  data.match.players.forEach(player=>player.scores.forEach((score,index)=>{if(index>=9)score.gross=null;}));
  const state=engine.seedState({courses:[data.course],players:data.players,matches:[data.match],activeMatchId:data.match.id});
  const match=state.matches[0],metrics=engine.computeMatchMetrics(match);
  assert.match(engine.buildQuickSettlementHero(match,metrics),/data-settlement-state="provisional"/);
  const model=engine.buildBalanceExplanation(match,metrics,'p0');
  model.total=2/3;model.explained=2/3;model.reconciles=true;
  model.groups.forEach(group=>{group.amount=1/3;group.entries=[];});
  assert.match(engine.renderBalanceExplanation(model),/Display rounding: \+\$0\.01/);
  model.total=-0.005;model.explained=-0.005;model.groups.forEach(group=>{group.amount=-0.0025;});
  assert.match(engine.renderBalanceExplanation(model),/Display rounding: \(\$0\.01\)/);
});

test('balances open in two taps, show correction changes, preserve focus and match unsaved Quick Scoreboard previews', {skip:!chrome,timeout:120000},async()=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  try{
    const seedPage=await browser.newPage(),data=fixture(),errors=[];
    await seedPage.evaluateOnNewDocument(()=>{window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__=true;});
    await seedPage.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'load'});
    await seedPage.evaluate(data=>{const engine=window.__DYE_LEDGER_LIVE_ENGINE__;localStorage.setItem('the-dye-ledger-v20',JSON.stringify(engine.seedState({courses:[data.course],players:data.players,matches:[data.match],activeMatchId:data.match.id})));},data);
    await seedPage.close();
    const page=await browser.newPage();
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'load'});
    await page.reload({waitUntil:'load'});await page.setViewport({width:375,height:812,deviceScaleFactor:1});
    await page.click('[data-tab="leaderboard"]');
    await page.click('[data-experience-target="results"]');
    const selector='[data-balance-player="p0"][data-balance-match="wager-round"]';
    await page.click(selector);await page.waitForSelector('#balanceExplanationDialog[open]');
    await page.click('.balance-game-detail summary');
    assert.match(await page.$eval('#balanceExplanationBody',node=>node.textContent),/Hole 1:/);
    assert.match(await page.$eval('#balanceExplanationBody',node=>node.textContent),/Projected balance/);
    assert.equal(await page.evaluate(()=>document.getElementById('balanceExplanationDialog').scrollWidth>document.getElementById('balanceExplanationDialog').clientWidth),false);
    await page.click('#balanceExplanationCloseBtn');
    assert.equal(await page.$eval(selector,node=>node===document.activeElement),true);
    // A score correction changes the authoritative payout, then the next review compares it.
    await page.click('[data-tab="score"]');
    for(let i=0;i<18 && !/Hole 1$/.test(await page.$eval('#currentHoleBadge',node=>node.textContent));i++)await page.click('#prevHoleBtn');
    await page.waitForSelector('#score input[data-score-player="p0"]',{visible:true});
    await page.click('#score input[data-score-player="p0"]',{clickCount:3});
    await page.type('#score input[data-score-player="p0"]','8');await page.keyboard.press('Tab');
    await page.locator('#nextHoleBtn').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players[0].scores[0].gross===8);
    await page.click('[data-tab="leaderboard"]');
    await page.click('[data-experience-target="results"]');
    await page.click(selector);
    assert.match(await page.$eval('#balanceExplanationBody',node=>node.textContent),/score corrections on holes 1/);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#balanceExplanationDialog',node=>node.open),false);
    await page.click('[data-tab="score"]');
    for(let i=0;i<18 && !/Hole 1$/.test(await page.$eval('#currentHoleBadge',node=>node.textContent));i++)await page.click('#prevHoleBtn');
    await page.$eval('#score input[data-score-player="p0"]',node=>{node.value='3';});
    await page.click('#quickScoreboardBtn');
    await page.click('#quickScoreboardBody '+selector);
    assert.match(await page.$eval('#balanceExplanationBody',node=>node.textContent),/Game contributions total/);
    assert.match(await page.$eval('#balanceExplanationBody',node=>node.textContent),/On-screen score preview/);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players[0].scores[0].gross),8);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#quickScoreboardDialog',node=>node.classList.contains('hidden')),false);
    await page.click('#quickScoreboardBody '+selector);
    const {mkdirSync}=await import('node:fs');mkdirSync('tmp/report-qa',{recursive:true});
    await page.screenshot({path:'tmp/report-qa/v51-balance-preview.png'});
    assert.deepEqual(errors,[]);await page.close();
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});

