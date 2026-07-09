import fs from 'node:fs';

function readActivePackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return String(packageJson.version || '').trim() || '30.3.50';
  } catch {
    return '30.3.50';
  }
}

const ACTIVE_PACKAGE_VERSION = readActivePackageVersion();

export const SIMULATION_VERSION = `v${ACTIVE_PACKAGE_VERSION}`;
export const DEFAULT_SEED = `dye-ledger-v${ACTIVE_PACKAGE_VERSION}-default`;

export const DEFAULT_GAMES = [
  { key: 'match_play', basis: 'net', stake: 5 },
  { key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 },
  { key: 'skins', basis: 'gross', skinsType: 'individual', stake: 2 },
  { key: 'net_skins', basis: 'net', skinsType: 'individual', stake: 2 },
  { key: 'nine_point', basis: 'net', stakePerPoint: 1, playerIds: ['p1', 'p2', 'p3'] },
];

const DEFAULT_HOLES = [
  [4, 7], [5, 13], [3, 17], [4, 3], [4, 1], [5, 11], [4, 5], [3, 15], [4, 9],
  [4, 8], [5, 14], [3, 18], [4, 4], [4, 2], [5, 12], [4, 6], [3, 16], [4, 10],
].map(([par, strokeIndex], idx) => ({ holeNumber: idx + 1, par, strokeIndex }));

