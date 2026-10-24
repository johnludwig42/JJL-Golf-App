import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {buildPlan,validateTarget,probeStaging,probeCredentials} from '../scripts/shared-match-staging-preflight.js';

const ref='abcdefghijklmnopqrst';
const config={environment:'staging',projectRef:ref,url:`https://${ref}.supabase.co`,phase:'baseline'};
const jwt=claims=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.test';
const env={DYE_STAGING_PUBLISHABLE_KEY:'sb_publishable_test',DYE_STAGING_HOST_JWT:jwt({role:'authenticated'})};
function server({rpc='PGRST202',auth=200,table=200}={}){
  const calls=[];
  return {calls,fetcher:async(url,options)=>{
    calls.push({url,options});
    const session=url.endsWith('/user');
    const status=session?auth:url.includes('/matches?')?table:url.includes('/rpc/')?400:200;
    return {status,ok:status>=200 && status<300,json:async()=>session?{id:'synthetic-account',email:'never-export@example.invalid'}:{code:url.includes('/rpc/')?rpc:'',message:'private server message'}};
  }};
}
test('dry plan fingerprints thirteen migrations and leaves every service gate unverified',()=>{
  const plan=buildPlan();
  assert.equal(plan.migrationCount,13);
  assert.equal(plan.target,null);
  assert.equal(plan.productionReady,false);
  assert.equal(plan.productionExecuted,false);
  assert.ok(plan.files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)));
  assert.ok(plan.gates.every(gate=>gate.status==='NOT_RUN'));
});
test('production target refuses before making any request',async()=>{
  let requests=0;
  await assert.rejects(probeStaging({...config,projectRef:'ueallqqmdyzwdlmoyxfo',url:'https://ueallqqmdyzwdlmoyxfo.supabase.co'},{env,fetcher:async()=>{requests++;}}),{code:'PRODUCTION_TARGET_REFUSED'});
  assert.equal(requests,0);
});
test('target requires staging label and matching hosted project reference',()=>{
  for(const change of [{environment:'production'},{projectRef:'zyxwvutsrqponmlkjihg'},{phase:'unknown'}])assert.throws(()=>validateTarget({...config,...change}));
  assert.equal(validateTarget(config).url,config.url);
});
test('target refuses redirects through URL credentials, paths, custom hosts and query strings',()=>{
  for(const url of [`http://${ref}.supabase.co`,`https://user:pass@${ref}.supabase.co`,`https://${ref}.supabase.co/path`,`https://${ref}.supabase.co?target=production`,'https://example.com'])assert.throws(()=>validateTarget({...config,url}));
});
test('privileged keys and service-role sessions refuse before network access',async()=>{
  for(const credentials of [{...env,DYE_STAGING_PUBLISHABLE_KEY:'sb_secret_hidden'},{...env,DYE_STAGING_PUBLISHABLE_KEY:jwt({role:'service_role'})},{...env,DYE_STAGING_HOST_JWT:jwt({role:'service_role'})}]){
    let requests=0;
    await assert.rejects(probeStaging(config,{role:'host',env:credentials,fetcher:async()=>{requests++;}}));
    assert.equal(requests,0);
  }
});
test('legacy anon key is accepted but missing ordinary session is refused',()=>{
  assert.equal(probeCredentials('anonymous',{DYE_STAGING_PUBLISHABLE_KEY:jwt({role:'anon'})}).token,null);
  assert.throws(()=>probeCredentials('scorer',env),{code:'ORDINARY_TEST_SESSION_REQUIRED'});
});
test('baseline missing RPC is an API preflight result, never delivery or production readiness',async()=>{
  const result=await probeStaging(config,{env,...server()});
  assert.equal(result.preflightPassed,true);
  assert.equal(result.rpcObservation,'rpc-not-in-schema-cache');
  assert.equal(result.productionReady,false);
  assert.ok(result.gates.every(gate=>gate.status==='NOT_RUN'));
});
test('installed RPC validation requires a server-validated ordinary session',async()=>{
  const result=await probeStaging({...config,phase:'installed'},{role:'host',env,...server({rpc:'22023'})});
  assert.equal(result.preflightPassed,true);
  assert.equal(result.rpcObservation,'rpc-validation-reachable');
});
test('anonymous installed RPC denial cannot pass installed validation',async()=>{
  const result=await probeStaging({...config,phase:'installed'},{env,...server({rpc:'42501'})});
  assert.equal(result.preflightPassed,false);
});
test('expired session or inaccessible application tables fail the preflight',async()=>{
  for(const options of [{auth:401},{table:403}]){
    const result=await probeStaging({...config,phase:'installed'},{role:'host',env,...server({rpc:'22023',...options})});
    assert.equal(result.preflightPassed,false);
  }
});
test('nonmissing RPC errors remain inconclusive rather than implying a working fallback',async()=>{
  const result=await probeStaging(config,{env,...server({rpc:'XX000'})});
  assert.equal(result.preflightPassed,false);
  assert.equal(result.rpcObservation,'inconclusive');
});
test('probes fetch no match rows and submit only an empty validation batch',async()=>{
  const mock=server();
  await probeStaging(config,{env,...mock});
  assert.equal(mock.calls.length,3);
  assert.ok(mock.calls.every(call=>call.options.redirect==='error' && call.options.signal));
  assert.ok(mock.calls[1].url.endsWith('/matches?select=id&limit=0'));
  assert.deepEqual(JSON.parse(mock.calls[2].options.body).p_operations,[]);
  assert.equal(mock.calls[2].options.method,'POST');
});
test('reports omit account rows, keys, tokens and arbitrary server messages',async()=>{
  const result=await probeStaging({...config,phase:'restored'},{role:'host',env,...server({rpc:'22023'})});
  const output=JSON.stringify(result);
  for(const secret of [env.DYE_STAGING_PUBLISHABLE_KEY,env.DYE_STAGING_HOST_JWT,'never-export@example.invalid','private server message','synthetic-account'])assert.equal(output.includes(secret),false);
});
test('network and timeout failures are bounded and sanitized',async()=>{
  for(const name of ['TimeoutError','Error']){
    const result=await probeStaging(config,{env,fetcher:async()=>{throw Object.assign(new Error('secret token details'),{name});}});
    assert.equal(result.preflightPassed,false);
    assert.ok(result.checks.every(check=>check.code===(name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR')));
    assert.equal(JSON.stringify(result).includes('secret token details'),false);
  }
});
