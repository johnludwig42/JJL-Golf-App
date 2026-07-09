export function normalizeLedgerGross(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function normalizeLedgerStatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function normalizeLedgerStatBoolean(value) {
  return value === true || value === false ? !!value : null;
}

export function buildLedgerEntry({ playerId = '', playerName = '', holeNumber = 0, gross = null, stats = {}, source = '', sourceDevice = '', sourceParticipant = '', updatedAt = '' } = {}) {
  const id = String(playerId || '').trim();
  const hole = Number(holeNumber) || 0;
  const score = normalizeLedgerGross(gross);
  if (!id || !hole || score == null) return null;
  return {
    key: `${id}:${hole}`,
    playerId: id,
    playerName: playerName || id,
    holeNumber: hole,
    gross: score,
    scored: true,
    stats: {
      putts: normalizeLedgerStatNumber(stats?.putts),
      fairway: normalizeLedgerStatBoolean(stats?.fairway),
      green: normalizeLedgerStatBoolean(stats?.green),
      upAndDown: normalizeLedgerStatBoolean(stats?.upAndDown ?? stats?.up_and_down),
      sandy: normalizeLedgerStatBoolean(stats?.sandy),
    },
    source,
    sourceDevice,
    sourceParticipant,
    updatedAt,
  };
}

export function extractLocalScoredLedger(match = {}) {
  const players = Array.isArray(match.players) ? match.players : [];
  return players.flatMap(player => {
    const scores = Array.isArray(player.scores) ? player.scores : [];
    return scores.map((score, idx) => buildLedgerEntry({
      playerId: player.playerId,
      playerName: player.playerName || player.name || player.player?.name || player.playerId,
      holeNumber: Number(score?.holeNumber) || idx + 1,
      gross: score?.gross,
      stats: player.stats?.[idx] || {},
      source: 'local',
    })).filter(Boolean);
  }).sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)) || a.holeNumber - b.holeNumber);
}

export function extractRemoteScoredLedger(match = {}, scoreEntries = []) {
  const nameById = new Map((Array.isArray(match.players) ? match.players : []).map(player => [String(player.playerId), player.playerName || player.name || player.player?.name || player.playerId]));
  return (Array.isArray(scoreEntries) ? scoreEntries : []).map(entry => buildLedgerEntry({
    playerId: entry?.player_id || entry?.playerId,
    playerName: nameById.get(String(entry?.player_id || entry?.playerId)) || entry?.player_name || entry?.playerName || entry?.player_id || entry?.playerId,
    holeNumber: entry?.hole_number ?? entry?.holeNumber,
    gross: entry?.gross,
    stats: {
      putts: entry?.putts,
      fairway: entry?.fairway,
      green: entry?.green,
      upAndDown: entry?.up_and_down ?? entry?.upAndDown,
      sandy: entry?.sandy,
    },
    source: 'remote',
    sourceDevice: entry?.device_id || entry?.deviceId || '',
    sourceParticipant: entry?.participant_id || entry?.participantId || '',
    updatedAt: entry?.updated_at || entry?.updatedAt || '',
  })).filter(Boolean).sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)) || a.holeNumber - b.holeNumber);
}

