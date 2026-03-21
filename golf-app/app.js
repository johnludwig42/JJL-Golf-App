const SAMPLE_PLAYERS = [
  { id: crypto.randomUUID(), name: 'John', handicap_index: 12.4 },
  { id: crypto.randomUUID(), name: 'Brother', handicap_index: 8.7 },
  { id: crypto.randomUUID(), name: 'Mike', handicap_index: 14.2 },
  { id: crypto.randomUUID(), name: 'Steve', handicap_index: 10.1 }
];

const SAMPLE_COURSES = [
  {
    id: crypto.randomUUID(),
    name: 'Chatham Hills',
    tee_name: 'Member',
    par: 72,
    rating: 72.9,
    slope: 138,
    hole_ranks: [9,5,13,1,17,7,3,15,11,8,2,16,6,12,18,10,4,14]
  },
  {
    id: crypto.randomUUID(),
    name: 'Pebble Creek Golf Club',
    tee_name: 'White',
    par: 72,
    rating: 70.8,
    slope: 128,
    hole_ranks: [11,5,17,3,13,9,1,15,7,10,4,18,2,14,8,12,6,16]
  }
];

const emptyMatch = () => ({
  id: null,
  name: '',
  course_id: null,
  hole_count: 18,
  allowance: 100,
  team_mode: 'auto',
  games: { individualMatch: true, teamMatch: true, individualSkins: false, teamSkins: false, lowNet: false },
  players: [],
  scores: {},
  current_hole: 1,
  status: 'draft',
  created_at: null,
  completed_at: null
});

const state = {
  supabase: null,
  backendMode: 'local',
  deferredPrompt: null,
  players: loadLocal('gmb_players', SAMPLE_PLAYERS),
  courses: loadLocal('gmb_courses', SAMPLE_COURSES),
  matches: loadLocal('gmb_matches', []),
  currentMatch: loadLocal('gmb_current_match', emptyMatch()),
  history: [],
  activeTab: 'roundTab'
};

const el = id => document.getElementById(id);
const qsa = sel => Array.from(document.querySelectorAll(sel));

init();

async function init() {
  setupSupabase();
  wireTabs();
  wireActions();
  updateBackendLabels();
  await refreshAllData();
  renderAll();
  setupInstallPrompt();
  registerServiceWorker();
}

function setupSupabase() {
  const cfg = window.GOLF_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase) {
    state.supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    state.backendMode = 'supabase';
  }
}

function updateBackendLabels() {
  el('backendMode').textContent = state.backendMode === 'supabase' ? 'Supabase shared backend' : 'Local only';
  const badge = el('syncBadge');
  badge.textContent = state.backendMode === 'supabase' ? 'Shared mode' : 'Local mode';
  badge.className = `pill ${state.backendMode === 'supabase' ? '' : 'muted'}`;
}

