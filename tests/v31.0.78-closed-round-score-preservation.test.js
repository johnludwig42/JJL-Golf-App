import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,plain,memory} from './support/shared-delivery-fixture.js';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';

for(const transport of ['rpc','direct'])test(`${transport.toUpperCase()} closed-match rejection drains to durable host review, never retry failure`,async()=>{
 const {engine,match,storage,client,queue}=fixture(8,{rpcModel:transport==='rpc'});
 queue();const before=plain(engine.getSharedScoreOutboxOperations(match,storage));let calls=0;
 if(transport==='rpc')client.rpc=async()=>{calls++;return {error:{code:'P7701',message:'HOST_COMPLETED_WITH_LOCAL_SCORES'}};};
 else {
  client.rpc=async()=>({error:{code:'PGRST202'}});
  client.from=()=>({upsert:async()=>{calls++;return {error:{code:'P7701',message:'HOST_COMPLETED_WITH_LOCAL_SCORES'}};}});
 }
 const result=await engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 assert.equal(result.outcome,'complete-with-exceptions');assert.equal(result.acknowledged,0);
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
 const reviews=plain(engine.getSharedScoresPreservedForHostReview(match,storage));assert.equal(reviews.length,144);
 assert.deepEqual(reviews.map(op=>op.operationId),before.map(op=>op.operationId));
 assert.ok(reviews.every(op=>op.localScoreEntry.gross===4 && op.serverCode==='P7701'));
 assert.equal(engine.getSharedDeliveryRetry(match,storage).category,'ready');
 assert.equal(match.remoteCompletionPending.reasonCode,'HOST_COMPLETED_WITH_LOCAL_SCORES');
 // A reload needs only durable storage, not the mutable match marker.
 const reloaded=loadLiveEngine();assert.equal(reloaded.getSharedScoresPreservedForHostReview(match,storage).length,144);
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});assert.equal(calls,1,'closed delivery is not retried');
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,144,'preservation is idempotent');
});

test('closed preservation failure retains every operation and succeeds after storage recovers',async()=>{
 const {engine,match,storage,client}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});
 const before=plain(engine.getSharedScoreOutboxOperations(match,storage));
 const set=storage.setItem;storage.setItem=(key,value)=>{if(String(value).includes('"serverCode":"P7701"'))throw new Error('Quota exceeded');set(key,value);};
 client.rpc=async()=>({error:{code:'P7701'}});
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));
 assert.deepEqual(plain(engine.getSharedScoreOutboxOperations(match,storage)).map(op=>op.operationId),before.map(op=>op.operationId));
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,0);
 storage.setItem=set;engine.saveSharedDeliveryRetry(match,{nextRetryAt:null},storage);
 assert.equal((await engine.submitPendingSharedScoreOperations(client,match,[],{storage})).outcome,'complete-with-exceptions');
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
});

test('a correction queued during a closed response is preserved along with unattempted batches',async()=>{
 const {engine,match,storage,client,queue}=fixture();queue();let calls=0;
 client.rpc=async()=>{calls++;match.players[0].scores[0].gross=7;engine.stampSharedScoreWrite(match,'p0',1,{storage});return {error:{code:'P7701'}};};
 const result=await engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 assert.equal(calls,1);assert.equal(result.preserved,144);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).find(op=>op.playerId==='p0' && op.holeNumber===1).localScoreEntry.gross,7);
});

test('preservation is match-scoped and later outbox writes retain review evidence',()=>{
 const {engine,match,storage}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});
 const other={...match,id:'OTHER',sharedMatchId:'DYE-OTHER'};engine.stampSharedScoreWrite(other,'p1',1,{storage});
 engine.preserveClosedSharedScoreOperations(match,storage);
 assert.equal(engine.getSharedScoreOutboxOperations(other,storage).length,1);
 engine.stampSharedScoreWrite(other,'p1',2,{storage});
 engine.acknowledgeSharedScoreOperations(other,engine.getSharedScoreOutboxOperations(other,storage).map(op=>op.operationId),storage);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,1);
 const empty=memory();assert.equal(engine.getSharedScoresPreservedForHostReview(match,empty).length,0);
});

test('reload renders complete-with-exceptions and reports preserved count without leaking scores',()=>{
 const {engine,match,storage}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});
 engine.preserveClosedSharedScoreOperations(match,storage);
 const reloaded=loadLiveEngine(undefined,{storageEntries:[...storage.values]});
 const cleanMatch=plain(match);delete cleanMatch.sharedDeliveryOutcome;delete cleanMatch.remoteCompletionPending;
 const status=reloaded.getSharedSyncStatus(cleanMatch);
 assert.equal(status.state,'complete-with-exceptions');assert.equal(status.pending,0);
 assert.equal(reloaded.canEditPlayerScore(cleanMatch,1,'p0'),false,'durable closure remains read-only even if the marker was not saved');
 cleanMatch.sharedLedgerParity={parityConfirmed:true}; // primary state may predate the atomic outbox move after a crash.
 const report=reloaded.getLocalSharedDeliveryReport(cleanMatch);
 assert.equal(report.preservedCount,1);assert.equal(report.pendingWrites,0);
 assert.equal(report.parity,'not-confirmed');
 const payload=reloaded.getSharedDeviceLabelPayload(cleanMatch);
 assert.ok(payload.length<=500);assert.equal(reloaded.normalizeSharedDeliveryReport(JSON.parse(payload).delivery).preservedCount,1);
 assert.equal(payload.includes('localScoreEntry'),false);
});

test('known remote completion preserves without contacting auth or the server',async()=>{
 const {engine,match,storage,client}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});
 match.remoteCompletionPending={completedAt:new Date().toISOString()};
 client.auth.getSession=()=>{throw new Error('must not contact auth');};client.rpc=()=>{throw new Error('must not deliver');};
 assert.equal((await engine.submitPendingSharedScoreOperations(client,match,[],{storage})).outcome,'complete-with-exceptions');
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
});

test('RPC progress acknowledged before completion stays acknowledged; only remaining batches enter review',async()=>{
 const {engine,match,storage,client,queue}=fixture();queue();let calls=0;
 client.rpc=async(name,args)=>++calls===1?{data:args.p_operations.map(op=>({operation_id:op.operation_id,match_revision:1}))}:{error:{code:'P7701'}};
 const result=await engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 assert.equal(result.acknowledged,64);assert.equal(result.preserved,80);assert.equal(result.outcome,'complete-with-exceptions');
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,80);
});
