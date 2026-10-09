import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import {reportFixture as fixture} from './support/report-fixtures.js';
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

