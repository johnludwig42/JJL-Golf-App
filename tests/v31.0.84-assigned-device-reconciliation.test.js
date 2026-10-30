import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';

const plain=value=>JSON.parse(JSON.stringify(value));
const queueKey='the-dye-ledger-v20:shared-score-outbox:v1';
function fixture(transport='direct',sameAccount=false){
 const host=loadLiveEngine(),remote=loadLiveEngine(),d=scrambleFixture(),time=Date.now();
 const hostDevice=host.getSharedDeviceId(),remoteDevice=remote.getSharedDeviceId();
 Object.assign(d.match,{sharedMatchId:'DYE-SEAM84',sharedHostDeviceId:hostDevice,sharedScoreDeliveryTransport:{kind:transport},sharedScoreOutboxInitialized:true});
 d.match.sharedDevices[0].id=hostDevice;d.match.sharedDevices[1].id=remoteDevice;
 Object.assign(d.match.sharedParticipants[0],{deviceId:hostDevice,userId:'host-account'});
 Object.assign(d.match.sharedParticipants[1],{deviceId:remoteDevice,userId:sameAccount?'host-account':'remote-account'});
 d.match.players.forEach(p=>p.scores[0].gross=4);
 d.match.players.slice(4,6).forEach(p=>p.scores[0].gross=8);
 const seed=e=>e.seedState(plain({players:d.players,courses:[d.course],matches:[d.match]})).matches[0];
 const hm=seed(host),rm=seed(remote),iso=offset=>new Date(time+offset).toISOString();
 const stamp=(e,m,ids=['p4','p5'],offset=0)=>ids.forEach(id=>e.stampSharedScoreWrite(m,id,1,{updatedAt:iso(offset)}));
 const ack=(e,m)=>e.acknowledgeSharedScoreOperations(m,e.getSharedScoreOutboxOperations(m).map(op=>op.operationId));
 const canonical=(e,m,user,offset=1000,explicit=false)=>{
  const rows=transport==='rpc'?e.getSharedScoreOutboxOperations(m).map(op=>plain(op.scoreEntry)):e.buildCloudMatchPayload(m,user).scoreEntries.filter(row=>['p4','p5'].includes(row.player_id)&&row.hole_number===1);
  return rows.map(row=>({...row,updated_by:user,updated_at:iso(offset),...(explicit?{participant_id:user==='host-account'?'hp':'jp'}:{})}));
 };
 const hostRows=(gross=7,offset=1000,participant='hp')=>['p4','p5'].map(player_id=>({player_id,hole_number:1,gross,updated_at:iso(offset),participant_id:participant}));
 return {host,remote,hm,rm,d,iso,stamp,ack,canonical,hostRows,remoteDevice};
}

for(const transport of ['direct','rpc'])for(const sameAccount of [false,true])test(`${transport}: two assigned engines reconcile host takeover and later scorer correction (${sameAccount?'same':'different'} account)`,()=>{
 const f=fixture(transport,sameAccount),{host,remote,hm,rm}=f;
 assert.equal(host.isCurrentDeviceMatchHost(hm),true);assert.equal(remote.isCurrentDeviceMatchHost(rm),false);
 host.applyTeamGrossScore(hm,3,1,7);f.stamp(host,hm);
 const first=f.canonical(host,hm,'host-account');f.ack(host,hm);
 assert.equal(remote.resolveRemoteScoreParticipant(rm,first[0]),sameAccount?'':'hp');
 remote.mergeRemoteScoreEntriesIntoMatch(rm,first);
 assert.deepEqual(rm.players.slice(4,6).map(p=>p.scores[0].gross),[7,7]);
 assert.equal(remote.getSharedScoreOutboxOperations(rm).length,0);
 remote.applyTeamGrossScore(rm,3,1,6);f.stamp(remote,rm,undefined,2000);
 remote.mergeRemoteScoreEntriesIntoMatch(rm,first);
 assert.deepEqual(rm.players.slice(4,6).map(p=>p.scores[0].gross),[6,6]);
 const correction=f.canonical(remote,rm,sameAccount?'host-account':'remote-account',3000);f.ack(remote,rm);
 remote.mergeRemoteScoreEntriesIntoMatch(rm,first);
 assert.deepEqual(rm.players.slice(4,6).map(p=>p.scores[0].gross),[6,6]);
 host.mergeRemoteScoreEntriesIntoMatch(hm,correction);
 assert.deepEqual(hm.players.slice(4,6).map(p=>p.scores[0].gross),[6,6]);
 assert.equal(Object.keys(hm.sharedHostScoreOverrides).length,0);
});

test('explicit host authority is accepted, while another participant and a conflicting host device are rejected',()=>{
 const f=fixture(),{remote:e,rm:m}=f;
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[7,7]);
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows(5,2000,'stranger'));assert.equal(m.players[4].scores[0].gross,7);
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows(5,3000).map(row=>({...row,device_id:'not-the-host'})));assert.equal(m.players[4].scores[0].gross,7);
});

