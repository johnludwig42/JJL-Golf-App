import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer} from './support/design-browser.js';

test('collapsed printed blocks retain each narrowing step and Calcutta references Featured without repeating evidence',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try {
  for(const narrow of [false,true]){
   const data=scrambleFixture(),engine=loadLiveEngine();
   data.match.players.forEach(player=>{player.assignedTeamIndex=0;player.scores.forEach(score=>score.gross=4);});
   if(narrow) data.match.players.forEach(player=>{
    if(player.team===1){player.scores[0].gross=6;player.scores[15].gross=3;player.scores[17].gross=3;}
    if(player.team===2){player.scores[0].gross=5;player.scores[17].gross=3;}
    if(player.team===3){player.scores[1].gross=5;player.scores[16].gross=3;}
   });
   data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:1,tieMethod:'hole18',picks:Object.fromEntries(data.players.map(player=>[player.id,4]))}];
   data.match.status='complete';data.match.completedAt='2026-10-16T18:00:00Z';
   const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0],metrics=engine.computeMatchMetrics(match);
   match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,metrics);const before=JSON.stringify(match.roundRecordSnapshot);
   const report=engine.buildLedgerEntryReportModel(match,metrics);assert.equal(JSON.stringify(match.roundRecordSnapshot),before);
   const dir='tmp/report-qa/v63/render-assertions';fs.mkdirSync(dir,{recursive:true});
   const modelFile=dir+'/'+narrow+'.js',htmlFile=dir+'/'+narrow+'.html';fs.writeFileSync(modelFile,'globalThis.__DYE_LEDGER_ROUND__='+JSON.stringify(report)+';');
   const html=fs.readFileSync('ledger-report/shell.html','utf8').replaceAll("url('./fonts/","url('/ledger-report/fonts/").replaceAll('src="./','src="/ledger-report/').replace(/(<script src="\/ledger-report\/bootstrap.js[^>]*><\/script>)/,'$1\n<script src="/'+modelFile+'"></script>');fs.writeFileSync(htmlFile,html);
   const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/'+htmlFile,{waitUntil:'load'});await page.waitForSelector('.page');
   const members=await page.$$eval('.page:first-child [data-team-members]',nodes=>nodes.map(node=>node.textContent));
   assert.equal(members.length,4);data.players.forEach(player=>assert.ok(members.some(text=>text.includes(player.name))));
   assert.equal(await page.$$eval('[data-flamtana-handicaps] [data-row]',nodes=>nodes.length),4);
   assert.deepEqual(await page.$$eval('[data-flamtana-chart]',nodes=>nodes.map(node=>node.dataset.flamtanaChart)),['flamtana_group1','flamtana_group2','flamtana_foursome']);
   assert.match(await page.$$eval('.flamtana-game-heading',nodes=>nodes.at(-1).textContent),/Foursome net totals.*per-hole team minima/);
   assert.equal(await page.evaluate(()=>!!(document.querySelector('[data-calcutta-ledger]').compareDocumentPosition(document.querySelector('[data-stroke-standings]'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
   assert.equal(await page.evaluate(()=>!!(document.querySelector('[data-flamtana-handicaps]').compareDocumentPosition(document.querySelector('[data-flamtana-evidence]'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
   if(narrow){assert.match(await page.$eval('h1',node=>node.textContent),/Card-Off result/);assert.match(await page.$eval('[data-flamtana-evidence="Featured"] [data-flamtana-result]',node=>node.textContent),/Card-Off result/);}
   for(const component of report.meta.flamtanaEvidence.filter(row=>row.label!=='Calcutta')){
    const printed=await page.$eval('[data-flamtana-evidence="'+component.label+'"]',node=>({steps:[...node.querySelectorAll('[data-flamtana-step]')].map(step=>({label:step.dataset.flamtanaStep,text:step.textContent})),text:node.textContent,exhausted:!!node.querySelector('[data-flamtana-exhausted]')}));
    component.result.evidence.filter((step,i)=>i===0||JSON.stringify(step.remaining)!==JSON.stringify(component.result.evidence[i-1].remaining)).forEach(step=>{
     const full=printed.steps.find(row=>row.label===step.label);assert.ok(full,'Narrowing comparison missing: '+step.label);
     step.totals.forEach(row=>assert.ok(full.text.includes(report.sides[row.id].name+' '+row.total)));
    });
    if(component.result.split)assert.equal(printed.exhausted,true);
   }
   const featured=await page.$eval('[data-flamtana-evidence="Featured"]',node=>node.textContent);
   assert.ok(featured.includes(narrow?'Hole 17 matched.':'Holes 18–1 matched.'));
   const calcutta=await page.$eval('[data-flamtana-evidence="Calcutta"]',node=>({steps:node.querySelectorAll('[data-flamtana-step]').length,text:node.textContent,reference:!!node.querySelector('[data-flamtana-featured-reference]')}));
   assert.equal(calcutta.steps,0);assert.equal(calcutta.reference,true);assert.match(calcutta.text,/Pool total: \$160/);
   assert.match(calcutta.text,/unbacked; partners paid/);
   fs.mkdirSync('tmp/report-qa/v63/followup',{recursive:true});
   await page.emulateMediaType('print');const pages=await page.$$('.page');await pages[0].screenshot({path:'tmp/report-qa/v63/followup/'+narrow+'-page1.png'});
   if(pages[1])await pages[1].screenshot({path:'tmp/report-qa/v63/followup/'+narrow+'-page2.png'});
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
