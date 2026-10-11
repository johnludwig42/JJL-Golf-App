import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer} from './support/design-browser.js';
test('normal browser startup compacts legacy team storage and displays quota remedy and diagnostics',{skip:!chrome,timeout:60000},async()=>{
 const engine=loadLiveEngine(),data=scrambleFixture(),host=engine.getSharedDeviceId();
 data.match.sharedHostDeviceId=host;data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;
 const seeded=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}),match=seeded.matches[0];
 match.players.forEach(player=>player.scores.forEach(score=>score.gross=4));match.sharedLedgerParity={parityConfirmed:true};
 const finished=engine.buildFinishedMatchCandidate(match,'2026-10-11T17:00:00Z').candidate;
 assert.equal(finished.roundRecordSnapshot.isFrozen,true);
 const frozen=JSON.stringify(finished.roundRecordSnapshot);
 finished.players.forEach(player=>player.stats=engine.buildEmptyStats());
 finished.sharedSyncDiagnostics=Array.from({length:200},(_,i)=>({reasonCode:'REMOTE_SCORE_ACCEPTED',i}));
 const payload=JSON.parse(JSON.stringify({...seeded,matches:[finished],activeMatchId:null}));
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await browser.newPage();await page.setViewport({width:375,height:812});
  await page.evaluateOnNewDocument((value)=>{
   localStorage.clear();localStorage.setItem('the-dye-ledger-v20',JSON.stringify(value));
   localStorage.setItem('v68-preserved-proof','keep this');
  },payload);
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  const result=await page.evaluate(()=>{
   const saved=JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0];
   renderBuildInfoUi();
   const initial={noStats:saved.players.every(player=>!Object.prototype.hasOwnProperty.call(player,'stats')),tail:saved.sharedSyncDiagnostics.length,frozen:JSON.stringify(saved.roundRecordSnapshot),proof:localStorage.getItem('v68-preserved-proof'),usage:document.getElementById('appStorageUsage').textContent};
   // Real browser quota and the production persist/toast path, not a source assertion.
   state.notes='x'.repeat(6_000_000);initial.saveResult=persist({skipRender:true});
   initial.message=document.getElementById('toast').textContent;
   initial.copy=getAppDiagnosticsText();
   return initial;
  });
  assert.equal(result.noStats,true);assert.equal(result.tail,5);assert.equal(result.frozen,frozen);assert.equal(result.proof,'keep this');
  assert.match(result.usage,/Saved rounds: 1/);assert.equal(result.saveResult,false);assert.match(result.message,/storage.*full/i);assert.match(result.message,/Library/);assert.doesNotMatch(result.message,/try again/i);assert.match(result.copy,/Local storage quota was exceeded/);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
