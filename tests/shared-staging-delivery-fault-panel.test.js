import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('supabase/proposals/shared-score-rpc-v31.0.77/staging/delivery-fault-panel.js','utf8');
function fixture({hostname='127.0.0.1',port='5087',search='?deliveryReview=1',project='darbakmabpbkikisadop',environment='staging',savedMode='pass'}={}){
 const elements=new Map(),storage=new Map(),calls=[];
 const element=()=>({style:{},querySelector:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}});
 const document={createElement:element,body:{append:()=>{}}};
 storage.set('dye-staging-delivery-review-v1',JSON.stringify({mode:savedMode}));
 const native=async(input,init)=>{calls.push({input,init});return new Response(JSON.stringify([{operation_id:'op-1',match_revision:1}]),{status:200});};
 const window={fetch:native,__DYE_SUPABASE_CONFIG__:{url:`https://${project}.supabase.co`,accountAuth:{environment,expectedProjectRef:project}}};
 vm.runInNewContext(source,{window,document,URL,URLSearchParams,Headers,Response,location:{hostname,port,search,href:`http://${hostname}:${port}/index.html${search}`},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
 const request=(match='DYE-682947')=>window.fetch('https://darbakmabpbkikisadop.supabase.co/rest/v1/rpc/submit_shared_score_operations',{method:'POST',body:JSON.stringify({p_match_id:match,p_operations:[{operation_id:'op-1',score_entry:{player_id:'synthetic',hole_number:4,gross:7}}]})});
 return {window,native,elements,calls,request,log:()=>JSON.parse(elements.get('#reviewEvidence')?.textContent || '[]')};
}
for(const options of [{hostname:'example.com'},{port:'80'},{search:''},{project:'other'},{environment:'production'}])test(`fault review refuses ${JSON.stringify(options)} without wrapping fetch`,()=>{
 const d=fixture(options);assert.equal(d.window.fetch,d.native);assert.equal(d.elements.size,0);
});
test('normal published shell does not include the fault panel',()=>{
 assert.doesNotMatch(readFileSync('index.html','utf8'),/delivery-fault-panel/);
});
test('lost acknowledgement reaches the server once, then throws; replay retains identical payload',async()=>{
 const d=fixture();d.elements.get('#reviewDropAck').onclick();await assert.rejects(d.request(),/lost acknowledgement/);
 assert.equal(d.calls.length,1);assert.equal((await d.request()).status,200);assert.equal(d.calls.length,2);
 assert.equal(d.log().filter(e=>e.event==='acknowledgement-discarded').length,1);
 assert.equal(d.log().filter(e=>e.event==='score-request')[1].replays[0].identical,true);
});
test('injected disconnect never sends the protected request and is one-shot',async()=>{
 const d=fixture();d.elements.get('#reviewDisconnect').onclick();await assert.rejects(d.request(),/before send/);assert.equal(d.calls.length,0);
 await d.request();assert.equal(d.calls.length,1);
});
test('holding one synthetic round never holds another round or baseline traffic',async()=>{
 const d=fixture();d.elements.get('#reviewHold').onclick();const pending=d.request();
 assert.equal(d.calls.length,0);await d.request('DYE-119214');assert.equal(d.calls.length,1);
 d.elements.get('#reviewRelease').onclick();await pending;assert.equal(d.calls.length,2);
});
test('an armed fault ignores baseline requests and empty probes',async()=>{
 const d=fixture();d.elements.get('#reviewDisconnect').onclick();await d.request('DYE-119214');
 await d.window.fetch('https://darbakmabpbkikisadop.supabase.co/rest/v1/rpc/submit_shared_score_operations',{body:JSON.stringify({p_match_id:'DYE-682947',p_operations:[]})});
 await assert.rejects(d.request(),/before send/);assert.equal(d.calls.length,2);
});
test('evidence excludes request headers and credential response bodies',async()=>{
 const d=fixture();await d.window.fetch('https://darbakmabpbkikisadop.supabase.co/auth/v1/token?grant_type=refresh_token',{headers:{Authorization:'private-test-sentinel'},body:'private-test-sentinel'});
 assert.equal(d.log().filter(e=>e.event==='auth-refresh').length,1);assert.doesNotMatch(JSON.stringify(d.log()),/private-test-sentinel/);
});
test('invalid-bearer injection is one request only and does not mutate caller headers',async()=>{
 const d=fixture(),headers={Authorization:'private-test-sentinel'};
 d.elements.get('#reviewAuth').onclick();
 await d.window.fetch('https://darbakmabpbkikisadop.supabase.co/rest/v1/rpc/submit_shared_score_operations',{headers,body:JSON.stringify({p_match_id:'DYE-682947',p_operations:[{operation_id:'op-1',score_entry:{gross:7}}]})});
 assert.equal(d.calls[0].init.headers.get('Authorization'),'Bearer staging-review-invalid');
 assert.equal(headers.Authorization,'private-test-sentinel');assert.doesNotMatch(JSON.stringify(d.log()),/private-test-sentinel/);
 await d.request();assert.equal(d.calls[1].init.headers,undefined);
});
test('persistent disconnection keeps score requests blocked until explicitly cancelled',async()=>{
 const d=fixture();d.elements.get('#reviewOffline').onclick();
 await assert.rejects(d.request(),/before send/);await assert.rejects(d.request(),/before send/);assert.equal(d.calls.length,0);
 d.elements.get('#reviewCancel').onclick();await d.request();assert.equal(d.calls.length,1);
});
test('a restored blocking mode is visible and remains blocked until cancellation',async()=>{
 const d=fixture({savedMode:'offline'});assert.match(d.elements.get('#reviewMode').textContent,/blocked/);
 await assert.rejects(d.request(),/before send/);assert.equal(d.calls.length,0);
 d.elements.get('#reviewCancel').onclick();await d.request();assert.equal(d.calls.length,1);
});
test('direct review emulates RPC unavailability only for the retained synthetic round',async()=>{
 const d=fixture();d.elements.get('#reviewDirect').onclick();const response=await d.request();assert.equal(response.status,404);assert.equal((await response.json()).code,'PGRST202');assert.equal(d.calls.length,0);
 await d.request('DYE-119214');assert.equal(d.calls.length,1);
 d.elements.get('#reviewActual').onclick();await d.request();assert.equal(d.calls.length,2);
});
test('actual direct table requests use fault controls without inventing operation receipts',async()=>{
 const d=fixture(),request=()=>d.window.fetch('https://darbakmabpbkikisadop.supabase.co/rest/v1/score_entries',{method:'POST',body:JSON.stringify([{id:'cell1',match_id:'DYE-682947',player_id:'p0',hole_number:1,gross:7}])});
 d.elements.get('#reviewDisconnect').onclick();await assert.rejects(request(),/before send/);assert.equal(d.calls.length,0);
 await request();assert.equal(d.calls.length,1);assert.equal(d.log().filter(e=>e.event==='direct-score-response')[0].receipts.length,0);
});