function wireTabs() {
  qsa('.tab').forEach(btn => btn.addEventListener('click', () => {
    qsa('.tab').forEach(t => t.classList.remove('active'));
    qsa('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(btn.dataset.tab).classList.add('active');
    state.activeTab = btn.dataset.tab;
  }));
}

function wireActions() {
  el('addPlayerBtn').addEventListener('click', () => openPlayerDialog());
  el('savePlayerBtn').addEventListener('click', savePlayerFromDialog);
  el('addCourseBtn').addEventListener('click', () => openCourseDialog());
  el('saveCourseBtn').addEventListener('click', saveCourseFromDialog);
  el('newMatchBtn').addEventListener('click', openMatchDialog);
  el('createMatchBtn').addEventListener('click', createMatchFromDialog);
  el('saveDraftBtn').addEventListener('click', async () => {
    await saveCurrentMatch();
    toast('Match saved.');
  });
  el('prevHoleBtn').addEventListener('click', () => moveHole(-1));
  el('nextHoleBtn').addEventListener('click', () => moveHole(1));
  el('completeRoundBtn').addEventListener('click', () => el('completeDialog').showModal());
  el('confirmCompleteBtn').addEventListener('click', completeCurrentRound);
  el('refreshHistoryBtn').addEventListener('click', async () => {
    await refreshHistory();
    renderHistory();
  });

  el('playersList').addEventListener('click', async e => {
    const editId = e.target.dataset.edit;
    const deleteId = e.target.dataset.delete;
    if (editId) {
      const player = state.players.find(p => p.id === editId);
      openPlayerDialog(player);
    }
    if (deleteId) {
      if (!confirm('Delete this player?')) return;
      await deletePlayer(deleteId);
    }
  });

  el('coursesList').addEventListener('click', async e => {
    const editId = e.target.dataset.editCourse;
    const deleteId = e.target.dataset.deleteCourse;
    if (editId) {
      const course = state.courses.find(c => c.id === editId);
      openCourseDialog(course);
    }
    if (deleteId) {
      if (!confirm('Delete this course?')) return;
      await deleteCourse(deleteId);
    }
  });

  el('historyList').addEventListener('click', e => {
    const openId = e.target.dataset.openMatch;
    if (!openId) return;
    const match = state.history.find(m => m.id === openId) || state.matches.find(m => m.id === openId);
    if (match) {
      state.currentMatch = structuredClone(match);
      saveLocal('gmb_current_match', state.currentMatch);
      renderRound();
      qsa('.tab').find(t => t.dataset.tab === 'roundTab')?.click();
    }
  });
}

async function refreshAllData() {
  if (state.backendMode === 'supabase') {
    await Promise.all([refreshPlayers(), refreshCourses(), refreshMatches(), refreshHistory()]);
  } else {
    state.history = state.matches.filter(m => m.status === 'complete').sort(byDateDesc);
  }
}

async function refreshPlayers() {
  if (state.backendMode !== 'supabase') return;
  const { data, error } = await state.supabase.from('players').select('*').order('name');
  if (!error && data) {
    state.players = data;
    saveLocal('gmb_players', state.players);
  }
}

async function refreshCourses() {
  if (state.backendMode !== 'supabase') return;
  const { data, error } = await state.supabase.from('courses').select('*').order('name');
  if (!error && data) {
    state.courses = data.map(c => ({ ...c, hole_ranks: ensureNumberArray(c.hole_ranks) }));
    saveLocal('gmb_courses', state.courses);
  }
}

async function refreshMatches() {
  if (state.backendMode !== 'supabase') return;
  const { data, error } = await state.supabase.from('matches').select('*').neq('status', 'complete').order('updated_at', { ascending: false });
  if (!error && data) {
    state.matches = data;
    saveLocal('gmb_matches', state.matches);
    if (state.currentMatch?.id) {
      const updated = data.find(m => m.id === state.currentMatch.id);
      if (updated) state.currentMatch = updated;
    }
  }
}

async function refreshHistory() {
  if (state.backendMode === 'supabase') {
    const { data, error } = await state.supabase.from('matches').select('*').eq('status', 'complete').order('completed_at', { ascending: false });
    if (!error && data) state.history = data;
  } else {
    state.history = state.matches.filter(m => m.status === 'complete').sort(byDateDesc);
  }
}

function renderAll() {
  renderPlayers();
  renderCourses();
  renderRound();
  renderHistory();
}

function renderPlayers() {
  const wrap = el('playersList');
  wrap.innerHTML = state.players.length ? state.players.map(player => `
    <div class="player-row">
      <div class="player-main">
        <strong>${escapeHtml(player.name)}</strong>
        <span>Handicap Index: ${Number(player.handicap_index).toFixed(1)}</span>
      </div>
      <button class="secondary" data-edit="${player.id}">Edit</button>
      <button data-delete="${player.id}">Delete</button>
    </div>
  `).join('') : '<div class="muted">No players yet.</div>';
}

function renderCourses() {
  const wrap = el('coursesList');
  wrap.innerHTML = state.courses.length ? state.courses.map(course => `
    <div class="course-row">
      <div>
        <strong>${escapeHtml(course.name)} • ${escapeHtml(course.tee_name)}</strong>
        <span class="muted">Par ${course.par} • Rating ${course.rating} • Slope ${course.slope}</span>
      </div>
      <button class="secondary" data-edit-course="${course.id}">Edit</button>
      <button data-delete-course="${course.id}">Delete</button>
    </div>
  `).join('') : '<div class="muted">No courses yet.</div>';
}

function renderRound() {
  const match = state.currentMatch;
  if (!match?.players?.length) {
    el('matchSummary').textContent = 'No match loaded yet.';
    el('holeEntry').innerHTML = 'No active match.';
    el('liveStatus').innerHTML = 'Create a match to see live game status.';
    return;
  }
  const course = state.courses.find(c => c.id === match.course_id);
  const scoreboard = buildScoreboard(match, course);
  const playerSummary = scoreboard.players.map(p => `${p.name} (${p.teamLabel}) CH ${p.courseHandicap} / PH ${p.playingHandicap}`).join(' • ');
  el('matchSummary').innerHTML = `
    <strong>${escapeHtml(match.name || 'Untitled Match')}</strong><br>
    <span class="muted">${escapeHtml(course?.name || 'Course')} • ${escapeHtml(course?.tee_name || '')} • ${match.hole_count} holes • ${match.status}</span><br>
    <span class="muted">${playerSummary}</span>
  `;

  renderHoleEntry(scoreboard);
  renderLiveStatus(scoreboard);
}

function renderHoleEntry(scoreboard) {
  const match = scoreboard.match;
  const course = scoreboard.course;
  const holeIdx = Math.max(0, Math.min((match.current_hole || 1) - 1, match.hole_count - 1));
  const holeNo = holeIdx + 1;
  const rows = scoreboard.players.map(p => {
    const gross = match.scores?.[p.id]?.[holeIdx] ?? '';
    const strokes = p.holeStrokes[holeIdx] || 0;
    const net = gross === '' ? '—' : Number(gross) - strokes;
    return `
      <div class="score-row">
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          <div class="muted">Gets ${strokes} on this hole • Team ${escapeHtml(p.teamLabel)}</div>
        </div>
        <input type="number" min="1" max="20" value="${gross}" data-score-player="${p.id}" data-hole-index="${holeIdx}" />
        <div class="muted">Net: ${net}</div>
      </div>
    `;
  }).join('');

  el('holeEntry').innerHTML = `
    <div class="row-spread">
      <div>
        <strong>Hole ${holeNo}</strong><br>
        <span class="muted">Handicap ${course?.hole_ranks?.[holeIdx] ?? '—'}</span>
      </div>
      <span class="pill">${allScoresEnteredForHole(match, scoreboard.players, holeIdx) ? 'Complete' : 'In progress'}</span>
    </div>
    <div class="stack">${rows}</div>
  `;

  el('holeEntry').querySelectorAll('input[data-score-player]').forEach(input => {
    input.addEventListener('change', async e => {
      const playerId = e.target.dataset.scorePlayer;
      const holeIndex = Number(e.target.dataset.holeIndex);
      const value = e.target.value === '' ? '' : Number(e.target.value);
      if (!state.currentMatch.scores[playerId]) state.currentMatch.scores[playerId] = Array(state.currentMatch.hole_count).fill('');
      state.currentMatch.scores[playerId][holeIndex] = value;
      saveLocal('gmb_current_match', state.currentMatch);
      await saveCurrentMatch();
      renderRound();
    });
  });
}

function renderLiveStatus(scoreboard) {
  const status = computeGameStatus(scoreboard);
  const gameCards = [];

  if (scoreboard.match.games.individualMatch) {
    gameCards.push(`
      <div class="status-card">
        <strong>Individual Match Play</strong>
        <div class="muted">${escapeHtml(status.individualMatch.summary)}</div>
        <div class="muted">Front: ${escapeHtml(status.individualMatch.front)} • Back: ${escapeHtml(status.individualMatch.back)} • Overall: ${escapeHtml(status.individualMatch.overall)}</div>
      </div>
    `);
  }
  if (scoreboard.match.games.teamMatch) {
    gameCards.push(`
      <div class="status-card">
        <strong>Team Match Play</strong>
        <div class="muted">${escapeHtml(status.teamMatch.summary)}</div>
        <div class="muted">Front: ${escapeHtml(status.teamMatch.front)} • Back: ${escapeHtml(status.teamMatch.back)} • Overall: ${escapeHtml(status.teamMatch.overall)}</div>
      </div>
    `);
  }
  if (scoreboard.match.games.individualSkins) {
    gameCards.push(`
      <div class="status-card">
        <strong>Individual Skins</strong>
        <div class="muted">${escapeHtml(status.individualSkins)}</div>
      </div>
    `);
  }
  if (scoreboard.match.games.teamSkins) {
    gameCards.push(`
      <div class="status-card">
        <strong>Team Skins</strong>
        <div class="muted">${escapeHtml(status.teamSkins)}</div>
      </div>
    `);
  }
  if (scoreboard.match.games.lowNet) {
    gameCards.push(`
      <div class="status-card">
        <strong>Low Net / Hole</strong>
        <div class="muted">${escapeHtml(status.lowNet)}</div>
      </div>
    `);
  }

  const table = `
    <table class="results-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Team</th>
          <th>Index</th>
          <th>Course</th>
          <th>Playing</th>
          <th>Gets</th>
          <th>Gross</th>
          <th>Net</th>
        </tr>
      </thead>
      <tbody>
        ${scoreboard.players.map(p => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.teamLabel)}</td>
            <td>${Number(p.handicap_index).toFixed(1)}</td>
            <td>${p.courseHandicap}</td>
            <td>${p.playingHandicap}</td>
            <td>${p.strokesReceived}</td>
            <td>${sumFilled(matchScoresForPlayer(scoreboard.match, p.id))}</td>
            <td>${sumNetForPlayer(scoreboard.match, p)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const holes = Array.from({ length: scoreboard.match.hole_count }, (_, i) => {
    const winners = status.holeLeaders[i] || [];
    return `
      <div class="hole-card">
        <strong>Hole ${i + 1}</strong><br>
        <span class="muted">Hdcp ${scoreboard.course.hole_ranks[i]}</span>
        <div class="muted">${winners.length ? winners.map(escapeHtml).join(', ') : 'No winner yet'}</div>
      </div>
    `;
  }).join('');

  el('liveStatus').innerHTML = `<div class="card-grid">${gameCards.join('')}</div>${table}<div class="hole-grid">${holes}</div>`;
}

function renderHistory() {
  const wrap = el('historyList');
  wrap.innerHTML = state.history.length ? state.history.map(match => {
    const course = state.courses.find(c => c.id === match.course_id);
    const players = (match.players || []).map(p => p.name).join(', ');
    return `
      <div class="history-row">
        <div>
          <strong>${escapeHtml(match.name)}</strong>
          <div class="muted">${escapeHtml(course?.name || 'Course')} • ${players}</div>
          <div class="muted">Completed ${formatDate(match.completed_at || match.updated_at || match.created_at)}</div>
        </div>
        <span class="pill">${match.hole_count} holes</span>
        <button class="secondary" data-open-match="${match.id}">Open</button>
      </div>
    `;
  }).join('') : '<div class="muted">No completed rounds yet.</div>';
}

function openPlayerDialog(player) {
  el('playerDialogTitle').textContent = player ? 'Edit Player' : 'Add Player';
  el('playerId').value = player?.id || '';
  el('playerName').value = player?.name || '';
  el('playerIndex').value = player?.handicap_index ?? '';
  el('playerDialog').showModal();
}

async function savePlayerFromDialog(e) {
  e.preventDefault();
  const id = el('playerId').value;
  const player = {
    id: id || crypto.randomUUID(),
    name: el('playerName').value.trim(),
    handicap_index: Number(el('playerIndex').value)
  };
  if (!player.name || Number.isNaN(player.handicap_index)) return;
  if (state.backendMode === 'supabase') {
    const { error } = await state.supabase.from('players').upsert(player);
    if (error) return alert(error.message);
    await refreshPlayers();
  } else {
    upsertLocalArray('gmb_players', state.players, player);
  }
  el('playerDialog').close();
  renderPlayers();
}

async function deletePlayer(id) {
  if (state.backendMode === 'supabase') {
    const { error } = await state.supabase.from('players').delete().eq('id', id);
    if (error) return alert(error.message);
    await refreshPlayers();
  } else {
    state.players = state.players.filter(p => p.id !== id);
    saveLocal('gmb_players', state.players);
  }
  renderPlayers();
}

function openCourseDialog(course) {
  el('courseDialogTitle').textContent = course ? 'Edit Course' : 'Add Course';
  el('courseId').value = course?.id || '';
  el('courseName').value = course?.name || '';
  el('teeName').value = course?.tee_name || '';
  el('par').value = course?.par ?? 72;
  el('rating').value = course?.rating ?? 72.0;
  el('slope').value = course?.slope ?? 125;
  el('holeRanks').value = (course?.hole_ranks || []).join(',');
  el('courseDialog').showModal();
}

async function saveCourseFromDialog(e) {
  e.preventDefault();
  const holeRanks = el('holeRanks').value.split(',').map(v => Number(v.trim())).filter(v => !Number.isNaN(v));
  if (holeRanks.length !== 18) return alert('Please enter exactly 18 hole handicap rankings.');
  const course = {
    id: el('courseId').value || crypto.randomUUID(),
    name: el('courseName').value.trim(),
    tee_name: el('teeName').value.trim(),
    par: Number(el('par').value),
    rating: Number(el('rating').value),
    slope: Number(el('slope').value),
    hole_ranks: holeRanks
  };
  if (!course.name || !course.tee_name) return;
  if (state.backendMode === 'supabase') {
    const { error } = await state.supabase.from('courses').upsert(course);
    if (error) return alert(error.message);
    await refreshCourses();
  } else {
    upsertLocalArray('gmb_courses', state.courses, course);
  }
  el('courseDialog').close();
  renderCourses();
}

async function deleteCourse(id) {
  if (state.backendMode === 'supabase') {
    const { error } = await state.supabase.from('courses').delete().eq('id', id);
    if (error) return alert(error.message);
    await refreshCourses();
  } else {
    state.courses = state.courses.filter(c => c.id !== id);
    saveLocal('gmb_courses', state.courses);
  }
  renderCourses();
}

function openMatchDialog() {
  if (state.players.length < 2) return alert('Add at least 2 players first.');
  if (state.courses.length < 1) return alert('Add at least 1 course first.');
  el('matchName').value = '';
  const courseSelect = el('matchCourseSelect');
  courseSelect.innerHTML = state.courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)} • ${escapeHtml(c.tee_name)}</option>`).join('');
  const teeSelect = el('matchTeeSelect');
  teeSelect.innerHTML = '<option value="same">Use selected course/tee above</option>';
  renderMatchPlayersPicker();
  el('matchDialog').showModal();
}

