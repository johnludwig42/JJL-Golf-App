import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import puppeteer from 'puppeteer-core';
import {chrome,startServer} from './support/design-browser.js';

function fixture(complete) {
  const data=scrambleFixture(),engine=loadLiveEngine();
  data.match.status=complete?'complete':'active';
  if(complete)data.match.completedAt='2026-10-25T19:00:00Z';
  data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,picks:Object.fromEntries(data.players.map(player=>[player.id,1]))})];
  data.match.players.forEach(player=>player.scores.forEach((score,index)=>score.gross=complete||index<9?4+player.team:null));
  const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
  const metrics=engine.computeMatchMetrics(match);
  if(complete)match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,metrics);
  return {engine,match,metrics};
}

for(const complete of [true,false]) {
  test(`Ledger model carries authoritative ${complete?'final':'provisional'} status without changing round evidence`,()=>{
    const {engine,match,metrics}=fixture(complete),before=JSON.stringify(match);
    const record=engine.getEffectiveRoundRecord(match,metrics),model=engine.buildLedgerEntryReportModel(match,metrics);
    assert.equal(model.meta.status,complete?'final':'provisional');
    assert.equal(model.meta.status,record.meta.status);
    assert.equal(JSON.stringify(match),before);
  });
}

test('real report acceptance enables completed records and blocks provisional records',{skip:!chrome,timeout:60000},async()=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  try {
    for(const complete of [false,true]) {
      const {engine,match,metrics}=fixture(complete),report=engine.buildLedgerEntryReportModel(match,metrics);
      report.meta.story='Reviewed test Story';
      report.meta.storyApprovalRequired=false;
      const page=await browser.newPage();
      await page.evaluateOnNewDocument(model=>sessionStorage.setItem('status-review',JSON.stringify({createdAt:new Date().toISOString(),report:model})),report);
      await page.goto(`http://127.0.0.1:${server.address().port}/ledger-report/shell.html?reportKey=status-review`,{waitUntil:'networkidle0'});
      const button=await page.$eval('#acceptLedgerEntryBtn',node=>({disabled:node.disabled,text:node.textContent}));
      assert.equal(button.disabled,!complete);
      if(complete){
        await page.click('#acceptLedgerEntryBtn');
        assert.equal(await page.$eval('#acceptLedgerEntryBtn',node=>node.textContent),'Accepted');
        const accepted=await page.evaluate(()=>JSON.parse(localStorage.getItem('dye-ledger:pending-ledger-entry-acceptance')));
        assert.equal(accepted.report.meta.status,'final');
        assert.equal(accepted.report.meta.story,'Reviewed test Story');
        assert.equal(JSON.stringify(accepted.report.payments),JSON.stringify(report.payments));
        assert.equal(JSON.stringify(accepted.report.meta.flamtanaEvidence),JSON.stringify(report.meta.flamtanaEvidence));
      }else{
        assert.equal(button.text,'Complete round to accept');
        assert.equal(await page.evaluate(()=>localStorage.getItem('dye-ledger:pending-ledger-entry-acceptance')),null);
      }
      await page.close();
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
