// Staging-only service preflight. Never installs SQL, seeds data or changes app config.
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const proposal='supabase/proposals/shared-score-rpc-v31.0.77/';
const roleVariables={host:'DYE_STAGING_HOST_JWT',scorer:'DYE_STAGING_SCORER_JWT',sameAccount:'DYE_STAGING_SAME_ACCOUNT_JWT',guest:'DYE_STAGING_GUEST_JWT',outsider:'DYE_STAGING_OUTSIDER_JWT'};
const phases=['baseline','installed','rolled-back','restored'];
function fail(code){throw Object.assign(new Error(code),{code});}
export function productionRefs(){
  const source=readFileSync(resolve(root,'supabase-config.js'),'utf8');
  const configured=source.match(/expectedProjectRef:\s*['"]([a-z0-9]+)['"]/)?.[1];
  if(!configured)fail('PRODUCTION_REFERENCE_UNAVAILABLE');
  return new Set([configured,'ueallqqmdyzwdlmoyxfo']); // Retained production audit identity.
}
export function validateTarget(config,denied=productionRefs()){
  if(config?.environment!=='staging')fail('STAGING_ENVIRONMENT_REQUIRED');
  let url;try{url=new URL(config.url);}catch{fail('INVALID_STAGING_URL');}
  if(url.protocol!=='https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname!=='/')fail('INVALID_STAGING_URL');
  const ref=url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  if(!ref || !/^[a-z0-9]{20}$/.test(config.projectRef || '') || config.projectRef!==ref)fail('STAGING_REFERENCE_MISMATCH');
  if(denied.has(ref))fail('PRODUCTION_TARGET_REFUSED');
  if(!phases.includes(config.phase))fail('STAGING_PHASE_REQUIRED');
  return {environment:'staging',projectRef:ref,url:url.origin,phase:config.phase};
}
function jwtClaims(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{fail('INVALID_TEST_SESSION');}}
export function probeCredentials(role,env){
  const key=String(env.DYE_STAGING_PUBLISHABLE_KEY || '');
  if(!key)fail('STAGING_PUBLISHABLE_KEY_REQUIRED');
  if(!key.startsWith('sb_publishable_') && !(key.startsWith('eyJ') && jwtClaims(key).role==='anon'))fail('PRIVILEGED_OR_INVALID_API_KEY_REFUSED');
  if(role==='anonymous')return {key,token:null};
  const variable=roleVariables[role];if(!variable)fail('UNKNOWN_STAGING_ROLE');
  const token=String(env[variable] || '');
  if(!token || jwtClaims(token).role!=='authenticated')fail('ORDINARY_TEST_SESSION_REQUIRED');
  return {key,token};
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildPlan(config=null){
  const migrations=readdirSync(resolve(root,'supabase/migrations')).filter(file=>file.endsWith('.sql')).sort();
  const paths=[...migrations.map(file=>'supabase/migrations/'+file),...['install-review.sql','rollback-review.sql','restore-review.sql','staging/preflight-read-only.sql'].map(file=>proposal+file),'scripts/check-shared-delivery-production.sql','scripts/shared-match-staging-preflight.js','app.js','identity-security.js'];
  return {
    kind:'shared-match-staging-preflight',schemaVersion:1,appVersion:JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version,
    target:config?validateTarget(config):null,productionExecuted:false,productionReady:false,
    migrationCount:migrations.length,files:paths.map(path=>({path,sha256:digest(readFileSync(resolve(root,path)))})),
    gates:['fresh-production-and-staging-catalogs','reviewed-schema-only-baseline','auth-and-device-authority','rpc-and-direct-delivery','private-realtime','cache-lag-and-nonmissing-errors','completion-and-concurrency','rollback-and-restore','physical-two-phone-round'].map(id=>({id,status:'NOT_RUN'})),
  };
}
function safeCode(value){return typeof value==='string' && /^[A-Z0-9_]{1,32}$/.test(value)?value:'';}
export async function probeStaging(config,{role='anonymous',env=process.env,fetcher=globalThis.fetch,timeoutMs=10000}={}){
  // Refuse target and privileged credentials before any request is constructed.
  const target=validateTarget(config),{key,token}=probeCredentials(role,env);
  const headers={apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'};
  async function request(id,path,options={}){
    try{
      const response=await fetcher(target.url+path,{...options,headers,redirect:'error',signal:globalThis.AbortSignal.timeout(timeoutMs)});
      let body=null;try{body=await response.json();}catch{ /* A status-only result remains useful. */ }
      // Never retain raw errors, returned account rows, tokens or response headers.
      return {id,httpStatus:response.status,code:safeCode(body?.code),...(id==='session'?{authenticated:response.ok && typeof body?.id==='string',anonymous:response.ok && body?.is_anonymous===true}:{})};
    }catch(error){return {id,httpStatus:null,code:['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':'NETWORK_ERROR'};}
  }
  const checks=[await request('auth-health','/auth/v1/health')];
  if(token)checks.push(await request('session','/auth/v1/user'));
  checks.push(await request('table-read-no-rows','/rest/v1/matches?select=id&limit=0'));
  // Audited RPC rejects this empty batch before membership lookup or any write.
  // This is reachability/validation evidence, not a successful score-delivery test.
  checks.push(await request('rpc-empty-batch','/rest/v1/rpc/submit_shared_score_operations',{method:'POST',body:JSON.stringify({p_match_id:'DYE-STAGING-PREFLIGHT',p_device_id:'staging-preflight',p_operations:[]})}));
  const rpc=checks.find(check=>check.id==='rpc-empty-batch');
  const observation=rpc.code==='PGRST202'?'rpc-not-in-schema-cache':rpc.code==='22023'?'rpc-validation-reachable':rpc.code==='42501'?'rpc-access-denied':'inconclusive';
  const expectsAbsent=['baseline','rolled-back'].includes(target.phase);
  const expectationMatched=expectsAbsent?rpc.code==='PGRST202':role!=='anonymous' && rpc.code==='22023';
  const session=checks.find(check=>check.id==='session');
  const table=checks.find(check=>check.id==='table-read-no-rows');
  const passed=checks[0].httpStatus===200 && (token?session?.authenticated===true && table?.httpStatus===200:true) && expectationMatched;
  return {...buildPlan(config),testedAt:new Date().toISOString(),role,checks,rpcObservation:observation,preflightPassed:passed,scope:'API reachability only; no score writes, DDL, cache reload or production readiness verified'};
}
export async function main(args=process.argv.slice(2)){
  const allowed=new Set(['--config','--output','--role','--probe']);
  const options={};
  for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))fail('UNKNOWN_ARGUMENT');const key=args[i];if(key==='--probe')options.probe=true;else{if(!args[i+1] || args[i+1].startsWith('--'))fail('ARGUMENT_VALUE_REQUIRED');options[key.slice(2)]=args[++i];}}
  let config=null;
  if(options.config){try{config=JSON.parse(readFileSync(resolve(options.config),'utf8'));}catch{fail('INVALID_STAGING_CONFIG_FILE');}}
  if(options.probe && !config)fail('STAGING_CONFIG_REQUIRED');
  const result=options.probe?await probeStaging(config,{role:options.role || 'anonymous'}):buildPlan(config);
  if(options.output){const path=resolve(options.output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result,null,2));
  if(options.probe && !result.preflightPassed)process.exitCode=2;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(safeCode(error?.code) || 'PREFLIGHT_FAILED');process.exitCode=1;});
