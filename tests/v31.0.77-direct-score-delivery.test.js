import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,plain} from './support/shared-delivery-fixture.js';
function directFixture(count=8){
 const data=fixture(count,{rpcModel:false});data.requests=[];data.upserts=[];data.ledgerAccess=0;
 data.client.rpc=async(name,args)=>{data.requests.push(plain(args));return {error:{code:'PGRST202',message:'Function is missing from the schema cache'}};};
 data.client.from=table=>{assert.equal(table,'score_entries','direct path must not read the RPC operation ledger');return {upsert:async(rows,options)=>{data.upserts.push(plain(rows));assert.equal(options.onConflict,'id');return {error:null};}};};
 return data;
}
for(const [count,writes]of [[8,72],[8,144],[32,576]])test(`DIRECT deployed-contract model sends ${writes} rows without RPC chunks or operation receipts`,async()=>{
 const data=directFixture(count),{engine,match,storage,client,queue}=data;queue(writes===72?match.players.slice(0,4):match.players);
 const result=await engine.submitPendingSharedScoreOperations(client,match,[],{storage,batchLimit:2});
 assert.equal(result.fallback,true);assert.equal(result.acknowledged,writes);assert.equal(data.upserts.length,1);assert.equal(data.upserts[0].length,writes);
 assert.equal(data.requests.length,1);assert.equal(data.requests[0].p_operations.length,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
 assert.equal(match.sharedScoreDeliveryTransport.kind,'direct');assert.ok(match.sharedSyncDiagnostics.some(row=>row.reasonCode==='SHARED_TRANSPORT_DOWNGRADED'));
 assert.equal(match.sharedLedgerParity?.parityConfirmed===true,false,'HTTP upsert acknowledgement is not card parity');
});

test('DIRECT payloads preserve current-row behavior rather than replaying RPC snapshots',async()=>{
 const data=directFixture(),{engine,match,storage,client}=data;engine.stampSharedScoreWrite(match,'p0',1,{storage});const original=plain(engine.getSharedScoreOutboxOperations(match,storage)[0]);
 match.players[0].scores[0].gross=5;
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});assert.equal(original.scoreEntry.gross,4);assert.equal(data.upserts[0][0].gross,5);
});

test('DIRECT lost-response retry has row-key upsert semantics, not server operation-id idempotency',async()=>{
 const data=directFixture(),{engine,match,storage,client}=data,server=new Map();engine.stampSharedScoreWrite(match,'p0',1,{storage});let calls=0;
 client.from=()=>({upsert:async rows=>{data.upserts.push(plain(rows));rows.forEach(row=>server.set(row.id,plain(row)));return ++calls===1?{error:{status:503,message:'Response lost after row commit'}}:{error:null};}});
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);engine.saveSharedDeliveryRetry(match,{nextRetryAt:null},storage);
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});assert.equal(server.size,1);assert.equal(data.upserts[0][0].id,data.upserts[1][0].id);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
});

test('DIRECT 401 refreshes once; failed refresh preserves queued scores and account identity',async()=>{
 for(const failed of [false,true]){
  const data=directFixture(),{engine,match,storage,client}=data;engine.stampSharedScoreWrite(match,'p0',1,{storage});let calls=0,refreshes=0,anonymous=0;
  client.from=()=>({upsert:async()=>++calls===1?{error:{status:401,message:'Invalid credentials'}}:{error:null}});
  client.auth.refreshSession=async()=>{refreshes++;return failed?{error:{code:'refresh_token_not_found',message:'Sign in required'}}:{data:{session:{user:{id:'same-user'}}}};};client.auth.signInAnonymously=async()=>{anonymous++;};
  const task=engine.submitPendingSharedScoreOperations(client,match,[],{storage});if(failed)await assert.rejects(task);else await task;
  assert.equal(refreshes,1);assert.equal(calls,failed?1:2);assert.equal(anonymous,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,failed?1:0);
 }
});

