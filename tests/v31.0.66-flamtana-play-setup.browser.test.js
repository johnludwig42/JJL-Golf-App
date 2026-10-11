import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage,visualFixture} from './support/design-browser.js';
test('Flamtana Play uses horizontal touch controls and the Scoreboard classic card uses ordinary team-row markup',{skip:!chrome,timeout:90000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const data=scrambleFixture(),engine=loadLiveEngine();data.match.sharedMatchId='DYE-123456';data.match.smartScoreAdvanceEnabled=false;data.match.players.forEach(p=>p.assignedTeamIndex=[20,25,2,5][p.team-1]);data.match.selectedGames=[{key:'flamtana_special',picks:Object.fromEntries(data.players.map((p,i)=>[p.id,1+Math.floor(i/2)]))}];
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state,storage:[['the-dye-ledger-shared-device-id','host'],['dyeLedgerSharedParticipantId:DYE-123456','hp']]});
  await page.click('[data-score-step-player="p0"][data-score-step="up"]');assert.equal(await page.$eval('[data-score-team="1"]',n=>n.value),'4');
  assert.equal(await page.$eval('[data-score-team="1"]',n=>n.closest('tr').querySelector('.score-net-cell').textContent),'2');
  assert.deepEqual(await page.$$eval('#classicScoreGridWrap thead th',nodes=>nodes.map(n=>n.textContent)),['Team','Gross','Off low','Course Net']);
  await page.click('#saveScoresBtn');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);assert.deepEqual(saved.players.slice(0,2).map(p=>p.scores[0].gross),[4,4]);
  for(const width of [320,375,430]){await page.setViewport({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.$eval('.flamtana-score-stepper',n=>n.scrollIntoView({block:'center'}));
  await page.screenshot({path:'tmp/report-qa/v66/play-430.png',fullPage:false});
  await page.addStyleTag({content:'html{font-size:32px!important}'});await page.setViewport({width:320,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.$$eval('.flamtana-score-stepper',nodes=>nodes.every(n=>{const [minus,input,plus]=[...n.children].map(c=>c.getBoundingClientRect());return minus.width>=44&&minus.height>=44&&plus.width>=44&&plus.height>=44&&minus.right<=input.left&&input.right<=plus.left&&Math.abs(minus.top-plus.top)<2;})));
  await page.$eval('.flamtana-score-stepper',n=>n.scrollIntoView({block:'center'}));
  await page.screenshot({path:'tmp/report-qa/v66/play-320-large.png',fullPage:false});
  await page.click('#quickScoreboardBtn');await page.click('.quick-classic-scorecard>summary');assert.equal(await page.$$eval('.quick-classic-scorecard table.scorecard-table tbody tr',nodes=>nodes.length),7);assert.equal(await page.$('.quick-classic-scorecard [data-scorecard-net-view]'),null);
  assert.equal(await page.$eval('.quick-classic-scorecard .scorecard-table tbody td:nth-child(2)',n=>getComputedStyle(n).position),'static');
  assert.ok(await page.$eval('.quick-classic-scorecard .scorecard-table',n=>{const wrap=n.closest('.scorecard-wrap'),identity=n.querySelector('tbody td:first-child'),hole=n.querySelector('tbody td:nth-child(2)'),before=[identity,hole].map(c=>c.getBoundingClientRect().left);wrap.scrollLeft=100;const after=[identity,hole].map(c=>c.getBoundingClientRect().left);wrap.scrollLeft=0;return Math.abs(before[0]-after[0])<1&&before[1]-after[1]>=90;}));
  assert.ok(await page.$eval('.quick-classic-scorecard .scorecard-table',n=>getComputedStyle(n.querySelector('thead th:nth-child(2)')).backgroundColor===getComputedStyle(n.querySelector('thead th:nth-child(3)')).backgroundColor));
  await page.addStyleTag({content:'html{font-size:16px!important}'});await page.setViewport({width:375,height:812});await page.$eval('.quick-classic-scorecard .scorecard-table',n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:'tmp/report-qa/v66/team-classic-scorecard.png',fullPage:false});
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('ordinary setup opens the Auto featured handicap preview at equal handicaps and selects the final real player above blank scroll space',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const fixture=visualFixture('CLASSIC',true);fixture.state.players.forEach(p=>p.index=0);fixture.state.courses[0].tees[0].rating=74;fixture.state.players.push(...Array.from({length:20},(_,i)=>({id:'extra'+i,name:'Zed '+String(i).padStart(2,'0'),index:0})));const draft=JSON.parse(fixture.storage[0][1]);draft.selectedGames=[{key:'nassau',basis:'net',countingBalls:1}];draft.featuredCompetition='auto';fixture.storage[0][1]=JSON.stringify(draft);
  let page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'games',375,false,false,false,fixture);
  await page.click('.featured-handicap-preview-section>summary');assert.equal(await page.$eval('.featured-handicap-preview-section',n=>n.open),true);
  assert.equal(await page.$$eval('#setupFeaturedHandicapPreview .handicap-preview-row',nodes=>nodes.length),4);assert.deepEqual(await page.$$eval('#setupFeaturedHandicapPreview .handicap-preview-row',nodes=>nodes.map(n=>n.lastElementChild.textContent)),['0','0','0','0']);
  await page.select('#featuredCompetitionSelect','stroke_gross');assert.match(await page.$eval('#setupFeaturedHandicapPreview',n=>n.textContent),/Handicap strokes are not used/);
  await page.$eval('#matchForm [name="allowance"]',n=>{n.value='50';n.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.select('#featuredCompetitionSelect','stroke_net');assert.deepEqual(await page.$$eval('#setupFeaturedHandicapPreview .handicap-preview-row',nodes=>nodes.map(n=>n.lastElementChild.textContent)),['2','2','2','2']);assert.equal(await page.$$eval('#setupFeaturedHandicapPreview .handicap-preview-row',nodes=>nodes.length),4);
  await page.click('.featured-handicap-preview-section>summary');assert.equal(await page.$eval('.featured-handicap-preview-section',n=>n.open),false);
  await page.close();page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'setup',375,false,false,false,fixture);
  await page.click('[data-player-combobox-slot="0"]');await page.$eval('[data-player-combobox-slot="0"]',n=>{n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.$eval('[data-player-combobox-slot="0"]',n=>n.scrollIntoView({block:'center'}));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await page.$eval('[data-player-combobox-slot="0"]',n=>{Object.defineProperty(window.visualViewport,'height',{value:n.getBoundingClientRect().bottom+60,configurable:true});window.visualViewport.dispatchEvent(new Event('resize'));});
  assert.equal(await page.$eval('[data-player-combobox-list="0"]',n=>n.dataset.openDirection),'above');
  await page.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
  const list=await page.$('[data-player-combobox-list="0"]');await list.evaluate(n=>n.scrollTop=n.scrollHeight);assert.ok(await list.$eval('.player-combobox-bottom-space',n=>n.getBoundingClientRect().height>=44));
  const options=await page.$$('[data-player-combobox-list="0"] [data-player-combobox-option]:not(.hidden)');const last=options.at(-1),id=await last.evaluate(n=>n.dataset.playerId);await last.click();assert.equal(await page.$eval('[data-player-slot="0"]',n=>n.value),id);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