export function summarizeLedgerCounts(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((acc, entry) => {
    const label = entry.playerName || entry.playerId || 'Unknown player';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

export function ledgerChecksum(entries = []) {
  const raw = (Array.isArray(entries) ? entries : []).map(entry => [
    entry.playerId,
    entry.holeNumber,
    entry.gross,
    entry.stats?.putts ?? '',
    entry.stats?.fairway ?? '',
    entry.stats?.green ?? '',
    entry.stats?.upAndDown ?? '',
    entry.stats?.sandy ?? '',
  ].join(':')).sort().join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = Math.imul(31, hash) + raw.charCodeAt(i) | 0;
  return Math.abs(hash).toString(16);
}

export function compareScoredLedgers(localLedger = [], remoteLedger = []) {
  const localMap = new Map((Array.isArray(localLedger) ? localLedger : []).map(entry => [entry.key, entry]));
  const remoteMap = new Map((Array.isArray(remoteLedger) ? remoteLedger : []).map(entry => [entry.key, entry]));
  const missingLocal = [];
  const missingRemote = [];
  const conflicts = [];
  remoteMap.forEach((remote, key) => {
    const local = localMap.get(key);
    if (!local) {
      missingLocal.push(remote);
      return;
    }
    [['gross', local.gross, remote.gross], ['putts', local.stats?.putts, remote.stats?.putts], ['fairway', local.stats?.fairway, remote.stats?.fairway], ['green', local.stats?.green, remote.stats?.green], ['upAndDown', local.stats?.upAndDown, remote.stats?.upAndDown], ['sandy', local.stats?.sandy, remote.stats?.sandy]].forEach(([field, localValue, remoteValue]) => {
      if (localValue == null || remoteValue == null) return;
      if (localValue !== remoteValue) conflicts.push({ playerId: local.playerId || remote.playerId, playerName: local.playerName || remote.playerName, holeNumber: local.holeNumber || remote.holeNumber, field, localValue, remoteValue, sourceDevice: remote.sourceDevice || '', sourceParticipant: remote.sourceParticipant || '' });
    });
  });
  localMap.forEach((local, key) => {
    if (!remoteMap.has(key)) missingRemote.push(local);
  });
  return {
    parityConfirmed: !missingLocal.length && !missingRemote.length && !conflicts.length,
    localCount: localMap.size,
    remoteCount: remoteMap.size,
    localCountsByPlayer: summarizeLedgerCounts(localLedger),
    remoteCountsByPlayer: summarizeLedgerCounts(remoteLedger),
    missingLocal,
    missingRemote,
    conflicts,
    checksum: {
      local: ledgerChecksum(localLedger),
      remote: ledgerChecksum(remoteLedger),
    },
  };
}

export function summarizeLedgerParity(comparison = null, { checkedAt = new Date().toISOString(), warning = '' } = {}) {
  const status = warning ? 'warning' : (comparison?.conflicts?.length ? 'conflict' : (comparison?.parityConfirmed ? 'confirmed' : 'not-confirmed'));
  return {
    status,
    parityConfirmed: status === 'confirmed',
    checkedAt,
    warning,
    localCount: Number(comparison?.localCount || 0),
    remoteCount: Number(comparison?.remoteCount || 0),
    localCountsByPlayer: comparison?.localCountsByPlayer || {},
    remoteCountsByPlayer: comparison?.remoteCountsByPlayer || {},
    missingLocal: (comparison?.missingLocal || []).map(entry => ({ playerId: entry.playerId, playerName: entry.playerName, holeNumber: entry.holeNumber, gross: entry.gross })),
    missingRemote: (comparison?.missingRemote || []).map(entry => ({ playerId: entry.playerId, playerName: entry.playerName, holeNumber: entry.holeNumber, gross: entry.gross })),
    conflicts: (comparison?.conflicts || []).map(conflict => ({ ...conflict })),
    checksum: comparison?.checksum || null,
  };
}

export function mergeRemoteLedgerIntoLocalMatch(match = {}, remoteLedger = []) {
  const players = Array.isArray(match.players) ? match.players : [];
  const byPlayer = new Map(players.map(player => [String(player.playerId), player]));
  const conflicts = [];
  let changed = false;
  remoteLedger.forEach(remote => {
    const player = byPlayer.get(String(remote.playerId));
    if (!player) return;
    if (!Array.isArray(player.scores)) player.scores = [];
    const idx = Number(remote.holeNumber) - 1;
    if (!player.scores[idx]) player.scores[idx] = { holeNumber: remote.holeNumber, gross: null };
    const localGross = normalizeLedgerGross(player.scores[idx].gross);
    if (localGross == null && remote.gross != null) {
      player.scores[idx].gross = remote.gross;
      changed = true;
    } else if (localGross != null && remote.gross != null && localGross !== remote.gross) {
      conflicts.push({ playerId: remote.playerId, playerName: remote.playerName, holeNumber: remote.holeNumber, field: 'gross', localValue: localGross, remoteValue: remote.gross });
    }
  });
  return { changed, conflicts, match };
}