test('DIRECT RLS denial is visible and bounded; a later due retry is not silently abandoned',async()=>{
 const {engine,match,storage,client}=directFixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});let calls=0;
 client.from=()=>({upsert:async()=>{calls++;return {error:{code:'42501',message:'Row-level security denied'}};}});
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));assert.equal(engine.getSharedDeliveryRetry(match,storage).category,'needs-action');
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}),/next retry/);assert.equal(calls,1);engine.saveSharedDeliveryRetry(match,{nextRetryAt:null},storage);
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));assert.equal(calls,2);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);
});

test('RPC errors other than PGRST202 never downgrade to a direct write',async()=>{
 for(const error of [{code:'42501',message:'Permission denied in submit_shared_score_operations'},{code:'22023',message:'Invalid input'},{status:503,message:'Unavailable'}]){
  const data=directFixture(),{engine,match,storage,client}=data;engine.stampSharedScoreWrite(match,'p0',1,{storage});client.rpc=async()=>({error});
  await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));assert.equal(data.upserts.length,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);
 }
});

test('DIRECT storage failure prevents request and preserves original queue; empty queue cannot repair missing cloud rows',async()=>{
 const data=directFixture(),{engine,match,storage,client}=data;match.sharedLedgerParity={parityConfirmed:false,missingRemote:[{playerId:'p0',holeNumber:1}]};
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});assert.equal(data.requests.length,0);assert.equal(data.upserts.length,0);
 engine.stampSharedScoreWrite(match,'p0',1,{storage});const failing={getItem:storage.getItem,setItem:()=>{throw new Error('Full');}};
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage:failing}));assert.equal(data.upserts.length,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);
});

test('DIRECT reload retains backoff and a later eligible retry uses the existing table path',async()=>{
 const data=directFixture(),{engine,match,storage,client}=data;engine.stampSharedScoreWrite(match,'p0',1,{storage});client.from=()=>({upsert:async()=>({error:{status:503,message:'Unavailable'}})});
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));
 const {loadLiveEngine}=await import('../scripts/live-engine-adapter.js');const reloaded=loadLiveEngine(undefined,{storageEntries:[['the-dye-ledger-shared-device-id',engine.getSharedDeviceId()]]});
 assert.equal(reloaded.canAttemptSharedDelivery(match,{storage}),false);const calls=data.requests.length;await assert.rejects(reloaded.submitPendingSharedScoreOperations(client,match,[],{storage}),/next retry/);assert.equal(data.requests.length,calls);
});

test('DIRECT assignment change holds pending intent instead of acknowledging an ineligible row',async()=>{
 const data=directFixture(),{engine,match,storage,client}=data;engine.stampSharedScoreWrite(match,'p0',1,{storage});match.sharedHostDeviceId='other';match.sharedPlayerAssignments.p0='jp';delete match.sharedPlayerAssignmentState;
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}),/assignment/i);assert.equal(data.upserts.length,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);
});

test('DIRECT storage-failed enqueue retains a recoverable intent in the saved working round',async()=>{
 const data=directFixture(),{engine,match,storage,client}=data;
 const failing={getItem:storage.getItem,setItem:()=>{throw new Error('Full');}};
 engine.stampSharedScoreWrite(match,'p0',1,{storage:failing});assert.ok(match.sharedScoreQueueRecovery);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});assert.equal(data.upserts.length,1);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);assert.equal(match.sharedScoreQueueRecovery,undefined);
});


test('DIRECT retry-record storage failure retains intent and bounds the next attempt',async()=>{
 const {engine,match,storage,client}=directFixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});
 const failing={getItem:storage.getItem,setItem:()=>{throw new Error('Full');}};
 client.from=()=>({upsert:async()=>({error:{status:503,message:'Unavailable'}})});
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage:failing}),error=>error.code==='LOCAL_SAVE_FAILED');
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);
 assert.equal(engine.canAttemptSharedDelivery(match,{storage:failing}),false);
 assert.equal(engine.getSharedDeliveryRetry(match,failing).code,'LOCAL_SAVE_FAILED');
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage:failing}),error=>error.code==='SHARED_BACKOFF');
});

