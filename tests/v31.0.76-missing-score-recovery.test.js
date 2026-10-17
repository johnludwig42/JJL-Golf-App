import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const engine=loadLiveEngine(),data=scrambleFixture(),host=engine.getSharedDeviceId(),values=new Map();
 data.match.sharedHostDeviceId=host;data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;data.match.sharedMatchId='DYE-RECOVER';data.match.sharedScoreOutboxInitialized=true;
 data.match.selectedGames=[engine.normalizeFlamtanaConfig({scoringPolicyVersion:3,picks:Object.fromEntries(data.players.map(p=>[p.id,1]))})];
 data.match.players.forEach(p=>p.scores.forEach(s=>s.gross=p.team+2));
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 const rows=match.players.flatMap(p=>p.scores.filter(s=>!(p.team>=3&&s.holeNumber<=6)).map(s=>({player_id:p.playerId,hole_number:s.holeNumber,gross:s.gross,entry_status:'active'})));
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 return {engine,match,rows,storage,values};
}
test('24 missing cloud scores with an empty queue stage both partners without altering local facts',()=>{
 const {engine,match,rows,storage}=fixture(),before=JSON.stringify([match.players,match.selectedGames,match.courseSnapshot]);
 engine.queueSharedScoreOperation({id:'other',sharedMatchId:'other',storageMode:'shared'},'other-player',1,{participantId:'other',deviceId:'other'},storage);
 const other=JSON.stringify(engine.getSharedScoreOutboxOperations('other',storage));
 const plan=engine.buildMissingFlamtanaScoreRecoveryPlan(match,rows);assert.equal(plan.ok,true);assert.equal(plan.missingCount,24);assert.equal(plan.units.length,12);
 const queued=engine.queueMissingFlamtanaScoreRecovery(match,plan,{storage,save:()=>true});assert.equal(queued.ok,true);assert.equal(queued.queued,24);
 assert.equal(JSON.stringify([match.players,match.selectedGames,match.courseSnapshot]),before);
 assert.equal(JSON.stringify(engine.getSharedScoreOutboxOperations('other',storage)),other);
 const ops=engine.getSharedScoreOutboxOperations(match,storage);assert.equal(ops.length,24);
 const payload=engine.buildCloudMatchPayload(match);const operations=engine.buildPendingSharedScoreOperations(match,payload.scoreEntries,storage);
 assert.equal(operations.length,24);assert.ok(operations.every(op=>Number(op.score_entry.gross)>0));
 plan.units.forEach(unit=>assert.deepEqual(plain(ops.filter(op=>op.holeNumber===unit.hole&&unit.playerIds.includes(op.playerId)).map(op=>op.playerId).sort()),plain(unit.playerIds)));
 assert.equal(engine.queueMissingFlamtanaScoreRecovery(match,plan,{storage,save:()=>true}).ok,false);
});
test('Pending partners, conflicting or withdrawn cloud rows and non-host/finalized rounds cannot be repaired silently',()=>{
 for(const kind of ['pending','conflict','withdrawn','remote','frozen']){
  const {engine,match,rows}=fixture();
  if(kind==='pending')match.players[5].scores[0].gross=12;
  if(kind==='conflict')rows.push({player_id:'p4',hole_number:1,gross:12,entry_status:'active'});
  if(kind==='withdrawn')rows.push({player_id:'p4',hole_number:1,gross:5,entry_status:'voided'});
  if(kind==='remote')match.sharedHostDeviceId='other';
  if(kind==='frozen'){match.status='complete';match.completedAt='2026-10-17T20:00:00Z';match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));}
  const before=JSON.stringify([match.players,match.courseSnapshot,match.selectedGames,match.roundRecordSnapshot]);assert.equal(engine.buildMissingFlamtanaScoreRecoveryPlan(match,rows).ok,false,kind);assert.equal(JSON.stringify([match.players,match.courseSnapshot,match.selectedGames,match.roundRecordSnapshot]),before);
 }
});
test('changed local scores or failed durable saves do not create recovery operations or lose existing queued rounds',()=>{
 for(const kind of ['changed','save-failed','outbox-failed']){
  const {engine,match,rows,storage,values}=fixture(),plan=engine.buildMissingFlamtanaScoreRecoveryPlan(match,rows);
  if(kind==='changed')match.players.slice(4,6).forEach(p=>p.scores[0].gross=7);
  const before=JSON.stringify([match.players,match.sharedScoreWriteState,match.sharedHostScoreOverrides]);
  const failing=kind==='outbox-failed'?{getItem:storage.getItem,setItem:()=>{throw new DOMException('Full','QuotaExceededError');}}:storage;
  const result=engine.queueMissingFlamtanaScoreRecovery(match,plan,{storage:failing,save:()=>kind!=='save-failed'});
  assert.equal(result.ok,false,kind);assert.equal(values.size,0);assert.equal(JSON.stringify([match.players,match.sharedScoreWriteState,match.sharedHostScoreOverrides]),before);
 }
});

