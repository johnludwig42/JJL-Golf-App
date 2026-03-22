const STORAGE_KEY = 'golf-matchbook-v6';
let deferredPrompt = null;
let editingPlayerId = null;
let editingCourseId = null;
let editingTeeRef = null;

const state = loadState();
normalizeState();

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
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
  const fallback = { players: [], courses: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      || localStorage.getItem('golf-matchbook-v5')
      || localStorage.getItem('golf-matchbook-v4');
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}
function buildDefaultHoles(count = 18) {
  return Array.from({ length: count }, (_, i) => ({
    holeNumber: i + 1,
    yardage: null,
    par: null,
    strokeIndex: i + 1,
  }));
}
function sumYardage(holes) {
  return holes.reduce((sum, h) => sum + (Number(h.yardage) || 0), 0) || null;
}
function sumPar(holes) {
  return holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0) || null;
}
function normalizeHole(hole, idx) {
  return {
    holeNumber: Number(hole.holeNumber) || idx + 1,
    yardage: Number(hole.yardage) || null,
    par: Number(hole.par) || null,
    strokeIndex: Number(hole.strokeIndex) || null,
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
function normalizeState() {
  state.players = Array.isArray(state.players) ? state.players : [];
  state.courses = Array.isArray(state.courses) ? state.courses : [];
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
    c.tees = Array.isArray(c.tees) ? c.tees : [];
    c.tees.forEach(t => normalizeTee(t, c.name));
  });
}
function courseHandicap(index, slope, rating, par) {
  return Math.round(Number(index) * (Number(slope) / 113) + (Number(rating) - Number(par)));
}
function playingHandicap(courseHdcp, allowancePct) {
  return Math.round(Number(courseHdcp) * (Number(allowancePct) / 100));
}
function strokeIndexSummary(holes) {
  const filled = holes.filter(h => h.strokeIndex);
  if (!filled.length) return 'No stroke indexes saved yet';
  return `${filled.length} holes have stroke indexes`; 
}

function renderAll() {
  renderPlayers();
  renderCourses();
  populateCourseSelects();
  populateCalcPlayers();
  populateCalcCourses();
}

