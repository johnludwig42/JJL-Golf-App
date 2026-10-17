import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync} from 'node:fs';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
function fixture(frozen=true){
 const engine=loadLiveEngine(),data=scrambleFixture(),host=engine.getSharedDeviceId();
 data.match.sharedHostDeviceId=host;data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;
 data.match.sharedMatchId='DYE-760001';data.match.status='complete';data.match.completedAt='2026-10-17T15:00:00Z';
 data.match.players.forEach(p=>{p.assignedTeamIndex=0;p.scores.forEach(s=>s.gross=p.team+2);});
 data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,picks:Object.fromEntries(data.players.map(p=>[p.id,1]))})];
 const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:null,completedSummaryMatchId:'r'}),match=state.matches[0];
 if(frozen)match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
 match.roundRecapGenerated=engine.buildDeterministicLedgerEntryStory(match,engine.computeMatchMetrics(match)).text;
 match.sharedLedgerParity={status:'not-confirmed',parityConfirmed:false};
 return {state,storage:[['the-dye-ledger-shared-device-id',host]]};
}
test('saving an existing frozen-round Story opens Ledger despite unavailable cloud and retains all round facts',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'story',375,false,false,false,fixture());
  const result=await page.evaluate(async()=>{
   const match=getReviewOrActiveMatch(),before=JSON.stringify([match.roundRecordSnapshot,match.players,match.selectedGames]);
   window.reconcileCalls=0;reconcileSharedMatchBeforeSummary=async()=>{reconcileCalls++;throw new Error('Cloud unavailable');};
   shouldUseSameTabLedgerReport=()=>true;launchLedgerReportModel=report=>{window.openedReport=report;};
   openRoundStoryReview();await acceptRoundRecapForActiveMatch();
   return {calls:reconcileCalls,opened:!!window.openedReport,story:match.roundRecapFinal,printedStory:window.openedReport?.meta.story,before,after:JSON.stringify([match.roundRecordSnapshot,match.players,match.selectedGames]),stored:JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].roundRecapFinal,net:window.openedReport?.games.map(g=>g.money),parity:match.sharedLedgerParity.parityConfirmed};
  });
  assert.equal(result.opened,true,JSON.stringify({calls:result.calls,storySaved:!!result.story,stored:!!result.stored}));assert.equal(result.calls,0);assert.equal(result.before,result.after);
  assert.ok(result.story.length>0);assert.equal(result.printedStory,result.story);assert.equal(result.stored,result.story);assert.equal(result.parity,false);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
