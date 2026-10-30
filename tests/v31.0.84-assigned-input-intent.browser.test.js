import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';

for(const teamScored of [true,false])test(`${teamScored?'team':'individual'}: navigation cannot replay an untouched stale DOM value after canonical reconciliation`,{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const data=scrambleFixture();Object.assign(data.match,{sharedMatchId:'DYE-DOM-INTENT',sharedMatchCode:'DYE-DOM-INTENT',sharedShowOtherScores:true,smartScoreAdvanceEnabled:false,currentHole:1});
  if(!teamScored)delete data.match.teamScoringPolicyVersion;
  data.match.players.forEach(p=>p.scores[0].gross=7);
  const state=loadLiveEngine().seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:'r'});
  const fixture={state,storage:[['the-dye-ledger-shared-device-id','cart2'],['dyeLedgerSharedParticipantId:DYE-DOM-INTENT','jp']]};
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',430,false,false,false,fixture);
  const selector='input[data-score-player="p4"]';await page.waitForSelector(selector,{visible:true});
  await page.evaluate(()=>{
    const match=getActiveMatch();
    mergeRemoteScoreEntriesIntoMatch(match,['p4','p5'].map(player_id=>({player_id,hole_number:1,gross:8,participant_id:'hp',updated_at:new Date().toISOString()})));
    // Deliberately retain the old DOM, as a deferred background render can do.
  });
  assert.equal(await page.$eval(selector,n=>n.value),'7');
  await page.select('#currentHoleSelect','2');
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
  assert.deepEqual((await saved()).players.slice(4,6).map(p=>p.scores[0].gross),[8,8]);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20:shared-score-outbox:v1')||'{"operations":[]}').operations.length),0);
  await page.select('#currentHoleSelect','1');
  await page.$eval(selector,n=>{n.value='9';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('#saveScoresBtn');
  assert.deepEqual((await saved()).players.slice(4,6).map(p=>p.scores[0].gross),teamScored?[9,9]:[9,8]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
