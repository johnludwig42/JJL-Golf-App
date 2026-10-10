import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';

test('Classic team entry pairs saves, explicit clears and reloads while untouched unequal scores stay pending',{skip:!chrome,timeout:120000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const data=scrambleFixture();data.match.playInputMode='PLAYER';data.match.smartScoreAdvanceEnabled=false;
  data.match.sharedMatchId='DYE-123456';data.match.sharedMatchCode='DYE-123456';
  const state=loadLiveEngine().seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:'r'});
  const fixture={state,storage:[['the-dye-ledger-shared-device-id','host'],['dyeLedgerSharedParticipantId:DYE-123456','hp']]};
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,fixture);
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.waitForSelector('input[data-score-team="1"]',{visible:true});assert.equal(await page.$$eval('#scoreGridBody input[data-score-team]',n=>n.length),4);
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
  const reload=async()=>{const state=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20'));await page.evaluateOnNewDocument(state=>localStorage.setItem('the-dye-ledger-v20',state),state);await page.reload({waitUntil:'load'});await page.click('[data-tab="score"]');await page.select('#currentHoleSelect','1');};
  const edit=async value=>{if(Number((await saved()).currentHole||1)>1)await page.click('#prevHoleBtn');await page.$eval('input[data-score-team="1"]',(n,value)=>{n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));n.blur();},value);await page.click('#saveScoresBtn');};
  await edit('4');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players.slice(0,2).every(p=>p.scores[0].gross===4));
  assert.deepEqual((await saved()).players.map(p=>p.scores[0].gross),[4,4,null,null,null,null,null,null]);
  await edit('5');assert.equal((await saved()).players[1].scores[0].gross,5);
  await reload();await page.waitForSelector('input[data-score-team="1"]',{visible:true});assert.equal(await page.$eval('input[data-score-team="1"]',n=>n.value),'5');
  await edit('');assert.equal((await saved()).players[0].scores[0].gross,null);assert.equal((await saved()).players[1].scores[0].gross,null);
  for(const width of [320,375,430])for(const dark of [false,true]){await page.setViewport({width,height:812});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.$eval('input[data-score-team="1"]',n=>n.getBoundingClientRect().height>=44),true);}
  fs.mkdirSync('tmp/report-qa/v61',{recursive:true});await page.screenshot({path:'tmp/report-qa/v61/scramble-classic.png',fullPage:true});
  await page.addStyleTag({content:'html{font-size:32px!important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'tmp/report-qa/v61/scramble-large.png',fullPage:true});
  await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('the-dye-ledger-v20'));state.matches[0].currentHole=1;state.matches[0].players[0].scores[0].gross=4;state.matches[0].players[1].scores[0].gross=5;localStorage.setItem('the-dye-ledger-v20',JSON.stringify(state));});
  await reload();await page.waitForSelector('input[data-score-team="1"]',{visible:true});assert.match(await page.$eval('#scoreGridBody',n=>n.textContent),/unequal partner scores: 4 \/ 5/);await page.click('#saveScoresBtn');assert.deepEqual((await saved()).players.slice(0,2).map(p=>p.scores[0].gross),[4,5]);
  await edit('6');assert.deepEqual((await saved()).players.slice(0,2).map(p=>p.scores[0].gross),[6,6]);
  const joinedFixture={state:fixture.state,storage:[['the-dye-ledger-shared-device-id','cart2'],['dyeLedgerSharedParticipantId:DYE-123456','jp']]};
  const joined=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,joinedFixture);
  await joined.waitForSelector('input[data-score-team="3"]',{visible:true});
  assert.deepEqual(await joined.$$eval('#scoreGridBody input:not(:disabled)',nodes=>nodes.map(n=>n.dataset.scoreTeam)),['3','4']);
  await joined.close();
  assert.deepEqual(errors,[]);
 } finally {await browser.close();await new Promise(r=>server.close(r));}
});
test('scramble setup option survives draft reload without blocking access to setup',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const data=scrambleFixture(),engine=loadLiveEngine(),storage=new Map();
  data.match.teamScoringPolicyVersion=0;data.match.players=data.match.players.map(({scores,...p})=>p);
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[],activeMatchId:null});
  engine.saveSetupDraft(data.match,{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'setup',375,false,false,false,{state,storage:[...storage]});
  assert.equal(await page.$eval('#teamScoringEnabled',n=>n.checked),false);await page.click('#teamScoringEnabled');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20:setup-draft'))?.teamScoringPolicyVersion===1);
  const saved=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20:setup-draft'));
  await page.evaluateOnNewDocument(saved=>localStorage.setItem('the-dye-ledger-v20:setup-draft',saved),saved);
  await page.reload({waitUntil:'load'});await page.click('[data-open-setup-destination="players"]');
  assert.equal(await page.$eval('#teamScoringEnabled',n=>n.checked),true);assert.equal(await page.$eval('#teamCountSelect',n=>n.value),'4');assert.equal(await page.$eval('#playersPerTeamSelect',n=>n.value),'2');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
