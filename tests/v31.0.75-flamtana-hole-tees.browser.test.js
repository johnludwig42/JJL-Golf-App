import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';

test('Flamtana team labels follow each hole source tee from the saved combo without changing scoring',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  for(const mode of ['CLASSIC','PLAYER']){
   const engine=loadLiveEngine(),data=scrambleFixture(),white=data.course.tees[0];
   const blue={...structuredClone(white),id:'blue',teeName:'Blue',holes:white.holes.map(h=>({...h,yardage:400}))};
   const red={...structuredClone(white),id:'red',teeName:'Red',holes:white.holes.map(h=>({...h,yardage:300}))};
   const combo=(id,reverse)=>({...structuredClone(white),id,teeName:'Blue / White Combo',isCombo:true,
    holes:white.holes.map((h,i)=>structuredClone((Boolean(i%2)===reverse?blue:white).holes[i])),
    comboSources:white.holes.map((h,i)=>({holeNumber:h.holeNumber,sourceTeeId:Boolean(i%2)===reverse?'blue':'t'}))});
   const unknown={...structuredClone(white),id:'unknown',teeName:'Unknown Combo',isCombo:true,comboSources:[],holes:white.holes.map(h=>({...h,yardage:999}))};
   data.course.tees.push(blue,red,combo('combo-a',false),combo('combo-b',true),unknown);
   data.match.courseSnapshot=structuredClone(data.course);blue.teeName='Changed in library';
   data.match.playInputMode=mode;data.match.currentHole=1;
   data.match.players.forEach(p=>p.teeId=['combo-a','combo-b','red','unknown'][p.team-1]);
   data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,picks:Object.fromEntries(data.players.map(p=>[p.id,1]))})];
   const state=engine.seedState({players:data.players,courses:[data.course],matches:[data.match],activeMatchId:'r'});
   const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'classic',375,false,false,false,{state,storage:[['the-dye-ledger-shared-device-id','host']]});
   const labels=()=>page.$$eval('[data-score-team]',nodes=>nodes.map(node=>node.closest('tr').firstElementChild.querySelectorAll('.tiny')[1].textContent));
   const before=await page.evaluate(()=>JSON.stringify([getActiveMatch().courseSnapshot,getActiveMatch().selectedGames,getActiveMatch().players.map(p=>p.teeId)]));
   for(const [hole,expected]of [[1,['Blue','White']],[2,['White','Blue']],[18,['White','Blue']]]){
    await page.select('#currentHoleSelect',String(hole));const text=await labels();
    assert.match(text[0],new RegExp('^'+expected[0]+' tees · Gets '));assert.match(text[1],new RegExp('^'+expected[1]+' tees · Gets '));
    assert.match(text[2],/^Red tees · Gets /);assert.match(text[3],/^Hole tee not recorded · Gets /);
    text.forEach(label=>assert.doesNotMatch(label,/Combo|Changed in library/));
   }
   await page.select('#currentHoleSelect','2');await page.click('[data-score-step-player="p0"][data-score-step="up"]');await page.click('#saveScoresBtn');
   assert.deepEqual(await page.evaluate(()=>getActiveMatch().players.slice(0,2).map(p=>p.scores[1].gross)),[4,4]);
   assert.equal(await page.evaluate(()=>JSON.stringify([getActiveMatch().courseSnapshot,getActiveMatch().selectedGames,getActiveMatch().players.map(p=>p.teeId)])),before);
   for(const [width,size]of [[320,16],[375,16],[430,16],[375,32]]){
    await page.setViewport({width,height:812});await page.addStyleTag({content:`html{font-size:${size}px!important}`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.ok(await page.$$eval('.flamtana-score-stepper button',nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
   }
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
