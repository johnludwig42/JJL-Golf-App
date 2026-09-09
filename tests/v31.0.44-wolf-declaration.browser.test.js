import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve('.');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2' };

function startServer() {
  const server = createServer((request,response) => {
    try {
      const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
      const file=resolve(root,pathname);
      if (!file.toLowerCase().startsWith(root.toLowerCase())) throw new Error('outside root');
      response.writeHead(200,{'Content-Type':contentTypes[extname(file).toLowerCase()]||'application/octet-stream'});
      response.end(readFileSync(file));
    } catch { if(!response.headersSent) response.writeHead(404); if(!response.writableEnded) response.end('Not found'); }
  });
  return new Promise(done=>server.listen(0,'127.0.0.1',()=>done(server)));
}

function wolfFixture({ mode='CLASSIC', blind=true }={}) {
  const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:438}));
  const tee={id:'black',teeName:'Black',rating:72,slope:125,par:72,holes};
  const course={id:'wolf-course',name:'Wolf Club',tees:[tee]};
  const players=['Kim Howell','Todd E Irwin','Brian Warner','Phil Bounsall'].map((name,i)=>({id:`p${i+1}`,name,index:5+i*3}));
  const match={id:'wolf-declaration',name:'Wolf Declaration',date:'2026-09-09',status:'active',courseId:course.id,teeId:tee.id,holeCount:18,format:'teams',teamCount:2,playersPerTeam:2,allowance:100,playInputMode:mode,statTrackingMode:'NONE',featuredCompetition:'wolf',matchStatusGame:'wolf',storageMode:'local',selectedGames:[{key:'wolf',basis:'net',playerIds:players.map(p=>p.id),allowLoneWolf:true,allowBlindWolf:blind,finalHolesRule:'continue',pointValue:1,points:{teamWin:1,opponentsWin:1,loneWolfWin:4,loneWolfLoss:1,blindWolfWin:8,blindWolfLoss:1},handicapAllowancePercent:100}],wolfInputs:{},players:players.map((player,i)=>({playerId:player.id,team:i<2?1:2,teeId:tee.id,scores:holes.map(h=>({holeNumber:h.holeNumber,gross:null}))}))};
  return {players,course,match};
}

async function seed(browser,url,data,{width=375,height=844}={}) {
  const seedPage=await browser.newPage();
  await seedPage.evaluateOnNewDocument(()=>{ window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__=true; });
  await seedPage.goto(url,{waitUntil:'load'});
  await seedPage.waitForFunction(()=>Boolean(window.__DYE_LEDGER_LIVE_ENGINE__));
  await seedPage.evaluate(seedData=>{ const engine=window.__DYE_LEDGER_LIVE_ENGINE__; const state=engine.seedState({players:seedData.players,courses:[seedData.course],matches:[seedData.match],activeMatchId:seedData.match.id}); state.matches[0].courseSnapshot=engine.getCourseSnapshotForMatch(state.matches[0]); localStorage.setItem('the-dye-ledger-v20',JSON.stringify(engine.seedState(state))); },data);
  await seedPage.close();
  const page=await browser.newPage();
  await page.setViewport({width,height,deviceScaleFactor:1});
  await page.goto(url,{waitUntil:'load'});
  await page.click('[data-tab="score"]');
  await page.waitForSelector('.wolf-entry');
  return page;
}

async function assertResponsiveWolf(page,width,expectedOptions) {
  await page.setViewport({width,height:844,deviceScaleFactor:1});
  const layout=await page.evaluate(()=>{ const buttons=[...document.querySelectorAll('.wolf-declaration-options button')]; const featured=document.querySelector('.classic-header-match-status,.player-mode-header-match-status'); return {labels:buttons.map(b=>b.textContent.trim()),minHeight:Math.min(...buttons.map(b=>b.getBoundingClientRect().height)),pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,featuredOverflow:featured ? featured.scrollWidth>featured.clientWidth : false}; });
  assert.deepEqual(layout.labels,expectedOptions);
  assert.ok(layout.minHeight>=44,`Wolf target height ${layout.minHeight}px at ${width}px`);
  assert.equal(layout.pageOverflow,false,`page overflow at ${width}px`);
  assert.equal(layout.featuredOverflow,false,`featured Wolf status overflow at ${width}px`);
}

test('Wolf declaration is one tap, isolated from scoring, clearable, and dismissible', {skip:!chrome,timeout:120000}, async()=>{
  const server=await startServer();
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:60000,args:['--disable-gpu','--no-sandbox']});
  let page;
  const url=`http://127.0.0.1:${server.address().port}/index.html`;
  try {
    page=await seed(browser,url,wolfFixture());
    assert.equal(await page.$('.wolf-clear-declaration'),null);
    await page.click('[data-wolf-declaration="partner"][data-wolf-partner-id="p2"]');
    await page.waitForFunction(()=>document.querySelector('.wolf-entry summary')?.textContent.includes('Partner: Todd E Irwin'));
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
    assert.equal(saved.wolfInputs['1'].choice,'partner');
    assert.equal(saved.wolfInputs['1'].partnerPlayerId,'p2');
    assert.ok(saved.players.every(player=>player.scores.every(score=>score.gross===null)));
    assert.ok(await page.$('.wolf-clear-declaration'));
    await page.click('.wolf-entry summary');
    await page.waitForFunction(()=>document.querySelector('.wolf-entry').open);
    await page.click('.wolf-clear-declaration');
    await page.waitForFunction(()=>document.querySelector('.wolf-entry summary')?.textContent.includes('Undeclared'));
    const details=await page.$('.wolf-entry');
    assert.equal(await page.evaluate(node=>node.open,details),true);
    await page.click('.wolf-entry summary');
    await page.waitForFunction(()=>!document.querySelector('.wolf-entry').open);
    await new Promise(resolve=>setTimeout(resolve,25));
    await page.evaluate(()=>document.querySelector('[data-wolf-choice]').dispatchEvent(new Event('change',{bubbles:true})));
    await page.waitForFunction(()=>!document.querySelector('.wolf-entry').open);
    await page.select('#currentHoleSelect','2');
    await page.waitForFunction(()=>document.querySelector('.wolf-entry')?.open&&document.querySelector('.wolf-entry summary')?.textContent.includes('Hole 2'));
  } finally { if(page) await page.close(); await browser.close(); await new Promise(done=>server.close(done)); }
});

test('Wolf options and featured status fit both Play modes at phone widths', {skip:!chrome,timeout:120000}, async()=>{
  const server=await startServer();
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:60000,args:['--disable-gpu','--no-sandbox']});
  const url=`http://127.0.0.1:${server.address().port}/index.html`;
  try {
    for (const mode of ['CLASSIC','PLAYER']) {
      for (const blind of [false,true]) {
        const page=await seed(browser,url,wolfFixture({mode,blind}));
        const labels=blind?['Todd','Brian','Phil','Lone Wolf','Blind Wolf']:['Todd','Brian','Phil','Lone Wolf'];
        for (const width of [320,375,430]) await assertResponsiveWolf(page,width,labels);
        if(blind&&mode==='CLASSIC') await page.screenshot({path:join(tmpdir(),'dye-ledger-wolf-classic-320.png'),fullPage:true});
        if(blind&&mode==='PLAYER') await page.screenshot({path:join(tmpdir(),'dye-ledger-wolf-player-320.png'),fullPage:true});
        await page.close();
      }
    }
  } finally { await browser.close(); await new Promise(done=>server.close(done)); }
});