export function createRng(seed = DEFAULT_SEED) {
  let h = 2166136261 >>> 0;
  for (const char of String(seed)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cloneJson = value => JSON.parse(JSON.stringify(value));

export function makeDefaultCourse() {
  return {
    name: 'Simulation National',
    teeName: 'Ledger',
    rating: 72,
    slope: 128,
    par: 72,
    holes: cloneJson(DEFAULT_HOLES),
  };
}

export function courseHandicap(index = 0, slope = 113, rating = 72, par = 72) {
  return Math.round((Number(index) || 0) * (Number(slope) || 113) / 113 + ((Number(rating) || par) - (Number(par) || 72)));
}

export function playingHandicap(courseHdcp = 0, allowance = 100) {
  return Math.round((Number(courseHdcp) || 0) * (Number(allowance) || 100) / 100);
}

export function holeStrokeAllowanceForPlayer(holeStrokeIndex, playerHandicap, baseHandicap) {
  const diff = Math.max(0, Math.round(Number(playerHandicap) || 0) - Math.round(Number(baseHandicap) || 0));
  const strokeIndex = Math.round(Number(holeStrokeIndex) || 0);
  if (!diff || !strokeIndex) return 0;
  const fullRounds = Math.floor(diff / 18);
  const remainder = diff % 18;
  return fullRounds + (strokeIndex <= remainder ? 1 : 0);
}

export function normalizeRound(round) {
  const normalized = cloneJson(round);
  normalized.version = normalized.version || SIMULATION_VERSION;
  normalized.course = normalized.course || makeDefaultCourse();
  normalized.holeCount = Number(normalized.holeCount || normalized.course.holes?.length || 18);
  normalized.allowance = Number(normalized.allowance || 100);
  normalized.players = (normalized.players || []).map((player, idx) => ({
    id: player.id || `p${idx + 1}`,
    name: player.name || `Player ${idx + 1}`,
    index: Number(player.index || 0),
    team: Number(player.team || (idx % 2) + 1),
  }));
  normalized.teams = normalized.teams || [{ team: 1, name: 'Team 1' }, { team: 2, name: 'Team 2' }];
  normalized.scores = normalized.scores || {};
  normalized.selectedGames = normalized.selectedGames || cloneJson(DEFAULT_GAMES);
  normalized.scoringAccessMode = normalized.scoringAccessMode || 'single_device';
  normalized.sharedAssignments = normalized.sharedAssignments || {};
  return normalized;
}

export function computeMetrics(roundInput) {
  const round = normalizeRound(roundInput);
  const holes = round.course.holes.slice(0, round.holeCount);
  const players = round.players.map(player => {
    const ch = courseHandicap(player.index, round.course.slope, round.course.rating, round.course.par);
    const ph = playingHandicap(ch, round.allowance);
    return { ...player, courseHdcp: ch, playHdcp: ph, scores: (round.scores[player.id] || []).slice(0, round.holeCount) };
  });
  const lowPlaying = Math.min(...players.map(p => p.playHdcp));
  const holeResults = holes.map((hole, idx) => {
    const playerScores = players.map(player => {
      const gross = Number(player.scores[idx]);
      const hasScore = Number.isFinite(gross) && gross > 0;
      const strokes = holeStrokeAllowanceForPlayer(hole.strokeIndex, player.playHdcp, lowPlaying);
      return { playerId: player.id, team: player.team, gross: hasScore ? gross : null, net: hasScore ? gross - strokes : null, strokes, par: hole.par };
    });
    const completed = playerScores.every(score => Number.isFinite(score.gross));
    const teamScores = [1, 2].map(team => {
      const scored = playerScores.filter(score => score.team === team && Number.isFinite(score.gross));
      return {
        team,
        grossAggregate: scored.length ? scored.reduce((sum, score) => sum + score.gross, 0) : null,
        netAggregate: scored.length ? scored.reduce((sum, score) => sum + score.net, 0) : null,
        grossBest: scored.length ? Math.min(...scored.map(score => score.gross)) : null,
        netBest: scored.length ? Math.min(...scored.map(score => score.net)) : null,
      };
    });
    const lowGross = completed ? Math.min(...playerScores.map(score => score.gross)) : null;
    const lowNet = completed ? Math.min(...playerScores.map(score => score.net)) : null;
    return {
      holeNumber: hole.holeNumber,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      completed,
      playerScores,
      teamScores,
      grossWinners: completed ? playerScores.filter(score => score.gross === lowGross).map(score => score.playerId) : [],
      netWinners: completed ? playerScores.filter(score => score.net === lowNet).map(score => score.playerId) : [],
    };
  });
  return { round, players, holes, lowPlaying, holeResults, completed: holeResults.filter(hole => hole.completed).length, holeCount: round.holeCount };
}

const teamHoleScore = (hole, team, basis = 'net') => {
  const teamScore = hole.teamScores.find(score => score.team === team);
  return basis === 'gross' ? teamScore?.grossBest : teamScore?.netBest;
};

const headToHead = (value1, value2) => {
  if (!Number.isFinite(value1) || !Number.isFinite(value2)) return 0;
  if (value1 < value2) return 1;
  if (value2 < value1) return -1;
  return 0;
};

export function computeTeamDiffs(metrics, basis = 'net') {
  const diffs = { front: 0, back: 0, overall: 0, closedAt: null, winner: 0 };
  metrics.holeResults.forEach((hole, idx) => {
    if (!hole.completed) return;
    const step = headToHead(teamHoleScore(hole, 1, basis), teamHoleScore(hole, 2, basis));
    diffs.overall += step;
    if (idx < 9) diffs.front += step;
    else diffs.back += step;
    const holesRemaining = metrics.holeCount - (idx + 1);
    if (!diffs.closedAt && Math.abs(diffs.overall) > holesRemaining) {
      diffs.closedAt = idx + 1;
      diffs.winner = diffs.overall > 0 ? 1 : 2;
    }
  });
  if (!diffs.winner && diffs.overall !== 0 && metrics.completed === metrics.holeCount) diffs.winner = diffs.overall > 0 ? 1 : 2;
  return diffs;
}

function addAmount(amounts, playerId, amount) {
  amounts[playerId] = (Number(amounts[playerId]) || 0) + Number(amount || 0);
}

const teamMemberIds = (metrics, team) => metrics.players.filter(player => player.team === team).map(player => player.id);

function transferTeamStakePerPerson(metrics, amounts, winnerTeam, loserTeam, stakePerPerson) {
  const winners = teamMemberIds(metrics, winnerTeam);
  const losers = teamMemberIds(metrics, loserTeam);
  const stake = Number(stakePerPerson || 0);
  if (!winners.length || !losers.length || !stake) return;
  const winnerShare = stake * losers.length / winners.length;
  winners.forEach(id => addAmount(amounts, id, winnerShare));
  losers.forEach(id => addAmount(amounts, id, -stake));
}

function addVsField(metrics, amounts, winnerId, stake) {
  const perOpponent = Number(stake || 0);
  if (!winnerId || !perOpponent) return;
  metrics.players.filter(player => player.id !== winnerId).forEach(player => {
    addAmount(amounts, winnerId, perOpponent);
    addAmount(amounts, player.id, -perOpponent);
  });
}

export function computeSkins(metrics, basis = 'gross') {
  const winnersByHole = [];
  metrics.holeResults.forEach(hole => {
    if (!hole.completed) return;
    const winners = basis === 'net' ? hole.netWinners : hole.grossWinners;
    if (winners.length === 1) winnersByHole.push({ holeNumber: hole.holeNumber, winner: winners[0], basis });
  });
  return winnersByHole;
}

export function computeNinePointHolePoints(valuesByPlayerId) {
  const entries = Object.entries(valuesByPlayerId || {}).filter(([, value]) => Number.isFinite(value));
  if (entries.length !== 3) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [[aId, aVal], [bId, bVal], [cId, cVal]] = entries;
  if (aVal === cVal) return { [aId]: 3, [bId]: 3, [cId]: 3 };
  if (aVal === bVal) return { [aId]: 4, [bId]: 4, [cId]: 1 };
  if (bVal === cVal) return { [aId]: 5, [bId]: 2, [cId]: 2 };
  return { [aId]: 5, [bId]: 3, [cId]: 1 };
}

export function computeNinePoint(metrics, cfg = {}) {
  const playerIds = (cfg.playerIds || metrics.players.slice(0, 3).map(player => player.id)).slice(0, 3);
  const basis = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
  const stakePerPoint = Number(cfg.stakePerPoint || 0);
  const totals = Object.fromEntries(playerIds.map(id => [id, 0]));
  const holes = [];
  metrics.holeResults.forEach(hole => {
    const values = {};
    playerIds.forEach(id => {
      const score = hole.playerScores.find(row => row.playerId === id);
      const value = basis === 'gross' ? score?.gross : score?.net;
      if (Number.isFinite(value)) values[id] = value;
    });
    const points = computeNinePointHolePoints(values);
    if (!points) {
      holes.push({ holeNumber: hole.holeNumber, completed: false, points: {} });
      return;
    }
    Object.entries(points).forEach(([id, pointsValue]) => { totals[id] += pointsValue; });
    holes.push({ holeNumber: hole.holeNumber, completed: true, values, points });
  });
  const amounts = Object.fromEntries(playerIds.map(id => [id, 0]));
  const paymentLines = [];
  playerIds.forEach((playerI, i) => {
    playerIds.slice(i + 1).forEach(playerJ => {
      const diff = totals[playerI] - totals[playerJ];
      const amount = Math.abs(diff * stakePerPoint);
      if (amount <= 0.0001) return;
      if (diff > 0) {
        addAmount(amounts, playerI, amount);
        addAmount(amounts, playerJ, -amount);
        paymentLines.push({ from: playerJ, to: playerI, amount });
      } else {
        addAmount(amounts, playerI, -amount);
        addAmount(amounts, playerJ, amount);
        paymentLines.push({ from: playerI, to: playerJ, amount });
      }
    });
  });
  return { playerIds, basis, stakePerPoint, totals, holes, amounts, paymentLines, completedHoles: holes.filter(h => h.completed).length };
}

export const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

export function optimalSettlementRows(amountsByPlayer) {
  const debtors = Object.entries(amountsByPlayer).filter(([, amount]) => amount < -0.0001).map(([playerId, amount]) => ({ playerId, amount: Math.abs(amount) })).sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(amountsByPlayer).filter(([, amount]) => amount > 0.0001).map(([playerId, amount]) => ({ playerId, amount })).sort((a, b) => b.amount - a.amount);
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    rows.push({ from: debtors[i].playerId, to: creditors[j].playerId, amount: roundMoney(amount) });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= 0.0001) i += 1;
    if (creditors[j].amount <= 0.0001) j += 1;
  }
  return rows;
}

