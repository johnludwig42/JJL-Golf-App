import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';

test('Flamtana Play identifies each saved team tee and keeps policy guidance in collapsed Round rules',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  for(const policy of [2,1]){
   const data=scrambleFixture();
   data.course.tees.push({...structuredClone(data.course.tees[0]),id:'blue',teeName:'Blue / White'});
   data.match.courseSnapshot=structuredClone(data.course);
   data.match.players.forEach(p=>{p.teeId=p.team%2?'t':'blue';});
   data.match.sharedMatchId='DYE-710001';data.match.sharedMatchCode='DYE-710001';
   data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:policy,tieMethod:'split',featuredStake:20,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:Object.fromEntries(data.players.map(p=>[p.id,1]))}];
   const state=loadLiveEngine().seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:'r'});
   const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state,storage:[['the-dye-ledger-shared-device-id','host'],['dyeLedgerSharedParticipantId:DYE-710001','hp']]});
   const rows=await page.$$eval('[data-score-team]',nodes=>nodes.map(n=>n.closest('tr').firstElementChild.textContent));
   assert.equal(rows.length,4);
   rows.forEach((text,i)=>{assert.ok(text.includes(i%2?'Blue / White tees':'White tees'));assert.match(text,/Gets \d+/);assert.match(text,/Team score not entered/);assert.doesNotMatch(text,/Team index|Course HCP/);});
   const note=policy===2?'Net scores and all wagers use strokes off':'Legacy round: Off low shows relative strokes';
   assert.equal(await page.$eval('#playGroupRulesPreview .group-rules-preview',node=>node.open),false);
   assert.ok(await page.$eval('#playGroupRulesPreview .group-rules-body',(node,note)=>node.textContent.includes(note),note));
   assert.equal(await page.$eval('[data-score-team]',(node,note)=>node.closest('table').textContent.includes(note),note),false);
   for(const [width,size]of [[320,16],[375,16],[430,16],[375,32]]){
    await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.ok(await page.$$eval('.flamtana-score-stepper button',nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
   }
   if(policy===2){await page.setViewport({width:375,height:812});await page.addStyleTag({content:'html{font-size:16px!important}'});await page.screenshot({path:'tmp/report-qa/v71/play.png',fullPage:true});}
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

