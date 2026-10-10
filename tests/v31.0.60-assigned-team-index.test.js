import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
export function fixture(assigned=true) {
 const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:400}));
 const course={id:'c',name:'Assigned Course',tees:[{id:'t',teeName:'White',slope:113,rating:72,par:72,holes}]};
 const players=[6,14,-4,0].map((index,i)=>({id:'p'+i,name:'Golfer '+i,index}));
 const match={id:'r',name:'Assigned Round',courseId:'c',teeId:'t',courseSnapshot:course,holeCount:18,teamCount:2,playersPerTeam:2,allowance:50,featuredCompetition:'nassau',selectedGames:[{key:'nassau',basis:'net',scoringPolicyVersion:1,handicapAllowancePercent:20,countingBalls:1,stakesFront:5,stakesBack:5,stakesOverall:5}],players:players.map((p,i)=>({playerId:p.id,team:i<2?1:2,teeId:'t',slot:i,...(assigned?{assignedTeamIndex:i<2?10:-2}:{}),scores:holes.map(h=>({holeNumber:h.holeNumber,gross:5}))})),...(assigned?{assignedTeamIndexPolicyVersion:1}:{})};
 return {course,players,match};
}
function seed(assigned=true){const data=fixture(assigned),engine=loadLiveEngine();const state=engine.seedState({courses:[data.course],players:data.players,matches:[data.match],activeMatchId:'r'});return {engine,state,match:state.matches[0]};}
const plain=v=>JSON.parse(JSON.stringify(v));
test('assigned signed indexes bypass round and game allowances while preserving relative strokes',()=>{
 const {engine,match}=seed();const metrics=engine.computeMatchMetrics(match);
 assert.deepEqual(plain(metrics.players.map(p=>[p.handicapIndex,p.courseHdcp,p.playHdcp])),[[10,10,10],[10,10,10],[-2,-2,-2],[-2,-2,-2]]);
 assert.equal(engine.getGameRelativeStrokeAllowance(1,metrics.players[0],metrics,match.selectedGames[0]),1);
 assert.equal(engine.getGameRelativeStrokeAllowance(13,metrics.players[0],metrics,match.selectedGames[0]),0);
 for(const allowance of [0,20,50,85,100])assert.equal(engine.getPlayerGameHandicap(metrics.players[0],allowance),10);
 assert.match(engine.formatNassauPolicyLabel(match.selectedGames[0],match),/no additional allowance/);
});
test('legacy rounds retain library indexes and their separate allowances',()=>{
 const {engine,match}=seed(false),metrics=engine.computeMatchMetrics(match);
 assert.deepEqual(plain(metrics.players.map(p=>p.playHdcp)),[3,7,-2,0]);
 assert.equal(engine.getPlayerGameHandicap(metrics.players[1],20),3);
 assert.equal(Object.hasOwn(match.players[0],'assignedTeamIndex'),false);
});
test('invalid, unequal, mixed-tee and forward-version overrides fail closed',()=>{
 for(const change of [m=>m.players[0].assignedTeamIndex=null,m=>m.players[0].assignedTeamIndex='',m=>m.players[0].assignedTeamIndex=Infinity,m=>m.players[0].assignedTeamIndex=11,m=>m.players[0].teeId='other',m=>m.assignedTeamIndexPolicyVersion=2,m=>m.playersPerTeam=1]){
 const {engine,match}=seed();change(match);assert.ok(engine.getAssignedTeamIndexError(match));assert.equal(engine.computeMatchMetrics(match),null); }
});
test('saved override survives library changes, normalization and frozen report records',()=>{
 const {engine,state,match}=seed();const before=engine.buildRoundRecord(match,engine.computeMatchMetrics(match));
 assert.equal(before.meta.assignedTeamIndexPolicyVersion,1);assert.equal(before.players[0].index,10);assert.equal(before.players[0].libraryIndex,6);assert.equal(before.players[0].playingHandicap,10);
 before.isFrozen=true;before.frozenAt='2026-10-10T15:00:00Z';match.roundRecordSnapshot=before;const saved=JSON.stringify(before);
 state.players[0].index=35;const reloaded=engine.seedState(plain(state)).matches[0];
 assert.equal(engine.computeMatchMetrics(reloaded).players[0].playHdcp,10);assert.equal(JSON.stringify(reloaded.roundRecordSnapshot),saved);
 assert.equal(engine.buildLedgerEntryReportModel(reloaded,engine.computeMatchMetrics(reloaded)).players[0].index,10);
});
test('shared publication and independent device hydration preserve assigned index and library identity',()=>{
 const {engine,match}=seed();const payload=engine.buildCloudMatchPayload(match,'owner');
 assert.equal(payload.players[0].player_index,6);assert.equal(payload.players[0].handicap_snapshot.assignedTeamIndex,10);assert.equal(payload.players[0].playing_handicap,10);
 const joined=loadLiveEngine();joined.seedState({players:[{id:'p0',name:'Local Golfer',index:28}],courses:[],matches:[]});
 const hydrated=joined.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players});
 assert.equal(hydrated.players[0].assignedTeamIndex,10);assert.equal(joined.computeMatchMetrics(hydrated).players[0].playHdcp,10);
 assert.equal(joined.computeMatchMetrics(hydrated).players[0].player.index,28);
 const second=plain(payload.matchRow.course_snapshot.sharedMatchMeta);second.assignedTeamIndexes={p0:12,p1:12,p2:-2,p3:-2};
 assert.equal(joined.applyAssignedTeamIndexMetadata(hydrated,second),true);assert.equal(joined.computeMatchMetrics(hydrated).players[0].playHdcp,12);
 assert.equal(joined.applyAssignedTeamIndexMetadata(hydrated,{}),false);
 joined.applyAssignedTeamIndexMetadata(hydrated,{assignedTeamIndexPolicyVersion:0});assert.equal(Object.hasOwn(hydrated.players[0],'assignedTeamIndex'),false);
});
test('missing library indexes retain explicit missingness rather than prefilling scratch',()=>{
 const {engine}=seed();const state=engine.seedState({players:[{id:'missing',name:'Unknown',index:''}],courses:[],matches:[]});
 assert.equal(state.players[0].handicapIndexMissing,true);
 assert.equal(engine.finiteHandicapIndex(''),null);assert.equal(engine.finiteHandicapIndex('-2.5'),-2.5);assert.equal(engine.finiteHandicapIndex('abc'),null);
});