export function computePayouts(roundInput) {
  const metrics = computeMetrics(roundInput);
  const games = [];
  const finalTotals = Object.fromEntries(metrics.players.map(player => [player.id, 0]));
  const addGame = game => {
    Object.entries(game.amounts || {}).forEach(([id, amount]) => addAmount(finalTotals, id, amount));
    games.push(game);
  };
  for (const cfg of metrics.round.selectedGames) {
    if (cfg.key === 'match_play') {
      const basis = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
      const diffs = computeTeamDiffs(metrics, basis);
      const amounts = {};
      const winner = diffs.overall > 0 ? 1 : diffs.overall < 0 ? 2 : 0;
      if (winner) transferTeamStakePerPerson(metrics, amounts, winner, winner === 1 ? 2 : 1, cfg.stake);
      addGame({ key: 'match_play', label: `Match Play (${basis})`, amounts, meta: { diffs } });
    }
    if (cfg.key === 'nassau') {
      const basis = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
      const diffs = computeTeamDiffs(metrics, basis);
      const amounts = {};
      [['front', cfg.stakesFront], ['back', cfg.stakesBack], ['overall', cfg.stakesOverall]].forEach(([part, stake]) => {
        const diff = diffs[part];
        const winner = diff > 0 ? 1 : diff < 0 ? 2 : 0;
        if (winner) transferTeamStakePerPerson(metrics, amounts, winner, winner === 1 ? 2 : 1, stake);
      });
      addGame({ key: 'nassau', label: `Nassau (${basis})`, amounts, meta: { diffs } });
    }
    if (cfg.key === 'skins' || cfg.key === 'net_skins') {
      const basis = cfg.key === 'net_skins' ? 'net' : 'gross';
      const winnersByHole = computeSkins(metrics, basis);
      const amounts = {};
      winnersByHole.forEach(winner => addVsField(metrics, amounts, winner.winner, cfg.stake));
      addGame({ key: cfg.key, label: cfg.key === 'net_skins' ? 'Net Skins' : 'Gross Skins', amounts, meta: { winnersByHole, basis } });
    }
    if (cfg.key === 'nine_point') {
      const nine = computeNinePoint(metrics, cfg);
      addGame({ key: 'nine_point', label: `9-Point (${nine.basis})`, amounts: nine.amounts, paymentLines: nine.paymentLines, meta: nine });
    }
  }
  Object.keys(finalTotals).forEach(id => { finalTotals[id] = roundMoney(finalTotals[id]); });
  return { metrics, games, finalTotals, settlementRows: optimalSettlementRows(finalTotals) };
}

