// Synthetic localhost only; run after run-local.sql. Closes DYE-REVIEW permanently.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const psql=process.argv[2] || 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const args=['-X','-h','127.0.0.1','-p','55477','-U','postgres','-d','dye_rpc_review','-v','ON_ERROR_STOP=1'];
function run(sql,onOutput=()=>{}) {
 const process=spawn(psql,args,{windowsHide:true});let output='';
 const done=new Promise((resolve,reject)=>{
  process.on('error',reject);process.stdout.on('data',data=>{output+=data;onOutput(output);});
  process.stderr.on('data',data=>{output+=data;});process.on('close',code=>resolve({code,output}));
 });
 process.stdin.end(sql);return done;
}
const guard=`do $$begin if current_database()<>'dye_rpc_review' or inet_server_addr()<>'127.0.0.1'::inet or current_setting('port')<>'55477' then raise exception 'Wrong test database';end if;end$$;`;
let signal;const locked=new Promise(resolve=>signal=resolve);
const host=run(`${guard}
begin;update public.matches set status='complete' where id='DYE-REVIEW';
\\echo HOST_LOCKED
select pg_sleep(1);commit;`,text=>{if(text.includes('HOST_LOCKED'))signal();});
await Promise.race([locked,host.then(result=>{throw new Error(`Host exited before locking: ${result.output}`);})]);
const start=Date.now(),auth=`${guard}
\\set VERBOSITY verbose
set role authenticated;select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',false);`;
const results=await Promise.all([
 run(`${auth} update public.score_entries set gross=8 where id='score-0';`),
 run(`${auth} select * from public.submit_shared_score_operations('DYE-REVIEW','host',jsonb_set(jsonb_set(public.review_ops(1),'{0,operation_id}',to_jsonb(gen_random_uuid()::text)),'{0,score_entry,gross}','8'));`)
]);
assert.equal((await host).code,0);
for(const [index,result] of results.entries()) {
 assert.notEqual(result.code,0);assert.match(result.output,/P7701/);
 console.log(`PASS: ${index===0?'DIRECT':'RPC'} score delivery waits for host completion and rejects the late change`);
}
assert.ok(Date.now()-start>=500,'delivery must wait for the completion lock');
const verify=await run(`${guard} select public.review_assert((select gross from public.score_entries where id='score-0')=6,'completion race leaves the committed score unchanged');`);
assert.equal(verify.code,0);console.log('PASS: completion race preserves committed score');
