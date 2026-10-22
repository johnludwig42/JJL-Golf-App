import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fixture,plain} from './support/shared-delivery-fixture.js';
import '../preserved-score-review.js';
const review=globalThis.DyeLedgerPreservedReview;
function auditMemory(){const rows=new Map();return {rows,put:async row=>{rows.set(row.id,plain(row));},list:async id=>[...rows.values()].filter(row=>row.matchId===id).map(plain)};}
function setup(){
 const data=fixture(),{engine,match,storage,queue}=data;
 match.status='complete';match.completedAt='2026-10-21T12:00:00Z';
 match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
 const report=engine.buildLedgerEntryReportModel(match);report.meta.status='final';report.meta.story='Original verified round story.';
 match.ledgerEntrySnapshot=engine.normalizeAcceptedLedgerEntrySnapshot({status:'accepted',acceptedAt:match.completedAt,report},match.id);
 engine.writeSharedScoreOutbox({operations:[],preservedForHostReview:[]},storage);
 const baseline=[...storage.values.values()][0].length*2;
 queue(match.players.slice(0,4));engine.preserveClosedSharedScoreOperations(match,storage);
 const audit=auditMemory(),options={storage,audit,save:()=>true,decision:'discard',reason:'Host reviewed on this device; result stands.'};
 return {...data,audit,options,baseline};
}
test('72 preserved scores resolve to exact empty outbox size; audit is separate and frozen record/report stay identical',async()=>{
 const {engine,match,storage,audit,options,baseline}=setup();
 const original=JSON.stringify([match.roundRecordSnapshot,match.ledgerEntrySnapshot]);
 const bytesBefore=JSON.stringify(engine.readSharedScoreOutbox(storage)).length*2;
 const groups=engine.getPreservedReviewGroups(match,storage);assert.equal(groups.length,36);assert.equal(groups.flatMap(g=>g.operations).length,72);
 const receipt=await engine.resolvePreservedScoreGroups(match,groups.map(g=>g.id),options);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,0);
 assert.equal(JSON.stringify(engine.readSharedScoreOutbox(storage)).length*2,baseline);
 assert.equal(JSON.stringify([match.roundRecordSnapshot,match.ledgerEntrySnapshot]),original,'resolution must never mutate frozen artifacts');
 assert.equal(audit.rows.size,1);const stored=[...audit.rows.values()][0];assert.equal(stored.phase,'complete');assert.equal(stored.rows.flatMap(row=>row.sources).length,72);
 assert.equal(stored.reason,options.reason);assert.equal(stored.id,receipt.id);assert.ok(stored.rows.every(row=>row.sources.every(source=>source.proposed.gross===4)));
 console.log(JSON.stringify({records:72,liveBaselineBytes:baseline,preservedBytes:bytesBefore,liveAfterBytes:JSON.stringify(engine.readSharedScoreOutbox(storage)).length*2,auditSerializedBytes:JSON.stringify(stored).length*2}));
});
test('single and mixed batches keep unselected team groups, source values and reasons',async()=>{
 const {engine,match,storage,options,audit}=setup(),groups=engine.getPreservedReviewGroups(match,storage);
 await engine.resolvePreservedScoreGroups(match,[groups[0].id],{...options,decision:'already-reflected',reason:'Both partner values match the frozen score.'});
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,70);
 assert.equal([...audit.rows.values()][0].rows[0].sources.length,2);
 await assert.rejects(engine.resolvePreservedScoreGroups(match,[groups[1].id],{...options,reason:''}),/reason/);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,70);
});
test('mismatched partners and captured/later differences require an explicit consistent review value',async()=>{
 const {engine,match,storage,options,audit}=setup();let box=engine.readSharedScoreOutbox(storage);
 box.preservedForHostReview[0].localScoreEntry.gross=7;engine.writeSharedScoreOutbox(box,storage);
 const group=engine.getPreservedReviewGroups(match,storage)[0];assert.equal(group.mismatch,true);
 await assert.rejects(engine.resolvePreservedScoreGroups(match,[group.id],options),/consistent/);
 assert.equal(audit.rows.size,0);
 await engine.resolvePreservedScoreGroups(match,[group.id],{...options,choices:{[group.id]:7}});
 const row=[...audit.rows.values()][0].rows[0];assert.equal(row.reviewValue,7);assert.equal(row.sources[0].proposed.gross,4);assert.equal(row.sources[0].local.gross,7);assert.equal(row.sources.length,2);
 assert.equal(match.roundRecordSnapshot.holes[0].scores[0].gross,4);
});
test('Already reflected cannot claim a different or unknown frozen value; no Accept action exists',async()=>{
 const {engine,match,options}=setup(),group=engine.getPreservedReviewGroups(match,options.storage)[0];
 await assert.rejects(engine.resolvePreservedScoreGroups(match,[group.id],{...options,decision:'accept'}),/Already reflected or Discard/);
 await assert.rejects(engine.resolvePreservedScoreGroups(match,[group.id],{...options,decision:'already-reflected',choices:{[group.id]:9}}),/does not carry/);
});
for(const boundary of ['after-receipt','before-cleanup','after-cleanup'])test(`crash at ${boundary} recovers idempotently with one auditable receipt`,async()=>{
 const {engine,match,storage,audit,options}=setup();let fail=true;
 const ids=engine.getPreservedReviewGroups(match,storage).map(g=>g.id);
 await assert.rejects(engine.resolvePreservedScoreGroups(match,ids,{...options,checkpoint:async phase=>{if(phase===boundary && fail){fail=false;throw new Error('Crash injected');}}}),/Crash injected/);
 assert.equal(audit.rows.size,1);
 await engine.recoverPreservedScoreResolutions(match,{storage,audit,save:()=>true});
 await engine.resolvePreservedScoreGroups(match,ids,options);
 assert.equal(audit.rows.size,1);assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,0);
});
test('audit failure, reference-save failure and outbox quota failure never discard unresolved evidence',async()=>{
 for(const failure of ['audit','reference','outbox']){
  const {engine,match,storage,audit,options}=setup();const ids=engine.getPreservedReviewGroups(match,storage).map(g=>g.id),set=storage.setItem;
  if(failure==='audit')audit.put=async()=>{throw new Error('Audit quota');};
  if(failure==='outbox')storage.setItem=()=>{throw new Error('Outbox quota');};
  await assert.rejects(engine.resolvePreservedScoreGroups(match,ids,{...options,save:()=>failure!=='reference'}));
  storage.setItem=set;assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,72,failure);
 }
});
test('resolution survives reload, discarded differences permit published parity, live parity is unchanged',async()=>{
 const {engine,match,storage,audit,options}=setup();match.players[0].scores[0].gross=8;
 const liveParity={status:'conflict',parityConfirmed:false};match.sharedLedgerParity=liveParity;
 await engine.resolvePreservedScoreGroups(match,engine.getPreservedReviewGroups(match,storage).map(g=>g.id),options);
 const reloaded=fixture().engine,reopened=plain(match);
 await reloaded.recoverPreservedScoreResolutions(reopened,{storage,audit,save:()=>true});
 assert.equal(reloaded.isResolvedPreservedKey(reopened,'p0:1'),true);
 assert.equal((await reloaded.verifyPreservedPublishedParity(reopened,plain(match.roundRecordSnapshot),{storage})).confirmed,true);
 assert.deepEqual(plain(reopened.sharedLedgerParity),liveParity);
 const wrong=plain(match.roundRecordSnapshot);wrong.holes[0].scores[0].gross=15;
 assert.equal((await reloaded.verifyPreservedPublishedParity(reopened,wrong,{storage})).confirmed,false);
});
test('local resolution requires no account or server; unrelated pending operations remain deliverable',async()=>{
 const {engine,match,storage,options}=setup();
 const other={...match,id:'other',sharedMatchId:'OTHER'};engine.stampSharedScoreWrite(other,'p0',1,{storage});
 await engine.resolvePreservedScoreGroups(match,engine.getPreservedReviewGroups(match,storage).map(g=>g.id),options);
 assert.equal(engine.getSharedScoreOutboxOperations(other,storage).length,1);
});
test('newly arriving evidence rejects a stale selected batch rather than clearing unshown rows',async()=>{
 const {engine,match,options,audit}=setup(),group=engine.getPreservedReviewGroups(match,options.storage)[0];
 await assert.rejects(engine.resolvePreservedScoreGroups(match,[group.id],{...options,expectedIds:{[group.id]:[]}}),/New evidence/);
 assert.equal(audit.rows.size,0);
});
test('pressure notice threshold data precedes injected save failure and never truncates or changes the queue',()=>{
 const {engine,match,storage}=setup();
 storage.key=i=>[...storage.values.keys()][i];Object.defineProperty(storage,'length',{get:()=>storage.values.size});
 const box=plain(engine.readSharedScoreOutbox(storage)),before=JSON.stringify(box);
 const measured=review.pressure(storage,box,{deliveryBytes:1,totalBytes:1});assert.equal(measured.warning,true);assert.equal(measured.review,72);assert.ok(measured.totalBytes>=measured.deliveryBytes);
 storage.setItem=()=>{throw new Error('Later quota failure');};
 assert.equal(engine.writeSharedScoreOutbox(box,storage).ok,false);assert.equal(JSON.stringify(engine.readSharedScoreOutbox(storage)),before);
});
test('a changed preserved payload cannot be cleared by a receipt for different evidence',async()=>{
 const {engine,match,storage,options,audit}=setup();
 await assert.rejects(engine.resolvePreservedScoreGroups(match,[engine.getPreservedReviewGroups(match,storage)[0].id],{...options,checkpoint:async phase=>{if(phase==='after-receipt')throw new Error('Stop');}}));
 const box=engine.readSharedScoreOutbox(storage);box.preservedForHostReview[0].localScoreEntry.gross=12;engine.writeSharedScoreOutbox(box,storage);
 await assert.rejects(engine.recoverPreservedScoreResolutions(match,{storage,audit,save:()=>true}),/evidence changed/);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,72);
});
test('content hashes identify content, independent of key order, rather than authenticate a reviewer',async()=>{
 assert.equal(await review.hash({a:1,b:2}),await review.hash({b:2,a:1}));assert.equal(webcrypto.subtle!==undefined,true);
});
test('a missing local audit receipt cannot be replaced by a stored green flag or matching cloud hash',async()=>{
 const {engine,match,storage,options}=setup();
 await engine.resolvePreservedScoreGroups(match,engine.getPreservedReviewGroups(match,storage).map(g=>g.id),options);
 const reloaded=fixture().engine,reopened=plain(match);reopened.sharedPublishedRecordParity={confirmed:true};
 await reloaded.recoverPreservedScoreResolutions(reopened,{storage,audit:auditMemory(),save:()=>true});
 assert.equal((await reloaded.verifyPreservedPublishedParity(reopened,plain(match.roundRecordSnapshot),{storage})).confirmed,false);
 assert.equal(reloaded.isResolvedPreservedKey(reopened,'p0:1'),false);
});
test('other matches and newly preserved operations survive the asynchronous audit/cleanup boundary',async()=>{
 const {engine,match,storage,options}=setup();let injected=false;
 const other={...match,id:'other',sharedMatchId:'OTHER'};
 await engine.resolvePreservedScoreGroups(match,engine.getPreservedReviewGroups(match,storage).map(g=>g.id),{...options,checkpoint:async phase=>{
  if(phase==='before-cleanup' && !injected){injected=true;engine.stampSharedScoreWrite(other,'p0',1,{storage});const box=engine.readSharedScoreOutbox(storage);box.preservedForHostReview.push({...plain(box.preservedForHostReview[0]),operationId:'new-review-after-audit'});engine.writeSharedScoreOutbox(box,storage);}
 }});
 assert.equal(engine.getSharedScoreOutboxOperations(other,storage).length,1);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage).length,1);
 assert.equal(engine.getSharedScoresPreservedForHostReview(match,storage)[0].operationId,'new-review-after-audit');
});
