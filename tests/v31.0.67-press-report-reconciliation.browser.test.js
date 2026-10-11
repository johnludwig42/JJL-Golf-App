import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
import {pressReportFixture} from './support/press-report-fixture.js';
test('printed press audit reconciles the unchanged payment, replaces contradictory narrative and remains readable on desktop and iOS',{skip:!chrome,timeout:120000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});mkdirSync('tmp/report-qa/v67/report',{recursive:true});
 try{for(const ios of [false,true]){
  const {engine,match,metrics}=pressReportFixture({badStory:true}),model=engine.buildLedgerEntryReportModel(match,metrics),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(ios)await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.6.1 Mobile/15E148 Safari/604.1');
  await page.setViewport({width:900,height:1200});await page.evaluateOnNewDocument(report=>sessionStorage.setItem('press-review',JSON.stringify({createdAt:new Date().toISOString(),report})),model);
  await page.goto(`http://127.0.0.1:${server.address().port}/ledger-report/shell.html?reportKey=press-review`,{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('[data-press-detail]');
  const audit=await page.evaluate(()=>({body:document.querySelector('#doc').textContent,story:document.querySelector('.prose').textContent,press:document.querySelector('[data-press-detail]').textContent,pressRows:document.querySelectorAll('[data-press-detail] tbody tr').length,pages:[...document.querySelectorAll('.page')].map(n=>{const flow=n.querySelector('.flow'),last=flow?.lastElementChild;return {overflow:last?last.getBoundingClientRect().bottom-flow.getBoundingClientRect().top-flow.clientHeight:0,horizontal:n.scrollWidth>n.clientWidth+1};}),metadata:[...document.querySelectorAll('.sc .pl em')].map(n=>({text:n.textContent,clipped:n.scrollWidth>n.clientWidth+1})),perspectives:[...document.querySelectorAll('.subhead')].map(n=>n.textContent)}));
  assert.deepEqual(errors,[]);assert.equal(audit.pressRows,5);assert.match(audit.press,/Tom O’Brien 1 up/);assert.match(audit.press,/\$5 stake/);assert.match(audit.press,/H9/);assert.match(audit.story,/pays Tom O’Brien \$14/);assert.match(audit.story,/Front: all square/);assert.doesNotMatch(audit.story,/won.*by five|lead through nine|remained steady/);assert.doesNotMatch(audit.body,/No hole detail recorded|not \+1|carried/i);assert.match(audit.body,/No award/);assert.match(audit.body,/FRONT \$0 \(TIED\)/);assert.match(audit.body,/BACK \$5/);assert.match(audit.body,/OVERALL \$5/);assert.match(audit.body,/FRONT · TOM O’BRIEN PERSPECTIVE · NET/);assert.match(audit.body,/BACK · TOM O’BRIEN PERSPECTIVE · NET/);assert.match(audit.body,/TOM O’BRIEN–JOHN LUDWIG UNDER EACH HOLE/);assert.ok(audit.pages.every(p=>p.overflow<=1&&!p.horizontal),JSON.stringify(audit.pages));assert.ok(audit.metadata.every(row=>!row.clipped));assert.ok(audit.metadata.some(row=>row.text.includes('CH 11')));assert.ok(audit.metadata.some(row=>row.text.includes('PH 2')));
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('table.dense')].filter(table=>table.querySelector('thead th:last-child')?.textContent==='Match').every(table=>table.querySelector('thead th:last-child').getBoundingClientRect().right<=table.getBoundingClientRect().right+1)));
  await page.emulateMediaType('print');const name=ios?'ios':'desktop';await page.pdf({path:`tmp/report-qa/v67/report/${name}.pdf`,format:'letter',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
  const sheets=await page.$$('.page');for(let i=0;i<sheets.length;i++)await sheets[i].screenshot({path:`tmp/report-qa/v67/report/${name}-page-${i+1}.png`});writeFileSync(`tmp/report-qa/v67/report/${name}-audit.json`,JSON.stringify(audit,null,2));await page.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('unplayed Nassau segments remain Pending rather than being printed as tied paid bets',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const {engine,match}=pressReportFixture({frozen:false});match.roundRecapFinal='';match.players.forEach(player=>player.scores.slice(8).forEach(score=>score.gross=null));match.greeniesWinners={4:'john'};match.selectedGames[1].winnersByHole={4:'john'};
  const model=engine.buildLedgerEntryReportModel(match,engine.computeMatchMetrics(match)),page=await browser.newPage();await page.evaluateOnNewDocument(report=>sessionStorage.setItem('pending-review',JSON.stringify({createdAt:new Date().toISOString(),report})),model);
  await page.goto(`http://127.0.0.1:${server.address().port}/ledger-report/shell.html?reportKey=pending-review`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-press-detail]');
  const text=await page.$eval('#doc',node=>node.textContent);assert.match(text,/BACK PENDING/);assert.doesNotMatch(text,/BACK \$0 \(TIED\)/);assert.match(await page.$eval('[data-press-detail]',node=>node.textContent),/Active/);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('reopening an accepted legacy entry uses corrected display rows without rewriting its stored report or RoundRecord',{skip:!chrome,timeout:60000},async()=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
  const {engine,match,metrics,players,course}=pressReportFixture(),legacy=JSON.parse(JSON.stringify(engine.buildLedgerEntryReportModel(match,metrics)));legacy.meta.status='final';legacy.meta.story='John held that lead through nine holes. Tom won the press by five. Conditions remained steady throughout the round.';legacy.games[0].money={john:-15,tom:15};legacy.games[2].money={john:0,tom:0};delete legacy.games[2].pressEvidence;delete legacy.games[0].componentStakes;
  match.ledgerEntrySnapshot={schemaVersion:1,status:'accepted',roundId:match.id,acceptedAt:'2026-10-11T12:00:00Z',story:legacy.meta.story,report:legacy};const state=engine.seedState({players,courses:[course],matches:[match],completedSummaryMatchId:match.id});
  // The normal app entry path uses same-tab export on a mobile user agent.
  const appPage=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,'results',375,false,false,false,{state,storage:[]});await appPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.6.1 Mobile/15E148 Safari/604.1');
  assert.equal(await appPage.evaluate(()=>!!getAcceptedLedgerEntrySnapshot(getMatch('press-review'))),true);
  const before=await appPage.evaluate(()=>{const match=JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0];return JSON.stringify({record:match.roundRecordSnapshot,accepted:match.ledgerEntrySnapshot});});
  const storedState=await appPage.evaluate(()=>localStorage.getItem('the-dye-ledger-v20'));await appPage.evaluateOnNewDocument(value=>localStorage.setItem('the-dye-ledger-v20',value),storedState);
  await Promise.all([appPage.waitForNavigation({waitUntil:'networkidle0'}),appPage.evaluate(()=>openUnifiedExport(getMatch('press-review'),'ledger'))]);await appPage.waitForSelector('[data-press-detail]');
  const view=await appPage.evaluate(()=>({money:globalThis.__DYE_LEDGER_ROUND__.games.map(game=>game.money),story:document.querySelector('.prose').textContent}));assert.deepEqual(view.money,[{john:-10,tom:10},{john:1,tom:-1},{john:-5,tom:5}]);assert.match(view.story,/pays Tom O’Brien \$14/);assert.doesNotMatch(view.story,/won.*by five|lead through nine/);
  const after=await appPage.evaluate(()=>{const match=JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0];return JSON.stringify({record:match.roundRecordSnapshot,accepted:match.ledgerEntrySnapshot});});assert.equal(after,before);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
