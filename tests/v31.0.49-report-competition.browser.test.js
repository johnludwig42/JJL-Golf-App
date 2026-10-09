import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { runGame } from '../ledger-report/engines.js';

const root = resolve('.');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const contentTypes = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2' };

function startServer() {
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(root, pathname);
      if (!file.toLowerCase().startsWith(root.toLowerCase())) throw new Error('outside root');
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(readFileSync(file));
    } catch {
      if (!response.headersSent) response.writeHead(404);
      if (!response.writableEnded) response.end('Not found');
    }
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

function fixture(index) {
  const engine=loadLiveEngine();
  const kind=index<32?'team_stroke':index<40?(index%2?'stroke_gross':'stroke_net'):index<45?'nassau':'nine_point';
  const count=kind==='nine_point'?3:4;
  const length=index===0?18:index%5===0?9:18;
  const partial=index!==0 && index%7===0;
  const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:[4,4,3,5][i%4],strokeIndex:i+1,yardage:350+i*3}));
  const tee={id:'white',teeName:'White',rating:70.4,slope:133,par:72,holes};
  const course={id:'report-course',name:'Report QA Club',tees:[tee]};
  const players=Array.from({length:count},(_,i)=>({id:'p'+i,name:['Mark & Kell','Hush & Lud','Neil & Kappy','Magic & Crabby Pants'][i],index:[19,13,18,18][i]}));
  const selectedGames=kind.startsWith('stroke_')?[]:[{key:kind,basis:index%3===0?'gross':'net',scoringMode:index%2?'best_ball':'aggregate',countingBalls:1,handicapAllowanceMode:'custom',handicapAllowancePercent:85,stake:5,stakesFront:5,stakesBack:5,stakesOverall:5,playerIds:players.map(p=>p.id)}];
  const match={id:'report-'+index,date:'2026-10-05',courseId:course.id,teeId:tee.id,holeCount:length,status:partial?'active':'complete',teamCount:index%4===0?4:2,playersPerTeam:index%4===0?1:2,allowance:100,featuredCompetition:kind,selectedGames,
    players:players.map((player,i)=>({playerId:player.id,team:index%4===0?i+1:(i<2?1:2),slot:i,teeId:tee.id,scores:holes.map((hole,j)=>({holeNumber:j+1,gross:j<length-(partial?2:0)?hole.par+((j+i+index)%3):null}))}))};
  if(index===0){
    course.name='Southern Dunes';
    const pars=[4,4,3,5,4,3,4,4,5,4,3,5,4,3,4,5,4,4];
    const si=[9,15,11,5,7,17,1,13,3,2,16,6,8,18,14,4,12,10];
    const yards=[349,327,192,480,315,162,395,363,500,416,165,480,393,131,321,497,369,365];
    holes.forEach((hole,j)=>Object.assign(hole,{par:pars[j],strokeIndex:si[j],yardage:yards[j]}));
    course.tees.push({...tee,id:'combo',teeName:'White / Blue',rating:71.7,slope:134});
    match.players[1].teeId='combo';
    match.selectedGames=[{key:'team_stroke',basis:'net',scoringMode:'aggregate',stake:0}];
    const scores=[[4,4,2,6,4,4,4,4,5,4,3,5,4,5,4,6,4,4],[3,4,3,5,4,3,4,4,5,5,2,5,4,3,4,6,4,3],[4,5,3,6,4,4,4,4,5,4,4,5,4,4,4,4,4,5],[5,5,3,6,4,4,4,4,4,4,3,6,3,3,3,6,4,4]];
    match.players.forEach((player,i)=>player.scores.forEach((score,j)=>score.gross=scores[i][j]));
  }
  const state=engine.seedState({players,courses:[course],matches:[match],activeMatchId:match.id});
  const live=state.matches[0],metrics=engine.computeMatchMetrics(live);
  const report=engine.buildLedgerEntryReportModel(live,metrics);
  report.meta.status=partial?'provisional':'final';
  // The renderer's factual fallback is exercised rather than a network-generated story.
  report.meta.recap=null;
  return {engine,live,metrics,report,kind};
}