function renderMatchPlayersPicker() {
  const wrap = el('matchPlayersPicker');
  wrap.innerHTML = state.players.map((player, idx) => `
    <div class="picker-row">
      <label class="checkbox"><input type="checkbox" data-pick-player="${player.id}" ${idx < 4 ? 'checked' : ''}/> ${escapeHtml(player.name)} (${Number(player.handicap_index).toFixed(1)})</label>
      <label>Team
        <select data-team-player="${player.id}">
          <option value="A" ${idx % 2 === 0 ? 'selected' : ''}>A</option>
          <option value="B" ${idx % 2 === 1 ? 'selected' : ''}>B</option>
          <option value="C">C</option>
          <option value="D">D</option>
          <option value="E">E</option>
          <option value="F">F</option>
        </select>
      </label>
      <label>Role
        <select data-role-player="${player.id}">
          <option value="player">Player</option>
        </select>
      </label>
    </div>
  `).join('');
}

async function createMatchFromDialog(e) {
  e.preventDefault();
  const selectedIds = qsa('[data-pick-player]:checked').map(x => x.dataset.pickPlayer).slice(0, 6);
  if (selectedIds.length < 2) return alert('Choose between 2 and 6 players.');
  const selectedPlayers = selectedIds.map(id => {
    const player = state.players.find(p => p.id === id);
    return {
      id: player.id,
      name: player.name,
      handicap_index: player.handicap_index,
      team: el(`matchPlayersPicker`).querySelector(`[data-team-player="${id}"]`).value
    };
  });

  const match = {
    id: crypto.randomUUID(),
    name: el('matchName').value.trim() || `Match ${new Date().toLocaleDateString()}`,
    course_id: el('matchCourseSelect').value,
    hole_count: Number(el('matchHoleCount').value),
    allowance: Number(el('matchAllowance').value),
    team_mode: el('matchTeamMode').value,
    games: {
      individualMatch: el('gameIndividualMatch').checked,
      teamMatch: el('gameTeamMatch').checked,
      individualSkins: el('gameIndividualSkins').checked,
      teamSkins: el('gameTeamSkins').checked,
      lowNet: el('gameLowNet').checked
    },
    players: selectedPlayers,
    scores: Object.fromEntries(selectedPlayers.map(p => [p.id, Array(Number(el('matchHoleCount').value)).fill('')])),
    current_hole: 1,
    status: 'active',
    created_at: new Date().toISOString(),
    completed_at: null
  };

  state.currentMatch = match;
  await saveCurrentMatch(true);
  el('matchDialog').close();
  renderRound();
  await refreshHistory();
  renderHistory();
}

