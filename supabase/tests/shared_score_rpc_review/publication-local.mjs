// Disposable localhost PostgreSQL only; never a Supabase connection.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const psql=process.env.DYE_LOCAL_PSQL||'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const args=['-X','-h','127.0.0.1','-p','55477','-U','postgres','-w','-d','dye_rpc_review','-v','ON_ERROR_STOP=1'];
const probe=spawnSync(psql,[...args,'-At','-c',"select current_database()||'|'||host(inet_server_addr())||'|'||current_setting('port')||'|'||(select count(*) from pg_tables where schemaname='public')"],{encoding:'utf8'});
if(probe.status!==0||probe.stdout.trim()!=='dye_rpc_review|127.0.0.1|55477|0')throw Error('Expected EMPTY disposable dye_rpc_review at loopback port 55477; no changes made');
const dir=resolve('tmp/report-qa/shared-staging/publication-local');mkdirSync(dir,{recursive:true});
const migration=readFileSync('supabase/migrations/202608090001_v30_3_96_identity_shared_publish_remediation.sql','utf8');
const original=migration.match(/create or replace function public\.publish_shared_match_owner\([\s\S]*?end \$\$;/i)?.[0];
if(!original)throw Error('Original migration publication function not found');
writeFileSync(dir+'/original.sql',original+'\nrevoke all on function public.publish_shared_match_owner(jsonb,text,text) from public,anon;\ngrant execute on function public.publish_shared_match_owner(jsonb,text,text) to authenticated;\n');
const include=path=>"\\i '"+resolve(path).replaceAll('\\','/')+"'\n";
let driver='\\set ON_ERROR_STOP on\n'+include('supabase/tests/shared_score_rpc_review/fixture.sql');
driver+="alter table auth.users add column is_anonymous boolean not null default false, add column raw_app_meta_data jsonb not null default '{\"provider\":\"email\"}';\ninsert into auth.users values ('77000000-0000-0000-0000-000000000004',true,'{\"provider\":\"anonymous\"}');\n";
driver+=include(dir+'/original.sql');
driver+="select set_config('dye.shared_rpc_review_authorized','reviewed-install',false);\n"+include('supabase/proposals/shared-score-rpc-v31.0.77/install-review.sql');
driver+=include('supabase/tests/shared_score_rpc_review/contract.sql');
driver+=include('supabase/tests/shared_score_rpc_review/publication-contract.sql');
driver+=include('supabase/tests/shared_score_rpc_review/rollback.sql');
driver+="select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',false);\nset role authenticated;\nselect public.review_assert(public.publish_shared_match_owner(public.review_publication_payload('DYE-900006'),'publication-host','Host')='DYE-900006','publication correction survives RPC rollback and restore');\nreset role;\n";
writeFileSync(dir+'/run.sql',driver);
const result=spawnSync(psql,[...args,'-f',dir+'/run.sql'],{encoding:'utf8',maxBuffer:4*1024*1024});
const output=result.stdout+'\n'+result.stderr;writeFileSync(dir+'/results.log',output);
const passed=(output.match(/NOTICE:  PASS:/g)||[]).length;
console.log(JSON.stringify({passed,exitCode:result.status,log:dir+'/results.log',realSupabase:false}));
if(result.status!==0){console.error(output.slice(-5000));process.exitCode=1;}
