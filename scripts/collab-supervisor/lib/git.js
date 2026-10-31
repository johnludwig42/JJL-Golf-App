import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { fault, hash, inside } from './policy.js';

export class Git {
  constructor({ executable, root, gitDir, emptyConfig, emptyHooks, pointer = null }) {
    if (![executable, root, gitDir, emptyConfig, emptyHooks].every(isAbsolute)) throw fault('INTEGRITY', 'Explicit absolute Git paths required');
    // System Git installations may legitimately hard-link their executable.
    // Pin its resolved bytes outside the working tree; link refusal still applies
    // to every agent-controlled file and snapshot.
    const executableInfo = lstatSync(executable);
    if (!executableInfo.isFile() || executableInfo.isSymbolicLink() || inside(root, executable)) throw fault('INTEGRITY', 'Untrusted Git executable');
    this.executable = realpathSync(executable); this.executableHash = hash(readFileSync(this.executable));
    this.root = resolve(root); this.gitDir = resolve(gitDir);
    this.pointer = pointer; this.pointerHash = pointer ? hash(readFileSync(pointer)) : null;
    this.config = [
      ['core.fsmonitor', 'false'], ['core.hooksPath', emptyHooks], ['diff.external', ''],
      ['core.pager', ''], ['core.attributesFile', emptyConfig], ['core.quotePath', 'false']
    ];
    this.environment = { SystemRoot: process.env.SystemRoot || '', PATH: '',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
      GIT_DIR: this.gitDir, GIT_WORK_TREE: this.root,
      GIT_CONFIG_COUNT: String(this.config.length) };
    this.config.forEach(([key, value], index) => {
      this.environment[`GIT_CONFIG_KEY_${index}`] = key;
      this.environment[`GIT_CONFIG_VALUE_${index}`] = value;
    });
  }
  verifyPointer() {
    if (this.pointer && (hash(readFileSync(this.pointer)) !== this.pointerHash || !lstatSync(this.pointer).isFile())) throw fault('INTEGRITY', 'Git pointer changed');
  }
  run(args, { binary = false } = {}) {
    this.verifyPointer();
    if (hash(readFileSync(this.executable)) !== this.executableHash) throw fault('INTEGRITY', 'Pinned Git executable changed');
    const exact = [
      ['rev-parse', 'HEAD'], ['rev-parse', '--abbrev-ref', 'HEAD'],
      ['status', '--porcelain'], ['status', '--porcelain=v1'],
      ['for-each-ref', '--format=%(refname) %(objectname)'],
      ['ls-files', '--stage'], ['ls-files', '-co', '--exclude-standard', '-z'],
      ['ls-files', '--others', '--exclude-standard', '-z'],
      ['diff', '--name-only', 'HEAD', '-z'], ['diff', '--check']
    ];
    const fixed = exact.some(form => JSON.stringify(form) === JSON.stringify(args));
    const show = args.length === 2 && args[0] === 'show' && /^[a-f0-9]{40}:(scripts\/(validate-release|release-sanity-check)\.js|package\.json)$/.test(args[1]);
    const capture = (args.length === 5 || args.length === 6) && args.slice(0, 4).join(' ') === 'diff --binary --no-ext-diff --no-textconv' && /^[a-f0-9]{40}$/.test(args[4]) &&
      (args.length === 5 || (args[5].startsWith('--output=') && isAbsolute(args[5].slice(9)) && !inside(this.root, args[5].slice(9))));
    if ((!fixed && !show && !capture) || args.some(value => /\x00|\r|\n/.test(value))) throw fault('NOT_APPROVED', 'Git arguments not in the fixed inspection table');
    try {
      return execFileSync(this.executable, ['--no-optional-locks', `--git-dir=${this.gitDir}`, `--work-tree=${this.root}`, ...args], {
        cwd: this.root, env: this.environment, windowsHide: true, encoding: binary ? undefined : 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) { throw fault('INTEGRITY', `Git ${args[0]} failed (${error.status ?? error.code})`); }
  }
  identity() { return { head: this.run(['rev-parse', 'HEAD']).trim(), refs: this.run(['for-each-ref', '--format=%(refname) %(objectname)']) }; }
  assertIdentity(before) { if (JSON.stringify(this.identity()) !== JSON.stringify(before)) throw fault('INTEGRITY', 'HEAD or refs moved'); }
  paths() { return [...new Set(this.run(['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean))]; }
  status() { return this.run(['status', '--porcelain=v1']); }
  hygiene() {
    this.verifyPointer();
    if (this.run(['ls-files', '--stage']).split('\n').some(line => line.startsWith('120000 '))) throw fault('INTEGRITY', 'Tracked symlink refused');
    for (const path of this.paths()) {
      const segments = path.split(/[\\/]/); let next = this.root;
      for (const segment of segments) {
        next = join(next, segment);
        if (!existsSync(next)) continue;
        const info = lstatSync(next);
        if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw fault('INTEGRITY', 'Linked path refused');
      }
    }
  }
  assertScope(allowedPaths) {
    const changed = this.run(['diff', '--name-only', 'HEAD', '-z']).split('\0').filter(Boolean);
    const untracked = this.run(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    for (const path of [...changed, ...untracked]) {
      if (!allowedPaths.some(allowed => path === allowed || (allowed.endsWith('/') && path.startsWith(allowed)))) throw fault('SCOPE', path);
    }
  }
}

export function regularTree(root) {
  const found = [];
  function walk(directory) {
    for (const row of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, row.name); const info = lstatSync(path);
      if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) throw fault('INTEGRITY', 'Snapshot contains linked/non-regular path');
      if (info.isDirectory()) walk(path); else found.push(path);
    }
  }
  walk(root); return found;
}
