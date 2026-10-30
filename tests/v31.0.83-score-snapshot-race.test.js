import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,plain} from './support/shared-delivery-fixture.js';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function setup(){
 const data=fixture(8,{rpcModel:false}),{match,client}=data;
 match.sharedScoreDeliveryTransport={kind:'direct'};
 for(const p of match.players.slice(6))p.scores[1].gross=null;
 const entered=deferred(),resume=deferred(),sent=[];
 client.rpc=async(name,args)=>{
  if(!args.p_operations.length){entered.resolve();await resume.promise;return {error:{code:'22023',message:'Score operation batch must contain 1 through 64 operations'}};}
  sent.push(...plain(args.p_operations));return {data:args.p_operations.map((op,i)=>({operation_id:op.operation_id,match_revision:i+1}))};
 };
 return {...data,entered,resume,sent};
}
function enterPair(data,...values){
 const gross=values.length?values[0]:7;
 for(const p of data.match.players.slice(6)){p.scores[1].gross=gross;data.engine.stampSharedScoreWrite(data.match,p.playerId,2,{storage:data.storage});}
}
function removeSnapshots(data,{attempted=false}={}){
 const box=data.engine.readSharedScoreOutbox(data.storage);
 box.operations.forEach(op=>{delete op.scoreEntry;if(attempted)op.attempts=1;});
 data.engine.writeSharedScoreOutbox(box,data.storage);
}

test('RPC upgrade sends partner scores entered while probing, rather than the older blank snapshot',async()=>{
 const d=setup(),{engine,match,storage,client}=d;
 engine.stampSharedScoreWrite(match,'p0',2,{storage});
 const snapshot=plain(engine.buildCloudMatchPayload(match,'same-user').scoreEntries);
 const task=engine.submitPendingSharedScoreOperations(client,match,snapshot,{storage});
 await d.entered.promise;enterPair(d);d.resume.resolve();await task;
 assert.deepEqual(d.sent.filter(op=>['p6','p7'].includes(op.score_entry.player_id)).map(op=>op.score_entry.gross),[7,7]);
 assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
});

test('DIRECT enqueue captures an immutable score even before RPC availability is known',()=>{
 const d=setup();enterPair(d);
 const queued=plain(d.engine.getSharedScoreOutboxOperations(d.match,d.storage));
 d.match.players[6].scores[1].gross=9;
 assert.deepEqual(queued.map(op=>op.scoreEntry?.gross),[7,7]);
 assert.deepEqual(plain(d.engine.getSharedScoreOutboxOperations(d.match,d.storage)).map(op=>op.scoreEntry?.gross),[7,7]);
});

for(const blank of [null,'',undefined])test(`RPC snapshot retains ${String(blank)} as an explicit blank score, never zero`,()=>{
 const d=setup();enterPair(d,blank);
 assert.deepEqual(plain(d.engine.getSharedScoreOutboxOperations(d.match,d.storage)).map(op=>op.scoreEntry?.gross),[null,null]);
});

test('legacy snapshotless partner entries upgrade from current saved scores after an awaited probe',async()=>{
 const d=setup(),{engine,match,storage,client}=d;
 engine.stampSharedScoreWrite(match,'p0',2,{storage});
 const snapshot=plain(engine.buildCloudMatchPayload(match,'same-user').scoreEntries);
 const task=engine.submitPendingSharedScoreOperations(client,match,snapshot,{storage});
 await d.entered.promise;enterPair(d);removeSnapshots(d);d.resume.resolve();await task;
 assert.deepEqual(d.sent.filter(op=>['p6','p7'].includes(op.score_entry.player_id)).map(op=>op.score_entry.gross),[7,7]);
});

test('RPC lost acknowledgement retries identical captured payload despite a stale caller snapshot',async()=>{
 const d=setup(),{engine,match,storage,client}=d;enterPair(d);d.resume.resolve();
 let calls=0;const batches=[];
 client.rpc=async(name,args)=>{
  if(!args.p_operations.length)return {error:{code:'22023',message:'Score operation batch must contain 1 through 64 operations'}};
  batches.push(plain(args.p_operations));return ++calls===1?{error:{status:503,message:'Lost response'}}:{data:args.p_operations.map(op=>({operation_id:op.operation_id}))};
 };
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage}));
 match.players[6].scores[1].gross=9;engine.saveSharedDeliveryRetry(match,{nextRetryAt:null},storage);
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 assert.deepEqual(batches[1],batches[0]);assert.deepEqual(batches[1].map(op=>op.score_entry.gross),[7,7]);
});

