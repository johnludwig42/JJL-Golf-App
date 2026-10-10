import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,readFileSync} from 'node:fs';
import {extname,resolve} from 'node:path';
import {loadLiveEngine} from '../../scripts/live-engine-adapter.js';
const root = resolve('.');
export const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2' };

export function startServer({foundation=false}={}) {
  const server = createServer((request, response) => {
    try {
      const parsedUrl = new URL(request.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(root, pathname);
      if (!file.toLowerCase().startsWith(root.toLowerCase())) throw new Error('outside root');
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
      let body=readFileSync(file);
      if(pathname==='index.html'&&foundation)body=body.toString().replace(/<link[^>]*href="app-components\.css[^>]*>/,'');
      if(pathname==='index.html' && parsedUrl.searchParams.get('auditStyle')==='baseline')body=body.toString().replace(/href="style\.css[^"]*"/,'href="tests/fixtures/design/light-style-baseline.css"').replace(/<link[^>]*href="app-print\.css[^>]*>/,'');
      if(pathname==='index.html' && parsedUrl.searchParams.get('auditStyle')==='tokens')body=body.toString().replace(/href="style\.css[^"]*"/,'href="tests/fixtures/design/token-consolidation-baseline.css"');
      response.end(body);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      if (!response.writableEnded) response.end('Not found');
    }
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

export function visualFixture(mode='CLASSIC', setup=false, stats=false) {
  const engine=loadLiveEngine();
  const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:360}));
  const course={id:'design-course',name:'Design Review Club',tees:[{id:'white',teeName:'White',rating:72,slope:113,par:72,holes}]};
  const players=['Alex','Blake','Casey','Drew'].map((name,i)=>({id:'p'+i,name,index:i*3}));
  const match={id:'design-round',date:'2026-10-09',courseId:course.id,teeId:'white',holeCount:18,status:'active',storageMode:'local',playInputMode:mode,smartScoreAdvanceEnabled:false,scoringAccessMode:'single_device',teamCount:2,playersPerTeam:2,allowance:100,featuredCompetition:'nassau',selectedGames:[{key:'nassau',basis:'gross',countingBalls:1,stakesFront:5,stakesBack:5,stakesOverall:5},{key:'skins',basis:'gross',skinsType:'individual',stake:2,carryoverMode:'carry'}],
    players:players.map((player,i)=>({playerId:player.id,team:i<2?1:2,slot:i,teeId:'white',scores:holes.map((hole,index)=>({holeNumber:hole.holeNumber,gross:index<4?(i===0?3:i===1?4:5):null}))}))};
  if(stats){match.statTrackingMode='ENHANCED';match.statTrackingEnabled=true;match.statTrackingPlayerIds=players.map(player=>player.id);}
  const state=engine.seedState({courses:[course],players,matches:setup?[]:[match],activeMatchId:setup?null:match.id});
  const storage=new Map();if(setup)engine.saveSetupDraft({...match,players:match.players.map(({scores,...player})=>player)},{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)});
  return {state,storage:[...storage]};
}

export async function openVisualPage(browser,url,scenario,width,baseline=false,dark=false,print=false) {
  const page=await browser.newPage();
  await page.setViewport({width,height:812,deviceScaleFactor:1});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
  const fixture=visualFixture(scenario.startsWith('player')?'PLAYER':'CLASSIC',['setup','games'].includes(scenario),scenario==='player-stats');
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
  await page.goto(url+'index.html'+(baseline?'?auditStyle='+(baseline==='tokens'?'tokens':'baseline'):''),{waitUntil:'networkidle0'});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  if(['classic','player','player-expanded','player-stats','quick','quick-charts','overflow'].includes(scenario))await page.click('[data-tab="score"]');
  if(['player-expanded','player-stats'].includes(scenario) && !await page.$('.player-mode-player-detail'))await page.click('.player-mode-player-select');
  if(scenario==='player-stats')await page.click('[data-player-mode-more-detail]');
  if(scenario==='overflow')await page.click('[data-play-overflow-trigger="classic"]');
  if(['results','balance','scorecards'].includes(scenario)){
    await page.click('[data-tab="leaderboard"]');await page.click(`#leaderboard [data-experience-target="${scenario==='scorecards'?'scorecards':'results'}"]`);
  }
  if(scenario==='scorecards')await page.evaluate(()=>document.querySelectorAll('#leaderboard details[data-experience-section="scorecards"]').forEach(node=>node.open=true));
  if(scenario==='setup')await page.click('[data-open-setup-destination="players"]');
  if(scenario==='games')await page.click('[data-open-setup-destination="games"]');
  if(scenario==='library'){await page.click('[data-tab="courses"]');await page.click('#courses [data-experience-target="courses"]');await page.click('#courseEditorCard > summary');}
  if(scenario==='preferences'){await page.click('[data-tab="settings"]');await page.click('#settings [data-experience-target="preferences"]');}
  if(scenario==='support'){
    await page.click('[data-tab="settings"]');await page.click('#settings [data-experience-target="support"]');
    await page.evaluate(()=>[...document.querySelectorAll('summary')].find(node=>node.textContent.trim()==='Technical diagnostics').click());
  }
  if(scenario==='insights')await page.click('[data-tab="insights"]');
  if(['quick','quick-charts'].includes(scenario))await page.click('#quickScoreboardBtn');
  if(scenario==='quick-charts')await page.evaluate(()=>document.querySelectorAll('.quick-disclosure').forEach(node=>node.open=true));
  if(scenario==='balance')await page.click('[data-balance-player="p0"]');
  if(print){
    await page.evaluate(()=>document.body.classList.add('printing-scorecard'));
    await page.emulateMediaType('print');
  }
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(errors,[]);
  return page;
}

export async function computedPaint(page) {
  return page.evaluate(()=>{
    const properties=['color','backgroundColor','backgroundImage','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','boxShadow','textShadow','fill','stroke','caretColor','fontFamily','fontSize','fontWeight','padding','margin','borderRadius','opacity','width','height'];
    return [...document.querySelectorAll('body,body *')].filter(node=>!['SCRIPT','STYLE'].includes(node.tagName)&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0).map(node=>{
      const value=pseudo=>{const style=getComputedStyle(node,pseudo);return Object.fromEntries(properties.map(property=>[property,style[property]]));};
      return {tag:node.tagName,id:node.id,className:node.className.baseVal ?? node.className,normal:value(null),before:value('::before'),after:value('::after'),...(node.tagName==='DIALOG'?{backdrop:value('::backdrop')}:{})};
    });
  });
}

