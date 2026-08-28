import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');

test('v30.3.95 runtime and PWA shell are aligned', () => {
  assert.match(app, /version: 'v31\.0\.11'/);
  assert.match(index, /app\.js\?v=31\.0\.11/);
  assert.match(serviceWorker, /cacheName: 'the-dye-ledger-v31\.0\.11'/);
  for (const asset of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(fs.existsSync(`branding/${asset}-v30.3.95.png`), true);
  }
});

test('live SSP calculation gives Take Keep and multipliers separate rows', () => {
  assert.match(app, /<span>Raw SSP Points<\/span>/);
  assert.match(app, /<span>Take \/ Keep<\/span><strong>\$\{escapeHtml\(takeKeepText\)\}<\/strong>/);
  assert.match(app, /<span>Multipliers<\/span><strong>\$\{escapeHtml\(multiplierSummary\)\}<\/strong>/);
  assert.match(app, /<span>Final<\/span>/);
  assert.match(app, /<summary>View point details<\/summary>/);
  assert.doesNotMatch(app, /escapeHtml\(`\$\{takeKeepText\} \/ \$\{multiplierSummary\}`\)/);
});

test('v30.3.95 is presentation-only and retains the v30.3.94 SSP authority model', () => {
  assert.match(app, /holeLedger\.authoritativeEligible/);
  assert.match(app, /holeLedger\.basePointsByTeam/);
  assert.match(app, /holeLedger\.pointsAfterTakeKeepByTeam/);
  assert.match(app, /holeLedger\.finalPointsByTeam/);
});
