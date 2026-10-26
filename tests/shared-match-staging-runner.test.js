import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const runner=resolve('supabase/proposals/shared-score-rpc-v31.0.77/staging/run-rpc-review.ps1');
const options={skip:process.platform!=='win32',timeout:20000};
const invoke=(args,file=runner)=>spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',file,...args],{encoding:'utf8',timeout:15000});
const target=['-SessionPoolerHost','aws-1-us-east-2.pooler.supabase.com','-ProjectRef','darbakmabpbkikisadop','-PrepareOnly'];

for(const action of ['Install','Rollback','Restore','PublicationFix']) {
  test(`staging ${action} preparation pins reviewed SQL and never executes a database connection`,options,()=>{
    const result=invoke(['-Action',action,...target]);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Prepared only. No database connection or SQL execution/);
    const evidence=result.stdout.match(/evidence: ([^\r\n]+)/)?.[1];
    assert.ok(evidence);
    const manifest=JSON.parse(readFileSync(join(evidence,'run.json'),'utf8'));
    assert.equal(manifest.executed,false);
    assert.equal(manifest.projectRef,'darbakmabpbkikisadop');
    assert.equal(manifest.action,action);
    const phase=action==='PublicationFix'?'publication-fix':action.toLowerCase();
    const original=readFileSync(resolve('supabase/proposals/shared-score-rpc-v31.0.77',phase+'-review.sql'));
    assert.equal(manifest.sqlSha256,createHash('sha256').update(original).digest('hex').toUpperCase());
    const driver=readFileSync(join(evidence,'phase.sql'),'utf8');
    assert.ok(driver.includes(`/shared-score-rpc-v31.0.77/${phase}-review.sql'`));
    assert.ok(driver.includes(`'reviewed-${phase}'`));
    for(const name of ['before-schema.csv','before-preflight.csv','after-schema.csv','after-preflight.csv'])assert.ok(driver.includes(name));
    assert.ok(driver.indexOf('before-schema.csv')<driver.indexOf(`/${phase}-review.sql'`));
    assert.ok(driver.indexOf('after-schema.csv')>driver.indexOf(`/${phase}-review.sql'`));
    assert.doesNotMatch(driver,/ueallqqmdyzwdlmoyxfo|fixture\.sql/);
  });
}

for(const [name,args,reason] of [
  ['production target',['-ProjectRef','ueallqqmdyzwdlmoyxfo','-SessionPoolerHost','aws-1-us-east-2.pooler.supabase.com','-PrepareOnly'],/Wrong target/],
  ['URL instead of hostname',['-ProjectRef','darbakmabpbkikisadop','-SessionPoolerHost','https://aws-1-us-east-2.pooler.supabase.com','-PrepareOnly'],/Expected a Supabase Session pooler/],
  ['unknown action',['-Action','Destroy',...target],/ValidateSet/],
]) {
  test(`staging runner refuses ${name} before preparing or connecting`,options,()=>{
    const result=invoke(args);
    assert.notEqual(result.status,0);
    assert.match(result.stdout+result.stderr,reason);
    assert.doesNotMatch(result.stdout,/evidence:/);
  });
}

test('staging runner refuses a modified copy of reviewed SQL before preparing or connecting',options,()=>{
  const root=resolve('tmp/report-qa/shared-staging/runner-guard-'+randomUUID()),staging=join(root,'staging');
  mkdirSync(staging,{recursive:true});
  copyFileSync(runner,join(staging,'run-rpc-review.ps1'));
  writeFileSync(join(root,'install-review.sql'),'-- deliberately modified isolated test copy\n');
  const result=invoke(target,join(staging,'run-rpc-review.ps1'));
  assert.notEqual(result.status,0);
  assert.match(result.stdout+result.stderr,/Reviewed SQL fingerprint changed/);
  assert.doesNotMatch(result.stdout,/evidence:/);
});
