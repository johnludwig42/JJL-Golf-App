import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync} from 'node:fs';
import {fixture,plain} from './support/shared-delivery-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
function seed(){
 const {engine,match,storage,data,queue}=fixture();match.status='complete';match.completedAt='2026-10-21T12:00:00Z';
 match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
 const report=engine.buildLedgerEntryReportModel(match);report.meta.status='final';report.meta.story='Original verified round story.';
 match.ledgerEntrySnapshot=engine.normalizeAcceptedLedgerEntrySnapshot({status:'accepted',acceptedAt:match.completedAt,report},match.id);
 queue(match.players.slice(0,4));engine.preserveClosedSharedScoreOperations(match,storage);
 const state=engine.seedState({players:data.players,courses:[data.course],matches:[plain(match)],activeMatchId:null});
 return {state,storage:[...storage.values,['the-dye-ledger-shared-device-id',match.sharedHostDeviceId]],original:JSON.stringify([match.roundRecordSnapshot,match.ledgerEntrySnapshot])};
}
async function openReview(page){
 await page.evaluate(()=>{activateTab('courses');openExperienceDestination('courses','rounds');});
 await page.waitForSelector('#matchesList [data-preserved-review]',{visible:true});await page.click('#matchesList [data-preserved-review]');
 await page.waitForFunction(()=>document.querySelectorAll('[data-review-group]').length===36);
}
async function preserveReload(page){
 await page.evaluate(()=>{window.name=JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));});
 await page.evaluateOnNewDocument(()=>{const entries=JSON.parse(window.name||'{}');localStorage.clear();for(const [key,value]of Object.entries(entries))localStorage.setItem(key,value);});
}
test('real IndexedDB: review 72 scores at phone/larger text widths, resolve, reload and inspect immutable audit',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=seed(),page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seeded);
  await openReview(page);
  assert.match(await page.$eval('#preservedScoreReviewDialog',el=>el.textContent),/only on this device/);
  assert.match(await page.$eval('#preservedScoreReviewDialog',el=>el.textContent),/no Accept/);
  for(const size of [16,24,32]){
   await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);
   assert.equal(await page.$eval('#preservedScoreReviewDialog',el=>el.scrollWidth<=el.clientWidth+1),true,'dialog must wrap at '+size);
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='16px');
  mkdirSync('tmp/report-qa/v79',{recursive:true});await page.screenshot({path:'tmp/report-qa/v79/review-375.png'});
  await page.click('#selectAllPreservedScoreReview');await page.type('#preservedScoreReviewReason','Host checked both partners against the frozen card.');await page.click('#preservedScoreReviewAttest');
  await page.evaluate(()=>{fetchSharedMatchMetadata=async()=>({status:'complete',roundRecordSnapshot:getMatch('r').roundRecordSnapshot});});
  page.once('dialog',dialog=>dialog.accept());await page.click('[data-resolve-preserved="already-reflected"]');
  await page.waitForFunction(()=>getSharedScoresPreservedForHostReview(getMatch('r')).length===0);
  await page.waitForFunction(()=>getMatch('r').sharedPublishedRecordParity?.confirmed);
  assert.equal(await page.evaluate(()=>JSON.stringify([getMatch('r').roundRecordSnapshot,getMatch('r').ledgerEntrySnapshot])),seeded.original);
  const audit=await page.evaluate(()=>getPreservedReviewStore().list('DYE-DELIVERY'));assert.equal(audit.length,1);assert.equal(audit[0].rows.flatMap(row=>row.sources).length,72);
  await preserveReload(page);await page.reload({waitUntil:'networkidle0'});
  await page.evaluate(()=>{activateTab('courses');openExperienceDestination('courses','rounds');});await page.waitForSelector('#matchesList [data-preserved-review]',{visible:true});await page.click('#matchesList [data-preserved-review]');
  await page.waitForFunction(()=>document.getElementById('preservedScoreReviewHistory').textContent.includes('Host checked both partners'));
  assert.equal(await page.evaluate(()=>getSharedScoresPreservedForHostReview(getMatch('r')).length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify([getMatch('r').roundRecordSnapshot,getMatch('r').ledgerEntrySnapshot])),seeded.original);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('real IndexedDB receipt survives outbox cleanup failure and completes after reload; pressure remains visible',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seed());await openReview(page);
  await page.evaluate(()=>{
   localStorage.setItem('test-pressure','x'.repeat(1100000));persist({skipRender:true});
   const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('shared-score-outbox') && JSON.parse(value).preservedForHostReview?.length===0)throw new DOMException('Full','QuotaExceededError');return set.call(this,key,value);};
  });
  assert.equal(await page.$eval('#preservedScorePressure',el=>el.hidden),false);
  await page.click('#selectAllPreservedScoreReview');await page.type('#preservedScoreReviewReason','The agreed result stands.');await page.click('#preservedScoreReviewAttest');page.once('dialog',dialog=>dialog.accept());await page.click('[data-resolve-preserved="discard"]');
  await page.waitForFunction(()=>document.getElementById('preservedScoreReviewStatus').textContent.includes('audit is saved'));
  assert.equal(await page.evaluate(()=>getSharedScoresPreservedForHostReview(getMatch('r')).length),72);
  assert.equal((await page.evaluate(()=>getPreservedReviewStore().list('DYE-DELIVERY'))).length,1);
  await preserveReload(page);await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>getSharedScoresPreservedForHostReview(getMatch('r')).length===0);
  const audit=await page.evaluate(()=>getPreservedReviewStore().list('DYE-DELIVERY'));assert.equal(audit.length,1);assert.equal(audit[0].phase,'complete');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('a remote discarded difference verifies the frozen record and leaves the closed round without a score upload',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seed());
  const original=await page.evaluate(async()=>{
   const match=getMatch('r'),record=match.roundRecordSnapshot,ledger=match.ledgerEntrySnapshot;
   localStorage.setItem('the-dye-ledger-shared-device-id','cart2');localStorage.setItem('dyeLedgerSharedParticipantId:DYE-DELIVERY','jp');
   writeSharedScoreOutbox({operations:[],preservedForHostReview:[]});
   match.status='active';match.roundRecordSnapshot=null;match.remoteCompletionPending={completedAt:match.completedAt,roundRecordSnapshot:record,ledgerEntrySnapshot:ledger};state.activeMatchId='r';
   for(const id of ['p4','p5']){match.players.find(p=>p.playerId===id).scores[0].gross=7;stampSharedScoreWrite(match,id,1,{deviceId:'cart2',participantId:'jp'});}
   preserveClosedSharedScoreOperations(match);persist({skipRender:true});renderAll();activateTab('score');
   fetchSharedMatchMetadata=async()=>({status:'complete',roundRecordSnapshot:record});
   ensureSupabaseClient=async()=>{throw new Error('A score upload is forbidden in this test');};
   return {record:await DyeLedgerPreservedReview.hash(record),ledger:await DyeLedgerPreservedReview.hash(ledger)};
  });
  await page.waitForSelector('#playGroupRulesPreview [data-preserved-review]',{visible:true});await page.click('#playGroupRulesPreview [data-preserved-review]');
  await page.waitForSelector('[data-review-group]');await page.click('[data-review-group]');await page.type('#preservedScoreReviewReason','Host confirmed the reported 4 stands; local 7 is discarded.');await page.click('#preservedScoreReviewAttest');page.once('dialog',dialog=>dialog.accept());await page.click('[data-resolve-preserved="discard"]');
  await page.waitForFunction(()=>getMatch('r').sharedPublishedRecordParity?.confirmed);
  const result=await page.evaluate(async()=>{const match=getMatch('r');const finished=finishRemoteSharedRoundIfReady(match);return {finished,active:state.activeMatchId,record:await DyeLedgerPreservedReview.hash(match.roundRecordSnapshot),ledger:await DyeLedgerPreservedReview.hash(match.ledgerEntrySnapshot),pending:getSharedScoreOutboxOperations(match).length,remaining:getSharedScoresPreservedForHostReview(match).length};});
  assert.equal(result.finished,true);assert.equal(result.active,null);assert.equal(result.record,original.record);assert.equal(result.ledger,original.ledger);assert.equal(result.pending,0);assert.equal(result.remaining,0);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('an aborted IndexedDB transaction is not a durable audit and cannot clear any preserved score',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,seed());await openReview(page);
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value){const request=put.call(this,value);this.transaction.abort();return request;};});
  await page.click('#selectAllPreservedScoreReview');await page.type('#preservedScoreReviewReason','Review transaction must commit first.');await page.click('#preservedScoreReviewAttest');page.once('dialog',dialog=>dialog.accept());await page.click('[data-resolve-preserved="discard"]');
  await page.waitForFunction(()=>document.getElementById('preservedScoreReviewStatus').textContent.includes('Local audit'));
  assert.equal(await page.evaluate(()=>getSharedScoresPreservedForHostReview(getMatch('r')).length),72);
  assert.equal((await page.evaluate(()=>getPreservedReviewStore().list('DYE-DELIVERY'))).length,0);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
