import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
const plain=x=>JSON.parse(JSON.stringify(x));
function seed(scores=[3,4,5,6],extra={}) {
 const engine=loadLiveEngine(),data=scrambleFixture();
 data.match.players.forEach(player=>{player.assignedTeamIndex=0;player.scores.forEach(score=>score.gross=scores[player.team-1]);});
 data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,...extra,picks:Object.fromEntries(data.players.map((p,i)=>[p.id,Math.floor(i/2)+1]))})];
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 return {engine,match,data};
}
test('event defaults, percentages and selected competition validation',()=>{
 const {engine,match}=seed();assert.equal(engine.normalizeFlamtanaConfig().scoringPolicyVersion,3);
 assert.equal(engine.normalizeFlamtanaConfig().calcuttaStake,15);
 const rules=engine.getCompetitionRulesContract('flamtana_special',match.selectedGames[0]);
 assert.match(rules.scoringMethod,/The Big Game/);assert.match(rules.tieTreatment,/No card-off/);
 for(const [first,second] of [[70,40],[-1,101],[NaN,30],[70.001,29.999]]){
  Object.assign(match.selectedGames[0],{firstPlacePercent:first,secondPlacePercent:second});assert.match(engine.getFlamtanaSetupError(match),/percentages/);
  assert.equal(engine.getSetupDestinationForReadinessItem({warning:engine.getFlamtanaSetupError(match)}),'games');
 }
});
test('outright first and second receive 70/30 with exact zero-sum net contributions',()=>{
 const {engine,match}=seed();const result=engine.computeFlamtanaResults(match,null,{finalize:true});
 const big=result.components[0];assert.equal(big.label,'The Big Game');
 assert.deepEqual(plain(big.result.prizes),[{place:1,teamIds:['T1'],percent:70,pool:112},{place:2,teamIds:['T2'],percent:30,pool:48}]);
 assert.deepEqual(plain(Object.values(big.amounts)),[36,36,4,4,-20,-20,-20,-20]);
 assert.equal(result.components.at(-1).stake*8,120);
 result.components.forEach(component=>assert.equal(Object.values(component.amounts).reduce((s,v)=>s+Math.round(v*100),0),0));
});
test('tied first splits entire pool with no second award or card-off, even when card-off requested',()=>{
 const {engine,match}=seed([3,3,4,5],{tieMethod:'hole18'});const big=engine.computeFlamtanaResults(match,null,{finalize:true}).components[0];
 assert.deepEqual(plain(big.result.winnerIds),['T1','T2']);assert.equal(big.result.evidence.length,1);assert.equal(big.result.prizes.length,1);
 assert.deepEqual(plain(Object.values(big.amounts)),[20,20,20,20,-20,-20,-20,-20]);
});
test('ties for second share only second allocation and cents reconcile for fractional percentages',()=>{
 const precise=seed([3,4,5,6],{firstPlacePercent:16.15,secondPlacePercent:83.85,featuredStake:1.25});
 const exact=precise.engine.computeFlamtanaResults(precise.match,null,{finalize:true}).components[0];
 assert.equal(exact.result.prizes[0].pool,1.62);assert.equal(exact.result.prizes[1].pool,8.38);
 for(const scores of [[3,4,4,5],[3,4,4,4],[3,3,3,3]]){
  const {engine,match}=seed(scores,{firstPlacePercent:66.67,secondPlacePercent:33.33,featuredStake:0.03});
  const big=engine.computeFlamtanaResults(match,null,{finalize:true}).components[0];
  assert.equal(Object.values(big.amounts).reduce((s,v)=>s+Math.round(v*100),0),0);
  assert.equal(big.result.prizes.reduce((sum,p)=>sum+Math.round(p.pool*100),0),24);
  if(scores[0]!==scores[1]){assert.equal(big.result.prizes[1].teamIds.length,scores.filter(x=>x===4).length);assert.equal(big.result.prizes[0].pool,0.16);}
 }
});
test('all 31 nonempty competition selections freeze, reload and report only selected money',()=>{
 const keys=['featured','group1','group2','foursome','calcutta'];
 for(let mask=1;mask<32;mask++){
  const extra=Object.fromEntries(keys.map((key,i)=>[key+'Enabled',Boolean(mask&(1<<i))]));
  const {engine,match,data}=seed([3,4,5,6],extra);
  if(!extra.calcuttaEnabled)match.selectedGames[0].picks={};
  const result=engine.computeFlamtanaResults(match,null,{finalize:true});assert.equal(result.valid,true,mask);
  result.components.filter(c=>!c.enabled).forEach(c=>assert.ok(Object.values(c.amounts).every(value=>value===0)));
  const live=engine.buildFlamtanaProjectedSettlement(match);assert.deepEqual(plain(live.components.map(c=>c.key)),keys.filter((_,i)=>mask&(1<<i)));
  live.rows.forEach(row=>assert.equal(row.total,result.components.reduce((sum,c)=>sum+(c.amounts[row.id]||0),0)));
  match.status='complete';match.completedAt='2026-10-17T12:00:00Z';match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
  const before=JSON.stringify(match.roundRecordSnapshot),report=engine.buildLedgerEntryReportModel(match);
  assert.deepEqual(plain(report.games.map(game=>game.id)),keys.filter((_,i)=>mask&(1<<i)).map(key=>'flamtana_'+key));
  assert.equal(JSON.stringify(match.roundRecordSnapshot),before);
  const reloaded=engine.seedState(plain({players:data.players,courses:[data.course],matches:[match]})).matches[0];
  assert.equal(JSON.stringify(reloaded.roundRecordSnapshot),before);
 }
});
test('no competitions is rejected; Calcutta picks required only when selected; legacy rules unchanged',()=>{
 const {engine,match}=seed();Object.assign(match.selectedGames[0],Object.fromEntries(['featured','group1','group2','foursome','calcutta'].map(k=>[k+'Enabled',false])));
 assert.match(engine.getFlamtanaSetupError(match),/at least one/);
 match.selectedGames[0].calcuttaEnabled=true;match.selectedGames[0].picks={};assert.match(engine.getFlamtanaSetupError(match,{requirePicks:true}),/Calcutta/);
 const legacy=engine.normalizeFlamtanaConfig({key:'flamtana_special',scoringPolicyVersion:2});assert.equal(Object.hasOwn(legacy,'firstPlacePercent'),false);assert.equal(legacy.calcuttaStake,20);
});

