const STORAGE_KEY = 'the-dye-ledger-v20';
const APP_VERSION = 'v20.3';
const GAME_LIBRARY = [
  { key: 'nassau', label: 'Nassau' },
  { key: 'individual_match', label: 'Head-to-Head Side Match' },
  { key: 'team_match', label: 'Team Match Play' },
  { key: 'team_stroke', label: 'Team Stroke Play' },
  { key: 'skins', label: 'Skins' },
  { key: 'greenies', label: 'Greenies' },
];

const GAME_LABELS = Object.fromEntries(GAME_LIBRARY.map(g => [g.key, g.label]));
function getGameLabel(key) {
  return GAME_LABELS[key] || key;
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
function loadState() {
  const fallback = { players: [], courses: [], matches: [], activeMatchId: null };
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
function getRequestedHoleCount(match) {
  return Number(match?.holeCount) === 9 ? 9 : 18;
}
function getPlayableHoleCount(match, tee = null) {
  const requested = getRequestedHoleCount(match);
  const holes = Array.isArray(tee?.holes) ? tee.holes.length : 18;
  return Math.max(1, Math.min(requested, holes || requested));
}
function formatHoleCountLabel(count) {
  const holes = Number(count) === 9 ? 9 : 18;
  return `${holes} hole${holes === 1 ? '' : 's'}`;
}
function sumYardage(holes) { return holes.reduce((sum, h) => sum + (Number(h.yardage) || 0), 0) || null; }
function getTeeTotalYardage(tee) { return Number(tee?.length) || sumYardage(Array.isArray(tee?.holes) ? tee.holes : []) || 0; }
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
function formatTeeSummary(t) {
  return `${escapeHtml(t.teeName)} · ${formatRatingValue(t.rating)}/${Number(t.slope) || 0}${getTeeTotalYardage(t) ? ` · ${formatYardageValue(getTeeTotalYardage(t))} yds` : ''}`;
}
function formatMoneyAccounting(amount) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value).toFixed(2);
  if (Math.abs(value) < 0.0001) return "$0.00";
  return value < 0 ? `($${abs})` : `$${abs}`;
}
function getFeaturedGameLabel(match, gameKey) {
  const cfg = (match.selectedGames || []).find(g => g.key === gameKey) || {};
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
  holes.forEach(h => {
    if (!h?.completed) return;
    const t1 = getTeamHoleScore(h, 1, basis, 'best_ball');
    const t2 = getTeamHoleScore(h, 2, basis, 'best_ball');
    const outcome = getHeadToHeadOutcome(t1, t2);
    const step = outcome === 'team1' ? 1 : outcome === 'team2' ? -1 : 0;
    overall += step;
    if ((Number(h.holeNumber) || 0) <= 9) front += step;
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
function formatGolfScoreMarkup(score, par, tone = 'gross') {
  if (!Number.isFinite(score)) return '<span class="score-number score-empty">—</span>';
  const cls = golfScoreClass(score, par);
  return `<span class="score-number ${cls} ${tone === 'net' ? 'score-net' : 'score-gross'}">${escapeHtml(String(score))}</span>`;
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
  lines.push(match.status === 'complete' ? `Completed ${new Date(match.completedAt || Date.now()).toLocaleString()}` : `${metrics.completed}/${holeCount} holes complete`);
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
function buildPrintMeta(match, metrics, printView = "summary") {
  const holeCount = getPlayableHoleCount(match, metrics?.tee);
  const courseName = metrics?.course?.name || 'No course';
  const teeName = metrics?.tee?.teeName || 'No tee';
  return `
    <div class="print-round-title">${escapeHtml(match?.name || 'Round')}</div>
    <div class="print-round-sub">${escapeHtml(match?.date || todayIso())} · ${escapeHtml(courseName)} · ${escapeHtml(teeName)} · ${holeCount} holes</div>
    <div class="print-round-sub">${metrics ? `${metrics.completed}/${holeCount} holes completed` : 'Scorecard ready to print'}${match?.status === 'complete' ? ' · Final' : ' · Live'} · ${printView === 'scorecard' ? 'Classic scorecard only' : 'Full match summary'}<\/div>`;
}
function openPrintScorecard(matchId, printView = null) {
  const match = getMatch(matchId || state.activeMatchId);
  if (!match) return toast('No round selected to print.');
  const previousTab = document.querySelector('.tab.active')?.dataset.tab || 'score';
  const previouslyActiveMatch = state.activeMatchId;
  const detailsNodes = Array.from(document.querySelectorAll('#leaderboard details'));
  const priorOpen = detailsNodes.map(node => node.open);
  const requestedView = (printView || document.getElementById('printViewSelect')?.value || 'summary') === 'scorecard' ? 'scorecard' : 'summary';
  if (state.activeMatchId !== match.id) state.activeMatchId = match.id;
  const metrics = computeMatchMetrics(match);
  const printMeta = document.getElementById('printRoundMeta');
  if (printMeta) {
    printMeta.innerHTML = buildPrintMeta(match, metrics, requestedView);
    printMeta.classList.remove('hidden');
  }
  activateTab('leaderboard');
  detailsNodes.forEach(node => { node.open = requestedView === 'summary'; });
  document.body.classList.add('printing-scorecard');
  document.body.classList.toggle('printing-summary', requestedView === 'summary');
  document.body.classList.toggle('printing-classic-only', requestedView === 'scorecard');
  renderAll();
  const cleanup = () => {
    document.body.classList.remove('printing-scorecard', 'printing-summary', 'printing-classic-only');
    if (printMeta) printMeta.classList.add('hidden');
    detailsNodes.forEach((node, idx) => { node.open = priorOpen[idx]; });
    state.activeMatchId = previouslyActiveMatch;
    renderAll();
    activateTab(previousTab);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    try { window.print(); } catch (err) { cleanup(); toast('Print dialog could not open.'); }
  }, 120);
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
function normalizeMatch(match) {
  match.id = match.id || uid();
  match.date = match.date || todayIso();
  match.name = match.name || 'Round';
  match.courseId = match.courseId || '';
  match.teeId = match.teeId || '';
  match.format = match.format || 'teams';
  match.allowance = Number(match.allowance) || 100;
  match.holeCount = getRequestedHoleCount(match);
  match.status = match.status || 'active';
  match.completedAt = match.completedAt || null;
  match.players = Array.isArray(match.players) ? match.players : [];
  match.players = match.players.map(mp => ({
    playerId: mp.playerId,
    team: Number(mp.team) || 1,
    scores: Array.isArray(mp.scores) && mp.scores.length ? mp.scores.map((s, idx) => ({ holeNumber: idx + 1, gross: Number(s.gross) || null })) : buildEmptyScores(match.holeCount),
  }));
  match.greeniesWinners = match.greeniesWinners && typeof match.greeniesWinners === 'object' ? match.greeniesWinners : {};
  match.momentumGame = match.momentumGame || ((match.selectedGames || []).find(g => g.key === 'nassau')?.key || (match.selectedGames || []).find(g => ['team_match','team_stroke','skins'].includes(g.key))?.key || 'nassau');
  match.matchStatusGame = match.matchStatusGame || ((match.selectedGames || []).find(g => g.key === 'team_match')?.key || (match.selectedGames || []).find(g => g.key === 'nassau')?.key || (match.selectedGames || [])[0]?.key || 'team_match');
}
function normalizeState() {
  state.players = Array.isArray(state.players) ? state.players : [];
  state.courses = Array.isArray(state.courses) ? state.courses : [];
  state.matches = Array.isArray(state.matches) ? state.matches : [];
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
  if (state.activeMatchId && !state.matches.find(m => m.id === state.activeMatchId && m.status === 'active')) {
    state.activeMatchId = null;
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
  if (!match) return 0;
  const limit = getRequestedHoleCount(match);
  return Math.max(0, ...match.players.flatMap(mp => mp.scores.filter(s => s.gross && Number(s.holeNumber) <= limit).map(s => s.holeNumber)), 0);
}
function holeStrokeAllowanceForPlayer(holeStrokeIndex, playerHandicap, baseHandicap) {
  const diff = Math.max(0, playerHandicap - baseHandicap);
  if (!diff || !holeStrokeIndex) return 0;
  const fullRounds = Math.floor(diff / 18);
  const remainder = diff % 18;
  return fullRounds + (holeStrokeIndex <= remainder ? 1 : 0);
}
function computeMatchMetrics(match) {
  if (!match) return null;
  const course = getCourse(match.courseId);
  const tee = getTee(match.courseId, match.teeId);
  if (!course || !tee) return null;
  const holeCount = getPlayableHoleCount(match, tee);
  const scoringHoles = (tee.holes || []).slice(0, holeCount);
  const players = match.players.map(mp => {
    const player = getPlayer(mp.playerId);
    const courseHdcp = courseHandicap(player?.index || 0, tee.slope, tee.rating, tee.par);
    const playHdcp = playingHandicap(courseHdcp, match.allowance);
    return {
      ...mp,
      player,
      team: Number(mp.team) || 1,
      courseHdcp,
      playHdcp,
      scores: (mp.scores || []).slice(0, holeCount),
    };
  }).filter(x => x.player);

  if (!players.length) return { players: [], teams: [], holeResults: [], completed: 0, statusText: 'No players' };

  const lowPlaying = Math.min(...players.map(p => p.playHdcp));
  const holeResults = scoringHoles.map((hole, idx) => {
    const playerScores = players.map(p => {
      const gross = Number(p.scores[idx]?.gross) || null;
      const strokes = holeStrokeAllowanceForPlayer(hole.strokeIndex, p.playHdcp, lowPlaying);
      const net = gross ? gross - strokes : null;
      return { playerId: p.playerId, team: p.team, gross, net, strokes };
    });
    const completed = playerScores.every(s => s.gross !== null);
    const par = Number(hole.par) || 4;
    let indivBest = null;
    let indivWinners = [];
    if (completed) {
      indivBest = Math.min(...playerScores.map(s => s.net));
      indivWinners = playerScores.filter(s => s.net === indivBest).map(s => s.playerId);
    }
    const teams = [1, 2].map(teamNo => {
      const teamPlayers = playerScores.filter(s => s.team === teamNo);
      const gross = teamPlayers.reduce((sum, s) => sum + (s.gross || 0), 0);
      const net = teamPlayers.reduce((sum, s) => sum + (s.net || 0), 0);
      return { team: teamNo, gross: teamPlayers.length ? gross : null, net: teamPlayers.length ? net : null };
    }).filter(t => t.gross !== null);
    let teamWinner = null;
    if (completed && teams.length === 2) {
      if (teams[0].net < teams[1].net) teamWinner = 1;
      else if (teams[1].net < teams[0].net) teamWinner = 2;
      else teamWinner = 0;
    }
    let teamSkinWinner = null;
    if (completed && teams.length === 2 && teams[0].net !== teams[1].net) {
      teamSkinWinner = teams[0].net < teams[1].net ? 1 : 2;
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
      teamScores: teams,
    };
  });

  const playersWithTotals = players.map(p => {
    const scoredHoles = holeResults.filter(h => h.completed).map(h => h.playerScores.find(ps => ps.playerId === p.playerId)).filter(Boolean);
    const grossTotal = scoredHoles.reduce((sum, s) => sum + (s.gross || 0), 0);
    const netTotal = scoredHoles.reduce((sum, s) => sum + (s.net || 0), 0);
    const totalPar = scoringHoles.slice(0, scoredHoles.length).reduce((sum, h) => sum + (Number(h.par) || 0), 0);
    const toPar = grossTotal - totalPar;
    const netDiff = netTotal - totalPar;
    const skins = holeResults.filter(h => h.completed && h.indivWinners.length === 1 && h.indivWinners[0] === p.playerId).length;
    return {
      ...p,
      grossTotal,
      netTotal,
      totalPar,
      toPar,
      netDiff,
      skins,
      holesPlayed: scoredHoles.length,
    };
  });

  const teams = [1, 2].map(teamNo => {
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
  let allowance = Number(document.querySelector('#matchForm [name="allowance"]')?.value || 100) || 100;
  let selected = Array.from(document.querySelectorAll('[data-player-slot]'))
    .map((el, idx) => ({ playerId: el.value || '', team: Number(el.dataset.slotTeam) || 1, slot: idx }))
    .filter(p => p.playerId)
    .filter((p, idx, arr) => arr.findIndex(x => x.playerId === p.playerId) === idx);
  let teamNames = Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value || '');

  const fallbackMatch = editingMatchId ? getMatch(editingMatchId) : (getActiveMatch() || null);
  if ((!courseId || !teeId || !selected.length) && fallbackMatch) {
    courseId = courseId || fallbackMatch.courseId || '';
    teeId = teeId || fallbackMatch.teeId || '';
    allowance = Number(allowance || fallbackMatch.allowance || 100) || 100;
    if (!selected.length && Array.isArray(fallbackMatch.players)) {
      selected = fallbackMatch.players
        .map((p, idx) => ({ playerId: p.playerId, team: Number(p.team) || 1, slot: idx }))
        .filter(p => p.playerId);
    }
    if (!teamNames.length && Array.isArray(fallbackMatch.teamNames)) {
      teamNames = fallbackMatch.teamNames.slice();
    }
  }

  const course = getCourse(courseId);
  const tee = getTee(courseId, teeId);
  if (!course || !tee) {
    wrap.innerHTML = '<div class="tiny">Select a course and tee to preview course handicaps and strokes received.</div>';
    return;
  }
  if (!selected.length) {
    wrap.innerHTML = '<div class="tiny">Select at least one player to preview course handicap, playing handicap, and strokes received.</div>';
    return;
  }
  const enriched = selected.map(sp => {
    const player = getPlayer(sp.playerId);
    if (!player) return null;
    const ch = courseHandicap(player.index, tee.slope, tee.rating, tee.par);
    const ph = playingHandicap(ch, allowance);
    return { player, team: sp.team, courseHdcp: ch, playHdcp: ph, strokes: ph };
  }).filter(Boolean);
  if (!enriched.length) {
    wrap.innerHTML = '<div class="tiny">No valid players selected.</div>';
    return;
  }
  const lowPlaying = Math.min(...enriched.map(p => p.playHdcp));
  wrap.innerHTML = `
    <div class="tiny">${escapeHtml(course.name)} · ${escapeHtml(tee.teeName)} · Allowance ${allowance}%</div>
    <div class="handicap-preview-grid top-gap">${enriched.map(row => {
      const teamLabel = getTeamLabel({ teamNames }, row.team);
      const strokes = Math.max(0, row.playHdcp - lowPlaying);
      return `<div class="handicap-preview-cardline">
        <div class="handicap-preview-name">${escapeHtml(row.player.name)} <span class="tiny">· ${escapeHtml(teamLabel)}</span></div>
        <div class="handicap-preview-meta">
          <div><span class="tiny">Course</span><strong>${row.courseHdcp}</strong></div>
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
  holes.forEach(h => {
    const outcome = computeMomentumOutcome(match, metrics, h, gameKey);
    const step = outcome === 'team1' ? 1 : outcome === 'team2' ? -1 : 0;
    overall += step;
    if ((Number(h.holeNumber) || 0) <= 9) front += step;
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

function getIndividualMatchPairings(match, metrics) {
  if (!match || !metrics || metrics.teams?.length !== 2) return [];
  const team1 = (match.players || []).filter(p => Number(p.team) === 1).sort((a,b)=>(Number(a.slot)||0)-(Number(b.slot)||0));
  const team2 = (match.players || []).filter(p => Number(p.team) === 2).sort((a,b)=>(Number(a.slot)||0)-(Number(b.slot)||0));
  const count = Math.min(team1.length, team2.length);
  const holes = Array.isArray(metrics.holeResults) ? metrics.holeResults : [];
  const basis = String(((match.selectedGames||[]).find(g=>g.key==='individual_match')||{}).basis || 'net').toLowerCase();
  const pairings = [];
  for (let i=0;i<count;i++) {
    const a = team1[i], b = team2[i];
    const pa = metrics.players.find(p => p.playerId === a.playerId);
    const pb = metrics.players.find(p => p.playerId === b.playerId);
    if (!pa || !pb) continue;
    let diff = 0;
    holes.forEach((hole, idx) => {
      const sgA = Number(pa.scores[idx]?.gross) || null;
      const sgB = Number(pb.scores[idx]?.gross) || null;
      if (!sgA || !sgB) return;
      let scoreA = sgA, scoreB = sgB;
      if (basis !== 'gross') {
        const strokesA = holeStrokeAllowanceForPlayer(hole.strokeIndex, pa.playHdcp, metrics.lowPlaying);
        const strokesB = holeStrokeAllowanceForPlayer(hole.strokeIndex, pb.playHdcp, metrics.lowPlaying);
        scoreA = sgA - strokesA;
        scoreB = sgB - strokesB;
      }
      if (scoreA < scoreB) diff += 1;
      else if (scoreB < scoreA) diff -= 1;
    });
    pairings.push({
      team1Player: pa,
      team2Player: pb,
      diff,
      status: diff === 0 ? 'AS' : diff > 0 ? `${Math.abs(diff)} Up` : `${Math.abs(diff)} Down`
    });
  }
  return pairings;
}

function getMatchStatusOptions(match) {
  const selected = Array.isArray(match?.selectedGames) ? match.selectedGames : [];
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
  if (['nassau', 'team_match', 'team_stroke'].includes(gameKey) && metrics.teams.length === 2) {
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
    return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-grid">${items.map(item => `<div class="match-status-tile"><div class="tiny">${escapeHtml(item.label)}</div><div class="match-status-value">${item.value}</div></div>`).join('')}</div>`;
  }
  if (gameKey === 'individual_match') {
    const pairings = getIndividualMatchPairings(match, metrics);
    const basis = formatBasisLabel(cfg.basis);
    if (!pairings.length) {
      return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine} · ${escapeHtml(basis)}</div></div><div class="match-status-tile"><div class="tiny">Status</div><div class="match-status-value">Waiting for pairings</div></div>`;
    }
    return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine} · ${escapeHtml(basis)}</div></div><div class="match-status-grid">${pairings.map(p => `<div class="match-status-tile"><div class="tiny">${escapeHtml(p.team1Player.player.name)} vs ${escapeHtml(p.team2Player.player.name)}</div><div class="match-status-value">${escapeHtml(p.status)}</div></div>`).join('')}</div>`;
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
  return `<div class="match-status-head"><strong>${escapeHtml(title)}</strong><div class="match-status-meta">${courseLine}</div></div><div class="match-status-tile"><div class="tiny">Status</div><div class="match-status-value">Live</div></div>`;
}

function buildClassicScorecard(match, metrics) {
  const tee = metrics?.tee;
  if (!tee) return '<div class="tiny">No scorecard available.</div>';
  const holeCount = getPlayableHoleCount(match, tee);
  const holes = (tee.holes || []).slice(0, holeCount);
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
  const yardageRow = scorecardMetaRow('Yds', h => Number(h.yardage) || 0);
  const parRow = scorecardMetaRow('Par', h => Number(h.par) || 0);
  const siRow = scorecardMetaRow('Handicap', h => Number(h.strokeIndex) || 0);
  const dotMarkup = count => count > 0 ? `<span class="score-dots">${'•'.repeat(Math.min(count,3))}${count>3?`<sup>${count}</sup>`:''}</span>` : '';
  const playerRows = metrics.players.map(p => {
    const playerScores = (p.scores || []).slice(0, holeCount);
    const frontGross = playerScores.slice(0, Math.min(9, holeCount)).reduce((s,x)=>s+(Number(x.gross)||0),0);
    const backGross = holeCount > 9 ? playerScores.slice(9, holeCount).reduce((s,x)=>s+(Number(x.gross)||0),0) : 0;
    const frontNetValues = front.map((hole, idx) => {
      const gross = Number(playerScores[idx]?.gross) || null;
      const strokes = holeStrokeAllowanceForPlayer(hole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      return gross ? gross - strokes : null;
    });
    const backNetValues = back.map((hole, idx) => {
      const gross = Number(playerScores[idx + 9]?.gross) || null;
      const strokes = holeStrokeAllowanceForPlayer(hole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      return gross ? gross - strokes : null;
    });
    const frontNet = frontNetValues.reduce((s,v)=>s+(Number(v)||0),0);
    const backNet = backNetValues.reduce((s,v)=>s+(Number(v)||0),0);
    const cells = holes.map((hole, idx) => {
      const gross = Number(playerScores[idx]?.gross) || null;
      const strokes = holeStrokeAllowanceForPlayer(hole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      if (!gross) return `<td class="score-hole-cell"><div class="score-main">${formatGolfScoreMarkup(null, hole.par, 'gross')}</div><div class="score-sub">${formatGolfScoreMarkup(null, hole.par, 'net')}${dotMarkup(strokes)}</div></td>`;
      const net = gross - strokes;
      return `<td class="score-hole-cell"><div class="score-main">${formatGolfScoreMarkup(gross, hole.par, 'gross')}</div><div class="score-sub">${formatGolfScoreMarkup(net, hole.par, 'net')}${dotMarkup(strokes)}</div></td>`;
    }).join('');
    const totals = back.length
      ? `<td><strong>${frontGross}</strong><div class="score-sub total-sub">${frontNet || '—'}</div></td><td><strong>${backGross}</strong><div class="score-sub total-sub">${backNet || '—'}</div></td><td><strong>${p.grossTotal || 0}</strong><div class="score-sub total-sub">${p.netTotal || 0}</div></td>`
      : `<td><strong>${frontGross}</strong><div class="score-sub total-sub">${frontNet || '—'}</div></td><td><strong>${p.grossTotal || 0}</strong><div class="score-sub total-sub">${p.netTotal || 0}</div></td>`;
    return `<tr><td class="scorecard-sticky-name"><strong>${escapeHtml(p.player.name)}</strong></td><td class="scorecard-sticky-team">${escapeHtml(getTeamLabel(match,p.team))}</td>${cells}${totals}</tr>`;
  }).join('');
  return `<div class="scorecard-sub tiny">Per-hole cells show gross on top and net below, with notation wrapped around the score and dots for strokes received. Course rows include yardage, par, and handicap.</div><div class="scorecard-wrap"><table class="scorecard-table"><thead><tr><th class="scorecard-sticky-name">Player</th><th class="scorecard-sticky-team">Team</th>${holeHeader}${totalColumns}</tr></thead><tbody>${yardageRow}${parRow}${siRow}${playerRows}</tbody></table></div>`;
}

function buildNetPayoutSummary(match, metrics) {
  const selected = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!selected.length) return '<div><strong>Net payout (live):</strong> No gambling games selected.</div>';
  const games = computeLivePayoutGames(match, metrics);
  const players = metrics.players.map(p => ({ id: p.playerId, name: p.player.name }));
  const sections = [
    { key: 'team', title: 'Team games payout', intro: 'Team-format games only. Side matches are tracked separately below.', games: games.filter(game => game.group !== 'side') },
    { key: 'side', title: 'Head-to-head side matches', intro: 'Separate player-vs-player match stakes, kept outside the team payout total.', games: games.filter(game => game.group === 'side') },
  ].filter(section => section.games.length);
  if (!sections.length) return '<div><strong>Net payout (live):</strong> No payout-producing games selected.</div>';

  const renderSection = (section) => {
    const totals = {};
    section.games.forEach(game => addAmounts(totals, game.amounts));
    const headerCells = section.games.map(game => `<th>${escapeHtml(game.label)}</th>`).join('');
    const playerRows = players.map(player => {
      const gameCells = section.games.map(game => {
        const amount = game.amounts[player.id] || 0;
        const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
        const text = Math.abs(amount) > 0.0001 ? formatMoneyAccounting(amount) : '—';
        return `<td class="${cls}">${text}</td>`;
      }).join('');
      const total = totals[player.id] || 0;
      const totalCls = total > 0.0001 ? 'payout-total-positive' : total < -0.0001 ? 'payout-total-negative' : '';
      const totalText = Math.abs(total) > 0.0001 ? formatMoneyAccounting(total) : '—';
      return `<tr><td><strong>${escapeHtml(player.name)}</strong></td>${gameCells}<td class="${totalCls}"><strong>${totalText}</strong></td></tr>`;
    }).join('');
    const columnFoot = section.games.map(game => {
      const colTotal = players.reduce((sum, player) => sum + (game.amounts[player.id] || 0), 0);
      const cls = Math.abs(colTotal) <= 0.0001 ? '' : (colTotal > 0 ? 'payout-total-positive' : 'payout-total-negative');
      return `<td class="${cls}"><strong>${formatMoneyAccounting(colTotal)}</strong></td>`;
    }).join('');
    const overallTotal = players.reduce((sum, player) => sum + (totals[player.id] || 0), 0);
    const settlements = optimalSettlementRows(totals);
    const settlementRows = settlements.length
      ? settlements.map(row => `<tr><td>${escapeHtml(getPlayer(row.from)?.name || 'Unknown')}</td><td>${escapeHtml(getPlayer(row.to)?.name || 'Unknown')}</td><td><strong>${formatMoneyAccounting(row.amount)}</strong></td></tr>`).join('')
      : '<tr><td colspan="3">No payouts due right now.</td></tr>';
    return `
      <div class="payout-section top-gap">
        <div class="payout-summary-intro"><strong>${escapeHtml(section.title)}:</strong> ${escapeHtml(section.intro)}</div>
        <div class="payout-table-wrap top-gap">
          <table class="payout-game-table payout-game-table-wide">
            <thead><tr><th>Player</th>${headerCells}<th>Total</th></tr></thead>
            <tbody>${playerRows}</tbody>
            <tfoot><tr><td><strong>Total</strong></td>${columnFoot}<td><strong>${formatMoneyAccounting(overallTotal)}</strong></td></tr></tfoot>
          </table>
        </div>
        <div class="top-gap payout-settlement-head"><strong>${escapeHtml(section.title)} settlement</strong></div>
        <div class="payout-table-wrap top-gap">
          <table class="settlement-table">
            <thead><tr><th>From</th><th>To</th><th>Amount</th></tr></thead>
            <tbody>${settlementRows}</tbody>
          </table>
        </div>
      </div>`;
  };

  return `<div class="payout-summary-stack">${sections.map(renderSection).join('')}</div>`;
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
  const holeMomentum = document.getElementById('holeMomentum');
  const momentumMeta = document.getElementById('momentumMeta');
  const payoutSummary = document.getElementById('payoutSummary');
  const perspectiveSelect = document.getElementById('momentumPerspectiveSelect');

  if (!match) {
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

  const sortedPlayers = metrics.players.slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar);
  playerBody.innerHTML = sortedPlayers.map(p => `
    <tr>
      <td>${escapeHtml(p.player.name)}</td>
      <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
      <td>${p.grossTotal || 0}</td>
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
          <div><div class="leader-mobile-label">Gross to Par</div><div>${formatSigned(p.toPar || 0)}</div></div>
          <div><div class="leader-mobile-label">Net</div><div>${p.netTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Net to Par</div><div>${formatSigned(p.netDiff || 0)}</div></div>
        </div>
      </div>
    `).join('');
  }

  teamBody.innerHTML = metrics.teams.map(t => `
    <tr>
      <td>${escapeHtml(getTeamLabel(match, t.team))}</td>
      <td>${escapeHtml(t.members.map(m => m.player.name).join(', '))}</td>
      <td>${t.grossTotal}</td>
      <td>${t.netTotal}</td>
      <td>${formatSigned(t.toPar)}</td>
      <td>${formatSigned(t.netDiff)}</td>
      <td>${formatSigned(t.overall)}</td>
    </tr>
  `).join('');
  const teamMobile = document.getElementById('teamLeaderboardMobile');
  if (teamMobile) {
    teamMobile.innerHTML = metrics.teams.map(t => `
      <div class="leader-mobile-card">
        <div><strong>${escapeHtml(getTeamLabel(match, t.team))}</strong></div>
        <div class="tiny">${escapeHtml(t.members.map(m => m.player.name).join(', '))}</div>
        <div class="leader-mobile-grid">
          <div><div class="leader-mobile-label">Gross</div><div>${t.grossTotal}</div></div>
          <div><div class="leader-mobile-label">Net</div><div>${t.netTotal}</div></div>
          <div><div class="leader-mobile-label">To Par</div><div>${formatSigned(t.toPar)}</div></div>
          <div><div class="leader-mobile-label">Net Diff</div><div>${formatSigned(t.netDiff)}</div></div>
          <div><div class="leader-mobile-label">Match</div><div>${formatSigned(t.overall)}</div></div>
        </div>
      </div>
    `).join('');
  }

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
  const momentumSelect = document.getElementById('momentumGameSelect');
  const options = getMomentumOptions(match);
  if (momentumSelect) {
    momentumSelect.innerHTML = options.map(opt => `<option value="${opt.key}" ${opt.key === match.momentumGame ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    if (!options.find(opt => opt.key === match.momentumGame)) {
      match.momentumGame = options[0]?.key || 'nassau';
      momentumSelect.value = match.momentumGame;
    }
  }
  if (perspectiveSelect) {
    const teamOptions = metrics.teams.slice(0, 2).map(t => `<option value="${t.team}" ${t.team === getMomentumPerspectiveTeam(match) ? 'selected' : ''}>${escapeHtml(getTeamName(match, t.team))}</option>`).join('');
    perspectiveSelect.innerHTML = teamOptions;
    if (!metrics.teams.find(t => t.team === getMomentumPerspectiveTeam(match))) {
      match.momentumPerspective = 1;
      perspectiveSelect.value = '1';
    }
  }
  if (momentumMeta) {
    momentumMeta.textContent = describeMomentumMeta(match, metrics, match.momentumGame || options[0]?.key || 'nassau');
  }
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
  if (payoutSummary) {
    payoutSummary.innerHTML = buildNetPayoutSummary(match, metrics);
  }
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
  if (!state.courses.length) {
    el.innerHTML = '<div class="tiny">No courses saved yet.</div>';
    return;
  }
  el.innerHTML = state.courses.map(c => `
    <div class="item compact-item">
      <div class="item-header compact-item-header">
        <div>
          <div class="item-title">${escapeHtml(c.name)}</div>
          <div class="muted">${escapeHtml([c.city, c.state].filter(Boolean).join(', ') || c.country)}</div>
        </div>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-course="${c.id}">Edit course</button>
          <button class="secondary" data-delete-course="${c.id}">Delete</button>
          <button class="secondary" data-new-tee="${c.id}">Add tee</button>
        </div>
      </div>
      <div class="top-gap">
        ${c.tees.length ? getSortedTeesByYardage(c).map(t => `
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
    </div>
  `).join('');
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
    return `
      <div class="item compact-item">
        <div class="item-header compact-item-header">
          <div>
            <div class="item-title">${escapeHtml(match.name || 'Round')} · ${escapeHtml(match.date)}</div>
            <div class="muted">${escapeHtml(course?.name || 'No course')} · ${escapeHtml(tee?.teeName || 'No tee')} · ${status}</div>
            <div class="tiny">${metrics ? `${metrics.completed}/${getPlayableHoleCount(match, metrics.tee)} holes completed` : ''}</div>
          </div>
          <div class="actions wrap compact-actions">
            <button class="secondary" data-load-match="${match.id}">${state.activeMatchId === match.id ? 'Loaded' : 'Load'}</button>
            <button class="secondary" data-share-match="${match.id}">PDF</button>
            <button class="secondary" data-delete-match="${match.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCurrentMatch() {
  const match = getActiveMatch();
  const metaEl = document.getElementById('currentMatchMeta');
  const emptyEl = document.getElementById('scoreEntryEmpty');
  const wrapEl = document.getElementById('scoreEntryWrap');
  const finishBtn = document.getElementById('confirmFinishRoundBtn');
  finishBtn.classList.add('hidden');
  finishConfirmArmed = false;
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
  metaEl.textContent = `${match.date} · ${match.name || 'Round'} · ${course?.name || ''} · ${tee?.teeName || ''} · ${metrics?.completed || 0}/${holeCount} holes completed`;
  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');
  currentHole = Math.min(getPlayableHoleCount(match, tee), Math.max(1, currentHole));
  document.getElementById('currentHoleBadge').textContent = `Hole ${currentHole}`;
  const hole = tee?.holes[currentHole - 1];
  const teamText = metrics?.teams?.length === 2 ? `${formatMatchDiff(metrics.matchDiff, match)} overall` : 'Singles leaderboard';
  document.getElementById('holeSummary').textContent = hole ? `Par ${hole.par || '-'} · ${hole.yardage || '-'} yds · SI ${hole.strokeIndex || '-'} · ${teamText}` : '';
  renderScoreGrid(match, tee, metrics);
  renderGreeniesEntry(match, hole);
  renderHoleJumpTiles(match);
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
  const eligible = (greenies.participants || []).map(getPlayer).filter(Boolean);
  const winnerId = match.greeniesWinners?.[String(hole.holeNumber)] || '';
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="card inset-card game-config-card greenies-card"><div class="section-label">Greenies · Hole ${hole.holeNumber}</div><div class="greenies-list top-gap">${eligible.map(p => `<label class="mini-check greenies-check"><input type="checkbox" data-greenies-winner="${p.id}" ${winnerId === p.id ? 'checked' : ''} /><span>${escapeHtml(p.name)}</span></label>`).join('') || '<div class="tiny">No greenies participants selected for this match.</div>'}</div><div class="tiny top-gap">Select the closest-to-the-pin winner for this par 3. Payout runs only against selected greenies participants.</div></div>`;
}
function renderHoleJumpTiles(match) {
  const wrap = document.getElementById('holeJumpTiles');
  if (!wrap) return;
  const completed = completedHoles(match);
  const holeCount = getPlayableHoleCount(match);
  wrap.innerHTML = Array.from({ length: holeCount }, (_, idx) => {
    const holeNo = idx + 1;
    const classes = ['hole-jump-tile'];
    if (holeNo === currentHole) classes.push('active');
    classes.push('complete');
    if (holeNo <= completed) classes.push('played');
    return `<button type="button" class="${classes.join(' ')}" data-jump-hole="${holeNo}">${holeNo}</button>`;
  }).join('');
}

function renderScoreGrid(match, tee, metrics) {
  const body = document.getElementById('scoreGridBody');
  if (!match || !tee || !metrics) {
    body.innerHTML = '';
    return;
  }
  const hole = tee.holes[currentHole - 1];
  body.innerHTML = metrics.players.map(p => {
    const score = p.scores[currentHole - 1];
    const strokes = holeStrokeAllowanceForPlayer(hole?.strokeIndex, p.playHdcp, metrics.lowPlaying);
    const gross = score?.gross || '';
    const net = score?.gross ? score.gross - strokes : '';
    return `
      <tr>
        <td>${escapeHtml(p.player.name)}</td>
        <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
        <td><input class="score-input" type="tel" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" min="1" max="15" data-score-player="${p.playerId}" value="${gross}" /></td>
        <td>${strokes}</td>
        <td>${net}</td>
      </tr>
    `;
  }).join('');
}

function getMomentumOptions(match) {
  const selected = Array.isArray(match?.selectedGames) ? match.selectedGames : [];
  const teamKeys = ['nassau', 'team_match', 'team_stroke'];
  const keys = selected.map(g => g.key).filter(k => teamKeys.includes(k));
  const unique = [...new Set(keys)];
  if (!unique.length) unique.push('nassau');
  unique.sort((a,b) => (a === 'nassau' ? -1 : b === 'nassau' ? 1 : 0));
  return unique.map(key => ({ key, label: getGameLabel(key) }));
}
function computeMomentumOutcome(match, metrics, holeResult, gameKey) {
  if (!holeResult?.completed) return 'pending';
  const config = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  if (gameKey === 'team_stroke') {
    const basis = String(config.basis || 'net').toLowerCase();
    const mode = String(config.scoringMode || 'best_ball').toLowerCase();
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
  const selected = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  const games = [];
  const teamMemberIds = teamNo => (metrics.teams.find(t => t.team === teamNo)?.members || []).map(m => m.player.id);
  const splitAcrossTeam = (amounts, teamNo, total) => {
    const ids = teamMemberIds(teamNo);
    if (!ids.length || !total) return;
    const each = total / ids.length;
    ids.forEach(id => { amounts[id] = (amounts[id] || 0) + each; });
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
        if (frontLeader && front) { splitAcrossTeam(amounts, frontLeader, front); splitAcrossTeam(amounts, frontLeader === 1 ? 2 : 1, -front); }
        if (backLeader && back) { splitAcrossTeam(amounts, backLeader, back); splitAcrossTeam(amounts, backLeader === 1 ? 2 : 1, -back); }
        if (overallLeader && overall) { splitAcrossTeam(amounts, overallLeader, overall); splitAcrossTeam(amounts, overallLeader === 1 ? 2 : 1, -overall); }
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
      if (leader && stake) { splitAcrossTeam(amounts, leader, stake); splitAcrossTeam(amounts, leader === 1 ? 2 : 1, -stake); }
      pushGame(cfg.key, `${getGameLabel(cfg.key)} (${formatBasisLabel(cfg.basis)} · Best Ball)`, amounts); return;
    }
    if (cfg.key === 'team_stroke' && metrics.teams.length >= 2) {
      const amounts = {};
      const stake = Number(cfg.stake || 0);
      const standing = getTeamStrokeStanding(metrics, String(cfg.basis || 'net').toLowerCase(), String(cfg.scoringMode || 'best_ball').toLowerCase());
      if (stake && standing.winner) {
        const losers = metrics.teams.filter(t => t.team !== standing.winner).map(t => t.team);
        splitAcrossTeam(amounts, standing.winner, stake * losers.length);
        losers.forEach(teamNo => splitAcrossTeam(amounts, teamNo, -stake));
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
            splitAcrossTeam(amounts, winner, stake * losers.length);
            losers.forEach(teamNo => splitAcrossTeam(amounts, teamNo, -stake));
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
      const stake = Number(cfg.stake || 0);
      const amounts = {};
      const pairings = getIndividualMatchPairings(match, metrics);
      pairings.forEach(p => {
        if (!stake || !Number.isFinite(p.diff) || p.diff === 0) return;
        if (p.diff > 0) {
          amounts[p.team1Player.playerId] = (amounts[p.team1Player.playerId] || 0) + stake;
          amounts[p.team2Player.playerId] = (amounts[p.team2Player.playerId] || 0) - stake;
        } else {
          amounts[p.team1Player.playerId] = (amounts[p.team1Player.playerId] || 0) - stake;
          amounts[p.team2Player.playerId] = (amounts[p.team2Player.playerId] || 0) + stake;
        }
      });
      pushGame(cfg.key, `Side Match (${formatBasisLabel(cfg.basis)})`, amounts, 'side'); return;
    }
    pushGame(cfg.key, getGameLabel(cfg.key), {});
  });
  return games;
}

function buildSelectedGamesSummary(match, metrics) {
  const selected = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!selected.length) {
    return `<div class="game-summary-grid"><div class="game-summary-card"><div class="game-summary-title">Round pace</div><div class="game-summary-value">${metrics.completed ? `${Math.round((metrics.completed / Math.max(1, getPlayableHoleCount(match, metrics.tee))) * 100)}% complete` : 'Not started'}</div></div></div>`;
  }
  const cards = selected.map(cfg => {
    const title = getFeaturedGameLabel(match, cfg.key);
    let value = 'Live';
    let sub = '';
    if (cfg.key === 'nassau') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      value = formatTeamGameStatus(match, metrics, diffs.overall);
      sub = `Front 9: ${formatTeamGameStatus(match, metrics, diffs.front)} · Back 9: ${formatTeamGameStatus(match, metrics, diffs.back)}`;
    } else if (cfg.key === 'team_match') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      value = formatTeamGameStatus(match, metrics, diffs.overall);
      sub = `Front 9: ${formatTeamGameStatus(match, metrics, diffs.front)} · Back 9: ${formatTeamGameStatus(match, metrics, diffs.back)}`;
    } else if (cfg.key === 'team_stroke') {
      const basisKey = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'toPar' : 'netDiff';
      const mode = String(cfg.scoringMode || 'best_ball');
      const scoredTeams = metrics.teams.map(t => {
        let value;
        if (mode === 'aggregate') value = basisKey === 'toPar' ? t.toPar : t.netDiff;
        else {
          value = (metrics.holeResults || []).reduce((sum,h) => { const v = getTeamHoleScore(h, t.team, cfg.basis, mode); const par = Number(h.par)||0; return sum + (Number.isFinite(v) ? v - par : 0); }, 0);
        }
        return { team:t.team, value };
      }).sort((a,b)=>a.value-b.value);
      value = scoredTeams[0] ? `${describeTeamLabel(match, scoredTeams[0].team, metrics)} (${formatSigned(scoredTeams[0].value)})` : '—';
      sub = `Mode: ${formatScoringModeLabel(cfg.scoringMode)} · ${formatBasisLabel(cfg.basis)}`;
    } else if (cfg.key === 'individual_match') {
      const pairings = getIndividualMatchPairings(match, metrics);
      if (!pairings.length) {
        value = 'Waiting for pairings';
        sub = `Scored as match play · ${formatBasisLabel(cfg.basis)}`;
      } else {
        const leaders = pairings.map(p => {
          if (!Number.isFinite(p.diff) || p.diff === 0) return null;
          return p.diff > 0 ? p.team1Player.player.name : p.team2Player.player.name;
        }).filter(Boolean);
        value = leaders.length ? leaders.join(' · ') : 'All square';
        sub = pairings.map(p => `${p.team1Player.player.name} vs ${p.team2Player.player.name}: ${p.status}`).join(' · ');
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
    return `<div class="game-summary-card"><div class="game-summary-title">${escapeHtml(title)}</div><div class="game-summary-value">${escapeHtml(value)}</div>${sub ? `<div class="game-summary-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
  });
  cards.push(`<div class="game-summary-card game-summary-card-accent"><div class="game-summary-title">Round pace</div><div class="game-summary-value">${metrics.completed ? `${Math.round((metrics.completed / Math.max(1, getPlayableHoleCount(match, metrics.tee))) * 100)}% complete` : 'Not started'}</div><div class="game-summary-sub">${metrics.completed}/${getPlayableHoleCount(match, metrics.tee)} holes completed</div></div>`);
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
  teeSelect.innerHTML = !course ? '<option value="">Select tee</option>' : `<option value="">Select tee</option>${getSortedTeesByYardage(course).map(t => `<option value="${t.id}" ${selectedTeeId === t.id ? 'selected' : ''}>${formatTeeSummary(t)}</option>`).join('')}`;
  if (selectedTeeId) teeSelect.value = selectedTeeId;
}

function renderTeamNameInputs(teamCount = Number(document.getElementById('teamCountSelect')?.value || 1), teamNames = []) {
  const wrap = document.getElementById('teamNamesGrid');
  if (!wrap) return;
  wrap.innerHTML = Array.from({ length: teamCount }, (_, idx) => `
    <label>
      <span>Team ${idx + 1} name</span>
      <input data-team-name="${idx + 1}" maxlength="25" value="${escapeHtml((teamNames[idx] || `Team ${idx + 1}`).slice(0,25))}" placeholder="Team ${idx + 1}" />
    </label>
  `).join('');
}
function getAssignmentSelections() {
  return Array.from(document.querySelectorAll('[data-player-slot]')).map(el => el.value).filter(Boolean);
}
function populateMatchPlayerPicker(selected = []) {
  const container = document.getElementById('matchPlayersPicker');
  const summary = document.getElementById('assignmentSummary');
  const teamCount = Number(document.getElementById('teamCountSelect')?.value || 1);
  const playersPerTeam = Number(document.getElementById('playersPerTeamSelect')?.value || 1);
  const slotCount = teamCount * playersPerTeam;
  if (!state.players.length) {
    container.innerHTML = '<div class="tiny">Add players first.</div>';
    if (summary) summary.textContent = 'No saved players yet.';
    return;
  }
  const selectedBySlot = Array.from({ length: slotCount }, (_, idx) => {
    const direct = selected.find(s => Number(s.slot) === idx)?.playerId;
    if (direct) return direct;
    return selected[idx]?.playerId || '';
  });
  const teamNames = Array.from({ length: teamCount }, (_, i) => document.querySelector(`[data-team-name="${i + 1}"]`)?.value || `Team ${i + 1}`);
  container.innerHTML = Array.from({ length: slotCount }, (_, idx) => {
    const teamNo = Math.floor(idx / playersPerTeam) + 1;
    const slotNo = (idx % playersPerTeam) + 1;
    const current = selectedBySlot[idx] || '';
    const takenElsewhere = new Set(selectedBySlot.filter((id, takeIdx) => id && takeIdx !== idx));
    const options = ['<option value="">Select player</option>']
      .concat(state.players
        .filter(p => !takenElsewhere.has(p.id) || p.id === current)
        .map(p => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${escapeHtml(p.name)} (${Number(p.index).toFixed(1)})</option>`))
      .join('');
    return `
      <div class="picker-row picker-row-stack">
        <div class="tiny"><strong>${escapeHtml(teamNames[teamNo - 1])}</strong> · Player ${slotNo}</div>
        <select data-player-slot="${idx}" data-slot-team="${teamNo}">${options}</select>
      </div>
    `;
  }).join('');
  if (summary) summary.textContent = `${slotCount} slots · ${teamCount} teams · ${playersPerTeam} player(s) per team`;
}
function getDefaultGameConfigs() {
  return [
    { key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 },
    { key: 'individual_match', basis: 'net', stake: 5 },
    { key: 'team_match', basis: 'net', stake: 5 },
    { key: 'team_stroke', basis: 'net', scoringMode: 'best_ball', stake: 5 },
    { key: 'skins', basis: 'net', skinsType: 'individual', stake: 5 },
    { key: 'greenies', stakePerPlayer: 1, participants: [] },
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
  return Array.from(document.querySelectorAll('[data-player-slot]')).map((el, idx) => ({
    playerId: el.value || '',
    team: Number(el.dataset.slotTeam) || 1,
    slot: idx,
  }));
}
function preserveMatchSetupUi() {
  const form = document.getElementById('matchForm');
  if (!form) return;
  const selectedCourseId = document.getElementById('matchCourseSelect')?.value || '';
  const selectedTeeId = document.getElementById('matchTeeSelect')?.value || '';
  const currentSelections = getCurrentMatchEditorSelections();
  const currentTeamNames = Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value || '');
  const currentGames = collectSelectedGames();
  populateMatchCourseSelects(selectedCourseId, selectedTeeId);
  renderTeamNameInputs(Number(document.getElementById('teamCountSelect')?.value || 2), currentTeamNames);
  populateMatchPlayerPicker(currentSelections);
  renderGamesPicker(currentGames);
}
function renderGamesPicker(existing = []) {
  const picker = document.getElementById('gamesPicker');
  const configsWrap = document.getElementById('gameConfigs');
  if (!picker || !configsWrap) return;
  const selectedKeys = (existing || []).map(g => g.key);
  picker.innerHTML = GAME_LIBRARY.map(game => `
    <label class="game-pill ${selectedKeys.includes(game.key) ? 'selected' : ''}">
      <input type="checkbox" data-game-key="${game.key}" ${selectedKeys.includes(game.key) ? 'checked' : ''} />
      <span>${getGameLabel(game.key)}</span>
    </label>
  `).join('');
  const selectedGames = GAME_LIBRARY.filter(g => selectedKeys.includes(g.key));
  configsWrap.innerHTML = selectedGames.map(game => {
    const cfg = getGameConfig(game.key, existing);
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
            <option value="best_ball" ${cfg.scoringMode === 'best_ball' ? 'selected' : ''}>Best Team Ball</option>
            <option value="aggregate" ${cfg.scoringMode === 'aggregate' ? 'selected' : ''}>Aggregate</option>
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
            <div class="greenies-list">${getCurrentAssignablePlayers().map(p => `<label class="mini-check"><input type="checkbox" data-greenie-player="${p.id}" ${(cfg.participants || []).includes(p.id) ? 'checked' : ''} /> ${escapeHtml(p.name)}</label>`).join('') || '<div class="tiny">Select match players first.</div>'}</div>
          </label>
          <label><span>$ / player / par 3</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stakePerPlayer" value="${cfg.stakePerPlayer ?? 1}" /></label>
        </div>
      </div>`;
    }
    return `<div class="card inset-card game-config-card">
      <div class="game-config-header"><div class="section-label">${game.key === 'individual_match' ? 'Head-to-Head Side Matches' : getGameLabel(game.key)}</div><div class="tiny">${game.key === 'individual_match' ? 'Separate from the team payout total' : 'Configure basis and stakes'}</div></div>
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
  return keys.map(key => {
    const cfg = { key };
    document.querySelectorAll(`[data-game-config="${key}"]`).forEach(el => {
      cfg[el.dataset.field] = el.value;
    });
    if (key === 'greenies') {
      const allowed = new Set(getCurrentAssignablePlayers().map(p => p.id));
      cfg.participants = Array.from(document.querySelectorAll('[data-greenie-player]:checked')).map(el => el.dataset.greeniePlayer).filter(id => allowed.has(id));
    }
    return cfg;
  });
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
              <td>${row.yardage ?? '—'}</td>
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
    const comboSources = preserveCombo ? collectComboSources() : null;
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

function buildTeeHoleRows(courseId = '', holes = null) {
  const course = getCourse(courseId);
  const template = getCourseStrokeTemplate(course);
  let rows = holes ? holes.map(normalizeHole) : buildDefaultHoles();
  if (!holes && template) rows = rows.map((h, idx) => ({ ...h, strokeIndex: Number(template[idx]) || null }));
  return template ? applyStrokeTemplate(rows, template) : rows;
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
function renderMatchSetupState() {
  const wrap = document.getElementById('matchSetupFormWrap');
  const msg = document.getElementById('setupLockMsg');
  const active = getActiveMatch();
  const started = matchHasStarted(active);
  const editingActive = !!(editingMatchId && active && editingMatchId === active.id);
  if (!wrap || !msg) return;
  if (started && !editingActive) {
    wrap.classList.add('hidden');
    msg.textContent = `Scoring has started for ${active.name || 'the active match'}. Use Edit Active Match to make changes with confirmation.`;
  } else {
    wrap.classList.remove('hidden');
    msg.textContent = active ? `${active.name || 'Active match'} · ${completedHoles(active)}/${getRequestedHoleCount(active)} holes entered.` : 'Build a new match, or edit the active one.';
  }
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

function loadMatchEditor(matchId = null) {
  const form = document.getElementById('matchForm');
  editingMatchId = matchId;
  document.getElementById('cancelMatchEditBtn').classList.toggle('hidden', !matchId);
  document.getElementById('matchFormTitle').textContent = matchId ? 'Edit match' : 'Setup match';
  document.getElementById('matchSubmitBtn').textContent = matchId ? 'Update Match' : 'Create Match';
  activateTab('setup');
  if (!matchId) {
    form.reset();
    form.elements.namedItem('date').value = todayIso();
    form.elements.namedItem('allowance').value = 100;
    form.elements.namedItem('holeCount').value = '18';
    document.getElementById('teamCountSelect').value = '1';
    document.getElementById('playersPerTeamSelect').value = '1';
    populateMatchCourseSelects();
    renderTeamNameInputs(1, []);
    populateMatchPlayerPicker([]);
    renderGamesPicker([]);
    return;
  }
  const match = getMatch(matchId); if (!match) return;
  form.elements.namedItem('date').value = match.date;
  form.elements.namedItem('name').value = match.name || '';
  populateMatchCourseSelects(match.courseId || '', match.teeId || '');
  form.elements.namedItem('allowance').value = match.allowance || 100;
  form.elements.namedItem('holeCount').value = String(getRequestedHoleCount(match));
  document.getElementById('teamCountSelect').value = String(match.teamCount || 2);
  document.getElementById('playersPerTeamSelect').value = String(match.playersPerTeam || 2);
  renderTeamNameInputs(match.teamCount || 2, match.teamNames || []);
  populateMatchPlayerPicker(match.players || []);
  renderGamesPicker(match.selectedGames || []);
  window.scrollTo({ top: document.getElementById('matchFormTitle').getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `the-dye-ledger-${todayIso()}.json`; a.click();
  URL.revokeObjectURL(url);
}

function installHandlers() {
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
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
    loadCourseEditor(null); persist(); toast(editingCourseId ? 'Course updated.' : 'Course added.');
  });
  document.getElementById('cancelCourseEditBtn').addEventListener('click', () => loadCourseEditor(null));
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
      length: Number(fd.get('length')) || null,
      par: Number(fd.get('par')) || null,
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
    loadTeeEditor(courseId, null); persist(); toast(editingTeeRef ? 'Tee updated.' : 'Tee saved.');
  });
  document.getElementById('cancelTeeEditBtn').addEventListener('click', () => loadTeeEditor(null, null));
  document.getElementById('teeCourseSelect').addEventListener('change', e => {
    const existing = collectHolesFromGrid();
    const hasData = existing.some((h, idx) => h.yardage || h.par || (Number(h.strokeIndex) && Number(h.strokeIndex) !== idx + 1));
    renderHoleRows(buildTeeHoleRows(e.target.value, hasData ? existing : null));
    renderComboSourceRows(e.target.value, collectComboSources());
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

  
  document.getElementById('newMatchBtn').addEventListener('click', () => {
    editingMatchId = null;
    loadMatchEditor(null);
    renderMatchSetupState();
    activateTab('setup');
  });
  document.getElementById('editActiveMatchBtn').addEventListener('click', () => {
    const active = getActiveMatch();
    if (!active) return toast('No active match to edit.');
    if (matchHasStarted(active) && !confirm('Editing may affect scoring. Continue?')) return;
    loadMatchEditor(active.id);
    renderMatchSetupState();
    activateTab('setup');
  });

  document.getElementById('matchCourseSelect').addEventListener('change', e => { populateMatchTees(e.target.value); renderSetupHandicapPreview(); });
  document.getElementById('teamCountSelect').addEventListener('change', () => {
    const teamCount = Number(document.getElementById('teamCountSelect').value || 2);
    const currentSelections = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value }));
    renderTeamNameInputs(teamCount, Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value));
    populateMatchPlayerPicker(currentSelections);
    renderGamesPicker(collectSelectedGames());
    renderSetupHandicapPreview();
  });
  document.getElementById('playersPerTeamSelect').addEventListener('change', () => { const currentSelections = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value })); populateMatchPlayerPicker(currentSelections); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); });
  document.getElementById('teamNamesGrid').addEventListener('input', () => { const currentSelections = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value })); populateMatchPlayerPicker(currentSelections); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); });
  document.getElementById('matchPlayersPicker').addEventListener('change', e => {
    if (e.target.matches('[data-player-slot]')) { populateMatchPlayerPicker(Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value }))); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); }
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
  document.getElementById('score').addEventListener('change', e => {
    if (e.target.matches('[data-greenies-winner]')) {
      document.querySelectorAll('[data-greenies-winner]').forEach(el => { if (el !== e.target) el.checked = false; });
    }
  });
  document.getElementById('setup').addEventListener('change', e => {
    if (e.target.matches('[data-player-slot], [data-team-name], #teamCountSelect, #playersPerTeamSelect, #matchCourseSelect, #matchTeeSelect, [name="allowance"]')) {
      setTimeout(() => { renderSetupHandicapPreview(); }, 0);
    }
  });
  document.getElementById('setup').addEventListener('input', e => {
    if (e.target.matches('[data-team-name], [name="allowance"]')) {
      renderSetupHandicapPreview();
    }
  });
  document.getElementById('score').addEventListener('click', e => {
    const jumpHole = e.target.closest('[data-jump-hole]')?.dataset.jumpHole;
    if (jumpHole) {
      saveCurrentHole({ targetHole: Number(jumpHole), silent: true });
    }
  });
  document.getElementById('matchForm').addEventListener('submit', e => {
    e.preventDefault();
    try {
    const fd = new FormData(e.target);
    const teamCount = Number(fd.get('teamCount')) || 2;
    const playersPerTeam = Number(fd.get('playersPerTeam')) || 2;
    if ((teamCount * playersPerTeam) > 12) return toast('Limit is 12 total players.');
    const teamNames = Array.from({ length: teamCount }, (_, i) => String(document.querySelector(`[data-team-name="${i + 1}"]`)?.value || `Team ${i + 1}`).slice(0, 25));
    const selectedPlayers = Array.from(document.querySelectorAll('[data-player-slot]'))
      .map((el, idx) => ({ playerId: el.value, team: Number(el.dataset.slotTeam), slot: idx }))
      .filter(p => p.playerId);
    const uniqueIds = new Set(selectedPlayers.map(p => p.playerId));
    if (selectedPlayers.length !== uniqueIds.size) return toast('Each player can only be selected once.');
    if (selectedPlayers.length < 1) return toast('Select at least 1 player.');
    const selectedGames = collectSelectedGames();
    if (selectedGames.length > 5) return toast('Select up to 5 gambling games.');
    if (selectedGames.some(g => g.key === 'nassau') && teamCount !== 2) return toast('Nassau requires exactly 2 teams.');
    if (selectedGames.some(g => ['team_match','team_stroke'].includes(g.key)) && teamCount < 2) return toast('Team games require at least 2 teams.');
    const existing = editingMatchId ? getMatch(editingMatchId) : null;
    const match = {
      id: editingMatchId || uid(),
      date: String(fd.get('date') || todayIso()),
      name: String(fd.get('name') || '').trim() || 'Round',
      courseId: String(fd.get('courseId') || ''),
      teeId: String(fd.get('teeId') || ''),
      format: 'teams',
      allowance: Number(fd.get('allowance')) || 100,
      holeCount: Number(fd.get('holeCount')) === 9 ? 9 : 18,
      teamCount,
      playersPerTeam,
      teamNames,
      selectedGames,
      status: existing?.status || 'active',
      completedAt: existing?.completedAt || null,
      players: selectedPlayers.map(sp => {
        const old = existing?.players.find(op => op.playerId === sp.playerId);
        return old ? { ...old, team: sp.team } : { playerId: sp.playerId, team: sp.team, scores: buildEmptyScores(Number(fd.get('holeCount')) === 9 ? 9 : 18) };
      }),
      greeniesWinners: existing?.greeniesWinners || {},
      momentumGame: existing?.momentumGame || (selectedGames.find(g => g.key === 'nassau')?.key || selectedGames.find(g => ['team_match','team_stroke'].includes(g.key))?.key || 'nassau'),
      matchStatusGame: existing?.matchStatusGame || (selectedGames.find(g => g.key === 'team_match')?.key || selectedGames.find(g => g.key === 'nassau')?.key || selectedGames[0]?.key || 'team_match'),
      momentumPerspective: Number(existing?.momentumPerspective || 1) === 2 ? 2 : 1,
    };
    normalizeMatch(match);
    if (!match.courseId || !match.teeId) return toast('Select a course and tee.');
    if (editingMatchId) state.matches = state.matches.map(m => m.id === editingMatchId ? match : m); else state.matches.push(match);
    state.activeMatchId = match.id;
    currentHole = Math.min(getRequestedHoleCount(match), Math.max(1, completedHoles(match) || 1));
    persist({ skipRender: true });
    loadMatchEditor(null);
    renderAll();
    activateTab('score');
    toast(editingMatchId ? 'Match updated.' : 'Match created and loaded.');
    } catch (err) { console.error(err); toast('Could not create match. Please try again.'); }
  });
  document.getElementById('cancelMatchEditBtn').addEventListener('click', () => { loadMatchEditor(null); renderMatchSetupState(); });
  function saveCurrentHole({ advance = false, targetHole = null, silent = false } = {}) {
    const match = getActiveMatch(); if (!match) return false;
    const holeInputs = document.querySelectorAll('[data-score-player]');
    holeInputs.forEach(input => {
      const playerId = input.dataset.scorePlayer;
      const mp = match.players.find(p => p.playerId === playerId);
      if (mp) mp.scores[currentHole - 1].gross = Number(input.value) || null;
    });
    const selectedWinner = document.querySelector('[data-greenies-winner]:checked')?.dataset.greeniesWinner || '';
    if (selectedWinner) {
      match.greeniesWinners[String(currentHole)] = selectedWinner;
    } else if (match.greeniesWinners && match.greeniesWinners[String(currentHole)]) {
      delete match.greeniesWinners[String(currentHole)];
    }
    const savedHole = currentHole;
    const maxHole = getRequestedHoleCount(match);
    if (Number.isFinite(targetHole) && targetHole >= 1 && targetHole <= maxHole) {
      currentHole = targetHole;
    } else if (advance) {
      currentHole = Math.min(maxHole, currentHole + 1);
    } else {
      currentHole = Math.min(maxHole, Math.max(currentHole, completedHoles(match) + 1));
    }
    persist();
    if (!silent) toast(`Hole ${savedHole} saved.`);
    return true;
  }

  document.getElementById('matchesList').addEventListener('click', e => {
    const loadId = e.target.dataset.loadMatch; const shareId = e.target.dataset.shareMatch; const deleteId = e.target.dataset.deleteMatch;
    if (loadId) { state.activeMatchId = loadId; currentHole = Math.min(getRequestedHoleCount(getMatch(loadId)), Math.max(1, completedHoles(getMatch(loadId)) || 1)); persist(); activateTab('score'); }
    if (shareId) { openPrintScorecard(shareId); }
    if (deleteId && confirm('Delete this match?')) { state.matches = state.matches.filter(m => m.id !== deleteId); if (state.activeMatchId === deleteId) state.activeMatchId = null; persist(); }
  });
  document.getElementById('prevHoleBtn').addEventListener('click', () => { currentHole = Math.max(1, currentHole - 1); renderCurrentMatch(); });
  document.getElementById('nextHoleBtn').addEventListener('click', () => { saveCurrentHole({ advance: true, silent: true }); });
  document.getElementById('scoreboardShareRoundBtn').addEventListener('click', () => { openPrintScorecard(); });
  document.getElementById('saveScoresBtn').addEventListener('click', () => { saveCurrentHole(); });
  document.getElementById('finishRoundBtn').addEventListener('click', () => {
    const match = getActiveMatch(); if (!match) return toast('No active match.');
    finishConfirmArmed = true;
    document.getElementById('confirmFinishRoundBtn').classList.remove('hidden');
    toast('Tap Confirm Finish to lock this round to history.');
  });
  document.getElementById('confirmFinishRoundBtn').addEventListener('click', () => {
    const match = getActiveMatch(); if (!match || !finishConfirmArmed) return;
    match.status = 'complete'; match.completedAt = new Date().toISOString(); state.activeMatchId = null; persist(); toast('Round marked complete.');
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
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}

installHandlers();
renderHoleRows();
loadPlayerEditor(null);
loadCourseEditor(null);
loadTeeEditor(null, null);
loadMatchEditor(null);
renderAll();
