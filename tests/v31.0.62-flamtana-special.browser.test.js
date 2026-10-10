import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';

test('Flamtana setup picks and stakes survive draft reload with comfortable controls',{skip:!chrome,timeout:90000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const data=scrambleFixture(),engine=loadLiveEngine(),storage=new Map();
  data.match.roundTiming={startedAt:null};data.match.players=data.match.players.map(({scores,...player})=>player);
  data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:1,tieMethod:'back9',featuredStake:25,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:{}}];
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[],activeMatchId:null});
  engine.saveSetupDraft(data.match,{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'games',375,false,false,false,{state,storage:[...storage]});
  await page.waitForSelector('[data-flamtana-pick]',{visible:true});
  assert.equal(await page.$$eval('[data-flamtana-pick]',nodes=>nodes.length),8);
  for(let i=0;i<8;i++)await page.select(`[data-flamtana-pick="p${i}"]`,String(Math.floor(i/2)+1));
  await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('the-dye-ledger-v20:setup-draft')).selectedGames.find(game=>game.key==='flamtana_special').picks).filter(Boolean).length===8);
  const draft=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20:setup-draft'));
  await page.evaluateOnNewDocument(value=>localStorage.setItem('the-dye-ledger-v20:setup-draft',value),draft);
  await page.reload({waitUntil:'load'});await page.click('[data-open-setup-destination="games"]');
  assert.equal(await page.$eval('[data-game-config="flamtana_special"][data-field="tieMethod"]',node=>node.value),'back9');
  assert.equal(await page.$eval('[data-game-config="flamtana_special"][data-field="featuredStake"]',node=>node.value),'25');
  assert.deepEqual(await page.$$eval('[data-flamtana-pick]',nodes=>nodes.map(node=>node.value)),['1','1','2','2','3','3','4','4']);
  for(const width of [320,375,430]){await page.setViewport({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewport({width:320,height:812});await page.addStyleTag({content:'html{font-size:32px!important}'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.$$eval('[data-flamtana-pick]',nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('Pending remedy, host fallback and separate foursome progress stay visible in Classic',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const data=scrambleFixture(),engine=loadLiveEngine();data.match.sharedMatchId='DYE-123456';data.match.sharedMatchCode='DYE-123456';
  data.match.players.forEach(player=>{player.scores[0].gross=4;});data.match.players[1].scores[0].gross=5;
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',320,false,false,false,{state,storage:[['the-dye-ledger-shared-device-id','host'],['dyeLedgerSharedParticipantId:DYE-123456','hp']]});
  const text=await page.$eval('#scoreGridBody',node=>node.textContent);
  assert.match(await page.$eval('body',node=>node.textContent),/F1 0\/18.*F2 1\/18/);
  assert.match(text,/Re-enter the team score to resolve/);assert.match(text,/host can enter or correct all four teams/);
  assert.equal(await page.$$eval('#scoreGridBody input:not(:disabled)',nodes=>nodes.length),4);
  await page.click('#saveScoresBtn');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);assert.deepEqual(saved.players.slice(0,2).map(player=>player.scores[0].gross),[4,5]);
  fs.mkdirSync('tmp/report-qa/v62',{recursive:true});await page.screenshot({path:'tmp/report-qa/v62/classic.png',fullPage:true});
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('Flamtana report renders four stroke series and reconciles eight golfer payments without individual statistics',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/reports/ledger-entry-flamtana.html`,{waitUntil:'load'});await page.waitForSelector('.page');await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(errors,[]);
  assert.equal(await page.$$eval('[data-stroke-standings]',nodes=>nodes.length),4);
  assert.equal(await page.$$eval('[data-flamtana-picks] [data-row]',nodes=>nodes.length),8);
  assert.equal(await page.$$eval('[data-calcutta-ledger] [data-row]',nodes=>nodes.length),8);
  assert.match(await page.$eval('[data-calcutta-ledger]',node=>node.textContent),/John Longlastname.*60/);
  assert.equal(await page.$$eval('[data-ledger-stat-category]',nodes=>nodes.length),0);
  const text=await page.$eval('#doc',node=>node.textContent);assert.match(text,/John Longlastname/);assert.match(text,/unbacked; partners paid/);assert.match(text,/Hole 18/);
  assert.ok(await page.$$eval('.page',nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)));
  fs.mkdirSync('tmp/report-qa/v62',{recursive:true});await page.screenshot({path:'tmp/report-qa/v62/report-cover.png',fullPage:false});
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
