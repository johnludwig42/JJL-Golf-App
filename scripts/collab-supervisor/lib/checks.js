import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHECKS, hash, fault } from './policy.js';
export function checkSpec(name, git, base, node) {
  if (!Object.hasOwn(CHECKS, name)) throw fault('NOT_APPROVED');
  git.hygiene();
  for (const path of CHECKS[name]) {
    const expected = git.run(['show', `${base}:${path}`], { binary: true });
    if (hash(expected) !== hash(readFileSync(resolve(git.root, path)))) return { result: 'NOT_RUN', reason: 'Execution closure differs from approved baseline' };
  }
  return name === 'diff-check' ? { executable: git.executable, args: ['diff', '--check'], env: git.environment, result: 'ELIGIBLE' }
    : { executable: node, args: [resolve(git.root, CHECKS[name][0])], env: git.environment, result: 'ELIGIBLE' };
}
export async function runCheck(name, context) {
  const before = context.git.status(); const spec = checkSpec(name, context.git, context.base, context.node);
  if (spec.result === 'NOT_RUN') return spec;
  // Actual host execution needs a reviewed trusted bundle. Phase A uses an
  // explicit injected fixture executor; no shell or npm is selected here.
  if (!context.execute) return { result: 'NOT_RUN', reason: 'No approved check executor' };
  const outcome = await context.execute(spec);
  const after = context.git.status();
  return { result: outcome.exit === 0 ? 'PASS' : 'FAIL', before, after, output: outcome.output, changed: before !== after };
}
