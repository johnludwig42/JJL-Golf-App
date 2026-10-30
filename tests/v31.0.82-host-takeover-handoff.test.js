import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
function fixture(transport='direct') {
 const e=loadLiveEngine(),d=scrambleFixture(),host=e.getSharedDeviceId();
 d.match.sharedHostDeviceId=host;d.match.sharedDevices[0].id=host;d.match.sharedParticipants[0].deviceId=host;
 d.match.sharedParticipants.forEach(p=>p.userId='same-account');d.match.sharedScoreDeliveryTransport={kind:transport};
 const m=e.seedState({players:d.players,courses:[d.course],matches:[d.match]}).matches[0];
 e.applyTeamGrossScore(m,3,1,6);
 const time=Date.now()+1000;
 for(const id of ['p4','p5'])e.stampSharedScoreWrite(m,id,1,{updatedAt:new Date(time).toISOString()});
 const rows=(gross=8,delta=10000)=>['p4','p5'].map(player_id=>({player_id,hole_number:1,gross,updated_by:'same-account',updated_at:new Date(time+delta).toISOString()}));
 const ack=()=>e.acknowledgeSharedScoreOperations(m,e.getSharedScoreOutboxOperations(m).map(x=>x.operationId));
 return {e,m,rows,ack};
}
for(const mode of ['direct','rpc'])test(`${mode}: acknowledged host takeover hands both partners back to newer assigned cloud scores`,()=>{
 const {e,m,rows,ack}=fixture(mode);
 e.mergeRemoteScoreEntriesIntoMatch(m,rows());assert.equal(m.players[4].scores[0].gross,6);
 ack();e.mergeRemoteScoreEntriesIntoMatch(m,rows());
 assert.deepEqual(m.players.slice(4,6).map(p=>p.scores[0].gross),[8,8]);
 assert.equal(Object.keys(m.sharedHostScoreOverrides).length,0);
 assert.ok(m.sharedHostScoreOverrideHistory['p4:1'][0].overrideAt);
 assert.equal(e.getSharedScoreOutboxOperations(m).length,0);
});
test('verified host echo retires active protection without erasing takeover history',()=>{
 const {e,m,rows,ack}=fixture();ack();e.mergeRemoteScoreEntriesIntoMatch(m,rows(6));
 assert.equal(Object.keys(m.sharedHostScoreOverrides).length,0);
 assert.equal(m.players[4].scores[0].gross,6);
 assert.ok(m.sharedHostScoreOverrideHistory['p5:1']);
 e.mergeRemoteScoreEntriesIntoMatch(m,rows(8,20000));assert.equal(m.players[4].scores[0].gross,8);
});
test('old acknowledgement cannot release a newer queued host edit',()=>{
 const {e,m,rows}=fixture(),old=e.getSharedScoreOutboxOperations(m).map(x=>x.operationId);
 e.applyTeamGrossScore(m,3,1,7);
 for(const id of ['p4','p5'])e.stampSharedScoreWrite(m,id,1);
 e.acknowledgeSharedScoreOperations(m,old);e.mergeRemoteScoreEntriesIntoMatch(m,rows());
 assert.equal(e.getSharedScoreOutboxOperations(m).length,2);assert.equal(m.players[4].scores[0].gross,7);
 assert.equal(Object.keys(m.sharedHostScoreOverrides).length,2);
});
test('partial acknowledgement, missing partner and inconsistent pair never release either partner',()=>{
 const {e,m,rows,ack}=fixture(),ops=e.getSharedScoreOutboxOperations(m);
 e.acknowledgeSharedScoreOperations(m,[ops[0].operationId]);e.mergeRemoteScoreEntriesIntoMatch(m,rows());
 assert.equal(Object.keys(m.sharedHostScoreOverrides).length,2);
 ack();e.mergeRemoteScoreEntriesIntoMatch(m,rows().slice(0,1));
 const pair=rows();pair[1].gross=9;e.mergeRemoteScoreEntriesIntoMatch(m,pair);
 assert.equal(Object.keys(m.sharedHostScoreOverrides).length,2);assert.equal(m.players[4].scores[0].gross,6);
});
test('stale, unauthorized and storage-failed reconciliation retains protection',()=>{
 const {e,m,rows,ack}=fixture();ack();e.mergeRemoteScoreEntriesIntoMatch(m,rows(8,-60000));
 // Assigned-device reconciliation deliberately authorizes the actual host; use an unrelated participant
 // to retain this test's unauthorized-source coverage.
 e.mergeRemoteScoreEntriesIntoMatch(m,rows().map(r=>({...r,participant_id:'stranger'})));
 m.sharedDeliveryStorageFailure=true;e.mergeRemoteScoreEntriesIntoMatch(m,rows());
 assert.equal(Object.keys(m.sharedHostScoreOverrides).length,2);assert.equal(m.players[4].scores[0].gross,6);
});
test('legacy unfinished flags reconcile after reload; frozen completed round is unchanged',()=>{
 const {e,m,rows,ack}=fixture();ack();
 const loaded=e.seedState(JSON.parse(JSON.stringify({players:scrambleFixture().players,courses:[scrambleFixture().course],matches:[m]}))).matches[0];
 e.mergeRemoteScoreEntriesIntoMatch(loaded,rows());assert.equal(loaded.players[4].scores[0].gross,8);
 const other=fixture();other.ack();other.m.status='complete';other.m.roundRecordSnapshot={isFrozen:true};
 const facts=()=>JSON.stringify({record:other.m.roundRecordSnapshot,scores:other.m.players.map(p=>p.scores),overrides:other.m.sharedHostScoreOverrides,history:other.m.sharedHostScoreOverrideHistory});
 const before=facts();other.e.mergeRemoteScoreEntriesIntoMatch(other.m,other.rows());
 assert.equal(facts(),before);
});
