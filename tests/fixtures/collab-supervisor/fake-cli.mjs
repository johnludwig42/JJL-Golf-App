import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
let [operation, ...extra] = process.argv.slice(2);
if (operation === 'codex' || operation === 'claude') {
  const names = Object.keys(process.env);
  if (names.some(name => /^(OPENAI_|ANTHROPIC_|CODEX_|SUPABASE_|GH_|GITHUB_|NODE_OPTIONS$|NODE_PATH$|npm_)/i.test(name))) process.exit(65);
  if (operation === 'claude' &&
    (process.env.DISABLE_AUTOUPDATER !== '1' || process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC !== '1')) process.exit(65);
  const args = extra.join(' ');
  if (args === '--version') operation = 'version';
  else if (args === '--help' || (operation === 'codex' && ['sandbox --help','exec --help'].includes(args)) ||
    (operation === 'claude' && args === 'auth --help')) operation = 'help';
  else if (operation === 'codex' && args === 'login status') operation = 'text-auth';
  else if (operation === 'claude' && args === 'auth status --json') operation = 'auth';
  else process.exit(64);
  extra = [];
}
if (extra.length) process.exit(64);

switch (operation) {
  case 'pipe-hold': {
    // The disposable helper can transfer only its stdout pipe to the test driver.
    // No caller-supplied executable, helper bytes or helper hash is accepted.
    const helper=join(process.cwd(),'fixture-pipe-helper.ps1');
    if(createHash('sha256').update(readFileSync(helper)).digest('hex').toUpperCase()!==
      'F2227388D70EC5F1EAB09D72627F419C5D2247536F1CEE3A4D543748097049F6')process.exit(66);
    const child=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile','-ExecutionPolicy','Bypass','-File',helper],{stdio:'inherit',windowsHide:true,timeout:8000});
    if(child.error||child.status!==0)process.exit(66);
    break;
  }
  case 'version':
    process.stdout.write('synthetic-cli 1.0.0\n');
    break;
  case 'help':
    process.stdout.write('synthetic help\n');
    break;
  case 'text-auth':
    process.stdout.write('logged in using ChatGPT\n');
    break;
  case 'auth':
    process.stdout.write('{"loggedIn":true,"mode":"subscription","stage2-private-key@example.invalid":"stage2-private-marker@example.invalid"}\n');
    process.stderr.write('synthetic diagnostic\n');
    break;
  case 'overflow':
    process.stdout.write('x'.repeat(65537));
    break;
  case 'limit': {
    const json='{"mode":"subscription"}';
    process.stdout.write(json+' '.repeat(65536-json.length));
    break;
  }
  case 'stderr-limit':
    process.stdout.write('{"mode":"subscription"}');
    process.stderr.write(' '.repeat(65536));
    break;
  case 'stderr-overflow':
    process.stdout.write('{"mode":"subscription"}');
    process.stderr.write('x'.repeat(65537));
    break;
  case 'duplicate':
    process.stdout.write('{"mode":"subscription","m\\u006fde":"apiKey"}');
    break;
  case 'sensitive-key':
    process.stdout.write('{"sk-synthetic-only":"free"}');
    break;
  case 'invalid-utf8':
    process.stdout.write(Buffer.from([0xff]));
    break;
  case 'marker':
    process.stdout.write(JSON.stringify({mode:createHash('sha256').update('fixture-stdout|'+(process.env.DYE_SUPERVISOR_CHILD || process.pid)).digest('hex').slice(0,32)}));
    process.stderr.write(createHash('sha256').update('fixture-stderr|'+(process.env.DYE_SUPERVISOR_CHILD || process.pid)).digest('hex').slice(0,32));
    break;
  case 'jwt':
    process.stdout.write('{"mode":"eyJsynthetic.fixture.signature"}');
    break;
  case 'long-hex':
    process.stdout.write(JSON.stringify({mode:'a'.repeat(64)}));
    break;
  case 'long-base64':
    process.stdout.write(JSON.stringify({mode:'QUJD'.repeat(24)}));
    break;
  case 'not-json':
    process.stdout.write('synthetic non-JSON status');
    break;
  case 'nested-private':
  case 'nested-safe':
    process.stdout.write(JSON.stringify({mode:'subscription',
      'fixture@example.invalid':{email:'fixture@example.invalid',url:'https://example.invalid/',
        id:operation==='nested-private'?'01234567-89ab-cdef-0123-456789abcdef':'short-private',unknown:'private-marker'}}));
    process.stderr.write('synthetic diagnostic');
    break;
  case 'ten-mib':
    process.stdout.write(Buffer.alloc(10*1024*1024,120));
    process.stderr.write(Buffer.alloc(10*1024*1024,121));
    break;
  case 'hold':
    await new Promise(resolve => setTimeout(resolve, 8000));
    break;
  default:
    process.exitCode = 64;
}