async function saveCurrentMatch(isNew = false) {
  const match = state.currentMatch;
  if (!match?.players?.length) return;
  saveLocal('gmb_current_match', match);
  if (state.backendMode === 'supabase') {
    const payload = { ...match };
    const { error } = await state.supabase.from('matches').upsert(payload);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    if (isNew) await refreshMatches();
  } else {
    upsertLocalArray('gmb_matches', state.matches, match);
  }
}

function moveHole(delta) {
  if (!state.currentMatch?.players?.length) return;
  state.currentMatch.current_hole = Math.max(1, Math.min(state.currentMatch.hole_count, (state.currentMatch.current_hole || 1) + delta));
  saveLocal('gmb_current_match', state.currentMatch);
  renderRound();
}

async function completeCurrentRound(e) {
  e.preventDefault();
  if (!el('completeConfirm1').checked || !el('completeConfirm2').checked) {
    return alert('Please check both confirmations.');
  }
  if (!state.currentMatch?.players?.length) return;
  state.currentMatch.status = 'complete';
  state.currentMatch.completed_at = new Date().toISOString();
  await saveCurrentMatch();
  if (state.backendMode === 'supabase') {
    await refreshMatches();
    await refreshHistory();
  } else {
    upsertLocalArray('gmb_matches', state.matches, state.currentMatch);
    state.history = state.matches.filter(m => m.status === 'complete').sort(byDateDesc);
  }
  el('completeDialog').close();
  el('completeConfirm1').checked = false;
  el('completeConfirm2').checked = false;
  const completed = structuredClone(state.currentMatch);
  state.currentMatch = emptyMatch();
  saveLocal('gmb_current_match', state.currentMatch);
  renderRound();
  renderHistory();
  toast(`Round completed: ${completed.name}`);
}

