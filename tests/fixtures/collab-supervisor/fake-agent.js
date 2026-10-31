const scenario = process.argv[2];
import { existsSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const release=argument('--release-file');
const destination=argument('--fixture-write');
if(destination && ['implemented','dispute'].includes(scenario)){mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,`Synthetic round ${argument('--fixture-round')}\n`);}
if(release){const hold=setInterval(()=>{if(existsSync(release) && scenario!=='hang')clearInterval(hold);},10);}
const finding = { id: 'R1', severity: 'medium', file: 'docs/example.md', line: 1, scenario: 'Synthetic review correction', criterion: 'C1' };
const results = {
  implemented: { status: 'implemented', summary: 'Synthetic implementation', criteria: [{ id: 'C1', result: 'PASS' }], disputes: [] },
  ready: { verdict: 'ready', findings: [] },
  findings: { verdict: 'findings', findings: [finding] },
  needs_owner: { status: 'needs_owner', summary: 'Owner decision', criteria: [], disputes: [] },
  blocked: { status: 'blocked', summary: 'Blocked', criteria: [], disputes: [] },
  dispute: { status: 'implemented', summary: 'Disputed', criteria: [], disputes: ['R1'] }
};
if (scenario === 'hang') setInterval(() => {}, 1000);
else if (scenario === 'usage') process.stdout.write('usage limit reached');
else if (scenario === 'garbage') process.stdout.write('{invalid');
else if (Object.hasOwn(results, scenario)) process.stdout.write(JSON.stringify(results[scenario]));
else process.exitCode = 2;
