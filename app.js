const STORAGE_KEY = 'the-dye-ledger-v14';
const GAME_LIBRARY = [
  { key: 'nassau', label: 'Nassau' },
  { key: 'individual_match', label: 'Individual Match Play' },
  { key: 'team_match', label: 'Team Match Play' },
  { key: 'team_stroke', label: 'Team Stroke Play' },
  { key: 'skins', label: 'Skins' },
  { key: 'greenies', label: 'Greenies' },
];
let deferredPrompt = null;
let editingPlayerId = null;
let editingCourseId = null;
let editingTeeRef = null;
let editingMatchId = null;
let currentHole = 1;
let finishConfirmArmed = false;

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
function sumYardage(holes) { return holes.reduce((sum, h) => sum + (Number(h.yardage) || 0), 0) || null; }
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
function formatMatchDiff(diff) {
  if (!Number.isFinite(diff) || diff === 0) return 'AS';
  const sign = diff > 0 ? 'Team 1' : 'Team 2';
  return `${sign} ${Math.abs(diff)} up`; // Team 1 perspective
}

function formatGrossNet(score) {
  if (!Number.isFinite(score?.gross)) return '—';
  const netText = Number.isFinite(score?.net) ? ` / net ${score.net}` : '';
  return `${score.gross}${netText}`;
}
function buildRoundShareText(match) {
  const metrics = computeMatchMetrics(match);
  if (!metrics) return `${match?.name || 'Golf round'}

This round is missing valid course or tee data.`;
  const lines = [];
  lines.push(`${match.name || 'Round'} — ${match.date}`);
  lines.push(`${metrics.course.name} · ${metrics.tee.teeName}`);
  lines.push(match.status === 'complete' ? `Completed ${new Date(match.completedAt || Date.now()).toLocaleString()}` : `${metrics.completed}/18 holes complete`);
  lines.push('');

  if (metrics.teams.length === 2) {
    lines.push(`Team Match: ${formatMatchDiff(metrics.matchDiff)}`);
    const front = metrics.teams[0].front === 0 ? 'AS' : (metrics.teams[0].front > 0 ? `Team 1 ${Math.abs(metrics.teams[0].front)} up` : `Team 2 ${Math.abs(metrics.teams[0].front)} up`);
    const back = metrics.teams[0].back === 0 ? 'AS' : (metrics.teams[0].back > 0 ? `Team 1 ${Math.abs(metrics.teams[0].back)} up` : `Team 2 ${Math.abs(metrics.teams[0].back)} up`);
    lines.push(`Front 9: ${front}`);
    lines.push(`Back 9: ${back}`);
    lines.push('');
    lines.push('Team Totals');
    metrics.teams.forEach(team => {
      lines.push(`Team ${team.team} (${team.members.map(m => m.player.name).join(', ')}): gross ${team.grossTotal}, net ${team.netTotal}, to par ${formatSigned(team.toPar)}, net diff ${formatSigned(team.netDiff)}, skins ${team.skins}`);
    });
    lines.push('');
  }

  lines.push('Player Totals');
  metrics.players.slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar).forEach(p => {
    lines.push(`${p.player.name} (T${p.team}): gross ${p.grossTotal || 0}, net ${p.netTotal || 0}, to par ${formatSigned(p.toPar || 0)}, net diff ${formatSigned(p.netDiff || 0)}, skins ${p.skins}`);
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
      ? (h.teamWinner === 1 ? 'Team 1 won hole' : h.teamWinner === 2 ? 'Team 2 won hole' : 'Hole tied')
      : `Low net: ${h.indivWinners.map(id => metrics.players.find(p => p.playerId === id)?.player.name).filter(Boolean).join(', ') || '—'}`;
    lines.push(`H${h.holeNumber}: ${playerBits} — ${result}`);
  });

  return lines.join('\n');
}
async function shareRound(matchId) {
  const match = getMatch(matchId || state.activeMatchId);
  if (!match) return toast('No round selected to share.');
  const text = buildRoundShareText(match);
  const shareData = { title: `${match.name || 'Golf Round'} Scorecard`, text };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      toast('Scorecard ready to send.');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast('Scorecard copied. Paste into Messages or Mail.');
      return;
    }
  } catch {}
  const mailto = `mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(text)}`;
  window.location.href = mailto;
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
  match.status = match.status || 'active';
  match.completedAt = match.completedAt || null;
  match.players = Array.isArray(match.players) ? match.players : [];
  match.players = match.players.map(mp => ({
    playerId: mp.playerId,
    team: Number(mp.team) || 1,
    scores: Array.isArray(mp.scores) && mp.scores.length ? mp.scores.map((s, idx) => ({ holeNumber: idx + 1, gross: Number(s.gross) || null })) : buildEmptyScores(),
  }));
  match.greeniesWinners = match.greeniesWinners && typeof match.greeniesWinners === 'object' ? match.greeniesWinners : {};
  match.momentumGame = match.momentumGame || ((match.selectedGames || []).find(g => g.key === 'nassau')?.key || (match.selectedGames || []).find(g => ['team_match','team_stroke','skins'].includes(g.key))?.key || 'nassau');
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
  return Math.max(0, ...match.players.flatMap(mp => mp.scores.filter(s => s.gross).map(s => s.holeNumber)), 0);
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
    };
  }).filter(x => x.player);

  if (!players.length) return { players: [], teams: [], holeResults: [], completed: 0, statusText: 'No players' };

  const lowPlaying = Math.min(...players.map(p => p.playHdcp));
  const holeResults = tee.holes.map((hole, idx) => {
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
    const totalPar = tee.holes.slice(0, scoredHoles.length).reduce((sum, h) => sum + (Number(h.par) || 0), 0);
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
    const front = holeResults.slice(0, 9).reduce((sum, h) => sum + (h.teamWinner === teamNo ? 1 : h.teamWinner && h.teamWinner !== 0 ? -1 : 0), 0);
    const back = holeResults.slice(9, 18).reduce((sum, h) => sum + (h.teamWinner === teamNo ? 1 : h.teamWinner && h.teamWinner !== 0 ? -1 : 0), 0);
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
  };
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
        ${c.tees.length ? c.tees.map(t => `
          <div class="tee-block">
            <div class="strong">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'}</div>
            <div class="tiny">Par ${t.par} · Rating ${t.rating} · Slope ${t.slope}${t.length ? ` · ${t.length} yds` : ''}</div>
            <div class="tiny">${strokeIndexSummary(t.holes, c)}</div>
            <div class="actions wrap compact-actions top-gap">
              <button class="secondary" data-edit-tee="${c.id}|${t.id}">Edit tee</button>
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
            <div class="tiny">${metrics ? `${metrics.completed}/18 holes completed` : ''}</div>
          </div>
          <div class="actions wrap compact-actions">
            <button class="secondary" data-load-match="${match.id}">${state.activeMatchId === match.id ? 'Loaded' : 'Load'}</button>
            <button class="secondary" data-share-match="${match.id}">Share</button>
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
    return;
  }
  const course = getCourse(match.courseId);
  const tee = getTee(match.courseId, match.teeId);
  const metrics = computeMatchMetrics(match);
  metaEl.textContent = `${match.date} · ${match.name || 'Round'} · ${course?.name || ''} · ${tee?.teeName || ''} · ${metrics?.completed || 0}/18 holes completed`;
  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');
  currentHole = Math.min(18, Math.max(1, currentHole));
  document.getElementById('currentHoleBadge').textContent = `Hole ${currentHole}`;
  const hole = tee?.holes[currentHole - 1];
  const teamText = metrics?.teams?.length === 2 ? `${formatMatchDiff(metrics.matchDiff)} overall` : 'Singles leaderboard';
  document.getElementById('holeSummary').textContent = hole ? `Par ${hole.par || '-'} · ${hole.yardage || '-'} yds · SI ${hole.strokeIndex || '-'} · ${teamText}` : '';
  renderScoreGrid(match, tee, metrics);
  renderGreeniesEntry(match, hole);
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
  wrap.innerHTML = `<div class="card inset-card game-config-card"><div class="section-label">Greenies · Hole ${hole.holeNumber}</div><div class="greenies-list top-gap">${eligible.map(p => `<label class="mini-check"><input type="checkbox" data-greenies-winner="${p.id}" ${winnerId === p.id ? 'checked' : ''} /> ${escapeHtml(p.name)}</label>`).join('') || '<div class="tiny">No greenies participants selected for this match.</div>'}</div><div class="tiny top-gap">Select the closest-to-the-pin winner for this par 3. Payout runs only against selected greenies participants.</div></div>`;
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
        <td>T${p.team}</td>
        <td><input type="number" min="1" max="15" data-score-player="${p.playerId}" value="${gross}" /></td>
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
  return unique.map(key => ({ key, label: GAME_LIBRARY.find(g => g.key === key)?.label || key }));
}
function computeMomentumOutcome(match, metrics, holeResult, gameKey) {
  if (!holeResult?.completed) return 'pending';
  const config = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  if (gameKey === 'team_stroke') {
    const holeTeams = metrics.teams.slice(0, 2).map(team => {
      const entries = holeResult.playerScores.filter(ps => ps.team === team.team);
      if (!entries.length) return { team: team.team, value: null };
      const values = entries.map(e => config.basis === 'gross' ? e.gross : e.net).filter(v => Number.isFinite(v));
      if (!values.length) return { team: team.team, value: null };
      const value = config.scoringMode === 'aggregate' ? values.reduce((a,b)=>a+b,0) : Math.min(...values);
      return { team: team.team, value };
    }).filter(t => Number.isFinite(t.value));
    if (holeTeams.length < 2) return 'tied';
    if (holeTeams[0].value < holeTeams[1].value) return 'team1';
    if (holeTeams[1].value < holeTeams[0].value) return 'team2';
    return 'tied';
  }
  const basis = config.basis === 'gross' ? 'gross' : 'net';
  const teamEntries = [1,2].map(teamNo => {
    const entries = holeResult.playerScores.filter(ps => ps.team === teamNo);
    const values = entries.map(e => e[basis]).filter(v => Number.isFinite(v));
    if (!values.length) return { team: teamNo, value: null };
    return { team: teamNo, value: Math.min(...values) };
  });
  if (!Number.isFinite(teamEntries[0].value) || !Number.isFinite(teamEntries[1].value)) return 'tied';
  if (teamEntries[0].value < teamEntries[1].value) return 'team1';
  if (teamEntries[1].value < teamEntries[0].value) return 'team2';
  return 'tied';
}
function renderLeaderboard() {
  const match = getActiveMatch();
  const empty = document.getElementById('leaderboardEmpty');
  const wrap = document.getElementById('leaderboardWrap');
  const meta = document.getElementById('leaderboardMeta');
  const badge = document.getElementById('leaderboardStatusBadge');
  const playerBody = document.getElementById('playerLeaderboardBody');
  const teamBody = document.getElementById('teamLeaderboardBody');
  const matchStatus = document.getElementById('matchStatusSummary');
  const gamesSummary = document.getElementById('gamesSummary');
  const holeMomentum = document.getElementById('holeMomentum');
  const momentumMeta = document.getElementById('momentumMeta');

  if (!match) {
    empty.classList.remove('hidden');
    wrap.classList.add('hidden');
    meta.textContent = 'No active match.';
    badge.textContent = 'Awaiting match';
    return;
  }

  const metrics = computeMatchMetrics(match);
  if (!metrics) {
    empty.classList.remove('hidden');
    wrap.classList.add('hidden');
    meta.textContent = 'Match needs a valid course and tee.';
    badge.textContent = 'Needs setup';
    return;
  }

  empty.classList.add('hidden');
  wrap.classList.remove('hidden');
  meta.textContent = `${match.name || 'Round'} · ${metrics.course.name} · ${metrics.tee.teeName} · ${metrics.completed}/18 holes complete`;
  badge.textContent = match.status === 'complete' ? 'Complete' : 'Live';

  playerBody.innerHTML = metrics.players.slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar).map(p => `
    <tr>
      <td>${escapeHtml(p.player.name)}</td>
      <td>T${p.team}</td>
      <td>${p.grossTotal || 0}</td>
      <td>${p.netTotal || 0}</td>
      <td>${formatSigned(p.toPar || 0)}</td>
      <td>${formatSigned(p.netDiff || 0)}</td>
      <td>${p.skins}</td>
    </tr>
  `).join('');

  teamBody.innerHTML = metrics.teams.map(t => `
    <tr>
      <td>T${t.team}</td>
      <td>${escapeHtml(t.members.map(m => m.player.name).join(', '))}</td>
      <td>${t.grossTotal}</td>
      <td>${t.netTotal}</td>
      <td>${formatSigned(t.toPar)}</td>
      <td>${formatSigned(t.netDiff)}</td>
      <td>${formatSigned(t.overall)}</td>
    </tr>
  `).join('');

  const frontStatus = metrics.teams.length === 2 ? (metrics.teams[0].front === 0 ? 'AS' : metrics.teams[0].front > 0 ? `Team 1 ${Math.abs(metrics.teams[0].front)} up` : `Team 2 ${Math.abs(metrics.teams[0].front)} up`) : '—';
  const backStatus = metrics.teams.length === 2 ? (metrics.teams[0].back === 0 ? 'AS' : metrics.teams[0].back > 0 ? `Team 1 ${Math.abs(metrics.teams[0].back)} up` : `Team 2 ${Math.abs(metrics.teams[0].back)} up`) : '—';
  const teamMatchCfg = (match.selectedGames || []).find(g => g.key === 'team_match');
  const teamMatchBasis = teamMatchCfg?.basis ? ` (${escapeHtml(String(teamMatchCfg.basis))})` : '';
  matchStatus.innerHTML = `
    <div><strong>Overall team match${teamMatchBasis}:</strong> ${metrics.teams.length === 2 ? formatMatchDiff(metrics.matchDiff) : 'Singles / multi-team mode'}</div>
    <div><strong>Front 9:</strong> ${frontStatus}</div>
    <div><strong>Back 9:</strong> ${backStatus}</div>
    <div><strong>Best player net:</strong> ${metrics.bestPlayerNet ? `${escapeHtml(metrics.bestPlayerNet.player.name)} (${formatSigned(metrics.bestPlayerNet.netDiff)})` : '—'}</div>
  `;
  gamesSummary.innerHTML = buildSelectedGamesSummary(match, metrics);
  const momentumSelect = document.getElementById('momentumGameSelect');
  const options = getMomentumOptions(match);
  if (momentumSelect) {
    momentumSelect.innerHTML = options.map(opt => `<option value="${opt.key}" ${opt.key === match.momentumGame ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    if (!options.find(opt => opt.key === match.momentumGame)) {
      match.momentumGame = options[0]?.key || 'nassau';
      momentumSelect.value = match.momentumGame;
    }
  }
  if (momentumMeta) {
    momentumMeta.textContent = describeMomentumMeta(match, metrics, match.momentumGame || options[0]?.key || 'nassau');
  }
  let running = 0;
  holeMomentum.innerHTML = metrics.holeResults.map(h => {
    const outcome = computeMomentumOutcome(match, metrics, h, match.momentumGame || 'nassau');
    let cls = 'tied';
    let txt = running === 0 ? 'T' : String(running);
    if (outcome === 'team1') { running += 1; cls = 'team1'; txt = running === 0 ? 'T' : String(running); }
    else if (outcome === 'team2') { running -= 1; cls = 'team2'; txt = running === 0 ? 'T' : String(Math.abs(running)); }
    else if (outcome === 'pending') { cls = 'pending'; txt = '•'; }
    else { cls = 'tied'; txt = running === 0 ? 'T' : String(Math.abs(running)); }
    return `<div class="momentum-pill ${cls}">H${h.holeNumber}<span>${txt}</span></div>`;
  }).join('');
}
function describeSkinLeader(players) {
  if (!players.length) return '—';
  const max = Math.max(...players.map(p => p.skins));
  if (max <= 0) return 'None yet';
  const leaders = players.filter(p => p.skins === max).map(p => p.player.name).join(', ');
  return `${escapeHtml(leaders)} (${max})`;
}
function describeTeamSkinLeader(teams) {
  if (!teams.length) return '—';
  const max = Math.max(...teams.map(t => t.skins));
  if (max <= 0) return 'None yet';
  const leaders = teams.filter(t => t.skins === max).map(t => `Team ${t.team}`).join(', ');
  return `${leaders} (${max})`;
}
function describeTeamLabel(match, teamNo, metrics) {
  const name = match.teamNames?.[teamNo - 1] || `Team ${teamNo}`;
  const members = metrics.teams.find(t => t.team === teamNo)?.members?.map(m => m.player.name).join(', ');
  return members ? `${escapeHtml(name)} (${escapeHtml(members)})` : escapeHtml(name);
}

function describeMomentumMeta(match, metrics, gameKey) {
  const cfg = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  const teamOneName = match.teamNames?.[0] || 'Team 1';
  const teamOneMembers = metrics?.teams?.find(t => t.team === 1)?.members?.map(m => m.player.name).join(', ') || '';
  const basis = cfg.basis ? String(cfg.basis) : (gameKey === 'greenies' ? 'event' : 'net');
  const gameLabel = GAME_LIBRARY.find(g => g.key === gameKey)?.label || 'Momentum';
  const memberText = teamOneMembers ? ` · ${teamOneMembers}` : '';
  return `${escapeHtml(gameLabel)} · Team 1: ${escapeHtml(teamOneName)}${memberText} · ${escapeHtml(basis)} basis`;
}
function buildSelectedGamesSummary(match, metrics) {
  const selected = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!selected.length) {
    return `<div><strong>Round pace:</strong> ${metrics.completed ? `${Math.round((metrics.completed / 18) * 100)}% complete` : 'Not started'}</div>`;
  }
  const frontStatus = metrics.teams.length === 2 ? (metrics.teams[0].front === 0 ? 'AS' : metrics.teams[0].front > 0 ? `${describeTeamLabel(match, 1, metrics)} ${Math.abs(metrics.teams[0].front)} up` : `${describeTeamLabel(match, 2, metrics)} ${Math.abs(metrics.teams[0].front)} up`) : '—';
  const backStatus = metrics.teams.length === 2 ? (metrics.teams[0].back === 0 ? 'AS' : metrics.teams[0].back > 0 ? `${describeTeamLabel(match, 1, metrics)} ${Math.abs(metrics.teams[0].back)} up` : `${describeTeamLabel(match, 2, metrics)} ${Math.abs(metrics.teams[0].back)} up`) : '—';
  const overallTeam = metrics.teams.length === 2 ? (metrics.matchDiff === 0 ? 'AS' : metrics.matchDiff > 0 ? `${describeTeamLabel(match, 1, metrics)} ${Math.abs(metrics.matchDiff)} up` : `${describeTeamLabel(match, 2, metrics)} ${Math.abs(metrics.matchDiff)} up`) : '—';

  const gameLines = selected.map(cfg => {
    switch (cfg.key) {
      case 'nassau':
        return `<div><strong>Nassau (${escapeHtml(String(cfg.basis || 'net'))}):</strong> Front ${frontStatus} · Back ${backStatus} · 18 ${overallTeam}</div>`;
      case 'individual_match':
        return `<div><strong>Individual Match Play (${escapeHtml(String(cfg.basis || 'net'))}):</strong> Leader ${metrics.bestPlayerNet ? `${escapeHtml(metrics.bestPlayerNet.player.name)} (${formatSigned(metrics.bestPlayerNet.netDiff)})` : '—'}</div>`;
      case 'team_match':
        return `<div><strong>Team Match Play (${escapeHtml(String(cfg.basis || 'net'))}):</strong> ${overallTeam}</div>`;
      case 'team_stroke':
        return `<div><strong>Team Stroke Play (${escapeHtml(String(cfg.basis || 'net'))}, ${cfg.scoringMode === 'aggregate' ? 'aggregate' : 'best ball'}):</strong> ${metrics.bestTeam ? `${describeTeamLabel(match, metrics.bestTeam.team, metrics)} (${formatSigned(metrics.bestTeam.netDiff)})` : '—'}</div>`;
      case 'skins':
        return cfg.skinsType === 'team'
          ? `<div><strong>Team Skins (${escapeHtml(String(cfg.basis || 'net'))}):</strong> ${describeTeamSkinLeader(metrics.teams)}</div>`
          : `<div><strong>Individual Skins (${escapeHtml(String(cfg.basis || 'net'))}):</strong> ${describeSkinLeader(metrics.players)}</div>`;
      case 'greenies': {
        const wins = Object.values(match.greeniesWinners || {}).reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
        const leaders = Object.entries(wins).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,n]) => `${escapeHtml(getPlayer(id)?.name || 'Unknown')} (${n})`).join(', ');
        const byHole = Object.entries(match.greeniesWinners || {})
          .sort((a,b)=>Number(a[0]) - Number(b[0]))
          .map(([hole,id]) => `H${hole} ${escapeHtml(getPlayer(id)?.name || 'Unknown')}`)
          .join(' · ');
        return `<div><strong>Greenies:</strong> ${(cfg.participants || []).length || 0} participant(s) · leaders ${leaders || 'None yet'}${byHole ? `<br /><span class="tiny">Winners by par 3: ${byHole}</span>` : ''}</div>`;
      }
      default:
        return '';
    }
  }).filter(Boolean);
  gameLines.push(`<div><strong>Round pace:</strong> ${metrics.completed ? `${Math.round((metrics.completed / 18) * 100)}% complete` : 'Not started'}</div>`);
  return gameLines.join('');
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
  teeSelect.innerHTML = !course ? '<option value="">Select tee</option>' : `<option value="">Select tee</option>${course.tees.map(t => `<option value="${t.id}">${escapeHtml(t.teeName)} · ${t.rating}/${t.slope}</option>`).join('')}`;
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
  teeSelect.innerHTML = !course ? '<option value="">Select tee</option>' : `<option value="">Select tee</option>${course.tees.map(t => `<option value="${t.id}" ${selectedTeeId === t.id ? 'selected' : ''}>${escapeHtml(t.teeName)} · ${t.rating}/${t.slope}</option>`).join('')}`;
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
      <span>${game.label}</span>
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
      <div class="game-config-header"><div class="section-label">${game.label}</div><div class="tiny">Configure basis and stakes</div></div>
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
    msg.textContent = active ? `${active.name || 'Active match'} · ${completedHoles(active)}/18 holes entered.` : 'Build a new match, or edit the active one.';
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
    const courseSelect = document.getElementById('teeCourseSelect');
    if (courseId) {
      courseSelect.value = courseId;
      form.elements.namedItem('courseId').value = courseId;
    }
    renderHoleRows(buildTeeHoleRows(courseId));
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
  form.elements.namedItem('rating').value = tee.rating || '';
  form.elements.namedItem('slope').value = tee.slope || '';
  renderHoleRows(buildTeeHoleRows(courseId, tee.holes));
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
    let holes = collectHolesFromGrid();
    const courseTemplate = getCourseStrokeTemplate(course);
    const enteredTemplate = extractStrokeTemplate(holes);
    if (!enteredTemplate && courseTemplate) holes = applyStrokeTemplate(holes, courseTemplate);
    const strokeTotal = holes.reduce((sum, h) => sum + (Number(h.strokeIndex) || 0), 0);
    if (holes.some(h => !Number.isFinite(h.strokeIndex) || !h.strokeIndex)) return toast('Enter stroke indexes for all 18 holes.');
    if (strokeTotal !== 171) return toast('Stroke indexes must total 171 before saving.');
    const tee = {
      id: editingTeeRef?.teeId || uid(),
      courseName: course.name,
      teeName: String(fd.get('teeName') || '').trim(),
      gender: String(fd.get('gender') || 'M'),
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
    updateTeeStrokeTemplateHint(e.target.value);
  });
  document.getElementById('loadTemplate18Btn').addEventListener('click', () => { renderHoleRows(buildTeeHoleRows(document.getElementById('teeCourseSelect').value)); toast('18-hole template loaded.'); });
  document.getElementById('recalcTotalsBtn').addEventListener('click', fillTotalsFromHoles);
  document.getElementById('coursesList').addEventListener('click', e => {
    const editCourse = e.target.dataset.editCourse; const deleteCourse = e.target.dataset.deleteCourse; const newTee = e.target.dataset.newTee; const editTee = e.target.dataset.editTee; const deleteTee = e.target.dataset.deleteTee;
    if (editCourse) loadCourseEditor(editCourse);
    if (deleteCourse && confirm('Delete this course and all tees?')) { state.courses = state.courses.filter(c => c.id !== deleteCourse); state.matches = state.matches.filter(m => m.courseId !== deleteCourse); if (state.activeMatchId && !getActiveMatch()) state.activeMatchId = null; persist(); }
    if (newTee) loadTeeEditor(newTee, null);
    if (editTee) { const [courseId, teeId] = editTee.split('|'); loadTeeEditor(courseId, teeId); }
    if (deleteTee) {
      const [courseId, teeId] = deleteTee.split('|');
      const course = getCourse(courseId); if (!course) return;
      if (confirm('Delete this tee?')) { course.tees = course.tees.filter(t => t.id !== teeId); state.matches = state.matches.filter(m => m.teeId !== teeId); if (state.activeMatchId && !getActiveMatch()) state.activeMatchId = null; persist(); }
    }
  });

  document.getElementById('teeCourseSelect').addEventListener('change', e => {
    if (!editingTeeRef) {
      renderHoleRows(buildTeeHoleRows(e.target.value));
    }
    updateTeeStrokeTemplateHint(e.target.value);
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

  document.getElementById('matchCourseSelect').addEventListener('change', e => populateMatchTees(e.target.value));
  document.getElementById('teamCountSelect').addEventListener('change', () => {
    const teamCount = Number(document.getElementById('teamCountSelect').value || 2);
    const currentSelections = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value }));
    renderTeamNameInputs(teamCount, Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value));
    populateMatchPlayerPicker(currentSelections);
    renderGamesPicker(collectSelectedGames());
  });
  document.getElementById('playersPerTeamSelect').addEventListener('change', () => { const currentSelections = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value })); populateMatchPlayerPicker(currentSelections); renderGamesPicker(collectSelectedGames()); });
  document.getElementById('teamNamesGrid').addEventListener('input', () => { const currentSelections = Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value })); populateMatchPlayerPicker(currentSelections); renderGamesPicker(collectSelectedGames()); });
  document.getElementById('matchPlayersPicker').addEventListener('change', e => {
    if (e.target.matches('[data-player-slot]')) { populateMatchPlayerPicker(Array.from(document.querySelectorAll('[data-player-slot]')).map(el => ({ playerId: el.value }))); renderGamesPicker(collectSelectedGames()); }
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
  document.getElementById('leaderboard').addEventListener('change', e => {
    if (e.target.id === 'momentumGameSelect') {
      const match = getActiveMatch();
      if (!match) return;
      match.momentumGame = e.target.value;
      persist();
      return;
    }
  });
  document.getElementById('score').addEventListener('change', e => {
    if (e.target.matches('[data-greenies-winner]')) {
      document.querySelectorAll('[data-greenies-winner]').forEach(el => { if (el !== e.target) el.checked = false; });
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
      teamCount,
      playersPerTeam,
      teamNames,
      selectedGames,
      status: existing?.status || 'active',
      completedAt: existing?.completedAt || null,
      players: selectedPlayers.map(sp => {
        const old = existing?.players.find(op => op.playerId === sp.playerId);
        return old ? { ...old, team: sp.team } : { playerId: sp.playerId, team: sp.team, scores: buildEmptyScores() };
      }),
      greeniesWinners: existing?.greeniesWinners || {},
      momentumGame: existing?.momentumGame || (selectedGames.find(g => g.key === 'nassau')?.key || selectedGames.find(g => ['team_match','team_stroke'].includes(g.key))?.key || 'nassau'),
    };
    normalizeMatch(match);
    if (!match.courseId || !match.teeId) return toast('Select a course and tee.');
    if (editingMatchId) state.matches = state.matches.map(m => m.id === editingMatchId ? match : m); else state.matches.push(match);
    state.activeMatchId = match.id;
    currentHole = Math.max(1, completedHoles(match) || 1);
    persist({ skipRender: true });
    loadMatchEditor(null);
    renderAll();
    activateTab('score');
    toast(editingMatchId ? 'Match updated.' : 'Match created and loaded.');
    } catch (err) { console.error(err); toast('Could not create match. Please try again.'); }
  });
  document.getElementById('cancelMatchEditBtn').addEventListener('click', () => { loadMatchEditor(null); renderMatchSetupState(); });
  document.getElementById('matchesList').addEventListener('click', e => {
    const loadId = e.target.dataset.loadMatch; const shareId = e.target.dataset.shareMatch; const deleteId = e.target.dataset.deleteMatch;
    if (loadId) { state.activeMatchId = loadId; currentHole = Math.max(1, completedHoles(getMatch(loadId)) || 1); persist(); activateTab('score'); }
    if (shareId) { shareRound(shareId); }
    if (deleteId && confirm('Delete this match?')) { state.matches = state.matches.filter(m => m.id !== deleteId); if (state.activeMatchId === deleteId) state.activeMatchId = null; persist(); }
  });
  document.getElementById('prevHoleBtn').addEventListener('click', () => { currentHole = Math.max(1, currentHole - 1); renderCurrentMatch(); });
  document.getElementById('nextHoleBtn').addEventListener('click', () => { currentHole = Math.min(18, currentHole + 1); renderCurrentMatch(); });
  document.getElementById('shareRoundBtn').addEventListener('click', () => { shareRound(); });
  document.getElementById('saveScoresBtn').addEventListener('click', () => {
    const match = getActiveMatch(); if (!match) return;
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
    currentHole = Math.min(18, Math.max(currentHole, completedHoles(match) + 1));
    persist(); toast(`Hole ${currentHole <= 18 ? currentHole - 1 || 1 : 18} saved.`);
  });
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
