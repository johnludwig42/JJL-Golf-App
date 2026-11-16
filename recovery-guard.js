(function () {
  'use strict';
  const scripts = document.getElementById('appStartupScripts');

  function notice(text, blocked) {
    const node = document.createElement('p');
    node.setAttribute('role', blocked ? 'alert' : 'status');
    node.id = 'recoveryStartupNotice';
    node.textContent = text;
    if (blocked) document.body.replaceChildren(node);
    else document.body.prepend(node);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  function disableCloud() {
    window.__DYE_SUPABASE_CONFIG__ = Object.freeze({ accountAuth: Object.freeze({ enabled: false }) });
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'self' data: blob:; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'none'; base-uri 'none'; form-action 'none'";
    document.head.append(policy);
  }

  async function inspect() {
    const api = window.DyeLedgerRecoveryFile;
    const { marker, scoreHold, startupHold } = api.restoreKeys;
    const keyList = [marker, scoreHold, startupHold];
    const raw = Object.fromEntries(keyList.map(key => [key, localStorage.getItem(key)]));
    const decode = key => {
      try { return JSON.parse(raw[key]); } catch { return null; }
    };
    const record = decode(marker);
    const score = decode(scoreHold);
    const startup = decode(startupHold);
    const scoreValid = await api.validateHoldRecord(score, 'score');
    const startupValid = raw[startupHold] === null || await api.validateHoldRecord(startup, 'startup');
    const unchanged = keyList.every(key => localStorage.getItem(key) === raw[key]);
    const blocked = state => ({ state, blocked: true, cloudOff: true, raw });
    const held = () => ({
      heldMatchIds: score.heldMatchIds,
      heldScores: [
        ...score.operations, ...score.preservedForHostReview,
        ...Object.entries(score.queueRecovery).flatMap(([matchId, fields]) =>
          Object.values(fields.sharedScoreQueueRecovery || {}).map(row => ({ ...row, matchId }))),
      ].filter(row => row?.matchId && row.operationId)
        .map(({ matchId, operationId }) => Object.freeze({ matchId, operationId })),
    });
    if (!unchanged) return blocked('G2');
    if (raw[marker] !== null) {
      if (!api.validateMarker(record) || record.phase !== 'restored-verified') return blocked('G2');
      if (!scoreValid || !startupValid || score.fileId !== record.fileId
        || score.fileSha256 !== record.fileSha256 || (startup && startup.fileId !== record.fileId)
        || await api.sha256Hex(raw[scoreHold]) !== record.expected[scoreHold]
        || (startup && await api.sha256Hex(raw[startupHold]) !== record.expected[startupHold])) return blocked('G3');
      if (keyList.some(key => localStorage.getItem(key) !== raw[key])) return blocked('G2');
      return { state: 'G1', cloudOff: true, ...held(), raw };
    }
    if (!scoreValid || !startupValid || (startup && startup.fileId !== score.fileId)) {
      return { state: 'G5', cloudOff: true, raw };
    }
    return { state: 'G4', cloudOff: false, ...held(), raw };
  }

  async function start() {
    await loadScript('recovery-file.js');
    const guard = await inspect();
    window.__DYE_RECOVERY_GUARD__ = Object.freeze({
      ...guard, raw: Object.freeze(guard.raw), heldMatchIds: Object.freeze(guard.heldMatchIds || []),
      heldScores: Object.freeze(guard.heldScores || []),
    });
    if (guard.cloudOff) disableCloud();
    if (guard.blocked) {
      notice('Restore incomplete or unreadable. Open the recovery page.', true);
      return;
    }
    if (guard.state === 'G1') notice('Verification copy: cloud features off', false);
    if (guard.state === 'G5') notice('Recovery hold unreadable: cloud sending paused. Nothing was deleted.', false);
    for (const script of scripts.content.querySelectorAll('script[src]')) {
      if (Object.entries(guard.raw).some(([key, value]) => localStorage.getItem(key) !== value)) {
        throw new Error('Recovery profile changed during startup.');
      }
      if (guard.cloudOff && script.hasAttribute('data-cloud-sdk')) continue;
      try { await loadScript(script.getAttribute('src')); }
      catch (error) { if (!script.hasAttribute('data-cloud-sdk')) throw error; }
    }
  }

  start().catch(() => {
    disableCloud();
    notice('Restore incomplete or unreadable. Open the recovery page.', true);
  });
})();
