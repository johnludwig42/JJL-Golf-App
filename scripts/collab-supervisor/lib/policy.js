import { realpathSync, lstatSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const PHASE = 'A';
export const REAL_EXECUTION_ENABLED = false;
export const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
export const CHECKS = Object.freeze({
  validate: ['scripts/validate-release.js', 'package.json'],
  'release:sanity': ['scripts/release-sanity-check.js', 'package.json'],
  'diff-check': []
});
export function fault(code, message = code) { return Object.assign(new Error(message), { code }); }
export function inside(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
export function regular(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw fault('INTEGRITY', `Non-regular or linked file: ${path}`);
  return realpathSync(path);
}
export function fakeTarget(config) {
  if (!config || config.mode !== 'fake' || !config.node || !config.fixture || !config.fixtureRoot || !config.fixtureHash) throw fault('NOT_PLATFORM_ACCEPTED');
  const executable = regular(config.node);
  if (executable !== realpathSync(process.execPath)) throw fault('NOT_PLATFORM_ACCEPTED', 'Only the current pinned Node runtime may launch a fake fixture');
  const fixture = regular(config.fixture);
  if (!inside(realpathSync(config.fixtureRoot), fixture) || basename(fixture) !== 'fake-agent.js' || hash(readFileSync(fixture)) !== config.fixtureHash) throw fault('INTEGRITY', 'Untrusted fake fixture');
  return { executable, fixture };
}
export function realEligibility({ phase, approval, platform, bundle, versions } = {}) {
  if (phase !== 'B' && phase !== 'C') throw fault('NOT_APPROVED');
  if (!approval || approval.phase !== phase || approval.bundle !== bundle) throw fault('NOT_APPROVED');
  if (!platform || platform.bundle !== bundle || JSON.stringify(platform.versions) !== JSON.stringify(versions) || platform.reviewed !== true || !platform.required?.length || platform.required.some(row => row.result !== 'PASS')) throw fault('NOT_PLATFORM_ACCEPTED');
  return true;
}
export function refuseReal() { throw fault('NOT_PLATFORM_ACCEPTED', 'Phase A has no real-agent execution adapter, including version/auth probes'); }
const SAFE_SCENARIOS = new Set(['implemented', 'ready', 'findings', 'needs_owner', 'blocked', 'dispute', 'garbage', 'usage', 'hang']);
export function launchSpec(kind, config, scenario) {
  if (kind !== 'fake-agent') throw fault('NOT_APPROVED', `Dispatch refused: ${kind}`);
  if (!SAFE_SCENARIOS.has(scenario)) throw fault('AGENT_ERROR', 'Unknown fixture scenario');
  const { executable, fixture } = fakeTarget(config);
  return Object.freeze({ executable, args: Object.freeze([fixture, scenario]), shell: false });
}
export function childEnvironment(parent = {}, scratch, marker, runtimePaths = []) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'LANG', 'LC_ALL']) if (parent[key]) env[key] = parent[key];
  env.PATH = runtimePaths.join(process.platform === 'win32' ? ';' : ':');
  env.TEMP = scratch; env.TMP = scratch; env.DYE_SUPERVISOR_CHILD = marker;
  return env;
}
export function spawnAllowed(kind, config, scenario, options = {}) {
  const spec = launchSpec(kind, config, scenario);
  options.audit?.(spec);
  return spawn(spec.executable, [...spec.args], { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
