import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {fixture,plain} from './support/shared-delivery-fixture.js';

// The limits here model the repository RPC, not the still-unverified production API.
for(const [count,writes]of [[8,72],[8,144],[32,576]])test(`RPC model drains ${writes} writes with bounded acknowledgements and intact pairs`,async()=>{
 const {engine,match,storage,client,queue}=fixture(count);queue(writes===72?match.players.slice(0,4):match.players);const batches=[];
 client.rpc=async(name,args)=>{const rows=args.p_operations;batches.push(plain(rows));assert.ok(rows.length<=64);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,writes-batches.slice(0,-1).reduce((n,b)=>n+b.length,0));return {data:rows.map(op=>({operation_id:op.operation_id}))};};
 const result=await engine.submitPendingSharedScoreOperations(client,match,[],{storage,batchLimit:64});assert.equal(result.acknowledged,writes);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
 if(count===8){for(const batch of batches)for(const row of batch){const team=match.players.find(p=>p.playerId===row.score_entry.player_id).team;assert.equal(batch.filter(other=>other.score_entry.hole_number===row.score_entry.hole_number&&match.players.find(p=>p.playerId===other.score_entry.player_id).team===team).length,2);}}
});

test('later batch failure retains earlier acknowledgements and reload preserves bounded backoff',async()=>{
 const {engine,match,storage,client,queue}=fixture();queue();let calls=0;client.rpc=async(name,args)=>++calls===2?{error:{status:503,message:'Unavailable'}}:{data:args.p_operations.map(op=>({operation_id:op.operation_id}))};
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage,batchLimit:64}));assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,80);
 const retry=plain(engine.getSharedDeliveryRetry(match,storage));assert.equal(retry.category,'temporary');assert.ok(retry.lastProgressAt);assert.equal(engine.canAttemptSharedDelivery(match,{storage}),false);
 const reloaded=loadLiveEngine(undefined,{storageEntries:[['the-dye-ledger-shared-device-id',engine.getSharedDeviceId()]]});assert.equal(reloaded.getSharedDeviceId(),engine.getSharedDeviceId());assert.deepEqual(plain(reloaded.getSharedDeliveryRetry(match,storage)),retry);
 queue(match.players.slice(0,1));assert.equal(engine.canAttemptSharedDelivery(match,{storage}),false,'new score cannot reset backoff');
});

test('lost acknowledgement retries the same payload; a correction has a different operation id',async()=>{
 const {engine,match,storage,client}=fixture(),receipts=new Map();engine.stampSharedScoreWrite(match,'p0',1,{storage});const sent=[];let calls=0;
 client.rpc=async(name,args)=>{const row=args.p_operations[0],payload=JSON.stringify(row.score_entry);sent.push(plain(row));if(receipts.has(row.operation_id))assert.equal(payload,receipts.get(row.operation_id));else receipts.set(row.operation_id,payload);return ++calls===1?{error:{status:503,message:'Response lost after commit'}}:{data:[{operation_id:row.operation_id}]};};
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage,batchLimit:64}));engine.saveSharedDeliveryRetry(match,{nextRetryAt:null},storage);
 const changed=[{player_id:'p0',hole_number:1,gross:20,updated_at:'2099-01-01'}];await engine.submitPendingSharedScoreOperations(client,match,changed,{storage,batchLimit:64});assert.equal(JSON.stringify(sent[0]),JSON.stringify(sent[1]));
 match.players[0].scores[0].gross=5;const correction=engine.stampSharedScoreWrite(match,'p0',1,{storage});assert.notEqual(engine.getSharedScoreOutboxOperations(match,storage)[0].operationId,sent[0].operation_id);assert.ok(correction);
});

test('401 refreshes once and retries; a failed refresh retains every queued operation',async()=>{
 for(const failure of [false,true]){
  const {engine,match,storage,client}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});let refreshes=0,calls=0;
  client.auth.refreshSession=async()=>{refreshes++;return failure?{error:{code:'refresh_token_not_found',message:'Sign in required'}}:{data:{session:{user:{id:'same-user'}}}};};
  client.rpc=async(name,args)=>++calls===1?{error:{code:'PGRST301',message:'JWT invalid'}}:{data:args.p_operations.map(op=>({operation_id:op.operation_id}))};
  const task=engine.submitPendingSharedScoreOperations(client,match,[],{storage,batchLimit:64});if(failure)await assert.rejects(task);else await task;
  assert.equal(refreshes,1);assert.equal(calls,failure?1:2);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,failure?1:0);if(failure)assert.equal(engine.getSharedDeliveryRetry(match,storage).category,'sign-in');
 }
});

test('assignment changes retain ineligible payloads and immediately reconsider permission backoff',async()=>{
 const {engine,match,storage,client}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});match.sharedHostDeviceId='other';match.sharedPlayerAssignments.p0='jp';delete match.sharedPlayerAssignmentState;
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage,batchLimit:64}),/assignment/i);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);assert.equal(engine.canAttemptSharedDelivery(match,{storage}),false);
 match.sharedPlayerAssignments.p0='hp';delete match.sharedPlayerAssignmentState;assert.equal(engine.canAttemptSharedDelivery(match,{storage}),true);
});

