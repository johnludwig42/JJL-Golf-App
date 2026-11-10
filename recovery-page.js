(function () {
  'use strict';
  const api = window.DyeLedgerRecoveryFile;
  const byId = id => document.getElementById(id);
  const markerKey = api.restoreKeys.marker;
  const canaryKey = 'dye-ledger-recovery-isolation-canary';
  const receiptDatabase = 'the-dye-ledger-score-review-v1';
  const canaryPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  let canary;
  let approved = false;
  let plan = null;
  let generation = 0;
  let restoring = false;

  const announce = text => { byId('recoveryStatus').textContent = text; };

  function closePicker() {
    generation++;
    approved = false;
    plan = null;
    byId('recoveryPicker').replaceChildren();
    byId('recoveryDetails').hidden = true;
    byId('restoreRecovery').disabled = true;
  }

  function markerNotice() {
    const raw = localStorage.getItem(markerKey);
    if (raw === null) return false;
    let marker;
    try { marker = JSON.parse(raw); } catch {}
    closePicker();
    byId('checkIsolation').disabled = true;
    byId('canaryProof').hidden = true;
    announce(api.validateMarker(marker) && marker.phase === 'restored-verified'
      ? 'Verified recovery: ' + marker.results.rounds + ' rounds, ' + marker.results.receipts
        + ' review receipts. Backup: ' + marker.results.backup + '.'
      : 'Restore incomplete. This profile cannot be reused. Start again in a new disposable profile.');
    return true;
  }

  async function databaseEmpty() {
    if (typeof indexedDB.databases === 'function') return (await indexedDB.databases()).length === 0;
    // An upgrade transaction would create this database. Abort before creating anything.
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(receiptDatabase);
      let abortedCreation = false;
      request.onupgradeneeded = () => {
        abortedCreation = true;
        request.transaction.abort();
      };
      request.onerror = () => {
        if (abortedCreation && request.error?.name === 'AbortError') resolve(true);
        else reject(new Error('Could not verify IndexedDB isolation.'));
      };
      request.onblocked = () => reject(new Error('Close other tabs and use a new disposable profile.'));
      request.onsuccess = () => { request.result.close(); resolve(false); };
    });
  }

  function assertLocalIsolation(allowCanary) {
    if (navigator.onLine !== false) throw new Error('Disconnect from the network to continue.');
    if (localStorage.length === 0 && !allowCanary) return;
    if (localStorage.length !== 1 || !allowCanary || localStorage.getItem(canaryKey) !== canary) {
      throw new Error('This browser profile already contains data. Use a new disposable profile.');
    }
  }

  async function preflight(allowCanary) {
    assertLocalIsolation(allowCanary);
    if (!await databaseEmpty()) throw new Error('This browser profile already contains an IndexedDB database.');
    if (!navigator.serviceWorker?.getRegistrations || (await navigator.serviceWorker.getRegistrations()).length
      || navigator.serviceWorker.controller) throw new Error('This browser profile has a service worker or could not verify it.');
    if (!window.caches || (await caches.keys()).some(key => key.startsWith('the-dye-ledger-'))) {
      throw new Error('This browser profile contains app cache data or could not verify it.');
    }
    if (window.__DYE_SUPABASE_CLIENT__ || window.supabase) throw new Error('A cloud client is present in this profile.');
    assertLocalIsolation(allowCanary);
    return true;
  }

  async function checkIsolation() {
    if (restoring) return;
    closePicker();
    byId('canaryProof').hidden = true;
    if (markerNotice()) return;
    const attempt = generation;
    const existing = localStorage.getItem(canaryKey);
    canary = existing && canaryPattern.test(existing) ? existing : null;
    await preflight(Boolean(canary));
    if (attempt !== generation) return;
    if (!canary) {
      canary = crypto.randomUUID();
      localStorage.setItem(canaryKey, canary);
      assertLocalIsolation(true);
    }
    byId('canaryAbsent').checked = false;
    byId('originalCanary').value = '';
    byId('recoveryCanary').value = canary;
    byId('canaryProof').hidden = false;
    announce('Local checks passed. Confirm the two isolation codes.');
  }

  async function confirmIsolation() {
    if (restoring || markerNotice()) return;
    closePicker();
    const attempt = generation;
    const original = byId('originalCanary').value.trim();
    if (!canary || !byId('canaryAbsent').checked || !canaryPattern.test(original) || original === canary) {
      throw new Error('Verify both profiles and enter a different original-profile code.');
    }
    await preflight(true);
    if (attempt !== generation) return;
    approved = true;
    const label = document.createElement('label');
    label.textContent = 'Choose a Dye Ledger recovery file ';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => void handle(() => inspect(input.files?.[0])));
    label.append(input);
    byId('recoveryPicker').append(label);
    announce('Isolation verified. You can now open a recovery file.');
  }

  function listItems(id, text) {
    byId(id).replaceChildren(...text.map(value => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
  }

  async function inspect(file) {
    if (!approved || restoring || !file) return;
    const attempt = ++generation;
    plan = null;
    byId('recoveryDetails').hidden = true;
    byId('restoreRecovery').disabled = true;
    await preflight(true);
    if (file.size > 16 * 1024 * 1024) throw new Error('The recovery file is too large.');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    const parsed = api.parseRecoveryFile(text);
    if (!parsed.ok) throw new Error('File refused: ' + parsed.errors.join(', '));
    const verified = await api.verifyRecoveryFile(parsed.file);
    if (!verified.ok) throw new Error('File verification failed: ' + verified.errors.join(', '));
    const restorePlan = await api.planRestore(text, { profileNonce: canary, restoredAt: new Date().toISOString() });
    if (!approved || attempt !== generation) return;
    assertLocalIsolation(true);
    const { meta, payload, manifest } = parsed.file;
    const operations = payload.outbox?.operations?.length || 0;
    const review = payload.outbox?.preservedForHostReview?.length || 0;
    const startup = [payload.finishRecovery, payload.pendingLedger?.acceptance,
      payload.pendingLedger?.revision, payload.coursePublishRecovery].filter(value => value != null).length;
    byId('recoverySummary').textContent = 'File ' + meta.fileId + ' · ' + meta.createdAt + ' · ' + meta.appVersion
      + ' · ' + meta.sourceOrigin + ' · SHA-256 ' + restorePlan.marker.fileSha256
      + ' · ' + payload.state.matches.length + ' rounds · ' + operations + ' pending score writes · '
      + review + ' scores held for host review · ' + startup + ' startup records held';
    listItems('recoverySections', verified.sections.map(section => section.name + ': hash OK')
      .concat('Excluded stores: ' + manifest.exclusions.join(', ')));
    listItems('recoveryRounds', payload.state.matches.map((match, index) => [
      match.name || match.id, match.date, match.status, match.storageMode,
      match.courseSnapshot?.name || match.courseId, match.teeSnapshot?.teeName || match.teeId,
      match.roundRecordSnapshot ? 'Frozen record' : 'No frozen record',
      match.ledgerEntrySnapshot ? 'Accepted Ledger' : 'No accepted Ledger',
      (match.roundRecapFinal || match.ledgerEntrySnapshot?.report?.meta?.story) ? 'Story' : 'No Story',
      verified.rounds[index].ok ? 'Hash OK' : 'Hash mismatch',
    ].filter(Boolean).join(' · ')));
    plan = restorePlan;
    byId('recoveryDetails').hidden = false;
    byId('restoreRecovery').disabled = false;
    announce('File verified. Inspection has left the round data in memory.');
  }

  function receiptTransaction(mode, action) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(receiptDatabase, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('receipts', { keyPath: 'id' }).createIndex('matchId', 'matchId');
      };
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('The receipt store is blocked.'));
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction('receipts', mode);
          const request = action(tx.objectStore('receipts'));
          tx.oncomplete = () => { db.close(); resolve(request.result); };
          tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || request.error); };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  async function restore() {
    if (!approved || !plan || restoring) return;
    if (!navigator.locks?.request) throw new Error('This browser cannot isolate concurrent recovery attempts.');
    restoring = true;
    const selected = plan;
    const attempt = generation;
    byId('restoreRecovery').disabled = true;
    try {
      const result = await navigator.locks.request('dye-ledger-recovery-restore', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is already restoring this profile.');
        return api.executeRestorePlan(selected, {
          storage: localStorage,
          idb: {
            put: receipt => receiptTransaction('readwrite', store => store.add(receipt)),
            listAll: () => receiptTransaction('readonly', store => store.getAll()),
          },
          preflight: async () => approved && generation === attempt && await preflight(true),
          isOffline: () => navigator.onLine === false && generation === attempt,
          now: () => new Date().toISOString(),
        });
      });
      closePicker();
      if (!markerNotice() && !result.ok) announce('Restore refused: ' + result.error);
    } finally {
      restoring = false;
    }
  }

  async function handle(action) {
    try { await action(); }
    catch (error) { announce(error?.message || 'Recovery check failed.'); }
  }

  byId('checkIsolation').addEventListener('click', () => void handle(checkIsolation));
  byId('confirmIsolation').addEventListener('click', () => void handle(confirmIsolation));
  byId('restoreRecovery').addEventListener('click', () => void handle(restore));
  window.addEventListener('online', () => {
    closePicker();
    byId('canaryProof').hidden = true;
    if (!markerNotice()) announce('Disconnect and check isolation again.');
  });
  window.addEventListener('storage', () => {
    if (markerNotice()) return;
    if (approved) {
      closePicker();
      announce('Storage changed. Check isolation again.');
    }
  });
  void handle(() => {
    if (!markerNotice()) announce('Disconnect, then check isolation.');
  });
})();
