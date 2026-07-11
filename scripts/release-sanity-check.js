#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const targetRaw = process.argv[2] || '';
const targetVersion = targetRaw.replace(/^v/i, '');
const targetLabel = targetVersion ? `v${targetVersion}` : '';
const results = [];

function add(level, label, detail = '') {
  results.push({ level, label, detail });
  const suffix = detail ? ` - ${detail}` : '';
  console.log(`${level}: ${label}${suffix}`);
}

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return null;
  }
}

function readText(relPath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
  } catch {
    return null;
  }
}

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function checkBranch() {
  const branch = runGit(['branch', '--show-current']);
  if (!branch) return add('WARN', 'Current branch unavailable', 'git branch --show-current did not return a branch.');
  const expected = targetVersion ? `release/v${targetVersion}` : '';
  if (expected && branch !== expected) return add('FAIL', 'Current branch mismatch', `expected ${expected}, found ${branch}`);
  return add('PASS', 'Current branch', branch);
}

function checkWorkingTree() {
  const status = runGit(['status', '--porcelain']);
  if (status == null) return add('WARN', 'Working tree status unavailable', 'git status --porcelain failed.');
  if (!status) return add('PASS', 'Working tree clean');
  return add('WARN', 'Working tree has changes', status.split(/\r?\n/).slice(0, 8).join('; '));
}

function checkUnmergedPaths() {
  const unmerged = runGit(['diff', '--name-only', '--diff-filter=U']);
  if (unmerged == null) return add('WARN', 'Unmerged path check unavailable', 'git diff --diff-filter=U failed.');
  if (!unmerged) return add('PASS', 'No unmerged paths');
  return add('FAIL', 'Unmerged paths found', unmerged.split(/\r?\n/).join(', '));
}

function listCandidateFiles() {
  const tracked = runGit(['ls-files']) || '';
  const untracked = runGit(['ls-files', '--others', '--exclude-standard']) || '';
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter(Boolean))];
}

function checkConflictMarkers() {
  const hits = [];
  for (const relPath of listCandidateFiles()) {
    if (relPath.startsWith('.git/') || relPath.includes('node_modules/')) continue;
    const fullPath = path.join(repoRoot, relPath);
    let text = '';
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size > 2_000_000) continue;
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    if (/^(<<<<<<<|>>>>>>>)[ \t].+/m.test(text)) hits.push(relPath);
  }
  if (hits.length) return add('FAIL', 'Conflict markers found', hits.slice(0, 12).join(', '));
  return add('PASS', 'No conflict markers found');
}

function checkRequiredFiles() {
  const required = [
    'PROJECT_CONTEXT.md',
    'ENGINEERING_DECISIONS.md',
    'TECHNICAL_DEBT.md',
    'docs/01_Development_Playbook.md',
    'docs/02_Release_Workflow.md',
    'docs/03_CODEX_WORKFLOW.md',
    'app.js',
    'index.html',
    'style.css',
    'package.json',
    'package-lock.json',
    'manifest.json',
    'service-worker.js',
  ];
  const missing = required.filter(relPath => !exists(relPath));
  if (missing.length) return add('FAIL', 'Required core files missing', missing.join(', '));
  return add('PASS', 'Required core files exist');
}

function checkBuildNote() {
  if (!targetVersion) return add('WARN', 'Build note target not provided', 'Run with vXX.X.XX to check the release note.');
  const relPath = `BUILD_NOTES_v${targetVersion}.md`;
  if (exists(relPath)) return add('PASS', 'Target build notes exist', relPath);
  return add('WARN', 'Target build notes missing', relPath);
}

