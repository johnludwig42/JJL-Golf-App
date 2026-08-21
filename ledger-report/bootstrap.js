(() => {
  const opener = window.opener;
  const transferKey = new URLSearchParams(window.location.search).get('reportKey');
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
  globalThis.__DYE_LEDGER_ROUND__ = transfer?.report || opener?.__DYE_LEDGER_PENDING_REPORT__ || null;
  globalThis.__DYE_LEDGER_AUTO_PRINT__ = transfer ? Boolean(transfer.autoPrint) : Boolean(opener?.__DYE_LEDGER_AUTO_PRINT__);
  globalThis.__DYE_LEDGER_RETURN_URL__ = String(transfer?.returnUrl || '');
  globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__ = transfer ? transferKey : '';
  try {
    if (opener) {
      opener.__DYE_LEDGER_PENDING_REPORT__ = null;
      opener.__DYE_LEDGER_AUTO_PRINT__ = false;
    }
  } catch (_error) {
    // A report may still render when the opener was closed or isolated.
  }
})();
