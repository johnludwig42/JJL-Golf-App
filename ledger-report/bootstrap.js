(() => {
  const opener = window.opener;
  globalThis.__DYE_LEDGER_ROUND__ = opener?.__DYE_LEDGER_PENDING_REPORT__ || null;
  globalThis.__DYE_LEDGER_AUTO_PRINT__ = Boolean(opener?.__DYE_LEDGER_AUTO_PRINT__);
  try {
    if (opener) {
      opener.__DYE_LEDGER_PENDING_REPORT__ = null;
      opener.__DYE_LEDGER_AUTO_PRINT__ = false;
    }
  } catch (_error) {
    // A report may still render when the opener was closed or isolated.
  }
})();
