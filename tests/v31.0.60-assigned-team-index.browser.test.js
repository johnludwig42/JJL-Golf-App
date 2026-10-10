import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,visualFixture} from './support/design-browser.js';

test('team index setup averages, deliberate blank entry, draft reload, tee validation and save', {skip:!chrome,timeout:120000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 const url=`http://127.0.0.1:${server.address().port}/`;
 try{
 const data=visualFixture('CLASSIC',true);data.state.players.forEach((p,i)=>p.index=[6,14,-4,0][i]);data.state.courses[0].tees.push({...data.state.courses[0].tees[0],id:'alternate',teeName:'Alternate'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.setViewport({width:375,height:812});
 await page.goto(url,{waitUntil:'load'});
 await page.evaluate(data=>{localStorage.clear();localStorage.setItem('the-dye-ledger-v20',JSON.stringify(data.state));data.storage.forEach(([k,v])=>localStorage.setItem(k,v));},data);
 await page.reload({waitUntil:'load'});await page.evaluate(()=>{const n=document.querySelector('[data-open-setup-destination="players"]');if(n.checkVisibility())n.click();});
 await page.click('#assignedTeamIndexEnabled');await page.waitForSelector('[data-assigned-team-index="1"]');
 assert.equal(await page.$eval('[data-assigned-team-index="1"]',n=>n.value),'10');assert.equal(await page.$eval('[data-assigned-team-index="2"]',n=>n.value),'-2');
 const edit=async value=>{await page.$eval('[data-assigned-team-index="1"]',(n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));n.blur();},value);};
 await page.select('[data-player-tee-slot="1"]','alternate');await page.click('#setupDestinationBackBtn');await page.click('#matchSubmitBtn');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length),0);await page.evaluate(()=>{const n=document.querySelector('[data-open-setup-destination="players"]');if(n.checkVisibility())n.click();});await page.select('[data-player-tee-slot="1"]','white');
 await edit('');await page.click('#setupDestinationBackBtn');await page.click('#matchSubmitBtn');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length),0);
 await page.evaluate(()=>{const n=document.querySelector('[data-open-setup-destination="players"]');if(n.checkVisibility())n.click();});await edit('8.5');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20:setup-draft'))?.assignedTeamIndexDraft?.['1']?.value==='8.5',{timeout:10000});
 await page.reload({waitUntil:'load'});await page.evaluate(()=>{const n=document.querySelector('[data-open-setup-destination="players"]');if(n.checkVisibility())n.click();});assert.equal(await page.$eval('[data-assigned-team-index="1"]',n=>n.value),'8.5');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.addStyleTag({content:'html{font-size:32px!important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('tmp/report-qa/v60',{recursive:true});await page.screenshot({path:'tmp/report-qa/v60/assigned-team-index-large.png',fullPage:true});
 for(const width of [320,375,430])for(const dark of [false,true]){await page.setViewport({width,height:812});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.$$eval('[data-assigned-team-index]',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),true);}
 await page.addStyleTag({content:'html{font-size:16px!important}'});await page.setViewport({width:375,height:812});await page.screenshot({path:'tmp/report-qa/v60/assigned-team-index-dark.png',fullPage:true});
 await page.click('#setupDestinationBackBtn');await page.waitForSelector('#matchSubmitBtn',{visible:true});await page.click('#matchSubmitBtn');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length===1);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')));
 assert.equal(saved.matches[0].assignedTeamIndexPolicyVersion,1);assert.deepEqual(saved.matches[0].players.map(p=>p.assignedTeamIndex),[8.5,8.5,-2,-2]);assert.deepEqual(saved.players.map(p=>p.index),[6,14,-4,0]);
 await page.reload({waitUntil:'load'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players[0].assignedTeamIndex),8.5);
 await page.close();const missing=visualFixture('CLASSIC',true);missing.state.players[0].index='';const missingPage=await browser.newPage();missingPage.on('pageerror',e=>errors.push(String(e)));
 await missingPage.evaluateOnNewDocument(data=>{localStorage.clear();localStorage.setItem('the-dye-ledger-v20',JSON.stringify(data.state));data.storage.forEach(([k,v])=>localStorage.setItem(k,v));},missing);await missingPage.goto(url,{waitUntil:'load'});await missingPage.click('[data-open-setup-destination="players"]');await missingPage.click('#assignedTeamIndexEnabled');await missingPage.waitForSelector('[data-assigned-team-index="1"]',{visible:true});assert.equal(await missingPage.$eval('[data-assigned-team-index="1"]',n=>n.value),'');await missingPage.click('#assignedTeamIndexEnabled');await missingPage.click('#setupDestinationBackBtn');await missingPage.click('#matchSubmitBtn');await missingPage.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length===1);assert.equal(await missingPage.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players[0],'assignedTeamIndex')),false);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
