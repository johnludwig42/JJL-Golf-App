import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
const PRIMARY='the-dye-ledger-v20',CACHE='the-dye-ledger-cloud-match:';
function storage(seed, capacity=Infinity){
 const rows=new Map(Object.entries(seed));
 return {get length(){return rows.size;},key:i=>[...rows.keys()][i]??null,getItem:k=>rows.get(k)??null,removeItem:k=>rows.delete(k),setItem(k,v){const copy=new Map(rows);copy.set(k,String(v));if([...copy.values()].reduce((sum,value)=>sum+value.length,0)>capacity){const error=new Error('Full');error.name='QuotaExceededError';error.code=22;throw error;}rows.set(k,String(v));}};
}
test('optional cloud cache quota failure does not throw or replace the existing recovery copy',()=>{
 const engine=loadLiveEngine(),store=storage({[CACHE+'DYE-123456']:'old'},3);
 assert.equal(engine.cacheCloudMatchBundle('DYE-123456',{large:'new download'},store),false);
 assert.equal(store.getItem(CACHE+'DYE-123456'),'old');
});
test('authoritative join save reclaims cloud copies while preserving prior rounds, outbox and preferences',()=>{
 const engine=loadLiveEngine(),prior={matches:[{id:'frozen',roundRecord:{scores:[4,5]}}]},next={...prior,matches:[...prior.matches,{id:'joined'}]},protectedRows={[PRIMARY+':shared-score-outbox:v1']:'unsent',[PRIMARY+':setup-draft']:'draft',[PRIMARY+':finish-recovery']:'finish',[PRIMARY+':course-publish-recovery:v1']:'publish',[PRIMARY+':player-preferences']:'prefs'};
 const capacity=JSON.stringify(next).length+Object.values(protectedRows).join('').length+5;
 const store=storage({[PRIMARY]:JSON.stringify(prior),[CACHE+'DYE-123456']:'x'.repeat(capacity),...protectedRows},capacity);
 assert.equal(engine.persistSharedJoinSnapshot(next,store).ok,true);
 assert.deepEqual(JSON.parse(store.getItem(PRIMARY)),next);
 for(const [key,value] of Object.entries(protectedRows))assert.equal(store.getItem(key),value);
 assert.equal(store.getItem(CACHE+'DYE-123456'),null);
});
test('when primary still cannot fit, previous saved facts remain intact and storage diagnostic is explicit',()=>{
 const engine=loadLiveEngine(),prior=JSON.stringify({matches:[{id:'frozen',scores:[4,5]}]}),store=storage({[PRIMARY]:prior,[CACHE+'old']:'cached'},prior.length);
 assert.equal(engine.persistSharedJoinSnapshot({matches:[{id:'larger',scores:Array(100).fill(4)}]},store).ok,false);
 assert.equal(store.getItem(PRIMARY),prior);
 const failure=engine.classifySharedJoinFailure({name:'QuotaExceededError',code:22},{phase:'download'});
 assert.equal(failure.sharedJoinKind,'storage');assert.match(failure.message,/save.*locally/);assert.equal(engine.getLastSharedJoinDiagnostic().kind,'storage');
});
test('failed local join save restores the prior active match and never confirms the new match',()=>{
 const engine=loadLiveEngine(),state=engine.seedState({matches:[]}),before=JSON.stringify(state);
 assert.throws(()=>engine.commitSharedJoinedMatch({id:'joined',storageMode:'local',players:[]},{save:()=>false}),error=>error.sharedJoinKind==='storage');
 assert.equal(JSON.stringify(state),before);assert.equal(engine.getLastSharedJoinDiagnostic().phase,'storage');
});
test('successful cloud reads survive cache exhaustion and commit all fetched scores to the primary store',async()=>{
 const engine=loadLiveEngine(),tables={matches:{id:'DYE-123456'},match_teams:[{team_number:1}],match_players:[{player_id:'p1'}],score_entries:[{hole_number:1,gross:4}],match_notes:[{notes:'kept'}],match_memberships:[]};
 const store=storage({[CACHE+'old']:'old'},3),client={from(table){const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>query,then(resolve){return Promise.resolve({data:tables[table],error:null}).then(resolve);}};return query;}};
 const bundle=await engine.fetchSharedMatchBundle('DYE-123456',{getClient:async()=>client,cache:(id,data)=>engine.cacheCloudMatchBundle(id,data,store)});
 assert.equal(bundle.scoreEntries[0].gross,4);assert.equal(bundle.notes.notes,'kept');
 const state=engine.seedState({matches:[]}),primary=storage({});
 engine.commitSharedJoinedMatch({id:'joined',storageMode:'local',players:[],downloadedScores:bundle.scoreEntries},{save:()=>engine.persistSharedJoinSnapshot(state,primary).ok});
 assert.equal(JSON.parse(primary.getItem(PRIMARY)).matches[0].downloadedScores[0].gross,4);
});