function buildScoreboard(match, course) {
  const players = match.players.map(player => {
    const courseHandicap = calcCourseHandicap(Number(player.handicap_index), course, match.hole_count);
    const playingHandicap = calcPlayingHandicap(courseHandicap, match.allowance);
    return {
      ...player,
      courseHandicap,
      playingHandicap,
      teamLabel: teamLabel(player.team)
    };
  });
  const low = Math.min(...players.map(p => p.playingHandicap));
  players.forEach(p => {
    p.strokesReceived = Math.max(0, p.playingHandicap - low);
    p.holeStrokes = allocationForPlayer(p.strokesReceived, course.hole_ranks, match.hole_count);
  });
  return { match, course, players };
}

function computeGameStatus(scoreboard) {
  const { match, players } = scoreboard;
  const holeLeaders = [];
  const pairSummary = computeIndividualMatch(players, match);
  const teamSummary = computeTeamMatch(players, match);
  const individualSkins = computeSkins(players, match, false, holeLeaders);
  const teamSkins = computeSkins(players, match, true, holeLeaders);
  const lowNet = computeLowNet(players, match, holeLeaders);
  return {
    individualMatch: pairSummary,
    teamMatch: teamSummary,
    individualSkins,
    teamSkins,
    lowNet,
    holeLeaders
  };
}

