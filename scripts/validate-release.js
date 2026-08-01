import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const read = path => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const manifest = JSON.parse(read('manifest.json'));
const version = pkg.version;
const displayVersion = `v${version}`;
const failures = [];

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

for (const file of ['app.js', 'service-worker.js', 'index.html', 'manifest.json', `BUILD_NOTES_v${version}.md`, 'docs/PRODUCTION_READINESS_ARCHITECTURE.md']) {
  requireCondition(existsSync(resolve(root, file)), `Missing required release file: ${file}`);
}

requireCondition(lock.version === version, `package-lock version ${lock.version} does not match ${version}`);
requireCondition(lock.packages?.['']?.version === version, `package-lock root package version does not match ${version}`);
requireCondition(manifest.version === displayVersion || manifest.version === version, `manifest version ${manifest.version} does not match ${displayVersion}`);

const app = read('app.js');
const worker = read('service-worker.js');
const html = read('index.html');
requireCondition(app.includes(`versionNumber: '${version}'`), 'app.js runtime version is inconsistent');
requireCondition(app.includes(`cacheName: 'the-dye-ledger-${displayVersion}'`), 'app.js cache version is inconsistent');
requireCondition(worker.includes(`versionNumber: '${version}'`), 'service-worker.js version is inconsistent');
requireCondition(worker.includes(`cacheName: 'the-dye-ledger-${displayVersion}'`), 'service-worker cache version is inconsistent');
requireCondition(html.includes(`app.js?v=${version}&amp;rev=`), 'index.html app asset query is stale');
requireCondition(html.includes(`style.css?v=${version}&amp;rev=`), 'index.html style asset query is stale');

const installBlock = worker.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '';
requireCondition(!installBlock.includes('skipWaiting'), 'service worker install must not force activation');
requireCondition(/SKIP_WAITING[\s\S]*skipWaiting/.test(worker), 'service worker must support explicit waiting-worker activation');

for (const file of ['app.js', 'service-worker.js']) {
  const check = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  if (check.status !== 0) failures.push(`${file} syntax check failed: ${String(check.stderr || check.stdout).trim()}`);
}

for (const file of ['app.js', 'service-worker.js', 'index.html']) {
  requireCondition(!/^<{7}|^={7}|^>{7}/m.test(read(file)), `Conflict marker found in ${file}`);
}

if (failures.length) {
  failures.forEach(message => console.error(`FAIL: ${message}`));
  process.exit(1);
}

console.log(`PASS: release ${displayVersion} metadata, assets, syntax, worker lifecycle, and required documentation are consistent.`);
