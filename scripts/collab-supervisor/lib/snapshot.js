import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fault, hash, regular, inside } from './policy.js';
import { regularTree } from './git.js';
export function snapshot(git, destination) {
  git.hygiene(); const hashes = {};
  for (const path of git.paths()) {
    const source = resolve(git.root, path); const target = resolve(destination, path);
    if (!inside(git.root, source) || !inside(destination, target)) throw fault('INTEGRITY');
    regular(source); const bytes = readFileSync(source); mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: 'wx' }); hashes[path] = hash(readFileSync(target));
  }
  return hashes;
}
export function verifySnapshot(root, hashes) {
  const actual = Object.fromEntries(regularTree(root).map(path => [relative(root, path).replaceAll('\\', '/'), hash(readFileSync(path))]));
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(hashes).sort())) throw fault('INTEGRITY', 'Review snapshot changed');
}