function computeIndividualMatch(players, match) {
  const pairs = allPairs(players);
  const summaries = pairs.map(([a,b]) => {
    const front = matchSegmentStatus(match, [a,b], 0, Math.min(9, match.hole_count), false);
    const back = match.hole_count > 9 ? matchSegmentStatus(match, [a,b], 9, match.hole_count, false) : 'N/A';
    const overall = matchSegmentStatus(match, [a,b], 0, match.hole_count, false);
    return `${a.name} vs ${b.name}: ${overall}`;
  });
  return {
    summary: summaries.join(' • ') || 'Not enough players',
    front: summaries.length ? 'See pair summaries' : 'N/A',
    back: match.hole_count > 9 ? 'See pair summaries' : 'N/A',
    overall: summaries.length ? summaries[0] : 'N/A'
  };
}

function computeTeamMatch(players, match) {
  const teams = groupPlayersByTeam(players);
  const teamKeys = Object.keys(teams);
  if (teamKeys.length < 2) return { summary: 'No team matchup defined', front: 'N/A', back: 'N/A', overall: 'N/A' };
  const front = matchSegmentStatus(match, teamKeys.map(k => teams[k]), 0, Math.min(9, match.hole_count), true);
  const back = match.hole_count > 9 ? matchSegmentStatus(match, teamKeys.map(k => teams[k]), 9, match.hole_count, true) : 'N/A';
  const overall = matchSegmentStatus(match, teamKeys.map(k => teams[k]), 0, match.hole_count, true);
  return {
    summary: `${teamKeys.join(' vs ')} • ${overall}`,
    front,
    back,
    overall
  };
}

