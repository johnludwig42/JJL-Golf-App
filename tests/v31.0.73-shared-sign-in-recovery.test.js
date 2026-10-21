import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
function seed(){const e=loadLiveEngine(),d=scrambleFixture();d.match.sharedHostDeviceId=e.getSharedDeviceId();d.match.sharedDevices[0].id=d.match.sharedHostDeviceId;d.match.sharedParticipants[0].deviceId=d.match.sharedHostDeviceId;d.match.players.forEach(p=>p.scores.forEach(s=>s.gross=4));return {e,m:e.seedState({players:d.players,courses:[d.course],matches:[d.match],activeMatchId:'r'}).matches[0]};}
test('shared host sign-in gate rejects missing/guest sessions and accepts a permanent account without altering scores',()=>{
 const {e,m}=seed(),scores=JSON.stringify(m.players);
 for(const user of [null,{id:'guest',is_anonymous:true},{id:'guest',app_metadata:{provider:'anonymous'}}])assert.throws(()=>e.requireSharedHostAccount(m,user),err=>err.code==='SHARED_SIGN_IN_REQUIRED');
 m.sharedAccountRecovery={kind:'sign-in'};e.requireSharedHostAccount(m,{id:'owner',is_anonymous:false});assert.equal(m.sharedAccountRecovery,undefined);assert.equal(JSON.stringify(m.players),scores);
});
test('sign-in errors, access denial and network failures have distinct recovery guidance',()=>{
 const {e}=seed();
 for(const code of ['SHARED_SIGN_IN_REQUIRED','PGRST301','401','session_not_found'])assert.equal(e.getSharedAccountRecovery({code}).kind,'sign-in');
 assert.equal(e.getSharedAccountRecovery({code:'42501'}).kind,'permission');assert.equal(e.getSharedAccountRecovery({status:403}).kind,'permission');
 // Authentication failure must never permanently suppress queued score delivery.
 assert.equal(e.isPermanentSharedScoreDeliveryError({code:'SHARED_SIGN_IN_REQUIRED'}),false);
 assert.equal(e.getSharedAccountRecovery({status:503,message:'Failed to fetch'}),null);assert.match(e.getSharedFriendlyError({message:'Failed to fetch'}),/unavailable/);
});
test('access failures invalidate cloud confirmation without inventing 144 missing rows or touching local scores',()=>{
 const {e,m}=seed(),scores=JSON.stringify(m.players);m.sharedLedgerParity={status:'confirmed',parityConfirmed:true,localCount:144,remoteCount:144,missingLocal:[],missingRemote:[],conflicts:[]};
 e.recordSharedCloudFailure(m,{code:'SHARED_SIGN_IN_REQUIRED',message:'Sign in'}, {explicit:false});
 assert.equal(m.sharedAccountRecovery.kind,'sign-in');assert.equal(m.sharedLedgerParity.status,'access-blocked');assert.equal(m.sharedLedgerParity.parityConfirmed,false);assert.equal(m.sharedLedgerParity.missingRemote.length,0);assert.equal(JSON.stringify(m.players),scores);
 e.recordSharedLedgerParity(m,{parityConfirmed:true,missingLocal:[],missingRemote:[],conflicts:[]});assert.equal(m.sharedLedgerParity.parityConfirmed,false);
 e.requireSharedHostAccount(m,{id:'owner'});e.recordSharedLedgerParity(m,{parityConfirmed:true,missingLocal:[],missingRemote:[],conflicts:[]});assert.equal(m.sharedLedgerParity.parityConfirmed,true);
});