test('one pending partner protects the whole locally assigned team from canonical overwrite',()=>{
 const f=fixture(),{remote:e,rm:m}=f;f.stamp(e,m,['p4']);
 const pending=plain(e.getSharedScoreOutboxOperations(m));e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());
 assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[8,8]);assert.deepEqual(plain(e.getSharedScoreOutboxOperations(m)),pending);
 f.ack(e,m);e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[7,7]);
});

test('newer acknowledged local intent still protects both partners against stale canonical facts',()=>{
 const f=fixture(),{remote:e,rm:m}=f;f.stamp(e,m,['p4'],2000);f.ack(e,m);
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows(7,1000));assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[8,8]);
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows(7,3000));assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[7,7]);
});

test('partial owned pairs and mixed-authority pairs cannot reconcile in isolation',()=>{
 const f=fixture(),{remote:e,rm:m}=f;
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows().slice(0,1));assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[8,8]);
 const mixed=f.hostRows();mixed[1].participant_id='stranger';e.mergeRemoteScoreEntriesIntoMatch(m,mixed);
 assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[8,8]);
});

test('a complete canonical inconsistent pair remains Pending rather than being silently resolved',()=>{
 const f=fixture(),{remote:e,rm:m}=f,rows=f.hostRows();rows[1].gross=6;e.mergeRemoteScoreEntriesIntoMatch(m,rows);
 assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[7,6]);assert.equal(e.hasUnresolvedTeamScores(m),true);
});

test('queue recovery and corrupt storage fail closed; healthy reconciliation resumes after recovery',()=>{
 const f=fixture(),{remote:e,rm:m}=f;
 const failing={getItem:()=>null,setItem:()=>{throw new Error('Full');}};
 e.stampSharedScoreWrite(m,'p4',1,{updatedAt:f.iso(0),storage:failing});
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());assert.equal(m.players[5].scores[0].gross,8);
 delete m.sharedDeliveryStorageFailure;e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());assert.equal(m.players[5].scores[0].gross,8);
 e.stampSharedScoreWrite(m,'p4',1,{updatedAt:f.iso(0)});f.ack(e,m);e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());assert.equal(m.players[5].scores[0].gross,7);
 const corrupt=loadLiveEngine(undefined,{storageEntries:[['the-dye-ledger-shared-device-id',f.remoteDevice],[queueKey,'{broken']]});
 const loaded=corrupt.seedState(plain({players:f.d.players,courses:[f.d.course],matches:[m]})).matches[0];
 corrupt.mergeRemoteScoreEntriesIntoMatch(loaded,f.hostRows(5,5000));assert.equal(loaded.players[4].scores[0].gross,7);
});

test('reload during backoff retains pending pair protection without blocking healthy acknowledged pulls',()=>{
 const f=fixture(),{remote:e,rm:m}=f;f.stamp(e,m);
 const reloaded=loadLiveEngine(undefined,{storageEntries:[['the-dye-ledger-shared-device-id',f.remoteDevice],[queueKey,JSON.stringify(e.readSharedScoreOutbox())]]});
 const loaded=reloaded.seedState(plain({players:f.d.players,courses:[f.d.course],matches:[m]})).matches[0];
 reloaded.saveSharedDeliveryRetry(loaded,{category:'temporary',attempts:2,nextRetryAt:f.iso(60000)});
 reloaded.mergeRemoteScoreEntriesIntoMatch(loaded,f.hostRows());assert.equal(loaded.players[4].scores[0].gross,8);
 f.ack(reloaded,loaded);reloaded.mergeRemoteScoreEntriesIntoMatch(loaded,f.hostRows());assert.equal(loaded.players[4].scores[0].gross,7);
});

test('non-owned incoming scores still merge and frozen completed facts remain unchanged',()=>{
 const f=fixture(),{remote:e,rm:m}=f;
 e.mergeRemoteScoreEntriesIntoMatch(m,[{player_id:'p0',hole_number:1,gross:5,updated_at:f.iso(1000),participant_id:'hp'}]);assert.equal(m.players[0].scores[0].gross,5);
 m.status='complete';m.roundRecordSnapshot={schemaVersion:1,isFrozen:true,frozenAt:f.iso(1000),meta:{roundId:m.id},settlement:{p0:123}};const before=JSON.stringify(m.players.map(p=>p.scores)),record=JSON.stringify(m.roundRecordSnapshot);
 e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());assert.equal(JSON.stringify(m.players.map(p=>p.scores)),before);assert.equal(JSON.stringify(m.roundRecordSnapshot),record);
});
test('regular assigned-player rounds protect only pending cells without coupling independent scores',()=>{
 const f=fixture(),{remote:e,rm:m}=f;delete m.teamScoringPolicyVersion;assert.equal(e.isTeamScoredRound(m),false);
 f.stamp(e,m,['p4']);e.mergeRemoteScoreEntriesIntoMatch(m,f.hostRows());
 assert.equal(m.players[4].scores[0].gross,8);assert.equal(m.players[5].scores[0].gross,7);
});