test('acknowledging an in-flight score cannot remove a newer partner correction',async()=>{
 const d=setup(),{engine,match,storage,client}=d;enterPair(d);d.resume.resolve();
 const received=deferred(),reply=deferred();
 client.rpc=async(name,args)=>{
  if(!args.p_operations.length)return {error:{code:'22023',message:'Score operation batch must contain 1 through 64 operations'}};
  received.resolve();await reply.promise;return {data:args.p_operations.map(op=>({operation_id:op.operation_id}))};
 };
 const task=engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 await received.promise;enterPair(d,8);reply.resolve();await task;
 assert.deepEqual(plain(engine.getSharedScoreOutboxOperations(match,storage)).map(op=>op.scoreEntry.gross),[8,8]);
});

test('legacy attempted entries check receipts before preparing a new payload',async()=>{
 const d=setup(),{engine,match,storage,client}=d;enterPair(d);removeSnapshots(d,{attempted:true});d.resume.resolve();
 const ids=engine.getSharedScoreOutboxOperations(match,storage).map(op=>op.operationId);
 let lookups=0;
 client.from=table=>{assert.equal(table,'shared_score_operations');const query={select:()=>query,eq:()=>query,in:async()=>{lookups++;return {data:ids.map(operation_id=>({operation_id,device_id:engine.getSharedDeviceId(),actor_user_id:'same-user'}))};}};return query;};
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 assert.equal(lookups,1);assert.equal(d.sent.length,0);assert.equal(engine.getSharedScoreOutboxOperations(match,storage).length,0);
});

test('a correction entered during legacy receipt lookup survives the old receipt',async()=>{
 const d=setup(),{engine,match,storage,client}=d;enterPair(d);removeSnapshots(d,{attempted:true});d.resume.resolve();
 const old=engine.getSharedScoreOutboxOperations(match,storage).map(op=>op.operationId);
 client.from=()=>{const query={select:()=>query,eq:()=>query,in:async()=>{
  enterPair(d,8);
  return {data:old.map(operation_id=>({operation_id,device_id:engine.getSharedDeviceId(),actor_user_id:'same-user'}))};
 }};return query;};
 await engine.submitPendingSharedScoreOperations(client,match,[],{storage});
 assert.deepEqual(d.sent.map(op=>op.score_entry.gross),[8,8]);
 assert.ok(d.sent.every(op=>!old.includes(op.operation_id)));
});

test('snapshot preparation storage failure sends nothing and retains the original pair',async()=>{
 const d=setup(),{engine,match,storage,client}=d;enterPair(d);d.resume.resolve();
 const original=plain(engine.getSharedScoreOutboxOperations(match,storage));
 const failing={getItem:storage.getItem,setItem:()=>{throw new Error('Full');}};
 await assert.rejects(engine.submitPendingSharedScoreOperations(client,match,[],{storage:failing}),error=>error.code==='LOCAL_SAVE_FAILED');
 assert.equal(d.sent.length,0);
 assert.deepEqual(plain(engine.getSharedScoreOutboxOperations(match,storage)),original);
});

test('reload preserves snapshots captured before transport detection',async()=>{
 const d=setup();enterPair(d);d.resume.resolve();
 const reloaded=loadLiveEngine(undefined,{storageEntries:[['the-dye-ledger-shared-device-id',d.engine.getSharedDeviceId()]]});
 const saved=plain(d.match);saved.players[6].scores[1].gross=9;
 const match=reloaded.seedState({players:d.data.players,courses:[d.data.course],matches:[saved]}).matches[0];
 await reloaded.submitPendingSharedScoreOperations(d.client,match,[],{storage:d.storage});
 assert.deepEqual(d.sent.map(op=>op.score_entry.gross),[7,7]);
 assert.equal(reloaded.getSharedScoreOutboxOperations(match,d.storage).length,0);
});

test('legacy upgrade uses the canonical match if the working copy changed during the probe',async()=>{
 const d=setup(),{engine,match,storage,client}=d;
 enterPair(d);removeSnapshots(d);
 const snapshot=plain(engine.buildCloudMatchPayload(match,'same-user').scoreEntries);
 const task=engine.submitPendingSharedScoreOperations(client,match,snapshot,{storage});
 await d.entered.promise;
 const saved=plain(match);saved.players.slice(6).forEach(p=>p.scores[1].gross=8);
 saved.sharedScoreQueueRecovery=Object.fromEntries(plain(engine.getSharedScoreOutboxOperations(match,storage)).map(op=>[op.key,op]));
 const current=engine.seedState({players:d.data.players,courses:[d.data.course],matches:[saved]}).matches[0];
 d.resume.resolve();await task;
 assert.deepEqual(d.sent.map(op=>op.score_entry.gross),[8,8]);
 assert.equal(engine.getSharedScoreOutboxOperations(current,storage).length,0);
 assert.equal(current.sharedScoreQueueRecovery,undefined);
});