test('50 distinct report scenarios preserve competition scores, ties and printable layout', {skip:!chrome,timeout:240000}, async t=>{
  const server=await startServer();
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/ledger-report/shell.html`;
  try {
    for(let index=0;index<50;index++) await t.test(`report scenario ${index+1}`,async()=>{
      const {report,kind,metrics,engine,live}=fixture(index);
      const game=report.games.find(game=>game.featured);
      const result=runGame(game,{players:report.players,holes:report.holes,par:report.card.par});
      if(index===0){
        assert.deepEqual(Array.from(game.seriesByHole,row=>row.scores.reduce((a,b)=>a+b,0)),[70,71,72,70]);
        assert.deepEqual(Array.from(result.series,row=>row.total),[-2,-1,0,-2]);
        assert.equal(result.winners.length,2);assert.equal(result.turning,null);
      }
      if(kind==='team_stroke') {
        assert.equal(game.type,'strokeplay');assert.equal(game.overviewOnly,undefined);
        for(const entry of game.seriesByHole){
          const team=metrics.teams.find(team=>'T'+team.team===entry.id);
          if((index===0 || index%7!==0) && game.scoringMode==='aggregate')assert.equal(entry.scores.reduce((a,b)=>a+(b||0),0),game.basis==='gross'?team.grossTotal:team.netTotal);
          assert.equal(result.series.find(row=>row.id===entry.id).scoreTotal,entry.scores.reduce((a,b)=>a+(b||0),0));
        }
        assert.match(game.allowance.label,game.basis==='gross'?/Gross/:/Off lowest/);
      }
      if(kind==='stroke_gross')assert.equal(game.basis,'gross');
      if(result.winners?.length>1)assert.equal(result.turning,null);
      if(index===0){
        const issues=engine.validateRoundRecapContent(live,metrics,'Clear conditions provided a comfortable setting for solid ball striking.').issues;
        assert.ok(issues.some(issue=>issue.code==='UNVERIFIABLE_WEATHER_CAUSATION'));
        assert.ok(issues.some(issue=>issue.code==='UNVERIFIABLE_BALL_STRIKING'));
        assert.ok(engine.validateRoundRecapContent(live,metrics,'The featured competition finished tied at 55.').issues.some(issue=>issue.code==='FALSE_FEATURED_STROKE_RESULT'));
        assert.equal(engine.validateRoundRecapContent(live,metrics,'The featured competition finished tied at 70.').issues.some(issue=>issue.code==='FALSE_FEATURED_STROKE_RESULT'),false);
      }
      const page=await browser.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      await page.evaluateOnNewDocument(data=>{sessionStorage.setItem('qa-report',JSON.stringify({createdAt:new Date().toISOString(),report:data}));},report);
      await page.goto(url+'?reportKey=qa-report',{waitUntil:'networkidle0'});
      await page.waitForSelector('#doc .page');
      const view=await page.evaluate(()=>({text:document.getElementById('doc').textContent,standings:!!document.querySelector('[data-stroke-standings]'),overflow:[...document.querySelectorAll('.page .flow')].some(flow=>{const last=flow.lastElementChild;return last && last.getBoundingClientRect().bottom>flow.getBoundingClientRect().bottom+2;})}));
      assert.deepEqual(errors,[],`scenario ${index+1}`);
      assert.equal(view.overflow,false,`scenario ${index+1} page overflow`);
      assert.doesNotMatch(view.text,/deterministic turning-point rule|plays off scratch/);
      if(kind==='team_stroke'){
        assert.equal(view.standings,true);
        assert.doesNotMatch(view.text,/No featured competition on this round/);
      }
      if(index===0){
        const {writeFileSync,mkdirSync}=await import('node:fs');
        mkdirSync('tmp/report-qa',{recursive:true});
        writeFileSync('tmp/report-qa/preview-model.json',JSON.stringify(report));
        await page.screenshot({path:'tmp/report-qa/preview.png',fullPage:true});
        await (await page.$('#doc .page')).screenshot({path:'tmp/report-qa/cover.png'});
      }
      await page.close();
    });
  } finally {await browser.close();await new Promise(done=>server.close(done));}
});

test('print preview retains Southern Dunes scores without clipped page content', {skip:!chrome,timeout:60000}, async()=>{
  const server=await startServer();
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  try {
    const {report}=fixture(0);
    const page=await browser.newPage();
    await page.evaluateOnNewDocument(data=>sessionStorage.setItem('qa-print',JSON.stringify({createdAt:new Date().toISOString(),report:data})),report);
    await page.goto(`http://127.0.0.1:${server.address().port}/ledger-report/shell.html?reportKey=qa-print`,{waitUntil:'networkidle0'});
    await page.emulateMediaType('print');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const printState=await page.evaluate(()=>({
      nav:getComputedStyle(document.querySelector('.report-nav')).display,
      hero:document.querySelector('#doc h1').textContent,
      overflow:[...document.querySelectorAll('.page .flow')].some(flow=>flow.lastElementChild.getBoundingClientRect().bottom>flow.getBoundingClientRect().bottom+2),
    }));
    assert.equal(printState.nav,'none');assert.match(printState.hero,/tied at 70/);assert.equal(printState.overflow,false);
    const {mkdirSync}=await import('node:fs');mkdirSync('tmp/report-qa',{recursive:true});
    await (await page.$('#doc .page')).screenshot({path:'tmp/report-qa/print-cover.png'});
    await page.close();
  } finally {await browser.close();await new Promise(done=>server.close(done));}
});