test('host takeover after Start permits recovery and scoring while a fresh all-host setup still requires two devices',()=>{
 const {engine,match,rows}=fixture();
 match.sharedPlayerAssignments=Object.fromEntries(match.players.map(p=>[p.playerId,match.sharedHostParticipantId]));delete match.sharedPlayerAssignmentState;
 assert.equal(engine.getScrambleSetupError(match,{assignments:true}),'');
 assert.equal(engine.buildMissingFlamtanaScoreRecoveryPlan(match,rows).ok,true);
 assert.equal(engine.applyTeamGrossScore(match,4,18,7).valid,true);
 match.sharedPlayerAssignments=Object.fromEntries(match.players.map(p=>[p.playerId,'jp']));delete match.sharedPlayerAssignmentState;
 assert.match(engine.getScrambleSetupError(match,{assignments:true}),/second device before Start/);
 match.sharedPlayerAssignments=Object.fromEntries(match.players.map(p=>[p.playerId,match.sharedHostParticipantId]));delete match.sharedPlayerAssignmentState;
 match.roundTiming.startedAt=null;
 assert.match(engine.getScrambleSetupError(match,{assignments:true}),/second device before Start/);
 assert.equal(engine.buildMissingFlamtanaScoreRecoveryPlan(match,rows).ok,false);
 assert.equal(engine.applyTeamGrossScore(match,4,18,8).valid,false);
});

test('host removal zeros only the selected competition and survives hydration and remote metadata',()=>{
 for(const key of ['featured','group1','group2','foursome','calcutta']){
  const {engine,match}=fixture();match.roundRecapGenerated='Keep this story';
  const before=engine.computeFlamtanaResults(match,null,{finalize:true}),scores=JSON.stringify(match.players),config=plain(match.selectedGames[0]);
  assert.equal(engine.removeFlamtanaCompetition(match,key,{save:()=>true}).ok,true);
  const after=engine.computeFlamtanaResults(match,null,{finalize:true});assert.equal(after.valid,true);
  after.components.forEach(component=>{if(component.key===key){assert.equal(component.enabled,false);assert.ok(Object.values(component.amounts).every(value=>value===0));}else assert.equal(JSON.stringify(component),JSON.stringify(before.components.find(row=>row.key===component.key)));});
  assert.equal(JSON.stringify(match.players),scores);assert.equal(match.roundRecapGenerated,'Keep this story');
  assert.deepEqual(plain(match.selectedGames[0]),{...config,[key+'Enabled']:false});
  const remote=plain(match);remote.sharedHostDeviceId='another-host';remote.selectedGames=[config];
  assert.equal(engine.applySharedScrambleSetupMetadata(remote,{flamtanaConfig:match.selectedGames[0]}),true);assert.equal(remote.selectedGames[0][key+'Enabled'],false);
  const reloaded=engine.seedState({matches:[plain(match)]}).matches[0];assert.equal(reloaded.selectedGames[0][key+'Enabled'],false);
 }
});

test('removal rejects remote, frozen, unsupported, unknown and last-game requests and rolls back failed storage',()=>{
 for(const kind of ['remote','frozen','legacy','unknown','last','save']){
  const {engine,match}=fixture();
  if(kind==='remote')match.sharedHostDeviceId='other';
  if(kind==='frozen'){match.status='complete';match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));}
  if(kind==='legacy')match.selectedGames[0].scoringPolicyVersion=2;
  if(kind==='last')for(const key of ['group1','group2','foursome','calcutta'])match.selectedGames[0][key+'Enabled']=false;
  const before=JSON.stringify(match);assert.equal(engine.removeFlamtanaCompetition(match,kind==='unknown'?'bad':'featured',{save:()=>kind!=='save'}).ok,false,kind);assert.equal(JSON.stringify(match),before,kind);
 }
});
