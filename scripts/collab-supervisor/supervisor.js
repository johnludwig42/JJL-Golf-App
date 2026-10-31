import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { refuseReal } from './lib/policy.js';
import { report } from './lib/report.js';
import { fakeCommand } from './lib/fake-runtime.js';
import { EXIT } from './lib/state.js';

export function main(args) {
  const [command, path] = args;
  if (command === 'status' && path && path!=='--spec') {
    return report(JSON.parse(readFileSync(path, 'utf8')), { reconstructed: true });
  }
  if (['approve','run','resume','recover','status'].includes(command) && args[1]==='--spec' && args[2]) {
    const flags=args.slice(3);if(flags.some(flag=>!['--fixture-consent','--retry-agent','--damaged-confirmed'].includes(flag)))refuseReal();
    return fakeCommand(command,args[2],{fixtureConsent:flags.includes('--fixture-consent'),retryAgent:flags.includes('--retry-agent'),damagedConfirmed:flags.includes('--damaged-confirmed')});
  }
  if (['approve', 'run', 'resume', 'recover', 'platform-probes'].includes(command)) refuseReal();
  throw Object.assign(new Error('Phase A: use the offline test suite; production operations are disabled.'), { code: 'NOT_APPROVED' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result=await main(process.argv.slice(2));process.stdout.write(typeof result==='string'?result:result.output);if(typeof result!=='string')process.exitCode=result.exit; }
  catch (error) { process.stderr.write(`${error.code || 'AGENT_ERROR'}: ${error.message}\n`); process.exitCode = EXIT[error.code]??99; }
}
