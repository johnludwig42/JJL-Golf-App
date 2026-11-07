import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const repo = resolve('.');
const stage = 'darbakmabpbkikisadop';
const production = 'ueallqqmdyzwdlmoyxfo';
const stageKey = 'sb_publishable_wp_sm_01_stage_fixture';
const productionKey = 'sb_publishable_wp_sm_01_production_fixture';
const settingsDir = 'tmp/report-qa/shared-staging';
const hostedDir = `${settingsDir}/wp-sm-01`;
const script = 'scripts/start-staging-preview.ps1';
const signIn = 'supabase/proposals/shared-score-rpc-v31.0.77/staging/staging-sign-in.html';

function fixture(t, projectRef = stage) {
  const temp = realpathSync(tmpdir());
  const root = mkdtempSync(join(temp, 'dye-wp-sm-01-'));
  t.after(() => {
    assert.ok(relative(temp, realpathSync(root)).startsWith('dye-wp-sm-01-'));
    assert.equal(dirname(realpathSync(root)), temp);
    rmSync(root, { recursive: true, force: true });
  });
  const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/);
  const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
  const paths = tracked.filter(path => /^[^/]+\.(js|css|svg)$/.test(path) ||
    /^ledger-report\/[^.].*\.(html|js|css|woff2|svg|png)$/.test(path) ||
    (path.startsWith('branding/') && path.endsWith(`-v${version}.png`)) ||
    ['index.html', 'manifest.json', 'package.json', script, signIn].includes(path));
  for (const path of paths) {
    if (path === 'supabase-config.js') continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repo, path), join(root, path));
  }
  writeFileSync(join(root, 'supabase-config.js'), `window.__DYE_SUPABASE_CONFIG__ = {url: 'https://${production}.supabase.co', anonKey: '${productionKey}'};`);
  mkdirSync(join(root, settingsDir), { recursive: true });
  writeFileSync(join(root, settingsDir, 'preview-settings.json'), JSON.stringify({
    projectRef, url: `https://${projectRef}.supabase.co`, publishableKey: stageKey,
  }));
  execFileSync('git', ['init', '--quiet', '--template='], { cwd: root });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '--', ...paths], { cwd: root });
  return root;
}

function build(root, args = ['-BuildOnly', '-Netlify']) {
  const psHome = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
  const result = spawnSync(join(psHome, 'powershell.exe'), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, script), ...args,
  ], { cwd: root, env: { ...process.env, PSModulePath: join(psHome, 'Modules') }, encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(stageKey), 'build output exposed the fixture staging key');
  assert.ok(!`${result.stdout}${result.stderr}`.includes(productionKey), 'build output exposed the fixture production key');
  return result;
}

function filesUnder(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(root, path) : [relative(root, path).split(sep).join('/')];
  });
}

const options = { skip: process.platform !== 'win32', timeout: 60000 };

test('Netlify build lists exactly the staging bytes and portable assets', options, t => {
  const root = fixture(t);
  const result = build(root);
  assert.equal(result.status, 0, result.stderr);
  const output = join(root, hostedDir, 'netlify');
  const list = JSON.parse(readFileSync(join(root, hostedDir, 'netlify-files.json'), 'utf8'));
  const actual = filesUnder(output);
  assert.deepEqual(list.files.map(file => file.path).sort(), actual.sort());
  const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
  assert.equal(list.version, `v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`);
  assert.equal(manifest.version, list.version);
  assert.equal(manifest.name, 'Dye Ledger STAGING');
  assert.equal(manifest.short_name, 'Dye Ledger STAGING');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\/branding\//);
    assert.ok(existsSync(join(output, icon.src)));
  }
  assert.equal(readFileSync(join(output, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  for (const name of ['eslint.config.js', 'preview-settings.json', 'netlify-files.json', 'delivery-fault-panel.js']) {
    assert.ok(!actual.some(path => path.split('/').at(-1) === name), name);
  }
  for (const {path, sha256} of list.files) {
    const bytes = readFileSync(join(output, path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, path);
    const scan = bytes.toString('latin1').replaceAll('\0', '');
    assert.ok(!scan.includes(production), `production ref in ${path}`);
    assert.ok(!scan.includes(productionKey), `production key in ${path}`);
    for (const project of scan.matchAll(/https?:\/\/([a-z0-9]+)\.supabase\.co\b/gi)) assert.equal(project[1], stage);
    if (!path.endsWith('.html')) continue;
    assert.match(scan, /<meta name="robots" content="noindex">/i, path);
    const origin = 'https://staging.example.test';
    for (const [, asset] of scan.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)) {
      if (/^(https:|data:)/i.test(asset)) continue;
      assert.ok(!asset.startsWith('/'), `Expected relative asset: ${path} → ${asset}`);
      const resolved = new URL(asset, `${origin}/${path}`);
      assert.equal(resolved.origin, origin);
      assert.ok(actual.includes(decodeURIComponent(resolved.pathname.slice(1))), `${path} → ${asset}`);
    }
  }
  const configText = readFileSync(join(output, 'supabase-config.js'), 'utf8');
  const config = JSON.parse(configText.slice('window.__DYE_SUPABASE_CONFIG__ = '.length, -1));
  assert.deepEqual(config, {
    url: `https://${stage}.supabase.co`, anonKey: stageKey,
    accountAuth: { enabled: true, environment: 'staging', expectedProjectRef: stage },
  });
  for (const file of ['app.js', 'service-worker.js']) {
    assert.deepEqual(readFileSync(join(output, file)), readFileSync(join(root, file)), file);
  }
  assert.match(readFileSync(join(output, 'index.html'), 'utf8'), /STAGING TEST.*href="staging-sign-in.html"/);
  assert.match(readFileSync(join(output, 'staging-sign-in.html'), 'utf8'), /signInWithPassword/);
  assert.equal(build(root).status, 1, 'must not replace a reviewed output');
});

test('Netlify build refuses production settings and unsafe mode combinations', options, t => {
  const root = fixture(t, production);
  assert.match(build(root).stderr, /Expected the approved staging project/);
  assert.match(build(root, ['-Netlify']).stderr, /requires BuildOnly/);
  assert.match(build(root, ['-Netlify', '-BuildOnly', '-DeliveryFaultReview']).stderr, /excludes the delivery fault panel/);
  assert.ok(!existsSync(join(root, hostedDir, 'netlify')));
});

test('Netlify scan rejects production ref, UTF-16 production key, and foreign URLs in allowed assets', options, t => {
  const root = fixture(t);
  const asset = join(root, 'app.js');
  for (const marker of [Buffer.from(production), Buffer.from(productionKey, 'utf16le'), Buffer.from('https://foreignfixture.supabase.co')]) {
    writeFileSync(asset, marker);
    const result = build(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Hosted staging isolation check rejected/);
    assert.ok(!existsSync(join(root, hostedDir, 'netlify')));
    assert.ok(!existsSync(join(root, hostedDir, 'netlify-files.json')));
  }
});

test('ordinary BuildOnly still prepares the existing loopback folder', options, t => {
  const root = fixture(t);
  const result = build(root, ['-BuildOnly']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /http:\/\/127\.0\.0\.1:5087\/staging-sign-in.html/);
  assert.equal(JSON.parse(readFileSync(join(root, settingsDir, 'preview/manifest.json'), 'utf8')).name, 'The Dye Ledger');
  assert.ok(!existsSync(join(root, hostedDir)));
});
