import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
function fixture(){
 const data=scrambleFixture();data.match.sharedMatchId='DYE-700001';data.match.sharedMatchCode='DYE-700001';data.match.smartScoreAdvanceEnabled=false;
 data.match.sharedParticipants.forEach(person=>person.userId='same-account');
 data.match.players.forEach(player=>player.assignedTeamIndex=[3,6,9,12][player.team-1]);
 data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:2,tieMethod:'split',featuredStake:20,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:Object.fromEntries(data.players.map(player=>[player.id,1]))}];
 const state=loadLiveEngine().seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:'r'});
 return {data,state,storage:[['the-dye-ledger-shared-device-id','host'],['dyeLedgerSharedParticipantId:DYE-700001','hp']]};
}
test('same-account remote rows survive host Save from an untouched stale render, while deliberate host takeover still saves',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,fixture());
  // Download changes state before repaint: host controls for Cart 2 still show blank.
  const rows=Array.from({length:18},(_,i)=>['p4','p5','p6','p7'].map(player_id=>({player_id,hole_number:i+1,gross:5,updated_by:'same-account',updated_at:'2026-10-11T20:00:00Z'}))).flat();
  await page.evaluate(rows=>mergeRemoteScoreEntriesIntoMatch(getActiveMatch(),rows),rows);
  await page.$eval('[data-score-team="1"]',node=>{node.value='4';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});await page.click('#saveScoresBtn');
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
  assert.ok(saved.players.slice(4).every(player=>player.scores.every(score=>score.gross===5)));
  assert.equal(saved.sharedHostScoreOverrides['p4:1'],undefined);
  await page.select('#currentHoleSelect','1');
  await page.evaluate(()=>renderCurrentMatch());
  await page.$eval('[data-score-team="3"]',node=>{node.value='6';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});await page.click('#saveScoresBtn');
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);assert.deepEqual(saved.players.slice(4,6).map(player=>player.scores[0].gross),[6,6]);assert.ok(saved.sharedHostScoreOverrides['p4:1']);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('Play Scoreboard shows all four wager leaderboards, both Groups and provisional Calcutta with off-low team nets',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture();seeded.state.matches[0].players.forEach(player=>player.scores[0].gross=4);
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'quick',375,false,false,false,seeded);
  await page.waitForSelector('[data-flamtana-leaderboard="calcutta"]');
  assert.deepEqual(await page.$$eval('[data-flamtana-leaderboard]',nodes=>nodes.map(node=>node.dataset.flamtanaLeaderboard)),['featured','group1','group2','foursome','calcutta']);
  const text=await page.$eval('#quickScoreboardBody',node=>node.textContent);assert.match(text,/off the lowest of all four teams/);assert.match(text,/Projected net/);assert.match(text,/common completed holes/);
  for(const width of [320,375,430]){await page.setViewport({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await page.addStyleTag({content:'html{font-size:32px!important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('Flamtana preview has four team rows, off-low Gets, and matching header/value tracks at phone, desktop and large text',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const seeded=fixture(),engine=loadLiveEngine(),draftStore=new Map();engine.saveSetupDraft(seeded.data.match,{getItem:key=>draftStore.get(key),setItem:(key,value)=>draftStore.set(key,value)});
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'setup',375,false,false,false,{state:{players:seeded.data.players,courses:[seeded.data.course],matches:[]},storage:[...draftStore]});
  for(const [i,value]of [3,6,9,12].entries()){
   await page.focus(`[data-assigned-team-index="${i+1}"]`);
   await page.$eval(`[data-assigned-team-index="${i+1}"]`,(node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},value);
  }
  await page.$eval('#setupDestinationBackBtn',node=>node.scrollIntoView({block:'center'}));
  await page.click('#setupDestinationBackBtn');await page.click('[data-open-setup-destination="games"]');
  await page.click('.featured-handicap-preview-section>summary');
  await page.evaluate(()=>renderSetupHandicapPreview());
  await page.waitForFunction(()=>document.querySelectorAll('#setupFeaturedHandicapPreview .handicap-preview-row').length===4,{timeout:5000}).catch(async error=>{console.log(await page.evaluate(()=>({preview:document.getElementById('setupFeaturedHandicapPreview').textContent,indexes:[...document.querySelectorAll('[data-assigned-team-index]')].map(node=>[node.dataset.assignedTeamIndex,node.value]),draft:uiState.assignedTeamIndexDraft,selected:getSelectedPlayersFromSetup(),games:collectSelectedGames()})));throw error;});
  assert.equal(await page.$$eval('#setupFeaturedHandicapPreview .handicap-preview-row',nodes=>nodes.length),4);
  assert.deepEqual(await page.$$eval('#setupFeaturedHandicapPreview .handicap-preview-row',nodes=>nodes.map(node=>node.lastElementChild.textContent)),['0','3','6','9']);
  for(const [width,size]of [[320,16],[375,16],[900,16],[375,32]]){
   await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});
   const diffs=await page.evaluate(()=>{const header=[...document.querySelector('#setupFeaturedHandicapPreview .handicap-preview-header').children],row=[...document.querySelector('#setupFeaturedHandicapPreview .handicap-preview-row').children];return header.map((node,i)=>{const a=node.getBoundingClientRect(),b=row[i].getBoundingClientRect();return Math.abs(a.left+a.width/2-b.left-b.width/2);});});assert.ok(diffs.every(diff=>diff<1),JSON.stringify(diffs));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
  await page.evaluate(()=>{document.getElementById('scoreEntryModeSelect').value='single_device';document.getElementById('sharedMatchEnabled').checked=false;renderRoundReadiness();});
  assert.match(await page.$eval('[data-setup-status="players"]',node=>node.textContent),/^Ready$/);
  assert.match(await page.$eval('[data-setup-status="scoring"]',node=>node.textContent),/Needs attention/);
  assert.match(await page.$eval('[data-setup-reason="scoring"]',node=>node.textContent),/Shared Match/);
  await page.click('#setupDestinationBackBtn');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
