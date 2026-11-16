import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

const script = 'scripts/start-staging-preview.ps1';
const settingsDir = 'tmp/report-qa/shared-staging';
const signIn = 'supabase/proposals/shared-score-rpc-v31.0.77/staging/staging-sign-in.html';
const stage = 'darbakmabpbkikisadop';
const production = 'ueallqqmdyzwdlmoyxfo';
const fakeProductionKey = 'sb_publishable_wp_lib_01_production_fixture';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dye-wp-lib-01-staging-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const tracked = [
    script, signIn, 'package.json', 'index.html', 'manifest.json', 'recovery.html',
    'recovery-file.js', 'recovery-page.js', 'ledger-report/shell.html', 'ledger-report/bootstrap.js',
  ];
  const icons = ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']
    .map(name => `branding/${name}-v${version}.png`);
  for (const file of [...tracked, ...icons]) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  writeFileSync(join(root, 'supabase-config.js'),
    `window.__DYE_SUPABASE_CONFIG__ = {url: 'https://${production}.supabase.co', anonKey: '${fakeProductionKey}'};`);
  mkdirSync(join(root, settingsDir), { recursive: true });
  writeFileSync(join(root, settingsDir, 'preview-settings.json'), JSON.stringify({
    projectRef: stage,
    url: `https://${stage}.supabase.co`,
    publishableKey: 'sb_publishable_wp_lib_01_stage_fixture',
  }));
  execFileSync('git', ['init', '--quiet', '--template='], { cwd: root });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '--', ...tracked], { cwd: root });
  return root;
}

function filesUnder(root, folder = root) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(root, path) : [relative(root, path).split(sep).join('/')];
  });
}

const options = { skip: process.platform !== 'win32', timeout: 60000 };
for (const netlify of [false, true]) {
  const mode = netlify ? 'Netlify' : 'local preview';
  test(`${mode} build includes the recovery page with its original CSP and relative scripts`, options, t => {
    const root = fixture(t);
    const psHome = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, script), '-BuildOnly'];
    if (netlify) args.push('-Netlify');
    const result = spawnSync(join(psHome, 'powershell.exe'), args, {
      cwd: root,
      env: { ...process.env, PSModulePath: join(psHome, 'Modules') },
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const output = join(root, settingsDir, netlify ? 'wp-sm-01/netlify' : 'preview');
    const source = readFileSync(join(root, 'recovery.html'), 'utf8');
    const page = readFileSync(join(output, 'recovery.html'), 'utf8');
    const csp = /<meta http-equiv="Content-Security-Policy"[^>]+>/i;
    assert.match(source, csp);
    assert.equal(page.match(csp)?.[0], source.match(csp)[0]);
    if (netlify) assert.match(page, /<meta name="robots" content="noindex">/);

    const assets = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
    assert.deepEqual(assets, ['recovery-file.js', 'recovery-page.js']);
    const paths = filesUnder(output).sort();
    for (const path of [...assets, 'ledger-report/shell.html', 'ledger-report/bootstrap.js']) {
      assert.ok(paths.includes(path), path);
    }
    const records = paths.map(path => {
      const bytes = readFileSync(join(output, path));
      const scan = bytes.toString('latin1').replaceAll('\0', '').toLowerCase();
      assert.ok(!scan.includes(production), `production project in ${path}`);
      assert.ok(!scan.includes(fakeProductionKey), `production key in ${path}`);
      return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    if (netlify) {
      const list = JSON.parse(readFileSync(join(root, settingsDir, 'wp-sm-01/netlify-files.json'), 'utf8'));
      assert.deepEqual([...list.files].sort((first, second) => paths.indexOf(first.path) - paths.indexOf(second.path)), records);
    }
  });
}
