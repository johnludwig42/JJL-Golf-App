const STORAGE_KEY = 'the-dye-ledger-v20';
const APP_VERSION = 'v27.44';
const GAME_LIBRARY = [
  { key: 'nassau', label: 'Nassau' },
  { key: 'individual_match', label: 'Head-to-Head Side Match' },
  { key: 'team_match', label: 'Team Match Play' },
  { key: 'team_stroke', label: 'Team Stroke Play' },
  { key: 'skins', label: 'Skins' },
  { key: 'greenies', label: 'Greenies' },
  { key: 'nine_point', label: '9-Point Game' },
];

const GAME_LABELS = Object.fromEntries(GAME_LIBRARY.map(g => [g.key, g.label]));
const CLOUD_MATCH_CACHE_PREFIX = 'the-dye-ledger-cloud-match:';
const SHARED_MATCHES_INDEX_KEY = 'the-dye-ledger-shared-index';
const SUPABASE_CONFIG = window.__DYE_SUPABASE_CONFIG__ || {};
let supabaseClient = null;
let supabaseInitPromise = null;

const sharedMatchSyncTimers = new Map();
const sharedMatchSyncInflight = new Map();
const sharedMatchSyncDirty = new Map();
const SHARED_MATCH_SYNC_DEBOUNCE_MS = 200;
let pendingScoreCommitFocus = null;
let scoreAutoAdvanceGeneration = 0;
const scoreInputSessionState = new Map();
let pendingScoreAutoAdvanceTimer = null;
let pendingScoreAutoAdvancePlayerId = null;
const SCORE_AUTO_ADVANCE_DELAY_MS = 300;
const SCORE_ENTRY_MODES = {
  single_device: 'One device scores for everyone',
  team_codes: 'Each team enters its own scores',
  open_edit: 'Anyone can enter scores',
};
const LEGACY_SCORE_ENTRY_MODE_MAP = {
  official_scorer: 'single_device',
  team_input: 'team_codes',
  single_device: 'single_device',
  team_codes: 'team_codes',
  open_edit: 'open_edit',
};
const SCORE_ACCESS_ROLE_LABELS = {
  event_admin: 'Event Admin',
  official_scorer: 'Official Scorer',
  team_scorer: 'Team Scorer',
  viewer: 'Viewer',
};
function getGameLabel(key) {
  return GAME_LABELS[key] || key;
}
function normalizeScoringAccessMode(value = 'team_codes') {
  return LEGACY_SCORE_ENTRY_MODE_MAP[String(value || '').trim()] || 'team_codes';
}
function formatScoreEntryModeLabel(mode = 'team_codes') {
  const normalized = normalizeScoringAccessMode(mode);
  return SCORE_ENTRY_MODES[normalized] || SCORE_ENTRY_MODES.team_codes;
}
function getLegacyScoreEntryMode(mode = 'team_codes') {
  const normalized = normalizeScoringAccessMode(mode);
  if (normalized === 'single_device') return 'official_scorer';
  if (normalized === 'team_codes') return 'team_input';
  return 'open_edit';
}
function formatScoreAccessRoleLabel(role = 'viewer') {
  return SCORE_ACCESS_ROLE_LABELS[role] || SCORE_ACCESS_ROLE_LABELS.viewer;
}
function defaultTeamScorerLabel(teamName = '', teamNo = 1) {
  return `${teamName || `Team ${teamNo}`} scorer`;
}
function defaultTeamAccessCode(teamName = '', teamNo = 1) {
  const base = String(teamName || `TEAM ${teamNo}`).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || `TEAM${teamNo}`;
  return `${base}-${teamNo}`;
}
function buildTeamScorerAssignments(teamCount = 1, teamNames = [], existing = []) {
  const rows = Array.isArray(existing) ? existing : [];
  return Array.from({ length: Math.max(1, Number(teamCount) || 1) }, (_, idx) => {
    const team = idx + 1;
    const prior = rows.find(row => Number(row?.team) === team) || {};
    const teamName = String(teamNames[idx] || `Team ${team}`);
    return {
      team,
      label: String(prior.label || defaultTeamScorerLabel(teamName, team)),
      accessCode: String(prior.accessCode || defaultTeamAccessCode(teamName, team)),
    };
  });
}
function getScoreAccessState(match) {
  const mode = normalizeScoringAccessMode(match?.scoringAccessMode || match?.scoreEntryMode || 'team_codes');
  const defaultRole = mode === 'team_codes' ? 'team_scorer' : 'official_scorer';
  const role = String(match?.activeScoreRole || defaultRole);
  const allowedRole = mode === 'single_device' && role === 'team_scorer' ? 'official_scorer' : role;
  const teamCount = Math.max(1, Number(match?.teamCount) || 1);
  const selectedTeam = Math.min(teamCount, Math.max(1, Number(match?.activeScoreTeam) || 1));
  return {
    mode,
    role: ['event_admin','official_scorer','team_scorer','viewer'].includes(allowedRole) ? allowedRole : 'viewer',
    team: selectedTeam,
  };
}
function canEditPlayerScore(match, teamNo = 1) {
  const access = getScoreAccessState(match);
  if (access.role === 'event_admin' || access.role === 'official_scorer') return true;
  if (access.mode === 'open_edit' && access.role !== 'viewer') return true;
  if (access.role === 'team_scorer') return Number(teamNo) === Number(access.team);
  return false;
}
function canEditGreenies(match, teamNo = 1) {
  return canEditPlayerScore(match, teamNo);
}
function getScoreAccessHint(match) {
  const access = getScoreAccessState(match);
  if (access.role === 'event_admin') return 'Organizer / Admin can edit all teams, correct scores, and manage shared-round setup.';
  if (access.mode === 'open_edit' && access.role !== 'viewer') return 'Anyone Can Enter Scores mode keeps score entry open to any authorized non-viewer device.';
  if (access.role === 'official_scorer') return 'One Device Scores for Everyone keeps one full-access scorer in charge of entry.';
  if (access.role === 'team_scorer') return `Each Team Enters Its Own Scores mode limits editing to ${getTeamLabel(match, access.team)}.`;
  return 'Viewer is read-only and can monitor the round without editing any scores.';
}

function normalizeSelectedGamesOrder(games = []) {
  const ordered = Array.isArray(games) ? games.slice() : [];
  ordered.sort((a, b) => {
    const aSide = a?.key === 'individual_match' ? 1 : 0;
    const bSide = b?.key === 'individual_match' ? 1 : 0;
    if (aSide !== bSide) return aSide - bSide;
    return 0;
  });
  return ordered;
}
function getOrderedSelectedGames(match) {
  return normalizeSelectedGamesOrder(Array.isArray(match?.selectedGames) ? match.selectedGames : []);
}
function getSideMatchConfigs(match) {
  const cfg = (Array.isArray(match?.selectedGames) ? match.selectedGames : []).find(g => g.key === 'individual_match') || {};
  const rows = Array.isArray(cfg.matchups) ? cfg.matchups : [];
  const normalized = rows.map(row => ({
    id: row.id || uid(),
    playerAId: row.playerAId || row.team1PlayerId || '',
    playerBId: row.playerBId || row.team2PlayerId || '',
    game: String(row.game || row.gameKey || cfg.game || 'nassau').toLowerCase().replace('team_match','match_play').replace('team_stroke','stroke_play'),
    basis: String(row.basis || cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net',
    stake: Number(row.stake ?? cfg.stake ?? 5) || 0,
  })).filter(row => row.playerAId && row.playerBId && row.playerAId !== row.playerBId);
  if (normalized.length) return normalized;
  return [];
}
function getSideMatchStatusText(pairing) {
  if (!pairing || !Number.isFinite(pairing.diff) || pairing.diff === 0) return pairing?.game === 'stroke_play' ? 'Tied' : 'AS';
  if (pairing.game === 'stroke_play') return `${pairing.leaderName} leads by ${Math.abs(pairing.diff)} stroke${Math.abs(pairing.diff) === 1 ? '' : 's'}`;
  return `${pairing.leaderName} ${Math.abs(pairing.diff)} up`;
}

function getSideMatchGameOptions() {
  return [
    { key: 'nassau', label: 'Nassau (Front, Back, 18)' },
    { key: 'match_play', label: 'Match Play (18)' },
    { key: 'stroke_play', label: 'Stroke Play (18)' },
  ];
}
function getSideMatchGameLabel(gameKey = 'nassau') {
  return (getSideMatchGameOptions().find(opt => opt.key === gameKey) || {}).label || 'Nassau';
}

function getSideMatchPlayerOptions(players, selectedA = '', selectedB = '') {
  const list = Array.isArray(players) ? players : [];
  return {
    playerA: list.filter(p => !selectedB || p.id === selectedA || p.id !== selectedB),
    playerB: list.filter(p => !selectedA || p.id === selectedB || p.id !== selectedA),
  };
}
function getSideMatchNetHoleScore(match, holeIdx, playerMetric, lowPlaying, fallbackHole = null) {
  if (!playerMetric) return null;
  const gross = Number(playerMetric.scores?.[holeIdx]?.gross) || null;
  if (!gross) return null;
  const playerHole = getPlayerHole(match, playerMetric, holeIdx, fallbackHole);
  const strokeIndex = Number(playerHole?.strokeIndex) || Number(fallbackHole?.strokeIndex) || 0;
  const strokes = holeStrokeAllowanceForPlayer(strokeIndex, Number(playerMetric.playHdcp) || 0, Number(lowPlaying) || 0);
  return gross - strokes;
}

function getNinePointPlayerOptions(players, selectedIds = []) {
  const list = Array.isArray(players) ? players : [];
  const chosen = Array.isArray(selectedIds) ? selectedIds.slice(0, 3) : [];
  while (chosen.length < 3) chosen.push('');
  return [0, 1, 2].map(idx => {
    const otherIds = new Set(chosen.filter((id, i) => i !== idx && id));
    return list.filter(p => !otherIds.has(p.id) || p.id === chosen[idx]);
  });
}
function computeNinePointHolePoints(valuesByPlayerId) {
  const entries = Object.entries(valuesByPlayerId || {}).filter(([, value]) => Number.isFinite(value));
  if (entries.length !== 3) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [aId, aVal] = entries[0];
  const [bId, bVal] = entries[1];
  const [cId, cVal] = entries[2];
  const points = {};
  if (aVal === cVal) {
    points[aId] = 3; points[bId] = 3; points[cId] = 3;
  } else if (aVal === bVal) {
    points[aId] = 4; points[bId] = 4; points[cId] = 1;
  } else if (bVal === cVal) {
    points[aId] = 5; points[bId] = 2; points[cId] = 2;
  } else {
    points[aId] = 5; points[bId] = 3; points[cId] = 1;
  }
  return points;
}
function computeNinePointResults(match, metrics, cfg = {}) {
  const selectedIds = Array.isArray(cfg.playerIds) ? cfg.playerIds.filter(Boolean).slice(0, 3) : [];
  const chosenMetrics = selectedIds.map(id => metrics?.players?.find(p => p.playerId === id)).filter(Boolean);
  const uniqueIds = [...new Set(chosenMetrics.map(p => p.playerId))];
  const basis = String(cfg?.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
  const stakePerPoint = Number(cfg?.stakePerPoint || 0) || 0;
  const result = {
    basis,
    stakePerPoint,
    players: chosenMetrics,
    playerIds: uniqueIds,
    holes: [],
    totals: {},
    leaderboard: [],
    settlements: [],
    amounts: {},
    completedHoles: 0,
  };
  if (!metrics || uniqueIds.length !== 3 || chosenMetrics.length !== 3) return result;
  uniqueIds.forEach(id => { result.totals[id] = 0; result.amounts[id] = 0; });
  const lowPlaying = Math.min(...chosenMetrics.map(p => Number(p.playHdcp) || 0));
  (metrics.holeResults || []).forEach((hole, holeIdx) => {
    const values = {};
    const grossValues = {};
    const netValues = {};
    chosenMetrics.forEach(pm => {
      const scoreObj = hole?.playerScores?.find(ps => ps.playerId === pm.playerId);
      const gross = Number(scoreObj?.gross) || null;
      if (!gross) return;
      grossValues[pm.playerId] = gross;
      const net = getSideMatchNetHoleScore(match, holeIdx, pm, lowPlaying, getPlayerHole(match, pm, holeIdx, metrics?.tee) || null);
      netValues[pm.playerId] = Number.isFinite(net) ? net : null;
      values[pm.playerId] = basis === 'gross' ? gross : net;
    });
    if (Object.keys(values).length !== 3 || !Object.values(values).every(v => Number.isFinite(v))) {
      result.holes.push({ holeNumber: hole?.holeNumber || holeIdx + 1, completed: false, points: {} });
      return;
    }
    const points = computeNinePointHolePoints(values);
    if (!points) {
      result.holes.push({ holeNumber: hole?.holeNumber || holeIdx + 1, completed: false, points: {} });
      return;
    }
    result.completedHoles += 1;
    uniqueIds.forEach(id => {
      result.totals[id] += Number(points[id] || 0);
    });
    result.holes.push({
      holeNumber: hole?.holeNumber || holeIdx + 1,
      completed: true,
      grossValues,
      netValues,
      values,
      points,
      runningTotals: { ...result.totals },
    });
  });
  // Settlement-only change: keep existing per-hole 9-point scoring, but settle
  // final totals head-to-head so every unique player pair is evaluated once.
  for (let i = 0; i < uniqueIds.length; i += 1) {
    for (let j = i + 1; j < uniqueIds.length; j += 1) {
      const playerI = uniqueIds[i];
      const playerJ = uniqueIds[j];
      const diff = (Number(result.totals[playerI]) || 0) - (Number(result.totals[playerJ]) || 0);
      const amount = diff * stakePerPoint;
      if (Math.abs(amount) <= 0.0001) continue;
      result.amounts[playerI] = (result.amounts[playerI] || 0) + amount;
      result.amounts[playerJ] = (result.amounts[playerJ] || 0) - amount;
    }
  }
  result.leaderboard = uniqueIds.map(id => {
    const playerMetric = chosenMetrics.find(p => p.playerId === id);
    return {
      playerId: id,
      name: playerMetric?.player?.name || 'Player',
      total: result.totals[id] || 0,
      amount: result.amounts[id] || 0,
      teeName: playerMetric?.tee?.teeName || '',
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  result.settlements = optimalSettlementRows(result.amounts);
  return result;
}
function buildNinePointScorecard(match, metrics) {
  const cfg = (match?.selectedGames || []).find(g => g.key === 'nine_point') || {};
  const results = computeNinePointResults(match, metrics, cfg);
  if (!results.playerIds?.length || results.playerIds.length !== 3) {
    return '<div class="tiny">Select 3 players in setup to enable the 9-Point game scorecard.</div>';
  }
  const rows = results.leaderboard;
  const holeHeaders = results.holes.map(h => `<th>H${h.holeNumber}</th>`).join('');
  const playerRows = rows.map(row => {
    const holeCells = results.holes.map(h => {
      const value = h.completed ? (h.points?.[row.playerId] ?? '—') : '—';
      return `<td>${value}</td>`;
    }).join('');
    return `<tr>
      <td class="scorecard-sticky-name"><strong>${escapeHtml(row.name)}</strong><div class="tiny">${escapeHtml(row.teeName || '')}</div></td>
      ${holeCells}
      <td><strong>${row.total}</strong></td>
      <td>${formatMoneyAccounting(row.amount)}</td>
    </tr>`;
  }).join('');
  const settlementRows = results.settlements.length
    ? `<div class="payout-table-wrap top-gap"><table class="settlement-table"><thead><tr><th>From</th><th>To</th><th>Amount</th></tr></thead><tbody>${results.settlements.map(s => `<tr><td>${escapeHtml(getPlayer(s.from)?.name || s.from)}</td><td>${escapeHtml(getPlayer(s.to)?.name || s.to)}</td><td>${formatMoneyAccounting(s.amount)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="tiny top-gap">No settlement yet.</div>`;
  return `<div class="tiny">${escapeHtml(formatBasisLabel(results.basis))} · ${formatMoneyAccounting(results.stakePerPoint)} per point · ${results.completedHoles}/${getPlayableHoleCount(match, metrics?.tee)} holes complete</div>
    <div class="scorecard-wrap top-gap">
      <table class="scorecard-table">
        <thead><tr><th>Player</th>${holeHeaders}<th>Total</th><th>Payout</th></tr></thead>
        <tbody>${playerRows}</tbody>
      </table>
    </div>
    ${settlementRows}`;
}
function formatBasisLabel(basis, fallback = 'Net') {
  const value = String(basis || fallback).toLowerCase();
  if (value === 'gross') return 'Gross';
  if (value === 'net') return 'Net';
  if (value === 'both') return 'Gross + Net';
  if (value === 'event') return 'Event';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatScoringModeLabel(mode) {
  return mode === 'aggregate' ? 'Aggregate' : 'Best Ball';
}
function resolveTeamStrokeScoringMode(mode) {
  return String(mode || 'aggregate').toLowerCase() === 'best_ball' ? 'best_ball' : 'aggregate';
}
function getDefaultFeaturedGameKey(selectedGames = []) {
  const ordered = normalizeSelectedGamesOrder(Array.isArray(selectedGames) ? selectedGames : []);
  return ordered.find(g => g.key === 'team_match')?.key
    || ordered.find(g => g.key === 'nassau')?.key
    || ordered.find(g => g.key === 'team_stroke')?.key
    || ordered.find(g => g.key !== 'individual_match')?.key
    || ordered[0]?.key
    || 'team_match';
}
function showTeamMatchMetric(match, metrics) {
  if ((metrics?.teams || []).length !== 2) return false;
  return (match?.selectedGames || []).some(g => ['nassau', 'team_match'].includes(g.key));
}
function getTeamName(match, teamNo) {
  return match?.teamNames?.[teamNo - 1] || `Team ${teamNo}`;
}

function getTeamLabel(match, teamNo, fallback = true) {
  const name = String(getTeamName(match, teamNo) || '').trim();
  return name || (fallback ? `Team ${teamNo}` : '');
}
function getMomentumPerspectiveTeam(match) {
  const teamNo = Number(match?.momentumPerspective || 1);
  return teamNo === 2 ? 2 : 1;
}
function hasMomentumGame(match) {
  const selected = Array.isArray(match?.selectedGames) ? match.selectedGames : [];
  return selected.some(g => g.key === 'nassau' || g.key === 'team_match' || (g.key === 'individual_match' && Array.isArray(g.matchups) && g.matchups.some(row => ['nassau','match_play'].includes(String(row?.game || 'nassau').toLowerCase()))));
}
function formatPerspectiveStatus(diff, perspectiveTeam = 1) {
  const oriented = perspectiveTeam === 2 ? -Number(diff || 0) : Number(diff || 0);
  if (!Number.isFinite(oriented) || oriented === 0) return 'AS';
  return oriented > 0 ? `Up ${Math.abs(oriented)}` : `Down ${Math.abs(oriented)}`;
}
let deferredPrompt = null;
let editingPlayerId = null;
let editingCourseId = null;
let editingTeeRef = null;
let editingMatchId = null;
let currentHole = 1;
let finishConfirmArmed = false;
let currentLeaderboardMatchRef = null;
let newMatchPromptFinishArmed = false;
let newMatchStartInProgress = false;
let newMatchDialogMode = 'intent';
let cleanNewMatchSetupInProgress = false;
const uiState = {
  courseSearch: '',
  expandedCourses: new Set(),
  cloudCoursesStatus: '',
  cloudCoursesLoading: false,
  cloudCoursesLastLoadAt: 0,
  courseSyncTimers: {},
  scorecardImportData: null,
  scorecardImportFileName: '',
  scorecardImportFiles: [],
  scorecardImportStatus: '',
  scorecardImportLoading: false,
  matchPlayerDraft: [],
  referenceTeeManual: false,
  referenceTeeAutoId: '',
  teamPayoutMobileWindowByMatch: {},
  teamPayoutMobileOpenHeaderKey: '',
};

const state = loadState();
normalizeState();

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), ms);
}

function getPlayerIndexText(player) {
  return Number(player?.index || 0).toFixed(1);
}
function getPlayerLookupLabel(player) {
  if (!player) return '';
  return `${player.name}  ${getPlayerIndexText(player)}`;
}
function getPlayerDisplayHtml(player, { wrapperClass = '', nameClass = '', indexClass = '' } = {}) {
  if (!player) return '';
  const wrapper = wrapperClass ? ` class="${wrapperClass}"` : '';
  const nameCls = nameClass ? ` class="${nameClass}"` : '';
  const indexCls = indexClass ? ` class="${indexClass}"` : '';
  return `<span${wrapper}><span${nameCls}>${escapeHtml(player.name || '')}</span><span class="player-label-separator" aria-hidden="true">&nbsp;&nbsp;</span><span${indexCls}>${escapeHtml(getPlayerIndexText(player))}</span></span>`;
}
function getPlayerByLookupLabel(label = '', candidates = null) {
  const needle = String(label || '').trim().toLowerCase();
  const pool = Array.isArray(candidates) ? candidates : state.players;
  if (!needle) return null;
  return pool.find(p => getPlayerLookupLabel(p).toLowerCase() === needle)
    || pool.find(p => String(p.name || '').trim().toLowerCase() === needle)
    || null;
}
function getCourseSearchValue() {
  return String(uiState.courseSearch || document.getElementById('coursesSearchInput')?.value || '').trim().toLowerCase();
}
function setCourseExpanded(courseId, expanded) {
  if (!courseId) return;
  if (expanded) uiState.expandedCourses.add(courseId);
  else uiState.expandedCourses.delete(courseId);
}
function loadState() {
  const fallback = { players: [], courses: [], matches: [], activeMatchId: null, notes: '', sharedMatchIds: [], lastOpenedSharedMatchId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      || localStorage.getItem('golf-matchbook-v9')
      || localStorage.getItem('golf-matchbook-v8')
      || localStorage.getItem('golf-matchbook-v7')
      || localStorage.getItem('golf-matchbook-v6')
      || localStorage.getItem('golf-matchbook-v5')
      || localStorage.getItem('golf-matchbook-v4');
    const parsed = raw ? JSON.parse(raw) : fallback;
    parsed.matches = Array.isArray(parsed.matches) ? parsed.matches : [];
    parsed.activeMatchId = parsed.activeMatchId || null;
    parsed.notes = typeof parsed.notes === 'string' ? parsed.notes : '';
    parsed.sharedMatchIds = Array.isArray(parsed.sharedMatchIds) ? parsed.sharedMatchIds : [];
    parsed.lastOpenedSharedMatchId = typeof parsed.lastOpenedSharedMatchId === 'string' && parsed.lastOpenedSharedMatchId.trim() ? parsed.lastOpenedSharedMatchId.trim() : null;
    return parsed;
  } catch {
    return fallback;
  }
}
function persist({ skipRender = false } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!skipRender) renderAll();
}
function buildDefaultHoles(count = 18) {
  return Array.from({ length: count }, (_, i) => ({ holeNumber: i + 1, yardage: null, par: null, strokeIndex: i + 1 }));
}
function buildEmptyScores(count = 18) {
  return Array.from({ length: count }, (_, i) => ({ holeNumber: i + 1, gross: null }));
}
function buildEmptyStats(count = 18) {
  return Array.from({ length: count }, (_, i) => ({
    holeNumber: i + 1,
    fairway: false,
    green: false,
    putts: 2,
    puttsSource: 'default',
    penaltyStrokes: 0,
    upAndDown: false,
    sandy: false,
  }));
}
function normalizePuttsSource(source, fallback = 'default') {
  return ['default', 'auto', 'user'].includes(source) ? source : fallback;
}
function normalizeHoleStat(stat = {}, idx = 0) {
  const rawPutts = stat?.putts;
  const hasRawPutts = rawPutts !== '' && rawPutts != null;
  const putts = hasRawPutts ? Number(rawPutts) : 2;
  const explicitSource = normalizePuttsSource(stat?.puttsSource || stat?._puttsSource || '', '');
  const inferredSource = explicitSource || (hasRawPutts && Number(rawPutts) !== 2 ? 'user' : 'default');
  return {
    holeNumber: Number(stat?.holeNumber) || idx + 1,
    fairway: !!stat?.fairway,
    green: !!stat?.green,
    putts: Number.isFinite(putts) && putts >= 0 ? Math.round(putts) : 2,
    puttsSource: normalizePuttsSource(inferredSource, 'default'),
    penaltyStrokes: Number.isFinite(Number(stat?.penaltyStrokes ?? stat?.penalties ?? stat?.penalty_strokes)) && Number(stat?.penaltyStrokes ?? stat?.penalties ?? stat?.penalty_strokes) >= 0 ? Math.round(Number(stat?.penaltyStrokes ?? stat?.penalties ?? stat?.penalty_strokes)) : 0,
    upAndDown: !!stat?.upAndDown,
    sandy: !!stat?.sandy,
  };
}
function isStatTrackingEnabled(match) {
  return !!match?.statTrackingEnabled;
}
function getPlayerStatEntry(playerRef, holeIdx) {
  return playerRef?.stats?.[holeIdx] || normalizeHoleStat({}, holeIdx);
}
function getRequestedHoleCount(match) {
  return Number(match?.holeCount) === 9 ? 9 : 18;
}
function getPlayableHoleCount(match, tee = null) {
  return Math.max(1, getSelectedHoleIndexes(match, tee).length);
}
function formatHoleCountLabel(count) {
  const holes = Number(count) === 9 ? 9 : 18;
  return `${holes} hole${holes === 1 ? '' : 's'}`;
}
function isNineHoleMatch(match) {
  return getRequestedHoleCount(match) === 9;
}
function getNineHoleSegment(match) {
  const value = String(match?.nineHoleSegment || 'front').toLowerCase();
  return ['front', 'back', 'custom'].includes(value) ? value : 'front';
}
function getSelectedHoleIndexes(match, tee = null) {
  const total = Array.isArray(tee?.holes) && tee.holes.length ? tee.holes.length : 18;
  if (!isNineHoleMatch(match)) return Array.from({ length: Math.min(18, total) }, (_, i) => i);
  const segment = getNineHoleSegment(match);
  let startIdx = 0;
  if (segment === 'back') startIdx = Math.max(0, Math.min(9, total - 9));
  else if (segment === 'custom') {
    const maxStart = Math.max(0, total - 9);
    startIdx = Math.max(0, Math.min(maxStart, (Number(match?.customStartHole) || 1) - 1));
  }
  const length = Math.min(9, Math.max(0, total - startIdx));
  return Array.from({ length }, (_, i) => startIdx + i);
}
function getSelectedScoringHoles(match, tee = null) {
  const source = Array.isArray(tee?.holes) ? tee.holes : buildDefaultHoles();
  return getSelectedHoleIndexes(match, tee).map(idx => normalizeHole(source[idx] || { holeNumber: idx + 1 }, idx));
}
function getHoleSegmentLabel(match, tee = null) {
  if (!isNineHoleMatch(match)) return '18 Holes';
  const indexes = getSelectedHoleIndexes(match, tee);
  if (!indexes.length) return '9 Holes';
  const first = indexes[0] + 1;
  const last = indexes[indexes.length - 1] + 1;
  const segment = getNineHoleSegment(match);
  if (segment === 'front') return 'Front 9';
  if (segment === 'back') return 'Back 9';
  return `Custom ${first}-${last}`;
}
function sumYardage(holes) { return holes.reduce((sum, h) => sum + (Number(h.yardage) || 0), 0) || null; }
function getTeeTotalYardage(tee) {
  const holeTotal = sumYardage(Array.isArray(tee?.holes) ? tee.holes : []);
  const lengthTotal = Number(tee?.length) || null;
  if (tee?.isCombo) return holeTotal || lengthTotal || 0;
  return lengthTotal || holeTotal || 0;
}
function getSortedTeesByYardage(course) { return Array.isArray(course?.tees) ? course.tees.slice().sort((a, b) => getTeeTotalYardage(b) - getTeeTotalYardage(a) || String(a?.teeName || '').localeCompare(String(b?.teeName || ''))) : []; }
function sumPar(holes) { return holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0) || null; }
function getCourseStrokeTemplate(course) {
  const tpl = Array.isArray(course?.strokeIndexes) ? course.strokeIndexes.map(v => Number(v) || null) : [];
  return tpl.length === 18 ? tpl : null;
}
function applyStrokeTemplate(holes, template) {
  if (!template || template.length !== 18) return holes;
  return holes.map((h, idx) => { const current = Number(h.strokeIndex); const shouldReplace = !Number.isFinite(current) || current === 0 || current === idx + 1; return { ...h, strokeIndex: shouldReplace ? (Number(template[idx]) || null) : current }; });
}
function extractStrokeTemplate(holes) {
  const arr = holes.map(h => Number(h.strokeIndex) || null);
  return arr.length === 18 && arr.every(v => v !== null) ? arr : null;
}
function formatSigned(n) { return n > 0 ? `+${n}` : `${n}`; }
function formatRatingValue(v) {
  const num = Number(v);
  return Number.isFinite(num) ? num.toFixed(1) : '0.0';
}
function formatYardageValue(v) {
  const num = Number(v);
  return Number.isFinite(num) && num > 0 ? num.toLocaleString('en-US') : '0';
}
function getPlayerTeeId(match, playerRef = null) {
  const ref = playerRef || {};
  return ref.teeId || match?.teeId || '';
}
function getPlayerTee(match, playerRef = null) {
  return getTee(match?.courseId, getPlayerTeeId(match, playerRef));
}
function getPlayerHole(match, playerRef, holeIdx, fallbackTee = null) {
  const tee = getPlayerTee(match, playerRef) || fallbackTee || getTee(match?.courseId, match?.teeId);
  const selectedIndexes = getSelectedHoleIndexes(match, tee);
  const actualIdx = Number.isFinite(selectedIndexes[holeIdx]) ? selectedIndexes[holeIdx] : holeIdx;
  return tee?.holes?.[actualIdx] || fallbackTee?.holes?.[actualIdx] || null;
}
function formatTeeSummary(t) {
  return `${escapeHtml(t.teeName)} · ${formatRatingValue(t.rating)}/${Number(t.slope) || 0}${getTeeTotalYardage(t) ? ` · ${formatYardageValue(getTeeTotalYardage(t))} yds` : ''}`;
}
function formatMoneyAccounting(amount) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value).toFixed(2);
  if (Math.abs(value) < 0.0001) return "$0.00";
  return value < 0 ? `($${abs})` : `$${abs}`;
}
function formatFinalNetSettlementMoney(amount) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value).toFixed(2);
  if (Math.abs(value) < 0.0001) return '$0.00';
  return value < 0 ? `($${abs})` : `+$${abs}`;
}
function getFeaturedGameLabel(match, gameKey) {
  const cfg = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  if (gameKey === 'individual_match') {
    const matchups = Array.isArray(cfg.matchups) ? cfg.matchups : [];
    if (matchups.length === 1) {
      const row = matchups[0] || {};
      return `${getGameLabel(gameKey)} (${getSideMatchGameLabel(row.game || 'nassau')} · ${formatBasisLabel(row.basis, 'Net')})`;
    }
    return `${getGameLabel(gameKey)} (${matchups.length || 0})`;
  }
  const basis = gameKey === "greenies" ? "Event" : formatBasisLabel(cfg.basis, "Net");
  const mode = gameKey === "team_match" ? " · Best Ball" : (cfg.scoringMode ? ` · ${formatScoringModeLabel(cfg.scoringMode)}` : "");
  return `${getGameLabel(gameKey)} (${basis}${mode})`;
}
function formatMatchDiff(diff, match = null) {
  if (!Number.isFinite(diff) || diff === 0) return 'AS';
  const sign = diff > 0 ? getTeamLabel(match, 1) : getTeamLabel(match, 2);
  return `${sign} ${Math.abs(diff)} up`;
}

function formatGrossNet(score) {
  if (!Number.isFinite(score?.gross)) return '—';
  const netText = Number.isFinite(score?.net) ? ` / net ${score.net}` : '';
  return `${score.gross}${netText}`;
}

function getHoleValueForBasis(scoreObj, basis = 'net') {
  if (!scoreObj) return null;
  return String(basis || 'net').toLowerCase() === 'gross' ? scoreObj.gross : scoreObj.net;
}
function getTeamHoleScore(holeResult, teamNo, basis = 'net', scoringMode = 'best_ball') {
  const teamScores = (holeResult?.playerScores || []).filter(s => s.team === teamNo);
  if (!teamScores.length) return null;
  const values = teamScores.map(s => getHoleValueForBasis(s, basis)).filter(v => Number.isFinite(v));
  if (!values.length) return null;
  return String(scoringMode || 'best_ball') === 'aggregate'
    ? values.reduce((sum, v) => sum + v, 0)
    : Math.min(...values);
}
function getHeadToHeadOutcome(value1, value2) {
  if (!Number.isFinite(value1) || !Number.isFinite(value2)) return 'pending';
  if (value1 < value2) return 'team1';
  if (value2 < value1) return 'team2';
  return 'tied';
}
function computeNassauDiffsForBasis(metrics, basis = 'net') {
  const holes = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  let front = 0, back = 0, overall = 0;
  holes.forEach((h, idx) => {
    if (!h?.completed) return;
    const t1 = getTeamHoleScore(h, 1, basis, 'best_ball');
    const t2 = getTeamHoleScore(h, 2, basis, 'best_ball');
    const outcome = getHeadToHeadOutcome(t1, t2);
    const step = outcome === 'team1' ? 1 : outcome === 'team2' ? -1 : 0;
    overall += step;
    if (idx < 9) front += step;
    else back += step;
  });
  return { front, back, overall };
}
function getTeamStrokeStanding(metrics, basis = 'net', scoringMode = 'best_ball') {
  const teams = (metrics?.teams || []).map(t => ({ team: t.team, total: 0, completeHoles: 0 }));
  const byTeam = Object.fromEntries(teams.map(t => [t.team, t]));
  (metrics?.holeResults || []).forEach(h => {
    if (!h?.completed) return;
    teams.forEach(t => {
      const value = getTeamHoleScore(h, t.team, basis, scoringMode);
      if (Number.isFinite(value)) {
        byTeam[t.team].total += value;
        byTeam[t.team].completeHoles += 1;
      }
    });
  });
  const valid = teams.filter(t => byTeam[t.team].completeHoles > 0).map(t => byTeam[t.team]);
  if (!valid.length) return { winner: null, totals: byTeam, tie: false };
  const best = Math.min(...valid.map(t => t.total));
  const winners = valid.filter(t => t.total === best);
  return { winner: winners.length === 1 ? winners[0].team : null, totals: byTeam, tie: winners.length !== 1 };
}

function getTeamStrokeScoreboardData(match, metrics, cfg = {}) {
  const basis = String(cfg?.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
  const scoringMode = resolveTeamStrokeScoringMode(cfg?.scoringMode);
  const rows = (metrics?.teams || []).map(teamRef => {
    let total;
    if (scoringMode === 'aggregate') total = basis === 'gross' ? teamRef.grossTotal : teamRef.netTotal;
    else {
      total = (metrics?.holeResults || []).reduce((sum, holeResult) => {
        if (!holeResult?.completed) return sum;
        const value = getTeamHoleScore(holeResult, teamRef.team, basis, scoringMode);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
    }
    return { team: teamRef.team, total: Number.isFinite(total) ? total : null };
  }).filter(row => Number.isFinite(row.total)).sort((a, b) => a.total - b.total || a.team - b.team);
  const leader = rows[0] || null;
  const runnerUp = rows[1] || null;
  const tie = !!leader && !!runnerUp && leader.total === runnerUp.total;
  const margin = leader && runnerUp && !tie ? runnerUp.total - leader.total : 0;
  return { basis, scoringMode, rows, leader, runnerUp, tie, margin };
}
function computeSkinResults(match, metrics, cfg = {}) {
  const basis = String(cfg.basis || 'net').toLowerCase();
  const isTeam = cfg.skinsType === 'team';
  const winnersByHole = [];
  const counts = {};
  (metrics?.holeResults || []).forEach(h => {
    if (!h.completed) return;
    if (isTeam) {
      const scoredTeams = (metrics.teams || []).map(t => ({ team: t.team, value: getTeamHoleScore(h, t.team, basis, 'best_ball') })).filter(t => Number.isFinite(t.value));
      if (scoredTeams.length < 2) return;
      const best = Math.min(...scoredTeams.map(t => t.value));
      const winners = scoredTeams.filter(t => t.value == best);
      if (winners.length === 1) {
        const winner = winners[0].team;
        counts[winner] = (counts[winner] || 0) + 1;
        winnersByHole.push({ holeNumber: h.holeNumber, winnerType: 'team', winner });
      }
      return;
    }
    const scoredPlayers = (h.playerScores || []).map(ps => ({ playerId: ps.playerId, value: getHoleValueForBasis(ps, basis) })).filter(p => Number.isFinite(p.value));
    if (scoredPlayers.length < 2) return;
    const best = Math.min(...scoredPlayers.map(p => p.value));
    const winners = scoredPlayers.filter(p => p.value == best);
    if (winners.length === 1) {
      const winner = winners[0].playerId;
      counts[winner] = (counts[winner] || 0) + 1;
      winnersByHole.push({ holeNumber: h.holeNumber, winnerType: 'player', winner });
    }
  });
  return { counts, winnersByHole };
}
function getGreeniesResults(match, metrics, cfg = {}) {
  const counts = {};
  const winnersByHole = [];
  const participants = new Set((cfg.participants || []).filter(Boolean));
  Object.entries(match?.greeniesWinners || {}).forEach(([holeNo, winnerId]) => {
    const hole = (metrics?.tee?.holes || []).find(h => String(h.holeNumber) === String(holeNo));
    if (!hole || Number(hole.par) !== 3) return;
    if (!winnerId || (participants.size && !participants.has(winnerId))) return;
    counts[winnerId] = (counts[winnerId] || 0) + 1;
    winnersByHole.push({ holeNumber: Number(holeNo), winner: winnerId });
  });
  winnersByHole.sort((a,b)=>a.holeNumber-b.holeNumber);
  return { counts, winnersByHole };
}
function formatGolfScoreSymbol(score, par) {
  if (!Number.isFinite(score)) return '—';
  const diff = Number(score) - Number(par || 0);
  const s = String(score);
  if (diff <= -2) return `◎${s}◎`;
  if (diff === -1) return `◯${s}◯`;
  if (diff === 1) return `□${s}□`;
  if (diff >= 2) return `▣${s}▣`;
  return s;
}
function golfScoreClass(score, par) {
  if (!Number.isFinite(score)) return '';
  const diff = Number(score) - Number(par || 0);
  if (diff <= -2) return 'score-eagle';
  if (diff === -1) return 'score-birdie';
  if (diff === 1) return 'score-bogey';
  if (diff >= 2) return 'score-doublebogey';
  return 'score-par';
}
function getGolfScoreInlineStyle(score, par) {
  if (!Number.isFinite(score)) return 'color:#94a3b8;background:transparent;border-color:transparent;padding:0;min-width:auto;height:auto;';
  const diff = Number(score) - Number(par || 0);
  const base = 'display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;line-height:1;font-weight:700;font-variant-numeric:tabular-nums;border:1.5px solid transparent;padding:0 6px;background:#fff;color:#172033;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box;';
  if (diff <= -2) return `${base}border-color:#2b7a4b;border-radius:999px;box-shadow:0 0 0 1.5px #2b7a4b inset;`;
  if (diff === -1) return `${base}border-color:#2b7a4b;border-radius:999px;`;
  if (diff === 1) return `${base}border-color:#a07a14;border-radius:4px;`;
  if (diff >= 2) return `${base}border-color:#a07a14;border-radius:4px;box-shadow:0 0 0 1.5px #a07a14 inset;`;
  return `${base}border-color:transparent;border-radius:999px;`;
}
function formatGolfScoreMarkup(score, par, tone = 'gross') {
  if (!Number.isFinite(score)) return '<span class="score-number score-empty" style="color:#94a3b8;background:transparent;border-color:transparent;padding:0;min-width:auto;height:auto;">—</span>';
  const cls = golfScoreClass(score, par);
  const style = getGolfScoreInlineStyle(score, par);
  return `<span class="score-number ${cls} ${tone === 'net' ? 'score-net' : 'score-gross'}" style="${style}">${escapeHtml(String(score))}</span>`;
}
function buildRoundShareText(match) {
  const metrics = computeMatchMetrics(match);
  currentLeaderboardMatchRef = match;
  if (!metrics) return `${match?.name || 'Golf round'}

This round is missing valid course or tee data.`;
  const lines = [];
  lines.push(`${match.name || 'Round'} — ${match.date}`);
  lines.push(`${metrics.course.name} · ${metrics.tee.teeName}`);
  const holeCount = getPlayableHoleCount(match, metrics.tee);
  lines.push(`${getHoleSegmentLabel(match, metrics.tee)} · ${metrics.completed}/${holeCount} holes complete`);
  if (match.status === 'complete') lines.push(`Completed ${new Date(match.completedAt || Date.now()).toLocaleString()}`);
  lines.push('');

  if (metrics.teams.length === 2) {
    lines.push(`Team Match: ${formatMatchDiff(metrics.matchDiff, match)}`);
    const front = metrics.teams[0].front === 0 ? 'AS' : (metrics.teams[0].front > 0 ? `${getTeamLabel(match, 1)} ${Math.abs(metrics.teams[0].front)} up` : `${getTeamLabel(match, 2)} ${Math.abs(metrics.teams[0].front)} up`);
    const back = metrics.teams[0].back === 0 ? 'AS' : (metrics.teams[0].back > 0 ? `${getTeamLabel(match, 1)} ${Math.abs(metrics.teams[0].back)} up` : `${getTeamLabel(match, 2)} ${Math.abs(metrics.teams[0].back)} up`);
    if (holeCount > 9) {
      lines.push(`Front 9: ${front}`);
      lines.push(`Back 9: ${back}`);
    } else {
      lines.push(`Match status: ${front}`);
    }
    lines.push('');
    lines.push('Team Totals');
    metrics.teams.forEach(team => {
      lines.push(`${getTeamLabel(match, team.team)} (${team.members.map(m => m.player.name).join(', ')}): gross ${team.grossTotal}, net ${team.netTotal}, to par ${formatSigned(team.toPar)}, net diff ${formatSigned(team.netDiff)}, skins ${team.skins}`);
    });
    lines.push('');
  }

  lines.push('Player Totals');
  metrics.players.slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar).forEach(p => {
    lines.push(`${p.player.name} (${getTeamLabel(match, p.team)}): gross ${p.grossTotal || 0}, net ${p.netTotal || 0}, to par ${formatSigned(p.toPar || 0)}, net diff ${formatSigned(p.netDiff || 0)}, skins ${p.skins}`);
  });

  lines.push('');
  lines.push('Hole-by-Hole');
  metrics.holeResults.forEach(h => {
    if (!h.completed) {
      lines.push(`H${h.holeNumber}: not completed`);
      return;
    }
    const playerBits = metrics.players.map(p => {
      const score = h.playerScores.find(ps => ps.playerId === p.playerId);
      return `${p.player.name} ${formatGrossNet(score)}`;
    }).join(' | ');
    const result = metrics.teams.length === 2
      ? (h.teamWinner === 1 ? `${getTeamLabel(match, 1)} won hole` : h.teamWinner === 2 ? `${getTeamLabel(match, 2)} won hole` : 'Hole tied')
      : `Low net: ${h.indivWinners.map(id => metrics.players.find(p => p.playerId === id)?.player.name).filter(Boolean).join(', ') || '—'}`;
    lines.push(`H${h.holeNumber}: ${playerBits} — ${result}`);
  });

  return lines.join('\n');
}
function applyScoreboardPrintView(view = "summary") {
  const requestedView = view === "scorecard" ? "scorecard" : "summary";
  document.body.classList.toggle('printing-summary', requestedView === 'summary');
  document.body.classList.toggle('printing-classic-only', requestedView === 'scorecard');
  document.body.setAttribute('data-print-view', requestedView);
  const root = document.getElementById('leaderboardWrap');
  if (root) root.setAttribute('data-print-view', requestedView);
  const printMeta = document.getElementById('printRoundMeta');
  if (printMeta && !printMeta.classList.contains('hidden')) {
    const match = getActiveMatch();
    const metrics = match ? computeMatchMetrics(match) : null;
    printMeta.innerHTML = buildPrintMeta(match, metrics, requestedView);
  }
  const classicCard = document.querySelector('.print-section-classic-scorecard');
  const nineCard = document.getElementById('ninePointScorecardCard');
  const cards = document.querySelectorAll('.leaderboard-cards, .print-section-match-status, .print-section-scoreboard-summary, .print-section-momentum, .print-section-payout, .print-section-stat-tracking, .print-section-notes');
  if (classicCard) classicCard.classList.toggle('print-preview-emphasis', requestedView === 'scorecard');
  if (nineCard) nineCard.classList.toggle('print-preview-emphasis', requestedView === 'scorecard');
  cards.forEach(card => card.classList.toggle('print-preview-muted', requestedView === 'scorecard'));
}
function buildPrintMeta(match, metrics, printView = "summary") {
  const holeCount = getPlayableHoleCount(match, metrics?.tee);
  const courseName = metrics?.course?.name || 'No course';
  const teeName = metrics?.tee?.teeName || 'No tee';
  return `
    <div class="print-round-title">${escapeHtml(match?.name || 'Round')}</div>
    <div class="print-round-sub">${escapeHtml(match?.date || todayIso())} · ${escapeHtml(courseName)} · ${escapeHtml(teeName)} · ${holeCount} holes</div>
    <div class="print-round-sub">${metrics ? `${metrics.completed}/${holeCount} holes completed` : 'Scorecard ready to print'}${match?.status === 'complete' ? ' · Final' : ' · Live'} · ${printView === 'scorecard' ? 'Classic scorecard only' : 'Full match summary'}<\/div>`;
}
function clearPrintScaling() {
  const root = document.getElementById('leaderboardWrap');
  const classicCard = document.querySelector('.print-section-classic-scorecard');
  if (root) {
    root.style.removeProperty('--summary-print-scale');
    root.style.removeProperty('--classic-print-scale');
  }
  if (classicCard) classicCard.style.removeProperty('--classic-print-height');
}
let activePrintCleanup = null;
function cleanupActivePrintSession() {
  if (typeof activePrintCleanup === 'function') {
    const cleanup = activePrintCleanup;
    activePrintCleanup = null;
    cleanup();
  }
}
function armDeferredPrintCleanup(cleanup) {
  cleanupActivePrintSession();
  let done = false;
  let cleanupTimer = null;
  const runCleanup = () => {
    if (done) return;
    done = true;
    if (cleanupTimer) clearTimeout(cleanupTimer);
    window.removeEventListener('afterprint', handleAfterPrint);
    window.removeEventListener('focus', handleFocusReturn, true);
    document.removeEventListener('visibilitychange', handleVisibilityReturn, true);
    cleanup();
    activePrintCleanup = null;
  };
  const scheduleCleanup = (delay = 700) => {
    if (done) return;
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') runCleanup();
    }, delay);
  };
  const handleAfterPrint = () => scheduleCleanup(900);
  const handleFocusReturn = () => scheduleCleanup(450);
  const handleVisibilityReturn = () => {
    if (document.visibilityState === 'visible') scheduleCleanup(250);
  };
  window.addEventListener('afterprint', handleAfterPrint);
  window.addEventListener('focus', handleFocusReturn, true);
  document.addEventListener('visibilitychange', handleVisibilityReturn, true);
  activePrintCleanup = runCleanup;
}
function fitElementScale(element, maxWidth, maxHeight = null) {
  if (!element || !maxWidth) return 1;
  const width = Math.max(element.scrollWidth || 0, element.offsetWidth || 0, element.getBoundingClientRect?.().width || 0);
  const height = Math.max(element.scrollHeight || 0, element.offsetHeight || 0, element.getBoundingClientRect?.().height || 0);
  if (!width || !height) return 1;
  const widthScale = Math.min(1, maxWidth / width);
  const heightScale = maxHeight ? Math.min(1, maxHeight / height) : 1;
  return Math.max(0.58, Math.min(widthScale, heightScale, 1));
}


function buildExportPlayerLeaderboard(match, metrics) {
  const sortedPlayers = (metrics?.players || []).slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar || a.player.name.localeCompare(b.player.name));
  if (!sortedPlayers.length) return '<div class="export-empty">No player leaderboard available.</div>';
  const rows = sortedPlayers.map(p => `
    <tr>
      <td>${escapeHtml(p.player.name)}</td>
      <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
      <td>${p.grossTotal || 0}</td>
      <td>${p.postableTotal || 0}</td>
      <td>${formatSigned(p.toPar || 0)}</td>
      <td>${p.netTotal || 0}</td>
      <td>${formatSigned(p.netDiff || 0)}</td>
    </tr>
  `).join('');
  return `
    <div class="fit-stage" data-fit="width" data-fit-min="0.84">
      <div class="fit-box">
        <table class="export-table">
          <thead>
            <tr><th>Player</th><th>Team</th><th>Gross</th><th>Postable</th><th>Gross to Par</th><th>Net</th><th>Net to Par</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildExportTeamLeaderboard(match, metrics) {
  const sortedTeams = (metrics?.teams || []).slice().sort((a, b) => (a.netTotal - b.netTotal) || (a.grossTotal - b.grossTotal) || (a.team - b.team));
  if (!sortedTeams.length) return '<div class="export-empty">No team leaderboard available.</div>';
  const showH2h = showTeamMatchMetric(match, metrics);
  const rows = sortedTeams.map(t => `
    <tr>
      <td>${escapeHtml(getTeamLabel(match, t.team))}</td>
      <td>${escapeHtml(t.members.map(m => m.player.name).join(', '))}</td>
      <td>${t.grossTotal || 0}</td>
      <td>${t.netTotal || 0}</td>
      <td>${formatSigned(t.toPar || 0)}</td>
      <td>${formatSigned(t.netDiff || 0)}</td>
      <td>${showH2h ? formatSigned(t.overall || 0) : '—'}</td>
    </tr>
  `).join('');
  return `
    <div class="fit-stage" data-fit="width" data-fit-min="0.84">
      <div class="fit-box">
        <table class="export-table">
          <thead>
            <tr><th>Team</th><th>Players</th><th>Gross</th><th>Net</th><th>To Par</th><th>Net Diff</th><th>${showH2h ? 'H2H' : '—'}</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildExportMomentum(match, metrics) {
  if (!hasMomentumGame(match)) return '';
  const options = getMomentumOptions(match);
  const selectedGame = match.momentumGame && options.find(opt => opt.key === match.momentumGame)
    ? match.momentumGame
    : (options[0]?.key || 'nassau');
  const perspectiveTeam = getMomentumPerspectiveTeam(match);
  let running = 0;
  const pills = (metrics?.holeResults || []).map(h => {
    const outcome = computeMomentumOutcome(match, metrics, h, selectedGame);
    let cls = 'tied';
    if (outcome === 'team1') {
      running += 1;
      cls = perspectiveTeam === 1 ? 'team1' : 'team2';
    } else if (outcome === 'team2') {
      running -= 1;
      cls = perspectiveTeam === 1 ? 'team2' : 'team1';
    } else if (outcome === 'pending') {
      cls = 'pending';
    }
    const txt = outcome === 'pending' ? '•' : formatPerspectiveStatus(running, perspectiveTeam);
    return `<div class="export-pill ${cls}">H${h.holeNumber}<span>${escapeHtml(txt)}</span></div>`;
  }).join('');
  return `
    <section class="export-section export-section-momentum">
      <div class="export-section-head">
        <h2>Hole-by-hole momentum</h2>
        <div class="export-section-sub">${describeMomentumMeta(match, metrics, selectedGame)}</div>
      </div>
      <div class="export-pill-grid">${pills}</div>
    </section>`;
}

function buildExportNotes() {
  const notes = String(state?.notes || '').trim();
  if (!notes) return '';
  return `
    <section class="export-section export-section-notes">
      <div class="export-section-head">
        <h2>Notes</h2>
      </div>
      <div class="export-note-block">${escapeHtml(notes).replace(/\n/g, '<br>')}</div>
    </section>`;
}

function buildSummaryExportBody(match, metrics) {
  const statusOptions = getMatchStatusOptions(match);
  const featuredKey = match.matchStatusGame && statusOptions.find(opt => opt.key === match.matchStatusGame)
    ? match.matchStatusGame
    : (statusOptions[0]?.key || 'team_match');
  const exportScoreDistributionHtml = buildExportScoreDistributionSummary(match, metrics);
  const exportStatTrackingHtml = buildExportStatTrackingSummary(match, metrics);
  const showNinePoint = (match.selectedGames || []).some(g => g.key === 'nine_point');
  return `
    <section class="export-section export-section-match-status">
      <div class="export-section-head">
        <h2>Match status</h2>
      </div>
      ${buildFeaturedMatchStatus(match, metrics, featuredKey)}
    </section>

    ${buildExportMomentum(match, metrics)}

    <section class="export-section export-section-games-summary">
      <div class="export-section-head">
        <h2>Games summary</h2>
      </div>
      ${buildSelectedGamesSummary(match, metrics)}
    </section>

    <section class="export-section export-section-net-payout">
      <div class="export-section-head">
        <h2>Net payout</h2>
      </div>
      ${buildNetPayoutSummary(match, metrics)}
    </section>

    <section class="export-section export-section-team-leaderboard">
      <div class="export-section-head">
        <h2>Team leaderboard</h2>
      </div>
      ${buildExportTeamLeaderboard(match, metrics)}
    </section>

    <section class="export-section export-section-player-leaderboard">
      <div class="export-section-head">
        <h2>Player leaderboard</h2>
      </div>
      ${buildExportPlayerLeaderboard(match, metrics)}
    </section>

    <section class="export-section export-section-classic export-section-classic-summary">
      <div class="export-section-head">
        <h2>Classic scorecard</h2>
        <div class="export-section-sub">Gross on top, net below, dots indicate strokes received.</div>
      </div>
      <div class="fit-stage export-classic-stage" data-fit="width-height" data-fit-min="0.52">
        <div class="fit-box">
          ${buildClassicScorecard(match, metrics)}
        </div>
      </div>
    </section>

    <section class="export-section export-section-score-distribution">
      <div class="export-section-head">
        <h2>Score Distribution</h2>
        <div class="export-section-sub">Gross scores only; completed holes only.</div>
      </div>
      ${exportScoreDistributionHtml}
    </section>

    ${showNinePoint ? `
    <section class="export-section export-section-nine-point">
      <div class="export-section-head">
        <h2>9-Point game</h2>
      </div>
      <div class="fit-stage" data-fit="width" data-fit-min="0.72">
        <div class="fit-box">
          ${buildNinePointScorecard(match, metrics)}
        </div>
      </div>
    </section>` : ''}

    ${exportStatTrackingHtml ? `
    <section class="export-section export-section-stat-tracking">
      <div class="export-section-head">
        <h2>Stat Tracking Summary</h2>
        <div class="export-section-sub">Completed holes only.</div>
      </div>
      ${exportStatTrackingHtml}
    </section>` : ''}

    ${buildExportNotes()}`;
}

function buildClassicOnlyExportBody(match, metrics) {
  return `
    <section class="export-section export-section-classic-only">
      <div class="export-section-head">
        <h2>Classic scorecard</h2>
        <div class="export-section-sub">Gross on top, net below, dots indicate strokes received.</div>
      </div>
      <div class="fit-stage export-classic-stage" data-fit="width-height" data-fit-min="0.48">
        <div class="fit-box">
          ${buildClassicScorecard(match, metrics)}
        </div>
      </div>
    </section>`;
}

function buildUnifiedExportDocument(match, metrics, printView = 'summary') {
  const requestedView = printView === 'scorecard' ? 'scorecard' : 'summary';
  const courseName = metrics?.course?.name || 'No course';
  const teeName = metrics?.tee?.teeName || 'No tee';
  const holeCount = getPlayableHoleCount(match, metrics?.tee);
  const pageTitle = escapeHtml(`${match?.name || 'Round'} — ${requestedView === 'scorecard' ? 'Classic Scorecard' : 'Match Summary'}`);
  const pageSub = escapeHtml(`${match?.date || todayIso()} · ${courseName} · ${teeName} · ${holeCount} holes`);
  const pageMeta = escapeHtml(`${metrics ? `${metrics.completed}/${holeCount} holes completed` : 'Scorecard ready to print'}${match?.status === 'complete' ? ' · Final' : ' · Live'} · ${requestedView === 'scorecard' ? 'Classic scorecard only' : 'Full match summary'}`);
  const bodyHtml = requestedView === 'scorecard'
    ? buildClassicOnlyExportBody(match, metrics)
    : buildSummaryExportBody(match, metrics);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${pageTitle}</title>
  <style>
    :root {
      --page-bg: #edf2f7;
      --card-bg: #ffffff;
      --border: #d5dde7;
      --border-strong: #bcc8d8;
      --text: #152033;
      --muted: #5a667a;
      --accent: #0b5d3b;
      --accent-soft: #edf7f1;
      --ink-soft: #f7fafc;
      --pill-team1: #e8f3ec;
      --pill-team2: #fceaea;
      --pill-tied: #f4f6f8;
      --pill-pending: #fff7db;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--page-bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { padding: 14px; }
    .export-shell {
      width: 100%;
      max-width: 1180px;
      margin: 0 auto;
    }
    .export-toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
      gap: 8px;
    }
    .export-toolbar button {
      appearance: none;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 600;
      color: var(--text);
    }
    .export-return-status {
      margin: 0 0 10px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      background: #fff8dc;
      color: #5c4a00;
      border-radius: 12px;
      font-size: 12px;
    }
    .export-header {
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px 18px;
      margin-bottom: 12px;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
    }
    .export-title { font-size: 22px; font-weight: 800; line-height: 1.05; letter-spacing: -0.02em; }
    .export-sub { margin-top: 6px; color: var(--muted); font-size: 12px; font-weight: 600; }
    .export-meta { margin-top: 8px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .export-section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 14px;
      margin-bottom: 12px;
      break-inside: auto;
      page-break-inside: auto;
      overflow: visible;
      --page-scale: 1;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
    }
    .print-page-content {
      transform-origin: top left;
      transform: scale(var(--page-scale));
      width: calc(100% / var(--page-scale));
    }
    .export-section-head {
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .export-section-head h2 { margin: 0; font-size: 16px; line-height: 1.15; letter-spacing: -0.01em; }
    .export-section-sub { margin-top: 5px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .export-empty { color: var(--muted); font-size: 12px; }
    .export-note-block {
      font-size: 12px;
      line-height: 1.45;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .fit-stage {
      width: 100%;
      overflow: hidden;
      position: relative;
      --fit-scale: 1;
    }
    .fit-box {
      transform-origin: top left;
      transform: scale(var(--fit-scale));
      width: calc(100% / var(--fit-scale));
    }
    .export-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      font-size: 11px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }
    .export-table th,
    .export-table td {
      border: 1px solid var(--border);
      padding: 6px 7px;
      text-align: left;
      vertical-align: top;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .export-table th {
      background: linear-gradient(180deg, #f9fbfd 0%, #f2f6fa 100%);
      font-weight: 800;
      color: #243247;
    }
    .export-pill-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }
    .export-pill {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    .export-pill span {
      color: var(--muted);
      font-weight: 600;
    }
    .export-pill.team1 { background: var(--pill-team1); }
    .export-pill.team2 { background: var(--pill-team2); }
    .export-pill.tied { background: var(--pill-tied); }
    .export-pill.pending { background: var(--pill-pending); }
    .match-status-head { margin-bottom: 10px; }
    .match-status-head .tiny { text-transform: uppercase; letter-spacing: 0.05em; }
    .match-status-grid, .game-summary-grid, .stat-summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .match-status-tile, .game-summary-card, .stat-summary-card {
      border: 1px solid var(--border);
      background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
      border-radius: 14px;
      padding: 11px;
      min-width: 0;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    }
    .match-status-value, .game-summary-value {
      margin-top: 6px;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .match-status-meta, .game-summary-sub, .tiny { color: var(--muted); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
    .game-summary-card-accent { background: var(--accent-soft); }
    .payout-summary-stack { display: grid; gap: 14px; }
    .payout-section { padding: 2px 0 0; }
    .payout-section { break-inside: auto; page-break-inside: auto; }
    .payout-summary-intro, .payout-settlement-head {
      font-size: 12px;
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .payout-summary-intro strong, .payout-settlement-head strong { color: #243247; }
    .final-net-settlement-card { border: 1px solid var(--border); border-radius: 14px; background: #fbfcfd; padding: 10px; display: grid; gap: 8px; }
    .final-net-settlement-list { display: grid; gap: 5px; }
    .final-net-settlement-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 9px; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
    .final-net-settlement-player { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .final-net-settlement-amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .final-net-settlement-crossfoot { font-size: 10px; text-align: right; color: #65758b; font-variant-numeric: tabular-nums; }
    .payout-table-wrap, .scorecard-wrap { overflow: visible !important; max-width: 100%; }
    .payout-game-table, .settlement-table, .scorecard-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      font-size: 10px;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
    }
    .payout-game-table thead, .settlement-table thead, .scorecard-table thead { display: table-header-group; }
    .payout-game-table tfoot, .settlement-table tfoot, .scorecard-table tfoot { display: table-footer-group; }
    .payout-game-table tr, .settlement-table tr, .scorecard-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .payout-game-table th, .payout-game-table td,
    .settlement-table th, .settlement-table td,
    .scorecard-table th, .scorecard-table td {
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 5px 6px;
      text-align: center;
      vertical-align: middle;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      position: static !important;
      left: auto !important;
      box-shadow: none !important;
      background: #fff !important;
    }
    .payout-game-table tr > *:first-child, .settlement-table tr > *:first-child, .scorecard-table tr > *:first-child { border-left: 1px solid var(--border); }
    .payout-game-table thead th, .settlement-table thead th, .scorecard-table thead th { background: linear-gradient(180deg, #f9fbfd 0%, #f2f6fa 100%) !important; font-weight: 800; color: #243247; }
    .payout-game-table tbody tr:nth-child(even) td, .settlement-table tbody tr:nth-child(even) td, .scorecard-table tbody tr:nth-child(even) td { background: #fcfdff !important; }
    .payout-game-table tfoot td, .settlement-table tfoot td, .scorecard-table tfoot td { background: #f7fafc !important; font-weight: 800; }
    .payout-game-table th:first-child, .payout-game-table td:first-child,
    .settlement-table th:first-child, .settlement-table td:first-child,
    .scorecard-table th:first-child, .scorecard-table td:first-child { text-align: left; }
    .scorecard-sub { margin-bottom: 8px; color: var(--muted); font-size: 10px; line-height: 1.35; padding: 0 2px; }
    .scorecard-wrap {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0;
      background: #fff;
      overflow: hidden;
    }
    .scorecard-table { table-layout: fixed; font-size: 10px; }
    .scorecard-table th.scorecard-sticky-name,
    .scorecard-table td.scorecard-sticky-name {
      width: 98px;
      min-width: 98px;
      max-width: 98px;
      text-align: left;
      white-space: normal;
      line-height: 1.15;
    }
    .scorecard-table th.scorecard-sticky-team,
    .scorecard-table td.scorecard-sticky-team {
      width: 56px;
      min-width: 56px;
      max-width: 56px;
      text-align: left;
      white-space: normal;
      line-height: 1.15;
    }
    .scorecard-table th:not(.scorecard-sticky-name):not(.scorecard-sticky-team),
    .scorecard-table td:not(.scorecard-sticky-name):not(.scorecard-sticky-team) {
      width: 33px;
      min-width: 33px;
      max-width: 33px;
    }
    .score-hole-cell { padding: 2px 1px; }
    .score-main, .score-sub { display: block; line-height: 1.05; }
    .score-main { font-size: 10px; font-weight: 700; }
    .score-sub { font-size: 8px; margin-top: 1px; }
    .total-sub { margin-top: 2px; }
    .score-number { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; line-height: 1; border: 1.5px solid transparent; padding: 0 4px; background: #fff; color: #172033; font-weight: 800; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .score-empty { color: #94a3b8; background: transparent; border-color: transparent; }
    .score-birdie { border-color: #2b7a4b; border-radius: 999px; text-decoration: none; }
    .score-eagle { border-color: #2b7a4b; box-shadow: 0 0 0 1.25px #2b7a4b inset; border-radius: 999px; }
    .score-bogey { border-color: #a07a14; border-radius: 3px; }
    .score-doublebogey { border-color: #a07a14; box-shadow: 0 0 0 1.25px #a07a14 inset; border-radius: 3px; }
    .score-dots { margin-left: 2px; font-size: 8px; letter-spacing: -0.5px; }
    .score-eagle { font-weight: 700; }
    .score-birdie { text-decoration: underline; }
    .payout-total-positive { color: #0b6b3e; }
    .payout-total-negative { color: #9f1d1d; }
    strong { font-weight: 800; }

    @media (max-width: 760px) {
      .export-pill-grid, .match-status-grid, .game-summary-grid, .stat-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .export-toolbar { justify-content: stretch; }
      .export-toolbar button { width: 100%; }
    }

    @media print {
      @page { size: landscape; margin: 8mm; }
      html, body { background: #fff; }
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .export-toolbar, .export-return-status { display: none !important; }
      .export-shell { max-width: none; width: 100%; }
      .export-header, .export-section {
        border-radius: 0;
        border-left: none;
        border-right: none;
        box-shadow: none;
      }
      .export-header {
        padding: 0 0 10px 0;
        margin-bottom: 10px;
        border-top: none;
        break-after: avoid-page;
        page-break-after: avoid;
      }
      .export-title { font-size: 16px; }
      .export-sub, .export-meta { font-size: 10px; }
      .export-section {
        padding: 10px 0;
        margin-bottom: 0;
        break-inside: avoid-page;
        page-break-inside: avoid;
        break-before: page;
        page-break-before: always;
        min-height: 0;
      }
      .export-section:first-of-type {
        break-before: auto;
        page-break-before: auto;
      }
      .export-section-head h2 { font-size: 13px; }
      .export-section-sub, .match-status-meta, .game-summary-sub, .tiny, .scorecard-sub { font-size: 9px; }
      .match-status-grid, .game-summary-grid, .stat-summary-grid { gap: 8px; }
      .match-status-tile, .game-summary-card, .stat-summary-card {
        padding: 8px;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .export-section-classic-only,
      .export-classic-stage,
      .scorecard-wrap,
      .print-page-content {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .payout-section, .payout-table-wrap, .payout-game-table, .settlement-table {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .payout-summary-intro, .payout-settlement-head, .export-section-head {
        break-after: avoid-page;
        page-break-after: avoid;
      }
      .match-status-value, .game-summary-value { font-size: 12px; }
      .export-pill { font-size: 10px; padding: 7px 8px; }
      .export-table { font-size: 9px; }
      .export-table th, .export-table td { padding: 4px 5px; }
      .payout-game-table, .settlement-table, .scorecard-table { font-size: 8.5px; }
      .payout-game-table th, .payout-game-table td,
      .settlement-table th, .settlement-table td,
      .scorecard-table th, .scorecard-table td { padding: 2px 2px; }
      .scorecard-table th.scorecard-sticky-name,
      .scorecard-table td.scorecard-sticky-name { width: 82px; min-width: 82px; max-width: 82px; }
      .scorecard-table th.scorecard-sticky-team,
      .scorecard-table td.scorecard-sticky-team { width: 44px; min-width: 44px; max-width: 44px; }
      .scorecard-table th:not(.scorecard-sticky-name):not(.scorecard-sticky-team),
      .scorecard-table td:not(.scorecard-sticky-name):not(.scorecard-sticky-team) { width: 28px; min-width: 28px; max-width: 28px; }
      .score-main { font-size: 8.5px; }
      .score-sub { font-size: 7px; }
    }
  </style>
</head>
<body>
  <div class="export-shell" data-export-view="${requestedView}">
    <div class="export-toolbar">
      <button type="button" id="returnToAppBtn">Return to App</button>
      <button type="button" id="manualPrintBtn">Print / Save PDF</button>
    </div>
    <div class="export-return-status" id="returnStatus" hidden>You can close this tab to return to the app.</div>
    <div class="export-header">
      <div class="export-title">${pageTitle}</div>
      <div class="export-sub">${pageSub}</div>
      <div class="export-meta">${pageMeta}</div>
    </div>
    ${bodyHtml}
  </div>
  <script>
    (function () {
      const AUTO_PRINT_DELAY = 260;
      const PRINT_PAGE_HEIGHT_MM = 215.9;
      const PRINT_PAGE_MARGIN_MM = 8;
      const SECTION_GAP_PX = 10;
      function mmToPx(mm) {
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.height = mm + 'mm';
        probe.style.pointerEvents = 'none';
        document.body.appendChild(probe);
        const px = probe.getBoundingClientRect().height || (mm * 96 / 25.4);
        probe.remove();
        return px;
      }
      function getPrintablePageHeightPx() {
        return Math.max(480, mmToPx(PRINT_PAGE_HEIGHT_MM - (PRINT_PAGE_MARGIN_MM * 2)));
      }
      function decoratePrintPages() {
        document.querySelectorAll('.export-section').forEach(function (section) {
          if (section.querySelector(':scope > .print-page-content')) return;
          const wrapper = document.createElement('div');
          wrapper.className = 'print-page-content';
          while (section.firstChild) wrapper.appendChild(section.firstChild);
          section.appendChild(wrapper);
        });
      }
      function fitStage(stage) {
        if (!stage) return;
        const box = stage.querySelector('.fit-box');
        if (!box) return;
        stage.style.removeProperty('height');
        stage.style.removeProperty('--fit-scale');
        box.style.removeProperty('transform');
        box.style.removeProperty('width');
        const fitMode = stage.getAttribute('data-fit') || 'width';
        const minScale = Math.max(0.4, Math.min(Number(stage.getAttribute('data-fit-min') || 0.6), 1));
        const width = Math.max(box.scrollWidth || 0, box.offsetWidth || 0, box.getBoundingClientRect().width || 0);
        const height = Math.max(box.scrollHeight || 0, box.offsetHeight || 0, box.getBoundingClientRect().height || 0);
        const availableWidth = Math.max(560, stage.clientWidth || document.documentElement.clientWidth || window.innerWidth || 980);
        const availableHeight = Math.max(380, window.innerHeight || 720);
        let scale = 1;
        if (width > 0) scale = Math.min(scale, availableWidth / width);
        if (fitMode === 'width-height' && height > 0) scale = Math.min(scale, (availableHeight - 150) / height);
        scale = Math.max(minScale, Math.min(scale, 1));
        stage.style.setProperty('--fit-scale', String(scale));
        if (height > 0) stage.style.height = Math.ceil(height * scale) + 8 + 'px';
      }
      function fitAllStages() {
        document.querySelectorAll('.fit-stage').forEach(fitStage);
      }
      function layoutPrintPages() {
        const printableHeight = getPrintablePageHeightPx();
        const header = document.querySelector('.export-header');
        const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) + SECTION_GAP_PX : 0;
        document.querySelectorAll('.export-section').forEach(function (section, index) {
          const content = section.querySelector(':scope > .print-page-content');
          if (!content) return;
          section.style.removeProperty('height');
          section.style.removeProperty('--page-scale');
          content.style.removeProperty('transform');
          content.style.removeProperty('width');
          const sectionChrome = section.offsetHeight - content.offsetHeight;
          const naturalHeight = Math.max(content.scrollHeight || 0, content.offsetHeight || 0, content.getBoundingClientRect().height || 0);
          const availableHeight = Math.max(280, printableHeight - sectionChrome - (index === 0 ? headerHeight : 0));
          let scale = naturalHeight > 0 ? Math.min(1, availableHeight / naturalHeight) : 1;
          scale = Math.max(0.62, Math.min(scale, 1));
          section.style.setProperty('--page-scale', String(scale));
          section.style.height = Math.ceil((naturalHeight * scale) + sectionChrome) + 'px';
        });
      }
      function runAfterLayout(fn) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            setTimeout(fn, 120);
          });
        });
      }
      function prepareExportLayout() {
        decoratePrintPages();
        fitAllStages();
        layoutPrintPages();
      }
      function startPrint() {
        prepareExportLayout();
        runAfterLayout(function () {
          prepareExportLayout();
          setTimeout(function () {
            try { window.print(); } catch (e) {}
          }, AUTO_PRINT_DELAY);
        });
      }
      function showReturnFallback(message) {
        const el = document.getElementById('returnStatus');
        if (!el) return;
        el.hidden = false;
        if (message) el.textContent = message;
      }
      function returnToApp() {
        let closed = false;
        try {
          window.close();
          closed = window.closed;
        } catch (e) {}
        setTimeout(function () {
          if (window.closed || closed) return;
          try {
            if (window.opener && typeof window.opener.focus === 'function') window.opener.focus();
          } catch (e) {}
          try {
            if (window.history.length > 1) {
              window.history.back();
              return;
            }
          } catch (e) {}
          showReturnFallback('You can close this tab to return to the app.');
        }, 120);
      }
      window.addEventListener('resize', prepareExportLayout);
      window.addEventListener('beforeprint', prepareExportLayout);
      document.getElementById('manualPrintBtn')?.addEventListener('click', function () {
        prepareExportLayout();
        setTimeout(function () {
          try { window.print(); } catch (e) {}
        }, 60);
      });
      document.getElementById('returnToAppBtn')?.addEventListener('click', returnToApp);
      if (document.readyState === 'complete') {
        startPrint();
      } else {
        window.addEventListener('load', startPrint, { once: true });
      }
    })();
  <\/script>
</body>
</html>`;
}

function openUnifiedExport(match, printView = 'summary') {
  const metrics = computeMatchMetrics(match);
  if (!metrics) {
    toast('No round selected to share.');
    return;
  }
  if (printView === 'scorecard' && !metrics?.tee) {
    toast('Classic scorecard is not available for this round.');
    return;
  }
  const exportWindow = window.open('', '_blank');
  if (!exportWindow) {
    toast('Please allow pop-ups to share this round.');
    return;
  }
  const exportHtml = buildUnifiedExportDocument(match, metrics, printView);
  exportWindow.document.open();
  exportWindow.document.write(exportHtml);
  exportWindow.document.close();
  try { exportWindow.focus(); } catch (err) {}
}
function prepareScoreboardPrintLayout(printView = 'summary') {
  const root = document.getElementById('leaderboardWrap');
  const classicCard = document.querySelector('.print-section-classic-scorecard');
  const classicScorecard = document.getElementById('classicScorecard');
  const printableSummaryNodes = Array.from(document.querySelectorAll('#leaderboardWrap > .scoreboard-card:not(.scoreboard-export-card):not(.hidden)'));
  clearPrintScaling();
  if (!root) return;
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 1180);
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0, 720);
  if (printView === 'scorecard') {
    const printSafeWidth = 920;
    const printSafeHeight = 560;
    const scorecardTable = classicScorecard?.querySelector('.scorecard-table');
    const scaleTarget = scorecardTable || classicScorecard;
    let scale = fitElementScale(scaleTarget, printSafeWidth, printSafeHeight);
    scale = Math.max(0.42, Math.min(scale, 1));
    root.style.setProperty('--classic-print-scale', String(scale));
    if (classicCard && classicScorecard) {
      const height = Math.ceil((classicScorecard.scrollHeight || classicScorecard.offsetHeight || 0) * scale);
      if (height) classicCard.style.setProperty('--classic-print-height', `${height}px`);
    }
  } else {
    const widest = printableSummaryNodes.reduce((max, node) => Math.max(max, node.scrollWidth || node.offsetWidth || 0), 0);
    const maxWidth = Math.max(880, viewportWidth - 28);
    const scale = widest ? fitElementScale({
      scrollWidth: widest,
      scrollHeight: root.scrollHeight || root.offsetHeight || viewportHeight,
      offsetWidth: widest,
      offsetHeight: root.scrollHeight || root.offsetHeight || viewportHeight,
      getBoundingClientRect: () => ({ width: widest, height: root.scrollHeight || root.offsetHeight || viewportHeight })
    }, maxWidth) : 1;
    root.style.setProperty('--summary-print-scale', String(scale));
  }
}
function openPrintScorecard(matchId, printView = null) {
  const match = getMatch(matchId || state.activeMatchId);
  if (!match) return toast('No round selected to share.');
  const requestedView = (printView || match.printView || document.getElementById('scoreboardPrintViewSelect')?.value || 'summary') === 'scorecard' ? 'scorecard' : 'summary';
  match.printView = requestedView;
  syncScoreboardPrintControls(requestedView);
  persist({ skipRender: true });
  openUnifiedExport(match, requestedView);
}

function normalizeHole(hole, idx) {
  return {
    holeNumber: Number(hole?.holeNumber) || idx + 1,
    yardage: Number(hole?.yardage) || null,
    par: Number(hole?.par) || null,
    strokeIndex: Number(hole?.strokeIndex) || null,
  };
}
function normalizeTee(tee, courseName = '') {
  tee.id = tee.id || uid();
  tee.courseName = tee.courseName || courseName;
  tee.teeName = tee.teeName || 'Tee';
  tee.gender = tee.gender || 'M';
  tee.isCombo = !!tee.isCombo;
  tee.comboSources = Array.isArray(tee.comboSources) ? tee.comboSources.slice(0, 18).map((source, idx) => ({
    holeNumber: idx + 1,
    sourceTeeId: source?.sourceTeeId || ''
  })) : buildDefaultHoles().map(h => ({ holeNumber: h.holeNumber, sourceTeeId: '' }));
  tee.holes = Array.isArray(tee.holes) && tee.holes.length ? tee.holes.map(normalizeHole) : buildDefaultHoles();
  tee.length = Number(tee.length) || sumYardage(tee.holes) || null;
  tee.par = Number(tee.par) || sumPar(tee.holes) || 72;
  tee.rating = Number(tee.rating) || 72;
  tee.slope = Number(tee.slope) || 113;
}

function createEmptyMatch(overrides = {}) {
  const empty = {
    id: overrides.id || uid(),
    date: overrides.date || todayIso(),
    name: overrides.name || 'Round',
    courseId: overrides.courseId || '',
    teeId: overrides.teeId || '',
    format: 'teams',
    allowance: Number(overrides.allowance) || 100,
    holeCount: Number(overrides.holeCount) === 9 ? 9 : 18,
    nineHoleSegment: overrides.nineHoleSegment || 'front',
    customStartHole: Number(overrides.customStartHole) || 1,
    teamCount: Number(overrides.teamCount) || 1,
    playersPerTeam: Number(overrides.playersPerTeam) || 1,
    teamNames: Array.isArray(overrides.teamNames) ? overrides.teamNames : [],
    scoringAccessMode: normalizeScoringAccessMode(overrides.scoringAccessMode || overrides.scoreEntryMode || 'team_codes'),
    scoreEntryMode: getLegacyScoreEntryMode(normalizeScoringAccessMode(overrides.scoringAccessMode || overrides.scoreEntryMode || 'team_codes')),
    officialScorerName: String(overrides.officialScorerName || 'Official scorer').trim() || 'Official scorer',
    statTrackingEnabled: !!overrides.statTrackingEnabled,
    selectedGames: Array.isArray(overrides.selectedGames) ? overrides.selectedGames : [],
    status: 'active',
    completedAt: null,
    players: Array.isArray(overrides.players) ? overrides.players : [],
    greeniesWinners: {},
    storageMode: 'local',
    sharedMatchId: '',
    sharedMatchRef: '',
    cloudSyncState: 'local-only',
    notes: ''
  };
  normalizeMatch(empty);
  return empty;
}

function computeMatchProgress(match) {
  const limit = getRequestedHoleCount(match);
  const players = Array.isArray(match?.players) ? match.players : [];
  const lastTouchedHole = Math.max(0, ...players.flatMap(mp => (Array.isArray(mp.scores) ? mp.scores : []).filter(s => s.gross && Number(s.holeNumber) <= limit).map(s => Number(s.holeNumber) || 0)), 0);
  let lastFullyCompletedHole = 0;
  for (let hole = 1; hole <= limit; hole += 1) {
    const allComplete = players.length > 0 && players.every(mp => Number(mp?.scores?.[hole - 1]?.gross) > 0);
    if (!allComplete) break;
    lastFullyCompletedHole = hole;
  }
  return { lastTouchedHole, lastFullyCompletedHole };
}
function normalizeMatch(match) {
  match.id = match.id || uid();
  match.date = match.date || todayIso();
  match.name = match.name || 'Round';
  match.courseId = match.courseId || '';
  match.teeId = match.teeId || '';
  match.format = match.format || 'teams';
  match.allowance = Number(match.allowance) || 100;
  match.holeCount = getRequestedHoleCount(match);
  match.nineHoleSegment = getNineHoleSegment(match);
  match.customStartHole = Math.max(1, Math.min(10, Number(match.customStartHole) || 1));
  match.status = match.status || 'active';
  match.completedAt = match.completedAt || null;
  match.scoringAccessMode = normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'team_codes');
  match.scoreEntryMode = getLegacyScoreEntryMode(match.scoringAccessMode);
  match.officialScorerName = String(match.officialScorerName || 'Official scorer').trim() || 'Official scorer';
  match.teamNames = Array.isArray(match.teamNames) ? match.teamNames : [];
  match.teamScorers = buildTeamScorerAssignments(Number(match.teamCount) || Math.max(1, match.teamNames.length || 1), match.teamNames, match.teamScorers);
  match.activeScoreRole = match.activeScoreRole || (match.scoringAccessMode === 'team_codes' ? 'team_scorer' : 'official_scorer');
  if (match.scoringAccessMode === 'single_device' && match.activeScoreRole === 'team_scorer') match.activeScoreRole = 'official_scorer';
  match.activeScoreTeam = Math.min(Math.max(1, Number(match.activeScoreTeam) || 1), Math.max(1, Number(match.teamCount) || 1));
  match.statTrackingEnabled = !!match.statTrackingEnabled;
  match.players = Array.isArray(match.players) ? match.players : [];
  match.players = match.players.map((mp, idx) => ({
    playerId: mp.playerId,
    team: Number(mp.team) || 1,
    slot: Number.isFinite(Number(mp.slot)) ? Number(mp.slot) : idx,
    teeId: mp.teeId || match.teeId || '',
    scores: Array.isArray(mp.scores) && mp.scores.length ? mp.scores.map((s, scoreIdx) => ({ holeNumber: scoreIdx + 1, gross: Number(s.gross) || null })) : buildEmptyScores(match.holeCount),
    stats: Array.isArray(mp.stats) && mp.stats.length ? mp.stats.map((s, statIdx) => normalizeHoleStat(s, statIdx)) : buildEmptyStats(match.holeCount),
  }));
  match.greeniesWinners = match.greeniesWinners && typeof match.greeniesWinners === 'object' ? match.greeniesWinners : {};
  match.matchStatusGame = match.matchStatusGame || getDefaultFeaturedGameKey(match.selectedGames || []);
  match.momentumGame = match.momentumGame || match.matchStatusGame || getDefaultFeaturedGameKey(match.selectedGames || []);
  match.storageMode = match.storageMode === 'shared' ? 'shared' : 'local';
  match.sharedMatchId = String(match.sharedMatchId || match.id || '');
  match.cloudSyncState = String(match.cloudSyncState || (match.storageMode === 'shared' ? 'local-cache' : 'local-only'));
  match.lastCloudSyncAt = match.lastCloudSyncAt || null;
  match.sharedOwnerUserId = match.sharedOwnerUserId || null;
  match.sharedMatchRef = match.sharedMatchRef || match.sharedMatchId || match.id;
  const progress = computeMatchProgress(match);
  match.lastTouchedHole = Number(match.lastTouchedHole) || progress.lastTouchedHole;
  match.lastFullyCompletedHole = Number(match.lastFullyCompletedHole) || progress.lastFullyCompletedHole;
}
function normalizeState() {
  state.players = Array.isArray(state.players) ? state.players : [];
  state.courses = Array.isArray(state.courses) ? state.courses : [];
  state.matches = Array.isArray(state.matches) ? state.matches : [];
  state.notes = typeof state.notes === 'string' ? state.notes : '';
  state.sharedMatchIds = Array.isArray(state.sharedMatchIds) ? [...new Set(state.sharedMatchIds.filter(Boolean))] : [];
  state.lastOpenedSharedMatchId = typeof state.lastOpenedSharedMatchId === 'string' && state.lastOpenedSharedMatchId.trim() ? state.lastOpenedSharedMatchId.trim() : null;
  state.players.forEach(p => {
    p.id = p.id || uid();
    p.name = p.name || '';
    p.index = Number(p.index) || 0;
  });
  state.courses.forEach(c => {
    c.id = c.id || uid();
    c.name = c.name || 'Untitled Course';
    c.city = c.city || '';
    c.state = c.state || '';
    c.country = c.country || 'United States of America';
    c.strokeIndexes = getCourseStrokeTemplate(c);
    c.tees = Array.isArray(c.tees) ? c.tees : [];
    c.tees.forEach(t => normalizeTee(t, c.name));
    if (!c.strokeIndexes) {
      const seeded = c.tees.map(t => extractStrokeTemplate(t.holes)).find(Boolean);
      if (seeded) c.strokeIndexes = seeded;
    }
  });
  state.matches.forEach(normalizeMatch);
  if (state.activeMatchId && !state.matches.find(m => m.id === state.activeMatchId)) {
    state.activeMatchId = null;
  }
  if (!state.lastOpenedSharedMatchId) {
    const active = state.matches.find(m => m.id === state.activeMatchId && m.storageMode === 'shared');
    state.lastOpenedSharedMatchId = active?.sharedMatchId || active?.sharedMatchRef || null;
  }
}
function courseHandicap(index, slope, rating, par) {
  return Math.round(Number(index) * (Number(slope) / 113) + (Number(rating) - Number(par)));
}
function playingHandicap(courseHdcp, allowancePct) {
  return Math.round(Number(courseHdcp) * (Number(allowancePct) / 100));
}
function getCourse(courseId) { return state.courses.find(c => c.id === courseId); }
function getTee(courseId, teeId) { return getCourse(courseId)?.tees.find(t => t.id === teeId); }
function getPlayer(playerId) { return state.players.find(p => p.id === playerId); }
function getMatch(matchId = state.activeMatchId) { return state.matches.find(m => m.id === matchId) || null; }
function getActiveMatch() { return getMatch(); }
function completedHoles(match) {
  return Number(match?.lastTouchedHole) || computeMatchProgress(match).lastTouchedHole || 0;
}
function getLastFullyCompletedHole(match) {
  return Number(match?.lastFullyCompletedHole) || computeMatchProgress(match).lastFullyCompletedHole || 0;
}
function holeStrokeAllowanceForPlayer(holeStrokeIndex, playerHandicap, baseHandicap) {
  const diff = Math.max(0, playerHandicap - baseHandicap);
  if (!diff || !holeStrokeIndex) return 0;
  const fullRounds = Math.floor(diff / 18);
  const remainder = diff % 18;
  return fullRounds + (holeStrokeIndex <= remainder ? 1 : 0);
}
function holePostingStrokeAllowance(holeStrokeIndex, playerHandicap) {
  const handicap = Math.max(0, Math.round(Number(playerHandicap) || 0));
  const strokeIndex = Math.round(Number(holeStrokeIndex) || 0);
  if (!handicap || !strokeIndex) return 0;
  const fullRounds = Math.floor(handicap / 18);
  const remainder = handicap % 18;
  return fullRounds + (strokeIndex <= remainder ? 1 : 0);
}
function computeMatchMetrics(match) {
  if (!match) return null;
  const course = getCourse(match.courseId);
  const tee = getTee(match.courseId, match.teeId);
  if (!course || !tee) return null;
  const holeCount = getPlayableHoleCount(match, tee);
  const scoringHoles = getSelectedScoringHoles(match, tee);
  const players = match.players.map(mp => {
    const player = getPlayer(mp.playerId);
    const playerTee = getPlayerTee(match, mp) || tee;
    const courseHdcp = courseHandicap(player?.index || 0, playerTee.slope, playerTee.rating, playerTee.par);
    const playHdcp = playingHandicap(courseHdcp, match.allowance);
    return {
      ...mp,
      player,
      team: Number(mp.team) || 1,
      teeId: getPlayerTeeId(match, mp),
      tee: playerTee,
      courseHdcp,
      playHdcp,
      scores: (mp.scores || []).slice(0, holeCount),
    };
  }).filter(x => x.player);

  if (!players.length) return { players: [], teams: [], holeResults: [], completed: 0, statusText: 'No players' };

  const lowPlaying = Math.min(...players.map(p => p.playHdcp));
  const teamNos = [...new Set(players.map(p => Number(p.team) || 1))].sort((a, b) => a - b);
  const holeResults = scoringHoles.map((hole, idx) => {
    const playerScores = players.map(p => {
      const gross = Number(p.scores[idx]?.gross) || null;
      const playerHole = getPlayerHole(match, p, idx, tee) || hole;
      const playerPar = Number(playerHole?.par) || Number(hole?.par) || 4;
      const strokeIndex = Number(playerHole?.strokeIndex) || Number(hole?.strokeIndex);
      const strokes = holeStrokeAllowanceForPlayer(strokeIndex, p.playHdcp, lowPlaying);
      const postingStrokes = holePostingStrokeAllowance(strokeIndex, p.courseHdcp);
      const postableLimit = playerPar + 2 + postingStrokes;
      const postable = gross ? Math.min(gross, postableLimit) : null;
      const net = gross ? gross - strokes : null;
      return { playerId: p.playerId, team: p.team, gross, net, strokes, par: playerPar, teeId: p.teeId, postingStrokes, postableLimit, postable };
    });
    const completed = playerScores.every(s => s.gross !== null);
    const par = Number(hole.par) || 4;
    let indivBest = null;
    let indivWinners = [];
    if (completed) {
      indivBest = Math.min(...playerScores.map(s => s.net));
      indivWinners = playerScores.filter(s => s.net === indivBest).map(s => s.playerId);
    }
    const teamScores = teamNos.map(teamNo => {
      const teamPlayers = playerScores.filter(s => s.team === teamNo);
      const gross = teamPlayers.reduce((sum, s) => sum + (s.gross || 0), 0);
      const net = teamPlayers.reduce((sum, s) => sum + (s.net || 0), 0);
      return { team: teamNo, gross: teamPlayers.length ? gross : null, net: teamPlayers.length ? net : null };
    }).filter(t => t.gross !== null);
    let teamWinner = null;
    if (completed && teamScores.length === 2) {
      if (teamScores[0].net < teamScores[1].net) teamWinner = teamScores[0].team;
      else if (teamScores[1].net < teamScores[0].net) teamWinner = teamScores[1].team;
      else teamWinner = 0;
    }
    let teamSkinWinner = null;
    if (completed && teamScores.length === 2 && teamScores[0].net !== teamScores[1].net) {
      teamSkinWinner = teamScores[0].net < teamScores[1].net ? teamScores[0].team : teamScores[1].team;
    }
    return {
      holeNumber: hole.holeNumber,
      par,
      completed,
      playerScores,
      indivBest,
      indivWinners,
      teamWinner,
      teamSkinWinner,
      teamScores,
    };
  });

  const playersWithTotals = players.map(p => {
    const scoredHoles = holeResults.filter(h => h.completed).map(h => h.playerScores.find(ps => ps.playerId === p.playerId)).filter(Boolean);
    const grossTotal = scoredHoles.reduce((sum, s) => sum + (s.gross || 0), 0);
    const postableTotal = scoredHoles.reduce((sum, s) => sum + (Number.isFinite(Number(s.postable)) ? Number(s.postable) : (s.gross || 0)), 0);
    const netTotal = scoredHoles.reduce((sum, s) => sum + (s.net || 0), 0);
    const totalPar = scoredHoles.reduce((sum, s) => sum + (Number(s.par) || 0), 0);
    const toPar = grossTotal - totalPar;
    const netDiff = netTotal - totalPar;
    const skins = holeResults.filter(h => h.completed && h.indivWinners.length === 1 && h.indivWinners[0] === p.playerId).length;
    return {
      ...p,
      grossTotal,
      postableTotal,
      netTotal,
      totalPar,
      toPar,
      netDiff,
      skins,
      holesPlayed: scoredHoles.length,
    };
  });

  const teams = teamNos.map(teamNo => {
    const members = playersWithTotals.filter(p => p.team === teamNo);
    if (!members.length) return null;
    const grossTotal = members.reduce((sum, p) => sum + p.grossTotal, 0);
    const netTotal = members.reduce((sum, p) => sum + p.netTotal, 0);
    const totalPar = members.reduce((sum, p) => sum + p.totalPar, 0);
    const skins = holeResults.filter(h => h.completed && h.teamSkinWinner === teamNo).length;
    const split = Math.min(9, holeCount);
    const front = holeResults.slice(0, split).reduce((sum, h) => sum + (h.teamWinner === teamNo ? 1 : h.teamWinner && h.teamWinner !== 0 ? -1 : 0), 0);
    const back = holeCount > 9 ? holeResults.slice(9, holeCount).reduce((sum, h) => sum + (h.teamWinner === teamNo ? 1 : h.teamWinner && h.teamWinner !== 0 ? -1 : 0), 0) : 0;
    const overall = holeResults.reduce((sum, h) => sum + (h.teamWinner === teamNo ? 1 : h.teamWinner && h.teamWinner !== 0 ? -1 : 0), 0);
    return {
      team: teamNo,
      members,
      grossTotal,
      netTotal,
      totalPar,
      toPar: grossTotal - totalPar,
      netDiff: netTotal - totalPar,
      skins,
      front,
      back,
      overall,
    };
  }).filter(Boolean);

  const completed = holeResults.filter(h => h.completed).length;
  const bestPlayerNet = playersWithTotals.slice().sort((a, b) => a.netDiff - b.netDiff || a.grossTotal - b.grossTotal)[0];
  const bestTeam = teams.slice().sort((a, b) => a.netDiff - b.netDiff || a.grossTotal - b.grossTotal)[0];
  const matchDiff = holeResults.reduce((sum, h) => sum + (h.teamWinner === 1 ? 1 : h.teamWinner === 2 ? -1 : 0), 0);

  return {
    course,
    tee,
    players: playersWithTotals,
    teams,
    holeResults,
    completed,
    lowPlaying,
    bestPlayerNet,
    bestTeam,
    matchDiff,
    holeCount,
  };
}

function renderSetupHandicapPreview() {
  const wrap = document.getElementById('setupHandicapPreview');
  if (!wrap) return;
  let courseId = document.getElementById('matchCourseSelect')?.value || '';
  let teeId = document.getElementById('matchTeeSelect')?.value || '';
  const allowance = Number(document.querySelector('#matchForm [name="allowance"]')?.value || 100) || 100;
  const teamNames = Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value || '');
  const draftSelections = Array.isArray(uiState.matchPlayerDraft) ? uiState.matchPlayerDraft : [];
  const selected = Array.from({ length: Math.max(document.querySelectorAll('[data-player-slot]').length, draftSelections.length) }, (_, idx) => {
    const draftRow = draftSelections.find(row => Number(row?.slot) === idx) || draftSelections[idx] || {};
    const slotEl = document.querySelector(`[data-player-slot="${idx}"]`);
    return {
      playerId: String(slotEl?.value || draftRow.playerId || ''),
      team: Number(slotEl?.dataset.slotTeam || draftRow.team || 1) || 1,
      slot: idx,
      teeId: String(document.querySelector(`[data-player-tee-slot="${idx}"]`)?.value || draftRow.teeId || teeId || ''),
    };
  }).filter(p => p.playerId);
  const fallbackMatch = editingMatchId ? getMatch(editingMatchId) : getActiveMatch();
  if ((!courseId || !selected.length) && fallbackMatch) {
    courseId = courseId || fallbackMatch.courseId || '';
  }
  teeId = teeId || selected.find(sp => sp.teeId)?.teeId || fallbackMatch?.teeId || '';
  const course = getCourse(courseId);
  const tee = getTee(courseId, teeId);
  if (!course || !tee) {
    wrap.innerHTML = '<div class="tiny">Select a course and each player tee to preview course handicaps and strokes received.</div>';
    return;
  }
  if (!selected.length) {
    wrap.innerHTML = '<div class="tiny">Select at least one player to preview course handicap, playing handicap, and strokes received.</div>';
    return;
  }
  const enriched = selected.map(sp => {
    const player = getPlayer(sp.playerId);
    const playerTee = getTee(courseId, sp.teeId || teeId) || tee;
    if (!player || !playerTee) return null;
    const playerIndex = Number(player.index) || 0;
    const ch = courseHandicap(playerIndex, playerTee.slope, playerTee.rating, playerTee.par);
    const ph = playingHandicap(ch, allowance);
    return { player, playerIndex, team: sp.team, tee: playerTee, courseHdcp: ch, playHdcp: ph };
  }).filter(Boolean);
  if (!enriched.length) {
    wrap.innerHTML = '<div class="tiny">No valid players selected.</div>';
    return;
  }
  const lowPlaying = Math.min(...enriched.map(p => p.playHdcp));
  wrap.innerHTML = `
    <div class="tiny">${escapeHtml(course.name)} · ${escapeHtml(getHoleSegmentLabel({ holeCount: Number(document.querySelector('#matchForm [name="holeCount"]')?.value || 18), nineHoleSegment: document.getElementById('nineHoleSegmentSelect')?.value || 'front', customStartHole: Number(document.getElementById('customNineHoleStartSelect')?.value || 1) }, tee))} · Allowance ${allowance}% · Strokes received are versus the low playing handicap in the match.</div>
    <div class="handicap-preview-grid top-gap">${enriched.map(row => {
      const teamLabel = getTeamLabel({ teamNames }, row.team);
      const strokes = Math.max(0, row.playHdcp - lowPlaying);
      return `<div class="handicap-preview-cardline">
        <div class="handicap-preview-name">${escapeHtml(row.player.name)} <span class="tiny">· ${escapeHtml(teamLabel)}</span></div>
        <div class="handicap-preview-meta">
          <div><span class="tiny">Tee</span><strong>${escapeHtml(row.tee?.teeName || tee.teeName)}</strong></div>
          <div><span class="tiny">Index</span><strong>${Number(row.playerIndex || 0).toFixed(1)}</strong></div>
          <div><span class="tiny">Course HCP</span><strong>${row.courseHdcp}</strong></div>
          <div><span class="tiny">Playing</span><strong>${row.playHdcp}</strong></div>
          <div><span class="tiny">Gets</span><strong>${strokes}</strong></div>
        </div>
      </div>`;
    }).join('')}</div>`;
}


function describeTeamLabel(match, teamNo, metrics) {
  const name = match.teamNames?.[teamNo - 1] || `Team ${teamNo}`;
  const members = metrics.teams.find(t => t.team === teamNo)?.members?.map(m => m.player.name).join(', ');
  return members ? `${escapeHtml(name)} (${escapeHtml(members)})` : escapeHtml(name);
}

function computeTeamGameDiffs(match, metrics, gameKey) {
  const holes = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  let front = 0, back = 0, overall = 0;
  holes.forEach((h, idx) => {
    const outcome = computeMomentumOutcome(match, metrics, h, gameKey);
    const step = outcome === 'team1' ? 1 : outcome === 'team2' ? -1 : 0;
    overall += step;
    if (idx < 9) front += step;
    else back += step;
  });
  return { front, back, overall };
}

function formatTeamGameStatus(match, metrics, diff) {
  if (!metrics || metrics.teams?.length !== 2) return '—';
  if (!Number.isFinite(diff) || diff === 0) return 'AS';
  return diff > 0
    ? `${describeTeamLabel(match, 1, metrics)} ${Math.abs(diff)} up`
    : `${describeTeamLabel(match, 2, metrics)} ${Math.abs(diff)} up`;
}
function formatMatchStatusMarkup(statusText, opts = {}) {
  const raw = String(statusText || '—').trim();
  const escaped = escapeHtml(raw);
  if (!opts.forceScoreLast) return escaped;
  if (raw === 'AS' || raw === '—') {
    return `<span class="match-status-stack"><span class="match-status-scoreline">${escaped}</span></span>`;
  }
  const m = raw.match(/^(.*?)(\s+((?:\d+\s+(?:up|down))|AS))$/i);
  if (!m) return escaped;
  return `<span class="match-status-stack"><span class="match-status-name">${escapeHtml(m[1].trim())}</span><span class="match-status-scoreline">${escapeHtml(m[3].trim())}</span></span>`;
}

function getIndividualMatchPairings(match, metrics) {
  if (!match || !metrics) return [];
  const allHoles = Array.isArray(metrics.holeResults) ? metrics.holeResults : [];
  const totalPlayableHoles = Math.min(getPlayableHoleCount(match, metrics.tee), allHoles.length || 18);
  const holes = allHoles.slice(0, totalPlayableHoles || allHoles.length);
  const configured = getSideMatchConfigs(match);
  if (!configured.length) return [];
  return configured.map((row, idx) => {
    const pa = metrics.players.find(p => p.playerId === row.playerAId);
    const pb = metrics.players.find(p => p.playerId === row.playerBId);
    if (!pa || !pb) return null;
    const game = String(row.game || 'nassau').toLowerCase();
    const useNet = String(row.basis || 'net').toLowerCase() !== 'gross';
    const sideLowPlaying = Math.min(Number(pa.playHdcp) || 0, Number(pb.playHdcp) || 0);
    const isNineHoleSideNassau = game === 'nassau' && totalPlayableHoles <= 9;
    let matchDiff = 0;
    let front = 0;
    let back = 0;
    let totalA = 0;
    let totalB = 0;
    let completedCount = 0;
    const frontSpan = totalPlayableHoles <= 9 ? totalPlayableHoles : 9;
    holes.forEach((hole, holeIdx) => {
      const scoreAObj = hole.playerScores.find(ps => ps.playerId === pa.playerId);
      const scoreBObj = hole.playerScores.find(ps => ps.playerId === pb.playerId);
      const grossA = Number(scoreAObj?.gross) || null;
      const grossB = Number(scoreBObj?.gross) || null;
      if (!grossA || !grossB) return;
      const scoreA = useNet ? getSideMatchNetHoleScore(match, holeIdx, pa, sideLowPlaying, hole) : grossA;
      const scoreB = useNet ? getSideMatchNetHoleScore(match, holeIdx, pb, sideLowPlaying, hole) : grossB;
      if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return;
      completedCount += 1;
      if (game === 'stroke_play') {
        totalA += scoreA;
        totalB += scoreB;
        return;
      }
      const isFrontSegmentHole = holeIdx < frontSpan;
      if (scoreA < scoreB) {
        matchDiff += 1;
        if (isFrontSegmentHole) front += 1; else back += 1;
      } else if (scoreB < scoreA) {
        matchDiff -= 1;
        if (isFrontSegmentHole) front -= 1; else back -= 1;
      }
    });
    const diff = game === 'stroke_play'
      ? (totalA === totalB ? 0 : (totalA < totalB ? totalB - totalA : -(totalA - totalB)))
      : matchDiff;
    const leaderName = diff === 0 ? '' : (diff > 0 ? pa.player.name : pb.player.name);
    const frontStatus = front === 0 ? 'AS' : `${front > 0 ? pa.player.name : pb.player.name} ${Math.abs(front)} up`;
    const backStatus = back === 0 ? 'AS' : `${back > 0 ? pa.player.name : pb.player.name} ${Math.abs(back)} up`;
    const overallStatus = diff === 0 ? 'AS' : `${leaderName} ${Math.abs(diff)} ${game === 'stroke_play' ? 'stroke' + (Math.abs(diff) === 1 ? '' : 's') : 'up'}`;
    const status = game === 'nassau'
      ? (isNineHoleSideNassau ? `9-hole ${frontStatus}` : `Front ${frontStatus} · Back ${backStatus} · 18 ${overallStatus.replace(/ stroke(s)?$/, ' up')}`)
      : game === 'stroke_play'
        ? (diff === 0 ? 'Tied' : `${leaderName} leads by ${Math.abs(diff)} stroke${Math.abs(diff) === 1 ? '' : 's'}`)
        : (diff === 0 ? 'AS' : `${leaderName} ${Math.abs(diff)} up`);
    return {
      id: row.id || `side_${idx + 1}`,
      label: `${pa.player.name} vs ${pb.player.name}`,
      team1Player: pa,
      team2Player: pb,
      playerA: pa,
      playerB: pb,
      diff,
      front,
      back,
      totalA,
      totalB,
      game,
      basis: row.basis,
      stake: Number(row.stake) || 0,
      leaderName,
      completedCount,
      sideLowPlaying,
      totalPlayableHoles,
      isNineHoleSideNassau,
      status
    };
  }).filter(Boolean);
}



function getMatchStatusOptions(match) {
  const selected = getOrderedSelectedGames(match);
  if (!selected.length) return [];
  return selected.map(g => ({ key: g.key, label: getGameLabel(g.key) }));
}

function describeMomentumMeta(match, metrics, gameKey) {
  const cfg = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  const perspectiveTeam = getMomentumPerspectiveTeam(match);
  const teamName = getTeamName(match, perspectiveTeam);
  const members = metrics?.teams?.find(t => t.team === perspectiveTeam)?.members?.map(m => m.player.name).join(', ') || '';
  const basis = cfg.key === 'team_stroke'
    ? `${formatBasisLabel(cfg.basis)} · ${formatScoringModeLabel(cfg.scoringMode)}`
    : formatBasisLabel(cfg.basis, gameKey === 'greenies' ? 'Event' : 'Net');
  const gameLabel = getGameLabel(gameKey) || 'Momentum';
  const memberText = members ? ` · ${members}` : '';
  return `${escapeHtml(gameLabel)} · ${escapeHtml(teamName)} perspective${memberText} · ${escapeHtml(basis)}`;
}

function buildFeaturedMatchStatus(match, metrics, gameKey) {
  const cfg = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  const title = getFeaturedGameLabel(match, gameKey);
  const courseLine = `${escapeHtml(metrics?.course?.name || 'No course')} · ${escapeHtml(metrics?.tee?.teeName || 'No tee')}`;
  if (gameKey === 'team_stroke' && metrics.teams.length >= 2) {
    const stroke = getTeamStrokeScoreboardData(match, metrics, cfg);
    const items = stroke.rows.length
      ? stroke.rows.slice(0, 2).map(row => ({
          label: `${getTeamLabel(match, row.team)} (${formatBasisLabel(stroke.basis)} · ${formatScoringModeLabel(stroke.scoringMode)})`,
          value: `${row.total}`,
        }))
      : [{ label: 'Status', value: 'No scores yet' }];
    const resultText = !stroke.leader
      ? 'No scores yet'
      : stroke.tie
        ? `Tied at ${stroke.leader.total}`
        : `${describeTeamLabel(match, stroke.leader.team, metrics)} by ${stroke.margin} stroke${stroke.margin === 1 ? '' : 's'}`;
    items.push({ label: 'Result', value: resultText });
    return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid">${items.map(item => `<div class="match-status-tile"><div class="tiny">${escapeHtml(item.label)}</div><div class="match-status-value">${escapeHtml(item.value)}</div></div>`).join('')}</div>`;
  }
  if (['nassau', 'team_match'].includes(gameKey) && metrics.teams.length === 2) {
    const diffs = computeTeamGameDiffs(match, metrics, gameKey);
    const holeCount = getPlayableHoleCount(match, metrics.tee);
    const overallTeam = formatTeamGameStatus(match, metrics, diffs.overall);
    let items;
    if (holeCount <= 9) {
      items = [
        { label: 'Format', value: `${holeCount} Holes` },
        { label: 'Played', value: `${metrics.completed}/${holeCount}` },
        { label: 'Overall', value: overallTeam },
      ];
    } else {
      const frontStatus = formatTeamGameStatus(match, metrics, diffs.front);
      const backStatus = formatTeamGameStatus(match, metrics, diffs.back);
      items = [
        { label: 'Front 9', value: frontStatus },
        { label: 'Back 9', value: backStatus },
        { label: gameKey === 'nassau' ? 'Overall 18' : 'Overall', value: overallTeam },
      ];
    }
    return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid">${items.map(item => `<div class="match-status-tile"><div class="tiny">${escapeHtml(item.label)}</div><div class="match-status-value">${formatMatchStatusMarkup(item.value, { forceScoreLast: gameKey === 'nassau' })}</div></div>`).join('')}</div>`;
  }
  if (gameKey === 'individual_match') {
    const pairings = getIndividualMatchPairings(match, metrics);
    if (!pairings.length) {
      return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-tile"><div class="tiny">Status</div><div class="match-status-value">Select side-match players in setup</div></div>`;
    }
    return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid">${pairings.map(p => `<div class="match-status-tile"><div class="tiny">${escapeHtml(p.label)} · ${escapeHtml(p.isNineHoleSideNassau ? 'Nassau (9 Holes)' : getSideMatchGameLabel(p.game))} · ${escapeHtml(formatBasisLabel(p.basis))}</div><div class="match-status-value">${escapeHtml(p.status)}</div></div>`).join('')}</div>`;
  }
  if (gameKey === 'skins') {
    const basis = formatBasisLabel(cfg.basis);
    const skins = computeSkinResults(match, metrics, cfg);
    if (cfg.skinsType === 'team') {
      const max = Math.max(0, ...Object.values(skins.counts));
      const leaders = Object.entries(skins.counts).filter(([,n]) => n === max && max > 0).map(([team,n]) => `${escapeHtml(getTeamLabel(match, Number(team)))} (${n})`).join(', ');
      const holes = skins.winnersByHole.map(h => `H${h.holeNumber}: ${escapeHtml(getTeamLabel(match, h.winner))}`).join(' · ');
      return `<div class="match-status-head"><strong>${escapeHtml(getGameLabel(gameKey))} (Team · ${escapeHtml(basis)})</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid"><div class="match-status-tile"><div class="tiny">Leader</div><div class="match-status-value">${leaders || 'None yet'}</div></div><div class="match-status-tile"><div class="tiny">Won on</div><div class="match-status-value">${holes || '—'}</div></div></div>`;
    }
    const max = Math.max(0, ...Object.values(skins.counts));
    const leaders = Object.entries(skins.counts).filter(([,n]) => n === max && max > 0).map(([id,n]) => `${escapeHtml(getPlayer(id)?.name || 'Unknown')} (${n})`).join(', ');
    const holes = skins.winnersByHole.map(h => `H${h.holeNumber}: ${escapeHtml(getPlayer(h.winner)?.name || 'Unknown')}`).join(' · ');
    return `<div class="match-status-head"><strong>${escapeHtml(getGameLabel(gameKey))} (Individual · ${escapeHtml(basis)})</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid"><div class="match-status-tile"><div class="tiny">Leader</div><div class="match-status-value">${leaders || 'None yet'}</div></div><div class="match-status-tile"><div class="tiny">Won on</div><div class="match-status-value">${holes || '—'}</div></div></div>`;
  }
  if (gameKey === 'greenies') {
    const greenies = getGreeniesResults(match, metrics, cfg);
    const max = Math.max(0, ...Object.values(greenies.counts));
    const leaders = Object.entries(greenies.counts).filter(([,n]) => n === max && max > 0).map(([id,n]) => `${escapeHtml(getPlayer(id)?.name || 'Unknown')} (${n})`).join(', ');
    const holes = greenies.winnersByHole.map(h => `H${h.holeNumber}: ${escapeHtml(getPlayer(h.winner)?.name || 'Unknown')}`).join(' · ');
    return `<div class="match-status-head"><strong>Greenies</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid"><div class="match-status-tile"><div class="tiny">Participants</div><div class="match-status-value">${(cfg.participants || []).length || 0}</div></div><div class="match-status-tile"><div class="tiny">Leader(s)</div><div class="match-status-value">${leaders || 'None yet'}</div></div><div class="match-status-tile"><div class="tiny">Won on</div><div class="match-status-value">${holes || '—'}</div></div></div>`;
  }
  if (gameKey === 'nine_point') {
    const nine = computeNinePointResults(match, metrics, cfg);
    const leaders = nine.leaderboard.map(row => `${escapeHtml(row.name)} (${row.total})`).join(' · ');
    return `<div class="match-status-head"><strong>9-Point Game</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid"><div class="match-status-tile"><div class="tiny">Basis</div><div class="match-status-value">${escapeHtml(formatBasisLabel(nine.basis || cfg.basis))}</div></div><div class="match-status-tile"><div class="tiny">Leaders</div><div class="match-status-value">${leaders || 'Select 3 players'}</div></div><div class="match-status-tile"><div class="tiny">$ / point</div><div class="match-status-value">${formatMoneyAccounting(nine.stakePerPoint || cfg.stakePerPoint || 0)}</div></div></div><div class="nine-point-settlement-note top-gap">Hole scoring remains 9 points per hole. Payouts settle final point differentials head-to-head × the stake.</div>`;
  }
  return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-tile"><div class="tiny">Status</div><div class="match-status-value">Live</div></div>`;
}

function buildClassicScorecard(match, metrics) {
  const tee = metrics?.tee;
  if (!tee) return '<div class="tiny">No scorecard available.</div>';
  const holeCount = getPlayableHoleCount(match, tee);
  const holes = getSelectedScoringHoles(match, tee);
  const front = holes.slice(0, Math.min(9, holeCount));
  const back = holeCount > 9 ? holes.slice(9, holeCount) : [];
  const holeHeader = holes.map(h => `<th>H${h.holeNumber}</th>`).join('');
  const sum = arr => arr.reduce((s,h)=>s+(Number(h)||0),0);
  const totalColumns = holeCount > 9 ? '<th>Out</th><th>In</th><th>Total</th>' : '<th>Out</th><th>Total</th>';
  const scorecardMetaRow = (label, extractor) => {
    const holeValues = holes.map(h => extractor(h));
    const outTotal = sum(front.map(extractor));
    const inTotal = back.length ? sum(back.map(extractor)) : null;
    const total = sum(holes.map(extractor));
    return `<tr><td class="scorecard-sticky-name"><strong>${label}</strong></td><td class="scorecard-sticky-team">Course</td>${holeValues.map(v => `<td>${v ?? '—'}</td>`).join('')}<td><strong>${outTotal || '—'}</strong></td>${back.length ? `<td><strong>${inTotal || '—'}</strong></td>` : ''}<td><strong>${total || '—'}</strong></td></tr>`;
  };
  const yardageRow = scorecardMetaRow('Yds', h => formatYardageValue(h.yardage));
  const parRow = scorecardMetaRow('Par', h => Number(h.par) || 0);
  const siRow = scorecardMetaRow('Handicap', h => Number(h.strokeIndex) || 0);
  const dotMarkup = count => count > 0 ? `<span class="score-dots">${'•'.repeat(Math.min(count,3))}${count>3?`<sup>${count}</sup>`:''}</span>` : '';
  const playerRows = metrics.players.map(p => {
    const playerScores = (p.scores || []).slice(0, holeCount);
    const frontGross = playerScores.slice(0, Math.min(9, holeCount)).reduce((s,x)=>s+(Number(x.gross)||0),0);
    const backGross = holeCount > 9 ? playerScores.slice(9, holeCount).reduce((s,x)=>s+(Number(x.gross)||0),0) : 0;
    const frontNetValues = front.map((hole, idx) => {
      const gross = Number(playerScores[idx]?.gross) || null;
      const playerHole = getPlayerHole(match, p, idx, tee) || hole;
      const strokes = holeStrokeAllowanceForPlayer(playerHole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      return gross ? gross - strokes : null;
    });
    const backNetValues = back.map((hole, idx) => {
      const scoreIdx = idx + front.length;
      const gross = Number(playerScores[scoreIdx]?.gross) || null;
      const playerHole = getPlayerHole(match, p, scoreIdx, tee) || hole;
      const strokes = holeStrokeAllowanceForPlayer(playerHole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      return gross ? gross - strokes : null;
    });
    const frontNet = frontNetValues.reduce((s,v)=>s+(Number(v)||0),0);
    const backNet = backNetValues.reduce((s,v)=>s+(Number(v)||0),0);
    const cells = holes.map((hole, idx) => {
      const gross = Number(playerScores[idx]?.gross) || null;
      const playerHole = getPlayerHole(match, p, idx, tee) || hole;
      const strokes = holeStrokeAllowanceForPlayer(playerHole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      const editAttrs = `data-scorecard-edit="1" data-edit-hole="${idx + 1}" data-edit-player="${p.playerId}" title="Edit ${escapeHtml(p.player.name)} on hole ${hole.holeNumber}"`;
      if (!gross) return `<td class="score-hole-cell editable-scorecard-cell" ${editAttrs}><div class="score-main">${formatGolfScoreMarkup(null, hole.par, 'gross')}</div><div class="score-sub">${formatGolfScoreMarkup(null, hole.par, 'net')}${dotMarkup(strokes)}</div></td>`;
      const net = gross - strokes;
      return `<td class="score-hole-cell editable-scorecard-cell" ${editAttrs}><div class="score-main">${formatGolfScoreMarkup(gross, hole.par, 'gross')}</div><div class="score-sub">${formatGolfScoreMarkup(net, hole.par, 'net')}${dotMarkup(strokes)}</div></td>`;
    }).join('');
    const totals = back.length
      ? `<td><strong>${frontGross}</strong><div class="score-sub total-sub">${frontNet || '—'}</div></td><td><strong>${backGross}</strong><div class="score-sub total-sub">${backNet || '—'}</div></td><td><strong>${p.grossTotal || 0}</strong><div class="score-sub total-sub">${p.netTotal || 0}</div></td>`
      : `<td><strong>${frontGross}</strong><div class="score-sub total-sub">${frontNet || '—'}</div></td><td><strong>${p.grossTotal || 0}</strong><div class="score-sub total-sub">${p.netTotal || 0}</div></td>`;
    const playerTeeName = p.tee?.teeName || tee?.teeName || 'Tee';
    return `<tr><td class="scorecard-sticky-name"><strong>${escapeHtml(p.player.name)}</strong><div class="tiny">Tee: ${escapeHtml(playerTeeName)}</div></td><td class="scorecard-sticky-team">${escapeHtml(getTeamLabel(match,p.team))}</td>${cells}${totals}</tr>`;
  }).join('');
  const teeLegend = metrics.players.map(p => `${p.player.name}: ${p.tee?.teeName || tee?.teeName || 'Tee'}`).join(' · ');
  return `<div class="scorecard-sub tiny">Per-hole cells show gross on top and net below, with notation wrapped around the score and dots for strokes received. Course rows include yardage, par, and handicap. Player tees: ${escapeHtml(teeLegend)}</div><div class="scorecard-wrap"><table class="scorecard-table"><thead><tr><th class="scorecard-sticky-name">Player</th><th class="scorecard-sticky-team">Team</th>${holeHeader}${totalColumns}</tr></thead><tbody>${yardageRow}${parRow}${siRow}${playerRows}</tbody></table></div>`;
}


function isCompactTeamPayoutViewport() {
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 0);
  return viewportWidth > 0 && viewportWidth <= 760;
}


function getTeamPayoutMobileWindowSize() {
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 0);
  if (viewportWidth && viewportWidth <= 430) return 2;
  return 3;
}

function shortenTeamPayoutGameLabel(label, index, used = new Set()) {
  const original = String(label || '').trim() || `Game ${index + 1}`;
  let short = original
    .replace(/Nassau\s*\((front|back|overall)\)/i, (_, part) => `Nassau ${part.charAt(0).toUpperCase()}`)
    .replace(/\bFront\b/i, 'F')
    .replace(/\bBack\b/i, 'B')
    .replace(/\bOverall\b/i, 'Ov')
    .replace(/\bBest Ball\b/i, 'BB')
    .replace(/\bMatch Play\b/i, 'Match')
    .replace(/\bStroke Play\b/i, 'Stroke')
    .replace(/\bContest\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (short.length > 12) short = short.slice(0, 11).trimEnd();
  if (!short) short = `G${index + 1}`;
  let candidate = short;
  if (used.has(candidate)) candidate = `${candidate} (${index + 1})`;
  if (candidate.length > 14) candidate = `G${index + 1}`;
  used.add(candidate);
  return { short: candidate, full: original };
}

function getTeamPayoutMobileWindows(matchId, section) {
  const windowSize = getTeamPayoutMobileWindowSize();
  const used = new Set();
  const games = section.games.map((game, index) => ({
    ...game,
    mobileLabel: shortenTeamPayoutGameLabel(game.label, index, used),
    mobileKey: `${section.key}-${index}`,
  }));
  const windows = [];
  for (let start = 0; start < games.length; start += windowSize) {
    windows.push(games.slice(start, start + windowSize));
  }
  if (!windows.length) windows.push([]);
  const active = Math.max(0, Math.min(Number(uiState.teamPayoutMobileWindowByMatch[matchId] || 0), windows.length - 1));
  return { games, windows, active };
}

function buildTeamPayoutMobileMatrix(match, section, players, totals) {
  const matchId = match?.id || 'active';
  const { windows, active } = getTeamPayoutMobileWindows(matchId, section);
  const visibleGames = windows[active] || [];
  const legendKey = uiState.teamPayoutMobileOpenHeaderKey || '';
  const legendGame = visibleGames.find(game => game.mobileKey === legendKey) || null;
  const legendText = legendGame
    ? escapeHtml(legendGame.mobileLabel.full)
    : 'Tap a game header to see the full game name.';
  const windowButtons = windows.map((games, index) => {
    const summary = games.map(game => game.mobileLabel.short).join(' · ') || `Games ${index + 1}`;
    return `<button type="button" class="team-payout-window-chip ${index === active ? 'active' : ''}" data-team-payout-window="${index}" aria-pressed="${index === active ? 'true' : 'false'}" title="${escapeHtml(games.map(game => game.mobileLabel.full).join(' • '))}">${escapeHtml(summary)}</button>`;
  }).join('');
  const headerCells = visibleGames.map(game => {
    const isOpen = legendKey === game.mobileKey;
    return `<th class="team-payout-mobile-game-head"><button type="button" class="team-payout-header-button ${isOpen ? 'active' : ''}" data-team-payout-header-full="${escapeHtml(game.mobileLabel.full)}" data-team-payout-header-key="${game.mobileKey}" aria-expanded="${isOpen ? 'true' : 'false'}">${escapeHtml(game.mobileLabel.short)}</button></th>`;
  }).join('');
  const bodyRows = players.map(player => {
    const gameCells = visibleGames.map(game => {
      const amount = game.amounts[player.id] || 0;
      const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
      const text = Math.abs(amount) > 0.0001 ? formatMoneyAccounting(amount) : '—';
      return `<td class="team-payout-mobile-game-cell ${cls}">${text}</td>`;
    }).join('');
    return `<tr><th scope="row" class="team-payout-mobile-player-cell"><strong>${escapeHtml(player.name)}</strong></th>${gameCells}</tr>`;
  }).join('');
  const columnFoot = visibleGames.map(game => {
    const colTotal = players.reduce((sum, player) => sum + (game.amounts[player.id] || 0), 0);
    const cls = Math.abs(colTotal) <= 0.0001 ? '' : (colTotal > 0 ? 'payout-total-positive' : 'payout-total-negative');
    return `<td class="team-payout-mobile-game-cell ${cls}"><strong>${formatMoneyAccounting(colTotal)}</strong></td>`;
  }).join('');
  const visibleCount = Math.max(1, visibleGames.length || 1);
  const colgroup = `<colgroup><col class="team-payout-col-player">${visibleGames.map(() => '<col class="team-payout-col-game">').join('')}</colgroup>`;
  return `
    <div class="team-payout-mobile-matrix" data-team-payout-mobile style="--team-payout-visible-games:${visibleCount};">
      <div class="team-payout-mobile-topline">
        <div class="team-payout-mobile-topline-label">View</div>
        <div class="team-payout-window-chips" role="tablist" aria-label="Visible team payout games">${windowButtons}</div>
      </div>
      <div class="team-payout-mobile-legend ${legendGame ? 'is-open' : ''}" aria-live="polite">${legendText}</div>
      <div class="payout-table-wrap team-payout-mobile-wrap">
        <table class="payout-game-table team-payout-mobile-table">
          ${colgroup}
          <thead><tr><th class="team-payout-mobile-player-head">Player</th>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
          <tfoot><tr><th scope="row" class="team-payout-mobile-player-cell"><strong>Total</strong></th>${columnFoot}</tr></tfoot>
        </table>
      </div>
    </div>`;
}
function buildResponsiveSettlementTable(settlements) {
  const rows = settlements.length
    ? settlements.map(row => `
      <tr>
        <td class="settlement-from-cell"><span class="settlement-name">${escapeHtml(getPlayer(row.from)?.name || 'Unknown')}</span></td>
        <td class="settlement-to-cell"><span class="settlement-name">${escapeHtml(getPlayer(row.to)?.name || 'Unknown')}</span></td>
        <td class="settlement-amount-cell"><strong>${formatMoneyAccounting(row.amount)}</strong></td>
      </tr>`).join('')
    : '<tr><td colspan="3">No payouts due right now.</td></tr>';
  return `
    <div class="payout-table-wrap top-gap settlement-table-wrap">
      <table class="settlement-table settlement-table-responsive">
        <colgroup>
          <col class="settlement-col-from">
          <col class="settlement-col-to">
          <col class="settlement-col-amount">
        </colgroup>
        <thead><tr><th>From</th><th>To</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildSettleUpList(settlements) {
  if (!settlements.length) return '<div class="tiny">No payments needed.</div>';
  return `<div class="settle-up-list">${settlements.map(row => `
    <div class="settle-up-row">
      <div class="settle-up-route"><strong>${escapeHtml(getPlayer(row.from)?.name || 'Unknown')}</strong><span aria-hidden="true">→</span><strong>${escapeHtml(getPlayer(row.to)?.name || 'Unknown')}</strong></div>
      <div class="settle-up-amount"><strong>${formatMoneyAccounting(row.amount)}</strong></div>
    </div>`).join('')}</div>`;
}

function buildFinalNetSettlementSection(players, totals) {
  const rows = players.map(player => {
    const amount = totals[player.id] || 0;
    const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
    return `
      <div class="final-net-settlement-row">
        <div class="final-net-settlement-player"><strong>${escapeHtml(player.name)}</strong></div>
        <div class="final-net-settlement-amount ${cls}"><strong>${formatFinalNetSettlementMoney(amount)}</strong></div>
      </div>`;
  }).join('');
  const crossFoot = players.reduce((sum, player) => sum + (totals[player.id] || 0), 0);
  const crossFootClass = Math.abs(crossFoot) <= 0.0001 ? '' : 'payout-total-negative';
  const settlements = optimalSettlementRows(totals || {});
  return `
    <div class="final-net-settlement-card top-gap">
      <div class="payout-settlement-head"><strong>Final Net Settlement</strong></div>
      <div class="final-net-settlement-list">${rows}</div>
      <div class="final-net-settlement-crossfoot ${crossFootClass}">Cross-foot: ${formatMoneyAccounting(crossFoot)}</div>
      <div class="settle-up-card">
        <div class="payout-settlement-head"><strong>Settle Up</strong></div>
        <div class="tiny">Minimum payments needed to settle all games.</div>
        ${buildSettleUpList(settlements)}
      </div>
    </div>`;
}

function buildNetPayoutSummary(match, metrics) {
  const selected = getOrderedSelectedGames(match);
  if (!selected.length) return '<div><strong>Net payout (live):</strong> No gambling games selected.</div>';
  const games = computeLivePayoutGames(match, metrics);
  const players = metrics.players.map(p => ({ id: p.playerId, name: p.player.name }));
  const finalTotals = {};
  games.forEach(game => addAmounts(finalTotals, game.amounts));
  const sections = [
    { key: 'team', title: 'Team games payout', intro: 'Team-format games only. Side matches are tracked separately below.', games: games.filter(game => game.group !== 'side') },
    { key: 'side', title: 'Side games payout', intro: 'Separate player side games, kept outside the team payout total.', games: games.filter(game => game.group === 'side') },
  ].filter(section => section.games.length);
  if (!sections.length) return '<div><strong>Net payout (live):</strong> No payout-producing games selected.</div>';

  const renderSection = (section) => {
    const totals = {};
    section.games.forEach(game => addAmounts(totals, game.amounts));
    const headerCells = section.games.map(game => `<th>${escapeHtml(game.label)}</th>`).join('');
    const valueRows = players.map(player => {
      const gameCells = section.games.map(game => {
        const amount = game.amounts[player.id] || 0;
        const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
        const text = Math.abs(amount) > 0.0001 ? formatMoneyAccounting(amount) : '—';
        return `<td class="${cls}">${text}</td>`;
      }).join('');
      return `<tr>${gameCells}</tr>`;
    }).join('');
    const playerRows = players.map(player => (
      `<tr><td class="payout-player-col"><strong>${escapeHtml(player.name)}</strong></td></tr>`
    )).join('');
    const columnFoot = section.games.map(game => {
      const colTotal = players.reduce((sum, player) => sum + (game.amounts[player.id] || 0), 0);
      const cls = Math.abs(colTotal) <= 0.0001 ? '' : (colTotal > 0 ? 'payout-total-positive' : 'payout-total-negative');
      return `<td class="${cls}"><strong>${formatMoneyAccounting(colTotal)}</strong></td>`;
    }).join('');
    const settlements = optimalSettlementRows(totals);
    const settlementTableHtml = buildResponsiveSettlementTable(settlements);
    const useMobileTeamCards = section.key === 'team' && isCompactTeamPayoutViewport();
    const payoutTableHtml = section.key === 'team'
      ? (useMobileTeamCards
        ? buildTeamPayoutMobileMatrix(match, section, players, totals)
        : `
        <div class="team-payout-split" role="group" aria-label="${escapeHtml(section.title)}">
          <div class="team-payout-fixed-pane">
            <table class="payout-game-table payout-game-table-fixed team-payout-fixed-table" aria-hidden="true">
              <colgroup><col class="team-payout-col-player-desktop"></colgroup>
              <thead>
                <tr><th class="payout-player-col payout-player-group-head">Player</th></tr>
                <tr><th class="payout-player-col payout-player-subhead" aria-hidden="true">&nbsp;</th></tr>
              </thead>
              <tbody>${playerRows}</tbody>
              <tfoot><tr><td class="payout-player-col"><strong>Total</strong></td></tr></tfoot>
            </table>
          </div>
          <div class="team-payout-scroll-pane payout-table-wrap payout-table-wrap-team">
            <table class="payout-game-table payout-game-table-wide payout-game-table-${section.key} payout-game-table-team">
              <colgroup>${section.games.map(() => '<col class="team-payout-col-game-desktop">').join('')}</colgroup>
              <thead>
                <tr><th class="team-payout-games-group-head" colspan="${section.games.length || 1}">Games</th></tr>
                <tr>${headerCells}</tr>
              </thead>
              <tbody>${valueRows}</tbody>
              <tfoot><tr>${columnFoot}</tr></tfoot>
            </table>
          </div>
        </div>`)
      : `
        <div class="payout-table-wrap payout-table-wrap-${section.key} top-gap">
          <table class="payout-game-table payout-game-table-wide payout-game-table-${section.key}">
            <thead><tr><th class="payout-player-col"><div class="payout-sticky-player">Player</div></th>${headerCells}</tr></thead>
            <tbody>${players.map(player => {
              const gameCells = section.games.map(game => {
                const amount = game.amounts[player.id] || 0;
                const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
                const text = Math.abs(amount) > 0.0001 ? formatMoneyAccounting(amount) : '—';
                return `<td class="${cls}">${text}</td>`;
              }).join('');
              return `<tr><td class="payout-player-col"><div class="payout-sticky-player"><strong>${escapeHtml(player.name)}</strong></div></td>${gameCells}</tr>`;
            }).join('')}</tbody>
            <tfoot><tr><td class="payout-player-col"><div class="payout-sticky-player"><strong>Total</strong></div></td>${columnFoot}</tr></tfoot>
          </table>
        </div>`;
    return `
      <div class="payout-section top-gap payout-section-${section.key}">
        <div class="payout-summary-intro"><strong>${escapeHtml(section.title)}:</strong> ${escapeHtml(section.intro)}</div>
        ${payoutTableHtml}
        <div class="top-gap payout-settlement-head"><strong>${escapeHtml(section.title)} settlement</strong></div>
${settlementTableHtml}
      </div>`;
  };

  return `<div class="payout-summary-stack">${sections.map(renderSection).join('')}${buildFinalNetSettlementSection(players, finalTotals)}</div>`;
}
function getCompletedStatHoleLimit(match, metrics) {
  const limit = Number(getLastFullyCompletedHole(match)) || Number(metrics?.completed) || 0;
  const holeCount = Number(metrics?.holeCount) || getRequestedHoleCount(match);
  return Math.max(0, Math.min(limit, holeCount));
}

function computeStatTrackingSummary(match, metrics) {
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return [];
  const summary = (metrics?.players || []).map(playerMetric => {
    const playerRef = match.players.find(row => row.playerId === playerMetric.playerId);
    const totals = { fairwaysHit: 0, fairwayOpps: 0, greens: 0, putts: 0, penaltyStrokes: 0, upAndDowns: 0, sandies: 0 };
    (metrics?.holeResults || []).slice(0, completedLimit).forEach((holeResult, holeIdx) => {
      if (!holeResult?.completed) return;
      const scoreObj = holeResult?.playerScores?.find(ps => ps.playerId === playerMetric.playerId);
      if (!Number.isFinite(Number(scoreObj?.gross))) return;
      const hole = getPlayerHole(match, playerMetric, holeIdx, metrics?.tee) || metrics?.tee?.holes?.[holeIdx] || null;
      const stat = getPlayerStatEntry(playerRef, holeIdx);
      const par = Number(hole?.par) || Number(scoreObj?.par) || 0;
      if (par === 4 || par === 5) {
        totals.fairwayOpps += 1;
        if (stat.fairway) totals.fairwaysHit += 1;
      }
      if (stat.green) totals.greens += 1;
      if (Number.isFinite(stat.putts)) totals.putts += stat.putts;
      if (Number.isFinite(Number(stat.penaltyStrokes))) totals.penaltyStrokes += Number(stat.penaltyStrokes);
      if (stat.upAndDown) totals.upAndDowns += 1;
      if (stat.sandy) totals.sandies += 1;
    });
    return { playerMetric, totals };
  });
  return summary;
}

function computeScoreDistributionSummary(match, metrics) {
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return [];
  return (metrics?.players || []).map(playerMetric => {
    const totals = { eagle: 0, birdie: 0, par: 0, bogey: 0, doubleBogey: 0, other: 0 };
    (metrics?.holeResults || []).slice(0, completedLimit).forEach((holeResult, holeIdx) => {
      if (!holeResult?.completed) return;
      const scoreObj = holeResult?.playerScores?.find(ps => ps.playerId === playerMetric.playerId);
      const gross = Number(scoreObj?.gross);
      if (!Number.isFinite(gross) || gross <= 0) return;
      const hole = getPlayerHole(match, playerMetric, holeIdx, metrics?.tee) || metrics?.tee?.holes?.[holeIdx] || null;
      const holePar = Number(scoreObj?.par) || Number(hole?.par) || Number(holeResult?.par) || 0;
      if (!holePar) return;
      const diff = gross - holePar;
      if (diff === -2) totals.eagle += 1;
      else if (diff === -1) totals.birdie += 1;
      else if (diff === 0) totals.par += 1;
      else if (diff === 1) totals.bogey += 1;
      else if (diff === 2) totals.doubleBogey += 1;
      else totals.other += 1;
    });
    return { playerMetric, totals };
  });
}

function buildScoreDistributionSummary(match, metrics) {
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return '<div class="tiny">No completed holes yet.</div>';
  const rows = computeScoreDistributionSummary(match, metrics);
  if (!rows.length) return '<div class="tiny">No player scores available yet.</div>';
  return `
    <div class="score-distribution-wrap top-gap">
      <div class="section-subhead">Score distribution</div>
      <div class="tiny">Gross scores only; completed holes only. Hole-in-ones, albatrosses, and triple bogeys or worse are included in Other.</div>
      <div class="score-distribution-scroll top-gap">
        <table class="score-distribution-table">
          <thead><tr><th>Player</th><th>Eagle</th><th>Birdie</th><th>Par</th><th>Bogey</th><th>Double Bogey</th><th>Other</th></tr></thead>
          <tbody>${rows.map(({ playerMetric, totals }) => `
            <tr>
              <td><strong>${escapeHtml(playerMetric.player.name)}</strong></td>
              <td>${totals.eagle}</td>
              <td>${totals.birdie}</td>
              <td>${totals.par}</td>
              <td>${totals.bogey}</td>
              <td>${totals.doubleBogey}</td>
              <td>${totals.other}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}


function buildExportScoreDistributionSummary(match, metrics) {
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return '<div class="export-empty">No completed holes yet.</div>';
  const rows = computeScoreDistributionSummary(match, metrics);
  if (!rows.length) return '<div class="export-empty">No player scores available yet.</div>';
  return `
    <div class="fit-stage" data-fit="width" data-fit-min="0.84">
      <div class="fit-box">
        <table class="export-table export-score-distribution-table">
          <thead>
            <tr><th>Player</th><th>Eagle</th><th>Birdie</th><th>Par</th><th>Bogey</th><th>Double Bogey</th><th>Other</th></tr>
          </thead>
          <tbody>${rows.map(({ playerMetric, totals }) => `
            <tr>
              <td><strong>${escapeHtml(playerMetric.player.name)}</strong></td>
              <td>${totals.eagle}</td>
              <td>${totals.birdie}</td>
              <td>${totals.par}</td>
              <td>${totals.bogey}</td>
              <td>${totals.doubleBogey}</td>
              <td>${totals.other}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function buildExportStatTrackingSummary(match, metrics) {
  if (!isStatTrackingEnabled(match)) return '';
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return '';
  const rows = (metrics?.players || []).map(playerMetric => {
    const playerRef = match.players.find(row => row.playerId === playerMetric.playerId);
    const totals = { fairwaysHit: 0, fairwayOpps: 0, greens: 0, greenOpps: 0, putts: 0, puttOpps: 0, penaltyStrokes: 0, upAndDowns: 0, sandies: 0 };
    (metrics?.holeResults || []).slice(0, completedLimit).forEach((holeResult, holeIdx) => {
      if (!holeResult?.completed) return;
      const scoreObj = holeResult?.playerScores?.find(ps => ps.playerId === playerMetric.playerId);
      if (!Number.isFinite(Number(scoreObj?.gross))) return;
      const hole = getPlayerHole(match, playerMetric, holeIdx, metrics?.tee) || metrics?.tee?.holes?.[holeIdx] || null;
      const stat = getPlayerStatEntry(playerRef, holeIdx);
      const par = Number(hole?.par) || Number(scoreObj?.par) || 0;
      if (par === 4 || par === 5) {
        totals.fairwayOpps += 1;
        if (stat.fairway) totals.fairwaysHit += 1;
      }
      totals.greenOpps += 1;
      if (stat.green) totals.greens += 1;
      if (Number.isFinite(Number(stat.putts))) {
        totals.putts += Number(stat.putts);
        totals.puttOpps += 1;
      }
      if (Number.isFinite(Number(stat.penaltyStrokes))) totals.penaltyStrokes += Number(stat.penaltyStrokes);
      if (stat.upAndDown) totals.upAndDowns += 1;
      if (stat.sandy) totals.sandies += 1;
    });
    const avgPutts = totals.puttOpps ? (totals.putts / totals.puttOpps).toFixed(1) : '—';
    return `
      <tr>
        <td><strong>${escapeHtml(playerMetric.player.name)}</strong></td>
        <td>${totals.fairwaysHit} / ${totals.fairwayOpps}</td>
        <td>${totals.greens} / ${totals.greenOpps}</td>
        <td>${avgPutts}</td>
        <td>${totals.penaltyStrokes}</td>
        <td>${totals.upAndDowns}</td>
        <td>${totals.sandies}</td>
      </tr>`;
  }).join('');
  if (!rows) return '';
  return `
    <div class="fit-stage" data-fit="width" data-fit-min="0.84">
      <div class="fit-box">
        <table class="export-table export-stat-summary-table">
          <thead>
            <tr><th>Player</th><th>Fairways</th><th>GIR</th><th>Avg Putts</th><th>Penalty</th><th>Up & Downs</th><th>Sandies</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildStatTrackingSummary(match, metrics) {
  const scoreDistributionHtml = buildScoreDistributionSummary(match, metrics);
  if (!isStatTrackingEnabled(match)) return scoreDistributionHtml;
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return scoreDistributionHtml;
  const summary = computeStatTrackingSummary(match, metrics);
  if (!summary.length) return scoreDistributionHtml;
  const manualStatsHtml = `<div class="section-subhead">Manual stat tracking</div><div class="stat-summary-grid top-gap">${summary.map(({ playerMetric, totals }) => `
    <div class="stat-summary-card">
      <div class="stat-summary-name">${escapeHtml(playerMetric.player.name)}</div>
      <div class="tiny">${escapeHtml(getTeamLabel(match, playerMetric.team))}</div>
      <div class="stat-summary-list top-gap">
        <div><span>Fairways hit</span><strong>${totals.fairwaysHit} / ${totals.fairwayOpps}</strong></div>
        <div><span>Greens in regulation</span><strong>${totals.greens}</strong></div>
        <div><span>Total putts</span><strong>${totals.putts}</strong></div>
        <div><span>Penalty strokes</span><strong>${totals.penaltyStrokes}</strong></div>
        <div><span>Up and downs</span><strong>${totals.upAndDowns}</strong></div>
        <div><span>Sandies</span><strong>${totals.sandies}</strong></div>
      </div>
    </div>`).join('')}</div>`;
  return manualStatsHtml + scoreDistributionHtml;
}

function renderLeaderboard() {
  const match = getActiveMatch();
  const empty = document.getElementById('leaderboardEmpty');
  const wrap = document.getElementById('leaderboardWrap');
  const playerBody = document.getElementById('playerLeaderboardBody');
  const teamBody = document.getElementById('teamLeaderboardBody');
  const matchStatus = document.getElementById('matchStatusSummary');
  const matchStatusGameSelect = document.getElementById('matchStatusGameSelect');
  const gamesSummary = document.getElementById('gamesSummary');
  const classicScorecard = document.getElementById('classicScorecard');
  const statTrackingCard = document.getElementById('statTrackingSummaryCard');
  const statTrackingSummary = document.getElementById('statTrackingSummary');
  const ninePointCard = document.getElementById('ninePointScorecardCard');
  const ninePointScorecard = document.getElementById('ninePointScorecard');
  const holeMomentum = document.getElementById('holeMomentum');
  const momentumMeta = document.getElementById('momentumMeta');
  const payoutSummary = document.getElementById('payoutSummary');
  const perspectiveSelect = document.getElementById('momentumPerspectiveSelect');

  if (!match) {
    syncFinishRoundUi(null);
    empty.classList.remove('hidden');
    wrap.classList.add('hidden');
    return;
  }

  const metrics = computeMatchMetrics(match);
  currentLeaderboardMatchRef = match;
  if (!metrics) {
    empty.classList.remove('hidden');
    wrap.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.classList.remove('hidden');
  syncFinishRoundUi(match);

  const sortedPlayers = metrics.players.slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar);
  playerBody.innerHTML = sortedPlayers.map(p => `
    <tr>
      <td>${escapeHtml(p.player.name)}</td>
      <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
      <td>${p.grossTotal || 0}</td>
      <td>${p.postableTotal || 0}</td>
      <td>${formatSigned(p.toPar || 0)}</td>
      <td>${p.netTotal || 0}</td>
      <td>${formatSigned(p.netDiff || 0)}</td>
    </tr>
  `).join('');
  const playerMobile = document.getElementById('playerLeaderboardMobile');
  if (playerMobile) {
    playerMobile.innerHTML = sortedPlayers.map(p => `
      <div class="leader-mobile-card">
        <div><strong>${escapeHtml(p.player.name)}</strong> <span class="tiny">· ${escapeHtml(getTeamLabel(match, p.team))}</span></div>
        <div class="leader-mobile-grid">
          <div><div class="leader-mobile-label">Gross</div><div>${p.grossTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Postable</div><div>${p.postableTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Gross to Par</div><div>${formatSigned(p.toPar || 0)}</div></div>
          <div><div class="leader-mobile-label">Net</div><div>${p.netTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Net to Par</div><div>${formatSigned(p.netDiff || 0)}</div></div>
        </div>
      </div>
    `).join('');
  }

  const sortedTeams = metrics.teams.slice().sort((a, b) => (a.netTotal - b.netTotal) || (a.grossTotal - b.grossTotal) || (a.team - b.team));
  const teamMatchRelevant = showTeamMatchMetric(match, metrics);
  const teamMetricLabel = teamMatchRelevant ? 'H2H' : '—';
  const teamMetricValue = t => teamMatchRelevant ? formatSigned(t.overall) : '—';
  const teamLeaderHeader = document.querySelectorAll('#leaderboard .leader-table thead tr th:last-child')[1];
  if (teamLeaderHeader) teamLeaderHeader.textContent = teamMatchRelevant ? 'H2H' : '—';
  teamBody.innerHTML = sortedTeams.map(t => `
    <tr>
      <td>${escapeHtml(getTeamLabel(match, t.team))}</td>
      <td>${escapeHtml(t.members.map(m => m.player.name).join(', '))}</td>
      <td>${t.grossTotal}</td>
      <td>${t.netTotal}</td>
      <td>${formatSigned(t.toPar)}</td>
      <td>${formatSigned(t.netDiff)}</td>
      <td>${teamMetricValue(t)}</td>
    </tr>
  `).join('');
  const teamMobile = document.getElementById('teamLeaderboardMobile');
  if (teamMobile) {
    teamMobile.innerHTML = sortedTeams.map(t => `
      <div class="leader-mobile-card">
        <div><strong>${escapeHtml(getTeamLabel(match, t.team))}</strong></div>
        <div class="tiny">${escapeHtml(t.members.map(m => m.player.name).join(', '))}</div>
        <div class="leader-mobile-grid">
          <div><div class="leader-mobile-label">Gross</div><div>${t.grossTotal}</div></div>
          <div><div class="leader-mobile-label">Net</div><div>${t.netTotal}</div></div>
          <div><div class="leader-mobile-label">To Par</div><div>${formatSigned(t.toPar)}</div></div>
          <div><div class="leader-mobile-label">Net Diff</div><div>${formatSigned(t.netDiff)}</div></div>
          <div><div class="leader-mobile-label">${teamMetricLabel}</div><div>${teamMetricValue(t)}</div></div>
        </div>
      </div>
    `).join('');
  }

  const activePrintView = (match.printView === 'scorecard') ? 'scorecard' : 'summary';
  syncScoreboardPrintControls(activePrintView);
  applyScoreboardPrintView(activePrintView);

  const statusOptions = getMatchStatusOptions(match);
  if (matchStatusGameSelect) {
    matchStatusGameSelect.innerHTML = statusOptions.map(opt => `<option value="${opt.key}" ${opt.key === match.matchStatusGame ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    if (!statusOptions.find(opt => opt.key === match.matchStatusGame)) {
      match.matchStatusGame = statusOptions[0]?.key || 'team_match';
      matchStatusGameSelect.value = match.matchStatusGame;
    }
  }
  matchStatus.innerHTML = buildFeaturedMatchStatus(match, metrics, match.matchStatusGame || statusOptions[0]?.key || 'team_match');
  gamesSummary.innerHTML = buildSelectedGamesSummary(match, metrics);
  if (classicScorecard) {
    classicScorecard.innerHTML = buildClassicScorecard(match, metrics);
  }
  if (statTrackingCard && statTrackingSummary) {
    statTrackingCard.classList.remove('hidden');
    statTrackingSummary.innerHTML = buildStatTrackingSummary(match, metrics);
  }
  if (ninePointCard && ninePointScorecard) {
    const hasNinePoint = (match.selectedGames || []).some(g => g.key === 'nine_point');
    ninePointCard.classList.toggle('hidden', !hasNinePoint);
    if (hasNinePoint) ninePointScorecard.innerHTML = buildNinePointScorecard(match, metrics);
    else ninePointScorecard.innerHTML = '';
  }
  const momentumCard = document.querySelector('.print-section-momentum');
  const showMomentum = hasMomentumGame(match);
  if (momentumCard) momentumCard.classList.toggle('hidden', !showMomentum);
  const momentumSelect = document.getElementById('momentumGameSelect');
  const options = getMomentumOptions(match);
  if (showMomentum && momentumSelect) {
    momentumSelect.innerHTML = options.map(opt => `<option value="${opt.key}" ${opt.key === match.momentumGame ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    if (!options.find(opt => opt.key === match.momentumGame)) {
      match.momentumGame = options[0]?.key || 'nassau';
      momentumSelect.value = match.momentumGame;
    }
  }
  if (showMomentum && perspectiveSelect) {
    const teamOptions = metrics.teams.slice(0, 2).map(t => `<option value="${t.team}" ${t.team === getMomentumPerspectiveTeam(match) ? 'selected' : ''}>${escapeHtml(getTeamName(match, t.team))}</option>`).join('');
    perspectiveSelect.innerHTML = teamOptions;
    if (!metrics.teams.find(t => t.team === getMomentumPerspectiveTeam(match))) {
      match.momentumPerspective = 1;
      perspectiveSelect.value = '1';
    }
  }
  if (showMomentum && momentumMeta) {
    momentumMeta.textContent = describeMomentumMeta(match, metrics, match.momentumGame || options[0]?.key || 'nassau');
  }
  if (showMomentum && holeMomentum) {
    let running = 0;
    const perspectiveTeam = getMomentumPerspectiveTeam(match);
    holeMomentum.innerHTML = metrics.holeResults.map(h => {
      const outcome = computeMomentumOutcome(match, metrics, h, match.momentumGame || 'nassau');
      let cls = 'tied';
      if (outcome === 'team1') {
        running += 1;
        cls = perspectiveTeam === 1 ? 'team1' : 'team2';
      } else if (outcome === 'team2') {
        running -= 1;
        cls = perspectiveTeam === 1 ? 'team2' : 'team1';
      } else if (outcome === 'pending') {
        cls = 'pending';
      } else {
        cls = 'tied';
      }
      const txt = outcome === 'pending' ? '•' : formatPerspectiveStatus(running, perspectiveTeam);
      return `<div class="momentum-pill ${cls}">H${h.holeNumber}<span>${txt}</span></div>`;
    }).join('');
  } else if (holeMomentum) {
    holeMomentum.innerHTML = '';
    if (momentumMeta) momentumMeta.textContent = 'Momentum is shown when a Nassau or match play game is in the round.';
  }
  if (payoutSummary) {
    payoutSummary.innerHTML = buildNetPayoutSummary(match, metrics);
    scheduleTeamPayoutSplitPaneSync();
  }
}


function syncTeamPayoutSplitPane(root = document) {
  const groups = Array.from(root.querySelectorAll('#leaderboard .team-payout-split'));
  groups.forEach(group => {
    const leftTable = group.querySelector('.team-payout-fixed-table');
    const rightTable = group.querySelector('.payout-game-table-team');
    if (!leftTable || !rightTable) return;
    const leftRows = Array.from(leftTable.querySelectorAll('thead tr, tbody tr, tfoot tr'));
    const rightRows = Array.from(rightTable.querySelectorAll('thead tr, tbody tr, tfoot tr'));
    if (!leftRows.length || leftRows.length !== rightRows.length) return;
    group.style.setProperty('--team-payout-player-col-width', `${Math.round(leftTable.getBoundingClientRect().width || 148)}px`);
    leftRows.forEach(row => row.style.height = '');
    rightRows.forEach(row => row.style.height = '');
    group.querySelectorAll('.team-payout-fixed-table th, .team-payout-fixed-table td, .payout-game-table-team th, .payout-game-table-team td').forEach(cell => {
      cell.style.height = '';
      cell.style.minHeight = '';
    });
    const getRowHeight = row => {
      const rowRect = row.getBoundingClientRect().height || 0;
      const cellHeights = Array.from(row.children).map(cell => Math.max(cell.getBoundingClientRect().height || 0, cell.scrollHeight || 0, cell.offsetHeight || 0));
      return Math.max(rowRect, ...cellHeights, row.scrollHeight || 0, row.offsetHeight || 0);
    };
    const heights = leftRows.map((leftRow, idx) => {
      const rightRow = rightRows[idx];
      const measured = Math.max(getRowHeight(leftRow), getRowHeight(rightRow));
      return Math.ceil(measured + 1);
    });
    leftRows.forEach((leftRow, idx) => {
      const minimum = idx === 0 || idx === leftRows.length - 1 ? 42 : 40;
      const height = Math.max(minimum, heights[idx] || 0);
      const rightRow = rightRows[idx];
      leftRow.style.height = height + 'px';
      rightRow.style.height = height + 'px';
      Array.from(leftRow.children).forEach(cell => {
        cell.style.height = height + 'px';
        cell.style.minHeight = height + 'px';
      });
      Array.from(rightRow.children).forEach(cell => {
        cell.style.height = height + 'px';
        cell.style.minHeight = height + 'px';
      });
    });
  });
}

let syncTeamPayoutSplitPaneTimer = 0;
function scheduleTeamPayoutSplitPaneSync() {
  if (syncTeamPayoutSplitPaneTimer) window.cancelAnimationFrame(syncTeamPayoutSplitPaneTimer);
  syncTeamPayoutSplitPaneTimer = window.requestAnimationFrame(() => {
    syncTeamPayoutSplitPaneTimer = 0;
    syncTeamPayoutSplitPane();
    window.requestAnimationFrame(() => {
      syncTeamPayoutSplitPane();
      window.setTimeout(() => syncTeamPayoutSplitPane(), 32);
    });
  });
}

function hasSupabaseConfig() {
  return !!(SUPABASE_CONFIG?.url && SUPABASE_CONFIG?.anonKey && window.supabase?.createClient);
}
async function ensureSupabaseClient(options = {}) {
  if (!hasSupabaseConfig()) return null;
  const anonymousAuth = options?.anonymousAuth !== false;
  if (supabaseClient) {
    if (anonymousAuth) {
      const existing = await supabaseClient.auth.getUser();
      if (!existing?.data?.user) {
        const signIn = await supabaseClient.auth.signInAnonymously();
        if (signIn.error) throw signIn.error;
      }
    }
    return supabaseClient;
  }
  if (!supabaseInitPromise) {
    supabaseInitPromise = (async () => {
      const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      supabaseClient = client;
      return client;
    })().catch(err => {
      supabaseInitPromise = null;
      throw err;
    });
  }
  const client = await supabaseInitPromise;
  if (anonymousAuth) {
    const existing = await client.auth.getUser();
    if (!existing?.data?.user) {
      const signIn = await client.auth.signInAnonymously();
      if (signIn.error) throw signIn.error;
    }
  }
  return client;
}
async function getSupabaseUser() {
  const client = await ensureSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (data?.user) return data.user;
  const signIn = await client.auth.signInAnonymously();
  if (signIn.error) throw signIn.error;
  return signIn.data?.user || null;
}
function getSharedMatchIndex() {
  return Array.isArray(state.sharedMatchIds) ? [...new Set(state.sharedMatchIds.filter(Boolean))] : [];
}

function normalizeCloudCourseRow(row = {}) {
  const id = String(row.id || row.course_id || row.name || uid());
  return {
    id,
    name: String(row.name || 'Imported Course').trim() || 'Imported Course',
    city: String(row.city || '').trim(),
    state: String(row.state || '').trim(),
    country: String(row.country || 'United States of America').trim() || 'United States of America',
    strokeIndexes: null,
    tees: [],
    source: 'supabase',
    cloudCourseId: id,
  };
}
function normalizeCloudTeeRow(row = {}, courseName = '') {
  const holes = Array.isArray(row.holes) && row.holes.length ? row.holes.map(normalizeHole) : buildDefaultHoles();
  const tee = {
    id: String(row.id || row.tee_id || uid()),
    courseName,
    teeName: String(row.tee_name || row.teeName || row.name || 'Tee').trim() || 'Tee',
    gender: String(row.gender || 'M').toUpperCase() === 'F' ? 'F' : 'M',
    isCombo: false,
    comboSources: buildDefaultHoles().map(h => ({ holeNumber: h.holeNumber, sourceTeeId: '' })),
    length: Number(row.total_yards ?? row.length) || sumYardage(holes) || null,
    par: Number(row.total_par ?? row.par) || sumPar(holes) || 72,
    rating: Number(row.rating) || 72,
    slope: Number(row.slope) || 113,
    holes,
    source: 'supabase',
    cloudTeeId: String(row.id || row.tee_id || ''),
  };
  normalizeTee(tee, courseName);
  return tee;
}
function mergeSupabaseCourses(cloudCourses = []) {
  let added = 0;
  let updated = 0;
  cloudCourses.forEach(course => {
    if (!course?.id || !course?.name) return;
    const existingIdx = state.courses.findIndex(c => c.id === course.id);
    const nameKey = String(course.name || '').trim().toLowerCase();
    const cityKey = String(course.city || '').trim().toLowerCase();
    const stateKey = String(course.state || '').trim().toLowerCase();
    const duplicateIdx = existingIdx >= 0 ? existingIdx : state.courses.findIndex(c => (
      String(c.name || '').trim().toLowerCase() === nameKey
      && String(c.city || '').trim().toLowerCase() === cityKey
      && String(c.state || '').trim().toLowerCase() === stateKey
    ));
    if (duplicateIdx >= 0) {
      const existing = state.courses[duplicateIdx];
      const cloudTees = (course.tees || []).map(ct => {
        const localMatch = (existing.tees || []).find(t => (t.cloudTeeId && t.cloudTeeId === ct.cloudTeeId) || (String(t.teeName || '').trim().toLowerCase() === String(ct.teeName || '').trim().toLowerCase() && String(t.gender || 'M') === String(ct.gender || 'M')));
        return localMatch ? { ...localMatch, ...ct, id: localMatch.id, cloudTeeId: ct.cloudTeeId || localMatch.cloudTeeId || ct.id, source: 'supabase' } : ct;
      });
      const localOnlyTees = (existing.tees || []).filter(t => !cloudTees.some(ct => ct.id === t.id || (ct.cloudTeeId && ct.cloudTeeId === t.cloudTeeId) || (String(ct.teeName || '').trim().toLowerCase() === String(t.teeName || '').trim().toLowerCase() && String(ct.gender || 'M') === String(t.gender || 'M'))));
      state.courses[duplicateIdx] = {
        ...existing,
        ...course,
        id: existing.id,
        cloudCourseId: course.cloudCourseId || course.id || existing.cloudCourseId,
        cloudSyncState: 'synced',
        tees: [...cloudTees, ...localOnlyTees],
      };
      updated += 1;
    } else {
      state.courses.push(course);
      added += 1;
    }
  });
  normalizeState();
  return { added, updated };
}
async function loadSupabaseCourses({ silent = false } = {}) {
  if (!hasSupabaseConfig()) {
    uiState.cloudCoursesStatus = 'Supabase not configured. Manual course entry remains available.';
    if (!silent) { renderCourses(); toast('Supabase is not configured.'); }
    return { added: 0, updated: 0 };
  }
  if (uiState.cloudCoursesLoading) return { added: 0, updated: 0 };
  uiState.cloudCoursesLoading = true;
  uiState.cloudCoursesStatus = 'Loading cloud course library…';
  renderCourses();
  try {
    const client = await ensureSupabaseClient({ anonymousAuth: false });
    if (!client) throw new Error('Supabase client unavailable.');
    const [{ data: courseRows, error: courseError }, { data: teeRows, error: teeError }, { data: holeRows, error: holeError }] = await Promise.all([
      client.from('courses').select('*').order('name'),
      client.from('course_tees').select('*').order('tee_name'),
      client.from('course_holes').select('*').order('hole_number'),
    ]);
    if (courseError) throw courseError;
    if (teeError) throw teeError;
    if (holeError) throw holeError;
    const holesByTee = new Map();
    (holeRows || []).forEach(row => {
      const teeId = String(row.tee_id || '');
      if (!teeId) return;
      if (!holesByTee.has(teeId)) holesByTee.set(teeId, []);
      holesByTee.get(teeId).push({
        holeNumber: Number(row.hole_number) || 1,
        yardage: Number(row.yardage) || null,
        par: Number(row.par) || null,
        strokeIndex: Number(row.handicap_index ?? row.stroke_index) || null,
      });
    });
    const teesByCourse = new Map();
    (teeRows || []).forEach(row => {
      const courseId = String(row.course_id || '');
      if (!courseId) return;
      if (!teesByCourse.has(courseId)) teesByCourse.set(courseId, []);
      const holes = (holesByTee.get(String(row.id)) || []).sort((a, b) => a.holeNumber - b.holeNumber);
      teesByCourse.get(courseId).push({ ...row, holes: holes.length ? holes : buildDefaultHoles() });
    });
    const cloudCourses = (courseRows || []).map(row => {
      const course = normalizeCloudCourseRow(row);
      const tees = (teesByCourse.get(course.id) || []).map(teeRow => normalizeCloudTeeRow(teeRow, course.name));
      course.tees = getSortedTeesByYardage({ tees });
      const firstTemplate = tees.map(t => extractStrokeTemplate(t.holes)).find(Boolean);
      course.strokeIndexes = firstTemplate || null;
      return course;
    });
    const result = mergeSupabaseCourses(cloudCourses);
    persist({ skipRender: true });
    uiState.cloudCoursesStatus = cloudCourses.length
      ? `Cloud course library loaded: ${cloudCourses.length} course${cloudCourses.length === 1 ? '' : 's'} (${result.added} new, ${result.updated} refreshed).`
      : 'Cloud course library is configured, but no courses are available yet.';
    renderAll();
    if (!silent) toast('Course library refreshed.');
    return result;
  } catch (err) {
    console.warn('Could not load Supabase course library:', err);
    uiState.cloudCoursesStatus = 'Could not load cloud courses. Manual/local courses are still available.';
    renderCourses();
    if (!silent) toast('Could not load cloud courses.');
    return { added: 0, updated: 0, error: err };
  } finally {
    uiState.cloudCoursesLoading = false;
    renderCourses();
  }
}

function getCloudCourseMatchKey(course = {}) {
  return [course.name, course.city, course.state].map(v => String(v || '').trim().toLowerCase()).join('|');
}
function getCloudCourseNameKey(course = {}) {
  return String(course?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function isSupabaseCourse(course = {}) {
  return String(course?.source || '').toLowerCase() === 'supabase' || !!course?.cloudCourseId || course?.cloudSyncState === 'synced';
}
function getCloudTeeMatchKey(tee = {}) {
  return [tee.teeName, tee.gender || 'M'].map(v => String(v || '').trim().toLowerCase()).join('|');
}
function markCoursePendingSync(course, reason = '') {
  if (!course) return;
  course.cloudSyncState = 'pending-sync';
  course.cloudSyncError = reason ? String(reason).slice(0, 160) : '';
}
function buildCloudCoursePayload(course) {
  return {
    name: String(course.name || '').trim(),
    city: String(course.city || '').trim() || null,
    state: String(course.state || '').trim() || null,
    country: String(course.country || 'United States of America').trim() || 'United States of America',
    updated_at: new Date().toISOString(),
  };
}
function removeBlankUpdateFields(payload, existing = {}, alwaysKeep = []) {
  const cleaned = { ...payload };
  Object.keys(cleaned).forEach(key => {
    if (alwaysKeep.includes(key)) return;
    const value = cleaned[key];
    const existingValue = existing[key];
    const localBlank = value === null || value === undefined || String(value).trim?.() === '';
    const cloudHasValue = existingValue !== null && existingValue !== undefined && String(existingValue).trim?.() !== '';
    if (localBlank && cloudHasValue) delete cleaned[key];
  });
  return cleaned;
}
function buildCloudTeePayload(courseId, tee) {
  return {
    course_id: String(courseId),
    tee_name: String(tee.teeName || '').trim(),
    rating: Number.isFinite(Number(tee.rating)) ? Number(tee.rating) : null,
    slope: Number.isFinite(Number(tee.slope)) ? Number(tee.slope) : null,
    total_yards: getTeeTotalYardage(tee) || null,
    updated_at: new Date().toISOString(),
  };
}
function buildCloudHolePayloads(courseId, teeId, tee) {
  return (Array.isArray(tee.holes) ? tee.holes : buildDefaultHoles()).map(h => ({
    course_id: String(courseId),
    tee_id: String(teeId),
    hole_number: Number(h.holeNumber) || 1,
    par: Number(h.par) || null,
    handicap_index: Number(h.strokeIndex) || null,
    yardage: Number(h.yardage) || null,
    updated_at: new Date().toISOString(),
  }));
}
async function insertOrUpdateCloudCourse(client, course, existingCourse = null) {
  const payload = buildCloudCoursePayload(course);
  if (existingCourse?.id || course.cloudCourseId) {
    const id = String(existingCourse?.id || course.cloudCourseId);
    const updatePayload = removeBlankUpdateFields(payload, existingCourse || {}, ['name', 'updated_at']);
    const { data, error } = await client.from('courses').update(updatePayload).eq('id', id).select('*').single();
    if (error) throw error;
    return data || { id, ...existingCourse, ...updatePayload };
  }
  const { data, error } = await client.from('courses').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}
async function insertOrUpdateCloudTee(client, courseId, tee, existingTee = null) {
  const payload = buildCloudTeePayload(courseId, tee);
  if (existingTee?.id || tee.cloudTeeId) {
    const id = String(existingTee?.id || tee.cloudTeeId);
    const updatePayload = removeBlankUpdateFields(payload, existingTee || {}, ['course_id', 'tee_name', 'updated_at']);
    const { data, error } = await client.from('course_tees').update(updatePayload).eq('id', id).select('*').single();
    if (error) throw error;
    return data || { id, ...existingTee, ...updatePayload };
  }
  const { data, error } = await client.from('course_tees').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}
async function insertOrUpdateCloudTeeHoles(client, courseId, teeId, tee) {
  const holePayloads = buildCloudHolePayloads(courseId, teeId, tee);
  if (!holePayloads.length) return { inserted: 0, updated: 0 };
  const { data: existingRows, error: loadError } = await client.from('course_holes').select('*').eq('tee_id', String(teeId));
  if (loadError) throw loadError;
  const existingByHole = new Map((existingRows || []).map(row => [Number(row.hole_number), row]));
  const summary = { inserted: 0, updated: 0 };
  for (const payload of holePayloads) {
    const existing = existingByHole.get(Number(payload.hole_number));
    if (existing?.id) {
      const updatePayload = removeBlankUpdateFields(payload, existing, ['course_id', 'tee_id', 'hole_number', 'updated_at']);
      const { error } = await client.from('course_holes').update(updatePayload).eq('id', existing.id);
      if (error) throw error;
      summary.updated += 1;
    } else {
      const { error } = await client.from('course_holes').insert(payload);
      if (error) throw error;
      summary.inserted += 1;
    }
  }
  return summary;
}
async function findCloudCourseRow(client, course) {
  const name = String(course?.name || '').trim();
  if (!name) return null;
  const { data, error } = await client.from('courses').select('*').eq('name', name).limit(20);
  if (error) throw error;
  const targetKey = getCloudCourseMatchKey(course);
  return (data || []).find(row => getCloudCourseMatchKey(row) === targetKey) || (data || [])[0] || null;
}
async function syncCourseToSupabase(course, { silent = true } = {}) {
  if (!course?.name) return { skipped: true };
  if (!hasSupabaseConfig()) {
    markCoursePendingSync(course, 'Supabase not configured');
    uiState.cloudCoursesStatus = 'Cloud course library not configured. Course saved locally and marked pending sync.';
    persist({ skipRender: true });
    renderCourses();
    return { pending: true };
  }
  try {
    uiState.cloudCoursesStatus = 'Cloud Course Library: Syncing... manual setup remains available.';
    renderCourses();
    const client = await ensureSupabaseClient({ anonymousAuth: false });
    if (!client) throw new Error('Supabase client unavailable.');
    const existingCourse = await findCloudCourseRow(client, course);
    const savedCourse = await insertOrUpdateCloudCourse(client, course, existingCourse);
    const cloudCourseId = String(savedCourse?.id || existingCourse?.id || course.cloudCourseId || '');
    if (!cloudCourseId) throw new Error('Cloud course save did not return a course id.');
    course.cloudCourseId = cloudCourseId;
    course.cloudSyncState = 'synced';
    course.cloudSyncError = '';

    let existingTees = [];
    const { data: teeRows, error: teeLoadError } = await client.from('course_tees').select('*').eq('course_id', cloudCourseId);
    if (!teeLoadError) existingTees = teeRows || [];

    for (const tee of (course.tees || [])) {
      if (!tee?.teeName) continue;
      const existingTee = existingTees.find(row => getCloudTeeMatchKey({ teeName: row.tee_name, gender: row.gender }) === getCloudTeeMatchKey(tee));
      const savedTee = await insertOrUpdateCloudTee(client, cloudCourseId, tee, existingTee);
      const cloudTeeId = String(savedTee?.id || existingTee?.id || tee.cloudTeeId || '');
      if (!cloudTeeId) continue;
      tee.cloudTeeId = cloudTeeId;
      tee.source = 'supabase';
      try {
        await insertOrUpdateCloudTeeHoles(client, cloudCourseId, cloudTeeId, tee);
      } catch (holeErr) {
        console.warn('Course tee synced, but hole detail sync failed:', holeErr);
      }
    }
    uiState.cloudCoursesStatus = 'Cloud Course Library: Connected ✓';
    persist({ skipRender: true });
    renderAll();
    if (!silent) toast('Course synced to cloud.');
    return { synced: true };
  } catch (err) {
    console.warn('Course sync failed:', err);
    markCoursePendingSync(course, err?.message || 'Course sync failed');
    uiState.cloudCoursesStatus = 'Cloud Course Library: Offline. Course saved locally and will sync later.';
    persist({ skipRender: true });
    renderCourses();
    if (!silent) toast('Course saved locally. Cloud sync failed.');
    return { pending: true, error: err };
  }
}
function scheduleCourseSync(courseOrId, { immediate = false, silent = true } = {}) {
  const courseId = typeof courseOrId === 'string' ? courseOrId : courseOrId?.id;
  const course = typeof courseOrId === 'string' ? getCourse(courseId) : courseOrId;
  if (!course) return;
  markCoursePendingSync(course);
  persist({ skipRender: true });
  const delay = immediate ? 0 : 800;
  if (uiState.courseSyncTimers[courseId]) clearTimeout(uiState.courseSyncTimers[courseId]);
  uiState.courseSyncTimers[courseId] = window.setTimeout(() => {
    delete uiState.courseSyncTimers[courseId];
    syncCourseToSupabase(course, { silent });
  }, delay);
}
async function flushPendingCourseSync({ silent = true } = {}) {
  if (!hasSupabaseConfig()) return;
  const pending = state.courses.filter(c => c.cloudSyncState === 'pending-sync');
  for (const course of pending) {
    await syncCourseToSupabase(course, { silent });
  }
}
async function syncCourseLibrary() {
  if (!hasSupabaseConfig()) {
    uiState.cloudCoursesStatus = 'Cloud sync unavailable. Local courses are still available.';
    renderCourses();
    const unavailableSummary = { uploaded: 0, updated: 0, current: 0, failed: 0, errors: ['Cloud sync unavailable. Local courses are still available.'] };
    renderLocalCourseSyncResult(unavailableSummary);
    toast('Cloud sync unavailable. Local courses are still available.');
    return unavailableSummary;
  }
  if (uiState.cloudCoursesLoading) return { uploaded: 0, updated: 0, current: 0, failed: 0 };
  uiState.cloudCoursesLoading = true;
  uiState.cloudCoursesStatus = 'Cloud Course Library: Syncing course library...';
  renderCourses();
  const summary = { uploaded: 0, updated: 0, current: 0, failed: 0, errors: [] };
  try {
    const client = await ensureSupabaseClient({ anonymousAuth: false });
    if (!client) throw new Error('Supabase client unavailable.');
    const { data: cloudRows, error: cloudError } = await client.from('courses').select('*');
    if (cloudError) throw cloudError;
    const cloudByNameKey = new Map((cloudRows || []).map(row => [getCloudCourseNameKey(row), row]).filter(([key]) => !!key));
    const localCourses = state.courses.filter(c => c?.name);
    if (!localCourses.length) {
      uiState.cloudCoursesStatus = 'No local courses found to sync.';
      renderCourses();
      renderLocalCourseSyncResult(summary);
      toast('No local courses found to sync.');
      return summary;
    }
    for (const course of localCourses) {
      const nameKey = getCloudCourseNameKey(course);
      if (!nameKey) continue;
      const existingCourse = course.cloudCourseId
        ? (cloudRows || []).find(row => String(row.id) === String(course.cloudCourseId)) || cloudByNameKey.get(nameKey) || null
        : cloudByNameKey.get(nameKey) || null;
      try {
        const wasExisting = !!existingCourse;
        const wasPending = course.cloudSyncState === 'pending-sync';
        const savedCourse = await insertOrUpdateCloudCourse(client, course, existingCourse);
        const cloudCourseId = String(savedCourse?.id || existingCourse?.id || course.cloudCourseId || '');
        if (!cloudCourseId) throw new Error('Cloud course save did not return a course id.');
        course.cloudCourseId = cloudCourseId;
        course.cloudSyncState = 'synced';
        course.cloudSyncError = '';

        let existingTees = [];
        const { data: teeRows, error: teeLoadError } = await client.from('course_tees').select('*').eq('course_id', cloudCourseId);
        if (teeLoadError) throw teeLoadError;
        existingTees = teeRows || [];
        for (const tee of (course.tees || [])) {
          if (!tee?.teeName) continue;
          const existingTee = tee.cloudTeeId
            ? existingTees.find(row => String(row.id) === String(tee.cloudTeeId)) || null
            : existingTees.find(row => getCloudTeeMatchKey({ teeName: row.tee_name, gender: row.gender }) === getCloudTeeMatchKey(tee)) || null;
          const savedTee = await insertOrUpdateCloudTee(client, cloudCourseId, tee, existingTee);
          const cloudTeeId = String(savedTee?.id || existingTee?.id || tee.cloudTeeId || '');
          if (!cloudTeeId) continue;
          tee.cloudTeeId = cloudTeeId;
          tee.source = 'supabase';
          await insertOrUpdateCloudTeeHoles(client, cloudCourseId, cloudTeeId, tee);
        }
        cloudByNameKey.set(nameKey, { ...(existingCourse || {}), ...(savedCourse || {}) });
        if (!wasExisting) summary.uploaded += 1;
        else if (wasPending) summary.updated += 1;
        else summary.current += 1;
      } catch (courseErr) {
        summary.failed += 1;
        markCoursePendingSync(course, courseErr?.message || 'Course sync failed');
        summary.errors.push(`${course.name}: ${courseErr?.message || 'Sync failed'}`);
      }
    }
    persist({ skipRender: true });
    await loadSupabaseCourses({ silent: true });
    uiState.cloudCoursesStatus = `Cloud sync complete: ${summary.uploaded} uploaded, ${summary.updated} updated, ${summary.current} already current, ${summary.failed} failed.`;
    renderAll();
    renderLocalCourseSyncResult(summary);
    toast(`${summary.uploaded} uploaded · ${summary.updated} updated · ${summary.current} current · ${summary.failed} failed`);
    return summary;
  } catch (err) {
    console.warn('Course library sync failed:', err);
    uiState.cloudCoursesStatus = 'Cloud sync unavailable. Local courses are still available.';
    renderCourses();
    summary.error = err;
    summary.failed = summary.failed || 0;
    summary.errors.push(err?.message || 'Cloud sync unavailable. Local courses are still available.');
    renderLocalCourseSyncResult(summary);
    toast('Cloud sync unavailable. Local courses are still available.');
    return summary;
  } finally {
    uiState.cloudCoursesLoading = false;
    renderCourses();
  }
}
const syncLocalCoursesToCloud = syncCourseLibrary;
async function refreshCourseLibraryFromCloud({ silent = true, force = false } = {}) {
  const now = Date.now();
  if (!force && uiState.cloudCoursesLastLoadAt && (now - uiState.cloudCoursesLastLoadAt < 60000)) return;
  uiState.cloudCoursesLastLoadAt = now;
  await flushPendingCourseSync({ silent: true });
  await loadSupabaseCourses({ silent });
  await flushPendingCourseSync({ silent: true });
}

function rememberSharedMatchId(matchId) {
  if (!matchId) return;
  state.sharedMatchIds = [...new Set([...(state.sharedMatchIds || []), matchId])];
}
function cacheCloudMatchBundle(matchId, bundle) {
  if (!matchId || !bundle) return;
  localStorage.setItem(`${CLOUD_MATCH_CACHE_PREFIX}${matchId}`, JSON.stringify(bundle));
}
function readCachedCloudMatchBundle(matchId) {
  try {
    const raw = localStorage.getItem(`${CLOUD_MATCH_CACHE_PREFIX}${matchId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function getCourseSnapshotForMatch(match) {
  const course = getCourse(match.courseId);
  const teeIds = [...new Set([match.teeId, ...match.players.map(p => p.teeId)].filter(Boolean))];
  const tees = teeIds.map(teeId => {
    const tee = getTee(match.courseId, teeId);
    if (!tee) return null;
    return JSON.parse(JSON.stringify(tee));
  }).filter(Boolean);
  return {
    id: match.courseId,
    name: course?.name || 'Imported Course',
    city: course?.city || '',
    state: course?.state || '',
    country: course?.country || 'United States of America',
    strokeIndexes: Array.isArray(course?.strokeIndexes) ? course.strokeIndexes.slice() : null,
    tees,
  };
}
function getGreeniesCfg(match) {
  return (match?.selectedGames || []).find(g => g.key === 'greenies') || null;
}
function buildSelectedGamesForCloud(match) {
  const games = normalizeSelectedGamesOrder(match?.selectedGames || []).map(g => JSON.parse(JSON.stringify(g)));
  const greeniesCfg = games.find(g => g.key === 'greenies');
  if (greeniesCfg) {
    greeniesCfg.winnersByHole = { ...(match?.greeniesWinners || {}) };
  }
  return games;
}
function extractGreeniesWinnersFromSelectedGames(selectedGames) {
  const greeniesCfg = (selectedGames || []).find(g => g.key === 'greenies');
  const winners = greeniesCfg?.winnersByHole;
  return winners && typeof winners === 'object' ? { ...winners } : {};
}
function applyCurrentHoleDomToMatch(match) {
  if (!match) return false;
  const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
  const holeMeta = scoringHoles[currentHole - 1] || null;
  const actualHoleNumber = holeMeta?.holeNumber || currentHole;
  let mutated = false;
  document.querySelectorAll('[data-score-player]').forEach(input => {
    const playerId = input.dataset.scorePlayer;
    const mp = match.players.find(p => p.playerId === playerId);
    if (!mp || !mp.scores?.[currentHole - 1]) return;
    const prevGross = mp.scores[currentHole - 1].gross ?? null;
    const nextGross = String(input.value || '').trim() === '' ? null : (Number.isFinite(Number(input.value)) ? Math.round(Number(input.value)) : null);
    if (prevGross !== nextGross) {
      mp.scores[currentHole - 1].gross = nextGross;
      mutated = true;
    }
  });
  if (isStatTrackingEnabled(match)) {
    document.querySelectorAll('[data-stat-player][data-stat-key]').forEach(input => {
      const playerId = input.dataset.statPlayer;
      const key = input.dataset.statKey;
      const playerRef = match.players.find(p => p.playerId === playerId);
      if (!playerRef) return;
      if (!Array.isArray(playerRef.stats) || !playerRef.stats.length) playerRef.stats = buildEmptyStats(getRequestedHoleCount(match));
      const currentStat = normalizeHoleStat(playerRef.stats[currentHole - 1] || {}, currentHole - 1);
      const before = JSON.stringify(currentStat);
      if (key === 'putts') {
        const raw = String(input.value || '').trim();
        const putts = Number(raw === '' ? '2' : raw);
        currentStat.putts = Number.isFinite(putts) ? Math.max(0, Math.round(putts)) : 2;
        currentStat.puttsSource = normalizePuttsSource(input.dataset.puttsSource || 'user', 'user');
      } else if (key === 'penaltyStrokes') {
        const raw = String(input.value || '').trim();
        const penalties = Number(raw === '' ? '0' : raw);
        currentStat.penaltyStrokes = Number.isFinite(penalties) ? Math.max(0, Math.round(penalties)) : 0;
        currentStat.puttsSource = normalizePuttsSource(currentStat.puttsSource || 'default', 'default');
      } else {
        currentStat[key] = !!input.checked;
        currentStat.puttsSource = normalizePuttsSource(currentStat.puttsSource || 'default', 'default');
      }
      if (Number(holeMeta?.par) !== 4 && Number(holeMeta?.par) !== 5) currentStat.fairway = false;
      if (JSON.stringify(currentStat) != before) {
        playerRef.stats[currentHole - 1] = currentStat;
        mutated = true;
      }
    });
  }
  const selectedWinner = document.querySelector('[data-greenies-winner]:checked')?.dataset.greeniesWinner || '';
  const existingWinner = match.greeniesWinners?.[String(actualHoleNumber)] || '';
  if (selectedWinner) {
    if (!match.greeniesWinners) match.greeniesWinners = {};
    if (existingWinner !== selectedWinner) {
      match.greeniesWinners[String(actualHoleNumber)] = selectedWinner;
      mutated = true;
    }
  } else if (existingWinner) {
    delete match.greeniesWinners[String(actualHoleNumber)];
    mutated = true;
  }
  const progress = computeMatchProgress(match);
  if ((match.lastTouchedHole || 0) !== (progress.lastTouchedHole || 0)) {
    match.lastTouchedHole = progress.lastTouchedHole;
    mutated = true;
  }
  if ((match.lastFullyCompletedHole || 0) !== (progress.lastFullyCompletedHole || 0)) {
    match.lastFullyCompletedHole = progress.lastFullyCompletedHole;
    mutated = true;
  }
  const greeniesCfg = getGreeniesCfg(match);
  if (greeniesCfg) {
    const nextWinners = { ...(match.greeniesWinners || {}) };
    if (JSON.stringify(greeniesCfg.winnersByHole || {}) !== JSON.stringify(nextWinners)) {
      greeniesCfg.winnersByHole = nextWinners;
      mutated = true;
    }
  }
  return mutated;
}
function scheduleSharedActiveMatchSyncFromDom({ immediate = false, silent = true, persistLocal = true } = {}) {
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared') return;
  const mutated = applyCurrentHoleDomToMatch(match);
  if (mutated || persistLocal) persist({ skipRender: true });
  scheduleSharedMatchSync(match, { immediate, silent });
}
function buildCloudMatchPayload(match, organizerUserId = null) {
  const createdAt = new Date().toISOString();
  const courseSnapshot = getCourseSnapshotForMatch(match);
  const teams = Array.from({ length: Math.max(1, Number(match.teamCount) || 1) }, (_, idx) => ({
    id: `${match.sharedMatchId || match.id}:team:${idx + 1}`,
    match_id: match.sharedMatchId || match.id,
    team_number: idx + 1,
    team_name: String(match.teamNames?.[idx] || `Team ${idx + 1}`),
    created_at: createdAt,
  }));
  const players = match.players.map((mp, idx) => {
    const player = getPlayer(mp.playerId) || { id: mp.playerId, name: `Player ${idx + 1}`, index: 0 };
    const tee = getTee(match.courseId, mp.teeId || match.teeId);
    const courseHdcp = tee ? courseHandicap(player.index, tee.slope, tee.rating, tee.par) : 0;
    const playHdcp = playingHandicap(courseHdcp, match.allowance);
    return {
      id: `${match.sharedMatchId || match.id}:player:${player.id}`,
      match_id: match.sharedMatchId || match.id,
      player_id: player.id,
      team_id: `${match.sharedMatchId || match.id}:team:${Number(mp.team) || 1}`,
      team_number: Number(mp.team) || 1,
      slot: Number.isFinite(Number(mp.slot)) ? Number(mp.slot) : idx,
      player_name: String(player.name || `Player ${idx + 1}`),
      player_index: Number(player.index) || 0,
      tee_id: mp.teeId || match.teeId || '',
      tee_name: String(tee?.teeName || ''),
      course_handicap: Number(courseHdcp) || 0,
      playing_handicap: Number(playHdcp) || 0,
      handicap_snapshot: {
        allowance: Number(match.allowance) || 100,
        playerIndex: Number(player.index) || 0,
        tee: tee ? {
          id: tee.id,
          teeName: tee.teeName,
          gender: tee.gender,
          rating: Number(tee.rating) || 0,
          slope: Number(tee.slope) || 0,
          par: Number(tee.par) || 0,
          holes: Array.isArray(tee.holes) ? tee.holes : [],
        } : null,
      },
      created_at: createdAt,
    };
  });
  const matchRow = {
    id: match.sharedMatchId || match.id,
    created_at: match.createdAt || createdAt,
    updated_at: createdAt,
    created_by: organizerUserId,
    name: match.name || 'Round',
    match_date: match.date || todayIso(),
    status: match.status || 'active',
    course_id: match.courseId || '',
    reference_tee_id: match.teeId || '',
    course_snapshot: courseSnapshot,
    format: match.format || 'teams',
    allowance: Number(match.allowance) || 100,
    hole_count: getRequestedHoleCount(match),
    nine_hole_segment: getNineHoleSegment(match),
    custom_start_hole: Number(match.customStartHole) || 1,
    team_count: Number(match.teamCount) || 1,
    players_per_team: Number(match.playersPerTeam) || 1,
    scoring_access_mode: normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'team_codes'),
    stat_tracking_enabled: !!match.statTrackingEnabled,
    selected_games: buildSelectedGamesForCloud(match),
    match_status_game: match.matchStatusGame || null,
    momentum_game: match.momentumGame || null,
    momentum_perspective: Number(match.momentumPerspective || 1) === 2 ? 2 : 1,
    locked_after_start: false,
    setup_locked_at: null,
    completed_at: match.completedAt || null,
    last_touched_hole: Number(match.lastTouchedHole || 0) || 0,
    last_fully_completed_hole: Number(match.lastFullyCompletedHole || 0) || 0,
  };
  const scoreEntries = [];
  match.players.forEach((mp, idx) => {
    const matchPlayerId = `${match.sharedMatchId || match.id}:player:${mp.playerId}`;
    const teamId = `${match.sharedMatchId || match.id}:team:${Number(mp.team) || 1}`;
    const holeCount = getRequestedHoleCount(match);
    for (let holeIdx = 0; holeIdx < holeCount; holeIdx += 1) {
      const holeNumber = holeIdx + 1;
      const gross = Number(mp?.scores?.[holeIdx]?.gross);
      const stat = normalizeHoleStat(mp?.stats?.[holeIdx] || {}, holeIdx);
      scoreEntries.push({
        id: `${match.sharedMatchId || match.id}:player:${mp.playerId}:hole:${holeNumber}`,
        match_id: match.sharedMatchId || match.id,
        match_player_id: matchPlayerId,
        player_id: mp.playerId,
        team_id: teamId,
        team_number: Number(mp.team) || 1,
        hole_number: holeNumber,
        gross: Number.isFinite(gross) ? Math.round(gross) : null,
        putts: Number.isFinite(Number(stat.putts)) ? Math.max(0, Math.round(Number(stat.putts))) : null,
        fairway: !!stat.fairway,
        green: !!stat.green,
        up_and_down: !!stat.upAndDown,
        sandy: !!stat.sandy,
        updated_at: createdAt,
        updated_by: organizerUserId,
        entry_status: 'active',
      });
    }
  });
  const notesRow = {
    match_id: match.sharedMatchId || match.id,
    body: String(match.notes || ''),
    updated_at: createdAt,
    updated_by: organizerUserId,
  };
  const membership = organizerUserId ? {
    id: `${match.sharedMatchId || match.id}:member:${organizerUserId}`,
    match_id: match.sharedMatchId || match.id,
    user_id: organizerUserId,
    role: 'organizer',
    team_id: null,
    team_number: null,
    status: 'active',
    joined_at: createdAt,
    last_seen_at: createdAt,
    device_label: navigator.userAgent.slice(0, 180),
  } : null;
  return { matchRow, teams, players, scoreEntries, notesRow, membership };
}
async function uploadSharedMatch(match) {
  const client = await ensureSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const user = await getSupabaseUser();
  const payload = buildCloudMatchPayload(match, user?.id || null);
  let response = await client.from('matches').upsert(payload.matchRow, { onConflict: 'id' });
  if (response.error) throw response.error;
  if (payload.membership) {
    response = await client.from('match_memberships').upsert(payload.membership, { onConflict: 'id' });
    if (response.error) throw response.error;
  }
  response = await client.from('match_teams').delete().eq('match_id', payload.matchRow.id);
  if (response.error) throw response.error;
  response = await client.from('match_teams').insert(payload.teams);
  if (response.error) throw response.error;
  response = await client.from('match_players').delete().eq('match_id', payload.matchRow.id);
  if (response.error) throw response.error;
  response = await client.from('match_players').insert(payload.players);
  if (response.error) throw response.error;
  response = await client.from('score_entries').delete().eq('match_id', payload.matchRow.id);
  if (response.error) throw response.error;
  response = await client.from('score_entries').insert(payload.scoreEntries);
  if (response.error) throw response.error;
  response = await client.from('match_notes').upsert(payload.notesRow, { onConflict: 'match_id' });
  if (response.error) throw response.error;
  match.storageMode = 'shared';
  match.sharedMatchId = payload.matchRow.id;
  match.sharedMatchRef = payload.matchRow.id;
  match.sharedOwnerUserId = user?.id || null;
  match.cloudSyncState = 'cloud-synced';
  match.lastCloudSyncAt = new Date().toISOString();
  rememberSharedMatchId(match.sharedMatchId);
  return match;
}
async function fetchSharedMatchBundle(matchId) {
  const client = await ensureSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const [{ data: matchRow, error: matchError }, { data: teams, error: teamsError }, { data: players, error: playersError }, { data: scoreEntries, error: scoresError }, { data: notesRows, error: notesError }] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).maybeSingle(),
    client.from('match_teams').select('*').eq('match_id', matchId).order('team_number'),
    client.from('match_players').select('*').eq('match_id', matchId).order('team_number').order('slot'),
    client.from('score_entries').select('*').eq('match_id', matchId).order('hole_number'),
    client.from('match_notes').select('*').eq('match_id', matchId).limit(1),
  ]);
  if (matchError) throw matchError;
  if (teamsError) throw teamsError;
  if (playersError) throw playersError;
  if (scoresError) throw scoresError;
  if (notesError) throw notesError;
  if (!matchRow) throw new Error('Shared match not found.');
  const bundle = { matchRow, teams: teams || [], players: players || [], scoreEntries: scoreEntries || [], notes: notesRows?.[0] || null };
  cacheCloudMatchBundle(matchId, bundle);
  return bundle;
}
function ensureImportedCourseFromSnapshot(matchRow) {
  const snapshot = matchRow?.course_snapshot;
  if (!snapshot?.id) return { courseId: matchRow?.course_id || '', teeId: matchRow?.reference_tee_id || '' };
  let course = getCourse(snapshot.id);
  if (!course) {
    course = {
      id: snapshot.id,
      name: snapshot.name || 'Imported Course',
      city: snapshot.city || '',
      state: snapshot.state || '',
      country: snapshot.country || 'United States of America',
      strokeIndexes: Array.isArray(snapshot.strokeIndexes) ? snapshot.strokeIndexes.slice() : null,
      tees: Array.isArray(snapshot.tees) ? snapshot.tees.map(t => JSON.parse(JSON.stringify(t))) : [],
    };
    state.courses.push(course);
  } else if (Array.isArray(snapshot.tees)) {
    const existingIds = new Set((course.tees || []).map(t => t.id));
    snapshot.tees.forEach(tee => {
      if (!existingIds.has(tee.id)) course.tees.push(JSON.parse(JSON.stringify(tee)));
    });
  }
  normalizeState();
  return { courseId: snapshot.id, teeId: matchRow?.reference_tee_id || snapshot.tees?.[0]?.id || '' };
}
function ensureImportedPlayers(playerRows = []) {
  playerRows.forEach(row => {
    if (!row?.player_id) return;
    if (getPlayer(row.player_id)) return;
    state.players.push({ id: row.player_id, name: row.player_name || 'Imported Player', index: Number(row.player_index) || 0 });
  });
}
function hydrateMatchFromCloudBundle(bundle) {
  const { matchRow, teams = [], players = [], scoreEntries = [], notes = null } = bundle || {};
  const courseIds = ensureImportedCourseFromSnapshot(matchRow || {});
  ensureImportedPlayers(players);
  const teamNames = teams.length ? teams.sort((a, b) => Number(a.team_number) - Number(b.team_number)).map(t => t.team_name || `Team ${t.team_number}`) : [];
  const entriesByPlayerHole = new Map();
  (scoreEntries || []).forEach(entry => {
    entriesByPlayerHole.set(`${entry.match_player_id || entry.player_id}:${entry.hole_number}`, entry);
  });
  const holeCount = Number(matchRow?.hole_count) === 9 ? 9 : 18;
  const hydrated = {
    id: matchRow?.id || uid(),
    sharedMatchId: matchRow?.id || uid(),
    sharedMatchRef: matchRow?.id || uid(),
    sharedOwnerUserId: matchRow?.created_by || null,
    storageMode: 'shared',
    cloudSyncState: 'cloud-synced',
    lastCloudSyncAt: new Date().toISOString(),
    date: matchRow?.match_date || todayIso(),
    name: matchRow?.name || 'Round',
    courseId: courseIds.courseId,
    teeId: courseIds.teeId,
    format: matchRow?.format || 'teams',
    allowance: Number(matchRow?.allowance) || 100,
    holeCount,
    nineHoleSegment: String(matchRow?.nine_hole_segment || 'front'),
    customStartHole: Math.max(1, Math.min(10, Number(matchRow?.custom_start_hole) || 1)),
    teamCount: Number(matchRow?.team_count) || Math.max(1, teamNames.length || 1),
    playersPerTeam: Number(matchRow?.players_per_team) || 1,
    teamNames,
    scoringAccessMode: normalizeScoringAccessMode(matchRow?.scoring_access_mode || 'team_codes'),
    officialScorerName: 'Official scorer',
    statTrackingEnabled: !!matchRow?.stat_tracking_enabled,
    teamScorers: buildTeamScorerAssignments(Number(matchRow?.team_count) || Math.max(1, teamNames.length || 1), teamNames, []),
    notes: String(notes?.body || ''),
    selectedGames: normalizeSelectedGamesOrder(matchRow?.selected_games || []),
    status: matchRow?.status || 'active',
    completedAt: matchRow?.completed_at || null,
    players: (players || []).map((row, idx) => ({
      playerId: row.player_id,
      team: Number(row.team_number) || 1,
      slot: Number.isFinite(Number(row.slot)) ? Number(row.slot) : idx,
      teeId: row.tee_id || courseIds.teeId,
      scores: Array.from({ length: holeCount }, (_, scoreIdx) => {
        const holeNumber = scoreIdx + 1;
        const entry = entriesByPlayerHole.get(`${row.id}:${holeNumber}`) || entriesByPlayerHole.get(`${row.player_id}:${holeNumber}`);
        return { holeNumber, gross: Number(entry?.gross) || null };
      }),
      stats: Array.from({ length: holeCount }, (_, statIdx) => {
        const holeNumber = statIdx + 1;
        const entry = entriesByPlayerHole.get(`${row.id}:${holeNumber}`) || entriesByPlayerHole.get(`${row.player_id}:${holeNumber}`) || {};
        return normalizeHoleStat({
          holeNumber,
          fairway: !!entry.fairway,
          green: !!entry.green,
          putts: Number.isFinite(Number(entry.putts)) ? Number(entry.putts) : null,
          penaltyStrokes: Number.isFinite(Number(entry.penalty_strokes ?? entry.penaltyStrokes)) ? Number(entry.penalty_strokes ?? entry.penaltyStrokes) : 0,
          upAndDown: !!entry.up_and_down,
          sandy: !!entry.sandy,
        }, statIdx);
      }),
    })),
    greeniesWinners: extractGreeniesWinnersFromSelectedGames(matchRow?.selected_games || []),
    matchStatusGame: matchRow?.match_status_game || getDefaultFeaturedGameKey(matchRow?.selected_games || []),
    momentumGame: matchRow?.momentum_game || matchRow?.match_status_game || getDefaultFeaturedGameKey(matchRow?.selected_games || []),
    momentumPerspective: Number(matchRow?.momentum_perspective || 1) === 2 ? 2 : 1,
    activeScoreRole: 'official_scorer',
    activeScoreTeam: 1,
    lastTouchedHole: Number(matchRow?.last_touched_hole || 0) || 0,
    lastFullyCompletedHole: Number(matchRow?.last_fully_completed_hole || 0) || 0,
  };
  normalizeMatch(hydrated);
  if (notes?.body && !state.notes) state.notes = String(notes.body);
  return hydrated;
}
function setLastOpenedSharedMatch(matchOrId = null) {
  const match = typeof matchOrId === 'string' ? getMatch(matchOrId) : matchOrId;
  const sharedId = match?.sharedMatchId || match?.sharedMatchRef || (typeof matchOrId === 'string' ? String(matchOrId || '').trim() : '');
  state.lastOpenedSharedMatchId = sharedId || null;
}
function upsertLocalMatch(match) {
  normalizeMatch(match);
  const existingIdx = state.matches.findIndex(m => m.id === match.id);
  if (existingIdx >= 0) state.matches[existingIdx] = match;
  else state.matches.push(match);
  rememberSharedMatchId(match.sharedMatchId || match.id);
  if (match.storageMode === 'shared') setLastOpenedSharedMatch(match);
  return match;
}
async function loadSharedMatchFromCloud(matchId, { activate = true, silent = false } = {}) {
  const cloudId = String(matchId || '').trim();
  if (!cloudId) throw new Error('Enter a shared match ID.');
  let bundle = null;
  try {
    bundle = await fetchSharedMatchBundle(cloudId);
  } catch (err) {
    bundle = readCachedCloudMatchBundle(cloudId);
    if (!bundle) throw err;
  }
  const hydrated = hydrateMatchFromCloudBundle(bundle);
  upsertLocalMatch(hydrated);
  if (activate) {
    state.activeMatchId = hydrated.id;
    setLastOpenedSharedMatch(hydrated);
    currentHole = Math.min(getRequestedHoleCount(hydrated), Math.max(1, completedHoles(hydrated) || 1));
  }
  persist({ skipRender: true });
  renderAll();
  if (!silent) toast('Shared match loaded from Supabase.');
  return hydrated;
}

function clearScheduledSharedMatchSync(matchId) {
  const existing = sharedMatchSyncTimers.get(matchId);
  if (existing) {
    window.clearTimeout(existing);
    sharedMatchSyncTimers.delete(matchId);
  }
}
async function flushSharedMatchSync(matchId, { silent = true } = {}) {
  if (!matchId) return;
  const match = getMatch(matchId);
  if (!match || match.storageMode !== 'shared' || !hasSupabaseConfig()) return;
  if (sharedMatchSyncInflight.has(matchId)) {
    sharedMatchSyncDirty.set(matchId, true);
    try { await sharedMatchSyncInflight.get(matchId); } catch {}
    return;
  }
  match.cloudSyncState = 'syncing';
  persist({ skipRender: true });
  const task = (async () => {
    try {
      await uploadSharedMatch(match);
      setLastOpenedSharedMatch(match);
      persist({ skipRender: true });
      if (!silent) toast('Shared match synced.');
    } catch (err) {
      console.error(err);
      match.cloudSyncState = 'local-cache';
      persist({ skipRender: true });
      if (!silent) toast('Cloud sync failed. Changes are still stored locally on this device.');
    }
  })();
  sharedMatchSyncInflight.set(matchId, task);
  try {
    await task;
  } finally {
    sharedMatchSyncInflight.delete(matchId);
    if (sharedMatchSyncDirty.get(matchId)) {
      sharedMatchSyncDirty.delete(matchId);
      await flushSharedMatchSync(matchId, { silent: true });
    }
  }
}
function scheduleSharedMatchSync(matchOrId, { immediate = false, silent = true } = {}) {
  const matchId = typeof matchOrId === 'string' ? matchOrId : (matchOrId?.id || null);
  if (!matchId) return;
  const match = typeof matchOrId === 'string' ? getMatch(matchId) : matchOrId;
  if (!match || match.storageMode !== 'shared' || !hasSupabaseConfig()) return;
  setLastOpenedSharedMatch(match);
  if (sharedMatchSyncInflight.has(matchId)) {
    sharedMatchSyncDirty.set(matchId, true);
    match.cloudSyncState = 'pending-sync';
    persist({ skipRender: true });
    return;
  }
  clearScheduledSharedMatchSync(matchId);
  const delay = immediate ? 0 : SHARED_MATCH_SYNC_DEBOUNCE_MS;
  match.cloudSyncState = immediate ? 'syncing' : 'pending-sync';
  persist({ skipRender: true });
  const timer = window.setTimeout(() => {
    sharedMatchSyncTimers.delete(matchId);
    flushSharedMatchSync(matchId, { silent });
  }, delay);
  sharedMatchSyncTimers.set(matchId, timer);
}

window.addEventListener('pagehide', () => {
  const active = getActiveMatch();
  if (!active || active.storageMode !== 'shared') return;
  try { applyCurrentHoleDomToMatch(active); } catch (err) {}
  persist({ skipRender: true });
  scheduleSharedMatchSync(active, { immediate: true, silent: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  const active = getActiveMatch();
  if (!active || active.storageMode !== 'shared') return;
  try { applyCurrentHoleDomToMatch(active); } catch (err) {}
  persist({ skipRender: true });
  scheduleSharedMatchSync(active, { immediate: true, silent: true });
});

function getCourseLibraryStatusMessage() {
  if (uiState.cloudCoursesLoading) return 'Loading cloud course library… manual setup remains available.';
  if (uiState.cloudCoursesStatus) return uiState.cloudCoursesStatus;
  return hasSupabaseConfig()
    ? 'Cloud course library connected. Manual setup remains available.'
    : 'Supabase not configured. Manual course entry remains available.';
}
function getCourseLibraryStatusClass(message = '') {
  const text = String(message || '').toLowerCase();
  if (text.includes('loading') || text.includes('syncing')) return 'is-loading';
  if (text.includes('loaded') || text.includes('connected') || text.includes('configured, but no courses')) return 'is-connected';
  if (text.includes('not configured')) return 'is-not-configured';
  return 'is-unavailable';
}
function isCourseCloudReachableStatus(message = '') {
  if (!hasSupabaseConfig() || uiState.cloudCoursesLoading) return false;
  const text = String(message || '').toLowerCase();
  if (!text) return true;
  return !(text.includes('could not') || text.includes('offline') || text.includes('unavailable') || text.includes('not configured'));
}
function renderLocalCourseSyncResult(summary) {
  const targets = ['localCourseSyncResult', 'localCourseSyncResultCourses']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!targets.length) return;
  if (!summary) {
    targets.forEach(el => {
      el.classList.add('hidden');
      el.innerHTML = '';
    });
    return;
  }
  const uploaded = Number(summary.uploaded) || 0;
  const updated = Number(summary.updated) || 0;
  const current = Number(summary.current ?? summary.existed) || 0;
  const failed = Number(summary.failed) || 0;
  const details = Array.isArray(summary.errors) && summary.errors.length
    ? `<details class="top-gap"><summary>View Details</summary><ul class="tight-list">${summary.errors.slice(0, 8).map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></details>`
    : '';
  const html = `<strong>Course Sync Complete</strong><br>${uploaded} courses uploaded<br>${updated} courses updated<br>${current} already current<br>${failed} failed${details}`;
  targets.forEach(el => {
    el.classList.remove('hidden');
    el.innerHTML = html;
  });
}


function getScorecardImportEndpoint() {
  const configured = String(SUPABASE_CONFIG.scorecardImportEndpoint || SUPABASE_CONFIG.scorecard_import_endpoint || '').trim();
  if (configured) return configured;
  const url = String(SUPABASE_CONFIG.url || '').replace(/\/$/, '');
  return url ? `${url}/functions/v1/scorecard-import` : '';
}
function getScorecardImportHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = String(SUPABASE_CONFIG.anonKey || SUPABASE_CONFIG.anon_key || '').trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers.apikey = key;
  }
  return headers;
}
function isSupportedScorecardFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return type === 'application/pdf' || type.startsWith('image/') || /\.(pdf|png|jpe?g|heic|heif)$/i.test(name);
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function getScorecardImportFiles() {
  return Array.isArray(uiState.scorecardImportFiles) ? uiState.scorecardImportFiles : [];
}
function getScorecardImportFileLabel(file, idx) {
  if (file?.label) return file.label;
  if (idx === 0) return 'Front / Page 1';
  if (idx === 1) return 'Back / Page 2';
  return `Page ${idx + 1}`;
}
function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
function scorecardImportFileKey(file) {
  return [file?.name || 'scorecard', file?.size || 0, file?.lastModified || 0].join('|');
}
function addScorecardImportFiles(fileList) {
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;
  const existing = getScorecardImportFiles();
  const existingKeys = new Set(existing.map(scorecardImportFileKey));
  const accepted = [];
  const rejected = [];
  incoming.forEach(file => {
    if (!isSupportedScorecardFile(file)) {
      rejected.push(file?.name || 'Unsupported file');
      return;
    }
    const key = scorecardImportFileKey(file);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      accepted.push(file);
    }
  });
  uiState.scorecardImportFiles = existing.concat(accepted);
  uiState.scorecardImportFileName = uiState.scorecardImportFiles.map(f => f.name || 'Scorecard file').join(', ');
  if (rejected.length) uiState.scorecardImportStatus = 'Unsupported file type. Please choose PDF, PNG, JPG, JPEG, or HEIC files.';
  else if (accepted.length) uiState.scorecardImportStatus = `${uiState.scorecardImportFiles.length} file${uiState.scorecardImportFiles.length === 1 ? '' : 's'} selected. Tap Analyze Scorecard when ready.`;
  renderScorecardImportSelection();
  updateScorecardImportStatus();
}
function removeScorecardImportFile(index) {
  uiState.scorecardImportFiles = getScorecardImportFiles().filter((_, idx) => idx !== index);
  uiState.scorecardImportFileName = uiState.scorecardImportFiles.map(f => f.name || 'Scorecard file').join(', ');
  uiState.scorecardImportStatus = uiState.scorecardImportFiles.length
    ? `${uiState.scorecardImportFiles.length} file${uiState.scorecardImportFiles.length === 1 ? '' : 's'} selected. Tap Analyze Scorecard when ready.`
    : 'Add one or more scorecard photos/files to begin.';
  renderScorecardImportSelection();
  updateScorecardImportStatus();
}
function clearScorecardImportFiles() {
  uiState.scorecardImportFiles = [];
  uiState.scorecardImportFileName = '';
  uiState.scorecardImportData = null;
  uiState.scorecardImportStatus = 'Add one or more scorecard photos/files to begin.';
  renderScorecardImportSelection();
  renderScorecardImportReview();
  updateScorecardImportStatus();
}
function renderScorecardImportSelection() {
  const el = document.getElementById('scorecardImportSelection');
  if (!el) return;
  const files = getScorecardImportFiles();
  if (!files.length) {
    el.innerHTML = '<div class="tiny">No scorecard files selected yet. Add a front/back photo, PDF, or image file.</div>';
    return;
  }
  el.innerHTML = `
    <div class="scorecard-import-selection-card">
      <div class="strong">Selected files</div>
      <ol class="scorecard-import-file-list">
        ${files.map((file, idx) => `
          <li class="scorecard-import-file-row">
            <div class="scorecard-import-file-meta">
              <strong>${escapeHtml(getScorecardImportFileLabel(file, idx))}</strong>
              <span>${escapeHtml(file.name || 'Scorecard file')} · ${formatFileSize(file.size)}</span>
            </div>
            <button type="button" class="secondary mini" data-remove-scorecard-file="${idx}">Remove</button>
          </li>`).join('')}
      </ol>
    </div>`;
}
function normalizeImportedHole(raw, holeNumber) {
  const par = Number(raw?.par);
  const strokeIndex = Number(raw?.strokeIndex ?? raw?.handicapIndex ?? raw?.handicap ?? raw?.si);
  const yardage = Number(raw?.yardage ?? raw?.yards);
  return {
    holeNumber: Number(raw?.holeNumber ?? raw?.hole ?? holeNumber) || holeNumber,
    par: Number.isFinite(par) && par > 0 ? par : null,
    strokeIndex: Number.isFinite(strokeIndex) && strokeIndex > 0 ? strokeIndex : null,
    yardage: Number.isFinite(yardage) && yardage > 0 ? yardage : null,
  };
}
function getImportedCommonHole(rawCourse, holeNumber) {
  const holes = Array.isArray(rawCourse?.holes) ? rawCourse.holes : [];
  return holes.find(h => Number(h?.holeNumber ?? h?.hole) === holeNumber) || {};
}
function normalizeScorecardImportResult(raw) {
  const root = raw?.course ? raw.course : raw;
  const courseName = String(root?.courseName || root?.name || raw?.courseName || '').trim();
  const holeCount = Number(root?.holeCount || root?.holesCount || (Array.isArray(root?.holes) ? root.holes.length : 18)) || 18;
  const cappedHoleCount = Math.max(1, Math.min(36, holeCount));
  const commonHoles = Array.from({ length: cappedHoleCount }, (_, idx) => normalizeImportedHole(getImportedCommonHole(root, idx + 1), idx + 1));
  const rawTees = Array.isArray(root?.tees) ? root.tees : Array.isArray(root?.teeBoxes) ? root.teeBoxes : [];
  let tees = rawTees.map((tee, teeIdx) => {
    const teeHoles = Array.isArray(tee?.holes) ? tee.holes : [];
    const yardsByHole = Array.isArray(tee?.yardages) ? tee.yardages : Array.isArray(tee?.yards) ? tee.yards : [];
    const holes = commonHoles.map((common, idx) => {
      const rawHole = teeHoles.find(h => Number(h?.holeNumber ?? h?.hole) === idx + 1) || teeHoles[idx] || {};
      const merged = { ...common, ...rawHole };
      if ((merged.yardage === null || merged.yardage === undefined) && yardsByHole[idx] !== undefined) merged.yardage = yardsByHole[idx];
      const normalized = normalizeImportedHole(merged, idx + 1);
      if (!normalized.par && common.par) normalized.par = common.par;
      if (!normalized.strokeIndex && common.strokeIndex) normalized.strokeIndex = common.strokeIndex;
      return normalized;
    });
    const rating = Number(tee?.rating ?? tee?.courseRating);
    const slope = Number(tee?.slope ?? tee?.slopeRating);
    const totalYards = Number(tee?.totalYardage ?? tee?.totalYards ?? tee?.yardsTotal);
    return {
      id: uid(),
      teeName: String(tee?.teeName || tee?.name || `Tee ${teeIdx + 1}`).trim(),
      gender: String(tee?.gender || 'M'),
      isCombo: false,
      comboSources: [],
      length: Number.isFinite(totalYards) && totalYards > 0 ? totalYards : null,
      par: holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0) || null,
      rating: Number.isFinite(rating) ? rating : null,
      slope: Number.isFinite(slope) ? slope : null,
      holes,
      source: 'scorecard-import',
    };
  }).filter(t => t.teeName);
  if (!tees.length) {
    tees = [{
      id: uid(), teeName: 'Imported Tee', gender: 'M', isCombo: false, comboSources: [], length: null,
      par: commonHoles.reduce((sum, h) => sum + (Number(h.par) || 0), 0) || null,
      rating: null, slope: null, holes: commonHoles, source: 'scorecard-import'
    }];
  }
  tees.forEach(t => normalizeTee(t, courseName || 'Imported Course'));
  const confidence = Number(root?.confidence ?? raw?.confidence ?? 0);
  return {
    name: courseName,
    city: String(root?.city || '').trim(),
    state: String(root?.state || '').trim(),
    country: String(root?.country || '').trim() || 'United States of America',
    holeCount: cappedHoleCount,
    totalPar: Number(root?.totalPar || root?.parTotal) || (tees[0]?.holes || []).reduce((sum, h) => sum + (Number(h.par) || 0), 0) || null,
    tees,
    confidence: Number.isFinite(confidence) && confidence > 0 ? Math.round(confidence) : null,
    uncertainFields: Array.isArray(root?.uncertainFields) ? root.uncertainFields : Array.isArray(raw?.uncertainFields) ? raw.uncertainFields : [],
  };
}
async function requestAiScorecardExtraction(filesOrFile) {
  const endpoint = getScorecardImportEndpoint();
  if (!endpoint) throw new Error('AI scorecard import is not configured.');
  const files = Array.isArray(filesOrFile) ? filesOrFile.filter(Boolean) : [filesOrFile].filter(Boolean);
  if (!files.length) throw new Error('No scorecard file was selected.');
  const unsupported = files.find(file => !isSupportedScorecardFile(file));
  if (unsupported) throw new Error('Unsupported file type. Please choose a PDF, PNG, JPG, JPEG, or HEIC file.');
  const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const maxBytes = 24 * 1024 * 1024;
  if (totalBytes > maxBytes) throw new Error('These files are too large to import at once. Please use fewer or smaller images.');
  const encodedFiles = await Promise.all(files.map(async (file, idx) => ({
    fileName: file.name || `scorecard-${idx + 1}`,
    mimeType: file.type || 'application/octet-stream',
    dataUrl: await fileToDataUrl(file),
    label: getScorecardImportFileLabel(file, idx),
  })));
  const body = encodedFiles.length === 1 ? {
    fileName: encodedFiles[0].fileName,
    mimeType: encodedFiles[0].mimeType,
    dataUrl: encodedFiles[0].dataUrl,
    requestedSchema: 'the-dye-ledger-scorecard-v1',
  } : {
    files: encodedFiles,
    requestedSchema: 'the-dye-ledger-scorecard-v1',
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getScorecardImportHeaders(),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = null; }
  if (!response.ok) throw new Error(payload?.error || payload?.message || text || 'AI extraction failed.');
  const extracted = payload?.extracted || payload?.course || payload;
  return normalizeScorecardImportResult(extracted);
}
function collectScorecardImportReviewData() {
  const wrap = document.getElementById('scorecardImportReview');
  if (!wrap) return null;
  const courseName = String(wrap.querySelector('[data-import-field="name"]')?.value || '').trim();
  const city = String(wrap.querySelector('[data-import-field="city"]')?.value || '').trim();
  const stateValue = String(wrap.querySelector('[data-import-field="state"]')?.value || '').trim();
  const country = String(wrap.querySelector('[data-import-field="country"]')?.value || '').trim() || 'United States of America';
  const teeCards = Array.from(wrap.querySelectorAll('[data-import-tee]'));
  const tees = teeCards.map((card, idx) => {
    const teeName = String(card.querySelector('[data-tee-field="teeName"]')?.value || `Tee ${idx + 1}`).trim();
    const rating = Number(card.querySelector('[data-tee-field="rating"]')?.value);
    const slope = Number(card.querySelector('[data-tee-field="slope"]')?.value);
    const holes = Array.from(card.querySelectorAll('[data-import-hole]')).map(row => {
      const holeNumber = Number(row.dataset.importHole) || 1;
      const par = Number(row.querySelector('[data-hole-field="par"]')?.value);
      const strokeIndex = Number(row.querySelector('[data-hole-field="strokeIndex"]')?.value);
      const yardage = Number(row.querySelector('[data-hole-field="yardage"]')?.value);
      return {
        holeNumber,
        par: Number.isFinite(par) && par > 0 ? par : null,
        strokeIndex: Number.isFinite(strokeIndex) && strokeIndex > 0 ? strokeIndex : null,
        yardage: Number.isFinite(yardage) && yardage > 0 ? yardage : null,
      };
    });
    const tee = {
      id: uid(),
      courseName,
      teeName,
      gender: 'M',
      isCombo: false,
      comboSources: [],
      length: holes.reduce((sum, h) => sum + (Number(h.yardage) || 0), 0) || null,
      par: holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0) || null,
      rating: Number.isFinite(rating) ? rating : null,
      slope: Number.isFinite(slope) ? slope : null,
      holes,
      source: 'scorecard-import',
    };
    normalizeTee(tee, courseName || 'Imported Course');
    return tee;
  }).filter(t => t.teeName);
  return { courseName, city, state: stateValue, country, tees };
}
function saveImportedScorecardCourse() {
  const reviewed = collectScorecardImportReviewData();
  if (!reviewed?.courseName) return toast('Course name is required before saving.');
  if (!reviewed.tees.length) return toast('At least one tee is required before saving.');
  const course = {
    id: uid(),
    name: reviewed.courseName,
    city: reviewed.city,
    state: reviewed.state,
    country: reviewed.country,
    tees: reviewed.tees,
    strokeIndexes: extractStrokeTemplate(reviewed.tees[0]?.holes || []) || null,
    source: 'scorecard-import',
    cloudSyncState: 'pending-sync',
    cloudSyncError: '',
    importedAt: new Date().toISOString(),
  };
  course.tees.forEach(t => { t.courseName = course.name; normalizeTee(t, course.name); });
  state.courses.push(course);
  markCoursePendingSync(course);
  uiState.expandedCourses.add(course.id);
  uiState.scorecardImportStatus = 'Course saved locally. Use Sync Course Library to upload it to the cloud.';
  uiState.scorecardImportData = null;
  uiState.scorecardImportFiles = [];
  uiState.scorecardImportFileName = '';
  persist();
  renderAll();
  scheduleCourseSync(course, { silent: true });
  toast('Course saved locally.');
}
function renderScorecardImportReview() {
  const el = document.getElementById('scorecardImportReview');
  if (!el) return;
  const data = uiState.scorecardImportData;
  if (!data) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const confidence = data.confidence ? `<div class="import-confidence"><strong>Confidence:</strong> ${escapeHtml(data.confidence)}%</div>` : '<div class="import-confidence"><strong>Confidence:</strong> Review required</div>';
  const uncertain = Array.isArray(data.uncertainFields) && data.uncertainFields.length
    ? `<div class="tiny warning-text">Please review: ${data.uncertainFields.slice(0, 8).map(escapeHtml).join(', ')}</div>`
    : '<div class="tiny">Review and correct the imported course before saving.</div>';
  const teeHtml = data.tees.map((tee, teeIdx) => `
    <details class="import-tee-card" data-import-tee="${teeIdx}" open>
      <summary><strong>${escapeHtml(tee.teeName || `Tee ${teeIdx + 1}`)}</strong> <span class="tiny">${Number(tee.par) || '—'} par · ${getTeeTotalYardage(tee) ? formatYardageValue(getTeeTotalYardage(tee)) : '—'} yds</span></summary>
      <div class="grid three compact-grid top-gap">
        <label><span>Tee name</span><input data-tee-field="teeName" value="${escapeHtml(tee.teeName || '')}" /></label>
        <label><span>Rating</span><input data-tee-field="rating" type="number" step="0.1" value="${tee.rating ?? ''}" /></label>
        <label><span>Slope</span><input data-tee-field="slope" type="number" step="1" value="${tee.slope ?? ''}" /></label>
      </div>
      <div class="scorecard-import-hole-grid top-gap">
        <div class="scorecard-import-hole-head">Hole</div><div class="scorecard-import-hole-head">Par</div><div class="scorecard-import-hole-head">Hcp</div><div class="scorecard-import-hole-head">Yds</div>
        ${(tee.holes || []).map(h => `
          <div class="scorecard-import-hole-row" data-import-hole="${Number(h.holeNumber) || 1}">
            <div class="scorecard-import-hole-num">${Number(h.holeNumber) || 1}</div>
            <input data-hole-field="par" type="number" inputmode="numeric" value="${h.par ?? ''}" />
            <input data-hole-field="strokeIndex" type="number" inputmode="numeric" value="${h.strokeIndex ?? ''}" />
            <input data-hole-field="yardage" type="number" inputmode="numeric" value="${h.yardage ?? ''}" />
          </div>`).join('')}
      </div>
    </details>`).join('');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="item compact-item scorecard-import-review-card">
      <div class="item-header compact-item-header"><div><h3>Review Imported Course</h3><div class="tiny">${escapeHtml(uiState.scorecardImportFileName || 'Scorecard import')}</div></div></div>
      ${confidence}
      ${uncertain}
      <div class="grid two compact-grid top-gap">
        <label><span>Course name</span><input data-import-field="name" value="${escapeHtml(data.name || '')}" required /></label>
        <label><span>City</span><input data-import-field="city" value="${escapeHtml(data.city || '')}" /></label>
        <label><span>State</span><input data-import-field="state" value="${escapeHtml(data.state || '')}" /></label>
        <label><span>Country</span><input data-import-field="country" value="${escapeHtml(data.country || 'United States of America')}" /></label>
      </div>
      ${teeHtml}
      <div class="actions wrap top-gap">
        <button id="saveImportedScorecardCourseBtn" type="button">Save Course</button>
        <button id="editImportedScorecardManuallyBtn" type="button" class="secondary">Edit Manually</button>
        <button id="cancelImportedScorecardBtn" type="button" class="secondary">Cancel</button>
      </div>
    </div>`;
  document.getElementById('saveImportedScorecardCourseBtn')?.addEventListener('click', saveImportedScorecardCourse);
  document.getElementById('editImportedScorecardManuallyBtn')?.addEventListener('click', () => {
    const reviewed = collectScorecardImportReviewData();
    document.querySelector('#courseForm [name="name"]').value = reviewed?.courseName || data.name || '';
    document.querySelector('#courseForm [name="city"]').value = reviewed?.city || data.city || '';
    document.querySelector('#courseForm [name="state"]').value = reviewed?.state || data.state || '';
    document.querySelector('#courseForm [name="country"]').value = reviewed?.country || data.country || 'United States of America';
    document.querySelector('[data-tab="courses"]')?.click();
    toast('Imported course copied to manual editor.');
  });
  document.getElementById('cancelImportedScorecardBtn')?.addEventListener('click', () => {
    uiState.scorecardImportData = null;
    uiState.scorecardImportFiles = [];
    uiState.scorecardImportFileName = '';
    uiState.scorecardImportStatus = '';
    renderScorecardImportSelection();
    renderScorecardImportReview();
    updateScorecardImportStatus();
  });
}
function updateScorecardImportStatus() {
  const status = document.getElementById('scorecardImportStatus');
  if (!status) return;
  const message = uiState.scorecardImportStatus || 'Upload a scorecard image or PDF. AI extraction requires the scorecard-import service to be configured.';
  status.textContent = message;
  status.className = `tiny top-gap ${uiState.scorecardImportLoading ? 'is-loading' : ''}`;
}
async function analyzeSelectedScorecardImportFiles() {
  const files = getScorecardImportFiles();
  if (!files.length) return toast('Add at least one scorecard photo or file first.');
  uiState.scorecardImportLoading = true;
  uiState.scorecardImportFileName = files.map(f => f.name || 'Scorecard file').join(', ');
  uiState.scorecardImportStatus = files.length === 1 ? 'Reading scorecard with AI…' : `Reading ${files.length} scorecard files with AI…`;
  updateScorecardImportStatus();
  renderScorecardImportReview();
  try {
    const imported = await requestAiScorecardExtraction(files);
    if (!imported?.name && !(imported?.tees || []).length) throw new Error('Could not extract usable course data.');
    uiState.scorecardImportData = imported;
    uiState.scorecardImportStatus = 'Import complete. Review before saving.';
    renderScorecardImportReview();
    updateScorecardImportStatus();
    toast('Scorecard imported. Review before saving.');
  } catch (err) {
    console.warn('Scorecard import failed:', err);
    uiState.scorecardImportData = null;
    uiState.scorecardImportStatus = `${err?.message || 'Could not read this scorecard.'} Please try clearer images or complete the course manually.`;
    renderScorecardImportReview();
    updateScorecardImportStatus();
    toast('Could not read this scorecard.', 3000);
  } finally {
    uiState.scorecardImportLoading = false;
    updateScorecardImportStatus();
  }
}
function handleScorecardImportFiles(fileList) {
  addScorecardImportFiles(fileList);
}

function updateCloudConfigUi() {
  const status = document.getElementById('supabaseStatus');
  const detail = document.getElementById('supabaseStatusDetail');
  const shareToggle = document.getElementById('sharedMatchEnabled');
  const shareHint = document.getElementById('sharedMatchHint');
  const loadBtn = document.getElementById('loadSharedMatchBtn');
  const refreshBtn = document.getElementById('refreshSharedMatchBtn');
  const configured = hasSupabaseConfig();
  if (status) status.textContent = configured ? 'Configured' : 'Not configured';
  if (detail) detail.textContent = configured ? 'Supabase cloud save is ready. Anonymous auth will initialize when you create or load a shared match.' : 'Add your Supabase URL and anon key in supabase-config.js to enable shared matches.';
  if (shareToggle) shareToggle.disabled = !configured;
  if (shareHint) shareHint.textContent = configured ? 'Shared matches save the organizer-created round foundation to Supabase and keep a local fallback cache on this device.' : 'Shared matches are unavailable until supabase-config.js is filled in.';
  if (loadBtn) loadBtn.disabled = !configured;
  if (refreshBtn) refreshBtn.disabled = !configured;
}
function renderAll() {
  renderPlayers();
  renderCourses();
  renderMatches();
  renderCurrentMatch();
  renderLeaderboard();
  renderMatchSetupState();
  populateCourseSelects();
  populateCalcPlayers();
  populateCalcCourses();
  preserveMatchSetupUi();
  renderSetupHandicapPreview();
  const versionEl = document.getElementById('appVersionLabel'); if (versionEl) versionEl.textContent = APP_VERSION;
  const footerVersionEl = document.getElementById('appVersionFooter'); if (footerVersionEl) footerVersionEl.textContent = APP_VERSION;
  const notesBox = document.getElementById('notesBox'); if (notesBox && notesBox.value !== state.notes) notesBox.value = state.notes || '';
  const coursesSearchInput = document.getElementById('coursesSearchInput');
  if (coursesSearchInput && coursesSearchInput.value !== uiState.courseSearch) coursesSearchInput.value = uiState.courseSearch;
  syncNewMatchConflictUi();
  updateCloudConfigUi();
  renderScorecardImportReview();
  updateScorecardImportStatus();
  scheduleTeamPayoutSplitPaneSync();
}


function renderPlayers() {
  const el = document.getElementById('playersList');
  if (!state.players.length) {
    el.innerHTML = '<div class="tiny">No players saved yet.</div>';
    return;
  }
  el.innerHTML = state.players.map(p => `
    <div class="item compact-item">
      <div class="item-header compact-item-header">
        <div>
          <div class="item-title">${escapeHtml(p.name)}</div>
          <div class="muted">Index ${Number(p.index).toFixed(1)}</div>
        </div>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-player="${p.id}">Edit</button>
          <button class="secondary" data-delete-player="${p.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

function strokeIndexSummary(holes, course) {
  const filled = holes.filter(h => h.strokeIndex);
  if (filled.length) return `${filled.length} hole indexes saved`;
  return getCourseStrokeTemplate(course) ? 'Using course default stroke indexes' : 'No stroke indexes yet';
}
function renderCourses() {
  const el = document.getElementById('coursesList');
  const cloudStatus = document.getElementById('cloudCoursesStatus');
  const setupCloudStatus = document.getElementById('setupCourseLibraryStatus');
  const moreCloudStatus = document.getElementById('cloudCoursesStatusMore');
  const cloudBtn = document.getElementById('refreshCloudCoursesBtn');
  const syncLocalCoursesBtn = document.getElementById('syncLocalCoursesBtn');
  const syncLocalCoursesMoreBtn = document.getElementById('syncLocalCoursesMoreBtn');
  const cloudCourseSyncActions = document.getElementById('cloudCourseSyncActions');
  const cloudCourseSyncUnavailable = document.getElementById('cloudCourseSyncUnavailable');
  const statusMessage = getCourseLibraryStatusMessage();
  const statusClass = getCourseLibraryStatusClass(statusMessage);
  const cloudReachable = isCourseCloudReachableStatus(statusMessage);
  [cloudStatus, setupCloudStatus, moreCloudStatus].filter(Boolean).forEach(node => {
    node.textContent = statusMessage;
    node.className = `course-library-status tiny top-gap ${statusClass}`;
  });
  if (cloudBtn) cloudBtn.disabled = uiState.cloudCoursesLoading || !hasSupabaseConfig();
  [syncLocalCoursesBtn, syncLocalCoursesMoreBtn].filter(Boolean).forEach(btn => {
    btn.disabled = uiState.cloudCoursesLoading || !cloudReachable;
  });
  if (cloudCourseSyncActions) cloudCourseSyncActions.classList.toggle('hidden', !cloudReachable);
  if (cloudCourseSyncUnavailable) {
    cloudCourseSyncUnavailable.classList.toggle('hidden', cloudReachable);
    cloudCourseSyncUnavailable.textContent = hasSupabaseConfig() ? 'Cloud sync unavailable. Local courses are still available.' : 'Cloud sync unavailable. Local courses are still available.';
  }
  const query = getCourseSearchValue();
  const courses = state.courses.filter(c => {
    if (!query) return true;
    const location = [c.city, c.state, c.country].filter(Boolean).join(' ').toLowerCase();
    const teeText = (Array.isArray(c.tees) ? c.tees : []).map(t => [t.teeName, t.gender === 'F' ? 'women' : 'men', t.isCombo ? 'combo' : ''].join(' ')).join(' ').toLowerCase();
    return `${String(c.name || '').toLowerCase()} ${location} ${teeText}`.includes(query);
  });
  if (!state.courses.length) {
    el.innerHTML = '<div class="tiny">No courses saved yet.</div>';
    return;
  }
  if (!courses.length) {
    el.innerHTML = '<div class="tiny">No courses match your search.</div>';
    return;
  }
  el.innerHTML = courses.map(c => {
    const expanded = query ? true : uiState.expandedCourses.has(c.id);
    const sortedTees = getSortedTeesByYardage(c);
    return `
    <div class="item compact-item course-card ${expanded ? 'expanded' : 'collapsed'}">
      <div class="item-header compact-item-header course-card-header">
        <button type="button" class="course-expand-btn" data-toggle-course="${c.id}" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="course-expand-icon">${expanded ? '▾' : '▸'}</span>
          <span>
            <span class="item-title">${escapeHtml(c.name)}</span>
            <span class="muted course-meta-line">${escapeHtml([c.city, c.state].filter(Boolean).join(', ') || c.country || 'Course')}</span>
            <span class="tiny course-meta-line">${sortedTees.length} tee${sortedTees.length === 1 ? '' : 's'}</span>
          </span>
        </button>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-course="${c.id}">Edit course</button>
          <button class="secondary" data-delete-course="${c.id}">Delete</button>
          <button class="secondary" data-new-tee="${c.id}">Add tee</button>
        </div>
      </div>
      <div class="top-gap ${expanded ? '' : 'hidden'}" data-course-tee-panel="${c.id}">
        ${sortedTees.length ? sortedTees.map(t => `
          <div class="tee-block">
            <div class="strong">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'}${t.isCombo ? ' · Combo' : ''}</div>
            <div class="tiny">Par ${t.par} · Rating ${formatRatingValue(t.rating)} · Slope ${t.slope}${getTeeTotalYardage(t) ? ` · ${formatYardageValue(getTeeTotalYardage(t))} yds` : ''}</div>
            <div class="tiny">${strokeIndexSummary(t.holes, c)}</div>
            <div class="actions wrap compact-actions top-gap">
              <button class="secondary" data-edit-tee="${c.id}|${t.id}">Edit tee</button>
              <button class="secondary" data-copy-tee="${c.id}|${t.id}">Copy tee</button>
              <button class="secondary" data-delete-tee="${c.id}|${t.id}">Delete tee</button>
            </div>
          </div>
        `).join('') : '<div class="tiny">No tees saved yet.</div>'}
      </div>
    </div>`;
  }).join('');
}


function renderMatches() {
  const el = document.getElementById('matchesList');
  if (!state.matches.length) {
    el.innerHTML = '<div class="tiny">No matches saved yet.</div>';
    return;
  }
  el.innerHTML = state.matches.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(match => {
    const course = getCourse(match.courseId);
    const tee = getTee(match.courseId, match.teeId);
    const metrics = computeMatchMetrics(match);
    const status = match.status === 'complete' ? 'Complete' : (state.activeMatchId === match.id ? 'Active' : 'Saved');
    const storage = match.storageMode === 'shared' ? 'Shared' : 'Local';
    const cloudMeta = match.storageMode === 'shared' ? `${storage} · ${match.cloudSyncState || 'local-cache'}${match.sharedMatchRef ? ` · ID ${match.sharedMatchRef}` : ''}` : storage;
    return `
      <div class="item compact-item">
        <div class="item-header compact-item-header">
          <div>
            <div class="item-title">${escapeHtml(match.name || 'Round')} · ${escapeHtml(match.date)}</div>
            <div class="muted">${escapeHtml(course?.name || 'No course')} · ${escapeHtml(tee?.teeName || 'No tee')} · ${escapeHtml(getHoleSegmentLabel(match, tee))} · ${status}</div>
            <div class="tiny">${metrics ? `${metrics.completed}/${getPlayableHoleCount(match, metrics.tee)} holes completed` : ''}</div>
            <div class="tiny">${escapeHtml(cloudMeta)}</div>
          </div>
          <div class="actions wrap compact-actions">
            <button class="secondary" data-load-match="${match.id}">${state.activeMatchId === match.id ? 'Loaded' : (match.storageMode === 'shared' ? 'Load / Refresh' : 'Load')}</button>
            <button class="secondary" data-share-match="${match.id}">PDF</button>
            ${match.storageMode === 'shared' ? `<button class="secondary" data-refresh-shared-match="${match.sharedMatchId || match.id}">Cloud Refresh</button>` : ''}
            <button class="secondary" data-delete-match="${match.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


function resetFinishRoundConfirmation({ sync = true } = {}) {
  finishConfirmArmed = false;
  if (sync) syncFinishRoundUi(getActiveMatch());
}

function closeNewMatchConflictDialog({ disarmFinish = false, resetMode = true } = {}) {
  const dialog = document.getElementById('newMatchConflictDialog');
  if (dialog) {
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
  }
  if (disarmFinish && finishConfirmArmed) {
    resetFinishRoundConfirmation();
  }
  newMatchPromptFinishArmed = false;
  newMatchStartInProgress = false;
  if (resetMode) {
    newMatchDialogMode = 'intent';
    syncNewMatchConflictUi();
  }
}

function openNewMatchConflictDialog(mode = 'intent') {
  const dialog = document.getElementById('newMatchConflictDialog');
  if (!dialog) return;
  newMatchPromptFinishArmed = false;
  newMatchStartInProgress = false;
  newMatchDialogMode = mode;
  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');
  syncNewMatchConflictUi();
}

function setNewMatchDialogButton(button, { text = '', visible = true, disabled = false, className = '' } = {}) {
  if (!button) return;
  button.textContent = text;
  button.classList.toggle('hidden', !visible);
  button.disabled = disabled || !visible;
  if (className) button.className = className;
}

function syncNewMatchConflictUi() {
  const dialog = document.getElementById('newMatchConflictDialog');
  if (!dialog || dialog.classList.contains('hidden')) return;
  const title = document.getElementById('newMatchConflictTitle');
  const body = document.getElementById('newMatchConflictBody');
  const continueBtn = document.getElementById('newMatchContinueBtn');
  const editBtn = document.getElementById('newMatchEditCurrentBtn');
  const finishBtn = document.getElementById('newMatchFinishCurrentBtn');
  const cancelBtn = document.getElementById('newMatchCancelBtn');
  if (cancelBtn) cancelBtn.disabled = newMatchStartInProgress;
  if (newMatchDialogMode === 'unfinished') {
    if (title) title.textContent = 'Finish current match first?';
    if (body) body.textContent = 'The current match is not finished. Would you like to finish and confirm it before creating a new match?';
    setNewMatchDialogButton(continueBtn, { text: 'Create New Match Anyway', visible: true, disabled: newMatchStartInProgress, className: 'secondary' });
    setNewMatchDialogButton(editBtn, { visible: false });
    setNewMatchDialogButton(finishBtn, { text: newMatchStartInProgress ? 'Finishing...' : 'Finish & Confirm Current Match', visible: true, disabled: newMatchStartInProgress, className: 'secondary' });
    return;
  }
  if (title) title.textContent = 'Create a new match?';
  if (body) body.textContent = 'You already have an active match. Do you want to create a new match instead of editing the current one?';
  setNewMatchDialogButton(continueBtn, { text: 'Create New Match', visible: true, disabled: newMatchStartInProgress, className: 'secondary' });
  setNewMatchDialogButton(editBtn, { text: 'Edit Current Match', visible: true, disabled: newMatchStartInProgress, className: 'secondary' });
  setNewMatchDialogButton(finishBtn, { visible: false });
}

function createBlankSetupDraft() {
  return createEmptyMatch({
    id: uid(),
    date: todayIso(),
    name: 'Round',
    courseId: '',
    teeId: '',
    allowance: 100,
    holeCount: 18,
    nineHoleSegment: 'front',
    customStartHole: 1,
    teamCount: 1,
    playersPerTeam: 1,
    teamNames: [],
    scoringAccessMode: 'team_codes',
    scoreEntryMode: 'team',
    officialScorerName: 'Official scorer',
    statTrackingEnabled: false,
    selectedGames: [],
    players: [],
  });
}

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
}

function isMatchFinished(match) {
  return !!match && match.status === 'complete';
}

function shouldPromptToFinishBeforeNewMatch(match) {
  if (!match || isMatchFinished(match)) return false;
  const progress = computeMatchProgress(match);
  if ((progress.lastTouchedHole || 0) > 0 || (progress.lastFullyCompletedHole || 0) > 0) return true;
  return Array.isArray(match.players) && match.players.some(player =>
    Array.isArray(player.scores) && player.scores.some(score => Number(score?.gross) > 0)
  );
}

function hasActiveNewMatchConflict(match) {
  return !!match && !isMatchFinished(match);
}

function markRoundReopenedForEditing(match) {
  if (!match || match.status !== 'complete') return false;
  match.previousCompletedAt = match.completedAt || match.previousCompletedAt || null;
  match.reopenedAt = new Date().toISOString();
  match.status = 'active';
  match.completedAt = null;
  finishConfirmArmed = false;
  toast('Round reopened for editing.');
  return true;
}

function resetMatchSetupFormDomToBlank() {
  const form = document.getElementById('matchForm');
  if (form) form.reset();
  const notesBox = document.getElementById('notesBox');
  if (notesBox) notesBox.value = '';
  const picker = document.getElementById('matchPlayersPicker');
  if (picker) picker.innerHTML = '';
  document.querySelectorAll('[data-player-slot], [data-player-tee-slot], [data-team-name], [data-game-key], [data-game-config], [data-side-field], [data-nine-point-player], [data-greenie-player]').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });
}

function startCleanNewMatchSetup() {
  const snapshot = {
    activeMatchId: state.activeMatchId,
    lastOpenedSharedMatchId: state.lastOpenedSharedMatchId,
    editingMatchId,
    currentHole,
    finishConfirmArmed,
    newMatchPromptFinishArmed,
    newMatchDialogMode,
    notes: state.notes,
    matchPlayerDraft: clonePlain(uiState.matchPlayerDraft),
    referenceTeeManual: uiState.referenceTeeManual,
    referenceTeeAutoId: uiState.referenceTeeAutoId,
  };

  const priorId = state.activeMatchId;
  try {
    cleanNewMatchSetupInProgress = true;
    if (priorId) {
      clearScheduledSharedMatchSync(priorId);
      sharedMatchSyncDirty.delete(priorId);
    }

    state.activeMatchId = null;
    state.lastOpenedSharedMatchId = null;
    editingMatchId = null;
    currentHole = 1;
    pendingScoreCommitFocus = null;
    scoreInputSessionState.clear();
    finishConfirmArmed = false;
    newMatchPromptFinishArmed = false;
    newMatchDialogMode = 'intent';
    state.notes = '';
    uiState.matchPlayerDraft = [];
    uiState.referenceTeeManual = false;
    uiState.referenceTeeAutoId = '';

    resetMatchSetupFormDomToBlank();
    const draft = createBlankSetupDraft();
    loadMatchEditor(null, draft);
    renderMatchSetupState();
    renderSetupHandicapPreview();
    updateCloudConfigUi();
    persist({ skipRender: true });
    activateTab('setup');
  } catch (err) {
    state.activeMatchId = snapshot.activeMatchId;
    state.lastOpenedSharedMatchId = snapshot.lastOpenedSharedMatchId;
    editingMatchId = snapshot.editingMatchId;
    currentHole = snapshot.currentHole;
    finishConfirmArmed = snapshot.finishConfirmArmed;
    newMatchPromptFinishArmed = snapshot.newMatchPromptFinishArmed;
    newMatchDialogMode = snapshot.newMatchDialogMode;
    state.notes = snapshot.notes;
    uiState.matchPlayerDraft = Array.isArray(snapshot.matchPlayerDraft) ? snapshot.matchPlayerDraft : [];
    uiState.referenceTeeManual = snapshot.referenceTeeManual;
    uiState.referenceTeeAutoId = snapshot.referenceTeeAutoId;
    try {
      if (snapshot.editingMatchId || snapshot.activeMatchId) loadMatchEditor(snapshot.editingMatchId || snapshot.activeMatchId);
      renderMatchSetupState();
      updateCloudConfigUi();
    } catch (restoreErr) {
      console.error('Could not restore setup state after failed new-match reset:', restoreErr);
    }
    throw err;
  } finally {
    cleanNewMatchSetupInProgress = false;
  }
}

function resetToBlankMatchSetup() {
  startCleanNewMatchSetup();
}

function clearActiveMatchForNewSetup() {
  startCleanNewMatchSetup();
}

async function persistCurrentMatch({ applyDom = true, awaitShared = false, immediateShared = true, silent = true } = {}) {
  const match = getActiveMatch();
  if (!match) return true;
  if (applyDom && typeof applyCurrentHoleDomToMatch === 'function') {
    try { applyCurrentHoleDomToMatch(match); } catch (err) { console.error('Could not capture current hole before save:', err); }
  }
  normalizeMatch(match);
  if (match.storageMode === 'shared') setLastOpenedSharedMatch(match);
  persist({ skipRender: true });
  if (match.storageMode === 'shared') {
    scheduleSharedMatchSync(match, { immediate: immediateShared, silent });
    if (awaitShared && hasSupabaseConfig()) {
      await flushSharedMatchSync(match.id, { silent });
    }
  }
  return true;
}

function beginCleanNewMatchSetup({ message = 'New match setup ready.' } = {}) {
  if (newMatchStartInProgress) return;
  newMatchStartInProgress = true;
  try {
    closeNewMatchConflictDialog({ disarmFinish: true });
    startCleanNewMatchSetup();
    toast(message);
  } catch (err) {
    console.error('Create New Match reset failed:', err);
    toast('Could not start a new match. Please try again.');
  } finally {
    newMatchStartInProgress = false;
    newMatchPromptFinishArmed = false;
    newMatchDialogMode = 'intent';
    syncNewMatchConflictUi();
  }
}

function editCurrentMatchFromNewMatchDialog() {
  if (newMatchStartInProgress) return;
  const active = getActiveMatch();
  if (!active) {
    closeNewMatchConflictDialog({ disarmFinish: true });
    beginCleanNewMatchSetup();
    return;
  }
  closeNewMatchConflictDialog({ disarmFinish: true });
  loadMatchEditor(active.id);
  renderMatchSetupState();
  activateTab('setup');
  toast('Editing current match.');
}

function proceedFromNewMatchIntentDialog() {
  const active = getActiveMatch();
  if (shouldPromptToFinishBeforeNewMatch(active)) {
    openNewMatchConflictDialog('unfinished');
    return;
  }
  beginCleanNewMatchSetup();
}

function handleNewMatchRequest() {
  const active = getActiveMatch();
  // Capture pending score DOM only for non-complete matches. applyCurrentHoleDomToMatch()
  // intentionally no longer reopens completed rounds, and this guard prevents passive
  // Create New Match checks from treating a completed round as an edit action.
  if (active && active.status !== 'complete' && typeof applyCurrentHoleDomToMatch === 'function') {
    try {
      applyCurrentHoleDomToMatch(active);
      persist({ skipRender: true });
    } catch (err) {
      console.warn('Could not capture current hole before Create New Match:', err);
    }
  }
  if (!hasActiveNewMatchConflict(active)) {
    beginCleanNewMatchSetup();
    return;
  }
  if (!shouldPromptToFinishBeforeNewMatch(active) && !matchHasStarted(active)) {
    if (!window.confirm('Discard the current unscored match setup and start a new one?')) return;
    beginCleanNewMatchSetup();
    return;
  }
  openNewMatchConflictDialog('intent');
}

async function handleNewMatchFinishAndConfirmAction() {
  if (newMatchStartInProgress) return;
  const active = getActiveMatch();
  if (!active) {
    closeNewMatchConflictDialog({ disarmFinish: true });
    beginCleanNewMatchSetup();
    return;
  }
  newMatchStartInProgress = true;
  newMatchPromptFinishArmed = true;
  finishConfirmArmed = true;
  syncNewMatchConflictUi();
  try {
    const completed = completeActiveRound();
    if (!completed) throw new Error('completeActiveRound returned false');
    await persistCurrentMatch({ applyDom: false, awaitShared: active.storageMode === 'shared', immediateShared: true, silent: true });
    closeNewMatchConflictDialog({ disarmFinish: false });
    startCleanNewMatchSetup();
    toast('Current match finished and saved. New match setup ready.');
  } catch (err) {
    console.error('Finish & Confirm Current Match failed:', err);
    newMatchPromptFinishArmed = false;
    finishConfirmArmed = false;
    syncFinishRoundUi(active);
    syncNewMatchConflictUi();
    toast('Could not finish current match. Please try again.');
  } finally {
    newMatchStartInProgress = false;
    newMatchPromptFinishArmed = false;
    syncNewMatchConflictUi();
  }
}

function handleNewMatchStartWithoutSavingAction() {
  if (newMatchStartInProgress) return;
  const ok = window.confirm('Create a new match anyway? The current unfinished match will remain saved, but it will not be finished or confirmed before the new setup opens.');
  if (!ok) return;
  beginCleanNewMatchSetup();
}

function syncFinishRoundUi(match = getActiveMatch()) {
  const scoringFinishBtn = document.getElementById('finishRoundBtn');
  const scoringConfirmBtn = document.getElementById('confirmFinishRoundBtn');
  const scoreboardFinishBtn = document.getElementById('scoreboardFinishRoundBtn');
  const scoreboardConfirmBtn = document.getElementById('scoreboardConfirmFinishRoundBtn');
  const setupFinishBtn = document.getElementById('setupFinishRoundBtn');
  const setupConfirmBtn = document.getElementById('setupConfirmFinishRoundBtn');
  const scoreboardRoundState = document.getElementById('scoreboardRoundState');
  const isComplete = !!match && match.status === 'complete';
  const hasMatch = !!match;
  const reopenedEdit = !!match?.previousCompletedAt;
  const finishLabel = reopenedEdit ? 'Save Updates & Finish' : 'Finish Round';
  const confirmLabel = reopenedEdit ? 'Confirm Save Updates' : 'Confirm Finish';
  const show = (el, visible) => {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    if (visible) el.style.removeProperty('display');
    else el.style.setProperty('display', 'none');
    el.disabled = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };
  show(scoringFinishBtn, hasMatch && !isComplete && !finishConfirmArmed);
  show(scoringConfirmBtn, hasMatch && !isComplete && finishConfirmArmed);
  show(scoreboardFinishBtn, hasMatch && !isComplete && !finishConfirmArmed);
  show(scoreboardConfirmBtn, hasMatch && !isComplete && finishConfirmArmed);
  show(setupFinishBtn, hasMatch && !isComplete && !finishConfirmArmed);
  show(setupConfirmBtn, hasMatch && !isComplete && finishConfirmArmed);
  [scoringFinishBtn, scoreboardFinishBtn, setupFinishBtn].forEach(btn => { if (btn) btn.textContent = finishLabel; });
  [scoringConfirmBtn, scoreboardConfirmBtn, setupConfirmBtn].forEach(btn => { if (btn) btn.textContent = confirmLabel; });
  if (scoreboardRoundState) {
    if (!hasMatch) scoreboardRoundState.textContent = 'No active round.';
    else if (isComplete) scoreboardRoundState.textContent = 'Round complete.';
    else if (finishConfirmArmed) scoreboardRoundState.textContent = reopenedEdit ? 'Confirm save updates to overwrite the saved round.' : 'Confirm finish to lock this round to history.';
    else if (reopenedEdit) scoreboardRoundState.textContent = 'Editing previously completed round. Finish Round will overwrite the saved round.';
    else scoreboardRoundState.textContent = 'Round is live.';
  }
}

function armFinishRound() {
  const match = getActiveMatch();
  if (!match) return toast('No active match.');
  finishConfirmArmed = true;
  syncFinishRoundUi(match);
  toast(match.previousCompletedAt
    ? 'Tap Confirm Save Updates to overwrite the saved round.'
    : 'Tap Confirm Finish to lock this round to history.');
}

function completeActiveRound() {
  const match = getActiveMatch();
  if (!match || !finishConfirmArmed) return false;
  try {
    if (typeof applyCurrentHoleDomToMatch === 'function') {
      applyCurrentHoleDomToMatch(match);
    }
    const wasReopened = !!(match.reopenedAt || match.previousCompletedAt);
    match.status = 'complete';
    match.completedAt = new Date().toISOString();
    delete match.reopenedAt;
    delete match.previousCompletedAt;
    const progress = computeMatchProgress(match);
    match.lastTouchedHole = progress.lastTouchedHole;
    match.lastFullyCompletedHole = progress.lastFullyCompletedHole;
    finishConfirmArmed = false;
    newMatchPromptFinishArmed = false;
    state.activeMatchId = match.id;
    // Note: for a reopened round, this overwrites both local and shared (Supabase) copies
    // because match.id is preserved by markRoundReopenedForEditing. Shared sync is upsert-by-id.
    persistCurrentMatch({ applyDom: false, awaitShared: false, immediateShared: true, silent: true });
    syncFinishRoundUi(match);
    renderMatches();
    renderCurrentMatch();
    renderLeaderboard();
    renderMatchSetupState();
    toast(wasReopened
      ? 'Saved round updated. Existing match record overwritten.'
      : 'Round finished and saved.');
    return true;
  } catch (err) {
    console.error('Confirm Finish failed:', err);
    finishConfirmArmed = false;
    newMatchPromptFinishArmed = false;
    syncFinishRoundUi(match);
    toast('Could not finish round. Please try again.');
    return false;
  }
}

function renderCurrentMatch() {
  const match = getActiveMatch();
  const metaEl = document.getElementById('currentMatchMeta');
  const emptyEl = document.getElementById('scoreEntryEmpty');
  const wrapEl = document.getElementById('scoreEntryWrap');
  if (!match) finishConfirmArmed = false;
  syncFinishRoundUi(match);
  if (!match) {
    metaEl.textContent = 'No active match.';
    emptyEl.classList.remove('hidden');
    wrapEl.classList.add('hidden');
    const tileWrap = document.getElementById('holeJumpTiles'); if (tileWrap) tileWrap.innerHTML = '';
    return;
  }
  const course = getCourse(match.courseId);
  const tee = getTee(match.courseId, match.teeId);
  const metrics = computeMatchMetrics(match);
  const holeCount = getPlayableHoleCount(match, tee);
  const scoringHoles = getSelectedScoringHoles(match, tee);
  const reopenedNote = match.previousCompletedAt
    ? ' · Reopened from completed round (Finish Round will overwrite the saved round)'
    : '';
  metaEl.textContent = `${match.date} · ${match.name || 'Round'} · ${course?.name || ''} · ${getHoleSegmentLabel(match, tee)} · ${metrics?.completed || 0}/${holeCount} holes completed${match.storageMode === 'shared' ? ` · Shared ID ${match.sharedMatchRef || match.sharedMatchId || match.id}` : ''}${reopenedNote}`;
  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');
  currentHole = Math.min(holeCount, Math.max(1, currentHole));
  const hole = scoringHoles[currentHole - 1];
  renderHoleSelector(match, scoringHoles);
  const teamText = metrics?.teams?.length === 2 ? `${formatMatchDiff(metrics.matchDiff, match)} overall` : 'Singles leaderboard';
  const teeYardages = hole ? [...new Map((metrics?.players || []).map(p => {
    const playerHole = getPlayerHole(match, p, currentHole - 1, tee) || hole;
    const key = `${p.tee?.id || p.teeId || ''}|${playerHole?.yardage || ''}`;
    return [key, `${p.tee?.teeName || tee?.teeName || 'Tee'} ${playerHole?.yardage ? `${formatYardageValue(playerHole.yardage)} yds` : '— yds'}`];
  })).values()].join(' · ') : '';
  document.getElementById('holeSummary').textContent = hole ? `Hole ${hole.holeNumber} · Par ${hole.par || '-'} · SI ${hole.strokeIndex || '-'} · ${teeYardages || `${hole.yardage ? formatYardageValue(hole.yardage) : '-'} yds`} · ${teamText}` : '';
  renderScoreAccessCard(match);
  renderScoreGrid(match, tee, metrics, scoringHoles);
  renderStatTrackingEntry(match, hole, metrics);
  renderGreeniesEntry(match, hole);
  renderHoleJumpTiles(match);
  const saveBtn = document.getElementById('saveScoresBtn');
  if (saveBtn) saveBtn.disabled = getScoreAccessState(match).role === 'viewer';
  applyPendingScoreCommitFocus();
}


function renderHoleSelector(match, scoringHoles = []) {
  const badge = document.getElementById('currentHoleBadge');
  if (!badge) return;
  const holes = Array.isArray(scoringHoles) && scoringHoles.length ? scoringHoles : getSelectedScoringHoles(match, getTee(match?.courseId, match?.teeId));
  const maxHole = holes.length || getRequestedHoleCount(match) || 18;
  const options = Array.from({ length: maxHole }, (_, idx) => {
    const holeNo = idx + 1;
    const displayHole = holes[idx]?.holeNumber || holeNo;
    return `<option value="${holeNo}" ${holeNo === currentHole ? 'selected' : ''}>Hole ${displayHole}</option>`;
  }).join('');
  badge.innerHTML = `<label class="sr-only" for="currentHoleSelect">Select hole</label><select id="currentHoleSelect" class="hole-select" aria-label="Select hole">${options}</select>`;
}

function renderStatTrackingEntry(match, hole, metrics) {
  const wrap = document.getElementById('statTrackingEntryWrap');
  if (!wrap) return;
  if (!isStatTrackingEnabled(match)) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  const isFairwayHole = Number(hole?.par) === 4 || Number(hole?.par) === 5;
  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="card inset-card stat-entry-card">
      <div class="item-header compact-item-header">
        <div>
          <div class="section-label">Stat tracking · Hole ${hole?.holeNumber || currentHole}</div>
          <div class="tiny">Track optional player stats for this hole. Fairways only appear on par 4s and par 5s.</div>
        </div>
      </div>
      <div class="stat-entry-grid top-gap">
        ${metrics.players.map(p => {
          const stat = getPlayerStatEntry(match.players.find(mp => mp.playerId === p.playerId), currentHole - 1);
          const canEdit = canEditPlayerScore(match, p.team);
          const playerHole = getPlayerHole(match, p, currentHole - 1, hole) || hole || null;
          const showFairway = Number(playerHole?.par) === 4 || Number(playerHole?.par) === 5 || isFairwayHole;
          return `
            <div class="stat-player-card ${canEdit ? '' : 'is-readonly'}">
              <div class="stat-player-head">
                <div><strong>${escapeHtml(p.player.name)}</strong></div>
                <div class="tiny">${escapeHtml(getTeamLabel(match, p.team))}${canEdit ? '' : ' · read only'}</div>
              </div>
              <div class="stat-check-grid top-gap ${showFairway ? 'stat-check-grid--with-fairway' : ''}">
                ${showFairway ? `<label class="mini-check stat-mini-check stat-mini-check--fairway"><input type="checkbox" data-stat-player="${p.playerId}" data-stat-key="fairway" ${stat.fairway ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>Fairway hit</span></label>` : ''}
                <label class="mini-check stat-mini-check"><input type="checkbox" data-stat-player="${p.playerId}" data-stat-key="green" ${stat.green ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>Green in regulation</span></label>
                <label class="mini-check stat-mini-check"><input type="checkbox" data-stat-player="${p.playerId}" data-stat-key="upAndDown" ${stat.upAndDown ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>Up and down</span></label>
                <label class="mini-check stat-mini-check"><input type="checkbox" data-stat-player="${p.playerId}" data-stat-key="sandy" ${stat.sandy ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>Sandy</span></label>
              </div>
              <label class="stat-putts-field top-gap"><span>Putts</span><input class="score-input stat-putts-input" type="tel" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" min="0" max="9" data-stat-player="${p.playerId}" data-stat-key="putts" data-putts-source="${escapeHtml(normalizePuttsSource(stat.puttsSource || 'default', 'default'))}" value="${Number.isFinite(stat.putts) ? stat.putts : 2}" ${canEdit ? '' : 'disabled'} /></label>
              <label class="stat-putts-field top-gap"><span>Penalty strokes</span><input class="score-input stat-penalty-input" type="tel" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" min="0" max="9" data-stat-player="${p.playerId}" data-stat-key="penaltyStrokes" value="${Number.isFinite(Number(stat.penaltyStrokes)) ? Number(stat.penaltyStrokes) : 0}" ${canEdit ? '' : 'disabled'} /></label>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderGreeniesEntry(match, hole) {
  const wrap = document.getElementById('greeniesEntryWrap');
  if (!wrap) return;
  const greenies = (match.selectedGames || []).find(g => g.key === 'greenies');
  if (!greenies || Number(hole?.par) !== 3) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  const eligible = (greenies.participants || []).map(id => {
    const player = getPlayer(id);
    const mp = match.players.find(row => row.playerId === id);
    return player && mp ? { player, team: mp.team } : null;
  }).filter(Boolean);
  const winnerId = match.greeniesWinners?.[String(hole.holeNumber)] || '';
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="card inset-card game-config-card greenies-card"><div class="section-label">Greenies · Hole ${hole.holeNumber}</div><div class="greenies-list top-gap">${eligible.map(row => `<label class="mini-check greenies-check ${canEditGreenies(match, row.team) ? '' : 'is-readonly'}"><input type="checkbox" data-greenies-winner="${row.player.id}" ${winnerId === row.player.id ? 'checked' : ''} ${canEditGreenies(match, row.team) ? '' : 'disabled'} /><span>${escapeHtml(row.player.name)}</span></label>`).join('') || '<div class="tiny">No greenies participants selected for this match.</div>'}</div><div class="tiny top-gap">Select the closest-to-the-pin winner for this par 3. Payout runs only against selected greenies participants.</div></div>`;
}
function renderHoleJumpTiles(match) {
  const wrap = document.getElementById('holeJumpTiles');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.classList.add('hidden');
  return;
  const holeCount = getPlayableHoleCount(match, getTee(match.courseId, match.teeId));
  const played = Array.from({ length: holeCount }, (_, idx) => {
    const hasScore = (match.players || []).some(mp => Number(mp.scores?.[idx]?.gross));
    return hasScore;
  });
  const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
  wrap.innerHTML = Array.from({ length: holeCount }, (_, idx) => {
    const holeNo = idx + 1;
    const displayHole = scoringHoles[idx]?.holeNumber || holeNo;
    const classes = ['hole-jump-tile'];
    if (holeNo === currentHole) classes.push('active');
    classes.push('complete');
    if (played[idx]) classes.push('played');
    return `<button type="button" class="${classes.join(' ')}" data-jump-hole="${holeNo}">${displayHole}</button>`;
  }).join('');
}

function renderScoreGrid(match, tee, metrics, scoringHoles = null) {
  const body = document.getElementById('scoreGridBody');
  if (!match || !tee || !metrics) {
    body.innerHTML = '';
    return;
  }
  const holes = scoringHoles || getSelectedScoringHoles(match, tee);
  const hole = holes[currentHole - 1];
  body.innerHTML = metrics.players.map(p => {
    const score = p.scores[currentHole - 1];
    const playerHole = getPlayerHole(match, p, currentHole - 1, tee) || hole;
    const strokes = holeStrokeAllowanceForPlayer(playerHole?.strokeIndex, p.playHdcp, metrics.lowPlaying);
    const gross = score?.gross || '';
    const net = score?.gross ? score.gross - strokes : '';
    const canEdit = canEditPlayerScore(match, p.team);
    return `
      <tr class="${canEdit ? '' : 'score-row-readonly'}">
        <td>${escapeHtml(p.player.name)}<div class="tiny">${escapeHtml(p.tee?.teeName || tee?.teeName || 'Tee')}${canEdit ? '' : ' · read only'}</div></td>
        <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
        <td><input class="score-input" type="tel" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" min="1" max="15" data-score-player="${p.playerId}" value="${gross}" ${canEdit ? '' : 'disabled'} /></td>
        <td>${strokes}</td>
        <td>${net}</td>
      </tr>
    `;
  }).join('');
}


function updateLiveNetForScoreInput(inputEl) {
  const match = getMatch(state.activeMatchId);
  if (!match || !inputEl) return;
  const metrics = computeMatchMetrics(match);
  const playerId = inputEl.dataset.scorePlayer;
  const playerMetric = metrics?.players?.find(p => p.playerId === playerId);
  if (!playerMetric) return;
  const courseTee = metrics?.tee || getTee(match.courseId, match.teeId);
  const scoringHoles = getSelectedScoringHoles(match, courseTee);
  const hole = scoringHoles[currentHole - 1];
  const playerHole = getPlayerHole(match, playerMetric, currentHole - 1, courseTee) || hole;
  const strokes = holeStrokeAllowanceForPlayer(playerHole?.strokeIndex, playerMetric.playHdcp, metrics.lowPlaying);
  const raw = String(inputEl.value || '').trim();
  const gross = Number(raw);
  const netCell = inputEl.closest('tr')?.children?.[4];
  if (!netCell) return;
  netCell.textContent = raw && Number.isFinite(gross) ? String(gross - strokes) : '';
}

function normalizeCommittedScoreValue(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return trimmed;
  return String(Math.max(0, Math.round(numeric)));
}

function getEditableScoreInputs() {
  return Array.from(document.querySelectorAll('#score [data-score-player]')).filter(input => !input.disabled);
}

function isRecentDuplicateScoreCommit(playerId, normalizedValue) {
  if (!playerId) return false;
  const session = scoreInputSessionState.get(playerId) || {};
  const lastAt = Number(session.lastCommittedAt || 0);
  const lastValue = String(session.lastCommittedValue ?? '');
  return !!lastAt && lastValue === String(normalizedValue ?? '') && (Date.now() - lastAt) < 1200;
}

function markRecentScoreCommit(playerId, normalizedValue) {
  if (!playerId) return;
  const session = scoreInputSessionState.get(playerId) || {};
  scoreInputSessionState.set(playerId, {
    ...session,
    lastCommittedAt: Date.now(),
    lastCommittedValue: String(normalizedValue ?? ''),
  });
}

function handleLiveScoreInputFocus(inputEl) {
  if (!inputEl || inputEl.disabled) return;
  cancelPendingScoreAutoAdvance();
  const playerId = inputEl.dataset.scorePlayer;
  const existing = scoreInputSessionState.get(playerId) || {};
  scoreInputSessionState.set(playerId, {
    ...existing,
    initialValue: String(inputEl.value || '').trim(),
    generation: existing.generation || 0,
  });
}

function handleLiveScoreInputEvent(inputEl) {
  if (!inputEl || inputEl.disabled) return;
  updateLiveNetForScoreInput(inputEl);
  schedulePendingScoreAutoAdvance(inputEl);
}

function handleLiveScoreInputKeydown(event) {
  const inputEl = event?.target;
  if (!inputEl || inputEl.disabled || !inputEl.matches?.('[data-score-player]')) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    commitScoreInput(inputEl, { viaEnter: true });
  }
}

function handleLiveScoreInputBlur(inputEl) {
  if (!inputEl || inputEl.disabled) return;
  commitScoreInput(inputEl);
}

function wireLiveScoreInputs() {
  const scoreRoot = document.getElementById('score');
  if (!scoreRoot) return;
  scoreRoot.querySelectorAll('[data-score-player]').forEach(input => {
    if (input.dataset.scoreWired === 'direct') return;
    input.dataset.scoreWired = 'direct';
    input.addEventListener('focus', () => handleLiveScoreInputFocus(input));
    input.addEventListener('input', () => handleLiveScoreInputEvent(input));
    input.addEventListener('keydown', handleLiveScoreInputKeydown);
    input.addEventListener('blur', () => handleLiveScoreInputBlur(input));
  });
}

function queueScoreCommitFocus(playerId, holeNumber = currentHole) {
  pendingScoreCommitFocus = playerId ? { playerId, holeNumber: Number(holeNumber) || currentHole } : null;
}

function applyPendingScoreCommitFocus() {
  if (!pendingScoreCommitFocus) return;
  const pending = pendingScoreCommitFocus;
  if (Number(pending.holeNumber) !== Number(currentHole)) return;
  const target = document.querySelector(`#score [data-score-player="${pending.playerId}"]`);
  if (!target || target.disabled) {
    pendingScoreCommitFocus = null;
    return;
  }
  setTimeout(() => {
    requestAnimationFrame(() => {
      const liveTarget = document.querySelector(`#score [data-score-player="${pending.playerId}"]`);
      if (!liveTarget || liveTarget.disabled) {
        pendingScoreCommitFocus = null;
        return;
      }
      try {
        liveTarget.focus({ preventScroll: false });
        const end = String(liveTarget.value || '').length;
        if (typeof liveTarget.setSelectionRange === 'function') liveTarget.setSelectionRange(end, end);
        liveTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (err) {}
      pendingScoreCommitFocus = null;
    });
  }, 0);
}

function cancelPendingScoreAutoAdvance(playerId = null) {
  if (playerId && pendingScoreAutoAdvancePlayerId && pendingScoreAutoAdvancePlayerId !== playerId) return;
  if (pendingScoreAutoAdvanceTimer) clearTimeout(pendingScoreAutoAdvanceTimer);
  pendingScoreAutoAdvanceTimer = null;
  pendingScoreAutoAdvancePlayerId = null;
}

function getLiveScoreInputForPlayer(playerId) {
  if (!playerId) return null;
  return document.querySelector(`#score [data-score-player="${playerId}"]`);
}

function schedulePendingScoreAutoAdvance(inputEl) {
  if (!inputEl || inputEl.disabled) return;
  const playerId = inputEl.dataset.scorePlayer;
  if (!playerId) return;
  const session = scoreInputSessionState.get(playerId) || {};
  const generation = ++scoreAutoAdvanceGeneration;
  scoreInputSessionState.set(playerId, { ...session, generation, lastTypedValue: String(inputEl.value || '') });
  cancelPendingScoreAutoAdvance();
  pendingScoreAutoAdvancePlayerId = playerId;
  pendingScoreAutoAdvanceTimer = setTimeout(() => {
    pendingScoreAutoAdvanceTimer = null;
    pendingScoreAutoAdvancePlayerId = null;
    const liveInput = getLiveScoreInputForPlayer(playerId);
    const liveSession = scoreInputSessionState.get(playerId) || {};
    if (!liveInput || liveInput.disabled) return;
    if ((liveSession.generation || 0) !== generation) return;
    commitScoreInput(liveInput, { viaAutoAdvance: true, expectedGeneration: generation });
  }, SCORE_AUTO_ADVANCE_DELAY_MS);
}

function commitScoreInput(inputEl, { viaEnter = false, viaAutoAdvance = false, expectedGeneration = null } = {}) {
  const match = getActiveMatch();
  if (!match || !inputEl || inputEl.disabled) return false;
  const playerId = inputEl.dataset.scorePlayer;
  if (!playerId) return false;
  cancelPendingScoreAutoAdvance(playerId);
  const editableInputs = getEditableScoreInputs();
  const currentIndex = editableInputs.findIndex(el => el.dataset.scorePlayer === playerId);
  const priorState = scoreInputSessionState.get(playerId) || {};
  if (expectedGeneration != null && Number(priorState.generation || 0) !== Number(expectedGeneration)) return false;
  const normalizedValue = normalizeCommittedScoreValue(inputEl.value);
  const initialValue = String(priorState.initialValue ?? inputEl.defaultValue ?? '').trim();
  const changed = normalizedValue !== initialValue;
  const hasCommittedValue = normalizedValue !== '';
  inputEl.value = normalizedValue;
  updateLiveNetForScoreInput(inputEl);
  if (!changed && !viaEnter && !viaAutoAdvance) {
    scoreInputSessionState.delete(playerId);
    return false;
  }
  if (!changed && isRecentDuplicateScoreCommit(playerId, normalizedValue)) {
    return false;
  }
  if (changed) markRecentScoreCommit(playerId, normalizedValue);
  if (hasCommittedValue && currentIndex >= 0 && currentIndex < editableInputs.length - 1) {
    const nextInput = editableInputs[currentIndex + 1];
    queueScoreCommitFocus(nextInput?.dataset?.scorePlayer || null, currentHole);
    saveCurrentHole({ targetHole: currentHole, silent: true });
  } else if (hasCommittedValue) {
    const maxHole = getPlayableHoleCount(match, getTee(match.courseId, match.teeId));
    const nextHole = Math.min(maxHole, currentHole + 1);
    queueScoreCommitFocus(editableInputs[0]?.dataset?.scorePlayer || null, nextHole > currentHole ? nextHole : currentHole);
    if (nextHole > currentHole) {
      saveCurrentHole({ targetHole: nextHole, silent: true });
    } else {
      saveCurrentHole({ targetHole: currentHole, silent: true });
    }
  } else {
    saveCurrentHole({ targetHole: currentHole, silent: true });
  }
  scoreInputSessionState.delete(playerId);
  return true;
}

function getMomentumOptions(match) {
  const selected = Array.isArray(match?.selectedGames) ? match.selectedGames : [];
  const keys = [];
  selected.forEach(g => {
    if (g.key === 'nassau' || g.key === 'team_match') keys.push(g.key);
    if (g.key === 'individual_match') {
      const rows = Array.isArray(g.matchups) ? g.matchups : [];
      if (rows.some(row => String(row?.game || 'nassau').toLowerCase() === 'nassau')) keys.push('nassau');
      if (rows.some(row => String(row?.game || '').toLowerCase() === 'match_play')) keys.push('team_match');
    }
  });
  const unique = [...new Set(keys)];
  unique.sort((a,b) => (a === 'nassau' ? -1 : b === 'nassau' ? 1 : 0));
  return unique.map(key => ({ key, label: key === 'team_match' ? 'Match Play' : getGameLabel(key) }));
}
function computeMomentumOutcome(match, metrics, holeResult, gameKey) {
  if (!holeResult?.completed) return 'pending';
  const config = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  if (gameKey === 'team_stroke') {
    const basis = String(config.basis || 'net').toLowerCase();
    const mode = resolveTeamStrokeScoringMode(config.scoringMode);
    const t1 = getTeamHoleScore(holeResult, 1, basis, mode);
    const t2 = getTeamHoleScore(holeResult, 2, basis, mode);
    return getHeadToHeadOutcome(t1, t2);
  }
  const basis = String(config.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
  const t1 = getTeamHoleScore(holeResult, 1, basis, 'best_ball');
  const t2 = getTeamHoleScore(holeResult, 2, basis, 'best_ball');
  return getHeadToHeadOutcome(t1, t2);
}
function optimalSettlementRows(amountsByPlayer) {
  const debtors = Object.entries(amountsByPlayer)
    .filter(([, amount]) => amount < -0.0001)
    .map(([playerId, amount]) => ({ playerId, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(amountsByPlayer)
    .filter(([, amount]) => amount > 0.0001)
    .map(([playerId, amount]) => ({ playerId, amount }))
    .sort((a, b) => b.amount - a.amount);
  const rows = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    rows.push({ from: debtors[i].playerId, to: creditors[j].playerId, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= 0.0001) i += 1;
    if (creditors[j].amount <= 0.0001) j += 1;
  }
  return rows;
}
function addAmounts(target, source) {
  Object.entries(source || {}).forEach(([playerId, amount]) => {
    target[playerId] = (target[playerId] || 0) + amount;
  });
}
function computeLivePayoutGames(match, metrics) {
  const selected = getOrderedSelectedGames(match);
  const games = [];
  const teamMemberIds = teamNo => (metrics.teams.find(t => t.team === teamNo)?.members || []).map(m => m.player.id);
  const transferTeamStakePerPerson = (amounts, winnerTeamNos, loserTeamNos, stakePerPerson) => {
    const winners = (Array.isArray(winnerTeamNos) ? winnerTeamNos : [winnerTeamNos]).flatMap(teamMemberIds).filter(Boolean);
    const losers = (Array.isArray(loserTeamNos) ? loserTeamNos : [loserTeamNos]).flatMap(teamMemberIds).filter(Boolean);
    if (!winners.length || !losers.length || !stakePerPerson) return;
    const loserShare = Number(stakePerPerson) || 0;
    if (!loserShare) return;
    const totalPot = loserShare * losers.length;
    const winnerShare = totalPot / winners.length;
    winners.forEach(winnerId => {
      amounts[winnerId] = (amounts[winnerId] || 0) + winnerShare;
    });
    losers.forEach(loserId => {
      amounts[loserId] = (amounts[loserId] || 0) - loserShare;
    });
  };
  const addVsField = (amounts, winnerId, others, perOpponent) => {
    if (!winnerId || !others.length || !perOpponent) return;
    amounts[winnerId] = (amounts[winnerId] || 0) + perOpponent * others.length;
    others.forEach(id => { amounts[id] = (amounts[id] || 0) - perOpponent; });
  };
  const pushGame = (key, label, amounts, group = 'team') => games.push({ key, label, amounts, group });

  selected.forEach(cfg => {
    if (cfg.key === 'nassau' && metrics.teams.length === 2) {
      const runNassau = (basisLabel, basisKey) => {
        const amounts = {};
        const diffs = computeNassauDiffsForBasis(metrics, basisKey);
        const frontLeader = diffs.front > 0 ? 1 : diffs.front < 0 ? 2 : 0;
        const backLeader = diffs.back > 0 ? 1 : diffs.back < 0 ? 2 : 0;
        const overallLeader = diffs.overall > 0 ? 1 : diffs.overall < 0 ? 2 : 0;
        const front = Number(cfg.stakesFront || 0);
        const back = Number(cfg.stakesBack || 0);
        const overall = Number(cfg.stakesOverall || 0);
        if (frontLeader && front) transferTeamStakePerPerson(amounts, frontLeader, frontLeader === 1 ? 2 : 1, front);
        if (backLeader && back) transferTeamStakePerPerson(amounts, backLeader, backLeader === 1 ? 2 : 1, back);
        if (overallLeader && overall) transferTeamStakePerPerson(amounts, overallLeader, overallLeader === 1 ? 2 : 1, overall);
        pushGame('nassau_' + basisKey, `Nassau (${basisLabel})`, amounts);
      };
      if (String(cfg.basis || 'net').toLowerCase() === 'both') {
        runNassau('Gross', 'gross');
        runNassau('Net', 'net');
      } else {
        const basisKey = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
        runNassau(formatBasisLabel(basisKey), basisKey);
      }
      return;
    }
    if (cfg.key === 'team_match' && metrics.teams.length === 2) {
      const amounts = {};
      const stake = Number(cfg.stake || 0);
      const diffs = computeTeamGameDiffs(match, metrics, 'team_match');
      const leader = diffs.overall > 0 ? 1 : diffs.overall < 0 ? 2 : 0;
      if (leader && stake) transferTeamStakePerPerson(amounts, leader, leader === 1 ? 2 : 1, stake);
      pushGame(cfg.key, `${getGameLabel(cfg.key)} (${formatBasisLabel(cfg.basis)} · Best Ball)`, amounts); return;
    }
    if (cfg.key === 'team_stroke' && metrics.teams.length >= 2) {
      const amounts = {};
      const stake = Number(cfg.stake || 0);
      const standing = getTeamStrokeStanding(metrics, String(cfg.basis || 'net').toLowerCase(), resolveTeamStrokeScoringMode(cfg.scoringMode));
      if (stake && standing.winner) {
        const losers = metrics.teams.filter(t => t.team !== standing.winner).map(t => t.team);
        transferTeamStakePerPerson(amounts, standing.winner, losers, stake);
      }
      pushGame(cfg.key, `${getGameLabel(cfg.key)} (${formatBasisLabel(cfg.basis)} · ${formatScoringModeLabel(cfg.scoringMode)})`, amounts); return;
    }
    if (cfg.key === 'skins') {
      const amounts = {};
      const stake = Number(cfg.stake || 0);
      const basisLabel = formatBasisLabel(cfg.basis);
      const skins = computeSkinResults(match, metrics, cfg);
      if (cfg.skinsType === 'team') {
        if (stake) {
          skins.winnersByHole.forEach(h => {
            const winner = h.winner;
            const losers = metrics.teams.filter(t => t.team !== winner).map(t => t.team);
            transferTeamStakePerPerson(amounts, winner, losers, stake);
          });
        }
        pushGame('team_skins', `Team Skins (${basisLabel})`, amounts);
      } else {
        if (stake) {
          skins.winnersByHole.forEach(h => {
            const winner = h.winner;
            const others = metrics.players.filter(p => p.playerId !== winner).map(p => p.playerId);
            addVsField(amounts, winner, others, stake);
          });
        }
        pushGame('individual_skins', `Individual Skins (${basisLabel})`, amounts);
      }
      return;
    }
    if (cfg.key === 'greenies') {
      const amounts = {};
      const stake = Number(cfg.stakePerPlayer || 0);
      const participants = (cfg.participants || []).filter(Boolean);
      if (stake && participants.length > 1) {
        const greenies = getGreeniesResults(match, metrics, cfg);
        greenies.winnersByHole.forEach(({ winner }) => {
          addVsField(amounts, winner, participants.filter(id => id !== winner), stake);
        });
      }
      pushGame(cfg.key, 'Greenies', amounts); return;
    }
    if (cfg.key === 'individual_match') {
      const amounts = {};
      const pairings = getIndividualMatchPairings(match, metrics);
      pairings.forEach(p => {
        const stake = Number(p.stake || 0);
        if (!stake) return;
        if (p.game === 'nassau') {
          const awards = p.isNineHoleSideNassau ? [p.front] : [p.front, p.back, p.diff];
          awards.forEach(diff => {
            if (!diff) return;
            if (diff > 0) {
              amounts[p.playerA.playerId] = (amounts[p.playerA.playerId] || 0) + stake;
              amounts[p.playerB.playerId] = (amounts[p.playerB.playerId] || 0) - stake;
            } else {
              amounts[p.playerA.playerId] = (amounts[p.playerA.playerId] || 0) - stake;
              amounts[p.playerB.playerId] = (amounts[p.playerB.playerId] || 0) + stake;
            }
          });
          return;
        }
        if (!Number.isFinite(p.diff) || p.diff === 0) return;
        if (p.diff > 0) {
          amounts[p.playerA.playerId] = (amounts[p.playerA.playerId] || 0) + stake;
          amounts[p.playerB.playerId] = (amounts[p.playerB.playerId] || 0) - stake;
        } else {
          amounts[p.playerA.playerId] = (amounts[p.playerA.playerId] || 0) - stake;
          amounts[p.playerB.playerId] = (amounts[p.playerB.playerId] || 0) + stake;
        }
      });
      const sideLabel = pairings.length === 1 ? `${pairings[0].label} (${getSideMatchGameLabel(pairings[0].game)} · ${formatBasisLabel(pairings[0].basis)})` : `Head-to-Head Side Matches (${pairings.length})`;
      pushGame(cfg.key, sideLabel, amounts, 'side'); return;
    }
    if (cfg.key === 'nine_point') {
      const amounts = {};
      const nine = computeNinePointResults(match, metrics, cfg);
      Object.entries(nine.amounts || {}).forEach(([playerId, amount]) => { amounts[playerId] = Number(amount) || 0; });
      pushGame(cfg.key, `9-Point Game (${formatBasisLabel(nine.basis)})`, amounts, 'side');
      return;
    }
    pushGame(cfg.key, getGameLabel(cfg.key), {});
  });
  return games;
}

function buildSelectedGamesSummary(match, metrics) {
  const selected = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!selected.length) {
    return `<div class="game-summary-grid"><div class="game-summary-card"><div class="game-summary-title">Round pace</div><div class="game-summary-value">${metrics.completed ? `${Math.round((metrics.completed / Math.max(1, getPlayableHoleCount(match, metrics.tee))) * 100)}% complete` : 'Not started'}</div><div class="game-summary-sub">${metrics.completed}/${getPlayableHoleCount(match, metrics.tee)} holes completed · ${getHoleSegmentLabel(match, metrics.tee)}</div></div></div>`;
  }
  const cards = selected.map(cfg => {
    const title = getFeaturedGameLabel(match, cfg.key);
    let value = 'Live';
    let sub = '';
    if (cfg.key === 'nassau') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      value = formatTeamGameStatus(match, metrics, diffs.overall);
      sub = getPlayableHoleCount(match, metrics.tee) <= 9 ? `Format: ${getHoleSegmentLabel(match, metrics.tee)}` : `Front 9: ${formatTeamGameStatus(match, metrics, diffs.front)} · Back 9: ${formatTeamGameStatus(match, metrics, diffs.back)}`;
    } else if (cfg.key === 'team_match') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      value = formatTeamGameStatus(match, metrics, diffs.overall);
      sub = getPlayableHoleCount(match, metrics.tee) <= 9 ? `Format: ${getHoleSegmentLabel(match, metrics.tee)}` : `Front 9: ${formatTeamGameStatus(match, metrics, diffs.front)} · Back 9: ${formatTeamGameStatus(match, metrics, diffs.back)}`;
    } else if (cfg.key === 'team_stroke') {
      const stroke = getTeamStrokeScoreboardData(match, metrics, cfg);
      value = stroke.leader ? `${describeTeamLabel(match, stroke.leader.team, metrics)} (${stroke.leader.total})` : '—';
      if (!stroke.leader) sub = `Mode: ${formatScoringModeLabel(cfg.scoringMode)} · ${formatBasisLabel(cfg.basis)}`;
      else if (stroke.tie) sub = `Tied at ${stroke.leader.total} · ${formatBasisLabel(stroke.basis)} · ${formatScoringModeLabel(stroke.scoringMode)}`;
      else sub = `${describeTeamLabel(match, stroke.leader.team, metrics)} by ${stroke.margin} stroke${stroke.margin === 1 ? '' : 's'} · ${formatBasisLabel(stroke.basis)} · ${formatScoringModeLabel(stroke.scoringMode)}`;
    } else if (cfg.key === 'individual_match') {
      const pairings = getIndividualMatchPairings(match, metrics);
      if (!pairings.length) {
        value = 'Select side-match players';
        sub = 'No side matches configured yet.';
      } else {
        const statusLines = pairings.map(p => `${p.label}: ${p.status || (p.game === 'stroke_play' ? (p.diff === 0 ? 'Tied' : `${p.leaderName} leads by ${Math.abs(p.diff)} stroke${Math.abs(p.diff) === 1 ? '' : 's'}`) : getSideMatchStatusText(p))}`);
        value = statusLines.join(' · ');
        sub = pairings.map(p => `${p.isNineHoleSideNassau ? 'Nassau (9 Holes)' : getSideMatchGameLabel(p.game)} · ${formatBasisLabel(p.basis)} · ${formatMoneyAccounting(p.stake)}`).join(' · ');
      }
    } else if (cfg.key === 'skins') {
      const skins = computeSkinResults(match, metrics, cfg);
      const entries = Object.entries(skins.counts || {});
      if (cfg.skinsType === 'team') {
        value = entries.length
          ? entries.sort((a,b)=>b[1]-a[1] || Number(a[0])-Number(b[0])).map(([team,n]) => `${getTeamLabel(match, Number(team))} (${n})`).join(' · ')
          : 'None yet';
      } else {
        value = entries.length
          ? entries.sort((a,b)=>b[1]-a[1]).map(([id,n]) => `${getPlayer(id)?.name || 'Unknown'} (${n})`).join(' · ')
          : 'None yet';
      }
      const holes = skins.winnersByHole.map(h => `H${h.holeNumber}: ${h.winnerType === 'team' ? getTeamLabel(match, h.winner) : (getPlayer(h.winner)?.name || 'Unknown')}`).join(' · ');
      sub = holes || 'No skins won yet';
    } else if (cfg.key === 'greenies') {
      const greenies = getGreeniesResults(match, metrics, cfg);
      const max = Math.max(0, ...Object.values(greenies.counts));
      const leaders = max > 0 ? Object.entries(greenies.counts).filter(([,n])=>n===max).map(([id,n]) => `${getPlayer(id)?.name || 'Unknown'} (${n})`).join(', ') : '';
      value = leaders || 'No winners yet';
      sub = greenies.winnersByHole.map(h => `H${h.holeNumber}: ${getPlayer(h.winner)?.name || 'Unknown'}`).join(' · ') || `${(cfg.participants || []).length || 0} participant(s)`;
    }
    else if (cfg.key === 'nine_point') {
      const nine = computeNinePointResults(match, metrics, cfg);
      value = nine.leaderboard.length ? nine.leaderboard.map(row => `${row.name} (${row.total})`).join(' · ') : 'Select 3 players';
      sub = nine.leaderboard.length ? `${formatBasisLabel(nine.basis)} · ${formatMoneyAccounting(nine.stakePerPoint)} / point · ${nine.completedHoles} hole(s) complete · Final differentials settle head-to-head` : '9-Point Game requires three selected players with scores.';
    }
    return `<div class="game-summary-card"><div class="game-summary-title">${escapeHtml(title)}</div><div class="game-summary-value">${escapeHtml(value)}</div>${sub ? `<div class="game-summary-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
  });
  cards.push(`<div class="game-summary-card game-summary-card-accent"><div class="game-summary-title">Round pace</div><div class="game-summary-value">${metrics.completed ? `${Math.round((metrics.completed / Math.max(1, getPlayableHoleCount(match, metrics.tee))) * 100)}% complete` : 'Not started'}</div><div class="game-summary-sub">${metrics.completed}/${getPlayableHoleCount(match, metrics.tee)} holes completed · ${getHoleSegmentLabel(match, metrics.tee)}</div></div>`);
  return `<div class="game-summary-grid">${cards.join('')}</div>`;
}

function populateCourseSelects() {
  const options = state.courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('teeCourseSelect').innerHTML = `<option value="">Select course</option>${options}`;
}
function populateCalcPlayers() {
  const options = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${Number(p.index).toFixed(1)})</option>`).join('');
  document.getElementById('calcPlayer').innerHTML = `<option value="">Select player</option>${options}`;
}
function populateCalcCourses() {
  const options = state.courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('calcCourse').innerHTML = `<option value="">Select course</option>${options}`;
  populateCalcTees();
}
function populateCalcTees() {
  const courseId = document.getElementById('calcCourse').value;
  const teeSelect = document.getElementById('calcTee');
  const course = getCourse(courseId);
  teeSelect.innerHTML = !course ? '<option value="">Select tee</option>' : `<option value="">Select tee</option>${getSortedTeesByYardage(course).map(t => `<option value="${t.id}">${formatTeeSummary(t)}</option>`).join('')}`;
}
function populateMatchCourseSelects(selectedCourseId = null, selectedTeeId = null) {
  const options = state.courses.map(c => `<option value="${c.id}" ${selectedCourseId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const courseSelect = document.getElementById('matchCourseSelect');
  courseSelect.innerHTML = `<option value="">Select course</option>${options}`;
  if (selectedCourseId) courseSelect.value = selectedCourseId;
  populateMatchTees(selectedCourseId || courseSelect.value, selectedTeeId);
}
function populateMatchTees(courseId = null, selectedTeeId = null) {
  const resolvedCourseId = courseId ?? document.getElementById('matchCourseSelect').value;
  const teeSelect = document.getElementById('matchTeeSelect');
  const course = getCourse(resolvedCourseId);
  const sortedTees = course ? getSortedTeesByYardage(course) : [];
  teeSelect.innerHTML = !course ? '<option value="">Select tee</option>' : `<option value="">Select tee</option>${sortedTees.map(t => `<option value="${t.id}" ${selectedTeeId === t.id ? 'selected' : ''}>${formatTeeSummary(t)}</option>`).join('')}`;
  if (selectedTeeId) teeSelect.value = selectedTeeId;
  if (!selectedTeeId && sortedTees[0]) teeSelect.value = sortedTees[0].id;
  syncReferenceTeeUi({ courseId: resolvedCourseId, forceAuto: !uiState.referenceTeeManual });
}

function getDefaultMatchTeeId(courseId = null) {
  const selectedTeeId = document.getElementById('matchTeeSelect')?.value || '';
  if (selectedTeeId) return selectedTeeId;
  return syncReferenceTeeUi({ courseId, forceAuto: true }) || '';
}
function getReferenceTeeStats(courseId = null, selections = null) {
  const resolvedCourseId = courseId ?? (document.getElementById('matchCourseSelect')?.value || '');
  const course = getCourse(resolvedCourseId);
  const sortedTees = course ? getSortedTeesByYardage(course) : [];
  const rankedIds = sortedTees.map(t => t.id);
  const draft = Array.isArray(selections) ? selections : getCurrentMatchEditorSelectionsSnapshot();
  const validSelections = draft
    .map(row => ({ ...row, teeId: String(row?.teeId || '') }))
    .filter(row => row.playerId && row.teeId && rankedIds.includes(row.teeId));
  const counts = new Map();
  validSelections.forEach(row => counts.set(row.teeId, (counts.get(row.teeId) || 0) + 1));
  const uniqueUsedIds = [...new Set(validSelections.map(row => row.teeId))];
  const sameTeeId = uniqueUsedIds.length === 1 ? uniqueUsedIds[0] : '';
  const rankedCountEntries = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (rankedIds.indexOf(a[0]) - rankedIds.indexOf(b[0])));
  const mostCommonTeeId = rankedCountEntries[0]?.[0] || '';
  const hardestTeeId = rankedIds[0] || '';
  const recommendedTeeId = mostCommonTeeId || sameTeeId || hardestTeeId || '';
  const showReferenceSelector = sortedTees.length > 1 && uniqueUsedIds.length > 1;
  return { course, sortedTees, rankedIds, counts, uniqueUsedIds, sameTeeId, mostCommonTeeId, hardestTeeId, recommendedTeeId, showReferenceSelector };
}
function syncReferenceTeeUi({ courseId = null, selections = null, forceAuto = false } = {}) {
  const field = document.getElementById('referenceTeeField');
  const select = document.getElementById('matchTeeSelect');
  const help = document.getElementById('referenceTeeHelp');
  const badge = document.getElementById('referenceTeeBadge');
  if (!select) return '';
  const stats = getReferenceTeeStats(courseId, selections);
  const currentValue = select.value || '';
  const recommended = stats.recommendedTeeId || '';
  const sameTee = stats.sameTeeId || '';
  const nextAutoId = stats.showReferenceSelector ? recommended : (sameTee || recommended || currentValue || '');
  const shouldAutoApply = forceAuto || !currentValue || !uiState.referenceTeeManual || currentValue === uiState.referenceTeeAutoId || !stats.rankedIds.includes(currentValue);
  if (nextAutoId && shouldAutoApply) {
    select.value = nextAutoId;
    uiState.referenceTeeAutoId = nextAutoId;
  } else if (nextAutoId) {
    uiState.referenceTeeAutoId = nextAutoId;
  }
  if (!stats.showReferenceSelector && sameTee && (!select.value || shouldAutoApply)) {
    select.value = sameTee;
    uiState.referenceTeeAutoId = sameTee;
  }
  if (field) field.classList.toggle('hidden', !stats.showReferenceSelector);
  if (badge) badge.textContent = stats.showReferenceSelector ? '(optional override)' : '';
  if (help) {
    const mostCommonLabel = stats.mostCommonTeeId && stats.hardestTeeId && stats.mostCommonTeeId !== stats.hardestTeeId
      ? `Defaults to the most common player tee; ties fall back to the hardest tee.`
      : `Defaults to the hardest tee when there is no clear player-tee majority.`;
    help.textContent = stats.showReferenceSelector
      ? `${mostCommonLabel} Use this only when players are on different tees and you want to override the recommended handicap reference.`
      : (stats.sortedTees.length <= 1
          ? 'Reference tee stays hidden because this course only has one saved tee.'
          : 'Reference tee stays hidden unless the match uses more than one player tee.');
  }
  return select.value || nextAutoId || '';
}
function normalizeDraftTeeAssignments({ courseId = null, forceDefault = false } = {}) {
  const resolvedCourseId = courseId ?? (document.getElementById('matchCourseSelect')?.value || '');
  const course = getCourse(resolvedCourseId);
  const validTeeIds = new Set((course?.tees || []).map(t => t.id));
  const fallbackTeeId = getDefaultMatchTeeId(resolvedCourseId);
  const draft = Array.isArray(uiState.matchPlayerDraft) ? uiState.matchPlayerDraft : [];
  const next = draft.map(row => {
    const teeId = String(row?.teeId || '');
    const needsDefault = forceDefault || !teeId || (validTeeIds.size && !validTeeIds.has(teeId));
    return { ...row, teeId: needsDefault ? fallbackTeeId : teeId };
  });
  uiState.matchPlayerDraft = next;
  return next;
}
function syncScoreboardPrintControls(printView = null) {
  const resolvedView = printView === 'scorecard' ? 'scorecard' : 'summary';
  const select = document.getElementById('scoreboardPrintViewSelect');
  const button = document.getElementById('scoreboardShareRoundBtn');
  const hint = document.getElementById('scoreboardPrintViewHint');
  if (select && select.value !== resolvedView) select.value = resolvedView;
  if (button) button.textContent = 'Share Match';
  if (hint) hint.textContent = resolvedView === 'scorecard'
    ? 'Classic Scorecard selected. It will open ready to save or share as a PDF.'
    : 'Match Summary selected. It will open ready to save or share as a PDF.';
}

function renderTeamNameInputs(teamCount = Number(document.getElementById('teamCountSelect')?.value || 1), teamNames = []) {
  const wrap = document.getElementById('teamNamesGrid');
  if (!wrap) return;
  wrap.innerHTML = Array.from({ length: teamCount }, (_, idx) => `
    <label>
      <span>Team ${idx + 1} name</span>
      <input data-team-name="${idx + 1}" maxlength="25" value="${escapeHtml((teamNames[idx] || '').slice(0,25))}" placeholder="Team ${idx + 1}" />
    </label>
  `).join('');
}
function renderScoringControlConfig(existingMatch = null) {
  const modeSelect = document.getElementById('scoreEntryModeSelect');
  const officialInput = document.getElementById('officialScorerNameInput');
  const wrap = document.getElementById('teamInputRoleConfig');
  const hint = document.getElementById('scoreEntryModeHint');
  if (!modeSelect || !officialInput || !wrap || !hint) return;
  const teamCount = Number(document.getElementById('teamCountSelect')?.value || existingMatch?.teamCount || 1);
  const teamNames = Array.from({ length: teamCount }, (_, idx) => String(document.querySelector(`[data-team-name="${idx + 1}"]`)?.value || existingMatch?.teamNames?.[idx] || '').trim());
  const mode = normalizeScoringAccessMode(modeSelect?.value || existingMatch?.scoringAccessMode || existingMatch?.scoreEntryMode || 'team_codes');
  const teamScorers = buildTeamScorerAssignments(teamCount, teamNames, existingMatch?.teamScorers || []);
  if (existingMatch) existingMatch.teamScorers = teamScorers;
  wrap.classList.toggle('hidden', mode !== 'team_codes');
  hint.textContent = mode === 'team_codes'
    ? 'Each Team Enters Its Own Scores is the default recommended collaboration mode for the Supabase rollout.'
    : mode === 'open_edit'
      ? 'Anyone Can Enter Scores keeps scoring open to any authorized non-viewer device once shared scoring is enabled.'
      : 'One Device Scores for Everyone keeps one lead scorer in charge of entry.';
  if (mode !== 'team_codes') {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="section-label">Team scorer assignments</div>
    <div class="tiny top-gap">These team scorer labels and codes are Pass 1 placeholders so the later team-code join flow has clean structure to attach to.</div>
    <div class="grid two compact-grid top-gap">
      ${teamScorers.map(row => `
        <div class="card inset-card compact-grid-item">
          <div class="tiny"><strong>${escapeHtml(teamNames[row.team - 1] || `Team ${row.team}`)}</strong></div>
          <label class="top-gap"><span>Team scorer</span><input class="input-match" data-team-scorer-label="${row.team}" value="${escapeHtml(row.label)}" /></label>
          <label><span>Access code</span><input class="input-match" data-team-scorer-code="${row.team}" value="${escapeHtml(row.accessCode)}" /></label>
        </div>
      `).join('')}
    </div>`;
}
function collectTeamScorerAssignments(teamCount, teamNames, existing = []) {
  const fallback = buildTeamScorerAssignments(teamCount, teamNames, existing);
  return Array.from({ length: teamCount }, (_, idx) => {
    const team = idx + 1;
    const prior = fallback.find(row => row.team === team) || {};
    return {
      team,
      label: String(document.querySelector(`[data-team-scorer-label="${team}"]`)?.value || prior.label || defaultTeamScorerLabel(teamNames[idx], team)).trim() || defaultTeamScorerLabel(teamNames[idx], team),
      accessCode: String(document.querySelector(`[data-team-scorer-code="${team}"]`)?.value || prior.accessCode || defaultTeamAccessCode(teamNames[idx], team)).trim().toUpperCase() || defaultTeamAccessCode(teamNames[idx], team),
    };
  });
}
function renderScoreAccessCard(match) {
  const card = document.getElementById('scoreAccessCard');
  if (!card) return;
  // Hide the Scoring Access preview from the Scoring Input tab until collaborative/Supabase scoring is fully implemented.
  // The underlying scoring-access configuration and Supabase data model are intentionally left intact.
  card.classList.add('hidden');
}

function renderNineHoleConfigUi() {
  const holeCount = Number(document.getElementById('holeCountSelect')?.value || 18) === 9 ? 9 : 18;
  const wrap = document.getElementById('nineHoleConfigWrap');
  const segmentSelect = document.getElementById('nineHoleSegmentSelect');
  const customWrap = document.getElementById('customNineHoleStartWrap');
  const customSelect = document.getElementById('customNineHoleStartSelect');
  if (!wrap || !segmentSelect || !customWrap || !customSelect) return;
  wrap.classList.toggle('hidden', holeCount !== 9);
  customSelect.innerHTML = Array.from({ length: 10 }, (_, idx) => `<option value="${idx + 1}">Holes ${idx + 1}-${idx + 9}</option>`).join('');
  if (!customSelect.value) customSelect.value = '1';
  customWrap.classList.toggle('hidden', holeCount !== 9 || segmentSelect.value !== 'custom');
}
function getAssignmentSelections() {
  return Array.from(document.querySelectorAll('[data-player-slot]')).map(el => el.value).filter(Boolean);
}
function getReferenceFallbackTeeId(courseId = null) {
  const resolvedCourseId = courseId ?? (document.getElementById('matchCourseSelect')?.value || '');
  const selectedTeeId = document.getElementById('matchTeeSelect')?.value || '';
  const course = getCourse(resolvedCourseId);
  const sortedTees = course ? getSortedTeesByYardage(course) : [];
  const validTeeIds = new Set(sortedTees.map(t => t.id));
  if (selectedTeeId && (!validTeeIds.size || validTeeIds.has(selectedTeeId))) return selectedTeeId;
  return sortedTees[0]?.id || '';
}
function getCurrentMatchEditorSelectionsSnapshot() {
  const slotCount = getCurrentSetupSlotCount();
  const playersPerTeam = getCurrentSetupPlayersPerTeam();
  const fallbackTeeId = getReferenceFallbackTeeId();
  const draft = Array.isArray(uiState.matchPlayerDraft) ? uiState.matchPlayerDraft : [];
  return Array.from({ length: slotCount }, (_, idx) => {
    const draftRow = draft.find(row => Number(row?.slot) === idx) || draft[idx] || {};
    const domSlot = document.querySelector(`[data-player-slot="${idx}"]`);
    const domTee = document.querySelector(`[data-player-tee-slot="${idx}"]`);
    return {
      slot: idx,
      team: Number(draftRow.team || domSlot?.dataset.slotTeam || (Math.floor(idx / playersPerTeam) + 1)) || 1,
      playerId: String(domSlot?.value || draftRow.playerId || ''),
      teeId: String(domTee?.value || draftRow.teeId || fallbackTeeId || ''),
    };
  });
}
function syncMatchPlayerDraft(selected = null) {
  const teamCount = Number(document.getElementById('teamCountSelect')?.value || 1);
  const playersPerTeam = Number(document.getElementById('playersPerTeamSelect')?.value || 1);
  const slotCount = teamCount * playersPerTeam;
  const defaultTeeId = getReferenceFallbackTeeId();
  const incoming = Array.isArray(selected) ? selected : [];
  const currentDraft = Array.isArray(uiState.matchPlayerDraft) ? uiState.matchPlayerDraft : [];
  const suppressDomCarryover = cleanNewMatchSetupInProgress && Array.isArray(selected) && selected.length === 0;
  const next = Array.from({ length: slotCount }, (_, idx) => {
    const draft = currentDraft.find(s => Number(s.slot) === idx) || {};
    const direct = incoming.find(s => Number(s.slot) === idx) || {};
    const domPlayerId = suppressDomCarryover ? '' : (document.querySelector(`[data-player-slot="${idx}"]`)?.value || '');
    const domTeeId = suppressDomCarryover ? '' : (document.querySelector(`[data-player-tee-slot="${idx}"]`)?.value || '');
    const hasDirectPlayer = Object.prototype.hasOwnProperty.call(direct, 'playerId');
    const hasDirectTee = Object.prototype.hasOwnProperty.call(direct, 'teeId');
    return {
      slot: idx,
      team: Math.floor(idx / playersPerTeam) + 1,
      playerId: String(hasDirectPlayer ? (direct.playerId || '') : (draft.playerId || domPlayerId || '')),
      teeId: String(hasDirectTee ? (direct.teeId || '') : (draft.teeId || domTeeId || defaultTeeId || '')),
    };
  });
  uiState.matchPlayerDraft = next;
  return next;
}
function getMatchPlayerDraft() {
  return syncMatchPlayerDraft();
}
function getCurrentSetupTeamCount() {
  return Math.max(1, Number(document.getElementById('teamCountSelect')?.value || 1));
}
function getCurrentSetupPlayersPerTeam() {
  return Math.max(1, Number(document.getElementById('playersPerTeamSelect')?.value || 1));
}
function getCurrentSetupSlotCount() {
  return getCurrentSetupTeamCount() * getCurrentSetupPlayersPerTeam();
}
function buildSetupSlotSelections(selected = []) {
  const teamCount = getCurrentSetupTeamCount();
  const playersPerTeam = getCurrentSetupPlayersPerTeam();
  const slotCount = getCurrentSetupSlotCount();
  const synced = syncMatchPlayerDraft(selected);
  return Array.from({ length: slotCount }, (_, idx) => {
    const row = synced[idx] || {};
    return {
      slot: idx,
      team: Number(row.team || (Math.floor(idx / playersPerTeam) + 1)) || 1,
      playerId: String(row.playerId || ''),
      teeId: String(row.teeId || ''),
    };
  }).slice(0, Math.max(1, teamCount * playersPerTeam));
}
function populateMatchPlayerPicker(selected = []) {
  const container = document.getElementById('matchPlayersPicker');
  const summary = document.getElementById('assignmentSummary');
  if (!container) return;
  const teamCount = getCurrentSetupTeamCount();
  const playersPerTeam = getCurrentSetupPlayersPerTeam();
  const slotCount = getCurrentSetupSlotCount();
  const courseId = document.getElementById('matchCourseSelect')?.value || '';
  const defaultTeeId = syncReferenceTeeUi();
  const course = getCourse(courseId);
  const teeOptions = course ? getSortedTeesByYardage(course).map(t => ({ id: t.id, label: formatTeeSummary(t) })) : [];
  const draftSelections = buildSetupSlotSelections(selected);
  uiState.matchPlayerDraft = draftSelections;
  const selectedBySlot = draftSelections.map(s => s.playerId || '');
  const teeBySlot = draftSelections.map(s => s.teeId || defaultTeeId || '');
  const teamNames = Array.from({ length: teamCount }, (_, i) => String(document.querySelector(`[data-team-name="${i + 1}"]`)?.value || '').trim().slice(0,25));
  container.innerHTML = Array.from({ length: slotCount }, (_, idx) => {
    const teamNo = Math.floor(idx / playersPerTeam) + 1;
    const slotNo = (idx % playersPerTeam) + 1;
    const current = selectedBySlot[idx] || '';
    const currentPlayer = getPlayer(current);
    const currentTeeId = teeBySlot[idx] || defaultTeeId || '';
    const buttonLabel = currentPlayer ? getPlayerDisplayHtml(currentPlayer, { wrapperClass: 'player-label-inline', nameClass: 'player-label-name', indexClass: 'player-label-index' }) : 'Tap to select player';
    const buttonClass = currentPlayer ? 'player-card-trigger has-selection' : 'player-card-trigger';
    const selectablePlayers = getSelectablePlayersForSlot(idx);
    const hasSavedPlayers = state.players.length > 0;
    const teeSelect = teeOptions.length
      ? `<label class="tiny player-tee-select"><span>Handicap tee</span><select data-player-tee-slot="${idx}" data-slot-team="${teamNo}"><option value="">Select tee</option>${teeOptions.map(t => `<option value="${t.id}" ${t.id === currentTeeId ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>`
      : '<div class="tiny">Select a course first to choose tees.</div>';
    return `
      <div class="picker-row picker-row-stack picker-card-row" data-assignment-slot="${idx}">
        <div class="tiny"><strong>${escapeHtml(teamNames[teamNo - 1] || `Team ${teamNo}`)}</strong> · Player ${slotNo}</div>
        <input type="hidden" data-player-slot="${idx}" data-slot-team="${teamNo}" value="${current}">
        <button type="button" class="${buttonClass}" data-open-player-sheet="${idx}" data-slot-team="${teamNo}" aria-label="Select player for ${escapeHtml(teamNames[teamNo - 1] || `Team ${teamNo}`)} player ${slotNo}" ${hasSavedPlayers ? '' : 'disabled'}>
          <span class="player-card-label">${buttonLabel}</span>
          <span class="player-card-hint">${hasSavedPlayers ? (currentPlayer ? 'Change player' : 'Search saved players') : 'Add players on the Players tab'}</span>
        </button>
        ${teeSelect}
      </div>
    `;
  }).join('');
  if (summary) {
    const base = `${slotCount} slots · ${teamCount} teams · ${playersPerTeam} player(s) per team`;
    const teeMsg = teeOptions.length ? ' · player tees enabled' : ' · select a course to enable player tees';
    const playerMsg = state.players.length ? ' · tap a player card to search saved players' : ' · add saved players on the Players tab to fill these slots';
    summary.textContent = `${base}${teeMsg}${playerMsg}`;
  }
  bindPlayerPickerTriggers();
}


function bindPlayerPickerTriggers() {
  const container = document.getElementById('matchPlayersPicker');
  if (!container) return;
  container.querySelectorAll('[data-open-player-sheet]').forEach(btn => {
    btn.setAttribute('type', 'button');
  });
}

function getDefaultGameConfigs() {
  return [
    { key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 },
    { key: 'individual_match', matchups: [] },
    { key: 'team_match', basis: 'net', stake: 5 },
    { key: 'team_stroke', basis: 'net', scoringMode: 'aggregate', stake: 5 },
    { key: 'skins', basis: 'net', skinsType: 'individual', stake: 5 },
    { key: 'greenies', stakePerPlayer: 1, participants: [] },
    { key: 'nine_point', basis: 'net', stakePerPoint: 1, playerIds: [] },
  ];
}
function getGameConfig(key, existing = []) {
  return (existing || []).find(g => g.key === key) || getDefaultGameConfigs().find(g => g.key === key) || { key };
}
function getCurrentAssignablePlayers() {
  const ids = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => el.value).filter(Boolean);
  const unique = new Set(ids);
  return state.players.filter(p => unique.has(p.id));
}
function getCurrentMatchEditorSelections() {
  const synced = syncMatchPlayerDraft(getCurrentMatchEditorSelectionsSnapshot());
  return synced.map((row, idx) => ({
    playerId: row.playerId || document.querySelector(`[data-player-slot="${idx}"]`)?.value || '',
    team: row.team || Number(document.querySelector(`[data-player-slot="${idx}"]`)?.dataset.slotTeam) || 1,
    slot: idx,
    teeId: row.teeId || document.querySelector(`[data-player-tee-slot="${idx}"]`)?.value || '',
  }));
}
function getSelectedPlayersFromSetup() {
  const teamCount = Number(document.getElementById('teamCountSelect')?.value || 1);
  const playersPerTeam = Number(document.getElementById('playersPerTeamSelect')?.value || 1);
  const slotCount = Math.max(1, teamCount * playersPerTeam);
  const draft = syncMatchPlayerDraft();
  return Array.from({ length: slotCount }, (_, idx) => {
    const row = draft[idx] || {};
    const domSlot = document.querySelector(`[data-player-slot="${idx}"]`);
    const domTee = document.querySelector(`[data-player-tee-slot="${idx}"]`);
    const team = Number(row.team || domSlot?.dataset.slotTeam || (Math.floor(idx / Math.max(1, playersPerTeam)) + 1)) || 1;
    return {
      playerId: String(row.playerId || domSlot?.value || ''),
      team,
      slot: idx,
      teeId: String(row.teeId || domTee?.value || getDefaultMatchTeeId() || ''),
    };
  }).filter(row => row.playerId);
}

function getSelectablePlayersForSlot(slot) {
  const draft = getMatchPlayerDraft();
  const currentId = draft[slot]?.playerId || document.querySelector(`[data-player-slot="${slot}"]`)?.value || '';
  const selectedByOtherSlots = draft
    .map((row, idx) => idx === slot ? '' : (row?.playerId || ''))
    .filter(Boolean);
  return state.players.filter(p => !selectedByOtherSlots.includes(p.id) || p.id === currentId);
}
function refreshMatchSetupUi() {
  const selections = Array.from(document.querySelectorAll('[data-player-slot]')).map((el, idx) => ({
    playerId: el.value,
    teeId: document.querySelector(`[data-player-tee-slot="${idx}"]`)?.value || '',
    slot: idx
  }));
  syncMatchPlayerDraft(selections);
  syncReferenceTeeUi({ selections });
  populateMatchPlayerPicker(selections);
  renderGamesPicker(collectSelectedGames());
  renderSetupHandicapPreview();
}
function updateMatchPlayerTee(slot, teeId = '') {
  const normalizedSlot = Number(slot);
  if (!Number.isFinite(normalizedSlot) || normalizedSlot < 0) return;
  const fallbackTeam = Number(document.querySelector(`[data-player-slot="${normalizedSlot}"]`)?.dataset.slotTeam || document.querySelector(`[data-open-player-sheet="${normalizedSlot}"]`)?.dataset.slotTeam || 1) || 1;
  const draft = syncMatchPlayerDraft(getCurrentMatchEditorSelectionsSnapshot());
  const row = draft[normalizedSlot] || { slot: normalizedSlot, team: fallbackTeam, playerId: '', teeId: '' };
  row.slot = normalizedSlot;
  row.team = Number(row.team || fallbackTeam) || 1;
  row.playerId = String(row.playerId || document.querySelector(`[data-player-slot="${normalizedSlot}"]`)?.value || '');
  row.teeId = String(teeId || '');
  draft[normalizedSlot] = row;
  uiState.matchPlayerDraft = normalizeDraftTeeAssignments({ selections: draft, forceDefault: false });
  const refStats = getReferenceTeeStats(null, uiState.matchPlayerDraft);
  if (!refStats.showReferenceSelector) uiState.referenceTeeManual = false;
  syncReferenceTeeUi({ selections: uiState.matchPlayerDraft, forceAuto: !uiState.referenceTeeManual });
  document.querySelector(`[data-player-tee-slot="${normalizedSlot}"]`)?.closest('.picker-row')?.classList.remove('picker-row--error');
  renderGamesPicker(collectSelectedGames());
  renderSetupHandicapPreview();
}

function openPlayerSearchSheet(slot) {
  const sheet = document.getElementById('playerSearchSheet');
  const input = document.getElementById('playerSearchInput');
  const meta = document.getElementById('playerSearchMeta');
  if (!sheet || !input) return;
  sheet.dataset.slot = String(slot);
  const teamNo = Number(document.querySelector(`[data-player-slot="${slot}"]`)?.dataset.slotTeam || document.querySelector(`[data-open-player-sheet="${slot}"]`)?.dataset.slotTeam || 1);
  const teamName = document.querySelector(`[data-team-name="${teamNo}"]`)?.value || `Team ${teamNo}`;
  const slotWithinTeam = (slot % Math.max(1, Number(document.getElementById('playersPerTeamSelect')?.value || 1))) + 1;
  if (meta) meta.textContent = `${teamName} · Player ${slotWithinTeam} · choose from saved players`;
  input.value = '';
  renderPlayerSearchResults(slot, '');
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  setTimeout(() => input.focus(), 50);
}
function closePlayerSearchSheet() {
  const sheet = document.getElementById('playerSearchSheet');
  const input = document.getElementById('playerSearchInput');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  sheet.dataset.slot = '';
  if (input) input.value = '';
  document.body.classList.remove('sheet-open');
}

window.openPlayerSearchSheet = openPlayerSearchSheet;
window.closePlayerSearchSheet = closePlayerSearchSheet;
window.assignPlayerToSlot = assignPlayerToSlot;
window.bindPlayerPickerTriggers = bindPlayerPickerTriggers;

function clearMatchTeeErrors() {
  document.querySelectorAll('#matchPlayersPicker .picker-row--error').forEach(el => el.classList.remove('picker-row--error'));
}
function markMissingTeeRows() {
  clearMatchTeeErrors();
  document.querySelectorAll('#matchPlayersPicker [data-player-tee-slot]').forEach(select => {
    if (!select.value) {
      select.closest('.picker-row')?.classList.add('picker-row--error');
    }
  });
}
function renderPlayerSearchResults(slot, query = '') {
  const results = document.getElementById('playerSearchResults');
  if (!results) return;
  const currentId = document.querySelector(`[data-player-slot="${slot}"]`)?.value || '';
  const q = String(query || '').trim().toLowerCase();
  const matches = getSelectablePlayersForSlot(slot)
    .filter(player => !q || getPlayerLookupLabel(player).toLowerCase().includes(q) || String(player.name || '').toLowerCase().includes(q))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const selectedPlayer = getPlayer(currentId);
  const clearHtml = selectedPlayer
    ? `<button type="button" class="sheet-action danger" data-clear-player-slot="${slot}">Clear current player (${escapeHtml(selectedPlayer.name)})</button>`
    : '';
  const matchHtml = matches.length
    ? matches.map(player => `
      <button type="button" class="player-search-result ${player.id === currentId ? 'is-selected' : ''}" data-select-player-slot="${slot}" data-player-id="${escapeHtml(player.id)}">
        ${getPlayerDisplayHtml(player, { wrapperClass: 'player-search-main player-label-inline', nameClass: 'player-label-name', indexClass: 'player-label-index' })}
      </button>
    `).join('')
    : '<div class="tiny">No saved players match that search.</div>';
  results.innerHTML = `${clearHtml}${matchHtml}`;
}
function assignPlayerToSlot(slot, playerId = '') {
  const draft = getMatchPlayerDraft();
  const playersPerTeam = Math.max(1, Number(document.getElementById('playersPerTeamSelect')?.value || 1));
  const fallbackTeam = Number(document.querySelector(`[data-player-slot="${slot}"]`)?.dataset.slotTeam || document.querySelector(`[data-open-player-sheet="${slot}"]`)?.dataset.slotTeam || (Math.floor(Number(slot) / playersPerTeam) + 1)) || 1;
  const row = draft[slot] || { slot, team: fallbackTeam, playerId: '', teeId: '' };
  row.team = Number(row.team || fallbackTeam) || 1;
  row.playerId = playerId || '';
  if (!row.teeId) row.teeId = document.getElementById('matchTeeSelect')?.value || getDefaultMatchTeeId() || '';
  draft[slot] = row;
  uiState.matchPlayerDraft = draft;
  syncReferenceTeeUi({ selections: draft });
  populateMatchPlayerPicker(draft);
  renderGamesPicker(collectSelectedGames());
  renderSetupHandicapPreview();
  clearMatchTeeErrors();
  closePlayerSearchSheet();
}
function refreshMatchPlayerSlots(options = {}) {
  const preserveSelections = options.preserveSelections !== false;
  const selected = preserveSelections ? getCurrentMatchEditorSelections() : [];
  populateMatchPlayerPicker(selected);
  renderGamesPicker(collectSelectedGames());
  renderSetupHandicapPreview();
}
function preserveMatchSetupUi() {
  if (cleanNewMatchSetupInProgress) return;
  const form = document.getElementById('matchForm');
  if (!form) return;
  const selectedCourseId = document.getElementById('matchCourseSelect')?.value || '';
  const selectedTeeId = document.getElementById('matchTeeSelect')?.value || '';
  const currentSelections = getCurrentMatchEditorSelections();
  syncMatchPlayerDraft(currentSelections);
  const currentTeamNames = Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value || '');
  const currentGames = collectSelectedGames();
  populateMatchCourseSelects(selectedCourseId, selectedTeeId);
  syncReferenceTeeUi({ courseId: selectedCourseId, selections: currentSelections, forceAuto: !uiState.referenceTeeManual });
  renderTeamNameInputs(Number(document.getElementById('teamCountSelect')?.value || 1), currentTeamNames);
  renderScoringControlConfig();
  populateMatchPlayerPicker(currentSelections);
  renderGamesPicker(currentGames);
}
function renderGamesPicker(existing = []) {
  const picker = document.getElementById('gamesPicker');
  const configsWrap = document.getElementById('gameConfigs');
  if (!picker || !configsWrap) return;
  const normalizedExisting = normalizeSelectedGamesOrder(existing || []);
  const selectedKeys = normalizedExisting.map(g => g.key);
  picker.innerHTML = GAME_LIBRARY.map(game => `
    <label class="game-pill ${selectedKeys.includes(game.key) ? 'selected' : ''}">
      <input type="checkbox" data-game-key="${game.key}" ${selectedKeys.includes(game.key) ? 'checked' : ''} />
      <span>${getGameLabel(game.key)}</span>
    </label>
  `).join('');
  const selectedGames = normalizeSelectedGamesOrder(GAME_LIBRARY.filter(g => selectedKeys.includes(g.key)));
  configsWrap.innerHTML = selectedGames.map(game => {
    const cfg = getGameConfig(game.key, normalizedExisting);
    if (game.key === 'nassau') {
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Nassau</div><div class="tiny">Head-to-head only</div></div>
        <div class="grid two compact-grid top-gap">
          <label><span>Basis</span><select data-game-config="${game.key}" data-field="basis">
            <option value="gross" ${cfg.basis === 'gross' ? 'selected' : ''}>Gross</option>
            <option value="net" ${cfg.basis === 'net' ? 'selected' : ''}>Net</option>
            <option value="both" ${cfg.basis === 'both' ? 'selected' : ''}>Both</option>
          </select></label>
          <div></div>
          <label><span>$ Front</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stakesFront" value="${cfg.stakesFront ?? 5}" /></label>
          <label><span>$ Back</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stakesBack" value="${cfg.stakesBack ?? 5}" /></label>
          <label><span>$ 18</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stakesOverall" value="${cfg.stakesOverall ?? 5}" /></label>
        </div>
      </div>`;
    }
    if (game.key === 'team_stroke') {
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Team Stroke Play</div><div class="tiny">Gross or net · best ball or aggregate</div></div>
        <div class="grid two compact-grid top-gap">
          <label><span>Basis</span><select data-game-config="${game.key}" data-field="basis">
            <option value="gross" ${cfg.basis === 'gross' ? 'selected' : ''}>Gross</option>
            <option value="net" ${cfg.basis === 'net' ? 'selected' : ''}>Net</option>
          </select></label>
          <label><span>Team score</span><select data-game-config="${game.key}" data-field="scoringMode">
            <option value="aggregate" ${resolveTeamStrokeScoringMode(cfg.scoringMode) === 'aggregate' ? 'selected' : ''}>Aggregate</option>
            <option value="best_ball" ${resolveTeamStrokeScoringMode(cfg.scoringMode) === 'best_ball' ? 'selected' : ''}>Best Team Ball</option>
          </select></label>
          <label><span>$ Stake</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stake" value="${cfg.stake ?? 5}" /></label>
        </div>
      </div>`;
    }
    if (game.key === 'skins') {
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Skins</div><div class="tiny">Individual or team skins</div></div>
        <div class="grid two compact-grid top-gap">
          <label><span>Skin type</span><select data-game-config="${game.key}" data-field="skinsType">
            <option value="individual" ${cfg.skinsType === 'individual' ? 'selected' : ''}>Individual</option>
            <option value="team" ${cfg.skinsType === 'team' ? 'selected' : ''}>Team</option>
          </select></label>
          <label><span>Basis</span><select data-game-config="${game.key}" data-field="basis">
            <option value="gross" ${cfg.basis === 'gross' ? 'selected' : ''}>Gross</option>
            <option value="net" ${cfg.basis === 'net' ? 'selected' : ''}>Net</option>
          </select></label>
          <label><span>$ Stake</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stake" value="${cfg.stake ?? 5}" /></label>
        </div>
      </div>`;
    }
    if (game.key === 'greenies') {
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Greenies</div><div class="tiny">Par-3 closest to the pin</div></div>
        <div class="grid two compact-grid top-gap">
          <label class="span-2"><span>Participants</span>
            <div class="actions wrap compact-actions top-gap"><button type="button" class="secondary" id="greeniesSelectAllBtn">Select All Players</button><button type="button" class="secondary" id="greeniesClearAllBtn">Clear</button></div>
            <div class="greenies-list">${getCurrentAssignablePlayers().map(p => `<label class="mini-check"><input type="checkbox" data-greenie-player="${p.id}" ${(cfg.participants || []).includes(p.id) ? 'checked' : ''} /> ${escapeHtml(p.name)}</label>`).join('') || '<div class="tiny">Select match players first.</div>'}</div>
          </label>
          <label><span>$ / player / par 3</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stakePerPlayer" value="${cfg.stakePerPlayer ?? 1}" /></label>
        </div>
      </div>`;
    }
    if (game.key === 'individual_match') {
      const rows = Array.isArray(cfg.matchups) && cfg.matchups.length ? cfg.matchups : [{ id: uid(), playerAId: '', playerBId: '', game: 'nassau', basis: 'net', stake: 5 }];
      const players = getCurrentAssignablePlayers();
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Head-to-Head Side Matches</div><div class="tiny">Separate from the team payout total. Configure one or more player-vs-player side bets.</div></div>
        <div class="side-match-config-list top-gap">
          ${rows.map((row, idx) => {
            const playerOptions = getSideMatchPlayerOptions(players, row.playerAId || '', row.playerBId || '');
            return `<div class="side-match-row" data-side-match-row="${row.id}">
              <div class="tiny"><strong>Side match ${idx + 1}</strong></div>
              <label><span>Player A</span><select data-side-field="playerAId"><option value="">Select player</option>${playerOptions.playerA.map(p => `<option value="${p.id}" ${p.id === row.playerAId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
              <label><span>Player B</span><select data-side-field="playerBId"><option value="">Select player</option>${playerOptions.playerB.map(p => `<option value="${p.id}" ${p.id === row.playerBId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
              <label><span>Game</span><select data-side-field="game">${getSideMatchGameOptions().map(opt => `<option value="${opt.key}" ${String(row.game || 'nassau') === opt.key ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}</select></label>
              <label><span>Basis</span><select data-side-field="basis"><option value="gross" ${row.basis === 'gross' ? 'selected' : ''}>Gross</option><option value="net" ${row.basis !== 'gross' ? 'selected' : ''}>Net</option></select></label>
              <label><span>$ Stake</span><input type="number" step="0.01" data-side-field="stake" value="${Number(row.stake ?? 5) || 0}" /></label>
              <div class="side-match-row-actions"><button type="button" class="secondary" data-remove-side-match="${row.id}">Remove</button></div>
            </div>`;
          }).join('')}
        </div>
        <div class="actions top-gap"><button type="button" class="secondary" id="addSideMatchBtn">Add Side Match</button></div>
      </div>`;
    }
    if (game.key === 'nine_point') {
      const players = getCurrentAssignablePlayers();
      const selectedIds = Array.isArray(cfg.playerIds) ? cfg.playerIds.slice(0, 3) : [];
      while (selectedIds.length < 3) selectedIds.push('');
      const playerOptions = getNinePointPlayerOptions(players, selectedIds);
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">9-Point Game</div><div class="tiny">3-player only side game. Points per hole sum to 9.</div></div>
        <div class="nine-point-settlement-note top-gap">Payouts settle final point differentials head-to-head between each player.</div>
        <div class="grid two compact-grid top-gap">
          <label><span>Basis</span><select data-game-config="${game.key}" data-field="basis"><option value="net" ${cfg.basis !== 'gross' ? 'selected' : ''}>Net</option><option value="gross" ${cfg.basis === 'gross' ? 'selected' : ''}>Gross</option></select></label>
          <label><span>$ / point</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stakePerPoint" value="${cfg.stakePerPoint ?? 1}" /></label>
          <label class="span-2"><span>Players</span><div class="actions wrap compact-actions top-gap"><button type="button" class="secondary" id="ninePointSelectAllBtn">Select all match players</button><button type="button" class="secondary" id="ninePointClearBtn">Clear</button></div></label>
          ${[0,1,2].map(idx => `<label><span>Player ${idx + 1}</span><select data-nine-point-player="${idx}"><option value="">Select player</option>${playerOptions[idx].map(p => `<option value="${p.id}" ${p.id === selectedIds[idx] ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>`).join('')}
        </div>
      </div>`;
    }
    return `<div class="card inset-card game-config-card">
      <div class="game-config-header"><div class="section-label">${getGameLabel(game.key)}</div><div class="tiny">Configure basis and stakes</div></div>
      <div class="grid two compact-grid top-gap">
        <label><span>Basis</span><select data-game-config="${game.key}" data-field="basis">
          <option value="gross" ${cfg.basis === 'gross' ? 'selected' : ''}>Gross</option>
          <option value="net" ${cfg.basis === 'net' ? 'selected' : ''}>Net</option>
        </select></label>
        <label><span>$ Stake</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stake" value="${cfg.stake ?? 5}" /></label>
      </div>
    </div>`;
  }).join('');
}
function collectSelectedGames() {
  const keys = Array.from(document.querySelectorAll('[data-game-key]:checked')).map(el => el.dataset.gameKey).slice(0, 5);
  const games = keys.map(key => {
    const cfg = { key };
    document.querySelectorAll(`[data-game-config="${key}"]`).forEach(el => {
      cfg[el.dataset.field] = el.value;
    });
    if (key === 'greenies') {
      const allowed = new Set(getCurrentAssignablePlayers().map(p => p.id));
      cfg.participants = Array.from(document.querySelectorAll('[data-greenie-player]:checked')).map(el => el.dataset.greeniePlayer).filter(id => allowed.has(id));
    }
    if (key === 'individual_match') {
      const allowed = new Set(getCurrentAssignablePlayers().map(p => p.id));
      cfg.matchups = Array.from(document.querySelectorAll('[data-side-match-row]')).map(row => {
        const playerAId = row.querySelector('[data-side-field="playerAId"]')?.value || '';
        const playerBId = row.querySelector('[data-side-field="playerBId"]')?.value || '';
        return {
          id: row.dataset.sideMatchRow || uid(),
          playerAId: allowed.has(playerAId) ? playerAId : '',
          playerBId: allowed.has(playerBId) ? playerBId : '',
          game: row.querySelector('[data-side-field="game"]')?.value || 'nassau',
          basis: row.querySelector('[data-side-field="basis"]')?.value || 'net',
          stake: row.querySelector('[data-side-field="stake"]')?.value || '0',
        };
      }).filter(row => row.playerAId || row.playerBId || Number(row.stake || 0) || row.game || row.basis);
      if (!cfg.matchups.length) cfg.matchups = [{ id: uid(), playerAId: '', playerBId: '', game: 'nassau', basis: 'net', stake: 5 }];
    }
    if (key === 'nine_point') {
      const allowed = new Set(getCurrentAssignablePlayers().map(p => p.id));
      cfg.playerIds = [...new Set(Array.from(document.querySelectorAll('[data-nine-point-player]')).slice(0, 3).map(el => allowed.has(el.value) ? el.value : '').filter(Boolean))];
    }
    return cfg;
  });
  return normalizeSelectedGamesOrder(games);
}


function getAvailableSourceTees(courseId = '', excludeTeeId = '') {
  const course = getCourse(courseId);
  return getSortedTeesByYardage(course).filter(t => t.id !== excludeTeeId);
}
function buildComboSourceRows(courseId = '', comboSources = null) {
  const sourceTees = getAvailableSourceTees(courseId, editingTeeRef?.teeId || '');
  const baseSources = Array.isArray(comboSources) && comboSources.length
    ? comboSources.slice(0, 18).map((row, idx) => ({ holeNumber: idx + 1, sourceTeeId: row?.sourceTeeId || '' }))
    : buildDefaultHoles().map(h => ({ holeNumber: h.holeNumber, sourceTeeId: '' }));
  return baseSources.map((row, idx) => {
    const sourceTee = sourceTees.find(t => t.id === row.sourceTeeId) || null;
    const hole = sourceTee?.holes?.[idx] || null;
    return {
      holeNumber: idx + 1,
      sourceTeeId: row.sourceTeeId || '',
      yardage: Number(hole?.yardage) || null,
      par: Number(hole?.par) || null,
      strokeIndex: Number(hole?.strokeIndex) || null,
    };
  });
}
function renderComboSourceRows(courseId = '', comboSources = null) {
  const wrap = document.getElementById('comboHoleSourceWrap');
  if (!wrap) return;
  const sourceTees = getAvailableSourceTees(courseId, editingTeeRef?.teeId || '');
  const rows = buildComboSourceRows(courseId, comboSources);
  if (!sourceTees.length) {
    wrap.innerHTML = '<div class="tiny">Add at least one existing tee on this course before building a combo tee.</div>';
    return;
  }
  wrap.innerHTML = `
    <div class="hole-grid-wrap top-gap">
      <table class="hole-grid hole-grid-course combo-grid">
        <thead>
          <tr>
            <th>Hole</th>
            <th>Source tee</th>
            <th>Yds</th>
            <th>Par</th>
            <th>SI</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, idx) => `
            <tr>
              <td class="hole-num">${idx + 1}</td>
              <td>
                <select data-combo-hole="${idx}">
                  <option value="">Select tee</option>
                  ${sourceTees.map(tee => `<option value="${tee.id}" ${tee.id === row.sourceTeeId ? 'selected' : ''}>${escapeHtml(tee.teeName)}</option>`).join('')}
                </select>
              </td>
              <td>${row.yardage ? formatYardageValue(row.yardage) : '—'}</td>
              <td>${row.par ?? '—'}</td>
              <td>${row.strokeIndex ?? '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}
function collectComboSources() {
  return Array.from({ length: 18 }, (_, idx) => ({
    holeNumber: idx + 1,
    sourceTeeId: document.querySelector(`[data-combo-hole="${idx}"]`)?.value || ''
  }));
}
function buildComboHoles(courseId = '', comboSources = null) {
  const course = getCourse(courseId);
  if (!course) return buildDefaultHoles();
  const sources = Array.isArray(comboSources) ? comboSources : collectComboSources();
  return buildDefaultHoles().map((hole, idx) => {
    const sourceTeeId = sources[idx]?.sourceTeeId || '';
    const sourceTee = course.tees.find(t => t.id === sourceTeeId);
    const sourceHole = sourceTee?.holes?.[idx];
    return normalizeHole({
      holeNumber: idx + 1,
      yardage: Number(sourceHole?.yardage) || null,
      par: Number(sourceHole?.par) || null,
      strokeIndex: Number(sourceHole?.strokeIndex) || null,
    });
  });
}
function syncComboTotals() {
  const form = document.getElementById('teeForm');
  if (!form || !document.getElementById('teeIsCombo')?.checked) return;
  const holes = buildComboHoles(form.elements.namedItem('courseId')?.value || '');
  form.elements.namedItem('length').value = sumYardage(holes) || '';
  form.elements.namedItem('par').value = sumPar(holes) || '';
}
function refreshTeeModeUi({ preserveCombo = true } = {}) {
  const form = document.getElementById('teeForm');
  if (!form) return;
  const isCombo = !!document.getElementById('teeIsCombo')?.checked;
  const standardWrap = document.getElementById('standardHoleRowsWrap');
  const comboWrap = document.getElementById('comboTeeBuilderWrap');
  if (standardWrap) standardWrap.classList.toggle('hidden', isCombo);
  if (comboWrap) comboWrap.classList.toggle('hidden', !isCombo);
  if (isCombo) {
    let comboSources = preserveCombo ? collectComboSources() : null;
    if ((!comboSources || !comboSources.some(row => row.sourceTeeId)) && editingTeeRef) {
      const existingTee = getTee(editingTeeRef.courseId, editingTeeRef.teeId);
      if (existingTee?.isCombo && Array.isArray(existingTee.comboSources)) comboSources = existingTee.comboSources;
    }
    renderComboSourceRows(form.elements.namedItem('courseId')?.value || '', comboSources);
    syncComboTotals();
  }
}
function loadTeeCopySource(courseId = '', sourceTeeId = '') {
  const course = getCourse(courseId);
  const sourceTee = course?.tees.find(t => t.id === sourceTeeId);
  if (!sourceTee) return;
  const form = document.getElementById('teeForm');
  form.elements.namedItem('gender').value = sourceTee.gender || 'M';
  form.elements.namedItem('length').value = sourceTee.length || '';
  form.elements.namedItem('par').value = sourceTee.par || '';
  form.elements.namedItem('rating').value = formatRatingValue(sourceTee.rating);
  form.elements.namedItem('slope').value = sourceTee.slope || '';
  document.getElementById('teeIsCombo').checked = !!sourceTee.isCombo;
  renderHoleRows(buildTeeHoleRows(courseId, sourceTee.holes));
  renderComboSourceRows(courseId, sourceTee.comboSources || null);
  refreshTeeModeUi({ preserveCombo: false });
  toast(`Copied ${sourceTee.teeName} into the tee editor.`);
}

function getParStrokeSourceTee(course, excludeTeeId = '') {
  const sourceTees = getSortedTeesByYardage(course).filter(t => t.id !== excludeTeeId && Array.isArray(t.holes) && t.holes.length);
  return sourceTees[0] || null;
}
function buildTeeHoleRows(courseId = '', holes = null) {
  const course = getCourse(courseId);
  const template = getCourseStrokeTemplate(course);
  let rows = holes ? holes.map(normalizeHole) : buildDefaultHoles();
  let usedSourceTeeTemplate = false;
  if (!holes) {
    const sourceTee = getParStrokeSourceTee(course, editingTeeRef?.teeId || '');
    if (sourceTee) {
      rows = rows.map((h, idx) => {
        const sourceHole = sourceTee.holes?.[idx] || {};
        return normalizeHole({
          ...h,
          yardage: null,
          par: Number(sourceHole.par) || null,
          strokeIndex: Number(sourceHole.strokeIndex) || null,
        });
      });
      usedSourceTeeTemplate = true;
    } else if (template) {
      rows = rows.map((h, idx) => ({ ...h, strokeIndex: Number(template[idx]) || null }));
    }
  }
  return template && !usedSourceTeeTemplate ? applyStrokeTemplate(rows, template) : rows;
}
function updateTeeStrokeTemplateHint(courseId = '') {
  const hint = document.getElementById('teeStrokeHint');
  if (!hint) return;
  const course = getCourse(courseId);
  hint.textContent = getCourseStrokeTemplate(course) ? 'This course has a saved default stroke index template. New tees inherit it unless you change and save the tee.' : 'No course-wide stroke index template yet. Save one tee with stroke indexes to reuse them across all tees.';
}
function renderHoleRows(holes = buildDefaultHoles()) {
  const body = document.getElementById('holesTableBody');
  body.innerHTML = holes.map((h, idx) => `
    <tr>
      <td class="hole-num">${idx + 1}</td>
      <td><input type="number" data-hole-field="yardage" data-hole-index="${idx}" value="${h.yardage ?? ''}" /></td>
      <td><input type="number" data-hole-field="par" data-hole-index="${idx}" value="${h.par ?? ''}" /></td>
      <td><input type="number" data-hole-field="strokeIndex" data-hole-index="${idx}" value="${h.strokeIndex ?? ''}" /></td>
    </tr>
  `).join('');
}
function collectHolesFromGrid() {
  return Array.from({ length: 18 }, (_, idx) => ({
    holeNumber: idx + 1,
    yardage: Number(document.querySelector(`[data-hole-field="yardage"][data-hole-index="${idx}"]`)?.value) || null,
    par: Number(document.querySelector(`[data-hole-field="par"][data-hole-index="${idx}"]`)?.value) || null,
    strokeIndex: Number(document.querySelector(`[data-hole-field="strokeIndex"][data-hole-index="${idx}"]`)?.value) || null,
  }));
}
function fillTotalsFromHoles() {
  const holes = collectHolesFromGrid();
  document.querySelector('#teeForm [name="length"]').value = sumYardage(holes) || '';
  document.querySelector('#teeForm [name="par"]').value = sumPar(holes) || '';
  toast('Totals updated from hole rows.');
}


function matchHasStarted(match) {
  return !!(match && completedHoles(match) > 0);
}
function updateSetupActionButtonStates() {
  const active = getActiveMatch();
  const editingActive = !!(editingMatchId && active && editingMatchId === active.id);
  const editBtn = document.getElementById("editActiveMatchBtn");
  const finalizeBtns = [document.getElementById("topCreateMatchBtn"), document.getElementById("matchSubmitBtn")].filter(Boolean);
  if (editBtn) {
    editBtn.disabled = !active || editingActive;
    editBtn.classList.toggle("is-active", editingActive);
    editBtn.textContent = editingActive ? "Editing Match" : "Edit Match";
  }
  finalizeBtns.forEach(btn => {
    btn.textContent = "Finalize Match Setup";
    btn.disabled = false;
  });
}

function renderMatchSetupState() {
  const wrap = document.getElementById('matchSetupFormWrap');
  const msg = document.getElementById('setupLockMsg');
  const active = getActiveMatch();
  const started = matchHasStarted(active);
  const editingActive = !!(editingMatchId && active && editingMatchId === active.id);
  if (!wrap || !msg) return;
  if (started && !editingActive) {
    wrap.classList.add('hidden');
    msg.textContent = `Scoring has started for ${active.name || 'the active match'}. Use Edit Match to make changes with confirmation.`;
  } else {
    wrap.classList.remove('hidden');
    msg.textContent = active ? `${active.name || 'Active match'} · ${completedHoles(active)}/${getRequestedHoleCount(active)} holes entered.` : 'Create a new match setup, or edit the active match.';
  }
  updateSetupActionButtonStates();
}

function loadPlayerEditor(playerId = null) {
  const form = document.getElementById('playerForm');
  editingPlayerId = playerId;
  document.getElementById('cancelPlayerEditBtn').classList.toggle('hidden', !playerId);
  document.getElementById('playerFormTitle').textContent = playerId ? 'Edit player' : 'Add player';
  document.getElementById('playerSubmitBtn').textContent = playerId ? 'Update Player' : 'Save Player';
  if (!playerId) { form.reset(); return; }
  const player = getPlayer(playerId); if (!player) return;
  form.name.value = player.name; form.index.value = player.index;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function loadCourseEditor(courseId = null) {
  const form = document.getElementById('courseForm');
  editingCourseId = courseId;
  document.getElementById('cancelCourseEditBtn').classList.toggle('hidden', !courseId);
  document.getElementById('courseFormTitle').textContent = courseId ? 'Edit course' : 'Add course';
  document.getElementById('courseSubmitBtn').textContent = courseId ? 'Update Course' : 'Save Course';
  if (!courseId) { form.reset(); form.country.value = 'United States of America'; return; }
  const course = getCourse(courseId); if (!course) return;
  form.name.value = course.name; form.city.value = course.city; form.state.value = course.state; form.country.value = course.country;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function activateTab(tabId) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
  document.querySelectorAll('.panel').forEach(el => el.classList.toggle('active', el.id === tabId));
  syncFinishRoundUi(getActiveMatch());
}

function loadTeeEditor(courseId = null, teeId = null) {
  const form = document.getElementById('teeForm');
  editingTeeRef = courseId && teeId ? { courseId, teeId } : null;
  document.getElementById('cancelTeeEditBtn').classList.toggle('hidden', !editingTeeRef);
  document.getElementById('teeFormTitle').textContent = editingTeeRef ? 'Edit tee' : 'Add tee';
  document.getElementById('teeSubmitBtn').textContent = editingTeeRef ? 'Update Tee' : 'Save Tee';
  activateTab('courses');
  if (!courseId || !teeId) {
    form.reset();
    document.getElementById('teeIsCombo').checked = false;
    const courseSelect = document.getElementById('teeCourseSelect');
    if (courseId) {
      courseSelect.value = courseId;
      form.elements.namedItem('courseId').value = courseId;
    }
    document.getElementById('copyTeeSourceSelect').innerHTML = `<option value="">Copy from saved tee</option>${getAvailableSourceTees(courseId || courseSelect.value || '', '').map(t => `<option value="${t.id}">${escapeHtml(t.teeName)}</option>`).join('')}`;
    document.getElementById('copyTeeSourceSelect').value = '';
    renderHoleRows(buildTeeHoleRows(courseId));
    renderComboSourceRows(courseId, null);
    refreshTeeModeUi({ preserveCombo: false });
    updateTeeStrokeTemplateHint(courseId || courseSelect.value || '');
    window.scrollTo({ top: document.getElementById('teeFormTitle').getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
    return;
  }
  const course = getCourse(courseId); const tee = course?.tees.find(t => t.id === teeId); if (!tee) return;
  document.getElementById('teeCourseSelect').value = courseId;
  form.elements.namedItem('teeName').value = tee.teeName;
  form.elements.namedItem('gender').value = tee.gender;
  form.elements.namedItem('length').value = tee.length || '';
  form.elements.namedItem('par').value = tee.par || '';
  form.elements.namedItem('rating').value = formatRatingValue(tee.rating);
  form.elements.namedItem('slope').value = tee.slope || '';
  document.getElementById('copyTeeSourceSelect').innerHTML = `<option value="">Copy from saved tee</option>${getAvailableSourceTees(courseId, tee.id).map(t => `<option value="${t.id}">${escapeHtml(t.teeName)}</option>`).join('')}`;
  document.getElementById('copyTeeSourceSelect').value = '';
  document.getElementById('teeIsCombo').checked = !!tee.isCombo;
  renderHoleRows(buildTeeHoleRows(courseId, tee.holes));
  renderComboSourceRows(courseId, tee.comboSources || null);
  refreshTeeModeUi({ preserveCombo: false });
  updateTeeStrokeTemplateHint(courseId);
  window.scrollTo({ top: document.getElementById('teeFormTitle').getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}

function loadMatchEditor(matchId = null, draftMatch = null) {
  const form = document.getElementById('matchForm');
  editingMatchId = matchId;
  document.getElementById('cancelMatchEditBtn').classList.toggle('hidden', !matchId);
  const topUpdateBtn = document.getElementById('topUpdateMatchBtn');
  const topCreateBtn = document.getElementById('topCreateMatchBtn');
  const topUpdateNote = document.getElementById('topUpdateMatchNote');
  if (topUpdateBtn) topUpdateBtn.classList.add('hidden');
  if (topCreateBtn) topCreateBtn.classList.remove('hidden');
  if (topUpdateNote) topUpdateNote.classList.toggle('hidden', !matchId);
  document.getElementById('matchFormTitle').textContent = matchId ? 'Edit match setup' : 'Match setup';
  document.getElementById('matchSubmitBtn').textContent = 'Finalize Match Setup';
  if (topCreateBtn) topCreateBtn.textContent = 'Finalize Match Setup';
  updateSetupActionButtonStates();
  activateTab('setup');
  if (!matchId) {
    const draft = draftMatch || createEmptyMatch();
    form.reset();
    form.elements.namedItem('date').value = draft.date || todayIso();
    form.elements.namedItem('name').value = draft.name === 'Round' ? '' : (draft.name || '');
    form.elements.namedItem('allowance').value = draft.allowance || 100;
    form.elements.namedItem('holeCount').value = String(getRequestedHoleCount(draft));
    document.getElementById('nineHoleSegmentSelect').value = draft.nineHoleSegment || 'front';
    document.getElementById('customNineHoleStartSelect').value = String(draft.customStartHole || 1);
    renderNineHoleConfigUi();
    document.getElementById('teamCountSelect').value = String(draft.teamCount || 1);
    document.getElementById('playersPerTeamSelect').value = String(draft.playersPerTeam || 1);
    document.getElementById('scoreEntryModeSelect').value = draft.scoringAccessMode || 'team_codes';
    const sharedMatchToggle = document.getElementById('sharedMatchEnabled'); if (sharedMatchToggle) sharedMatchToggle.checked = false;
    document.getElementById('officialScorerNameInput').value = draft.officialScorerName || 'Official scorer';
    const statToggle = document.getElementById('enableStatTrackingInput'); if (statToggle) statToggle.checked = false;
    state.notes = '';
    const notesBox = document.getElementById('notesBox'); if (notesBox) notesBox.value = '';
    populateMatchCourseSelects(draft.courseId || '', draft.teeId || '');
    renderTeamNameInputs(draft.teamCount || 1, draft.teamNames || []);
    renderScoringControlConfig(draft);
    uiState.matchPlayerDraft = [];
    uiState.referenceTeeManual = false;
    uiState.referenceTeeAutoId = '';
    populateMatchPlayerPicker(uiState.matchPlayerDraft);
    renderGamesPicker(draft.selectedGames || []);
    renderSetupHandicapPreview();
    return;
  }
  const match = getMatch(matchId); if (!match) return;
  form.elements.namedItem('date').value = match.date;
  form.elements.namedItem('name').value = match.name || '';
  populateMatchCourseSelects(match.courseId || '', match.teeId || '');
  form.elements.namedItem('allowance').value = match.allowance || 100;
  form.elements.namedItem('holeCount').value = String(getRequestedHoleCount(match));
  document.getElementById('nineHoleSegmentSelect').value = getNineHoleSegment(match);
  document.getElementById('customNineHoleStartSelect').value = String(Math.max(1, Math.min(10, Number(match.customStartHole) || 1)));
  renderNineHoleConfigUi();
  document.getElementById('teamCountSelect').value = String(match.teamCount || 2);
  document.getElementById('playersPerTeamSelect').value = String(match.playersPerTeam || 2);
  document.getElementById('scoreEntryModeSelect').value = normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'team_codes');
  const sharedMatchToggle = document.getElementById('sharedMatchEnabled'); if (sharedMatchToggle) sharedMatchToggle.checked = match.storageMode === 'shared';
  document.getElementById('officialScorerNameInput').value = match.officialScorerName || 'Official scorer';
  const statToggle = document.getElementById('enableStatTrackingInput'); if (statToggle) statToggle.checked = !!match.statTrackingEnabled;
  renderTeamNameInputs(match.teamCount || 2, match.teamNames || []);
  renderScoringControlConfig(match);
  uiState.matchPlayerDraft = (match.players || []).map((p, idx) => ({ ...p, slot: Number.isFinite(Number(p.slot)) ? Number(p.slot) : idx, teeId: p.teeId || match.teeId || '' }));
  uiState.referenceTeeManual = !!match.teeId;
  uiState.referenceTeeAutoId = '';
  syncReferenceTeeUi({ courseId: match.courseId, selections: uiState.matchPlayerDraft, forceAuto: !match.teeId });
  uiState.referenceTeeManual = !!(match.teeId && document.getElementById('matchTeeSelect')?.value === match.teeId);
  populateMatchPlayerPicker(uiState.matchPlayerDraft);
  renderGamesPicker(match.selectedGames || []);
  renderSetupHandicapPreview();
  window.scrollTo({ top: document.getElementById('matchFormTitle').getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `the-dye-ledger-${todayIso()}.json`; a.click();
  URL.revokeObjectURL(url);
}

function findStatPuttsInput(playerId) {
  const escapedId = window.CSS && typeof window.CSS.escape === 'function' ? window.CSS.escape(String(playerId || '')) : String(playerId || '').replace(/"/g, '\"');
  return document.querySelector(`.stat-putts-input[data-stat-player="${escapedId}"]`);
}
function updateActiveMatchPuttsSource(playerId, puttsValue, source) {
  const match = getActiveMatch();
  if (!match || !playerId) return;
  const mp = (match.players || []).find(row => row.playerId === playerId);
  if (!mp) return;
  const idx = Math.max(0, Math.min(getRequestedHoleCount(match) - 1, currentHole - 1));
  const stat = getPlayerStatEntry(mp, idx);
  stat.putts = Number.isFinite(Number(puttsValue)) ? Math.max(0, Math.round(Number(puttsValue))) : 2;
  stat.puttsSource = normalizePuttsSource(source, 'default');
}

function commitSmartPuttsDomValue(puttsInput, sourceOverride) {
  if (!puttsInput || puttsInput.disabled) return false;
  const playerId = puttsInput.dataset.statPlayer;
  const value = Number(puttsInput.value === '' ? '2' : puttsInput.value);
  const normalized = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 2;
  const source = normalizePuttsSource(sourceOverride || puttsInput.dataset.puttsSource || 'default', 'default');
  puttsInput.value = String(normalized);
  puttsInput.dataset.puttsSource = source;
  updateActiveMatchPuttsSource(playerId, normalized, source);
  return true;
}

function applySmartPuttsAdjustmentFromCheckbox(checkbox) {
  if (!checkbox || !checkbox.matches('[data-stat-player][data-stat-key]')) return false;
  const key = checkbox.dataset.statKey;
  if (key !== 'upAndDown' && key !== 'sandy') return false;
  const playerId = checkbox.dataset.statPlayer;
  const puttsInput = findStatPuttsInput(playerId);
  if (!puttsInput || puttsInput.disabled) return false;
  const source = normalizePuttsSource(puttsInput.dataset.puttsSource || 'default', 'default');
  if (source === 'user') return false;
  const escapedId = window.CSS && typeof window.CSS.escape === 'function' ? window.CSS.escape(String(playerId || '')) : String(playerId || '').replace(/"/g, '\"');
  const upAndDownChecked = !!document.querySelector(`[data-stat-player="${escapedId}"][data-stat-key="upAndDown"]`)?.checked;
  const sandyChecked = !!document.querySelector(`[data-stat-player="${escapedId}"][data-stat-key="sandy"]`)?.checked;
  if (upAndDownChecked || sandyChecked) {
    if (puttsInput.value !== '1' || source !== 'auto') {
      puttsInput.value = '1';
      puttsInput.dataset.puttsSource = 'auto';
      commitSmartPuttsDomValue(puttsInput, 'auto');
      return true;
    }
    commitSmartPuttsDomValue(puttsInput, 'auto');
    return false;
  }
  if (source === 'auto') {
    puttsInput.value = '2';
    puttsInput.dataset.puttsSource = 'default';
    commitSmartPuttsDomValue(puttsInput, 'default');
    return true;
  }
  commitSmartPuttsDomValue(puttsInput, source);
  return false;
}

function installHandlers() {
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (['courses','setup'].includes(btn.dataset.tab)) refreshCourseLibraryFromCloud({ silent: true });
  }));

  document.getElementById('playerForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const player = { id: editingPlayerId || uid(), name: String(fd.get('name') || '').trim(), index: Number(fd.get('index')) || 0 };
    if (!player.name) return toast('Player name is required.');
    if (editingPlayerId) state.players = state.players.map(p => p.id === editingPlayerId ? player : p); else state.players.push(player);
    loadPlayerEditor(null); persist(); toast(editingPlayerId ? 'Player updated.' : 'Player added.');
  });
  document.getElementById('cancelPlayerEditBtn').addEventListener('click', () => loadPlayerEditor(null));
  document.getElementById('playersList').addEventListener('click', e => {
    const editId = e.target.dataset.editPlayer; const delId = e.target.dataset.deletePlayer;
    if (editId) loadPlayerEditor(editId);
    if (delId && confirm('Delete this player?')) { state.players = state.players.filter(p => p.id !== delId); state.matches.forEach(m => m.players = m.players.filter(mp => mp.playerId !== delId)); persist(); }
  });

  document.getElementById('courseForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const base = editingCourseId ? getCourse(editingCourseId) : { tees: [], strokeIndexes: null };
    const course = { ...base, id: editingCourseId || uid(), name: String(fd.get('name') || '').trim(), city: String(fd.get('city') || '').trim(), state: String(fd.get('state') || '').trim(), country: String(fd.get('country') || '').trim() || 'United States of America' };
    if (!course.name) return toast('Course name is required.');
    if (editingCourseId) state.courses = state.courses.map(c => c.id === editingCourseId ? course : c); else state.courses.push(course);
    markCoursePendingSync(course);
    loadCourseEditor(null); persist(); scheduleCourseSync(course, { silent: true }); toast(editingCourseId ? 'Course updated.' : 'Course added.');
  });
  document.getElementById('cancelCourseEditBtn').addEventListener('click', () => loadCourseEditor(null));
  document.getElementById('coursesSearchInput').addEventListener('input', e => {
    uiState.courseSearch = e.target.value || '';
    renderCourses();
  });
  const refreshCloudCoursesBtn = document.getElementById('refreshCloudCoursesBtn');
  if (refreshCloudCoursesBtn) refreshCloudCoursesBtn.addEventListener('click', () => loadSupabaseCourses({ silent: false }));
  const refreshCloudCoursesMoreBtn = document.getElementById('refreshCloudCoursesMoreBtn');
  if (refreshCloudCoursesMoreBtn) refreshCloudCoursesMoreBtn.addEventListener('click', () => loadSupabaseCourses({ silent: false }));
  const syncLocalCoursesBtn = document.getElementById('syncLocalCoursesBtn');
  if (syncLocalCoursesBtn) syncLocalCoursesBtn.addEventListener('click', () => syncLocalCoursesToCloud());
  const syncLocalCoursesMoreBtn = document.getElementById('syncLocalCoursesMoreBtn');
  if (syncLocalCoursesMoreBtn) syncLocalCoursesMoreBtn.addEventListener('click', () => syncLocalCoursesToCloud());
  const importScorecardInput = document.getElementById('importScorecardInput');
  const importScorecardBtn = document.getElementById('importScorecardBtn');
  const analyzeScorecardImportBtn = document.getElementById('analyzeScorecardImportBtn');
  const clearScorecardImportBtn = document.getElementById('clearScorecardImportBtn');
  if (importScorecardBtn && importScorecardInput) importScorecardBtn.addEventListener('click', () => importScorecardInput.click());
  if (importScorecardInput) importScorecardInput.addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    handleScorecardImportFiles(files);
  });
  if (analyzeScorecardImportBtn) analyzeScorecardImportBtn.addEventListener('click', analyzeSelectedScorecardImportFiles);
  if (clearScorecardImportBtn) clearScorecardImportBtn.addEventListener('click', clearScorecardImportFiles);
  const scorecardImportSelection = document.getElementById('scorecardImportSelection');
  if (scorecardImportSelection) scorecardImportSelection.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-scorecard-file]');
    if (btn) removeScorecardImportFile(Number(btn.dataset.removeScorecardFile));
  });
  renderScorecardImportSelection();
  document.getElementById('teeForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const courseId = String(fd.get('courseId') || '');
    const course = getCourse(courseId);
    if (!course) return toast('Select a course first.');
    const isCombo = String(fd.get('isCombo') || '') === 'on';
    const comboSources = isCombo ? collectComboSources() : buildDefaultHoles().map(h => ({ holeNumber: h.holeNumber, sourceTeeId: '' }));
    let holes = isCombo ? buildComboHoles(courseId, comboSources) : collectHolesFromGrid();
    const courseTemplate = getCourseStrokeTemplate(course);
    const enteredTemplate = extractStrokeTemplate(holes);
    if (!enteredTemplate && courseTemplate) holes = applyStrokeTemplate(holes, courseTemplate);
    const strokeTotal = holes.reduce((sum, h) => sum + (Number(h.strokeIndex) || 0), 0);
    if (holes.some(h => !Number.isFinite(h.strokeIndex) || !h.strokeIndex)) return toast('Enter stroke indexes for all 18 holes.');
    if (strokeTotal !== 171) return toast('Stroke indexes must total 171 before saving.');
    if (isCombo && comboSources.some(row => !row.sourceTeeId)) return toast('Choose a source tee for every hole in a combo tee.');
    const tee = {
      id: editingTeeRef?.teeId || uid(),
      courseName: course.name,
      teeName: String(fd.get('teeName') || '').trim(),
      gender: String(fd.get('gender') || 'M'),
      isCombo,
      comboSources,
      length: isCombo ? (sumYardage(holes) || null) : (Number(fd.get('length')) || null),
      par: isCombo ? (sumPar(holes) || null) : (Number(fd.get('par')) || null),
      rating: Number(fd.get('rating')) || null,
      slope: Number(fd.get('slope')) || null,
      holes,
    };
    normalizeTee(tee, course.name);
    const savedTemplate = extractStrokeTemplate(tee.holes);
    if (savedTemplate) {
      course.strokeIndexes = savedTemplate;
    }
    if (!tee.teeName) return toast('Tee name is required.');
    if (editingTeeRef) course.tees = course.tees.map(t => t.id === editingTeeRef.teeId ? tee : t); else course.tees.push(tee);
    if (!getCourseStrokeTemplate(course) && savedTemplate) course.strokeIndexes = savedTemplate;
    markCoursePendingSync(course);
    loadTeeEditor(courseId, null); persist(); scheduleCourseSync(course, { silent: true }); toast(editingTeeRef ? 'Tee updated.' : 'Tee saved.');
  });
  document.getElementById('cancelTeeEditBtn').addEventListener('click', () => loadTeeEditor(null, null));
  document.getElementById('teeCourseSelect').addEventListener('change', e => {
    const existing = collectHolesFromGrid();
    const hasData = existing.some((h, idx) => h.yardage || h.par || (Number(h.strokeIndex) && Number(h.strokeIndex) !== idx + 1));
    renderHoleRows(buildTeeHoleRows(e.target.value, hasData ? existing : null));
    const existingCombo = collectComboSources();
    const fallbackCombo = editingTeeRef ? (getTee(editingTeeRef.courseId, editingTeeRef.teeId)?.comboSources || null) : null;
    renderComboSourceRows(e.target.value, existingCombo.some(row => row.sourceTeeId) ? existingCombo : fallbackCombo);
    document.getElementById('copyTeeSourceSelect').innerHTML = `<option value="">Copy from saved tee</option>${getAvailableSourceTees(e.target.value, editingTeeRef?.teeId || '').map(t => `<option value="${t.id}">${escapeHtml(t.teeName)}</option>`).join('')}`;
    refreshTeeModeUi();
    updateTeeStrokeTemplateHint(e.target.value);
  });
  document.getElementById('teeIsCombo').addEventListener('change', () => refreshTeeModeUi({ preserveCombo: true }));
  document.getElementById('copyTeeSourceSelect').addEventListener('change', e => {
    const courseId = document.getElementById('teeCourseSelect').value;
    if (courseId && e.target.value) loadTeeCopySource(courseId, e.target.value);
  });
  document.getElementById('teeForm').addEventListener('change', e => {
    if (e.target.matches('[data-combo-hole]')) {
      const selected = collectComboSources();
      renderComboSourceRows(document.getElementById('teeCourseSelect').value, selected);
      syncComboTotals();
    }
  });
  document.getElementById('loadTemplate18Btn').addEventListener('click', () => { renderHoleRows(buildTeeHoleRows(document.getElementById('teeCourseSelect').value)); toast('18-hole template loaded.'); });
  document.getElementById('recalcTotalsBtn').addEventListener('click', () => {
    if (document.getElementById('teeIsCombo')?.checked) {
      syncComboTotals();
      toast('Combo tee totals updated from selected source tees.');
      return;
    }
    fillTotalsFromHoles();
  });
  document.getElementById('coursesList').addEventListener('click', e => {
    const toggleCourseBtn = e.target.closest('[data-toggle-course]');
    if (toggleCourseBtn) {
      const courseId = toggleCourseBtn.dataset.toggleCourse;
      setCourseExpanded(courseId, !uiState.expandedCourses.has(courseId));
      renderCourses();
      return;
    }
    const editCourse = e.target.dataset.editCourse; const deleteCourse = e.target.dataset.deleteCourse; const newTee = e.target.dataset.newTee; const editTee = e.target.dataset.editTee; const copyTee = e.target.dataset.copyTee; const deleteTee = e.target.dataset.deleteTee;
    if (editCourse) loadCourseEditor(editCourse);
    if (deleteCourse && confirm('Delete this course and all tees?')) { state.courses = state.courses.filter(c => c.id !== deleteCourse); state.matches = state.matches.filter(m => m.courseId !== deleteCourse); if (state.activeMatchId && !getActiveMatch()) state.activeMatchId = null; persist(); }
    if (newTee) loadTeeEditor(newTee, null);
    if (editTee) { const [courseId, teeId] = editTee.split('|'); loadTeeEditor(courseId, teeId); }
    if (copyTee) {
      const [courseId, teeId] = copyTee.split('|');
      loadTeeEditor(courseId, null);
      document.getElementById('copyTeeSourceSelect').value = teeId;
      loadTeeCopySource(courseId, teeId);
      return;
    }
    if (deleteTee) {
      const [courseId, teeId] = deleteTee.split('|');
      const course = getCourse(courseId); if (!course) return;
      if (confirm('Delete this tee?')) { course.tees = course.tees.filter(t => t.id !== teeId); state.matches = state.matches.filter(m => m.teeId !== teeId); if (state.activeMatchId && !getActiveMatch()) state.activeMatchId = null; persist(); }
    }
  });

  document.getElementById('calcCourse').addEventListener('change', populateCalcTees);
  document.getElementById('calcForm').addEventListener('submit', e => {
    e.preventDefault();
    const player = getPlayer(document.getElementById('calcPlayer').value);
    const course = getCourse(document.getElementById('calcCourse').value);
    const tee = getTee(course?.id, document.getElementById('calcTee').value);
    const allowance = Number(document.getElementById('calcAllowance').value) || 100;
    if (!player || !course || !tee) return toast('Select player, course, and tee.');
    const ch = courseHandicap(player.index, tee.slope, tee.rating, tee.par);
    const ph = playingHandicap(ch, allowance);
    document.getElementById('calcResult').innerHTML = `<strong>${escapeHtml(player.name)}</strong> · Course Hdcp ${ch} · Playing Hdcp ${ph}`;
  });

  
  document.getElementById('newMatchBtn').addEventListener('click', handleNewMatchRequest);
  const setupFinishRoundBtn = document.getElementById('setupFinishRoundBtn');
  if (setupFinishRoundBtn) setupFinishRoundBtn.addEventListener('click', armFinishRound);
  const setupConfirmFinishRoundBtn = document.getElementById('setupConfirmFinishRoundBtn');
  if (setupConfirmFinishRoundBtn) setupConfirmFinishRoundBtn.addEventListener('click', completeActiveRound);
  document.getElementById('editActiveMatchBtn').addEventListener('click', () => {
    const active = getActiveMatch();
    if (!active) return toast('No active match to edit.');
    if (matchHasStarted(active) && !confirm('Editing may affect scoring. Continue?')) return;
    loadMatchEditor(active.id);
    renderMatchSetupState();
    activateTab('setup');
  });

  const newMatchContinueBtn = document.getElementById('newMatchContinueBtn');
  if (newMatchContinueBtn) newMatchContinueBtn.addEventListener('click', () => {
    if (newMatchDialogMode === 'unfinished') handleNewMatchStartWithoutSavingAction();
    else proceedFromNewMatchIntentDialog();
  });
  const newMatchEditCurrentBtn = document.getElementById('newMatchEditCurrentBtn');
  if (newMatchEditCurrentBtn) newMatchEditCurrentBtn.addEventListener('click', editCurrentMatchFromNewMatchDialog);
  const newMatchFinishCurrentBtn = document.getElementById('newMatchFinishCurrentBtn');
  if (newMatchFinishCurrentBtn) newMatchFinishCurrentBtn.addEventListener('click', handleNewMatchFinishAndConfirmAction);
  const newMatchCancelBtn = document.getElementById('newMatchCancelBtn');
  if (newMatchCancelBtn) newMatchCancelBtn.addEventListener('click', () => closeNewMatchConflictDialog({ disarmFinish: true }));

  document.getElementById('matchCourseSelect').addEventListener('change', e => { uiState.referenceTeeManual = false; populateMatchTees(e.target.value); const currentSelections = getCurrentMatchEditorSelections(); const defaultTeeId = getDefaultMatchTeeId(e.target.value); const normalizedSelections = currentSelections.map(row => ({ ...row, teeId: defaultTeeId })); syncMatchPlayerDraft(normalizedSelections); normalizeDraftTeeAssignments({ courseId: e.target.value, forceDefault: true }); syncReferenceTeeUi({ courseId: e.target.value, selections: uiState.matchPlayerDraft, forceAuto: true }); populateMatchPlayerPicker(uiState.matchPlayerDraft); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); });
  document.getElementById('holeCountSelect').addEventListener('change', () => { renderNineHoleConfigUi(); renderSetupHandicapPreview(); });
  document.getElementById('nineHoleSegmentSelect').addEventListener('change', () => { renderNineHoleConfigUi(); renderSetupHandicapPreview(); });
  document.getElementById('customNineHoleStartSelect').addEventListener('change', () => { renderSetupHandicapPreview(); });
  document.getElementById('teamCountSelect').addEventListener('change', () => {
    const teamCount = getCurrentSetupTeamCount();
    const teamNames = Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value);
    renderTeamNameInputs(teamCount, teamNames);
    renderScoringControlConfig();
    refreshMatchPlayerSlots({ preserveSelections: true });
  });
  document.getElementById('playersPerTeamSelect').addEventListener('change', () => {
    refreshMatchPlayerSlots({ preserveSelections: true });
  });
  document.getElementById('teamCountSelect').addEventListener('input', () => {
    refreshMatchPlayerSlots({ preserveSelections: true });
  });
  document.getElementById('playersPerTeamSelect').addEventListener('input', () => {
    refreshMatchPlayerSlots({ preserveSelections: true });
  });
  document.getElementById('scoreEntryModeSelect').addEventListener('change', () => { renderScoringControlConfig(); });
  document.getElementById('matchTeeSelect').addEventListener('change', e => { uiState.referenceTeeManual = true; uiState.referenceTeeAutoId = e.target.value || uiState.referenceTeeAutoId; const draft = normalizeDraftTeeAssignments({ forceDefault: false }).map(row => ({ ...row, teeId: row.teeId || e.target.value || '' })); syncMatchPlayerDraft(draft); normalizeDraftTeeAssignments({ forceDefault: false }); syncReferenceTeeUi({ selections: uiState.matchPlayerDraft, forceAuto: false }); populateMatchPlayerPicker(uiState.matchPlayerDraft); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); });
  document.getElementById('teamNamesGrid').addEventListener('input', () => { const currentSelections = getCurrentMatchEditorSelections(); renderScoringControlConfig(); populateMatchPlayerPicker(currentSelections); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); });
  const matchPlayersPickerEl = document.getElementById('matchPlayersPicker');
  const handlePlayerPickerOpen = e => {
    const trigger = e.target.closest('[data-open-player-sheet]');
    if (trigger) {
      e.preventDefault();
      openPlayerSearchSheet(Number(trigger.dataset.openPlayerSheet));
      return;
    }
  };
  matchPlayersPickerEl.addEventListener('click', handlePlayerPickerOpen);
  matchPlayersPickerEl.addEventListener('keydown', e => {
    const trigger = e.target.closest('[data-open-player-sheet]');
    if (trigger && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openPlayerSearchSheet(Number(trigger.dataset.openPlayerSheet));
    }
  });
  const handleMatchPlayersPickerSelectionChange = e => {
    if (e.target.matches('[data-player-select-slot]')) {
      assignPlayerToSlot(Number(e.target.dataset.playerSelectSlot), e.target.value || '');
      return;
    }
    if (e.target.matches('[data-player-tee-slot]')) {
      updateMatchPlayerTee(Number(e.target.dataset.playerTeeSlot), e.target.value || '');
    }
  };
  document.getElementById('matchPlayersPicker').addEventListener('change', handleMatchPlayersPickerSelectionChange);
  document.getElementById('matchPlayersPicker').addEventListener('input', handleMatchPlayersPickerSelectionChange);
  document.getElementById('playerSearchInput').addEventListener('input', e => {
    const sheet = document.getElementById('playerSearchSheet');
    const slot = Number(sheet?.dataset.slot || -1);
    if (slot < 0) return;
    renderPlayerSearchResults(slot, e.target.value || '');
  });
  document.getElementById('playerSearchResults').addEventListener('click', e => {
    const selectBtn = e.target.closest('[data-select-player-slot]');
    if (selectBtn) {
      assignPlayerToSlot(Number(selectBtn.dataset.selectPlayerSlot), selectBtn.dataset.playerId || '');
      return;
    }
    const clearBtn = e.target.closest('[data-clear-player-slot]');
    if (clearBtn) {
      assignPlayerToSlot(Number(clearBtn.dataset.clearPlayerSlot), '');
    }
  });
  document.getElementById('closePlayerSearchSheet').addEventListener('click', closePlayerSearchSheet);
  document.getElementById('playerSearchSheet').addEventListener('click', e => {
    if (e.target.id === 'playerSearchSheet') closePlayerSearchSheet();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('playerSearchSheet')?.classList.contains('hidden')) closePlayerSearchSheet();
  });
  document.getElementById('gamesPicker').addEventListener('change', e => {
    if (!e.target.matches('[data-game-key]')) return;
    const existing = collectSelectedGames();
    const checked = Array.from(document.querySelectorAll('[data-game-key]:checked'));
    if (checked.length > 5) {
      e.target.checked = false;
      toast('Select up to 5 gambling games.');
      return;
    }
    const selectedKeys = checked.map(el => el.dataset.gameKey);
    const configs = selectedKeys.map(key => getGameConfig(key, existing));
    renderGamesPicker(configs);
  });
  
  if (window.visualViewport) {
    const syncViewport = () => {
      const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
      document.documentElement.style.setProperty('--keyboard-offset', `${Math.max(0, offset)}px`);
      document.body.classList.toggle('keyboard-open', offset > 120);
    };
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
    syncViewport();
  }
  document.addEventListener('focusin', e => {
    if (e.target.closest('#score') && e.target.matches('input, select, textarea')) {
      setTimeout(() => {
        try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      }, 180);
    }
  });
  document.addEventListener('focusout', () => {
    if (window.visualViewport) {
      setTimeout(() => {
        const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
        document.documentElement.style.setProperty('--keyboard-offset', `${Math.max(0, offset)}px`);
        document.body.classList.toggle('keyboard-open', offset > 120);
      }, 120);
    }
  });

document.getElementById('scoreboardPrintViewSelect').addEventListener('change', e => {
  const requestedView = e.target.value === 'scorecard' ? 'scorecard' : 'summary';
  const match = getActiveMatch();
  if (match) {
    match.printView = requestedView;
    persist({ skipRender: true });
  }
  syncScoreboardPrintControls(requestedView);
  applyScoreboardPrintView(requestedView);
});

window.addEventListener('resize', scheduleTeamPayoutSplitPaneSync);
window.addEventListener('orientationchange', () => {
  window.setTimeout(scheduleTeamPayoutSplitPaneSync, 80);
  window.setTimeout(scheduleTeamPayoutSplitPaneSync, 220);
});
if (document.fonts && typeof document.fonts.addEventListener === 'function') {
  document.fonts.addEventListener('loadingdone', scheduleTeamPayoutSplitPaneSync);
}

document.getElementById('leaderboard').addEventListener('change', e => {
    const match = getActiveMatch();
    if (!match) return;
    if (e.target.id === 'momentumGameSelect') {
      match.momentumGame = e.target.value;
      persist({ skipRender: true });
      renderLeaderboard();
      return;
    }
    if (e.target.id === 'matchStatusGameSelect') {
      match.matchStatusGame = e.target.value;
      match.momentumGame = e.target.value;
      persist({ skipRender: true });
      renderLeaderboard();
      return;
    }
    if (e.target.id === 'momentumPerspectiveSelect') {
      match.momentumPerspective = Number(e.target.value) || 1;
      persist({ skipRender: true });
      renderLeaderboard();
      return;
    }
  });
  document.getElementById('leaderboard').addEventListener('click', e => {
    const match = getActiveMatch();
    if (!match) return;
    const windowBtn = e.target.closest('[data-team-payout-window]');
    if (windowBtn) {
      uiState.teamPayoutMobileWindowByMatch[match.id] = Number(windowBtn.getAttribute('data-team-payout-window')) || 0;
      uiState.teamPayoutMobileOpenHeaderKey = '';
      renderLeaderboard();
      return;
    }
    const headerBtn = e.target.closest('[data-team-payout-header-key]');
    if (headerBtn) {
      const nextKey = headerBtn.getAttribute('data-team-payout-header-key') || '';
      uiState.teamPayoutMobileOpenHeaderKey = uiState.teamPayoutMobileOpenHeaderKey === nextKey ? '' : nextKey;
      renderLeaderboard();
      return;
    }
  });
  document.getElementById('score').addEventListener('change', e => {
    if (e.target.matches('[data-greenies-winner]')) {
      document.querySelectorAll('[data-greenies-winner]').forEach(el => { if (el !== e.target) el.checked = false; });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
    if (e.target.matches('[data-stat-player][data-stat-key]')) {
      applySmartPuttsAdjustmentFromCheckbox(e.target);
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
  });
  document.getElementById('score').addEventListener('change', e => {
    const match = getActiveMatch();
    if (!match) return;
    if (e.target.id === 'scoreAccessRoleSelect') {
      const nextRole = e.target.value;
      match.activeScoreRole = nextRole;
      if (nextRole !== 'team_scorer') match.activeScoreTeam = 1;
      persist({ skipRender: true });
      renderCurrentMatch();
      return;
    }
    if (e.target.id === 'scoreAccessTeamSelect') {
      match.activeScoreTeam = Math.max(1, Number(e.target.value) || 1);
      persist({ skipRender: true });
      renderCurrentMatch();
      return;
    }
  });
  document.getElementById('setup').addEventListener('change', e => {
    if (e.target.matches('[data-player-slot], [data-player-tee-slot], [data-team-name], #teamCountSelect, #playersPerTeamSelect, #matchCourseSelect, #matchTeeSelect, #holeCountSelect, #nineHoleSegmentSelect, #customNineHoleStartSelect, [name="allowance"], #scoreEntryModeSelect, #officialScorerNameInput, [data-team-scorer-label], [data-team-scorer-code], [data-side-field], [data-nine-point-player], [data-game-config]')) {
      setTimeout(() => { renderSetupHandicapPreview(); renderGamesPicker(collectSelectedGames()); }, 0);
    }
  });
  document.getElementById('setup').addEventListener('input', e => {
    if (e.target.matches('[data-team-name], [name="allowance"], #scoreEntryModeSelect, #officialScorerNameInput, [data-team-scorer-label], [data-team-scorer-code], [data-game-config], [data-nine-point-player], #holeCountSelect, #nineHoleSegmentSelect, #customNineHoleStartSelect')) {
      renderSetupHandicapPreview();
    }
  });
  document.getElementById('setup').addEventListener('click', e => {
    if (e.target.id === 'greeniesSelectAllBtn') {
      document.querySelectorAll('[data-greenie-player]').forEach(el => { el.checked = true; });
      return;
    }
    if (e.target.id === 'greeniesClearAllBtn') {
      document.querySelectorAll('[data-greenie-player]').forEach(el => { el.checked = false; });
      return;
    }
    if (e.target.id === 'ninePointSelectAllBtn') {
      const ids = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => el.value).filter(Boolean).slice(0, 3);
      document.querySelectorAll('[data-nine-point-player]').forEach((el, idx) => { el.value = ids[idx] || ''; });
      renderSetupHandicapPreview();
      renderGamesPicker(collectSelectedGames());
      return;
    }
    if (e.target.id === 'ninePointClearBtn') {
      document.querySelectorAll('[data-nine-point-player]').forEach(el => { el.value = ''; });
      renderSetupHandicapPreview();
      renderGamesPicker(collectSelectedGames());
      return;
    }
    if (e.target.id === 'addSideMatchBtn') {
      const games = collectSelectedGames();
      const cfg = games.find(g => g.key === 'individual_match') || { key: 'individual_match', matchups: [] };
      cfg.matchups = Array.isArray(cfg.matchups) ? cfg.matchups : [];
      cfg.matchups.push({ id: uid(), playerAId: '', playerBId: '', game: 'nassau', basis: 'net', stake: 5 });
      const others = games.filter(g => g.key !== 'individual_match');
      renderGamesPicker(normalizeSelectedGamesOrder([...others, cfg]));
      return;
    }
    const removeId = e.target.closest('[data-remove-side-match]')?.dataset.removeSideMatch;
    if (removeId) {
      const games = collectSelectedGames();
      const cfg = games.find(g => g.key === 'individual_match');
      if (!cfg) return;
      cfg.matchups = (cfg.matchups || []).filter(row => row.id !== removeId);
      if (!cfg.matchups.length) cfg.matchups = [{ id: uid(), playerAId: '', playerBId: '', game: 'nassau', basis: 'net', stake: 5 }];
      const others = games.filter(g => g.key !== 'individual_match');
      renderGamesPicker(normalizeSelectedGamesOrder([...others, cfg]));
    }
  });
  document.getElementById('score').addEventListener('click', e => {
    const jumpHole = e.target.closest('[data-jump-hole]')?.dataset.jumpHole;
    if (jumpHole) {
      saveCurrentHole({ targetHole: Number(jumpHole), silent: true });
    }
  });
  document.getElementById('score').addEventListener('change', e => {
    if (e.target && e.target.id === 'currentHoleSelect') {
      saveCurrentHole({ targetHole: Number(e.target.value), silent: true });
      return;
    }
    if (e.target && e.target.matches('[data-stat-player][data-stat-key]')) {
      if (e.target.matches('input[type="checkbox"]')) {
        applySmartPuttsAdjustmentFromCheckbox(e.target);
      } else if (e.target.matches('.stat-putts-input')) {
        e.target.dataset.puttsSource = 'user';
        commitSmartPuttsDomValue(e.target, 'user');
      }
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
  });
  document.getElementById('score').addEventListener('focusin', e => {
    if (e.target.matches('[data-score-player]')) {
      if (e.target.dataset.scoreWired !== 'direct') handleLiveScoreInputFocus(e.target);
    }
    if (e.target.matches('.stat-putts-input') && !e.target.disabled && typeof e.target.select === 'function') {
      requestAnimationFrame(() => {
        try { e.target.select(); } catch (err) {}
      });
    }
  });
  document.getElementById('score').addEventListener('keydown', e => {
    if (!e.target.matches('[data-score-player]')) return;
    if (e.target.dataset.scoreWired === 'direct') return;
    handleLiveScoreInputKeydown(e);
  });
  document.getElementById('score').addEventListener('blur', e => {
    if (e.target.matches('[data-score-player]')) {
      if (e.target.dataset.scoreWired !== 'direct') handleLiveScoreInputBlur(e.target);
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
    if (e.target.matches('.stat-putts-input')) {
      commitSmartPuttsDomValue(e.target, e.target.dataset.puttsSource || 'user');
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    } else if (e.target.matches('[data-stat-player][data-stat-key]')) {
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
  }, true);
  document.getElementById('score').addEventListener('input', e => {
    if (e.target.matches('[data-score-player]')) {
      if (e.target.dataset.scoreWired !== 'direct') handleLiveScoreInputEvent(e.target);
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
    if (e.target.matches('.stat-putts-input')) {
      e.target.dataset.puttsSource = 'user';
      commitSmartPuttsDomValue(e.target, 'user');
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
  });
  document.getElementById('matchForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
    const fd = new FormData(e.target);
    const teamCount = Number(fd.get('teamCount')) || 1;
    const playersPerTeam = Number(fd.get('playersPerTeam')) || 1;
    if ((teamCount * playersPerTeam) > 32) return toast('Limit is 32 total players.');
    const teamNames = Array.from({ length: teamCount }, (_, i) => String(document.querySelector(`[data-team-name="${i + 1}"]`)?.value || '').trim().slice(0, 25));
    const selectedPlayers = getSelectedPlayersFromSetup();
    const uniqueIds = new Set(selectedPlayers.map(p => p.playerId));
    if (selectedPlayers.length !== uniqueIds.size) return toast('Each player can only be selected once.');
    if (selectedPlayers.length < 1) return toast('Select at least 1 player.');
    if (selectedPlayers.some(p => !p.teeId)) { markMissingTeeRows(); return toast('Select a tee for each player.'); }
    const selectedGames = collectSelectedGames();
    if (selectedGames.length > 5) return toast('Select up to 5 gambling games.');
    if (selectedGames.some(g => g.key === 'nassau') && teamCount !== 2) return toast('Nassau requires exactly 2 teams.');
    if (selectedGames.some(g => ['team_match','team_stroke'].includes(g.key)) && teamCount < 2) return toast('Team games require at least 2 teams.');
    if (selectedGames.some(g => g.key === 'nine_point') && selectedPlayers.length < 3) return toast('9-Point Game requires at least 3 assigned players.');
    if (selectedGames.some(g => g.key === 'nine_point' && (!Array.isArray(g.playerIds) || [...new Set(g.playerIds)].length !== 3))) return toast('Select 3 players for the 9-Point Game.');
    const existing = editingMatchId ? getMatch(editingMatchId) : null;
    const scoringAccessMode = normalizeScoringAccessMode(fd.get('scoreEntryMode') || 'team_codes');
    const scoreEntryMode = getLegacyScoreEntryMode(scoringAccessMode);
    const officialScorerName = String(fd.get('officialScorerName') || '').trim() || 'Official scorer';
    const sharedMatchEnabled = fd.get('sharedMatchEnabled') === 'on' && hasSupabaseConfig();
    const teamScorers = collectTeamScorerAssignments(teamCount, teamNames, existing?.teamScorers || []);
    const match = {
      id: editingMatchId || uid(),
      date: String(fd.get('date') || todayIso()),
      name: String(fd.get('name') || '').trim() || 'Round',
      courseId: String(fd.get('courseId') || ''),
      teeId: String(fd.get('teeId') || syncReferenceTeeUi({ selections: selectedPlayers, forceAuto: !uiState.referenceTeeManual }) || selectedPlayers[0]?.teeId || ''),
      format: 'teams',
      allowance: Number(fd.get('allowance')) || 100,
      holeCount: Number(fd.get('holeCount')) === 9 ? 9 : 18,
      nineHoleSegment: Number(fd.get('holeCount')) === 9 ? String(fd.get('nineHoleSegment') || 'front') : 'front',
      customStartHole: Number(fd.get('holeCount')) === 9 ? Math.max(1, Math.min(10, Number(fd.get('customStartHole')) || 1)) : 1,
      teamCount,
      playersPerTeam,
      teamNames,
      scoringAccessMode,
      scoreEntryMode,
      officialScorerName,
      statTrackingEnabled: fd.get('enableStatTracking') === 'on',
      teamScorers,
      selectedGames: normalizeSelectedGamesOrder(selectedGames),
      status: existing?.status || 'active',
      completedAt: existing?.completedAt || null,
      previousCompletedAt: existing?.previousCompletedAt || null,
      reopenedAt: existing?.reopenedAt || null,
      players: selectedPlayers.map(sp => {
        const old = existing?.players.find(op => op.playerId === sp.playerId);
        return old ? { ...old, team: sp.team, slot: sp.slot, teeId: sp.teeId || selectedPlayers[0]?.teeId || '', stats: Array.isArray(old.stats) && old.stats.length ? old.stats : buildEmptyStats(Number(fd.get('holeCount')) === 9 ? 9 : 18) } : { playerId: sp.playerId, team: sp.team, slot: sp.slot, teeId: sp.teeId || selectedPlayers[0]?.teeId || '', scores: buildEmptyScores(Number(fd.get('holeCount')) === 9 ? 9 : 18), stats: buildEmptyStats(Number(fd.get('holeCount')) === 9 ? 9 : 18) };
      }),
      greeniesWinners: existing?.greeniesWinners || {},
      matchStatusGame: existing?.matchStatusGame || getDefaultFeaturedGameKey(selectedGames),
      momentumGame: existing?.momentumGame || existing?.matchStatusGame || getDefaultFeaturedGameKey(selectedGames),
      momentumPerspective: Number(existing?.momentumPerspective || 1) === 2 ? 2 : 1,
      activeScoreRole: existing?.activeScoreRole || (scoringAccessMode === 'team_codes' ? 'team_scorer' : 'official_scorer'),
      activeScoreTeam: Math.min(teamCount, Math.max(1, Number(existing?.activeScoreTeam) || 1)),
      storageMode: sharedMatchEnabled ? 'shared' : (existing?.storageMode === 'shared' ? 'shared' : 'local'),
      sharedMatchId: existing?.sharedMatchId || null,
      sharedMatchRef: existing?.sharedMatchRef || existing?.sharedMatchId || null,
      sharedOwnerUserId: existing?.sharedOwnerUserId || null,
      cloudSyncState: existing?.cloudSyncState || (sharedMatchEnabled ? 'pending' : 'local-only'),
      lastCloudSyncAt: existing?.lastCloudSyncAt || null,
      notes: existing?.notes || state.notes || '',
    };
    normalizeMatch(match);
    if (!match.courseId) return toast('Select a course.');
    if (!match.players.every(p => p.teeId)) { markMissingTeeRows(); return toast('Each player needs a tee.'); }
    clearMatchTeeErrors();
    if (sharedMatchEnabled) {
      match.sharedMatchId = existing?.sharedMatchId || match.id;
      match.sharedMatchRef = match.sharedMatchId;
      try {
        await uploadSharedMatch(match);
      } catch (cloudErr) {
        console.error(cloudErr);
        match.storageMode = 'shared';
        match.cloudSyncState = 'local-cache';
        toast('Shared match foundation saved locally, but Supabase sync failed.');
      }
    }
    if (editingMatchId) state.matches = state.matches.map(m => m.id === editingMatchId ? match : m); else state.matches.push(match);
    state.activeMatchId = match.id;
    if (match.storageMode === 'shared') setLastOpenedSharedMatch(match);
    currentHole = Math.min(getRequestedHoleCount(match), Math.max(1, completedHoles(match) || 1));
    persist({ skipRender: true });
    loadMatchEditor(null);
    renderAll();
    activateTab('score');
    toast(editingMatchId ? 'Match setup saved.' : (sharedMatchEnabled ? 'Shared match setup saved.' : 'Match setup saved.'));
    } catch (err) { console.error(err); toast('Could not finalize match setup. Please try again.'); }
  });
  document.getElementById('cancelMatchEditBtn').addEventListener('click', () => { loadMatchEditor(null); renderMatchSetupState(); });
  function saveCurrentHole({ advance = false, targetHole = null, silent = false } = {}) {
    const match = getActiveMatch(); if (!match) return false;
    if (getScoreAccessState(match).role === 'viewer') { if (!silent) toast('Viewer mode is read-only.'); return false; }
    const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
    const holeMeta = scoringHoles[currentHole - 1] || null;
    const actualHoleNumber = holeMeta?.holeNumber || currentHole;
    const wasCompleteBeforeSave = match.status === 'complete';
    const mutated = applyCurrentHoleDomToMatch(match);
    if (wasCompleteBeforeSave && mutated) markRoundReopenedForEditing(match);
    const savedHole = actualHoleNumber;
    const maxHole = getPlayableHoleCount(match, getTee(match.courseId, match.teeId));
    if (Number.isFinite(targetHole) && targetHole >= 1 && targetHole <= maxHole) {
      currentHole = targetHole;
    } else if (advance) {
      currentHole = Math.min(maxHole, currentHole + 1);
    } else {
      currentHole = Math.min(maxHole, Math.max(currentHole, completedHoles(match) + 1));
    }
    persist();
    scheduleSharedMatchSync(match, { immediate: true, silent: true });
    if (!silent) toast(`Hole ${savedHole} saved.`);
    return true;
  }

  document.getElementById('matchesList').addEventListener('click', e => {
    const loadId = e.target.dataset.loadMatch;
    const shareId = e.target.dataset.shareMatch;
    const deleteId = e.target.dataset.deleteMatch;
    if (loadId) {
      const target = getMatch(loadId);
      state.activeMatchId = loadId;
      if (target?.storageMode === 'shared') setLastOpenedSharedMatch(target);
      currentHole = Math.min(getRequestedHoleCount(target), Math.max(1, completedHoles(target) || 1));
      persist();
      if (target && target.status === 'complete') {
        const reopen = window.confirm(
          `"${target.name || 'Round'}" is marked complete. Reopen it for editing?

` +
          `OK = reopen and edit (Finish Round will overwrite the saved round when you confirm).
` +
          `Cancel = just view the leaderboard / scorecard.`
        );
        if (reopen) {
          markRoundReopenedForEditing(target);
          persist({ skipRender: true });
          activateTab('score');
        } else {
          activateTab('leaderboard');
        }
        renderAll();
        return;
      }
      activateTab('score');
    }
    if (shareId) { openPrintScorecard(shareId); }
    if (deleteId && confirm('Delete this match?')) {
      state.matches = state.matches.filter(m => m.id !== deleteId);
      if (state.activeMatchId === deleteId) state.activeMatchId = null;
      persist();
    }
  });
  document.getElementById('prevHoleBtn').addEventListener('click', () => { saveCurrentHole({ targetHole: Math.max(1, currentHole - 1), silent: true }); });
  document.getElementById('nextHoleBtn').addEventListener('click', () => { saveCurrentHole({ advance: true, silent: true }); });
  document.getElementById('scoreboardShareRoundBtn').addEventListener('click', () => { openPrintScorecard(); });
  document.getElementById('saveScoresBtn').addEventListener('click', () => { saveCurrentHole(); });
  document.getElementById('finishRoundBtn').addEventListener('click', armFinishRound);
  document.getElementById('confirmFinishRoundBtn').addEventListener('click', completeActiveRound);
  const scoreboardFinishRoundBtn = document.getElementById('scoreboardFinishRoundBtn');
  if (scoreboardFinishRoundBtn) scoreboardFinishRoundBtn.addEventListener('click', armFinishRound);
  const scoreboardConfirmFinishRoundBtn = document.getElementById('scoreboardConfirmFinishRoundBtn');
  if (scoreboardConfirmFinishRoundBtn) scoreboardConfirmFinishRoundBtn.addEventListener('click', completeActiveRound);
  document.getElementById('leaderboard')?.addEventListener('click', e => {
    const cell = e.target.closest('[data-scorecard-edit]');
    if (!cell) return;
    const match = getActiveMatch();
    if (!match) return;
    const holeNo = Number(cell.dataset.editHole);
    const playerId = cell.dataset.editPlayer;
    if (!Number.isFinite(holeNo) || holeNo < 1 || !playerId) return;
    currentHole = Math.max(1, Math.min(getRequestedHoleCount(match) || 18, holeNo));
    queueScoreCommitFocus(playerId, currentHole);
    activateTab('score');
    renderCurrentMatch();
  });

  const notesBox = document.getElementById('notesBox');
  if (notesBox) notesBox.addEventListener('input', e => {
    state.notes = e.target.value || '';
    const active = getActiveMatch();
    if (active && active.storageMode === 'shared') active.notes = state.notes;
    persist({ skipRender: true });
    scheduleSharedMatchSync(active, { immediate: false, silent: true });
  });

  document.getElementById('exportBtn').addEventListener('click', exportJson);
  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state.players = Array.isArray(imported.players) ? imported.players : state.players;
      state.courses = Array.isArray(imported.courses) ? imported.courses : state.courses;
      state.matches = Array.isArray(imported.matches) ? imported.matches : state.matches;
      state.activeMatchId = imported.activeMatchId || state.activeMatchId;
      normalizeState(); persist(); toast('Backup imported.');
    } catch {
      toast('Could not import that JSON file.');
    }
    e.target.value = '';
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredPrompt = event; document.getElementById('installBtn').classList.remove('hidden');
  });
  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; document.getElementById('installBtn').classList.add('hidden');
  });

  const updateNowBtn = document.getElementById('updateNowBtn');
  if (updateNowBtn) updateNowBtn.addEventListener('click', () => { triggerAppUpdate(); });

  const updateLaterBtn = document.getElementById('updateLaterBtn');
  if (updateLaterBtn) updateLaterBtn.addEventListener('click', () => { hideUpdateBanner(); });
}


let swRegistration = null;
let appUpdateBannerVisible = false;
let hasReloadedForServiceWorker = false;

function updateVersionUi() {
  const loadSharedMatchBtn = document.getElementById('loadSharedMatchBtn');
  if (loadSharedMatchBtn) loadSharedMatchBtn.addEventListener('click', async () => {
    const input = document.getElementById('sharedMatchIdInput');
    const matchId = String(input?.value || '').trim();
    if (!matchId) return toast('Enter a shared match ID.');
    try {
      await loadSharedMatchFromCloud(matchId, { activate: true, silent: false });
      activateTab('score');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not load shared match.');
    }
  });
  const refreshSharedMatchBtn = document.getElementById('refreshSharedMatchBtn');
  if (refreshSharedMatchBtn) refreshSharedMatchBtn.addEventListener('click', async () => {
    const active = getActiveMatch();
    if (!active?.sharedMatchId) return toast('No shared match is currently loaded.');
    try {
      await loadSharedMatchFromCloud(active.sharedMatchId, { activate: true, silent: false });
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not refresh shared match.');
    }
  });
  updateCloudConfigUi();

  const versionEl = document.getElementById('appVersionLabel');
  if (versionEl) versionEl.textContent = APP_VERSION;
  const footerVersionEl = document.getElementById('appVersionFooter');
  if (footerVersionEl) footerVersionEl.textContent = APP_VERSION;
}

async function resumeActiveSharedMatchOnStartup() {
  if (!hasSupabaseConfig()) return;
  const active = getActiveMatch();
  if (active?.storageMode === 'shared') {
    setLastOpenedSharedMatch(active);
    persist({ skipRender: true });
    return;
  }
  const sharedId = String(state.lastOpenedSharedMatchId || '').trim();
  if (!sharedId) return;
  try {
    await loadSharedMatchFromCloud(sharedId, { activate: true, silent: true });
  } catch (err) {
    const local = state.matches.find(m => (m.sharedMatchId === sharedId || m.sharedMatchRef === sharedId) && m.storageMode === 'shared');
    if (local) {
      state.activeMatchId = local.id;
      currentHole = Math.min(getRequestedHoleCount(local), Math.max(1, completedHoles(local) || 1));
      persist({ skipRender: true });
      renderAll();
    }
  }
}

function showUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner || appUpdateBannerVisible) return;
  banner.classList.remove('hidden');
  appUpdateBannerVisible = true;
}

function hideUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.add('hidden');
  appUpdateBannerVisible = false;
}

function triggerAppUpdate() {
  if (!swRegistration?.waiting) return;
  swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

function hookServiceWorkerRegistration(registration) {
  if (!registration) return;
  swRegistration = registration;
  if (registration.waiting) showUpdateBanner();

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }
    });
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      hookServiceWorkerRegistration(registration);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hasReloadedForServiceWorker) return;
        hasReloadedForServiceWorker = true;
        window.location.reload();
      });
    } catch (error) {
      // Keep the app fully usable if service worker registration fails.
    }
  });
}

registerServiceWorker();

installHandlers();
renderHoleRows();
loadPlayerEditor(null);
loadCourseEditor(null);
loadTeeEditor(null, null);
loadMatchEditor(null);
updateVersionUi();
renderAll();
if (hasSupabaseConfig()) {
  window.setTimeout(() => refreshCourseLibraryFromCloud({ silent: true, force: true }), 250);
}
resumeActiveSharedMatchOnStartup();