function computeSkins(players, match, byTeam, holeLeaders) {
  const wins = {};
  for (let i = 0; i < match.hole_count; i++) {
    const entries = byTeam ? groupNetScoresByTeam(players, match, i) : players.map(p => ({ label: p.name, net: netScoreForHole(match, p, i) }));
    const valid = entries.filter(x => Number.isFinite(x.net));
    if (!valid.length) continue;
    const min = Math.min(...valid.map(x => x.net));
    const winners = valid.filter(x => x.net === min);
    if (winners.length === 1) {
      wins[winners[0].label] = (wins[winners[0].label] || 0) + 1;
      if (!holeLeaders[i]) holeLeaders[i] = [];
      holeLeaders[i].push(winners[0].label);
    }
  }
  const summary = Object.entries(wins).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k} ${v}`).join(' • ');
  return summary || 'No skins awarded yet';
}

function computeLowNet(players, match, holeLeaders) {
  const wins = {};
  for (let i = 0; i < match.hole_count; i++) {
    const valid = players.map(p => ({ label: p.name, net: netScoreForHole(match, p, i) })).filter(x => Number.isFinite(x.net));
    if (!valid.length) continue;
    const min = Math.min(...valid.map(x => x.net));
    const winners = valid.filter(x => x.net === min);
    winners.forEach(w => {
      wins[w.label] = (wins[w.label] || 0) + 1;
      if (!holeLeaders[i]) holeLeaders[i] = [];
      if (!holeLeaders[i].includes(w.label)) holeLeaders[i].push(w.label);
    });
  }
  return Object.entries(wins).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k} ${v}`).join(' • ') || 'No holes closed yet';
}

function matchSegmentStatus(match, contestants, start, end, teamMode) {
  const holes = Array.from({ length: end - start }, (_, idx) => idx + start);
  const labels = contestants.map(c => Array.isArray(c) ? teamLabel(c[0].team) : c.name);
  const scores = Object.fromEntries(labels.map(l => [l, 0]));
  let played = 0;

  holes.forEach(i => {
    const entries = contestants.map(c => {
      if (Array.isArray(c)) {
        const nets = c.map(p => netScoreForHole(match, p, i)).filter(Number.isFinite);
        return { label: teamLabel(c[0].team), net: nets.length ? Math.min(...nets) : NaN };
      }
      return { label: c.name, net: netScoreForHole(match, c, i) };
    }).filter(x => Number.isFinite(x.net));

    if (entries.length !== contestants.length) return;
    played++;
    const min = Math.min(...entries.map(x => x.net));
    const winners = entries.filter(x => x.net === min);
    if (winners.length === 1) scores[winners[0].label] += 1;
  });

  const ordered = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  if (!played) return 'No holes completed';
  if (ordered.length < 2 || ordered[0][1] === ordered[1][1]) return 'All square';
  const lead = ordered[0][1] - ordered[1][1];
  const holesLeft = (end - start) - played;
  const suffix = lead > holesLeft ? `won ${lead} & ${holesLeft}` : `${lead} up`;
  return `${ordered[0][0]} ${suffix}`;
}

