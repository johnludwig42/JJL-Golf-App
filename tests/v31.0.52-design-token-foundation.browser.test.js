import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { deterministicFixtures } from './fixtures/rounds/simulation-fixtures.js';

const root = resolve('.');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2' };

function startServer() {
  const server = createServer((request, response) => {
    try {
      const parsedUrl = new URL(request.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(root, pathname);
      if (!file.toLowerCase().startsWith(root.toLowerCase())) throw new Error('outside root');
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
      let body=readFileSync(file);
      if(pathname==='index.html' && parsedUrl.searchParams.get('auditStyle')==='baseline')body=body.toString().replace(/href="style\.css[^"]*"/,'href="tests/fixtures/design/light-style-baseline.css"');
      response.end(body);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      if (!response.writableEnded) response.end('Not found');
    }
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

function visualFixture(mode='CLASSIC', setup=false) {
  const engine=loadLiveEngine();
  const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:360}));
  const course={id:'design-course',name:'Design Review Club',tees:[{id:'white',teeName:'White',rating:72,slope:113,par:72,holes}]};
  const players=['Alex','Blake','Casey','Drew'].map((name,i)=>({id:'p'+i,name,index:i*3}));
  const match={id:'design-round',date:'2026-10-09',courseId:course.id,teeId:'white',holeCount:18,status:'active',storageMode:'local',playInputMode:mode,smartScoreAdvanceEnabled:false,scoringAccessMode:'single_device',teamCount:2,playersPerTeam:2,allowance:100,featuredCompetition:'nassau',selectedGames:[{key:'nassau',basis:'gross',countingBalls:1,stakesFront:5,stakesBack:5,stakesOverall:5},{key:'skins',basis:'gross',skinsType:'individual',stake:2,carryoverMode:'carry'}],
    players:players.map((player,i)=>({playerId:player.id,team:i<2?1:2,slot:i,teeId:'white',scores:holes.map((hole,index)=>({holeNumber:hole.holeNumber,gross:index<4?(i===0?3:i===1?4:5):null}))}))};
  const state=engine.seedState({courses:[course],players,matches:setup?[]:[match],activeMatchId:setup?null:match.id});
  const storage=new Map();if(setup)engine.saveSetupDraft({...match,players:match.players.map(({scores,...player})=>player)},{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)});
  return {state,storage:[...storage]};
}

async function openVisualPage(browser,url,scenario,width,baseline=false,dark=false,print=false) {
  const page=await browser.newPage();
  await page.setViewport({width,height:812,deviceScaleFactor:1});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
  const fixture=visualFixture(scenario==='player'?'PLAYER':'CLASSIC',['setup','games'].includes(scenario));
  await page.evaluateOnNewDocument(fixture=>{
    // Isolate color equivalence from worker caches and external cloud services.
    Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,ready:Promise.resolve({active:null}),addEventListener(){},register:async()=>({active:null,waiting:null,installing:null,addEventListener(){},update:async()=>{}}),getRegistration:async()=>null,getRegistrations:async()=>[]},configurable:true});
    Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
    localStorage.clear();localStorage.setItem('the-dye-ledger-v20',JSON.stringify(fixture.state));
    fixture.storage.forEach(([key,value])=>localStorage.setItem(key,value));
  },fixture);
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().startsWith(url)?request.continue():request.abort());
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(url+'index.html'+(baseline?'?auditStyle=baseline':''),{waitUntil:'networkidle0'});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  if(['classic','player','quick'].includes(scenario))await page.click('[data-tab="score"]');
  if(['results','balance'].includes(scenario)){await page.click('[data-tab="leaderboard"]');await page.click('[data-experience-target="results"]');}
  if(scenario==='setup')await page.click('[data-open-setup-destination="players"]');
  if(scenario==='games')await page.click('[data-open-setup-destination="games"]');
  if(scenario==='library'){await page.click('[data-tab="courses"]');await page.click('#courses [data-experience-target="courses"]');await page.click('#courseEditorCard > summary');}
  if(scenario==='preferences'){await page.click('[data-tab="settings"]');await page.click('#settings [data-experience-target="preferences"]');}
  if(scenario==='insights')await page.click('[data-tab="insights"]');
  if(scenario==='quick')await page.click('#quickScoreboardBtn');
  if(scenario==='balance')await page.click('[data-balance-player="p0"]');
  if(print)await page.emulateMediaType('print');
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(errors,[]);
  return page;
}

async function computedPaint(page) {
  return page.evaluate(()=>{
    const properties=['color','backgroundColor','backgroundImage','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','boxShadow','textShadow','fill','stroke','caretColor','fontFamily','fontSize','fontWeight','padding','margin','borderRadius','opacity','width','height'];
    return [...document.querySelectorAll('body,body *')].filter(node=>!['SCRIPT','STYLE'].includes(node.tagName)&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0).map(node=>{
      const value=pseudo=>{const style=getComputedStyle(node,pseudo);return Object.fromEntries(properties.map(property=>[property,style[property]]));};
      return {tag:node.tagName,id:node.id,className:node.className.baseVal ?? node.className,normal:value(null),before:value('::before'),after:value('::after'),...(node.tagName==='DIALOG'?{backdrop:value('::backdrop')}:{})};
    });
  });
}

test('semantic tokens preserve computed paint and pixels across app surfaces, system appearances and print', {skip:!chrome,timeout:240000},async t=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/`;
  try{
    const cases=['setup','games','classic','player','results','library','preferences','insights','quick','balance'];
    for(const width of [375,1280])for(const scenario of cases)await t.test(`${scenario} at ${width}px`,async()=>{
      const before=await openVisualPage(browser,url,scenario,width,true),after=await openVisualPage(browser,url,scenario,width);
      assert.deepEqual(await computedPaint(after),await computedPaint(before),`${scenario}: computed styles`);
      const oldImage=await before.screenshot(),newImage=await after.screenshot();
      assert.equal(Buffer.compare(oldImage,newImage),0,`${scenario}: light-mode screenshot differs`);
      if(width===375&&scenario==='player'){
        const {mkdirSync,writeFileSync}=await import('node:fs');mkdirSync('tmp/report-qa/design',{recursive:true});
        writeFileSync('tmp/report-qa/design/player-after.png',newImage);writeFileSync('tmp/report-qa/design/player-before.png',oldImage);
      }
      await before.close();await after.close();
    });
    for(const print of [false,true])await t.test(print?'print stays light in a dark system':'dark system keeps the unchanged light palette in this release',async()=>{
      const light=await openVisualPage(browser,url,'results',375,true,false,print),dark=await openVisualPage(browser,url,'results',375,false,true,print);
      assert.deepEqual(await computedPaint(dark),await computedPaint(light));
      assert.equal(Buffer.compare(await light.screenshot(),await dark.screenshot()),0);
      await light.close();await dark.close();
    });
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});

