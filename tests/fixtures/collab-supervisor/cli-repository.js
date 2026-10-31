// Synthetic repositories only; shared by offline CLI and operator acceptance.
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname,delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync,spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hash } from '../../../scripts/collab-supervisor/lib/policy.js';
export const cli=fileURLToPath(new URL('../../../scripts/collab-supervisor/supervisor.js',import.meta.url));
export const fixture=fileURLToPath(new URL('./fake-agent.js',import.meta.url));
export function cliRepository(changes={}){
  const root=mkdtempSync(join(tmpdir(),'dye-fake-cli-')),repository=join(root,'repository'),evidenceRoot=join(root,'evidence');
  mkdirSync(repository);mkdirSync(evidenceRoot);
  const gitExecutable=(process.env.PATH||'').split(delimiter).map(path=>join(path,process.platform==='win32'?'git.exe':'git')).find(existsSync);
  if(!gitExecutable)throw new Error('Git prerequisite missing');
  const env={SystemRoot:process.env.SystemRoot||'',PATH:dirname(gitExecutable),PATHEXT:'.EXE;.COM',TEMP:tmpdir(),TMP:tmpdir(),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_CONFIG_COUNT:'0',GIT_TERMINAL_PROMPT:'0'};
  const emptyHooks=join(root,'empty-hooks');mkdirSync(emptyHooks);
  const git=args=>execFileSync(gitExecutable,['-c','user.name=Supervisor Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgSign=false','-c',`core.hooksPath=${emptyHooks}`,...args],{cwd:repository,env,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(['init']);mkdirSync(join(repository,'docs'));mkdirSync(join(repository,'scripts'));
  writeFileSync(join(repository,'.gitignore'),'.dye-supervisor-fake.json\nfake-worktrees/\n');
  writeFileSync(join(repository,'docs','fixture.md'),'Synthetic baseline\n');
  writeFileSync(join(repository,'package.json'),'{}\n');
  for(const name of ['validate-release','release-sanity-check'])writeFileSync(join(repository,'scripts',name+'.js'),`// DYE_SUPERVISOR_FAKE_CHECK\nprocess.stdout.write('fixture check passed\\n');\n`);
  git(['add','.']);git(['commit','-m','Disposable fake CLI baseline']);
  const token=randomUUID();writeFileSync(join(repository,'.dye-supervisor-fake.json'),JSON.stringify({kind:'dye-supervisor-test-repository',token}));
  const packageFile=join(root,'package.md');writeFileSync(packageFile,'Synthetic Phase A test package only.\n');
  const authExpectation={codexLine:'Synthetic subscription',versions:{codex:'fixture-v1',claude:'fixture-v1'},claudeFields:{syntheticAuthSource:'fixture-subscription',authenticated:true}};
  const config={kind:'fake',mode:'fake',testHarness:true,repository,evidenceRoot,packageFile,packageId:'WP-FAKE-CLI',token,gitExecutable,fixtureHash:hash(readFileSync(fixture)),
    scenarios:{implement:['implemented'],review:['ready']},totalMs:120000,stepMs:5000,requiredChecks:['validate','release:sanity','diff-check'],authExpectation,
    authFixture:{versions:authExpectation.versions,exit:0,codexLine:authExpectation.codexLine,claudeJson:JSON.stringify(authExpectation.claudeFields)},...changes};
  const path=join(root,'config.json');writeFileSync(path,JSON.stringify(config,null,2));
  return{root,config,path,git};
}
export function invokeCli(command,test,flags=[],overrides={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,command,'--spec',test.path,...flags],{env:{...process.env,DYE_SUPERVISOR_TEST:'1',DYE_A5_OPERATOR:'0',...overrides},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
    child.on('error',reject);child.on('close',exit=>resolve({exit,stdout,stderr}));
  });
}
