import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {chrome,startServer} from './support/design-browser.js';
test('real browser quota exhaustion recovers a join without deleting round or outbox facts',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  const page=await browser.newPage();
  await page.evaluateOnNewDocument(()=>{window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__=true;});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__DYE_LEDGER_LIVE_ENGINE__);
  await page.evaluate(()=>localStorage.clear());
  const result=await page.evaluate(()=>{
   const engine=window.__DYE_LEDGER_LIVE_ENGINE__,primary='the-dye-ledger-v20',outbox=primary+':shared-score-outbox:v1';
   const state=engine.seedState({matches:[]});state.notes='Prior facts';localStorage.setItem(primary,JSON.stringify(state));localStorage.setItem(outbox,'unsent score');
   let error;
   for(let i=0;i<100;i++){try{localStorage.setItem('the-dye-ledger-cloud-match:old-'+i,'x'.repeat(100000));}catch(cause){error={name:cause.name,code:cause.code};break;}}
   const cached=engine.cacheCloudMatchBundle('DYE-123456',{large:'x'.repeat(6000000)});
   engine.commitSharedJoinedMatch({id:'joined',storageMode:'local',players:[],downloadedScores:[{gross:4}],notes:'x'.repeat(300000)});
   const saved=JSON.parse(localStorage.getItem(primary)),old=localStorage.getItem(primary);
   let blocked=false;try{engine.commitSharedJoinedMatch({id:'too-large',storageMode:'local',players:[],notes:'x'.repeat(6000000)});}catch(cause){blocked=cause.sharedJoinKind==='storage';}
   return {error,cached,notes:saved.notes,score:saved.matches[0].downloadedScores[0].gross,outbox:localStorage.getItem(outbox),blocked,unchanged:localStorage.getItem(primary)===old,active:state.activeMatchId};
  });
  assert.deepEqual(result.error,{name:'QuotaExceededError',code:22});assert.equal(result.cached,false);assert.equal(result.notes,'Prior facts');assert.equal(result.score,4);assert.equal(result.outbox,'unsent score');assert.equal(result.blocked,true);assert.equal(result.unchanged,true);assert.equal(result.active,'joined');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

