import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
const rules = fs.readFileSync('docs/SSP_RULES_v30.3.76.md', 'utf8');
const review = fs.readFileSync('docs/architecture/CONSTITUTIONAL_REVIEW_v30.3.94.md', 'utf8');
const notes = fs.readFileSync('BUILD_NOTES_v30.3.94.md', 'utf8');

test('current runtime and PWA shell remain version-aligned after v30.3.94', () => {
  assert.match(app, /version: 'v30\.3\.95'/);
  assert.match(index, /app\.js\?v=30\.3\.95&amp;rev=1/);
  assert.match(serviceWorker, /cacheName: 'the-dye-ledger-v30\.3\.95'/);
  for (const asset of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(fs.existsSync(`branding/${asset}-v30.3.96.png`), true);
  }
});

test('SSP rule contract states raw-point control, zero-zero Keep, Prox Push, and authority boundaries', () => {
  assert.match(rules, /raw points on the current hole, never from cumulative match totals/i);
  assert.match(rules, /completed 0-0 tie awards a Keep/i);
  assert.match(rules, /opening 0-0 tie before any Take awards neither/i);
  assert.match(rules, /explicitly record a Push/i);
  assert.match(rules, /cannot create a final settlement or advance authoritative Take\/Keep/i);
});

test('release documentation records additive compatibility and no database migration', () => {
  assert.match(review, /No database schema, RLS policy, authentication flow/i);
  assert.match(review, /No constitutional conflict identified/i);
  assert.match(notes, /persistence change is additive/i);
  assert.match(notes, /No database migration is required/i);
});

test('SSP implementation persists explicit Prox resolution and labels the audit raw points', () => {
  assert.match(app, /proxResolution/);
  assert.match(app, /SSP_PROX_PUSH_VALUE/);
  assert.match(app, /Select Prox result\.\.\./);
  assert.match(app, /Push &mdash; no Prox points/);
  assert.match(app, /Raw SSP Points/);
  assert.match(app, /holeLedger\.authoritativeEligible/);
});

test('live SSP preview is compact while retaining an expandable point audit', () => {
  assert.match(app, /<span>Raw SSP Points<\/span>/);
  assert.match(app, /<span>Take \/ Keep<\/span>/);
  assert.match(app, /<span>Multipliers<\/span>/);
  assert.match(app, /<span>Final<\/span>/);
  assert.match(app, /<summary>View point details<\/summary>/);
  assert.doesNotMatch(app, /<span>Points Before Multiplier<\/span>/);
});
