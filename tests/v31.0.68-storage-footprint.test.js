import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {completedFixture} from './support/storage-footprint-fixture.js';
const plain=value=>JSON.parse(JSON.stringify(value));
const primary='the-dye-ledger-v20';
function store(value,limit=Infinity){
 const rows=new Map([[primary,JSON.stringify(value)]]);
 return {get length(){return rows.size;},key:i=>[...rows.keys()][i],getItem:key=>rows.get(key)??null,removeItem:key=>rows.delete(key),setItem(key,value){
  const size=[...rows].filter(([name])=>name!==key).reduce((sum,[,text])=>sum+text.length,0)+value.length;
  if(size>limit)throw Object.assign(new Error('full'),{name:'QuotaExceededError'});
  rows.set(key,value);
 }};
}

test('team round has no stats through Play initialization, freezing, reporting and cloud hydration',()=>{
 const engine=loadLiveEngine(),{match,finished}=completedFixture(engine);
 engine.ensurePlayInputState(match);
 assert.ok(match.players.every(player=>!Object.hasOwn(player,'stats')));
 assert.ok(finished.players.every(player=>!Object.hasOwn(player,'stats')));
 assert.equal(finished.sharedSyncDiagnostics.length,5);
 assert.equal(finished.roundRecordSnapshot.isFrozen,true);
 assert.equal(engine.buildLedgerEntryReportModel(finished).games.length,5);
 const payload=engine.buildCloudMatchPayload(match),reader=loadLiveEngine();reader.seedState({players:[],courses:[],matches:[]});
 const joined=reader.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players,scoreEntries:match.players.flatMap(player=>player.scores.map(score=>({player_id:player.playerId,hole_number:score.holeNumber,gross:score.gross})))});
 assert.ok(joined.players.every(player=>!Object.hasOwn(player,'stats')));
});
test('disabled individual stats materialize when enabled mid-round and preserve existing recorded rows',()=>{
 const engine=loadLiveEngine(),data=scrambleFixture();data.match.teamScoringPolicyVersion=0;data.match.statTrackingEnabled=false;
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 engine.ensurePlayInputState(match);assert.equal(match.players[0].stats,undefined);
 match.statTrackingEnabled=true;assert.equal(engine.materializeMatchStats(match),true);assert.equal(match.players[0].stats.length,18);
 match.players[0].stats[8].putts=1;match.players[0].stats[8].puttsSource='user';
 assert.equal(engine.materializeMatchStats(match),false);assert.equal(match.players[0].stats[8].putts,1);
});
test('tracked individual statistics, settlements and report survive saved-state compaction identically',()=>{
 const engine=loadLiveEngine(),{finished}=completedFixture(engine,{tracked:true,diagnostics:false}),before=JSON.stringify(finished);
 const report=plain(engine.buildLedgerEntryReportModel(finished));
 assert.equal(finished.roundRecordSnapshot.isFrozen,true);
 assert.equal(engine.compactUnusedMatchStats(finished),false);assert.equal(JSON.stringify(finished),before);
 const saved=store({matches:[finished]});const loaded=engine.loadStateFromStorage(saved).matches[0];
 assert.deepEqual(plain(engine.buildLedgerEntryReportModel(loaded)),report);
 assert.ok(loaded.players.every(player=>player.stats[0].putts===1&&player.stats[0].entryCompleted));
});
test('any changed, missing or unknown stat field blocks compaction of all players, without coercion',()=>{
 const engine=loadLiveEngine();
 for(const mutate of [row=>row.putts=1,row=>row.puttsSource='user',row=>row.entryCompleted=true,row=>row.futureFlag=false,row=>delete row.greenOverride,row=>row.putts='2',row=>row.penaltyStrokes=1]){
  const match={holeCount:18,statTrackingEnabled:false,players:[{stats:plain(engine.buildEmptyStats())},{stats:plain(engine.buildEmptyStats())}]};
  mutate(match.players[1].stats[2]);const before=JSON.stringify(match);assert.equal(engine.compactUnusedMatchStats(match),false);assert.equal(JSON.stringify(match),before);
 }
});
test('pre-release default arrays compact durably on load, idempotently, with frozen evidence and report unchanged',()=>{
 const engine=loadLiveEngine(),{finished}=completedFixture(engine),report=plain(engine.buildLedgerEntryReportModel(finished));
 finished.players.forEach(player=>player.stats=plain(engine.buildEmptyStats()));
 finished.sharedSyncDiagnostics=Array.from({length:200},(_,i)=>({reasonCode:'REMOTE_SCORE_ACCEPTED',i}));
 const frozen=JSON.stringify(finished.roundRecordSnapshot),saved=store({matches:[finished]});
 const loaded=engine.loadStateFromStorage(saved),first=saved.getItem(primary);
 assert.ok(loaded.matches[0].players.every(player=>!Object.hasOwn(player,'stats')));
 assert.equal(loaded.matches[0].sharedSyncDiagnostics.length,5);
 assert.equal(JSON.stringify(loaded.matches[0].roundRecordSnapshot),frozen);
 assert.deepEqual(plain(engine.buildLedgerEntryReportModel(loaded.matches[0])),report);
 engine.loadStateFromStorage(saved);assert.equal(saved.getItem(primary),first);
});
test('active or unverified freeze keeps sync diagnostics; frozen load eviction preserves evidence',()=>{
 const engine=loadLiveEngine(),{match}=completedFixture(engine);
 const before=JSON.stringify(match.sharedSyncDiagnostics);assert.equal(engine.evictFrozenMatchSyncDiagnostics(match),false);
 match.status='complete';match.completedAt='2026-10-11T17:00:00Z';match.sharedLedgerParity={parityConfirmed:false};
 engine.freezeRoundRecordIfEligible(match);assert.equal(JSON.stringify(match.sharedSyncDiagnostics),before);
 const frozen=JSON.stringify(match.roundRecordSnapshot);assert.equal(engine.evictFrozenMatchSyncDiagnostics(match),true);assert.equal(JSON.stringify(match.roundRecordSnapshot),frozen);
});
test('compaction can recover full storage while failed writes preserve prior primary; quota remedy is explicit',()=>{
 const engine=loadLiveEngine(),match={holeCount:18,statTrackingEnabled:false,players:[{stats:plain(engine.buildEmptyStats())}]},snapshot={matches:[match]};
 const saved=store(snapshot,JSON.stringify(snapshot).length);engine.loadStateFromStorage(saved);
 assert.equal(JSON.parse(saved.getItem(primary)).matches[0].players[0].stats,undefined);
 const prior=saved.getItem(primary),result=engine.persistStateSnapshot({matches:[{text:'x'.repeat(10000)}]},saved);
 assert.equal(result.ok,false);assert.equal(saved.getItem(primary),prior);
 const message=engine.getLocalSaveFailureMessage(result.errorMessage);assert.match(message,/storage.*full/i);assert.match(message,/Library/);assert.doesNotMatch(message,/try again/i);
 assert.doesNotMatch(engine.getLocalSaveFailureMessage('Storage blocked'),/storage.*full/i);
});
test('usage counts primary, backup and other keys and ranks round contributors',()=>{
 const engine=loadLiveEngine(),snapshot={matches:[{id:'small'},{id:'large',text:'x'.repeat(100)}]},saved=store(snapshot);
 saved.setItem(primary+':last-known-good',saved.getItem(primary));
 const usage=engine.getLocalStorageUsage(saved,snapshot);assert.equal(usage.roundCount,2);assert.equal(usage.largestRounds[0].name,'large');
 assert.equal(usage.bytes,[primary,primary+':last-known-good'].reduce((sum,key)=>sum+2*(key.length+saved.getItem(key).length),0));
});