export function validateSharedAssignments(round) {
  const failures = [];
  const warnings = [];
  if (round.scoringAccessMode !== 'assigned_players') return { failures, warnings };
  const participantIds = new Set((round.sharedParticipants || []).map(p => p.participantId).filter(Boolean));
  Object.entries(round.sharedAssignments || {}).forEach(([playerId, participantId]) => {
    if (!round.players.some(player => player.id === playerId)) failures.push(`Shared assignment references unknown player ${playerId}.`);
    if (!participantIds.has(participantId)) failures.push(`Shared assignment for ${playerId} references stale participant ${participantId}.`);
  });
  if (!Object.keys(round.sharedAssignments || {}).length) warnings.push('Assigned-player Shared Match model has no explicit assignments.');
  return { failures, warnings };
}

export function validateRound(roundInput) {
  const normalized = normalizeRound(roundInput);
  const payout = computePayouts(normalized);
  const failures = [];
  const warnings = [];
  const suspicious = [];
  const sum = Object.values(payout.finalTotals).reduce((total, amount) => total + amount, 0);
  if (Math.abs(sum) > 0.001) failures.push(`Final Net Settlement does not net to zero: ${sum.toFixed(4)}.`);
  const reload = normalizeRound(cloneJson(normalized));
  const payoutAfterReload = computePayouts(reload);
  if (JSON.stringify(payout.finalTotals) !== JSON.stringify(payoutAfterReload.finalTotals)) failures.push('Settlement changed after save/reload-style normalization.');
  if (JSON.stringify(normalized.scores) !== JSON.stringify(reload.scores)) failures.push('Scores changed after save/reload-style normalization.');
  payout.games.forEach(game => {
    const gameSum = Object.values(game.amounts || {}).reduce((total, amount) => total + Number(amount || 0), 0);
    if (Math.abs(gameSum) > 0.001) failures.push(`${game.label} payouts do not net to zero.`);
  });
  const finalFromGames = {};
  payout.games.forEach(game => Object.entries(game.amounts || {}).forEach(([id, amount]) => addAmount(finalFromGames, id, amount)));
  for (const player of payout.metrics.players) {
    if (roundMoney(finalFromGames[player.id]) !== roundMoney(payout.finalTotals[player.id])) failures.push(`Game-level payouts do not reconcile for ${player.name}.`);
  }
  const pairs = new Set();
  payout.settlementRows.forEach(row => {
    const key = `${row.from}->${row.to}`;
    const reverse = `${row.to}->${row.from}`;
    if (pairs.has(reverse)) failures.push(`Final settlement contains reciprocal payment rows for ${row.from} and ${row.to}.`);
    pairs.add(key);
  });
  const matchGame = payout.games.find(game => game.key === 'match_play');
  if (matchGame?.meta?.diffs?.closedAt && payout.metrics.completed > matchGame.meta.diffs.closedAt) warnings.push(`Match Play closed on hole ${matchGame.meta.diffs.closedAt}; later entered scores should not change the recorded winner without intentional edit handling.`);
  const nassau = payout.games.find(game => game.key === 'nassau');
  if (nassau) {
    const { front, back, overall } = nassau.meta.diffs;
    if (front + back !== overall) failures.push('Nassau front and back components do not reconcile to overall.');
    if (payout.metrics.completed < payout.metrics.holeCount) warnings.push('Incomplete round has provisional Nassau and settlement output.');
  }
  ['skins', 'net_skins'].forEach(key => {
    const game = payout.games.find(row => row.key === key);
    if (!game) return;
    game.meta.winnersByHole.forEach(skin => {
      const hole = payout.metrics.holeResults.find(row => row.holeNumber === skin.holeNumber);
      const winners = key === 'net_skins' ? hole.netWinners : hole.grossWinners;
      if (winners.length !== 1 || winners[0] !== skin.winner) failures.push(`${game.label} awarded a skin without a unique low ${game.meta.basis} score on hole ${skin.holeNumber}.`);
    });
  });
  const nine = payout.games.find(game => game.key === 'nine_point')?.meta;
  if (nine) {
    nine.holes.filter(hole => hole.completed).forEach(hole => {
      const total = Object.values(hole.points).reduce((sumPoints, points) => sumPoints + points, 0);
      if (total !== 9) failures.push(`9-Point hole ${hole.holeNumber} allocates ${total} points instead of 9.`);
    });
    const expected = nine.completedHoles * 9;
    const actual = Object.values(nine.totals).reduce((total, points) => total + points, 0);
    if (expected !== actual) failures.push(`9-Point totals are ${actual}; expected ${expected}.`);
  }
  if (payout.settlementRows.some(row => row.amount > 100)) suspicious.push('A settlement row exceeds $100; confirm blowout/wager settings are intentional.');
  if (payout.metrics.completed === 0) warnings.push('No completed holes were available for settlement.');
  const shared = validateSharedAssignments(normalized);
  failures.push(...shared.failures);
  warnings.push(...shared.warnings);
  return { round: normalized, payout, failures, warnings, suspicious };
}