test('unacknowledged operations are never truncated across matches and storage failure prevents delivery',async()=>{
 const {engine,match,storage,client}=fixture();for(let i=0;i<1100;i++)engine.queueSharedScoreOperation({id:'other-'+i,storageMode:'shared'},'p',1,{},storage);engine.stampSharedScoreWrite(match,'p0',1,{storage});assert.equal(engine.readSharedScoreOutbox(storage).operations.length,1101);
 let calls=0;client.rpc=async()=>{calls++;};const failing={getItem:storage.getItem,setItem:()=>{throw new Error('Full');}};
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage:failing,batchLimit:64}));assert.equal(calls,0);assert.equal(engine.readSharedScoreOutbox(storage).operations.length,1101);
});

test('stale device reports cannot claim current parity; heartbeat contact does not imply acknowledgement',()=>{
 const {engine,match}=fixture(),now=Date.now(),remote={deviceId:'remote',lastSeenAt:new Date(now).toISOString(),deliveryReport:{reportedAt:new Date(now).toISOString(),pendingHoles:7,pendingWrites:28,retry:'temporary',parity:'not-confirmed'}};
 const live=engine.buildSharedDeviceDeliveryStatus(match,remote,{now});assert.match(live,/pending holes: 7/);assert.match(live,/acknowledgement: not confirmed/);assert.match(live,/Retry scheduled/);
 remote.deliveryReport.parity='confirmed';const stale=engine.buildSharedDeviceDeliveryStatus(match,remote,{now:now+180000});assert.match(stale,/Out of contact/);assert.match(stale,/pending holes: unknown/);assert.match(stale,/parity: not currently confirmed/);
});

test('empty outbox does not recreate cloud-missing scores and bounded requests time out',async()=>{
 const {engine,match,storage}=fixture();match.sharedLedgerParity={parityConfirmed:false,missingRemote:[{playerId:'p0',holeNumber:1}]};assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);assert.equal(engine.getLocalSharedDeliveryReport(match,{storage}).parity,'not-confirmed');
 await assert.rejects(engine.sharedDeliveryRequest(new Promise(()=>{}),{timeoutMs:10}),/timed out/);
});

test('a hung match does not prevent the next match from delivering',async()=>{
 const {engine,match,storage}=fixture(),other={...match,id:'second',sharedMatchId:'DYE-SECOND'};
 engine.stampSharedScoreWrite(match,'p0',1,{storage});engine.stampSharedScoreWrite(other,'p0',1,{storage});
 const result=await engine.drainPendingSharedScoreOutboxes({matches:[match,other],storage,cloudAvailable:true,scheduleContinuation:false,delivery:async current=>{
  if(current.id===match.id)return engine.sharedDeliveryRequest(new Promise(()=>{}),{timeoutMs:10});
  const ids=engine.getSharedScoreOutboxOperations(current,storage).map(row=>row.operationId);engine.acknowledgeSharedScoreOperations(current,ids,storage);return {ok:true,pending:0};
 }});
 assert.equal(result.drained,1);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,1);assert.equal(engine.getSharedScoreOutboxOperations(other,storage).length,0);
});

test('concurrent delivery paths and forced token refreshes each share one in-flight operation',async()=>{
 const {engine,match,storage,client}=fixture();let deliveries=0,refreshes=0;
 const operation=async()=>{deliveries++;await new Promise(resolve=>setTimeout(resolve,10));return 'done';};
 const results=await Promise.all([engine.runSharedDelivery(match,operation,{storage}),engine.runSharedDelivery(match,operation,{storage})]);assert.deepEqual(results,['done','done']);assert.equal(deliveries,1);
 client.auth.refreshSession=async()=>{refreshes++;await new Promise(resolve=>setTimeout(resolve,10));return {data:{session:{user:{id:'same-user'}}}};};
 await Promise.all([engine.ensureSharedSessionReady({client,refresh:true}),engine.ensureSharedSessionReady({client,refresh:true})]);assert.equal(refreshes,1);
});

test('session failure never creates a replacement anonymous identity',async()=>{
 const {engine,client}=fixture();let anonymous=0;
 client.auth.getSession=async()=>({error:{code:'PGRST301',message:'Invalid JWT'}});client.auth.refreshSession=async()=>({error:{code:'refresh_token_not_found',message:'Sign in'}});client.auth.signInAnonymously=async()=>{anonymous++;};
 await assert.rejects(engine.ensureSharedSessionReady({client}));assert.equal(anonymous,0);
});

test('COMMON device telemetry remains parseable within the admission RPC 500-character limit',()=>{
 const {engine,match,storage}=fixture();engine.stampSharedScoreWrite(match,'p0',1,{storage});match.sharedScoreDeliveryTransport={kind:'direct'};
 match.sharedDevices[0].name='Flag 🚩 '.repeat(100);match.sharedParticipants[0].deviceName='Flag 🚩 '.repeat(100);
 const encoded=engine.getSharedDeviceLabelPayload(match),parsed=JSON.parse(encoded);assert.ok(encoded.length<=500);assert.equal(parsed.sharedDeviceId,engine.getSharedDeviceId());
 const report=engine.normalizeSharedDeliveryReport(parsed.delivery);assert.equal(report.transport,'direct');assert.equal(report.parity,'not-confirmed');assert.equal(typeof report.reportedAt,'string');
});
