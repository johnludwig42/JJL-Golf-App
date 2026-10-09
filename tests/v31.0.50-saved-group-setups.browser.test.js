import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

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

function setupFixture({ shared = false, gameKey = 'wolf' } = {}) {
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber:index + 1, par:4, strokeIndex:index + 1, yardage:410 }));
  const tee = { id:'blue', teeName:'Blue', rating:72, slope:125, par:72, holes };
  const course = { id:'setup-course', name:'Setup Course', tees:[tee] };
  const players = ['Alpha One','Bravo Two','Charlie Three','Delta Four'].map((name, index) => ({ id:`p${index + 1}`, name, index:index * 4 }));
  const selectedGames = gameKey === 'wolf' ? [{ key:'wolf', basis:'net', playerIds:players.map(player => player.id), allowLoneWolf:true, allowBlindWolf:false, finalHolesRule:'continue', pointValue:1 }] : [];
  const draft = {
    id:'setup-draft', date:'2026-09-12', name:'Wolf Setup Test', courseId:course.id, teeId:tee.id,
    holeCount:18, teamCount:2, playersPerTeam:2, allowance:100, scoringAccessMode:shared ? 'assigned_players' : 'single_device',
    storageMode:shared ? 'shared' : 'local', featuredCompetition:gameKey === 'wolf' ? 'wolf' : 'auto', selectedGames,
    players:players.map((player, slot) => ({ playerId:player.id, team:slot < 2 ? 1 : 2, slot, teeId:tee.id })),
  };
  return { players, course, draft };
}

async function seedSetup(browser, url, fixture) {
  const seedPage = await browser.newPage();
  await seedPage.evaluateOnNewDocument(() => { window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__ = true; });
  await seedPage.goto(url, { waitUntil:'load' });
  await seedPage.waitForFunction(() => Boolean(window.__DYE_LEDGER_LIVE_ENGINE__));
  await seedPage.evaluate(data => {
    const engine = window.__DYE_LEDGER_LIVE_ENGINE__;
    localStorage.clear();
    localStorage.setItem('the-dye-ledger-v20', JSON.stringify(engine.seedState({ players:data.players, courses:[data.course], matches:[], activeMatchId:null })));
    engine.saveSetupDraft(data.draft, localStorage);
  }, fixture);
  await seedPage.close();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(url, { waitUntil:'load' });
  await page.waitForSelector('#matchSubmitBtn:not(.hidden)');
  return { page, errors };
}

function groupTemplate(fixture, n=0) {
  return {id:'saturday-'+n,name:'Our Saturday Game',matchName:'Saturday Golf',courseId:fixture.course.id,teeId:'blue',teamCount:2,playersPerTeam:2,allowance:n===0?0:100,players:fixture.draft.players,
    selectedGames:[{key:'nassau',basis:'net',countingBalls:1,handicapAllowanceMode:'custom',handicapAllowancePercent:85,stakesFront:6,stakesBack:7,stakesOverall:8,pressesEnabled:true,pressType:'MANUAL',maxPressesPerRound:5,maxRePresses:2},
      {key:'wolf',basis:'net',playerIds:['p1','p2','p3','p4'],allowLoneWolf:true,allowBlindWolf:true,pointValue:2,points:{teamWin:3,opponentsWin:4,loneWolfWin:5,loneWolfLoss:6,blindWolfWin:7,blindWolfLoss:8}}],
    featuredCompetition:'nassau',playInputMode:'PLAYER',statTrackingMode:'NONE',scoringAccessMode:'single_device',sharedMatchEnabled:false,
    scores:[99],notes:'Old notes',roundRecap:'Old story',completedAt:'2020-01-01',payments:[{amount:99}],sharedMatchId:'old-server',teamScorers:[{code:'old-code'}]};
}

test('50 saved configurations create independent fresh drafts and flag unavailable library entries',()=>{
  const engine=loadLiveEngine(),fixture=setupFixture();
  engine.seedState({players:fixture.players,courses:[fixture.course],matches:[],activeMatchId:null});
  for(let n=0;n<50;n++){
    const template=groupTemplate(fixture,n);
    if(n%9===0){template.sharedMatchEnabled=true;template.scoringAccessMode='assigned_players';}
    if(n%5===0)template.courseId='removed-course';
    if(n%7===0)template.players=template.players.map((p,i)=>i===0?{...p,playerId:'removed-player'}:p);
    if(n%11===0)template.players=template.players.map((p,i)=>i===1?{...p,teeId:'removed-tee'}:p);
    const original=JSON.stringify(template);
    const {draft,warnings}=engine.buildDraftFromMatchTemplate(template);
    assert.notEqual(draft.id,template.id);
    assert.equal(draft.notes,'');assert.equal(draft.roundRecap,'');assert.equal(draft.completedAt,null);
    assert.notEqual(draft.sharedMatchId,'old-server');assert.equal(draft.teamScorers.length,0);
    assert.equal(draft.storageMode,n%9===0?'shared':'local');
    assert.equal(draft.allowance,n===0?0:100);
    assert.equal(draft.selectedGames[0].handicapAllowancePercent,85);
    assert.deepEqual(Array.from(draft.selectedGames[1].playerIds),['p1','p2','p3','p4']);
    assert.ok(draft.players.every(p=>p.scores.every(score=>!score.gross)));
    if(n%5===0){assert.equal(draft.courseId,'');assert.ok(warnings.length);}
    if(n%7===0){assert.equal(draft.players[0].playerId,'');assert.ok(warnings.length);}
    draft.selectedGames[1].points.teamWin=99;
    assert.equal(JSON.stringify(template),original);
  }
});

