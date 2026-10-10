import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';

test('one tee selector per team applies to both partners, allows different teams and persists the draft',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const data=scrambleFixture(),engine=loadLiveEngine(),storage=new Map();data.course.tees.push({...data.course.tees[0],id:'blue',teeName:'Blue',slope:125,rating:74});
  data.match.players=data.match.players.map(({scores,...player})=>player);data.match.roundTiming={startedAt:null};
  data.match.players[1].teeId='blue';
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[]});engine.saveSetupDraft(data.match,{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'setup',375,false,false,false,{state,storage:[...storage]});
  assert.equal(await page.$$eval('[data-team-tee]',nodes=>nodes.length),4);assert.equal(await page.$$eval('select[data-player-tee-slot]',nodes=>nodes.length),0);
  assert.equal(await page.$eval('[data-team-tee="1"]',node=>node.value),'');assert.deepEqual(await page.$$eval('[data-player-tee-slot]',nodes=>nodes.slice(0,2).map(node=>node.value)),['t','blue']);
  await page.select('[data-team-tee="1"]','t');
  await page.select('[data-team-tee="2"]','blue');
  assert.deepEqual(await page.$$eval('[data-player-tee-slot]',nodes=>nodes.map(node=>node.value)),['t','t','blue','blue','t','t','t','t']);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20:setup-draft')).players.filter(player=>player.team===2).every(player=>player.teeId==='blue'));
  const draft=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20:setup-draft'));await page.evaluateOnNewDocument(value=>localStorage.setItem('the-dye-ledger-v20:setup-draft',value),draft);
  await page.reload({waitUntil:'load'});await page.click('[data-open-setup-destination="players"]');assert.equal(await page.$eval('[data-team-tee="2"]',node=>node.value),'blue');
  await page.select('[data-team-tee="1"]','');assert.deepEqual(await page.$$eval('[data-player-tee-slot]',nodes=>nodes.slice(0,2).map(node=>node.value)),['','']);
  await page.click('#teamScoringEnabled');assert.equal(await page.$$eval('select[data-player-tee-slot]',nodes=>nodes.length),8);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('team plus/minus starts at par, saves both partners and resolves Pending deliberately with touch-friendly layouts',{skip:!chrome,timeout:90000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const data=scrambleFixture(),engine=loadLiveEngine();data.match.sharedMatchId='DYE-123456';data.match.sharedMatchCode='DYE-123456';data.match.smartScoreAdvanceEnabled=false;
  const blue={...data.course.tees[0],id:'blue',teeName:'Blue',holes:data.course.tees[0].holes.map(hole=>({...hole,par:hole.holeNumber===1?5:hole.holeNumber===18?3:4}))};data.course.tees.push(blue);data.match.players.filter(player=>player.team===2).forEach(player=>player.teeId='blue');
  data.match.players[0].scores[0].gross=4;data.match.players[1].scores[0].gross=5;
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state,storage:[['the-dye-ledger-shared-device-id','host'],['dyeLedgerSharedParticipantId:DYE-123456','hp']]});
  await page.click('[data-score-step-player="p0"][data-score-step="up"]');assert.equal(await page.$eval('[data-score-team="1"]',node=>node.value),'4');
  await page.click('[data-score-step-player="p0"][data-score-step="up"]');assert.equal(await page.$eval('[data-score-team="1"]',node=>node.value),'5');
  await page.click('[data-score-step-player="p0"][data-score-step="down"]');await page.click('[data-score-step-player="p2"][data-score-step="down"]');assert.equal(await page.$eval('[data-score-team="2"]',node=>node.value),'5');await page.click('#saveScoresBtn');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);assert.deepEqual(saved.players.slice(0,2).map(player=>player.scores[0].gross),[4,4]);
  assert.deepEqual(saved.players.slice(2,4).map(player=>player.scores[0].gross),[5,5]);
  for(const width of [320,375,430]){await page.setViewport({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.addStyleTag({content:'html{font-size:32px!important}'});await page.setViewport({width:320,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.$$eval('.team-score-stepper button',nodes=>nodes.every(node=>node.getBoundingClientRect().width>=44&&node.getBoundingClientRect().height>=44)));
  assert.ok(await page.$$eval('.team-score-stepper',nodes=>nodes.every(node=>{const [minus,plus]=[...node.querySelectorAll('button')].map(button=>button.getBoundingClientRect());return minus.right<=plus.left;})));
  assert.ok(await page.$$eval('[data-score-team]',nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
