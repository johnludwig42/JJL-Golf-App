import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';

import {scrambleFixture} from './support/scramble-fixture.js';
const plain=v=>JSON.parse(JSON.stringify(v));
function seed(){const data=scrambleFixture(),engine=loadLiveEngine(),state=engine.seedState({courses:[data.course],players:data.players,matches:[data.match],activeMatchId:'r'});return {engine,state,match:state.matches[0]};}
test('fixed scramble setup permits creation before assignments but requires two assigned foursomes at Start',()=>{
 const {engine,match}=seed();assert.equal(engine.getScrambleSetupError(match),'');assert.equal(engine.getScrambleSetupError(match,{assignments:true}),'');
 match.sharedPlayerAssignments.p0='jp';assert.match(engine.getScrambleSetupError(match,{assignments:true}),/Assign T1/);assert.equal(engine.getScrambleSetupError(match),'');
 delete match.sharedPlayerAssignments.p0;assert.ok(engine.getScrambleSetupError(match,{assignments:true}));
});
test('team edits validate before changing both partners, preserve other teams and explicit clear is paired',()=>{
 const {engine,match}=seed();const apply=(team,pos,value)=>engine.applyTeamGrossScore(match,team,pos,value,{checkAuthority:false});
 assert.equal(apply(1,1,'4').valid,true);assert.deepEqual(match.players.map(p=>p.scores[0].gross),[4,4,null,null,null,null,null,null]);
 for(const value of ['bad',0,-1,3.5,26]){assert.equal(apply(1,1,value).valid,false);assert.equal(match.players[0].scores[0].gross,4);}
 assert.equal(apply(1,1,5).changedPlayerIds.length,2);assert.equal(apply(1,1,5).changedPlayerIds.length,0);
 assert.equal(apply(1,1,'').changedPlayerIds.length,2);assert.equal(engine.getScrambleTeamHoleScore(match,1,1).gross,null);
 assert.equal(apply(8,1,4).valid,false);assert.equal(apply(1,19,4).valid,false);
 match.roundTiming.startedAt=null;assert.equal(apply(1,1,4).valid,false);
});
test('separately arriving partner writes remain pending and cannot complete or freeze until equal',()=>{
 const {engine,match}=seed();match.players.forEach(p=>p.scores.forEach(s=>s.gross=4));match.players[1].scores[0].gross=5;
 let metrics=engine.computeMatchMetrics(match);assert.equal(metrics.holeResults[0].completed,false);assert.equal(metrics.holeResults[0].teamScores.some(t=>t.team===1),false);assert.equal(engine.getRoundCompletionState(match,metrics).isComplete,false);
 match.status='complete';match.completedAt='2026-10-10T16:00:00Z';assert.equal(engine.canFreezeRoundRecord(match,metrics),false);
 match.players[1].scores[0].gross=4;metrics=engine.computeMatchMetrics(match);assert.equal(engine.getRoundCompletionState(match,metrics).isComplete,true);assert.equal(engine.hasUnresolvedTeamScores(match),false);
});
test('team completion and signed Course Net totals advance independently of the field',()=>{
 const {engine,match}=seed();for(const team of [1,2])engine.applyTeamGrossScore(match,team,1,4,{checkAuthority:false});
 const metrics=engine.computeMatchMetrics(match);assert.equal(metrics.completed,0);assert.equal(metrics.teams[0].grossTotal,4);assert.equal(metrics.teams[0].netTotal,3);assert.equal(metrics.teams[1].grossTotal,4);assert.equal(metrics.teams[1].netTotal,4);
 engine.applyTeamGrossScore(match,2,18,4,{checkAuthority:false});assert.equal(engine.computeMatchMetrics(match).teams[1].netTotal,9);
});
test('shared metadata and independent hydration retain team format and unresolved pairs',()=>{
 const {engine,match}=seed();match.players[0].scores[0].gross=4;
 const payload=engine.buildCloudMatchPayload(match);assert.equal(payload.matchRow.course_snapshot.sharedMatchMeta.teamScoringPolicyVersion,1);
 const second=loadLiveEngine();second.seedState({players:[],courses:[],matches:[]});const hydrated=second.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players});
 assert.equal(hydrated.teamScoringPolicyVersion,1);assert.equal(second.getEffectivePlayInputMode(hydrated),'CLASSIC');
 hydrated.players[0].scores[0].gross=4;assert.equal(second.getScrambleTeamHoleScore(hydrated,1,1).inconsistent,true);
 const reload=second.seedState(plain({players:scrambleFixture().players,courses:[scrambleFixture().course],matches:[hydrated]})).matches[0];assert.equal(second.hasUnresolvedTeamScores(reload),true);
});
test('team-scored records and report entries suppress individual stats, signature and posting',()=>{
 const {engine,match}=seed();match.players.forEach(p=>p.scores.forEach(s=>s.gross=3));match.statTrackingEnabled=true;
 const metrics=engine.computeMatchMetrics(match),record=engine.buildRoundRecord(match,metrics),report=engine.buildLedgerEntryReportModel(match,metrics);
 assert.equal(record.meta.teamScored,true);assert.equal(record.meta.individualStatisticsEligible,false);assert.ok(record.players.every(p=>p.signatureStat===null&&p.postable===null&&p.scoreDistribution===null));assert.ok(record.events.every(e=>!['signature_score','blowup'].includes(e.type)));
 assert.deepEqual(plain(engine.computePlayerRoundInsights(match,metrics)),[]);assert.equal(report.players.length,4);assert.ok(report.players.every(p=>p.postable===null&&p.statistics===null));assert.equal(report.partnership,null);assert.match(engine.buildLedgerEntryFactsOnlyStory(record,match,metrics),/one shared-ball score/);
 match.status='complete';match.completedAt='2026-10-10T16:00:00Z';const frozen=engine.buildFrozenRoundRecord(match,metrics,match.completedAt);assert.equal(frozen.meta.teamScored,true);assert.equal(frozen.isFrozen,true);match.roundRecordSnapshot=frozen;const before=JSON.stringify(frozen);const reloaded=engine.seedState(plain({players:scrambleFixture().players,courses:[scrambleFixture().course],matches:[match]})).matches[0];assert.equal(JSON.stringify(reloaded.roundRecordSnapshot),before);assert.equal(engine.buildLedgerEntryReportModel(reloaded).players.length,4);
});
test('future policies, legacy individual input and misassignment fail without mutations',()=>{
 const {engine,match}=seed();match.teamScoringPolicyVersion=2;assert.equal(engine.computeMatchMetrics(match),null);assert.equal(engine.applyTeamGrossScore(match,1,1,4,{checkAuthority:false}).valid,false);
 match.teamScoringPolicyVersion=1;match.sharedPlayerAssignments.p1='jp';assert.equal(engine.applyTeamGrossScore(match,1,1,4,{checkAuthority:false}).valid,false);assert.equal(match.players[0].scores[0].gross,null);
});
test('paired outbox operations survive offline recovery, retry once and reject stale previous-scorer writes',async()=>{
 const {engine,match}=seed(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 engine.applyTeamGrossScore(match,1,1,4,{checkAuthority:false});
 for(const p of match.players.slice(0,2))engine.queueSharedScoreOperation(match,p.playerId,1,{participantId:'hp',deviceId:'host'},storage);
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,2);
 const pending=plain(engine.readSharedScoreOutbox(storage));const restored=new Map(values);values.clear();for(const [k,v] of restored)values.set(k,v);assert.deepEqual(plain(engine.readSharedScoreOutbox(storage)),pending);
 const offline=await engine.drainPendingSharedScoreOutboxes({storage,cloudAvailable:false,scheduleContinuation:false});assert.equal(offline.drained,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,2);
 let calls=0;await engine.drainPendingSharedScoreOutboxes({storage,cloudAvailable:true,scheduleContinuation:false,delivery:async current=>{calls++;const ids=engine.getSharedScoreOutboxOperations(current,storage).map(row=>row.operationId);engine.acknowledgeSharedScoreOperations(current,ids,storage);return {ok:true,skipped:false,pending:0};}});
 assert.equal(calls,1);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
 match.players.forEach(p=>match.sharedPlayerAssignments[p.playerId]=Number(p.team)<=2?'jp':'hp');assert.equal(engine.getScrambleSetupError(match,{assignments:true}),'');
 const decision=engine.resolveSharedScoreWrite(match,{playerId:'p0',holeNumber:1,gross:5,sourceParticipant:'jp',updatedAt:'2026-10-10T15:00:00Z'},{playerId:'p0',holeNumber:1,gross:4,sourceParticipant:'hp',updatedAt:'2026-10-10T16:00:00Z'});
 assert.equal(decision.action,'retain-local');
});