test('50 event rounds independently reconcile selected pools, two-place prizes, projections and frozen reports',()=>{
 let randomState=740050;const random=()=>{randomState=(1664525*randomState+1013904223)>>>0;return randomState/4294967296;};
 for(let run=0;run<50;run++){
  const scores=Array.from({length:4},()=>3+Math.floor(random()*5)),mask=1+Math.floor(random()*31),keys=['featured','group1','group2','foursome','calcutta'];
  const config={...Object.fromEntries(keys.map((k,i)=>[k+'Enabled',Boolean(mask&(1<<i))])),firstPlacePercent:[0,33.33,60,70,100][run%5]};config.secondPlacePercent=100-config.firstPlacePercent;
  const {engine,match}=seed(scores,config),cfg=match.selectedGames[0];cfg.featuredStake=[0,0.01,19.99,20,23.45][run%5];
  const result=engine.computeFlamtanaResults(match,null,{finalize:true}),expected=Object.fromEntries(match.players.map(p=>[p.playerId,0]));
  const credit=(ledger,ids,cents)=>ids.slice().sort().forEach((id,i)=>ledger[id]+=Math.floor(cents/ids.length)+(i<cents%ids.length?1:0));
  for(const component of result.components){
   const ledger=Object.fromEntries(Object.keys(component.amounts).map(id=>[id,0]));
   if(component.enabled){
    const stake=Math.round(component.stake*100),ids=Object.keys(ledger),pool=stake*ids.length;ids.forEach(id=>ledger[id]-=stake);
    if(component.key==='calcutta'){
     const winners=scores.map((v,i)=>({v,team:i+1})).filter(row=>row.v===Math.min(...scores));
     winners.forEach((row,i)=>{const recipients=match.players.filter(p=>Number(cfg.picks[p.playerId])===row.team).map(p=>p.playerId);credit(ledger,recipients,Math.floor(pool/winners.length)+(i<pool%winners.length?1:0));});
    }else{
     const totals=component.key==='foursome'?[Math.min(...scores.slice(0,2)),Math.min(...scores.slice(2))]:component.key==='group1'?scores.slice(0,2):component.key==='group2'?scores.slice(2):scores;
     const winners=totals.map((v,i)=>({v,i})).filter(row=>row.v===Math.min(...totals)).map(row=>row.i),members=index=>component.series[index].memberIds;
     if(component.key==='featured'&&winners.length===1){
      const first=Math.round(pool*cfg.firstPlacePercent/100);credit(ledger,members(winners[0]),first);
      const second=Math.min(...totals.filter((_,i)=>i!==winners[0]));credit(ledger,totals.flatMap((v,i)=>v===second?members(i):[]),pool-first);
     }else credit(ledger,winners.flatMap(members),pool);
    }
   }
   assert.deepEqual(Object.fromEntries(Object.entries(component.amounts).map(([id,value])=>[id,Math.round(value*100)||0])),ledger,`round ${run} ${component.key}`);
   Object.entries(ledger).forEach(([id,cents])=>expected[id]+=cents);
  }
  const projected=engine.buildFlamtanaProjectedSettlement(match);projected.rows.forEach(row=>assert.equal(Math.round(row.total*100),expected[row.id]));
  match.status='complete';match.completedAt='2026-10-17T12:00:00Z';match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
  const report=engine.buildLedgerEntryReportModel(match);assert.equal(report.games.length,keys.filter((_,i)=>mask&(1<<i)).length);
  assert.deepEqual(Object.fromEntries(match.players.map(p=>[p.playerId,Math.round((match.roundRecordSnapshot.settlement.netPositions[p.playerId]||0)*100)||0])),expected);
 }
});