export function generateRandomRound(rng, index = 0) {
  const course = makeDefaultCourse();
  const spread = rng() < 0.35 ? 'uneven' : 'close';
  const baseIndexes = spread === 'uneven' ? [4, 10, 18, 26] : [8, 11, 13, 16];
  const players = baseIndexes.map((base, idx) => ({
    id: `p${idx + 1}`,
    name: ['Alex', 'Blake', 'Casey', 'Drew'][idx],
    index: Math.max(0, Math.round((base + (rng() - 0.5) * 4) * 10) / 10),
    team: idx % 2 === 0 ? 1 : 2,
  }));
  const holeCount = rng() < 0.16 ? 9 : 18;
  const completed = rng() < 0.12 ? Math.max(3, Math.floor(rng() * holeCount)) : holeCount;
  const scores = {};
  players.forEach(player => {
    const ability = Math.max(-1.2, Math.min(2.2, (player.index - 12) / 9));
    scores[player.id] = course.holes.slice(0, holeCount).map((hole, holeIdx) => {
      if (holeIdx >= completed) return null;
      const roll = rng();
      let diff = 0;
      if (roll < 0.05 - ability * 0.01) diff = -1;
      else if (roll < 0.42 - ability * 0.04) diff = 0;
      else if (roll < 0.75 - ability * 0.02) diff = 1;
      else if (roll < 0.93) diff = 2;
      else diff = 3 + Math.floor(rng() * 3);
      return Math.max(1, hole.par + diff);
    });
  });
  return {
    scenario: `random_${String(index + 1).padStart(3, '0')}`,
    purpose: `Seeded ${spread} random ${holeCount}-hole round.`,
    course,
    holeCount,
    players,
    teams: [{ team: 1, name: 'North' }, { team: 2, name: 'South' }],
    allowance: 100,
    scores,
    selectedGames: cloneJson(DEFAULT_GAMES),
    expectedInvariants: ['settlement_zero_sum', 'save_reload_stable', 'skins_unique_low', 'nine_point_totals'],
  };
}

export function summarizeResult(result) {
  const namesById = Object.fromEntries(result.payout.metrics.players.map(player => [player.id, player.name]));
  return {
    scenario: result.round.scenario,
    completed: `${result.payout.metrics.completed}/${result.payout.metrics.holeCount}`,
    failures: result.failures.length,
    warnings: result.warnings.length,
    suspicious: result.suspicious.length,
    settlement: result.payout.settlementRows.map(row => `${namesById[row.from] || row.from} pays ${namesById[row.to] || row.to} $${row.amount.toFixed(2)}`),
  };
}
