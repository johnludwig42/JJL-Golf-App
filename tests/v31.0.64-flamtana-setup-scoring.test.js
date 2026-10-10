import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';

test('accepted membership followed by permission failure retains the actual download cause and table',async()=>{
 const engine=loadLiveEngine(),cause=Object.assign(new Error('permission denied for table match_notes'),{code:'42501',sharedJoinTable:'match_notes'});
 let authorized=0;
 await assert.rejects(engine.fetchSharedJoinBundle('DYE-123456',{requireRegistration:true,authorize:async code=>{authorized++;return code;},fetchBundle:async()=>{throw cause;},readCached:()=>null}),error=>{
  assert.equal(error.cause,cause);assert.equal(error.sharedJoinKind,'permission');assert.equal(error.sharedJoinAuthorized,true);assert.equal(error.sharedJoinTable,'match_notes');assert.ok(!/not found/i.test(error.message));return true;
 });
 assert.equal(authorized,1);const diagnostic=engine.getLastSharedJoinDiagnostic();assert.equal(diagnostic.code,'42501');assert.equal(diagnostic.table,'match_notes');assert.equal(diagnostic.authorized,true);assert.equal(Object.hasOwn(diagnostic,'message'),false);
 const success=await engine.fetchSharedJoinBundle('DYE-123456',{fetchBundle:async()=>({matchRow:{id:'DYE-123456'}})});assert.equal(success.fromCache,false);assert.equal(engine.getLastSharedJoinDiagnostic(),null);
});

test('accepted join with an invisible row differs from genuine RPC not-found, expired auth and connection failures',async()=>{
 const engine=loadLiveEngine();
 const invisible=engine.classifySharedJoinFailure(Object.assign(new Error('Shared match not found.'),{code:'SHARED_MATCH_NOT_FOUND',sharedJoinTable:'matches'}),{phase:'download',authorized:true});
 assert.equal(invisible.sharedJoinKind,'visibility');assert.match(invisible.message,/Joining was accepted/);
 assert.equal(engine.classifySharedJoinFailure({code:'P0002',message:'Shared Match not found'},{phase:'authorize'}).sharedJoinKind,'not_found');
 assert.equal(engine.classifySharedJoinFailure({status:401,message:'JWT expired'},{phase:'authorize'}).sharedJoinKind,'authentication');
 assert.equal(engine.classifySharedJoinFailure(new TypeError('Failed to fetch'),{authorized:true}).sharedJoinKind,'connection');
 const registration=engine.classifySharedJoinFailure(new Error('Unexpected response'),{phase:'register',authorized:true});assert.equal(registration.sharedJoinKind,'registration');assert.match(registration.message,/scorer registration/);
 let fetched=false;await assert.rejects(engine.fetchSharedJoinBundle('DYE-123456',{requireRegistration:true,authorize:async()=>{throw {code:'P0002',message:'Shared Match not found'};},fetchBundle:async()=>{fetched=true;}}));assert.equal(fetched,false);
});

test('existing cached match recovery remains available without clearing saved facts',async()=>{
 const engine=loadLiveEngine(),bundle={matchRow:{id:'DYE-123456'},scoreEntries:[{gross:4}]};
 const result=await engine.fetchSharedJoinBundle('DYE-123456',{fetchBundle:async()=>{throw new TypeError('Failed to fetch');},readCached:()=>bundle});assert.equal(result.fromCache,true);assert.equal(result.bundle,bundle);assert.equal(bundle.scoreEntries[0].gross,4);
});

test('Start refreshes joined devices before validation and preserves valid offline assignments',async()=>{
 const data=scrambleFixture(),engine=loadLiveEngine(),match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 match.roundTiming.startedAt=null;match.sharedParticipants=match.sharedParticipants.filter(person=>person.participantId==='hp');match.sharedDevices=match.sharedDevices.filter(device=>device.id==='host');
 let refreshed=0;const ready=await engine.prepareSharedScoringStart(match,{online:true,refresh:async()=>{refreshed++;match.sharedParticipants.push({participantId:'jp',deviceId:'cart2'});match.sharedDevices.push({id:'cart2'});}});assert.equal(ready.error,'');assert.equal(refreshed,1);
 assert.equal((await engine.prepareSharedScoringStart(match,{online:false,refresh:async()=>assert.fail('Offline should not request network')})).error,'');
 match.players.forEach(player=>match.sharedPlayerAssignments[player.playerId]='hp');assert.match((await engine.prepareSharedScoringStart(match,{online:false})).error,/second device/);
});

test('team steppers initialize at par, respect score bounds and mark deliberate Pending resolution',()=>{
 const engine=loadLiveEngine();const make=value=>({disabled:false,value,dataset:{scoreTeam:'1',holePar:'4'},closest:()=>null});
 for(const direction of [-1,1]){const input=make('');assert.equal(engine.applySmartScoreStep(input,direction),true);assert.equal(input.value,'4');assert.equal(input.dataset.teamScoreTouched,'1');}
 const upper=make('25');engine.applySmartScoreStep(upper,1);assert.equal(upper.value,'25');const lower=make('1');engine.applySmartScoreStep(lower,-1);assert.equal(lower.value,'1');
 const locked=make('');locked.disabled=true;assert.equal(engine.applySmartScoreStep(locked,1),false);assert.equal(locked.value,'');
});
