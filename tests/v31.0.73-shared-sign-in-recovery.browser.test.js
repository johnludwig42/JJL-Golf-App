import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
function fixture(){
 const d=scrambleFixture(),e=loadLiveEngine(),host=e.getSharedDeviceId();d.match.sharedHostDeviceId=host;d.match.sharedDevices[0].id=host;d.match.sharedParticipants[0].deviceId=host;d.match.sharedMatchId='DYE-730001';d.match.sharedMatchCode='DYE-730001';
 d.match.players.forEach(p=>{p.assignedTeamIndex=0;p.scores.forEach(s=>s.gross=p.team+2);});d.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:2,tieMethod:'split',picks:Object.fromEntries(d.players.map(p=>[p.id,1]))}];
 const state=e.seedState({players:d.players,courses:[d.course],matches:[d.match],activeMatchId:'r'}),cloud=e.buildCloudMatchPayload(state.matches[0],'owner');
 state.matches[0].sharedLedgerParity={status:'confirmed',parityConfirmed:true,localCount:144,remoteCount:144,missingLocal:[],missingRemote:[],conflicts:[]};
 return {state,cloud,storage:[['the-dye-ledger-shared-device-id',host],['dyeLedgerSharedParticipantId:DYE-730001','hp']]};
}
async function connect(page,cloud,user){
 await page.evaluate(({cloud,user})=>{
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true}); // The visual fixture defaults offline; this test explicitly exercises cloud requests.
  // This older fixture models manual Sync Now; .77 covers foreground polling/presence.
  resumeSharedForeground=async()=>false;
  window.sessionUser=user;window.writeCalls=[];hasSupabaseConfig=()=>true;getSupabaseUser=async()=>sessionUser;scheduleSharedMatchSync=()=>{};
  const scores=getActiveMatch().players.flatMap(p=>p.scores.map(s=>({player_id:p.playerId,hole_number:s.holeNumber,gross:s.gross,updated_by:'owner',entry_status:'active'})));
  ensureSupabaseClient=async()=>({
   rpc:async(name)=>{writeCalls.push(name);return sessionUser.id==='owner'?{data:cloud.matchRow.id,error:null}:{data:null,error:{code:'42501',message:'Shared Match Owner authorization required'}};},
   from(table){const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},upsert(payload){writeCalls.push(table);q.write=true;return q;},then(resolve){return Promise.resolve({data:q.write?null:table==='matches'?cloud.matchRow:table==='score_entries'?scores:[],error:null}).then(resolve);}};return q;}
  });
  sharedSessionChanged('INITIAL_SESSION',{user});
 },{cloud,user});
}
test('logged-out host gets an actionable sign-in prompt instead of the finish/sync loop; signing in restores sync and completion',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const f=fixture(),page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,f);await connect(page,f.cloud,{id:'guest',is_anonymous:true});
  const before=await page.evaluate(()=>JSON.stringify(getActiveMatch().players.map(p=>p.scores)));
  await page.evaluate(()=>showRoundEndPrompt(getActiveMatch(),'complete'));await page.click('#roundEndPrimaryBtn');
  await page.waitForSelector('#sharedAccountRecovery-score:not(.hidden)');
  assert.match(await page.$eval('#sharedAccountRecovery-score',n=>n.textContent),/Sign in to sync this round/);
  assert.equal(await page.evaluate(()=>writeCalls.length),0);assert.equal(await page.evaluate(()=>getActiveMatch().status),'active');assert.equal(await page.evaluate(()=>getActiveMatch().sharedLedgerParity.missingRemote.length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(getActiveMatch().players.map(p=>p.scores))),before);
  for(const [width,size]of [[320,16],[375,16],[430,16],[375,32]]){await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok(await page.$$eval('#sharedAccountRecovery-score button',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));}
  await page.setViewport({width:375,height:812});await page.addStyleTag({content:'html{font-size:16px!important}'});await page.$eval('#sharedAccountRecovery-score [data-open-shared-account]',n=>n.scrollIntoView({block:'center'}));await page.click('#sharedAccountRecovery-score [data-open-shared-account]');
  assert.equal(await page.evaluate(()=>getActivePanelId()),'settings');assert.equal(await page.$eval('#settings',n=>n.dataset.activeDestination),'account');assert.equal(await page.evaluate(()=>state.activeMatchId),'r');
  await page.evaluate(()=>{sessionUser={id:'owner',is_anonymous:false};sharedSessionChanged('SIGNED_IN',{user:sessionUser});});await page.click('[data-tab="score"]');await page.$eval('#sharedAccountRecovery-score [data-retry-account-sync]',n=>n.scrollIntoView({block:'center'}));await page.click('#sharedAccountRecovery-score [data-retry-account-sync]');
  await page.waitForFunction(()=>!getActiveMatch().sharedAccountRecovery&&getActiveMatch().sharedLedgerParity.parityConfirmed,{timeout:10000});
  assert.equal(await page.evaluate(()=>JSON.stringify(getActiveMatch().players.map(p=>p.scores))),before);
  await page.evaluate(()=>showRoundEndPrompt(getActiveMatch(),'complete'));await page.click('#roundEndPrimaryBtn');await page.waitForFunction(()=>state.matches[0].status==='complete');assert.equal(await page.evaluate(()=>state.matches[0].roundRecordSnapshot.isFrozen),true);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('a signed-in but unauthorized account gets access guidance, not a false logged-out diagnosis',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{const f=fixture(),page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,f);await connect(page,f.cloud,{id:'other-account',is_anonymous:false});await page.evaluate(()=>flushSharedMatchSync(getActiveMatch().id,{silent:false}));const text=await page.$eval('#sharedAccountRecovery-score',n=>n.textContent);assert.match(text,/Check your account and shared-match access/);assert.doesNotMatch(text,/Sign in to sync this round/);assert.equal(await page.evaluate(()=>getActiveMatch().sharedAccountRecovery.kind),'permission');assert.equal(await page.evaluate(()=>getActiveMatch().sharedLedgerParity.missingRemote.length),0);}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

