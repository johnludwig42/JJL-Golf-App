import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
function seed({complete=false}={}){
 const data=scrambleFixture(),engine=loadLiveEngine();
 data.match.players.forEach(p=>{p.assignedTeamIndex=0;p.scores.forEach(s=>s.gross=p.team+2);});
 data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:2,tieMethod:'hole18',featuredStake:20,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:Object.fromEntries(data.players.map(p=>[p.id,1]))}];
 if(complete){data.match.status='complete';data.match.completedAt='2026-10-12T12:00:00Z';}
 return {engine,match:engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0]};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('Flamtana AI payload satisfies the deployed story contract using frozen team facts and identity-only golfers',()=>{
 const {engine,match}=seed({complete:true});const metrics=engine.computeMatchMetrics(match);
 match.roundContext={weather:{temperature:72,humidity:50,latitudeApprox:41.2,longitudeApprox:-86.1,capturedAt:'2026-10-12T12:00:00Z'}};
 match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,metrics);
 const payload=engine.buildRoundRecapPayload(match,metrics),saved=plain(payload.authoritativeFacts);
 assert.equal(payload.recapContentSpecVersion,'1.0.0');assert.equal(payload.reportPurpose,'ledger-story');assert.equal(payload.players.length,8);
 assert.equal(payload.teams.length,4);assert.equal(payload.foursomes.length,2);assert.equal(payload.wagers.length,5);assert.equal(payload.final,true);
 assert.equal(payload.teams[0].members.length,2);assert.equal(payload.teams[0].tee,'White');assert.equal(payload.teams[0].gross.length,18);
 assert.equal(Object.hasOwn(payload.authoritativeFacts.weather,'latitudeApprox'),false);assert.equal(Object.hasOwn(payload.authoritativeFacts.weather,'longitudeApprox'),false);
 assert.ok(payload.players.every(player=>!Object.hasOwn(player,'gross')&&!Object.hasOwn(player,'net')&&!Object.hasOwn(player,'postable')&&player.statsTracked===false));
 match.players.forEach(p=>p.scores.forEach(s=>s.gross=12));
 assert.deepEqual(plain(engine.buildRoundRecapPayload(match,engine.computeMatchMetrics(match)).authoritativeFacts),saved);
});
test('facts-only Flamtana fallback retains Memories and recorded weather so Save does not block',()=>{
 const {engine,match}=seed({complete:true});
 match.memories=[{id:'m',holeNumber:9,text:'The group paused for a photo.'},{id:'shot',holeNumber:18,text:'Golfer 0 holed the team putt.'}];match.roundContext={weather:{temperature:72,humidity:50,conditionsText:'Clear',capturedAt:'2026-10-12T12:00:00Z'}};
 const metrics=engine.computeMatchMetrics(match),story=engine.buildDeterministicLedgerEntryStory(match,metrics).text,validation=engine.validateRoundRecapContent(match,metrics,story);
 assert.match(story,/The group paused for a photo/);assert.match(story,/72°F/);assert.match(story,/50% humidity/);
 assert.deepEqual(plain(engine.getBlockingStoryValidationIssues(validation)),[]);
 assert.equal(validation.valid,true);
});
test('Flamtana story rejects invented net totals, match-play results, winners and individual scoring',()=>{
 const {engine,match}=seed({complete:true}),metrics=engine.computeMatchMetrics(match);
 for(const [story,code] of [['First posted 99 net.','FALSE_FLAMTANA_NET_TOTAL'],['Second won the Featured.','FALSE_FLAMTANA_WINNER'],['Fourth won Group 2.','FALSE_FLAMTANA_WINNER'],['First won 2 & 1.','FALSE_FLAMTANA_MATCH_PLAY'],['Golfer 0 posted 54 net.','FALSE_FLAMTANA_INDIVIDUAL_SCORE'],['They needed 27 putts.','UNVERIFIABLE_FLAMTANA_STATISTIC']]){
  assert.ok(engine.validateRoundRecapContent(match,metrics,story).issues.some(issue=>issue.code===code),story);
 }
});
test('projected combined Flamtana nets are independently funded and never become real settlements',()=>{
 const {engine,match}=seed(),before=JSON.stringify(match),data=engine.buildFlamtanaProjectedSettlement(match);
 assert.equal(data.final,false);assert.deepEqual(plain(data.rows.map(row=>row.total)),[100,100,-20,-20,-20,-20,-60,-60]);
 assert.deepEqual(plain(data.rows[0].values),[60,20,0,20,0]);assert.equal(data.rows.reduce((sum,row)=>sum+Math.round(row.total*100),0),0);
 assert.equal(JSON.stringify(match),before);
 assert.ok(engine.computeFlamtanaResults(match).components.every(component=>Object.values(component.amounts).every(amount=>amount===0)));
 assert.deepEqual(plain(engine.buildRoundRecord(match).settlement.netPositions),{p0:0,p1:0,p2:0,p3:0,p4:0,p5:0,p6:0,p7:0});
});
test('projections compare common holes, split live ties without Card-Off and leave unresolved contests Pending',()=>{
 const {engine,match}=seed();match.players.forEach(p=>p.scores.forEach((s,i)=>s.gross=i===0?4:null));
 let data=engine.buildFlamtanaProjectedSettlement(match);assert.ok(data.rows.every(row=>row.values.slice(0,4).every(value=>value===0)));assert.deepEqual(plain(data.rows.map(row=>row.total)),[-15,-15,5,5,5,5,5,5]);
 match.players[5].scores[0].gross=5;data=engine.buildFlamtanaProjectedSettlement(match);
 assert.equal(data.rows[0].values[1],0);assert.equal(data.rows[0].values[2],0);assert.equal(data.rows[4].values[2],null);assert.equal(data.rows[0].total,null);
 assert.equal(engine.computeFlamtanaResults(match).final,false);
});
test('final scoreboard projection uses saved amounts and evidence rather than rerunning tie rules',()=>{
 const {engine,match}=seed({complete:true});match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
 const record=JSON.stringify(match.roundRecordSnapshot),expected=plain(match.roundRecordSnapshot.settlement.netPositions);
 match.players.forEach(p=>p.scores.forEach(s=>s.gross=12));
 const data=engine.buildFlamtanaProjectedSettlement(match);
 assert.equal(data.final,true);assert.deepEqual(Object.fromEntries(data.rows.map(row=>[row.id,row.total])),expected);assert.equal(JSON.stringify(match.roundRecordSnapshot),record);
});