test('Sixes and Wolf use assigned final handicaps rather than their configured allowances',()=>{
 const {engine,match}=seed();const metrics=engine.computeMatchMetrics(match),playerIds=match.players.map(p=>p.playerId);
 for(const key of ['sixes','wolf']){
 const config={key,basis:'net',mode:'points',playerIds,handicapAllowanceMode:'custom',handicapAllowancePercent:20,pointValue:1,teamScoringMode:'best_ball',segmentResultMode:'match',finalHolesRule:'continue'};
 const result=key==='sixes'?engine.computeSixesResults(match,metrics,config):engine.computeWolfResults(match,metrics,config);
 assert.deepEqual(plain(result.gameHandicaps),{p0:10,p1:10,p2:-2,p3:-2});assert.equal(result.lowGameHandicap,-2);
 }
});
test('saved tee snapshot, fractional rounding and positive-plus strokes remain authoritative',()=>{
 const {engine,state,match}=seed();match.courseSnapshot=plain(match.courseSnapshot);match.courseSnapshot.tees[0].slope=125;match.courseSnapshot.tees[0].rating=73;match.players.slice(0,2).forEach(p=>p.assignedTeamIndex=8.5);
 const metrics=engine.computeMatchMetrics(match);assert.equal(metrics.players[0].playHdcp,10);state.courses[0].tees[0].slope=200;
 assert.equal(engine.buildCloudMatchPayload(match).players[0].playing_handicap,10);
 assert.equal(engine.holeCourseNetStrokeAllowance(18,-2),-1);assert.equal(engine.holeCourseNetStrokeAllowance(1,-2),0);
});

test('shared metadata keeps missing library indexes explicit and updates tee facts together',()=>{
 const {engine,state,match}=seed();state.players[0].handicapIndexMissing=true;
 const payload=engine.buildCloudMatchPayload(match),joined=loadLiveEngine();joined.seedState({players:[],courses:[],matches:[]});
 const round=joined.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players});assert.equal(joined.computeMatchMetrics(round).players[0].player.handicapIndexMissing,true);
 const course=plain(match.courseSnapshot);course.tees[0].id='new-tee';course.tees[0].slope=113;course.tees[0].rating=74;
 const meta={assignedTeamIndexPolicyVersion:1,assignedTeamIndexes:{p0:10,p1:10,p2:-2,p3:-2},assignedTeamTeeIds:Object.fromEntries(round.players.map(p=>[p.playerId,'new-tee'])),assignedTeamReferenceTeeId:'new-tee',assignedTeamCourseSnapshot:course};
 assert.equal(joined.applyAssignedTeamIndexMetadata(round,meta),true);assert.equal(round.teeId,'new-tee');assert.equal(joined.computeMatchMetrics(round).players[0].playHdcp,12);
 assert.equal(joined.applyAssignedTeamIndexMetadata(round,meta),false);
 round.players.slice(0,2).forEach(p=>p.teeId='missing-tee');assert.equal(joined.computeMatchMetrics(round),null);
});

test('assigned reports preserve signed Course Net and final PH separately from relative game strokes',()=>{
 const {engine,match}=seed();let metrics=engine.computeMatchMetrics(match),report=engine.buildLedgerEntryReportModel(match,metrics);
 assert.equal(report.players[0].ph,10);assert.equal(report.players[0].strokes.featured.reduce((a,b)=>a+b,0),12);
 assert.equal(report.players[2].strokes.courseNet[17],-1);assert.equal(report.players[2].gross[17]-report.players[2].strokes.courseNet[17],6);
 match.featuredCompetition='stroke_net';match.matchStatusGame='stroke_net';match.selectedGames=[];metrics=engine.computeMatchMetrics(match);report=engine.buildLedgerEntryReportModel(match,metrics);
 assert.equal(report.players[2].ph,-2);assert.equal(report.players[2].strokes.featured[17],0); // Existing report off-low stroke convention is retained.
});

test('assigned records preserve an unknown library index as unknown',()=>{
 const {engine,state,match}=seed();state.players[0].handicapIndexMissing=true;state.players[0].index=0;
 const record=engine.buildRoundRecord(match,engine.computeMatchMetrics(match));assert.equal(record.players[0].libraryIndex,null);assert.equal(record.players[0].assignedTeamIndex,10);assert.equal(record.players[0].index,10);
});
