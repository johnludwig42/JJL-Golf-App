export function report(state, { reconstructed = false } = {}) {
  return `# Supervisor report${reconstructed ? ' — reconstructed' : ''}\n\n` +
    `Package: ${state.packageId}\nRound: ${state.round}\nStop: ${state.stop || state.state}\n` +
    `Base: ${state.baseSha}\nFingerprint: ${state.fingerprint || 'not captured'}\n` +
    `Checks: ${JSON.stringify(state.checks || [])}\nOpen findings: ${(state.findings || []).map(row => row.id).join(', ') || 'none'}\n` +
    `Evidence incomplete: ${(state.evidenceIncomplete || []).join(', ') || 'none reported'}\n\n` +
    (state.failure ? `Failure: ${state.failure.code}: ${state.failure.message}\n\n` : '') +
    'Next: owner decision or independent review; READY grants no commit, merge or deployment authority.\n';
}
