import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync} from 'node:fs';
import {fixture} from './support/shared-delivery-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';

test('DIRECT browser model: 18 simulated locks honor session readiness and retain 144 scores',{skip:!chrome,timeout:90000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const {engine,match,data}=fixture();match.roundRecapGenerated='Saved Story stays';match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,picks:Object.fromEntries(data.players.map(player=>[player.id,1]))})];
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state:{players:data.players,courses:[data.course],matches:[match],activeMatchId:match.id},storage:[['the-dye-ledger-shared-device-id',engine.getSharedDeviceId()]]});
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.testVisibility='visible';Object.defineProperty(document,'visibilityState',{get:()=>window.testVisibility,configurable:true});
   window.traces=[];window.rows=[];window.refreshes=0;window.membershipReports=[];window.expired=false;
   const client={auth:{async getSession(){await window.readinessGate;return expired?{error:{code:'PGRST301',message:'Invalid token'}}:{data:{session:{user:{id:'same-user'}}}};},async refreshSession(){refreshes++;expired=false;return {data:{session:{user:{id:'same-user'}}}};}},async rpc(){traces.push('rpc');return {error:{code:'PGRST202',message:'Missing schema-cache function'}};},from(table){let write=null,body=null;const query={select(){return query;},update(value){write='update';body=value;return query;},eq(){return query;},order(){return query;},upsert(value){write='upsert';body=value;return query;},then(resolve,reject){if(write==='upsert'){traces.push('score-write');for(const entry of body){rows=rows.filter(row=>row.id!==entry.id);rows.push(entry);}}if(write==='update'){traces.push('heartbeat-write');membershipReports.push(normalizeSharedDeliveryReport(JSON.parse(body.device_label).delivery));}return Promise.resolve({data:write?null:(table==='score_entries'?rows:[]),error:null}).then(resolve,reject);}};return query;}};
   hasSupabaseConfig=()=>true;ensureSupabaseClient=async()=>client;getSupabaseUser=async()=>({id:'same-user'});mergeCloudSharedMetadata=async()=>false;scheduleSharedMatchSync=()=>{};refreshActiveSharedParticipants=async()=>false;
   const heartbeat=heartbeatActiveSharedParticipant,poll=refreshActiveSharedScores;
   heartbeatActiveSharedParticipant=async options=>{traces.push('heartbeat-start');return heartbeat(options);};refreshActiveSharedScores=async options=>{traces.push('poll-start');return poll(options);};
  });
  for(let hole=1;hole<=18;hole++){
   await page.waitForFunction(()=>!sharedForegroundInflight && !sharedOutboxDrainInflight);
   await page.evaluate(hole=>{
    const current=getActiveMatch();for(let team=1;team<=4;team++){const result=applyTeamGrossScore(current,team,hole,5);if(!result.valid)throw new Error(JSON.stringify({result,setup:getScrambleSetupError(current,{assignments:true}),started:current.roundTiming,host:isCurrentDeviceMatchHost(current),format:isTeamScoredRound(current)}));for(const id of result.changedPlayerIds)stampSharedScoreWrite(current,id,hole);}persist({skipRender:true});renderAll();
    traces=[];readinessGate=new Promise(resolve=>window.releaseReadiness=resolve);if(hole===9)expired=true;
    testVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'));testVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));
   },hole);
   await new Promise(resolve=>setTimeout(resolve,10));assert.deepEqual(await page.evaluate(()=>traces),[],`hole ${hole}: requests must wait for readiness`);
   await page.evaluate(()=>releaseReadiness());await page.waitForFunction(()=>!sharedForegroundInflight && !sharedOutboxDrainInflight && !getSharedScoreOutboxOperations(getActiveMatch()).length,{timeout:5000});
  }
  await page.evaluate(()=>refreshActiveSharedScores({silent:true,render:false}));
  const result=await page.evaluate(()=>({rows:rows.length,refreshes,parity:getActiveMatch().sharedLedgerParity?.parityConfirmed,story:getActiveMatch().roundRecapGenerated,transport:getActiveMatch().sharedScoreDeliveryTransport?.kind,status:getSharedSyncStatus(getActiveMatch()),reports:membershipReports.length,traces,errors:getActiveMatch().lastSharedSyncError}));
  assert.equal(result.rows,144,JSON.stringify(result));assert.equal(result.refreshes,1);assert.equal(result.parity,true,JSON.stringify(result));assert.equal(result.story,'Saved Story stays');assert.equal(result.transport,'direct');assert.equal(result.status.tone,'warning');assert.match(result.status.detail,/no operation receipts/);assert.ok(result.reports>=18);
  await page.evaluate(()=>{renderAll();document.querySelector('.shared-title-sync-details').open=true;document.querySelectorAll('.shared-title-sync-details details').forEach(node=>node.open=true);});
  await page.addStyleTag({content:'html{font-size:32px!important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  mkdirSync('tmp/report-qa/v77',{recursive:true});await page.screenshot({path:'tmp/report-qa/v77/direct-status-large-text.png',fullPage:true});
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('DIRECT browser model: heartbeat success never masks an RLS-denied score upload',{skip:!chrome,timeout:30000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const {engine,match,data,queue,storage}=fixture();queue(match.players.slice(0,1));
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state:{players:data.players,courses:[data.course],matches:[match],activeMatchId:match.id},storage:[['the-dye-ledger-shared-device-id',engine.getSharedDeviceId()],...storage.values]});
  await page.evaluate(async()=>{
   Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.heartbeats=0;
   const client={auth:{getSession:async()=>({data:{session:{user:{id:'same-user'}}}})},rpc:async()=>({error:{code:'PGRST202',message:'RPC unavailable'}}),from(table){const query={update(){return query;},eq(){return query;},upsert(){return Promise.resolve({error:{code:'42501',message:'Row-level security denied'}});},then(resolve,reject){heartbeats++;return Promise.resolve({error:null}).then(resolve,reject);}};return query;}};
   hasSupabaseConfig=()=>true;ensureSupabaseClient=async()=>client;getSupabaseUser=async()=>({id:'same-user'});mergeCloudSharedMetadata=async()=>false;scheduleSharedMatchSync=()=>{};refreshActiveSharedParticipants=async()=>false;refreshActiveSharedScores=async()=>false;
   await resumeSharedForeground();
  });
  await page.waitForFunction(()=>!sharedOutboxDrainInflight);
  const result=await page.evaluate(()=>({contact:getActiveMatch().sharedDeliveryLastContactAt,pending:getSharedScoreOutboxOperations(getActiveMatch()).length,report:getLocalSharedDeliveryReport(getActiveMatch()),status:getSharedSyncStatus(getActiveMatch()),heartbeats}));
  assert.ok(result.contact);assert.ok(result.heartbeats);assert.equal(result.pending,18);assert.equal(result.report.acknowledgedAt,null);assert.equal(result.report.parity,'not-confirmed');assert.equal(result.report.retry,'needs-action');assert.equal(result.status.tone,'attention');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});


test('COMMON browser model: local-only wake never starts shared authentication',{skip:!chrome,timeout:30000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const {engine,match,data}=fixture();match.storageMode='local';
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state:{players:data.players,courses:[data.course],matches:[match],activeMatchId:match.id},storage:[['the-dye-ledger-shared-device-id',engine.getSharedDeviceId()]]});
  const result=await page.evaluate(async()=>{
   Object.defineProperty(navigator,'onLine',{value:true,configurable:true});hasSupabaseConfig=()=>true;let calls=0;
   ensureSupabaseClient=async()=>{calls++;throw new Error('Local scoring must not request authentication.');};
   const resumed=await resumeSharedForeground();return {calls,resumed,id:getActiveMatch().id};
  });
  assert.equal(result.calls,0);assert.equal(result.resumed,false);assert.equal(result.id,match.id);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
