import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { chrome, openVisualPage, startServer, visualFixture } from './support/design-browser.js';

const primary = 'the-dye-ledger-v20';
const backup = primary + ':last-known-good';
const device = 'wp-lib-fixture-device';
const acceptedAt = '2026-10-10T18:00:00.000Z';
const acceptedStory = 'Synthetic accepted Story.';
const plain = value => JSON.parse(JSON.stringify(value));

function canonicalHash(value) {
  const json = JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
  return createHash('sha256').update(json).digest('hex');
}

function roundFixture(engine, { games = true } = {}) {
  const fixture = visualFixture();
  fixture.state = engine.seedState(fixture.state);
  const active = fixture.state.matches[0];
  if (!games) active.selectedGames = [];
  active.players.forEach((player, index) => {
    player.scores.forEach((score, hole) => { score.gross = 4 + (index % 2 && hole % 3 === 0 ? 1 : 0); });
  });
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

test('completed history and accepted Ledger survive a persisted round trip after load-time compaction', () => {
  const engine = loadLiveEngine();
  const { state } = roundFixture(engine);
  const completed = state.matches[0];
  completed.sharedSyncDiagnostics = Array.from({ length: 8 }, (_, index) => ({
    reasonCode: 'REMOTE_SCORE_ACCEPTED', detail: 'Fixture diagnostic ' + index, occurredAt: acceptedAt,
  }));
  const authorities = ['roundRecordSnapshot', 'roundRecordSnapshotHistory', 'ledgerEntrySnapshot'];
  const writes = [];
  const values = new Map([[primary, JSON.stringify(state)]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes.push(key); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
  const loaded = engine.loadStateFromStorage(storage);
  for (const field of authorities) assert.equal(canonicalHash(loaded.matches[0][field]), canonicalHash(completed[field]), field);
  assert.deepEqual(writes, [primary, backup], 'load writes the compacted primary before its recovery backup');
  assert.equal(loaded.matches[0].sharedSyncDiagnostics.length, 5);
  assert.equal(values.get(primary), JSON.stringify(loaded));
  assert.equal(values.get(backup), values.get(primary));

  assert.equal(engine.persistStateSnapshot(loaded, storage).ok, true);
  const reloaded = engine.loadStateFromStorage(storage);
  assert.equal(canonicalHash(reloaded.matches), canonicalHash(loaded.matches));
  assert.deepEqual(writes, [primary, backup, primary, backup], 'stable reload needs no further writes');
});

test('baseline observation: normalizing a minimal round materializes live-round defaults', () => {
  const engine = loadLiveEngine();
  const utcDay = () => new Date().toISOString().slice(0, 10);
  const before = utcDay();
  const normalized = { id: 'minimal-fixture' };
  engine.normalizeMatch(normalized);
  assert.ok([before, utcDay()].includes(normalized.date), normalized.date);
  assert.deepEqual(
    [normalized.id, normalized.name, normalized.storageMode, normalized.status, normalized.holeCount],
    ['minimal-fixture', 'Round', 'local', 'active', 18],
  );
  assert.deepEqual(plain(normalized.roundRecordSnapshotHistory), []);
  assert.equal(normalized.roundRecordSnapshot, null);
});

test('round history and delivery characterization in loopback Chromium', { timeout: 120_000 }, async t => {
  assert.ok(chrome, 'Set CHROME_PATH to run the required browser characterizations.');
  const server = await startServer();
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const engine = loadLiveEngine();
  const fixture = roundFixture(engine);

  async function withPage(currentFixture, run) {
    const context = await browser.createBrowserContext();
    try {
      const page = await openVisualPage(context, url, 'match', 1200, false, false, false, currentFixture);
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await run(page);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }

  await t.test('Library order, frozen result, actions, golfer counts and last-played dates', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(() => {
        const local = state.matches[0];
        const copy = (id, date, attributes) => ({
          ...clonePlain(local), id, date, name: id, ledgerEntrySnapshot: null, ...attributes,
        });
        local.name = 'local';
        // Display should still follow the saved result after live scores diverge.
        const frozenResult = buildRoundRecordResultLine(local.roundRecordSnapshot);
        local.players[0].scores[0].gross = 12;
        const host = copy('host', '2026-10-12', {
          storageMode: 'shared', sharedMatchId: 'fixture-host', sharedHostDeviceId: getSharedDeviceId(),
        });
        const joined = copy('joined', '2026-10-11', {
          storageMode: 'shared', sharedMatchId: 'fixture-joined', sharedHostDeviceId: 'different-fixture-device',
        });
        const held = copy('held', '2026-10-13', {
          storageMode: 'shared', sharedMatchId: 'fixture-held', sharedHostDeviceId: getSharedDeviceId(),
        });
        queueSharedScoreOperation(held, held.players[0].playerId, 1);
        preserveClosedSharedScoreOperations(held);
        const paused = copy('paused', '2026-10-08', { status: 'active', roundRecordSnapshot: null, players: [] });
        const active = copy('active', '2026-10-14', { status: 'active', roundRecordSnapshot: null });
        state.matches = [local, held, paused, host, active, joined];
        state.activeMatchId = active.id;
        renderMatches();
        renderPlayers();
        const rows = Array.from(document.querySelectorAll('.round-library-card'), row => ({
          name: row.querySelector('.item-title').textContent,
          status: row.querySelector('.library-status-badge').textContent,
          actions: Array.from(row.querySelectorAll('button'), button => Object.keys(button.dataset)[0]),
          result: row.querySelector('.library-round-result span').textContent,
        }));
        return {
          rows, frozenResult,
          sections: Array.from(document.querySelectorAll('#matchesList h4'), row => row.textContent),
          golferCounts: Array.from(document.querySelectorAll('.player-library-card .library-metadata'),
            row => Array.from(row.querySelectorAll('span')).find(item => item.firstChild.textContent === 'Saved rounds').textContent),
          playerLast: getPlayerLastPlayedAt(local.players[0].playerId),
          courseLast: getCourseLastPlayedAt({ id: local.courseId }),
          total: getLocalStorageUsage().roundCount,
        };
      });
      assert.deepEqual(observed.sections, ['Continue Playing', 'Completed Rounds']);
      assert.deepEqual(observed.rows.map(({ name, status, actions }) => [name, status, actions]), [
        ['active', 'Active', ['loadMatch', 'shareMatch', 'deleteMatch']],
        ['paused', 'Paused', ['loadMatch', 'shareMatch', 'deleteMatch']],
        ['held', 'Complete', ['viewMatch', 'preservedReview', 'shareMatch', 'refreshSharedMatch', 'deleteMatch']],
        ['host', 'Complete', ['viewMatch', 'reopenMatch', 'shareMatch', 'refreshSharedMatch', 'deleteMatch']],
        ['joined', 'Complete', ['viewMatch', 'shareMatch', 'refreshSharedMatch', 'deleteMatch']],
        ['local', 'Complete', ['viewMatch', 'reopenMatch', 'shareMatch', 'deleteMatch']],
      ]);
      assert.ok(observed.frozenResult);
      assert.equal(observed.rows.at(-1).result, observed.frozenResult);
      assert.deepEqual(observed.golferCounts, Array(4).fill('Saved rounds5'));
      assert.equal(observed.playerLast, '2026-10-14');
      assert.equal(observed.courseLast, '2026-10-14');
      assert.equal(observed.total, 6);
    });
  });

  await t.test('export includes full local history and excludes separate stores', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(async () => {
        const queued = { id: 'fixture-shared', sharedMatchId: 'fixture-cloud', storageMode: 'shared' };
        queueSharedScoreOperation(queued, 'p0', 1);
        savePlayerPreferences({ preferredPlayInputMode: 'PLAYER' });
        localStorage.setItem(MATCH_TEMPLATES_STORAGE_KEY, JSON.stringify([{ id: 'fixture-template', name: 'Synthetic template' }]));
        const audit = getPreservedReviewStore();
        await audit.put({ id: 'fixture-receipt', matchId: queued.sharedMatchId });
        const expected = JSON.parse(JSON.stringify(state));
        let blob, filename;
        URL.createObjectURL = value => { blob = value; return 'blob:fixture'; };
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function () { filename = this.download; };
        exportJson();
        return {
          filename, type: blob.type, exported: JSON.parse(await blob.text()), expected,
          queued: getSharedScoreOutboxOperations(queued).length,
          hasPreferences: localStorage.getItem('dyeLedger.playerPreferences') !== null,
          templates: readMatchTemplates().map(template => template.id),
          receipts: (await audit.list(queued.sharedMatchId)).map(receipt => receipt.id),
        };
      });
      assert.match(observed.filename, /^the-dye-ledger-\d{4}-\d{2}-\d{2}\.json$/);
      assert.equal(observed.type, 'application/json');
      assert.equal(observed.queued, 1);
      assert.equal(observed.hasPreferences, true);
      assert.deepEqual(observed.templates, ['fixture-template']);
      assert.deepEqual(observed.receipts, ['fixture-receipt']);
      assert.deepEqual(Object.keys(observed.exported).sort(), [
        'activeMatchId', 'completedSummaryMatchId', 'courses', 'lastOpenedSharedMatchId', 'matches',
        'notes', 'playerRegistry', 'players', 'savedRosters', 'sharedMatchIds',
      ]);
      assert.deepEqual(observed.exported, observed.expected);
      assert.equal(observed.exported.matches[0].ledgerEntrySnapshot.report.meta.story, acceptedStory);
      assert.equal(observed.exported.matches[0].roundRecordSnapshotHistory.length, 1);
    });
  });

  await t.test('Library View opens the full completed round for Scores review, details and balance', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(() => {
        const round = state.matches[0];
        const frozen = JSON.stringify(round.roundRecordSnapshot);
        const playerId = round.players[0].playerId;
        const frozenTotal = round.roundRecordSnapshot.transactions.reduce((total, payment) => {
          if (payment.payeeId === playerId) return total + payment.amount;
          if (payment.payerId === playerId) return total - payment.amount;
          return total;
        }, 0);
        renderMatches();
        document.querySelector('[data-view-match="' + round.id + '"]').click();
        const review = getReviewOrActiveMatch();
        const metrics = computeMatchMetrics(review);
        const scores = buildEffectiveScoresContext(review, metrics);
        const balance = buildBalanceExplanation(review, metrics, playerId);
        openPlayerDetailView(playerId);
        return {
          id: review.id, activeId: state.activeMatchId, frozen: scores.frozen,
          scoreRows: scores.playerRows.length, lifecycle: scores.lifecycle,
          detail: document.getElementById('playerDetailBody').textContent,
          balance: { source: balance.source, total: balance.total, reconciles: balance.reconciles },
          frozenTotal, unchanged: JSON.stringify(review.roundRecordSnapshot) === frozen,
        };
      });
      assert.equal(observed.id, fixture.state.matches[0].id);
      assert.equal(observed.activeId, null);
      assert.equal(observed.frozen, true);
      assert.equal(observed.scoreRows, 4);
      assert.equal(observed.lifecycle, 'Final');
      assert.match(observed.detail, /Gross/);
      assert.match(observed.detail, /Classic scorecard/);
      assert.deepEqual(observed.balance, { source: 'Saved round record', total: observed.frozenTotal, reconciles: true });
      assert.equal(observed.unchanged, true);
    });
  });

  await t.test('accepted no-Nassau Ledger reopens exactly; acceptance and unlock target a single round', async () => {
    await withPage(roundFixture(engine, { games: false }), async page => {
      const observed = await page.evaluate(async () => {
        const round = state.matches[0];
        const before = JSON.stringify(round.ledgerEntrySnapshot);
        let target;
        window.open = () => ({
          document: { open() {}, write() {}, close() {}, body: {} },
          location: { replace: value => { target = new URL(value); } }, focus() {},
        });
        const opened = await openUnifiedExport(round);
        const transfer = JSON.parse(sessionStorage.getItem(target.searchParams.get('reportKey')));
        const unchanged = before === JSON.stringify(round.ledgerEntrySnapshot);
        const other = { ...clonePlain(round), id: 'another-round', ledgerEntrySnapshot: null };
        state.matches.push(other);
        const report = clonePlain(round.ledgerEntrySnapshot.report);
        report.meta.roundId = other.id;
        const accepted = acceptLedgerEntrySnapshotEnvelope({ roundId: other.id, report, acceptedAt: report.meta.acceptedAt });
        const afterAccept = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches;
        const missing = unlockAcceptedLedgerEntry('not-a-round');
        const unlocked = unlockAcceptedLedgerEntry(other.id);
        const afterUnlock = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches;
        return {
          opened, path: target.pathname, transfer, unchanged, before,
          accepted, afterAccept, missing, unlocked, afterUnlock,
        };
      });
      const before = JSON.parse(observed.before);
      assert.equal(observed.opened, true);
      assert.equal(observed.path, '/ledger-report/shell.html');
      assert.deepEqual(observed.transfer.report, before.report);
      assert.equal(observed.transfer.autoPrint, true);
      assert.equal(observed.transfer.returnUrl, url + 'index.html');
      assert.equal(observed.unchanged, true);
      assert.equal(observed.accepted.accepted, true);
      assert.deepEqual(observed.afterAccept[0].ledgerEntrySnapshot, before);
      assert.equal(observed.afterAccept[1].ledgerEntrySnapshot.roundId, 'another-round');
      assert.deepEqual(observed.missing, { unlocked: false, reason: 'not-found' });
      assert.deepEqual(observed.unlocked, { unlocked: true });
      assert.deepEqual(observed.afterUnlock[0].ledgerEntrySnapshot, before);
      assert.equal(observed.afterUnlock[1].ledgerEntrySnapshot, null);
    });
  });

  await t.test('baseline observation: Story and notes write live fields while the accepted Ledger stays frozen', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(async () => {
        const round = state.matches[0];
        setCompletedReviewMatch(round);
        const original = JSON.stringify([round.roundRecordSnapshot, round.ledgerEntrySnapshot]);
        const text = buildDeterministicLedgerEntryStory(round, computeMatchMetrics(round)).text;
        round.roundRecapGenerated = text;
        let previews = 0;
        openUnifiedExport = async () => { previews++; return true; };
        await acceptRoundRecapForActiveMatch();
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches[0].roundRecapFinal;
        clearRoundRecapForActiveMatch();
        const cleared = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches[0].roundRecapFinal;
        const notes = document.getElementById('roundRecapNotesBox') || document.createElement('textarea');
        notes.id = 'roundRecapNotesBox';
        if (!notes.isConnected) document.getElementById('leaderboard').append(notes);
        notes.value = 'Synthetic notes for a completed round.';
        notes.dispatchEvent(new Event('input', { bubbles: true }));
        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches[0];
        return {
          saved, cleared, previews, unchanged: original === JSON.stringify([persisted.roundRecordSnapshot, persisted.ledgerEntrySnapshot]),
          notes: persisted.notes, recapNotes: persisted.roundRecapNotes, text,
        };
      });
      assert.ok(observed.text.length > 0);
      assert.equal(observed.saved, observed.text);
      assert.equal(observed.previews, 1);
      assert.equal(observed.cleared, '');
      assert.equal(observed.unchanged, true);
      assert.equal(observed.notes, 'Synthetic notes for a completed round.');
      assert.equal(observed.recapNotes, observed.notes);
    });
  });

  await t.test('baseline observation: Reopen retains frozen history; Delete and Discard remove local rows', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(() => {
        const round = state.matches[0];
        const original = clonePlain(round.roundRecordSnapshot);
        state.matches.push({ ...clonePlain(round), id: 'delete-fixture' }, { ...clonePlain(round), id: 'discard-fixture' });
        const prompts = [];
        window.confirm = message => { prompts.push(message); return true; };
        renderMatches();
        document.querySelector('[data-reopen-match="' + round.id + '"]').click();
        const reopened = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches[0];
        document.querySelector('[data-delete-match="delete-fixture"]').click();
        const deleted = !JSON.parse(localStorage.getItem(STORAGE_KEY)).matches.some(row => row.id === 'delete-fixture');
        setCompletedReviewMatch('discard-fixture');
        const discarded = discardCompletedReviewRound();
        const finalIds = JSON.parse(localStorage.getItem(STORAGE_KEY)).matches.map(row => row.id);
        return { reopened, original, deleted, discarded, finalIds, prompts };
      });
      assert.equal(observed.reopened.status, 'active');
      assert.equal(observed.reopened.completedAt, null);
      assert.equal(observed.reopened.previousCompletedAt, '2026-10-10T17:00:00.000Z');
      assert.equal(observed.reopened.roundRecordSnapshot, null);
      assert.equal(observed.reopened.ledgerEntrySnapshot, null);
      assert.equal(observed.reopened.roundRecordSnapshotHistory.length, 2);
      const { supersededAt, supersededReason, ...history } = observed.reopened.roundRecordSnapshotHistory.at(-1);
      assert.ok(Number.isFinite(Date.parse(supersededAt)));
      assert.equal(supersededReason, 'round-reopened-for-editing');
      assert.deepEqual(history, observed.original);
      assert.equal(observed.deleted, true);
      assert.equal(observed.discarded, true);
      assert.deepEqual(observed.finalIds, [observed.reopened.id]);
      assert.deepEqual(observed.prompts.map(message => message.split('\n')[0]), [
        'Reopen Completed Round?', 'Remove Saved Round?', 'Discard Completed Round?',
      ]);
    });
  });

  await t.test('baseline observation: deleting a golfer edits live membership even on a completed round', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(() => {
        const round = state.matches[0];
        const playerId = round.players[0].playerId;
        const original = JSON.stringify([round.roundRecordSnapshot, round.ledgerEntrySnapshot]);
        window.confirm = () => true;
        renderPlayers();
        document.querySelector('[data-delete-player="' + playerId + '"]').click();
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return {
          roster: saved.players.some(player => player.id === playerId),
          liveRound: saved.matches[0].players.some(player => player.playerId === playerId),
          frozenUnchanged: original === JSON.stringify([saved.matches[0].roundRecordSnapshot, saved.matches[0].ledgerEntrySnapshot]),
        };
      });
      assert.deepEqual(observed, { roster: false, liveRound: false, frozenUnchanged: true });
    });
  });

  await t.test('baseline observation: JSON import replaces collections and normalizes rounds', async () => {
    await withPage(fixture, async page => {
      await page.evaluate(() => {
        state.notes = 'Keep original app notes';
        state.lastOpenedSharedMatchId = 'keep-fixture-reference';
        const imported = {
          players: [{ id: 'import-player', name: 'Fixture Golfer', index: 3 }],
          courses: [{ id: 'import-course', name: 'Fixture Course', tees: [] }],
          matches: [{ id: 'import-round' }], activeMatchId: 'import-round', notes: 'Ignore imported notes',
          lastOpenedSharedMatchId: 'ignore-imported-reference',
        };
        const transfer = new DataTransfer();
        transfer.items.add(new File([JSON.stringify(imported)], 'synthetic.json', { type: 'application/json' }));
        const input = document.getElementById('importFile');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => JSON.parse(localStorage.getItem(STORAGE_KEY))?.activeMatchId === 'import-round', { timeout: 5000 });
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(STORAGE_KEY)));
      assert.deepEqual(saved.players.map(player => player.id), ['import-player']);
      assert.deepEqual(saved.courses.map(course => course.id), ['import-course']);
      assert.deepEqual(saved.matches.map(round => round.id), ['import-round']);
      assert.equal(saved.matches[0].name, 'Round');
      assert.equal(saved.matches[0].storageMode, 'local');
      assert.equal(saved.notes, 'Keep original app notes');
      assert.equal(saved.lastOpenedSharedMatchId, 'keep-fixture-reference');
    });
  });

  await t.test('foreground readiness, poll startup, visible polling and pagehide drain synthetic scores', async () => {
    await withPage(fixture, async page => {
      const observed = await page.evaluate(async () => {
        const round = { id: 'drain-fixture', sharedMatchId: 'fixture-cloud', storageMode: 'shared', status: 'complete' };
        state.matches.push(round);
        state.activeMatchId = null;
        let visible = true, interval, timerCount = 0;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible ? 'visible' : 'hidden' });
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        // Boot already installed the real poll. Reset it before measuring poll registration.
        window.clearInterval(sharedScoreRefreshTimer);
        sharedScoreRefreshTimer = null;
        window.setInterval = callback => { interval = callback; return ++timerCount; };
        hasSupabaseConfig = () => true;
        const trace = [], pending = [];
        const original = drainPendingSharedScoreOutboxes;
        drainPendingSharedScoreOutboxes = () => {
          const run = original({
            scheduleContinuation: false,
            delivery: async match => {
              const operations = getSharedScoreOutboxOperations(match);
              trace.push(['delivered', match.id, operations.map(operation => operation.holeNumber)]);
              acknowledgeSharedScoreOperations(match, operations.map(operation => operation.operationId));
              return { ok: true, skipped: false, pending: 0 };
            },
          });
          pending.push(run);
          return run;
        };
        const queue = hole => queueSharedScoreOperation(round, 'p0', hole);
        queue(1);
        let release;
        ensureSharedSessionReady = () => {
          trace.push(['waiting-for-session']);
          return new Promise(resolve => { release = resolve; });
        };
        const foreground = resumeSharedForeground();
        const beforeSession = clonePlain(trace);
        release();
        const resumed = await foreground;
        await Promise.all(pending);
        queue(2);
        startSharedScoreRefresh();
        startSharedScoreRefresh();
        await Promise.all(pending);
        queue(3);
        visible = false;
        await interval();
        const hiddenPending = getSharedScoreOutboxOperations(round).map(operation => operation.holeNumber);
        visible = true;
        await interval();
        queue(4);
        window.dispatchEvent(new Event('pagehide'));
        await Promise.all(pending);
        return { beforeSession, resumed, trace, hiddenPending, timerCount, remaining: getSharedScoreOutboxOperations(round).length };
      });
      assert.deepEqual(observed.beforeSession, [['waiting-for-session']]);
      assert.equal(observed.resumed, true);
      assert.equal(observed.timerCount, 1);
      assert.deepEqual(observed.hiddenPending, [3]);
      assert.deepEqual(observed.trace, [
        ['waiting-for-session'],
        ...[1, 2, 3, 4].map(hole => ['delivered', 'drain-fixture', [hole]]),
      ]);
      assert.equal(observed.remaining, 0);
    });
  });
});