function renderPlayers() {
  const el = document.getElementById('playersList');
  if (!state.players.length) {
    el.innerHTML = '<div class="tiny">No players saved yet.</div>';
    return;
  }
  el.innerHTML = state.players.map(p => `
    <div class="item">
      <div class="item-header">
        <div>
          <div class="item-title">${escapeHtml(p.name)}</div>
          <div class="muted">Handicap Index ${Number(p.index).toFixed(1)}</div>
        </div>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-player="${p.id}">Edit</button>
          <button class="secondary" data-delete-player="${p.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderCourses() {
  const el = document.getElementById('coursesList');
  if (!state.courses.length) {
    el.innerHTML = '<div class="tiny">No courses saved yet.</div>';
    return;
  }
  el.innerHTML = state.courses.map(c => `
    <div class="item">
      <div class="item-header">
        <div>
          <div class="item-title">${escapeHtml(c.name)}</div>
          <div class="muted">${escapeHtml([c.city, c.state].filter(Boolean).join(', ') || c.country)}</div>
        </div>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-course="${c.id}">Edit course</button>
          <button class="secondary" data-delete-course="${c.id}">Delete course</button>
          <button class="secondary" data-new-tee="${c.id}">Add tee</button>
        </div>
      </div>
      <div class="top-gap">
        ${c.tees.length ? c.tees.map(t => `
          <div class="tee-block">
            <div class="strong">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'}</div>
            <div class="tiny">Par ${t.par} · Rating ${t.rating} · Slope ${t.slope}${t.length ? ` · ${t.length} yds` : ''}</div>
            <div class="tiny">${strokeIndexSummary(t.holes)}</div>
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

function populateCourseSelects() {
  const options = state.courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const select = document.getElementById('teeCourseSelect');
  select.innerHTML = `<option value="">Select course</option>${options}`;
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
  const course = state.courses.find(c => c.id === courseId);
  if (!course) {
    teeSelect.innerHTML = '<option value="">Select tee</option>';
    return;
  }
  teeSelect.innerHTML = `<option value="">Select tee</option>` + course.tees.map(t => `<option value="${t.id}">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'} · ${t.rating}/${t.slope}</option>`).join('');
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

function loadPlayerEditor(playerId = null) {
  const form = document.getElementById('playerForm');
  const title = document.getElementById('playerFormTitle');
  const submit = document.getElementById('playerSubmitBtn');
  const cancel = document.getElementById('cancelPlayerEditBtn');
  editingPlayerId = playerId;
  if (!playerId) {
    form.reset();
    title.textContent = 'Add player';
    submit.textContent = 'Save Player';
    cancel.classList.add('hidden');
    return;
  }
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;
  form.name.value = player.name;
  form.index.value = player.index;
  title.textContent = 'Edit player';
  submit.textContent = 'Update Player';
  cancel.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadCourseEditor(courseId = null) {
  const form = document.getElementById('courseForm');
  const title = document.getElementById('courseFormTitle');
  const submit = document.getElementById('courseSubmitBtn');
  const cancel = document.getElementById('cancelCourseEditBtn');
  editingCourseId = courseId;
  if (!courseId) {
    form.reset();
    form.country.value = 'United States of America';
    title.textContent = 'Add course manually';
    submit.textContent = 'Create Course';
    cancel.classList.add('hidden');
    return;
  }
  const course = state.courses.find(c => c.id === courseId);
  if (!course) return;
  form.name.value = course.name;
  form.city.value = course.city || '';
  form.state.value = course.state || '';
  form.country.value = course.country || 'United States of America';
  title.textContent = 'Edit course';
  submit.textContent = 'Update Course';
  cancel.classList.remove('hidden');
  document.querySelector('[data-tab="courses"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadTeeEditor(courseId = '', teeId = null) {
  const form = document.getElementById('teeForm');
  const title = document.getElementById('teeFormTitle');
  const submit = document.getElementById('teeSubmitBtn');
  const cancel = document.getElementById('cancelTeeEditBtn');
  editingTeeRef = teeId ? { courseId, teeId } : null;

  if (!teeId) {
    form.reset();
    form.courseId.value = courseId || '';
    renderHoleRows(buildDefaultHoles());
    title.textContent = 'Add tee manually';
    submit.textContent = 'Save Tee';
    cancel.classList.add('hidden');
    return;
  }

  const course = state.courses.find(c => c.id === courseId);
  const tee = course?.tees.find(t => t.id === teeId);
  if (!course || !tee) return;
  form.courseId.value = courseId;
  form.teeName.value = tee.teeName;
  form.gender.value = tee.gender;
  form.length.value = tee.length || '';
  form.par.value = tee.par || '';
  form.rating.value = tee.rating || '';
  form.slope.value = tee.slope || '';
  renderHoleRows(tee.holes);
  title.textContent = `Edit tee · ${tee.teeName}`;
  submit.textContent = 'Update Tee';
  cancel.classList.remove('hidden');
  document.querySelector('[data-tab="courses"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event wiring

document.getElementById('playerForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = { name: String(fd.get('name') || '').trim(), index: Number(fd.get('index')) || 0 };
  if (!payload.name) return toast('Enter a player name.');
  if (editingPlayerId) {
    const player = state.players.find(p => p.id === editingPlayerId);
    if (player) Object.assign(player, payload);
    toast('Player updated.');
  } else {
    state.players.push({ id: uid(), ...payload });
    toast('Player saved.');
  }
  loadPlayerEditor(null);
  persist();
});
document.getElementById('cancelPlayerEditBtn').addEventListener('click', () => loadPlayerEditor(null));

document.getElementById('courseForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    name: String(fd.get('name') || '').trim(),
    city: String(fd.get('city') || '').trim(),
    state: String(fd.get('state') || '').trim(),
    country: String(fd.get('country') || '').trim() || 'United States of America',
  };
  if (!payload.name) return toast('Enter a course name.');
  if (editingCourseId) {
    const course = state.courses.find(c => c.id === editingCourseId);
    if (course) {
      Object.assign(course, payload);
      course.tees.forEach(t => { t.courseName = course.name; });
    }
    toast('Course updated.');
  } else {
    const newCourse = { id: uid(), ...payload, tees: [] };
    state.courses.push(newCourse);
    toast('Course created.');
    document.getElementById('teeCourseSelect').value = newCourse.id;
  }
  loadCourseEditor(null);
  persist();
});
document.getElementById('cancelCourseEditBtn').addEventListener('click', () => loadCourseEditor(null));

document.getElementById('teeForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const course = state.courses.find(c => c.id === fd.get('courseId'));
  if (!course) return toast('Pick a course first.');
  const holes = collectHolesFromGrid().map(normalizeHole);
  const payload = {
    courseName: course.name,
    teeName: String(fd.get('teeName') || '').trim(),
    gender: String(fd.get('gender') || 'M'),
    length: Number(fd.get('length')) || sumYardage(holes) || null,
    par: Number(fd.get('par')) || sumPar(holes) || 72,
    rating: Number(fd.get('rating')) || null,
    slope: Number(fd.get('slope')) || null,
    holes,
  };
  if (!payload.teeName) return toast('Enter a tee name.');
  if (!payload.rating || !payload.slope) return toast('Enter rating and slope.');

  if (editingTeeRef) {
    const editCourse = state.courses.find(c => c.id === editingTeeRef.courseId);
    const tee = editCourse?.tees.find(t => t.id === editingTeeRef.teeId);
    if (!tee) return toast('Could not find tee to update.');
    if (editCourse.id !== course.id) {
      editCourse.tees = editCourse.tees.filter(t => t.id !== tee.id);
      const movedTee = { id: tee.id, ...payload };
      normalizeTee(movedTee, course.name);
      course.tees.push(movedTee);
    } else {
      Object.assign(tee, payload);
      normalizeTee(tee, course.name);
    }
    toast('Tee updated.');
  } else {
    const tee = { id: uid(), ...payload };
    normalizeTee(tee, course.name);
    course.tees.push(tee);
    toast('Tee saved.');
  }
  loadTeeEditor(course.id, null);
  persist();
});
document.getElementById('cancelTeeEditBtn').addEventListener('click', () => loadTeeEditor(document.getElementById('teeCourseSelect').value || '', null));

document.getElementById('loadTemplate18Btn').addEventListener('click', () => {
  renderHoleRows(buildDefaultHoles());
  toast('Loaded 18-hole template.');
});
document.getElementById('recalcTotalsBtn').addEventListener('click', fillTotalsFromHoles);

document.getElementById('playersList').addEventListener('click', e => {
  const playerId = e.target.getAttribute('data-delete-player');
  if (playerId) {
    state.players = state.players.filter(p => p.id !== playerId);
    persist();
    toast('Player deleted.');
    return;
  }
  const editPlayerId = e.target.getAttribute('data-edit-player');
  if (editPlayerId) loadPlayerEditor(editPlayerId);
});

document.getElementById('coursesList').addEventListener('click', e => {
  const deleteCourseId = e.target.getAttribute('data-delete-course');
  if (deleteCourseId) {
    state.courses = state.courses.filter(c => c.id !== deleteCourseId);
    persist();
    toast('Course deleted.');
    return;
  }
  const editCourseId = e.target.getAttribute('data-edit-course');
  if (editCourseId) return loadCourseEditor(editCourseId);
  const newTeeCourseId = e.target.getAttribute('data-new-tee');
  if (newTeeCourseId) return loadTeeEditor(newTeeCourseId, null);
  const editTeeRef = e.target.getAttribute('data-edit-tee');
  if (editTeeRef) {
    const [courseId, teeId] = editTeeRef.split('|');
    return loadTeeEditor(courseId, teeId);
  }
  const deleteTeeRef = e.target.getAttribute('data-delete-tee');
  if (deleteTeeRef) {
    const [courseId, teeId] = deleteTeeRef.split('|');
    const course = state.courses.find(c => c.id === courseId);
    if (!course) return;
    course.tees = course.tees.filter(t => t.id !== teeId);
    persist();
    toast('Tee deleted.');
  }
});

document.getElementById('calcCourse').addEventListener('change', populateCalcTees);
document.getElementById('calcForm').addEventListener('submit', e => {
  e.preventDefault();
  const player = state.players.find(p => p.id === document.getElementById('calcPlayer').value);
  const course = state.courses.find(c => c.id === document.getElementById('calcCourse').value);
  const tee = course?.tees.find(t => t.id === document.getElementById('calcTee').value);
  const allowance = Number(document.getElementById('calcAllowance').value || 100);
  if (!player || !course || !tee) return toast('Pick a player, course, and tee.');
  const ch = courseHandicap(player.index, tee.slope, tee.rating, tee.par);
  const ph = playingHandicap(ch, allowance);
  document.getElementById('calcResult').innerHTML = `
    <strong>${escapeHtml(player.name)}</strong><br>
    ${escapeHtml(course.name)} · ${escapeHtml(tee.teeName)} · ${tee.gender === 'F' ? 'Women' : 'Men'}<br>
    Course Handicap: <strong>${ch}</strong><br>
    Playing Handicap (${allowance}%): <strong>${ph}</strong><br>
    Hole data: <strong>${strokeIndexSummary(tee.holes)}</strong>
  `;
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'golf-matchbook-backup.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importFile').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const incoming = JSON.parse(text);
    if (Array.isArray(incoming.players)) state.players = incoming.players;
    if (Array.isArray(incoming.courses)) state.courses = incoming.courses;
    normalizeState();
    persist();
    toast('Backup imported.');
  } catch {
    toast('Could not read backup file.');
  }
});

document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
}));

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBtn').classList.remove('hidden');
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBtn').classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}

loadPlayerEditor(null);
loadCourseEditor(null);
renderHoleRows(buildDefaultHoles());
renderAll();
