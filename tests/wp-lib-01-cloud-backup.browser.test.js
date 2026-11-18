import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import '../recovery-file.js';

const recoveryFile = globalThis.DyeLedgerRecoveryFile;
const primary = 'the-dye-ledger-v20';
const indexKey = primary + ':cloud-backup-index:v1';
const device = 'wp-lib-fixture-device';
const acceptedAt = '2026-10-10T18:00:00.000Z';
const acceptedStory = 'Synthetic accepted Story.';
const plain = value => JSON.parse(JSON.stringify(value));
const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  is_anonymous: false,
  email: 'synthetic@example.test',
};
const stagingConfig = `window.__DYE_SUPABASE_CONFIG__ = {url:'https://darbakmabpbkikisadop.supabase.co',anonKey:'sb_publishable_test_fixture',accountAuth:{enabled:true,environment:'staging',expectedProjectRef:'darbakmabpbkikisadop'},cloudBackup:{enabled:true}};`;

function roundFixture(engine, { games = true } = {}) {
  const fixture = visualFixture();
  fixture.state = engine.seedState(fixture.state);
  const active = fixture.state.matches[0];
  if (!games) active.selectedGames = [];
  active.players.forEach((player, index) => {
    player.scores.forEach((score, hole) => { score.gross = 4 + (index % 2 && hole % 3 === 0 ? 1 : 0); });
  });
  active.name = 'Synthetic Cloud Round';
  active.courseSnapshot = engine.getCourseSnapshotForMatch(active);
  const { candidate: completed } = engine.buildFinishedMatchCandidate(active, '2026-10-10T17:00:00.000Z');
  assert.equal(completed.status, 'complete');
  assert.ok(completed.roundRecordSnapshot);
  const report = engine.buildLedgerEntryReportModel(completed);
  Object.assign(report.meta, { status: 'final', story: acceptedStory, acceptedAt, acceptanceStatus: 'accepted' });
  completed.ledgerEntrySnapshot = engine.normalizeAcceptedLedgerEntrySnapshot({
    schemaVersion: 1, status: 'accepted', roundId: completed.id, acceptedAt, report,
  }, completed.id);
  assert.ok(completed.ledgerEntrySnapshot);
  completed.roundRecapFinal = acceptedStory;
  completed.roundRecordSnapshotHistory = [{
    ...plain(completed.roundRecordSnapshot),
    supersededAt: '2026-10-10T16:00:00.000Z',
    supersededReason: 'round-reopened-for-editing',
  }];
  fixture.state.matches = [completed];
  fixture.state.activeMatchId = null;
  fixture.state.completedSummaryMatchId = completed.id;
  fixture.storage.push(['the-dye-ledger-shared-device-id', device]);
  return fixture;
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('staging Round Library backs up, restores, detects changes, and stays absent in production', { timeout: 120000 }, async t => {
  if (!chrome) return t.skip('Chrome is unavailable');
  const engine = loadLiveEngine();
  const fixture = roundFixture(engine);
  const roundId = fixture.state.matches[0].id;
  const fake = { backups: [], versions: [] };
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
  const contexts = [];
  const external = [];

  const cloudFake = async (op, payload) => {
    if (op === 'rpc') {
      if (payload.name !== 'backup_round') return { data: null, error: null };
      const p = payload.params;
      if (digest(p.round_canonical) !== p.round_sha256
        || digest(p.players_canonical) !== p.players_sha256) {
        return { data: null, error: { message: 'BACKUP_HASH_MISMATCH' } };
      }
      const found = fake.backups.find(row =>
        row.owner_id === USER.id && row.local_round_id === p.local_round_id);
      if (found && found.round_sha256 !== p.round_sha256) {
        return { data: null, error: { message: 'ROUND_CHANGED' } };
      }
      if (!found && fake.backups.filter(row => row.owner_id === USER.id).length >= 100) {
        return { data: null, error: { message: 'BACKUP_LIMIT_REACHED' } };
      }
      let backup = found;
      let created = false;
      if (!backup) {
        created = true;
        backup = {
          owner_id: USER.id,
          cloud_round_id: `cloud-${fake.backups.length + 1}`,
          local_round_id: p.local_round_id,
          round_sha256: p.round_sha256,
          players_sha256: p.players_sha256,
          created_at: '2026-10-10T19:00:00.000Z',
        };
        fake.backups.push(backup);
        fake.versions.push({
          owner_id: USER.id,
          cloud_round_id: backup.cloud_round_id,
          version_number: 1,
          round_canonical: p.round_canonical,
          players_canonical: p.players_canonical,
          round_sha256: p.round_sha256,
          players_sha256: p.players_sha256,
        });
      }
      return { data: [{
        cloud_round_id: backup.cloud_round_id,
        version_number: 1,
        stored_players_sha256: backup.players_sha256,
        created,
      }], error: null };
    }
    const filters = payload.filters || {};
    if (!['round_backups', 'round_backup_versions'].includes(payload.table)) {
      return { data: payload.mode === 'single' ? null : [], error: null };
    }
    let rows = payload.table === 'round_backups' ? fake.backups : fake.versions;
    rows = rows.filter(row => row.owner_id === USER.id
      && Object.entries(filters).every(([key, value]) =>
        value && Array.isArray(value.in)
          ? value.in.includes(row[key])
          : row[key] === value));
    return { data: payload.mode === 'single' ? (rows[0] || null) : plain(rows), error: null };
  };

  async function prepare(context, { seed = false, production = false } = {}) {
    const page = await context.newPage();
    await page.setBypassServiceWorker(true);
    await page.exposeFunction('__cloudFake', cloudFake);
    await page.evaluateOnNewDocument(({ USER, seed, state, storage, primary, production }) => {
      if (seed && !localStorage.getItem(primary)) {
        localStorage.setItem(primary, JSON.stringify(state));
        for (const [key, value] of storage) localStorage.setItem(key, value);
      }
      let clients = 0;
      window.cloudProductionTrace = { get clients() { return clients; } };
      const auth = {
        getUser: async () => ({ data: { user: USER }, error: null }),
        getSession: async () => ({ data: { session: { user: USER } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInAnonymously: async () => { throw new Error('anonymous sign-in not allowed in this test'); },
      };
      const client = new Proxy({
        auth: new Proxy(auth, {
          get(target, key) {
            if (key === 'then') return undefined;
            return target[key] || (async () => ({ data: {}, error: null }));
          },
        }),
        rpc: (name, params) => window.__cloudFake('rpc', { name, params }),
        from(table) {
          const filters = {};
          const builder = new Proxy({}, {
            get(_target, key) {
              if (key === 'eq') return (field, value) => { filters[field] = value; return builder; };
              if (key === 'in') return (field, values) => { filters[field] = { in: values }; return builder; };
              if (key === 'maybeSingle' || key === 'single') {
                return () => window.__cloudFake('select', { table, filters, mode: 'single' });
              }
              if (key === 'then') {
                return (resolve, reject) =>
                  window.__cloudFake('select', { table, filters, mode: 'many' }).then(resolve, reject);
              }
              return () => builder;
            },
          });
          return builder;
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: async () => {},
        removeAllChannels: async () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      }, {
        get(target, key) {
          if (key === 'then') return undefined;
          return target[key] || (async () => ({ data: null, error: null }));
        },
      });
      window.supabase = {
        createClient() {
          clients++;
          if (production) return client;
          return client;
        },
      };
    }, { USER, seed, state: fixture.state, storage: fixture.storage, primary, production });
    await page.setRequestInterception(true);
    const requests = [];
    page.on('request', request => {
      const url = request.url();
      requests.push(url);
      if (url.startsWith(origin + '/supabase-config.js') && !production) {
        return request.respond({ status: 200, contentType: 'text/javascript', body: stagingConfig });
      }
      if (url.startsWith(origin + '/') || url.startsWith('data:')) return request.continue();
      external.push(url);
      return request.abort();
    });
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() =>
      document.getElementById('appVersionFooter')?.textContent.startsWith('v'));
    return { page, requests };
  }

  const click = (page, selector) =>
    page.evaluate(value => document.querySelector(value).click(), selector);
  const waitLabel = (page, text) => page.waitForFunction(value =>
    document.querySelector('[data-cloud-backup-label]')?.textContent === value, {}, text);

  try {
    const contextA = await browser.createBrowserContext();
    contexts.push(contextA);
    const { page: first } = await prepare(contextA, { seed: true });
    await waitLabel(first, 'Not backed up');
    assert.equal(await first.$eval('[data-cloud-backup-label]', el => el.textContent), 'Not backed up',
      'device 1 starts not backed up');

    await click(first, `[data-cloud-backup="${roundId}"]`);
    await waitLabel(first, 'Backed up (verified)');
    assert.deepEqual([fake.backups.length, fake.versions.length], [1, 1],
      'first backup creates one backup and version');
    const firstState = JSON.parse(await first.evaluate(key => localStorage.getItem(key), primary));
    const firstHash = digest(recoveryFile.canonical(firstState.matches[0]));
    const index = JSON.parse(await first.evaluate(key => localStorage.getItem(key), indexKey));
    assert.equal(Object.keys(index.accounts[USER.id]).length, 1, 'device index has one entry');

    await click(first, `[data-cloud-backup="${roundId}"]`);
    await waitLabel(first, 'Backed up (verified)');
    assert.deepEqual([fake.backups.length, fake.versions.length], [1, 1],
      'same-hash retry is idempotent');

    const contextB = await browser.createBrowserContext();
    contexts.push(contextB);
    const { page: second } = await prepare(contextB);
    const emptyState = JSON.parse(await second.evaluate(key => localStorage.getItem(key), primary));
    assert.equal((emptyState?.courses || []).some(course => course.id === fixture.state.matches[0].courseId), false,
      'device 2 does not have the restored course');
    assert.ok(await second.$('[data-cloud-restore-open]'), 'empty device shows Restore from cloud');
    await click(second, '[data-cloud-restore-open]');
    await second.waitForSelector('[data-cloud-restore]');
    const restoreText = await second.$eval('#cloudRestorePanel', el => el.textContent);
    assert.ok(restoreText.includes('Synthetic Cloud Round'));
    assert.ok(restoreText.includes('Design Review Club'));
    assert.ok(restoreText.includes('White'));
    assert.equal(restoreText.includes('Round ' + roundId), false);
    const navigation = second.waitForNavigation();
    await click(second, '[data-cloud-restore]');
    await navigation;
    await second.waitForFunction(() =>
      document.getElementById('appVersionFooter')?.textContent.startsWith('v'));
    await waitLabel(second, 'Backed up (verified)');
    const libraryText = await second.$eval('.round-library-card', el => el.textContent);
    assert.ok(libraryText.includes('Design Review Club'));
    assert.equal(libraryText.includes('No course'), false);
    assert.equal(libraryText.includes('No tee'), false);
    const secondState = JSON.parse(await second.evaluate(key => localStorage.getItem(key), primary));
    assert.equal(digest(recoveryFile.canonical(secondState.matches[0])), firstHash,
      'restored round has the source hash');
    const playerIds = new Set(secondState.players.map(player => player.id));
    assert.ok(secondState.matches[0].players.every(player => playerIds.has(player.playerId)),
      'restore includes every referenced player');
    await click(second, '[data-cloud-restore-open]');
    await second.waitForFunction(() =>
      document.querySelector('#cloudRestorePanel')?.textContent.includes('No cloud rounds to restore'));

    await first.evaluate(key => {
      const value = JSON.parse(localStorage.getItem(key));
      value.matches[0].notes = 'changed';
      value.matches[0].roundRecapNotes = 'changed';
      localStorage.setItem(key, JSON.stringify(value));
    }, primary);
    await first.reload();
    await waitLabel(first, 'Changed since backup');
    await click(first, `[data-cloud-backup="${roundId}"]`);
    await first.waitForFunction(() => {
      const text = document.querySelector('[data-cloud-backup-label]')?.textContent || '';
      return text.startsWith('Backup not verified:') && text.includes('changed after it was backed up');
    });
    assert.deepEqual([fake.backups.length, fake.versions.length], [1, 1],
      'changed round does not create another cloud record');

    const contextC = await browser.createBrowserContext();
    contexts.push(contextC);
    const { page: production, requests } = await prepare(contextC, { seed: true, production: true });
    assert.equal(await production.$$eval(
      '[data-cloud-backup],[data-cloud-backup-status],[data-cloud-restore-open]',
      elements => elements.length), 0, 'production renders no cloud-backup controls');
    assert.equal(requests.some(url => url.includes('/cloud-backup.js')), false,
      'production never requests cloud-backup.js');
    assert.ok(external.every(url => url.includes('supabase')), 'only the aborted Supabase CDN is non-local');
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