test('completed round without a frozen record still requires shared reconciliation before preview',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'story',375,false,false,false,fixture(false));
  const result=await page.evaluate(async()=>{
   let calls=0,opened=false;reconcileSharedMatchBeforeSummary=async()=>{calls++;throw new Error('Cloud unavailable');};shouldUseSameTabLedgerReport=()=>true;launchLedgerReportModel=()=>{opened=true;};
   const match=getReviewOrActiveMatch(),before=JSON.stringify(match.players);await openUnifiedExport(match,'ledger');return {calls,opened,before,after:JSON.stringify(match.players),frozen:!!match.roundRecordSnapshot};
  });
  assert.equal(result.calls,1);assert.equal(result.opened,false);assert.equal(result.before,result.after);assert.equal(result.frozen,false);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('existing frozen Flamtana round reaches the real iPhone Ledger with its saved Story while cloud never responds',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture(),before=JSON.stringify(seeded.state.matches[0].roundRecordSnapshot);
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'story',375,false,false,false,seeded);
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.6.1 Mobile/15E148 Safari/604.1');
  await page.evaluate(()=>{
   reconcileSharedMatchBeforeSummary=()=>new Promise(()=>{});
   const snapshot=()=>window.name=JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
   snapshot();const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(this===localStorage)snapshot();};
  });
  await page.evaluateOnNewDocument(()=>{const saved=JSON.parse(window.name||'{}');localStorage.clear();for(const [key,value]of Object.entries(saved))localStorage.setItem(key,value);});
  await page.evaluate(()=>openRoundStoryReview());await page.$eval('#acceptRoundRecapBtn',node=>node.scrollIntoView({block:'center'}));
  await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:10000}),page.click('#acceptRoundRecapBtn')]);await page.waitForSelector('.page');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
  assert.equal(JSON.stringify(saved.roundRecordSnapshot),before);assert.ok(saved.roundRecapFinal.length>0);
  assert.equal(await page.evaluate(()=>globalThis.__DYE_LEDGER_ROUND__.meta.story),saved.roundRecapFinal);
  assert.equal(saved.players.reduce((n,p)=>n+p.scores.filter(s=>s.gross>0).length,0),144);
  mkdirSync('tmp/report-qa/v76',{recursive:true});await page.pdf({path:'tmp/report-qa/v76/recovered-ledger.pdf',printBackground:true,preferCSSPageSize:true});
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('host reviews and recovers 24 orphaned cloud scores, completes and previews the original Story without re-entry',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture(false),match=seeded.state.matches[0];match.status='active';match.completedAt=null;match.sharedScoreOutboxInitialized=true;
  seeded.state.activeMatchId='r';seeded.state.completedSummaryMatchId=null;
  match.sharedPlayerAssignments=Object.fromEntries(match.players.map(p=>[p.playerId,match.sharedHostParticipantId]));
  delete match.sharedPlayerAssignmentState;
  const missing=match.players.filter(p=>p.team>=3).flatMap(p=>p.scores.slice(0,6).map(s=>({playerId:p.playerId,holeNumber:s.holeNumber,gross:s.gross})));
  match.sharedLedgerParity={status:'not-confirmed',parityConfirmed:false,missingRemote:missing,missingLocal:[],conflicts:[]};
  const before=JSON.stringify(match.players),story=match.roundRecapGenerated;
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seeded);
  await page.evaluate(()=>{
   const match=getActiveMatch();window.recoveryRows=match.players.flatMap(p=>p.scores.filter(s=>!(p.team>=3&&s.holeNumber<=6)).map(s=>({player_id:p.playerId,hole_number:s.holeNumber,gross:s.gross,entry_status:'active'})));window.sentOperations=[];
   const client={from(table){const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},order(){return query;},then(resolve,reject){return Promise.resolve({data:table==='score_entries'?recoveryRows.filter(row=>filters.every(([k,v])=>k==='match_id'||row[k]===v)):[],error:null}).then(resolve,reject);}};return query;},async rpc(name,params){if(name!=='submit_shared_score_operations')throw new Error('Unexpected RPC '+name);sentOperations.push(...params.p_operations);for(const op of params.p_operations){const entry=op.score_entry;recoveryRows=recoveryRows.filter(row=>!(row.player_id===entry.player_id&&row.hole_number===entry.hole_number));recoveryRows.push(entry);}return {data:params.p_operations.map((op,i)=>({operation_id:op.operation_id,match_revision:i+1})),error:null};}};
   hasSupabaseConfig=()=>true;ensureSupabaseClient=async()=>client;getSupabaseUser=async()=>({id:'permanent-host'});
   mergeCloudSharedMetadata=async()=>false;flushSharedMatchSync=async()=>null;scheduleSharedMatchSync=()=>{};
   renderAll();
  });
  assert.equal(await page.evaluate(()=>getSharedMatchReadinessLines(getActiveMatch()).some(line=>line.includes('second device before Start'))),false);
  assert.equal(await page.$eval('[data-start-shared-scoring]',node=>node.textContent),'Continue Scoring');
  await page.$eval('#score [data-review-missing-scores]',n=>n.scrollIntoView({block:'center'}));await page.click('#score [data-review-missing-scores]');
  await page.waitForFunction(()=>document.querySelector('#score [data-review-missing-scores]')?.textContent==='Resend reviewed scores');
  assert.equal(await page.$$eval('#score [data-shared-score-recovery] li',nodes=>nodes.length),12);
  assert.equal(await page.evaluate(()=>sentOperations.length),0);
  await page.$eval('#score [data-review-missing-scores]',n=>n.scrollIntoView({block:'center'}));await page.click('#score [data-review-missing-scores]');
  await page.waitForFunction(()=>getActiveMatch().sharedLedgerParity.parityConfirmed===true,{timeout:5000}).catch(async error=>{throw new Error(JSON.stringify(await page.evaluate(()=>({toast:document.getElementById('toast').textContent,rows:recoveryRows.length,sent:sentOperations.length,pending:getSharedScoreOutboxOperations(getActiveMatch()).length,parity:getActiveMatch().sharedLedgerParity})))+error.message);});
  assert.equal(await page.evaluate(()=>sentOperations.length),24);assert.equal(await page.evaluate(()=>recoveryRows.length),144);
  assert.equal(await page.evaluate(()=>getSharedScoreOutboxOperations(getActiveMatch()).length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(getActiveMatch().players)),before);
  await page.evaluate(()=>showRoundEndPrompt(getActiveMatch(),'complete'));await page.click('#roundEndPrimaryBtn');
  await page.waitForFunction(()=>state.matches[0].status==='complete');
  assert.equal(await page.evaluate(()=>state.matches[0].roundRecordSnapshot.isFrozen),true);
  assert.equal(await page.evaluate(()=>state.matches[0].roundRecapGenerated),story);
  await page.evaluate(async()=>{reconcileSharedMatchBeforeSummary=()=>new Promise(()=>{});shouldUseSameTabLedgerReport=()=>true;launchLedgerReportModel=report=>window.recoveredReport=report;await openRoundStoryReview();await acceptRoundRecapForActiveMatch();});
  assert.ok(await page.evaluate(()=>!!window.recoveredReport));assert.equal(await page.evaluate(()=>window.recoveredReport.meta.story),await page.evaluate(()=>state.matches[0].roundRecapFinal));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('host removes a started game through confirmation in Round rules and keeps scores and Story',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture(false),match=seeded.state.matches[0];match.status='active';match.completedAt=null;seeded.state.activeMatchId='r';seeded.state.completedSummaryMatchId=null;
  const before=JSON.stringify(match.players),story=match.roundRecapGenerated;
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seeded);
  await page.evaluate(()=>{scheduleSharedMatchSync=()=>{};});
  const selector='#playGroupRulesPreview [data-remove-flamtana-game="group1"]';
  await page.evaluate(()=>document.querySelectorAll('#playGroupRulesPreview details').forEach(node=>node.open=true));
  page.once('dialog',dialog=>dialog.dismiss());await page.click(selector);assert.equal(await page.evaluate(()=>getActiveMatch().selectedGames[0].group1Enabled),true);
  page.once('dialog',async dialog=>{assert.match(dialog.message(),/buy-in.*pool/s);await dialog.accept();});await page.click(selector);
  await page.waitForFunction(()=>getActiveMatch().selectedGames[0].group1Enabled===false);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
  assert.equal(saved.selectedGames[0].group1Enabled,false);assert.equal(JSON.stringify(saved.players),before);assert.equal(saved.roundRecapGenerated,story);
  assert.equal(await page.$(selector),null);
  await page.addStyleTag({content:'html{font-size:32px!important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
