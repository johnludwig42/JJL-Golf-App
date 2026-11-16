(() => {
  // iOS Safari reserves space for its own print header and footer even when
  // @page has no margin. Mark the document before the report measures and
  // packs its pages so each physical page fits that smaller print area.
  const userAgent = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const isIosPrintSurface = /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  if (isIosPrintSurface) document.documentElement.classList.add('ios-print-surface');

  const opener = window.opener;
  const query = new URLSearchParams(window.location.search);
  const transferKey = query.get('reportKey');
  const retainedVersion = query.get('v');
  const consumedMarkerKey = 'dye-ledger-report:last-consumed';
  const recoveryView = transferKey?.startsWith('dye-ledger-report-recovery-') || query.get('view') === 'recovery';
  let transfer = null;
  if (transferKey) {
    try {
      transfer = JSON.parse(sessionStorage.getItem(transferKey) || 'null');
      const createdAt = Date.parse(String(transfer?.createdAt || ''));
      if (!Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000) {
        sessionStorage.removeItem(transferKey);
        transfer = null;
      }
    } catch (_error) {
      transfer = null;
    }
  }
  if (recoveryView || transfer?.viewOnly === true) {
    if (transferKey) {
      try { sessionStorage.removeItem(transferKey); } catch (_error) {}
    }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = '';
    if (retainedVersion) cleanUrl.searchParams.set('v', retainedVersion);
    cleanUrl.searchParams.set('view', 'recovery');
    window.history.replaceState(null, '', cleanUrl);
    window.opener = null;
    Object.defineProperties(globalThis, {
      __DYE_LEDGER_VIEW_ONLY__: { value: true },
      __DYE_LEDGER_QUEUE_ACCEPTANCE__: { value: () => false },
      __DYE_LEDGER_QUEUE_REVISION__: { value: () => false },
    });
    globalThis.__DYE_LEDGER_ROUND__ = transfer?.report || null;
    globalThis.__DYE_LEDGER_AUTO_PRINT__ = false;
    globalThis.__DYE_LEDGER_RETURN_URL__ = new URL('../recovery.html', window.location.href).href;
    globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__ = '';
    globalThis.__DYE_LEDGER_REPORT_MISSING__ = !transfer?.report;
    window.addEventListener('DOMContentLoaded', () => {
      for (const id of ['acceptLedgerEntryBtn', 'reviseLedgerEntryBtn']) {
        const button = document.getElementById(id);
        if (button) button.hidden = true;
      }
      const status = document.getElementById('ledgerAcceptanceStatus');
      if (status) {
        status.hidden = false;
        status.textContent = 'View only · from recovery file';
      }
      const returnButton = document.getElementById('returnToMatchBtn');
      if (returnButton) returnButton.textContent = '‹ Return to recovery';
      if (!transfer?.report) {
        const doc = document.getElementById('doc');
        if (doc) doc.innerHTML = '<main class="report-missing"><h1>Report data is no longer available</h1><p>Return to recovery and choose the recovery file again.</p></main>';
      }
    });
    return;
  }
  if (transfer) {
    try { sessionStorage.setItem(consumedMarkerKey, String(Date.now())); } catch (_error) {}
  }
  const priorConsumedAt = (() => {
    try { return Number(sessionStorage.getItem(consumedMarkerKey) || 0); } catch (_error) { return 0; }
  })();
  const missingReloadPayload = !transferKey && !opener && priorConsumedAt > 0 && Date.now() - priorConsumedAt < 10 * 60 * 1000;
  if (transferKey) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = retainedVersion ? `?v=${encodeURIComponent(retainedVersion)}` : '';
    window.history.replaceState(null, '', cleanUrl);
  }
  globalThis.__DYE_LEDGER_ROUND__ = transfer?.report || opener?.__DYE_LEDGER_PENDING_REPORT__ || null;
  globalThis.__DYE_LEDGER_AUTO_PRINT__ = transfer ? Boolean(transfer.autoPrint) : Boolean(opener?.__DYE_LEDGER_AUTO_PRINT__);
  globalThis.__DYE_LEDGER_RETURN_URL__ = String(transfer?.returnUrl || '');
  globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__ = transfer ? transferKey : '';
  globalThis.__DYE_LEDGER_REPORT_MISSING__ = missingReloadPayload;
  globalThis.__DYE_LEDGER_QUEUE_ACCEPTANCE__ = envelope => {
    try {
      localStorage.setItem('dye-ledger:pending-ledger-entry-acceptance', JSON.stringify(envelope));
      return true;
    } catch (_error) {
      return false;
    }
  };
  globalThis.__DYE_LEDGER_QUEUE_REVISION__ = roundId => {
    try {
      localStorage.setItem('dye-ledger:pending-ledger-entry-revision', JSON.stringify({ roundId: String(roundId || '') }));
      return true;
    } catch (_error) {
      return false;
    }
  };
  if (missingReloadPayload) {
    window.addEventListener('DOMContentLoaded', () => {
      const doc = document.getElementById('doc');
      if (doc) doc.innerHTML = '<main class="report-missing"><h1>Report data is no longer available</h1><p>Return to The Dye Ledger and generate the Ledger Entry again. Your saved round has not been changed.</p></main>';
    });
  }
  try {
    if (opener) {
      opener.__DYE_LEDGER_PENDING_REPORT__ = null;
      opener.__DYE_LEDGER_AUTO_PRINT__ = false;
    }
  } catch (_error) {
    // A report may still render when the opener was closed or isolated.
  }
})();
