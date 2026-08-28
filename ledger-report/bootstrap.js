(() => {
  const opener = window.opener;
  const query = new URLSearchParams(window.location.search);
  const transferKey = query.get('reportKey');
  const retainedVersion = query.get('v');
  const consumedMarkerKey = 'dye-ledger-report:last-consumed';
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