function extractVersions() {
  const checks = [];
  const app = readText('app.js') || '';
  const sw = readText('service-worker.js') || '';
  const manifest = readText('manifest.json') || '';
  const pkg = readText('package.json') || '';
  const lock = readText('package-lock.json') || '';
  const appVersion = app.match(/version:\s*['"]v([^'"]+)['"]/)?.[1] || '';
  const appNumber = app.match(/versionNumber:\s*['"]([^'"]+)['"]/)?.[1] || '';
  const swVersion = sw.match(/version:\s*['"]v([^'"]+)['"]/)?.[1] || '';
  const swNumber = sw.match(/versionNumber:\s*['"]([^'"]+)['"]/)?.[1] || '';
  let manifestVersion = '';
  let packageVersion = '';
  let lockVersion = '';
  try { manifestVersion = JSON.parse(manifest).version?.replace(/^v/i, '') || ''; } catch {}
  try { packageVersion = JSON.parse(pkg).version || ''; } catch {}
  try { lockVersion = JSON.parse(lock).version || ''; } catch {}
  checks.push(['app.js BUILD_INFO.version', appVersion]);
  checks.push(['app.js BUILD_INFO.versionNumber', appNumber]);
  checks.push(['service-worker.js BUILD_INFO.version', swVersion]);
  checks.push(['service-worker.js BUILD_INFO.versionNumber', swNumber]);
  checks.push(['manifest.json version', manifestVersion]);
  checks.push(['package.json version', packageVersion]);
  checks.push(['package-lock.json version', lockVersion]);
  return checks;
}

function checkVersionConsistency() {
  const versions = extractVersions();
  const missing = versions.filter(([, value]) => !value);
  if (missing.length) return add('FAIL', 'Version metadata unreadable', missing.map(([label]) => label).join(', '));
  const unique = [...new Set(versions.map(([, value]) => value))];
  if (unique.length !== 1) return add('FAIL', 'Version metadata inconsistent', versions.map(([label, value]) => `${label}=${value}`).join('; '));
  if (targetVersion && unique[0] !== targetVersion) return add('FAIL', 'Version metadata target mismatch', `expected ${targetVersion}, found ${unique[0]}`);
  return add('PASS', 'Version metadata consistent', targetLabel || unique[0]);
}

function checkAppShellAssetVersions() {
  if (!targetVersion) return add('WARN', 'App shell asset version target unavailable');
  const html = readText('index.html') || '';
  const expectedAssets = ['app.js', 'style.css', 'supabase-config.js', 'manifest.json'];
  const stale = expectedAssets.filter(asset => !html.includes(`${asset}?v=${targetVersion}`));
  if (stale.length) return add('FAIL', 'App shell asset queries stale or missing', stale.join(', '));
  const queryVersions = [...html.matchAll(/(?:app\.js|style\.css|supabase-config\.js|manifest\.json)\?v=([0-9.]+)/g)].map(match => match[1]);
  const mismatches = queryVersions.filter(version => version !== targetVersion);
  if (mismatches.length) return add('FAIL', 'App shell asset query version mismatch', [...new Set(mismatches)].join(', '));
  return add('PASS', 'App shell asset queries current', targetLabel);
}

function checkSimulationFiles() {
  const files = [
    'scripts/simulate-rounds.js',
    'scripts/simulation-engine.js',
    'scripts/simulation-report.js',
    'scripts/live-engine-adapter.js',
    'tests/simulation-lab.test.js',
    'tests/live-engine-adapter.test.js',
  ];
  const missing = files.filter(relPath => !exists(relPath));
  if (missing.length) return add('WARN', 'Simulation/live-engine files missing', missing.join(', '));
  return add('PASS', 'Simulation/live-engine files exist');
}

checkBranch();
checkWorkingTree();
checkUnmergedPaths();
checkConflictMarkers();
checkRequiredFiles();
checkBuildNote();
checkVersionConsistency();
checkAppShellAssetVersions();
checkSimulationFiles();

const counts = results.reduce((acc, row) => {
  acc[row.level] = (acc[row.level] || 0) + 1;
  return acc;
}, {});
console.log(`Summary: ${counts.PASS || 0} PASS, ${counts.WARN || 0} WARN, ${counts.FAIL || 0} FAIL`);
if (counts.FAIL) process.exit(1);
