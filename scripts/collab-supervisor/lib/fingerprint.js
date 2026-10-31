import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fault, hash, inside, regular } from './policy.js';
import { Buffer } from 'node:buffer';

export function fingerprint(git, { base, packageId, round, directory }) {
  const diff = resolve(directory, `r${round}.diff`); const manifest = resolve(directory, `r${round}-manifest.txt`);
  if (existsSync(diff) || existsSync(manifest)) throw fault('INTEGRITY', 'Round evidence exists');
  mkdirSync(directory, { recursive: true }); git.hygiene();
  const branch = git.run(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const head = git.run(['rev-parse', 'HEAD']).trim(); const status = git.status().trimEnd();
  git.run(['diff', '--binary', '--no-ext-diff', '--no-textconv', base, `--output=${diff}`]);
  // PowerShell Sort-Object compares paths without case sensitivity. Windows
  // platform acceptance must include this parity test for the operator's locale.
  const untracked = git.run(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }));
  const hashes = untracked.map(path => {
    const source = resolve(git.root, path); if (!inside(git.root, source)) throw fault('INTEGRITY');
    regular(source); const bytes = readFileSync(source);
    const copy = resolve(directory, `r${round}-untracked`, path);
    mkdirSync(dirname(copy), { recursive: true }); copyFileSync(source, copy, constants.COPYFILE_EXCL);
    return `${hash(bytes)}  ${path}`;
  });
  const diffHash = hash(readFileSync(diff));
  const text = [`PACKAGE ${packageId}`, `ROUND ${round}`, `BASE ${base}`, `BRANCH ${branch}`, `HEAD ${head}`,
    'STATUS BEGIN', ...(status ? status.split(/\r?\n/) : []), 'STATUS END', `DIFF SHA256 ${diffHash}`, `DIFF FILE ${diff}`, 'UNTRACKED BEGIN', ...hashes, 'UNTRACKED END'].join('\r\n') + '\r\n';
  // PowerShell 5.1 Set-Content -Encoding UTF8 writes a UTF-8 BOM.
  writeFileSync(manifest, Buffer.from('\uFEFF' + text, 'utf8'), { flag: 'wx' });
  return { diff, manifest, text, diffHash, head, branch, status, untracked: hashes };
}
export function treeSignature(git, base) {
  git.hygiene(); const untracked = git.run(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
  return hash(Buffer.concat([git.run(['diff', '--binary', '--no-ext-diff', '--no-textconv', base], { binary: true }), Buffer.from(JSON.stringify(untracked.map(path => [path, hash(readFileSync(resolve(git.root, path)))]))), Buffer.from(git.status())]));
}
