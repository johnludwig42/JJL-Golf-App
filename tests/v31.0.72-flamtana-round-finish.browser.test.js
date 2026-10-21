import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
function fixture(remote=false){
 const data=scrambleFixture(),engine=loadLiveEngine();data.match.sharedMatchId='DYE-720001';data.match.sharedMatchCode='DYE-720001';
 const hostId=engine.getSharedDeviceId();data.match.sharedHostDeviceId=hostId;data.match.sharedDevices[0].id=hostId;data.match.sharedParticipants[0].deviceId=hostId;
 data.match.players.forEach(p=>{p.assignedTeamIndex=0;p.scores.forEach(s=>s.gross=p.team+2);});
 data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:2,tieMethod:'split',featuredStake:20,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:Object.fromEntries(data.players.map(p=>[p.id,1]))}];
 data.match.memories=[{id:'m',text:'The group paused for a photo.',holeNumber:9}];
 data.match.roundContext={weather:{temperature:72,humidity:50,conditionsText:'Clear',capturedAt:'2026-10-12T12:00:00Z'}};
 data.match.status='complete';data.match.completedAt='2026-10-12T12:00:00Z';
 const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:remote?'r':null,completedSummaryMatchId:remote?null:'r'});
 const match=state.matches[0];match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
 const cloud=engine.buildCloudMatchPayload(match),record=JSON.stringify(match.roundRecordSnapshot);
 if(remote){match.status='active';match.completedAt=null;match.roundRecordSnapshot=null;}
 return {state,cloud,record,storage:[['the-dye-ledger-shared-device-id',remote?'cart2':hostId],['dyeLedgerSharedParticipantId:DYE-720001',remote?'jp':'hp']]};
}
async function preserveOnNavigation(page){
 await page.evaluate(()=>{
  const snapshot=()=>window.name=JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
  snapshot();const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(this===localStorage)snapshot();};
 });
 await page.evaluateOnNewDocument(()=>{const store=JSON.parse(window.name||'{}');localStorage.clear();for(const [key,value]of Object.entries(store))localStorage.setItem(key,value);});
}
async function cloudClient(page,cloud){
 await page.evaluate(cloud=>{
  const scores=getActiveMatch().players.flatMap(p=>p.scores.map(s=>({player_id:p.playerId,hole_number:s.holeNumber,gross:s.gross,updated_by:'same-account',entry_status:'active'})));
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true}); // The visual fixture defaults offline; this test explicitly exercises cloud requests.
  hasSupabaseConfig=()=>true;
  ensureSupabaseClient=async()=>({from(table){const q={select(){return q;},eq(){return q;},order(){return q;},maybeSingle(){q.single=true;return q;},then(resolve){return Promise.resolve({data:table==='matches'?cloud.matchRow:table==='score_entries'?scores:[],error:null}).then(resolve);}};return q;}});
  scheduleSharedMatchSync=()=>{};
 },cloud);
}
test('Flamtana requests AI, repairs a false score, saves the reviewed Story and navigates to the iPhone Ledger preview',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture(),page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'story',375,false,false,false,seeded);
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.storyRequests=[];
   const nativeFetch=window.fetch;
   window.fetch=async(url,options)=>{
    if(!String(url).includes('/functions/v1/round-recap'))return nativeFetch(url,options);
    const request=JSON.parse(options.body);window.storyRequests.push(request);
    return new Response(JSON.stringify({success:true,recap:window.storyRequests.length===1?'First posted 99 net.':'First won the Featured. Its 54 net stood lowest across the four team cards, with Second at 72 net.\n\nFoursome 1 combined the lower team net on each hole. The Group contests and Calcutta remained separate wagers, preserving their own results.\n\nThe teams used strokes off the lowest of all four team handicaps. The saved card gives the competition its shape without assigning individual shots to either partner.'}),{status:200,headers:{'Content-Type':'application/json'} });
   };
  });
  await page.evaluate(()=>openRoundStoryReview());
  const requests=await page.evaluate(()=>storyRequests);assert.equal(requests.length,2);assert.equal(requests[0].match.players.length,8);assert.equal(requests[0].match.recapContentSpecVersion,'1.0.0');assert.ok(requests[1].repair.issues.some(issue=>issue.code==='FALSE_FLAMTANA_NET_TOTAL'));
  assert.match(await page.$eval('#roundRecapStoryTarget',n=>n.textContent),/First won the Featured/);
  assert.match(await page.$eval('#roundRecapStoryTarget',n=>n.textContent),/The group paused for a photo/);
  await preserveOnNavigation(page);
  await page.$eval('#acceptRoundRecapBtn',n=>n.scrollIntoView({block:'center'}));
  await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('#acceptRoundRecapBtn')]);
  assert.match(page.url(),/ledger-report\/shell.html/);await page.waitForSelector('.page');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);assert.match(saved.roundRecapFinal,/First won the Featured/);assert.equal(JSON.stringify(saved.roundRecordSnapshot),seeded.record);
  assert.match(await page.$eval('body',n=>n.textContent),/First won the Featured/);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('failed local Story save keeps review open and never opens an unsaved Ledger preview',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture();seeded.state.matches[0].roundRecapGenerated='First finished lowest in the Featured. The Group contests, Foursome and Calcutta each contributed to the event.';
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'story',375,false,false,false,seeded);
  await page.evaluate(()=>openRoundStoryReview());
  assert.match(await page.$eval('#roundRecapStoryTarget',n=>n.textContent),/The group paused for a photo/);
  assert.match(await page.$eval('#roundRecapStoryTarget',n=>n.textContent),/72°F/);
  await page.evaluate(()=>{window.nativeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='the-dye-ledger-v20')throw new DOMException('Full','QuotaExceededError');return nativeSetItem.call(this,key,value);};});
  await page.$eval('#acceptRoundRecapBtn',n=>n.scrollIntoView({block:'center'}));await page.click('#acceptRoundRecapBtn');
  assert.match(page.url(),/index.html$/);assert.equal(await page.evaluate(()=>getFinalRoundRecap(getReviewOrActiveMatch())), '');
  assert.match(await page.evaluate(()=>getReviewOrActiveMatch().roundRecapStatus),/could not be saved locally/);
  await page.evaluate(()=>{Storage.prototype.setItem=nativeSetItem;});
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('report-transfer failure preserves the saved Story and offers a usable preview retry',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'story',375,false,false,false,fixture());
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
  await page.evaluate(()=>openRoundStoryReview());
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key.startsWith('dye-ledger-report-'))throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
  await page.$eval('#acceptRoundRecapBtn',n=>n.scrollIntoView({block:'center'}));await page.click('#acceptRoundRecapBtn');
  await page.waitForFunction(()=>document.getElementById('acceptRoundRecapBtn')?.disabled===false);
  assert.match(page.url(),/index.html$/);assert.ok(await page.evaluate(()=>getFinalRoundRecap(getReviewOrActiveMatch())));
  assert.equal(await page.evaluate(()=>uiState.pendingLedgerOpenMatchId),'r');
  assert.match(await page.$eval('body',n=>n.textContent),/Ledger Entry could not be opened|Ledger preview could not open/);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('remote receives host completion through score refresh, archives the frozen record and returns to Create or Join',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture(true),page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seeded);await cloudClient(page,seeded.cloud);
  await page.evaluate(()=>refreshActiveSharedScores());
  const result=await page.evaluate(()=>({state:JSON.parse(localStorage.getItem('the-dye-ledger-v20')),tab:getActivePanelId(),landing:!document.getElementById('setupChoiceGrid').classList.contains('hidden')}));
  assert.equal(result.state.activeMatchId,null,JSON.stringify({pending:result.state.matches[0].remoteCompletionPending,host:result.state.matches[0].sharedHostDeviceId}));assert.equal(result.state.completedSummaryMatchId,null);assert.equal(result.state.matches[0].status,'complete');assert.equal(JSON.stringify(result.state.matches[0].roundRecordSnapshot),seeded.record);assert.equal(result.tab,'setup');assert.equal(result.landing,true);
  await preserveOnNavigation(page);await page.reload({waitUntil:'load'});assert.equal(await page.evaluate(()=>getActiveMatch()),null);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('host completion never discards remote queued scores, unsaved fields or recovery after local save failure',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  for(const mode of ['outbox','resume','conflict','unsaved','storage']){
   const seeded=fixture(true),page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seeded);
   await page.select('#currentHoleSelect','1');
   if(mode==='conflict')await page.evaluate(()=>{getActiveMatch().players.filter(p=>['p4','p5'].includes(p.playerId)).forEach(p=>p.scores[0].gross=7);persist({skipRender:true});renderCurrentMatch();});
   await cloudClient(page,seeded.cloud);
   if(['outbox','resume'].includes(mode))await page.evaluate(()=>stampSharedScoreWrite(getActiveMatch(),'p4',1));
   if(mode==='resume'){
    await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{value:true,configurable:true}));
    const delivery=await page.evaluate(()=>drainPendingSharedScoreOperationsForMatch(getActiveMatch()));
    assert.equal(delivery.skipped,true);assert.equal(delivery.pending,1);assert.equal(delivery.permanent,true);
   }
   if(mode==='unsaved')await page.$eval('[data-score-team="3"]',n=>{n.value='7';});
   if(mode==='storage')await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
   await page.evaluate(()=>refreshActiveSharedScores());
   assert.equal(await page.evaluate(()=>state.activeMatchId),'r',mode);
   const pending=await page.evaluate(()=>getActiveMatch().remoteCompletionPending);assert.ok(pending,mode);
   if(mode==='conflict'){assert.match(pending.reason,/saved scores differ/);assert.equal(pending.localScoreConflicts.length,2);assert.equal(pending.localScoreConflicts[0].gross,7);assert.equal(pending.localScoreConflicts[0].frozenGross,5);}
   if(['outbox','resume'].includes(mode))assert.equal(await page.evaluate(()=>getSharedScoreOutboxOperations(getActiveMatch()).length),1);
   if(mode==='unsaved'){
    assert.equal(await page.$eval('[data-score-team="3"]',n=>n.value),'7');assert.ok(pending.unsavedEntries?.some(row=>row.playerId==='p4'&&row.value==='7'),JSON.stringify({reason:pending.reason,unsaved:pending.unsavedEntries}));
    await preserveOnNavigation(page);await page.reload({waitUntil:'load'});await page.click('[data-tab="score"]');await cloudClient(page,seeded.cloud);await page.evaluate(()=>refreshActiveSharedScores());
    assert.equal(await page.evaluate(()=>state.activeMatchId),'r');assert.ok(await page.evaluate(()=>getActiveMatch().remoteCompletionPending.unsavedEntries.some(row=>row.value==='7')));
    assert.match(await page.$eval('#playGroupRulesPreview',n=>n.textContent),/Captured unsaved entries: Third · hole 1: 7/);
   }
   if(mode==='storage')assert.match(pending.reason,/could not be saved locally/);
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('live Flamtana projected settlement is readable at phone widths and larger text without saving projected money',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture();seeded.state.matches[0].status='active';seeded.state.matches[0].completedAt=null;seeded.state.matches[0].roundRecordSnapshot=null;seeded.state.activeMatchId='r';seeded.state.completedSummaryMatchId=null;
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'quick',375,false,false,false,seeded);
  assert.match(await page.$eval('[data-settlement-state="projected"]',n=>n.textContent),/Projected settlement if current standings hold/);
  assert.deepEqual(await page.$$eval('[data-settlement-state="projected"] thead th',nodes=>nodes.map(n=>n.textContent)),['Golfer','Combined net','Featured','Group 1','Group 2','Foursome','Calcutta']);
  const store=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20'));
  for(const [width,size]of [[320,16],[375,16],[430,16],[375,32]]){
   await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.equal(await page.$eval('[data-settlement-state="projected"] .player-summary-scroll',n=>n.getBoundingClientRect().right<=innerWidth),true);
   assert.ok(await page.$$eval('[data-settlement-state="projected"] td:not(:first-child),[data-settlement-state="projected"] th',nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20')),store);
  await page.setViewport({width:375,height:812});await page.addStyleTag({content:'html{font-size:16px!important}'});await page.screenshot({path:'tmp/report-qa/v72/projected-settlement.png',fullPage:false});
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
