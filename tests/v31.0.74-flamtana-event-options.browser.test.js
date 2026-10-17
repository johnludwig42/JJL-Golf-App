import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';

test('event competition switches and percentage preview persist with readable phone layout',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const engine=loadLiveEngine(),data=scrambleFixture(),storage=new Map();data.match.roundTiming={startedAt:null};
  data.match.selectedGames=[engine.normalizeFlamtanaConfig()];data.match.players=data.match.players.map(({scores,...p})=>p);
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[]});engine.saveSetupDraft(data.match,{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'games',375,false,false,false,{state,storage:[...storage]});
  await page.waitForSelector('[data-field="firstPlacePercent"]',{visible:true});
  assert.equal(await page.$$eval('[data-game-config="flamtana_special"][type="checkbox"]',nodes=>nodes.filter(n=>n.checked).length),5);
  const field=name=>`[data-game-config="flamtana_special"][data-field="${name}"]`;
  await page.$eval(field('firstPlacePercent'),node=>{node.value='60';node.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('.game-config-card [role="status"]').textContent.includes('must total'));
  await page.$eval(field('secondPlacePercent'),node=>{node.value='40';node.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('.game-config-card [role="status"]').textContent.includes('Total 100%'));
  assert.match(await page.$eval('.game-config-card [role="status"]',n=>n.textContent),/60% \(\$96.*40% \(\$64/);
  await page.$eval(field('group2Enabled'),node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('[data-field="group2Enabled"]').checked===false);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20:setup-draft')).selectedGames[0].group2Enabled===false);
  const draft=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20:setup-draft'));await page.evaluateOnNewDocument(value=>localStorage.setItem('the-dye-ledger-v20:setup-draft',value),draft);
  await page.reload({waitUntil:'load'});await page.click('[data-open-setup-destination="games"]');
  assert.equal(await page.$eval(field('group2Enabled'),n=>n.checked),false);assert.equal(await page.$eval(field('firstPlacePercent'),n=>n.value),'60');
  for(const [width,size]of [[320,16],[375,16],[430,16],[375,32]]){
   await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.ok(await page.$$eval('.flamtana-competition-choice',nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)));
  }
  fs.mkdirSync('tmp/report-qa/v74',{recursive:true});await page.setViewport({width:375,height:812});await page.addStyleTag({content:'html{font-size:16px!important}'});await page.screenshot({path:'tmp/report-qa/v74/setup.png',fullPage:true});
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('new event Ledger prints saved prize percentages and disabled contests remain absent',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  for(const mode of ['big','group','calcutta']){
   const big=mode==='big',data=scrambleFixture(),engine=loadLiveEngine();data.match.players.forEach(p=>{p.assignedTeamIndex=0;p.scores.forEach(s=>s.gross=p.team+2);});
   data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,featuredEnabled:big,group1Enabled:mode!=='calcutta',group2Enabled:false,foursomeEnabled:mode!=='calcutta',picks:Object.fromEntries(data.players.map(p=>[p.id,1]))})];
   data.match.status='complete';data.match.completedAt='2026-10-17T12:00:00Z';
   const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
   const report=engine.buildLedgerEntryReportModel(match),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack || String(e)));
   await page.evaluateOnNewDocument(report=>{sessionStorage.setItem('event-test',JSON.stringify({report,createdAt:new Date().toISOString(),autoPrint:false}));},report);
   await page.goto(`http://127.0.0.1:${server.address().port}/ledger-report/shell.html?reportKey=event-test`,{waitUntil:'load'});await page.waitForSelector('.page',{timeout:5000}).catch(error=>{throw new Error(mode+': '+errors.join('; ')+'; '+error.message);});await page.evaluate(()=>document.fonts.ready);
   assert.deepEqual(errors,[]);
   assert.doesNotMatch(await page.$eval('body',n=>n.textContent),/no wagers/i);
   assert.equal(await page.$$eval('[data-flamtana-prize]',nodes=>nodes.length),big?2:0);
   if(big)assert.match(await page.$eval('body',n=>n.textContent),/First place: 70%.*112.*Second place: 30%.*48/s);
   assert.equal(await page.$$eval('[data-flamtana-evidence="Group · T3 versus T4"]',n=>n.length),0);
   fs.mkdirSync('tmp/report-qa/v74',{recursive:true});await page.pdf({path:`tmp/report-qa/v74/event-${mode}.pdf`,printBackground:true,preferCSSPageSize:true});
   if(big){const pages=await page.$$('.page');for(let i=0;i<Math.min(2,pages.length);i++)await pages[i].screenshot({path:`tmp/report-qa/v74/report-page-${i+1}.png`});}
   await page.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('event Play scoreboard shows only selected competitions with compact readable settlement columns',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const engine=loadLiveEngine(),data=scrambleFixture();data.match.players.forEach(p=>{p.assignedTeamIndex=0;p.scores.forEach(score=>score.gross=p.team+2);});
  data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,group2Enabled:false,calcuttaEnabled:false})];
  const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:'r'});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'quick',375,false,false,false,{state,storage:[['the-dye-ledger-shared-device-id','host']]});
  assert.deepEqual(await page.$$eval('[data-settlement-state="projected"] thead th',nodes=>nodes.map(n=>n.textContent)),['Golfer','Combined net','The Big Game','Group 1','Foursome']);
  assert.deepEqual(await page.$$eval('[data-flamtana-leaderboard]',nodes=>nodes.map(n=>n.dataset.flamtanaLeaderboard)),['featured','group1','foursome']);
  const saved=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20'));
  for(const [width,size]of [[320,16],[375,16],[430,16],[375,32]]){
   await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.ok(await page.$$eval('[data-settlement-state="projected"] td:not(:first-child),[data-settlement-state="projected"] th',nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20')),saved);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
