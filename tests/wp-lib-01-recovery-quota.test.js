import assert from 'node:assert/strict';
import test from 'node:test';
import '../recovery-file.js';

const recovery = globalThis.DyeLedgerRecoveryFile;
const { restoreKeys: keys } = recovery;
const timestamp = '2026-10-10T18:00:00.000Z';

function round(id, status, date, withLedger = false) {
  return {
    id, status, date, storageMode: 'local', notes: 'x'.repeat(400),
    ...(withLedger ? { ledgerEntrySnapshot: {
      status: 'accepted', roundId: id, acceptedAt: timestamp,
      report: { meta: { roundId: id, status: 'final', story: 'Synthetic story.' } },
    } } : {}),
  };
}

async function fixture() {
  const state = {
    matches: [
      round('ledger', 'complete', '2026-10-07', true),
      round('older', 'complete', '2026-10-04'),
      { ...round('active', 'active', '2026-10-05'), storageMode: 'shared', sharedMatchId: 'synthetic-shared',
        sharedScoreQueueRecovery: { synthetic: true } },
      round('open', 'active', '2026-10-03'),
      round('newer', 'complete', '2026-10-06'),
    ],
    activeMatchId: 'active', players: [], courses: [], sharedMatchIds: ['synthetic-shared'],
    completedSummaryMatchId: 'ledger',
  };
  const receipts = [{ id: 'synthetic-receipt' }];
  const file = await recovery.buildRecoveryFile({
    state, reviewReceipts: receipts, setupDraft: '{"synthetic":true}', finishRecovery: '{"synthetic":true}',
  }, {
    appVersion: 'synthetic', createdAt: timestamp, sourceOrigin: 'http://127.0.0.1', fileId: 'synthetic-file',
  });
  const plan = await recovery.planRestore(recovery.serialize(file), { profileNonce: 'synthetic', restoredAt: timestamp });
  return { state, receipts, file, plan };
}

function adapters(cap = Infinity, fault) {
  const rows = new Map();
  const receipts = [];
  return {
    rows, receipts,
    options: {
      preflight: () => true, isOffline: () => true, now: () => timestamp,
      idb: { put: row => receipts.push(row), listAll: () => receipts },
      storage: {
        getItem: key => rows.get(key) ?? null,
        setItem(key, value) {
          const next = new Map(rows).set(key, value);
          const size = [...next].reduce((sum, [name, text]) => sum + name.length + text.length, 0);
          if (size > cap) throw new DOMException('Synthetic storage cap', 'QuotaExceededError');
          rows.set(key, fault ? fault(key, value) : value);
        },
      },
    },
  };
}

async function capFixture() {
  const data = await fixture();
  const paused = adapters();
  const interrupted = await recovery.executeRestorePlan(data.plan, { ...paused.options, stopAfter: 'S5' });
  assert.equal(interrupted.step, 'S5');
  const beforePrimary = [...paused.rows].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  const plannedState = JSON.parse(data.plan.values[keys.state]);
  return {
    ...data,
    candidate(ids) {
      const text = JSON.stringify({ ...plannedState, matches: plannedState.matches.filter(match => ids.includes(match.id)) });
      return { text, cap: beforePrimary + keys.state.length + text.length };
    },
  };
}

test('AC-R5 simulated size cap retains the largest priority prefix in file order', async t => {
  const data = await capFixture();
  const cases = [
    ['full', ['ledger', 'older', 'active', 'open', 'newer']],
    ['drops accepted Ledger only', ['older', 'active', 'open', 'newer']],
    ['drops into completed without Ledger', ['active', 'open', 'newer']],
    ['mandatory only', ['active']],
  ];
  for (const [label, ids] of cases) {
    await t.test(label, async () => {
      const { text, cap } = data.candidate(ids);
      const destination = adapters(label === 'full' ? Infinity : cap);
      const result = await recovery.executeRestorePlan(data.plan, destination.options);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(destination.rows.get(keys.state), text);
      for (const key of [keys.scoreHold, keys.startupHold, keys.setupDraft]) {
        assert.equal(destination.rows.get(key), data.plan.values[key]);
      }
      assert.deepEqual(destination.receipts, data.receipts);
      const score = JSON.parse(destination.rows.get(keys.scoreHold));
      for (const match of JSON.parse(text).matches) {
        assert.equal(
          await recovery.sha256Hex(recovery.canonical({ ...match, ...score.queueRecovery[match.id] })),
          data.file.rounds.find(row => row.roundId === match.id).canonicalSha256,
        );
      }
      const backup = label === 'full' ? 'verified' : 'quota-unavailable';
      const leftInFile = data.state.matches.map(match => match.id).filter(id => !ids.includes(id));
      assert.deepEqual(result.marker.results, {
        rounds: ids.length, receipts: 1, backup, ...(leftInFile.length ? { leftInFile } : {}),
      });
      assert.deepEqual(JSON.parse(destination.rows.get(keys.marker)), result.marker);
      assert.equal(result.marker.expected[keys.state], await recovery.sha256Hex(text));
      assert.equal(result.marker.expected[keys.backup], result.marker.expected[keys.state]);
      assert.equal(destination.rows.get(keys.backup), backup === 'verified' ? text : undefined);
    });
  }
});

test('FT-13 simulated size cap and write faults leave the profile restoring', async t => {
  const data = await capFixture();
  const { cap } = data.candidate(['active']);
  const cases = [
    ['below mandatory', cap - 1, undefined, 'S6', 'quota-exceeded'],
    ['reduced readback mismatch', cap, (key, value) => key === keys.state ? value + ' ' : value,
      'S6', 'restore-readback-mismatch'],
    ['S8 write failure', cap, (key, value) => {
      if (key === keys.marker && JSON.parse(value).phase === 'restored-verified') throw new Error('simulated-S8');
      return value;
    }, 'S8', 'simulated-S8'],
  ];
  for (const [label, limit, fault, step, error] of cases) {
    await t.test(label, async () => {
      const destination = adapters(limit, fault);
      assert.deepEqual(await recovery.executeRestorePlan(data.plan, destination.options), { ok: false, step, error });
      assert.equal(JSON.parse(destination.rows.get(keys.marker)).phase, 'restoring');
      if (label === 'below mandatory') assert.equal(destination.rows.has(keys.state), false);
    });
  }
});

test('priority, accepted Ledger selector, and optional marker list validation', async () => {
  const { state, plan } = await fixture();
  assert.deepEqual(recovery.restorePriority(state), ['open', 'newer', 'older', 'ledger']);
  const ledger = state.matches[0];
  assert.equal(recovery.acceptedLedgerReport(ledger).meta.story, 'Synthetic story.');
  for (const patch of [
    { status: 'draft' }, { acceptedAt: '' }, { report: { meta: { status: 'final', roundId: 'other', story: 'Story' } } },
    { report: { meta: { status: 'draft', roundId: ledger.id, story: 'Story' } } },
    { report: { meta: { status: 'final', roundId: ledger.id, story: ' ' } } },
  ]) {
    assert.equal(recovery.acceptedLedgerReport({ ...ledger, ledgerEntrySnapshot: { ...ledger.ledgerEntrySnapshot, ...patch } }), null);
  }
  const result = await recovery.executeRestorePlan(plan, adapters().options);
  assert.equal(recovery.validateMarker(result.marker), true);
  for (const leftInFile of [[], ['ledger', 'ledger'], [''], [1], 'ledger']) {
    assert.equal(recovery.validateMarker({ ...result.marker, results: { ...result.marker.results, leftInFile } }), false);
  }
});
