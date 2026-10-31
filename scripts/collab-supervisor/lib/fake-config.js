import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync, lstatSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fault, hash, inside, regular } from './policy.js';
import { readJson } from './processes.js';
import { regularTree } from './git.js';
export const toolRoot = fileURLToPath(new URL('../', import.meta.url));
export const agentFixture = fileURLToPath(new URL('../../../tests/fixtures/collab-supervisor/fake-agent.js', import.meta.url));
export const psRuntime = () => join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export function bundleHash() {
  return hash(regularTree(toolRoot).sort().map(path => `${path.slice(toolRoot.length)}:${hash(readFileSync(path))}`).join('\n'));
}
export function tempPath(path, tempBase = tmpdir()) {
  if (typeof path !== 'string' || !/^(?:[A-Za-z]:[\\/]|\/)/.test(path)) throw fault('NOT_APPROVED', 'Absolute temporary path required');
  const resolved = resolve(path);
  if (/^c:[\\/]projects(?:[\\/]|$)/i.test(resolved) || !inside(realpathSync(tempBase), resolved) || resolved === resolve(tempBase)) throw fault('NOT_APPROVED', 'Fake target must be below OS Temp and outside Projects');
  let parent = resolved;
  while (!existsSync(parent)) parent = dirname(parent);
  if (!inside(realpathSync(tempBase), realpathSync(parent)) || lstatSync(parent).isSymbolicLink()) throw fault('NOT_APPROVED', 'Temporary path redirected');
  return resolved;
}
export function trustedGit(config, args, cwd = config.repository) {
  // Q1 authorizes metadata changes ONLY inside this marked disposable repository.
  tempPath(config.repository, config.osTemp);
  if (readJson(join(config.repository, '.dye-supervisor-fake.json')).token !== config.token) throw fault('NOT_APPROVED', 'Test marker missing');
  if (basename(config.gitExecutable).toLowerCase() !== (process.platform === 'win32' ? 'git.exe' : 'git')) throw fault('NOT_APPROVED');
  if (hash(readFileSync(config.gitExecutable)) !== config.gitHash) throw fault('INTEGRITY', 'Pinned Git changed');
  const inspect = JSON.stringify(args)==='["remote"]' || JSON.stringify(args)==='["rev-parse","HEAD"]';
  const worktree = args.length===5 && args[0]==='worktree' && args[1]==='add' && args[2]==='--detach' && /^[a-f0-9]{40}$/.test(args[4]);
  const remove = args.length===4 && args.slice(0,3).join(' ')==='worktree remove --force';
  const target=worktree?args[3]:remove?args[3]:null;
  if(!inspect && !((worktree||remove)&&inside(join(config.repository,'fake-worktrees'),target)&&target!==join(config.repository,'fake-worktrees')))throw fault('NOT_APPROVED','Git operation outside fake metadata table');
  return execFileSync(config.gitExecutable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${config.emptyHooks}`, '-c', 'core.pager=', '-c', 'diff.external=', ...args], {
    cwd, windowsHide: true, encoding: 'utf8', timeout: 10000,
    env: { SystemRoot: process.env.SystemRoot || '', PATH: '', GIT_DIR:join(config.repository,'.git'),GIT_WORK_TREE:config.repository,GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config.emptyConfig, GIT_ATTR_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore','pipe','pipe'] });
}
export function loadFakeConfig(path) {
  if (process.env.DYE_SUPERVISOR_TEST !== '1') throw fault('NOT_APPROVED', 'Explicit Phase A test gate required');
  tempPath(path); regular(path);
  const input = readJson(path);
  if (input.mode !== 'fake' || input.kind !== 'fake' || input.testHarness !== true) throw fault('NOT_APPROVED', 'Only fake test harness mode is implemented');
  const allowed = ['mode','kind','testHarness','repository','evidenceRoot','packageFile','packageId','token','gitExecutable','fixtureHash','scenarios','totalMs','stepMs','authExpectation','authFixture','requiredChecks'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw fault('NOT_APPROVED', 'Unknown configuration field');
  if (!/^WP-FAKE-[A-Z0-9-]+$/.test(input.packageId) || !/^[a-f0-9-]{36}$/.test(input.token)) throw fault('NOT_APPROVED', 'Synthetic package and token required');
  const osTemp = realpathSync(tmpdir());
  const config = { ...input, osTemp, configPath: resolve(path), configHash: hash(readFileSync(path)), phase: 'A', bundle: bundleHash(), fixture: agentFixture };
  for (const key of ['repository','evidenceRoot','packageFile']) config[key] = tempPath(input[key], osTemp);
  regular(config.packageFile);
  if (!lstatSync(config.gitExecutable).isFile() || lstatSync(config.gitExecutable).isSymbolicLink()) throw fault('INTEGRITY');
  if (config.fixtureHash !== hash(readFileSync(agentFixture))) throw fault('INTEGRITY', 'Pinned fake fixture changed');
  const marker = readJson(join(config.repository, '.dye-supervisor-fake.json'));
  if (marker.kind !== 'dye-supervisor-test-repository' || marker.token !== config.token || !lstatSync(join(config.repository,'.git')).isDirectory() || lstatSync(join(config.repository,'.git')).isSymbolicLink()) throw fault('NOT_APPROVED', 'Throwaway repository marker required');
  regularTree(join(config.repository, '.git'));
  if (existsSync(join(config.repository,'.git','commondir')) || existsSync(join(config.repository,'.git','objects','info','alternates'))) throw fault('NOT_APPROVED', 'Repository metadata must not redirect outside the throwaway target');
  if (inside(config.repository, config.evidenceRoot) || inside(config.evidenceRoot, config.repository)) throw fault('NOT_APPROVED', 'Evidence and repository must be separate');
  mkdirSync(config.evidenceRoot, { recursive: true });
  config.emptyHooks = join(config.evidenceRoot, 'empty-hooks'); mkdirSync(config.emptyHooks, { recursive: true });
  config.emptyConfig = join(config.evidenceRoot, 'empty-config'); if (!existsSync(config.emptyConfig)) writeFileSync(config.emptyConfig, '', {flag:'wx'});
  config.gitHash = hash(readFileSync(config.gitExecutable));
  if (trustedGit(config,['remote']).trim()) throw fault('NOT_APPROVED', 'Fake repository must have no remote');
  config.baseSha = trustedGit(config,['rev-parse','HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(config.baseSha)) throw fault('INTEGRITY');
  for (const field of ['totalMs','stepMs']) if (!Number.isInteger(config[field]) || config[field] < 100 || config[field] > 120000) throw fault('NOT_APPROVED', 'Fake budgets must be bounded');
  const scenarios = ['implemented','ready','findings','needs_owner','blocked','dispute','garbage','usage','hang','crash-once'];
  for (const role of ['implement','review']) if (!Array.isArray(config.scenarios?.[role]) || !config.scenarios[role].length || config.scenarios[role].some(value=>!scenarios.includes(value))) throw fault('NOT_APPROVED', 'Finite fake scenarios required');
  if (!Array.isArray(config.requiredChecks) || config.requiredChecks.some(name=>!['validate','release:sanity','diff-check'].includes(name))) throw fault('NOT_APPROVED');
  return config;
}
