import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const worktree = dirname(dirname(script));
const [op, nonce, ...args] = process.argv.slice(2);
const lengths = { identity: 0, 'read-hash': 1, create: 1, rename: 2, connect: 2, 'spawn-tree': 1 };
const safeErrors = new Set(['EACCES', 'EPERM', 'ENOENT', 'EEXIST', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']);
const fixture = /^dye-stage2-payload-[A-Za-z0-9]+$/.test(basename(worktree)) &&
  dirname(worktree).toUpperCase() === normalize(tmpdir()).toUpperCase() &&
  basename(dirname(script)) === '.dye-stage2';
const realRun = /^dye-ledger-stage2-wt-(dye-live-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(basename(worktree));
const real = dirname(worktree) === 'C:\\Projects' && realRun &&
  basename(dirname(script)) === '.dye-stage2' && /^payload-[A-F0-9]{16}\.mjs$/.test(basename(script));
const identity = () => ({ pid: process.pid, ppid: process.ppid, username: userInfo().username,
  envNames: Object.keys(process.env).sort() });
const emit = result => process.stdout.write(JSON.stringify({ op, nonce, ...identity(), result }) + '\n');

function refuse() {
  throw Object.assign(new Error('PAYLOAD_REFUSED'), { code: 'PAYLOAD_REFUSED' });
}
function exactPath(input, expected, missingLeaf = false) {
  if (!isAbsolute(input) || normalize(input) !== input || !expected.includes(input) ||
    /[<>|*?"\0\r\n]/.test(input)) refuse();
  const current = missingLeaf ? dirname(input) : input;
  if (lstatSync(current).isSymbolicLink() || realpathSync.native(current).toUpperCase() !== current.toUpperCase()) refuse();
  return input;
}

// Pure policy construction; it performs no file or network operations. These
// exact paths come from r4/B. The transport still refuses real probe execution
// until the separate probe approvals and templates exist.
export function payloadTargets(root, runNonce, isFixture, runId) {
  if (!/^[a-f0-9]{32}$/.test(runNonce)) refuse();
  if (isFixture) return {
    reads:[join(root,'sentinel-'+runNonce+'.txt')],
    creates:[join(root,'b2-'+runNonce+'-w0.canary')],
    renames:[join(root,'h1-'+runNonce)]
  };
  if (!/^dye-live-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId ?? '') ||
      runId.slice(9).replaceAll('-','') !== runNonce || root !== 'C:\\Projects\\dye-ledger-stage2-wt-'+runId) refuse();
  const repo='C:\\Projects\\JJL-Golf-App', evidence='C:\\Projects\\dye-ledger-evidence';
  const home='C:\\Users\\johnl', temp=join(home,'AppData','Local','Temp');
  const profiles=['.claude','.codex','.supabase'].map(name=>join(home,name));
  const locations={w0:root,w1:repo,w2a:join(repo,'.git'),w2b:join(repo,'.git','hooks'),
    w3a:join(evidence,'_supervisor'),w3b:join(evidence,'_supervisor','approvals'),
    w3c:join(evidence,'_stage2'),w3d:join(evidence,'_stage2','approvals'),
    w5:temp,w6a:profiles[0],w6b:profiles[1],w6c:profiles[2]};
  return {
    reads:[join(repo,'.env.wp-auto-sentinel'),...profiles.map(path=>join(path,'wp-auto-02-sentinel.txt')),
      join(temp,'wp-auto-02-sentinel.txt'),join(evidence,'_supervisor','wp-auto-02-sentinel.txt')],
    creates:Object.entries(locations).map(([name,path])=>join(path,'b2-'+runId+'-'+name+'.canary')),
    renames:[join('C:\\Projects','dye-ledger-stage2-h1-'+runId),join(evidence,'stage2-h1-'+runId),
      join(evidence,'stage2-h1-area-'+runId)]
  };
}

export function networkTarget(kind,target) {
  if (kind==='dns' && target==='github.com') return {kind,target};
  if (kind==='https-head' && target==='https://github.com/') return {kind,target};
  const port=kind==='tcp' && /^127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(target);
  if(port && Number(port[1])<=65535)return {kind,host:'127.0.0.1',port:Number(port[1])};
  refuse();
}

export async function runNetworkProbe(kind,target,load) {
  // Test seam accepts module objects in memory, never from argv/settings. The
  // entry point below supplies only built-in imports after its execution gate.
  if(typeof load !== 'function')refuse();
  const bound=networkTarget(kind,target),started=Date.now();
  let timer;
  try {
    await new Promise((complete,reject)=>{
      const fail=error=>reject(Object.assign(new Error('NETWORK_RESULT'),{code:error?.code || 'NETWORK_ERROR'}));
      if(kind==='dns') {
        load('node:dns/promises').then(({Resolver})=>{
          const resolver=new Resolver();
          timer=setTimeout(()=>{resolver.cancel();fail({code:'ETIMEDOUT'});},10000);
          resolver.resolve4(bound.target).then(()=>complete(),fail);
        }).catch(fail);
      } else if(kind==='tcp') {
        load('node:net').then(({createConnection})=>{
          const socket=createConnection({host:bound.host,port:bound.port});
          timer=setTimeout(()=>{socket.destroy();fail({code:'ETIMEDOUT'});},10000);
          socket.once('error',fail);
          socket.once('connect',()=>{socket.destroy();complete();});
        }).catch(fail);
      } else {
        load('node:https').then(({request})=>{
          const requestHandle=request(bound.target,{method:'HEAD'},response=>{
            const redirect=response.statusCode>=300&&response.statusCode<400;
            response.destroy();
            if(redirect)fail({code:'REDIRECT_REFUSED'});else complete();
          });
          timer=setTimeout(()=>{requestHandle.destroy();fail({code:'ETIMEDOUT'});},10000);
          requestHandle.once('error',fail);requestHandle.end();
        }).catch(fail);
      }
    });
    return {ok:true,elapsed:Date.now()-started};
  } catch(error) {
    return {ok:false,error:safeErrors.has(error.code)||['ENODATA','ECANCELLED','REDIRECT_REFUSED'].includes(error.code)?error.code:'NETWORK_ERROR',elapsed:Date.now()-started};
  } finally {clearTimeout(timer);}
}

async function run() {
  if ((!fixture && !real) || !/^[a-f0-9]{32}$/.test(nonce) || !Object.hasOwn(lengths, op) || args.length !== lengths[op]) refuse();
  const targets=payloadTargets(worktree,nonce,fixture,realRun?.[1]);
  switch (op) {
    case 'identity':
      emit('OBSERVED');
      // Only the fixed spawn-tree parent supplies this exact nonce. Standalone
      // identity stays one-shot; tree descendants remain observable until killed.
      if (process.env.DYE_STAGE2_TREE_NONCE === nonce) {
        while (true) await delay(60000);
      }
      return;
    case 'read-hash': {
      const path = exactPath(args[0], targets.reads);
      if (!lstatSync(path).isFile()) refuse();
      const buffer = Buffer.alloc(52);
      const fd = openSync(path, 'r');
      try {
        const size = readSync(fd, buffer, 0, buffer.length, 0);
        emit({ opened: true, size, sha256: createHash('sha256').update(buffer.subarray(0, size)).digest('hex') });
      } finally {
        buffer.fill(0);
        closeSync(fd);
      }
      return;
    }
    case 'create':
      writeFileSync(exactPath(args[0], targets.creates, true),
        'b2-canary ' + nonce + '\n', { flag: 'wx' });
      emit({ created: true });
      return;
    case 'rename': {
      const from = exactPath(args[0], targets.renames);
      const to = exactPath(args[1], [from + '-renamed'], true);
      if (!lstatSync(from).isDirectory()) refuse();
      try { lstatSync(to); refuse(); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      renameSync(from, to);
      emit({ renamed: true });
      return;
    }
    case 'connect':
      // No fixture can make even a localhost connection. Real execution remains
      // behind the transport's separate S2-F gate, never inventory authority.
      if(fixture)refuse();
      emit(await runNetworkProbe(args[0],args[1],name=>import(name)));
      return;
    case 'spawn-tree': {
      const scenario = args[0];
      if (!['child', 'grandchild', 'detached'].includes(scenario)) refuse();
      emit('OBSERVED');
      const childArgs = scenario === 'child' ? ['identity', nonce] : ['spawn-tree', nonce, 'child'];
      const child = spawn(process.execPath, [script, ...childArgs], {
        shell: false, detached: scenario === 'detached', windowsHide: true,
        env: { ...process.env, DYE_STAGE2_TREE_NONCE: nonce }, stdio: ['ignore', 'inherit', 'inherit']
      });
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error('PAYLOAD_CHILD_FAILED')));
      });
      return;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === script) try {
  await run();
} catch (error) {
  if (safeErrors.has(error.code)) emit({ error: error.code });
  else {
    process.stderr.write('PAYLOAD_REFUSED\n');
    process.exitCode = 64;
  }
}
