import test from 'node:test';
import assert from 'node:assert/strict';
import {pressReportFixture} from './support/press-report-fixture.js';
const plain=value=>JSON.parse(JSON.stringify(value));
test('frozen legacy Nassau inclusive amounts become separate base and press report rows without changing $14 settlement or saved evidence',()=>{
 const {engine,match,metrics}=pressReportFixture({badStory:true}),before=JSON.stringify(match.roundRecordSnapshot),model=engine.buildLedgerEntryReportModel(match,metrics);
 assert.equal(match.roundRecordSnapshot.games[0].amounts.tom,15);assert.deepEqual(plain(model.games.map(g=>g.money)),[{john:-10,tom:10},{john:1,tom:-1},{john:-5,tom:5}]);assert.deepEqual(plain(model.payments),[{from:'john',to:'tom',amt:14}]);
 assert.equal(model.games[2].pressEvidence.result.diff,-1);assert.equal(model.games[2].handicaps.tom,2);assert.equal(model.games[2].handicaps.john,0);assert.equal(JSON.stringify(match.roundRecordSnapshot),before);
 assert.deepEqual(plain(model.meta.storyFactIssues.map(issue=>issue.code)),['FALSE_FRONT_FINISH','FALSE_PRESS_MARGIN','UNVERIFIABLE_WEATHER_DURATION']);
});
test('multiple presses and re-presses reconcile by root and deduplicate audited transactions while voided and halved presses stay zero',()=>{
 const {engine}=pressReportFixture(),record={games:[{gameId:'p1',type:'press',status:'FINAL',rootGameId:'nassau_net',config:{pressId:'p1'}},{gameId:'p2',type:'press',status:'FINAL',rootGameId:'nassau_net',parentGameId:'p1',config:{pressId:'p2'}},{gameId:'p3',type:'press',status:'VOIDED',rootGameId:'nassau_net',config:{pressId:'p3'}},{gameId:'p4',type:'press',status:'HALVED',rootGameId:'nassau_net',config:{pressId:'p4'}}],pressTransactions:[{transactionId:'a',pressId:'p1',payerId:'john',payeeId:'tom',amount:5},{transactionId:'a',pressId:'p1',payerId:'john',payeeId:'tom',amount:5},{transactionId:'b',pressId:'p2',payerId:'tom',payeeId:'john',amount:2}]},before=JSON.stringify(record),result=engine.getPressReportAccounting(record,['john','tom']);
 assert.deepEqual(plain(result.includedByRoot.nassau),{john:-3,tom:3});assert.deepEqual(plain(result.moneyByPress.p1),{john:-5,tom:5});assert.deepEqual(plain(result.moneyByPress.p2),{john:2,tom:-2});assert.deepEqual(plain(result.moneyByPress.p3),{john:0,tom:0});assert.deepEqual(plain(result.moneyByPress.p4),{john:0,tom:0});assert.equal(JSON.stringify(record),before);
});
test('story fact audit accepts a correct one-up press and recorded weather snapshot without inferring conditions all day',()=>{
 const {engine,match,metrics}=pressReportFixture();assert.deepEqual(plain(engine.auditRecordedStoryFacts(match,metrics,'John held the lead through eight holes. Tom won the press by one. Conditions were overcast at the first completed hole.')),[]);
 assert.equal(engine.auditRecordedStoryFacts(match,metrics,'The $5 press was won by five dollars.').length,0);
});
test('accepted legacy report is corrected only in a display clone using captured allocations even after library handicaps change',()=>{
 const {engine,match,metrics}=pressReportFixture(),legacy=plain(engine.buildLedgerEntryReportModel(match,metrics));legacy.meta.status='final';legacy.meta.story='John held that lead through nine holes. Tom won the press by five. Conditions remained steady throughout the round.';legacy.games[0].money={john:-15,tom:15};legacy.games[2].money={john:0,tom:0};delete legacy.games[2].pressEvidence;delete legacy.games[0].componentStakes;legacy.games[2].allowance={key:'featured',label:'Legacy'};
 match.ledgerEntrySnapshot={status:'accepted',acceptedAt:'2026-10-11T12:00:00Z',roundId:match.id,report:legacy};const before=JSON.stringify(match),stateBefore=JSON.stringify(legacy);
 const altered={...metrics,players:metrics.players.map(p=>({...p,courseHdcp:50}))};const view=engine.prepareAcceptedLedgerReportForDisplay(match,legacy,altered);
 assert.deepEqual(plain(view.games.map(g=>g.money)),[{john:-10,tom:10},{john:1,tom:-1},{john:-5,tom:5}]);assert.deepEqual(plain(view.payments),[{from:'john',to:'tom',amt:14}]);assert.equal(view.games[2].allowance.key,view.games[0].allowance.key);assert.deepEqual(plain(view.meta.storyFactIssues.map(issue=>issue.code)),['FALSE_FRONT_FINISH','FALSE_PRESS_MARGIN','UNVERIFIABLE_WEATHER_DURATION']);assert.equal(JSON.stringify(match),before);assert.equal(JSON.stringify(legacy),stateBefore);
 assert.deepEqual(plain(engine.prepareAcceptedLedgerReportForDisplay(match,view,altered)),plain(view));
});
test('accepted scorecard or payment mismatch is retained rather than silently reconciled against different facts',()=>{
 const {engine,match,metrics}=pressReportFixture(),report=plain(engine.buildLedgerEntryReportModel(match,metrics));report.players[0].gross[0]=5;let view=engine.prepareAcceptedLedgerReportForDisplay(match,report,metrics);assert.match(view.meta.presentationCorrectionUnavailable,/differs/);assert.deepEqual(plain(view.games),report.games);
 const payment=plain(engine.buildLedgerEntryReportModel(match,metrics));payment.payments[0].amt=19;view=engine.prepareAcceptedLedgerReportForDisplay(match,payment,metrics);assert.match(view.meta.presentationCorrectionUnavailable,/does not reconcile/);assert.deepEqual(plain(view.games),payment.games);assert.equal(view.payments[0].amt,19);
});