function groupNetScoresByTeam(players, match, holeIndex) {
  const teams = groupPlayersByTeam(players);
  return Object.entries(teams).map(([key, members]) => {
    const nets = members.map(p => netScoreForHole(match, p, holeIndex)).filter(Number.isFinite);
    return { label: teamLabel(key), net: nets.length ? Math.min(...nets) : NaN };
  });
}

function calcCourseHandicap(index, course, holes = 18) {
  const factor = holes === 9 ? 0.5 : 1;
  const raw = (index * (course.slope / 113) + (course.rating - course.par)) * factor;
  return roundHalfAway(raw);
}

function calcPlayingHandicap(courseHcp, allowance) {
  return roundHalfAway(courseHcp * (allowance / 100));
}

function allocationForPlayer(strokesReceived, holeRanks, holes) {
  const activeRanks = holeRanks.slice(0, holes);
  return activeRanks.map(rank => {
    if (strokesReceived <= 0) return 0;
    const base = Math.floor(strokesReceived / holes);
    const extra = strokesReceived % holes;
    return base + (rank <= extra ? 1 : 0);
  });
}

function netScoreForHole(match, player, holeIndex) {
  const gross = match.scores?.[player.id]?.[holeIndex];
  if (gross === '' || gross == null || Number.isNaN(Number(gross))) return NaN;
  const course = state.courses.find(c => c.id === match.course_id);
  const scoreboard = buildScoreboard(match, course);
  const p = scoreboard.players.find(x => x.id === player.id);
  return Number(gross) - (p?.holeStrokes?.[holeIndex] || 0);
}

function allPairs(players) {
  const pairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) pairs.push([players[i], players[j]]);
  }
  return pairs;
}

function groupPlayersByTeam(players) {
  return players.reduce((acc, p) => {
    acc[p.team] ||= [];
    acc[p.team].push(p);
    return acc;
  }, {});
}

function teamLabel(team) {
  return String(team || 'A');
}

function allScoresEnteredForHole(match, players, holeIndex) {
  return players.every(p => {
    const val = match.scores?.[p.id]?.[holeIndex];
    return val !== '' && val != null && !Number.isNaN(Number(val));
  });
}

function matchScoresForPlayer(match, playerId) {
  return match.scores?.[playerId] || [];
}

function sumFilled(arr) {
  const vals = arr.map(Number).filter(Number.isFinite);
  return vals.length ? vals.reduce((a,b) => a+b, 0) : '—';
}

function sumNetForPlayer(match, player) {
  const course = state.courses.find(c => c.id === match.course_id);
  const scoreboard = buildScoreboard(match, course);
  const p = scoreboard.players.find(x => x.id === player.id);
  const nets = matchScoresForPlayer(match, player.id).map((gross, i) => {
    if (gross === '' || gross == null || Number.isNaN(Number(gross))) return NaN;
    return Number(gross) - (p?.holeStrokes?.[i] || 0);
  }).filter(Number.isFinite);
  return nets.length ? nets.reduce((a,b) => a+b, 0) : '—';
}

function roundHalfAway(num) {
  return num >= 0 ? Math.floor(num + 0.5) : Math.ceil(num - 0.5);
}

function ensureNumberArray(v) {
  return Array.isArray(v) ? v.map(Number) : [];
}

function upsertLocalArray(key, arr, item) {
  const idx = arr.findIndex(x => x.id === item.id);
  if (idx >= 0) arr[idx] = item; else arr.push(item);
  saveLocal(key, arr);
}

function byDateDesc(a, b) {
  return new Date(b.completed_at || b.updated_at || b.created_at || 0) - new Date(a.completed_at || a.updated_at || a.created_at || 0);
}

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString();
}

function toast(msg) {
  alert(msg);
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.deferredPrompt = e;
    el('installBtn').classList.remove('hidden');
  });
  el('installBtn').addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    el('installBtn').classList.add('hidden');
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
  }
}