test('saved setup selection starts a fresh round and keeps its rules available during play', {skip:!chrome,timeout:120000},async()=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  try {
    const fixture=setupFixture({gameKey:''});
    const {page,errors}=await seedSetup(browser,`http://127.0.0.1:${server.address().port}/index.html`,fixture);
    const template=groupTemplate(fixture,0);
    await page.evaluate(template=>localStorage.setItem('dyeLedger.matchTemplates.v1',JSON.stringify([template])),template);
    await page.reload({waitUntil:'load'});
    await page.setViewport({width:375,height:812,deviceScaleFactor:1});
    await page.select('#savedGroupSetupOverviewSelect',template.id);
    await page.click('[data-load-group-setup="savedGroupSetupOverviewSelect"]');
    await page.waitForFunction(()=>document.getElementById('groupSetupNotice')?.textContent.includes('Our Saturday Game'));
    assert.equal(await page.$eval('#matchForm [name="allowance"]',node=>node.value),'0');
    page.once('dialog',dialog=>dialog.accept('Saturday Game Copy'));
    await page.click('#saveGroupSetupOverviewBtn');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('dyeLedger.matchTemplates.v1')).length===2);
    const copy=await page.evaluate(()=>JSON.parse(localStorage.getItem('dyeLedger.matchTemplates.v1')).find(row=>row.name==='Saturday Game Copy'));
    assert.equal(copy.allowance,0);assert.equal(copy.selectedGames.find(game=>game.key==='wolf').points.blindWolfWin,7);
    await page.click('#setupGroupRulesPreview summary');
    assert.match(await page.$eval('#setupGroupRulesPreview',node=>node.textContent),/Front: \$6\.00/);
    assert.match(await page.$eval('#setupGroupRulesPreview',node=>node.textContent),/max 5 per round/);
    const {mkdirSync}=await import('node:fs');mkdirSync('tmp/report-qa',{recursive:true});
    await page.screenshot({path:'tmp/report-qa/v50-rules-preview.png',fullPage:true});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:'tmp/report-qa/v50-selector-preview.png'});
    await page.click('#matchSubmitBtn');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length===1);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0]);
    assert.equal(saved.allowance,0);
    assert.equal(saved.notes,'');assert.ok(saved.players.every(p=>p.scores.every(score=>!score.gross)));
    assert.equal(saved.selectedGames.find(g=>g.key==='wolf').points.blindWolfWin,7);
    await page.click('[data-tab="score"]');
    await page.click('#playGroupRulesPreview summary');
    assert.match(await page.$eval('#playGroupRulesPreview',node=>node.textContent),/Front: \$6\.00/);
    // Subsequent template edits cannot rewrite this round's snapshot.
    await page.evaluate(()=>{const templates=JSON.parse(localStorage.getItem('dyeLedger.matchTemplates.v1'));templates[0].selectedGames[0].stakesFront=50;localStorage.setItem('dyeLedger.matchTemplates.v1',JSON.stringify(templates));});
    await page.reload({waitUntil:'load'});await page.click('[data-tab="score"]');
    assert.match(await page.$eval('#playGroupRulesPreview',node=>node.textContent),/Front: \$6\.00/);
    await page.click('[data-tab="setup"]');await page.click('#editActiveMatchBtn');
    await page.click('[data-open-setup-destination="advanced"]');
    await page.evaluate(()=>document.querySelector('.match-templates-card').open=true);
    const before=await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches));
    await page.click('[data-apply-template="saturday-0"]');
    assert.match(await page.$eval('#toast',node=>node.textContent),/fresh match/);
    assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches)),before);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
    assert.deepEqual(errors,[]);
    await page.close();
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});

test('landing selector loads legacy templates and missing golfers/courses stay visibly unready', {skip:!chrome,timeout:60000},async()=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  try{
    const fixture=setupFixture({gameKey:''});
    const {page}=await seedSetup(browser,`http://127.0.0.1:${server.address().port}/index.html`,fixture);
    const template=groupTemplate(fixture,1);template.courseId='gone';template.players[0].playerId='gone';
    await page.evaluate(template=>{localStorage.setItem('dyeLedger.matchTemplates.v1',JSON.stringify([template]));localStorage.removeItem('the-dye-ledger-v20:setup-draft');},template);
    await page.reload({waitUntil:'load'});
    await page.select('#savedGroupSetupLandingSelect',template.id);
    await page.click('[data-load-group-setup="savedGroupSetupLandingSelect"]');
    assert.match(await page.$eval('#groupSetupNotice',node=>node.textContent),/no longer in your library/);
    assert.equal(await page.$eval('#matchCourseSelect',node=>node.value),'');
    assert.doesNotMatch(await page.$eval('#setupHubOverallStatus',node=>node.textContent),/^Ready to play$/);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length),0);
    await page.close();
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});

