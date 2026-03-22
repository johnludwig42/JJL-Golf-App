const STORAGE_KEY = 'golf-matchbook-v5';
let deferredPrompt = null;
let importDraft = null;
let editingPlayerId = null;
let editingCourseId = null;
let editingTeeRef = null;

const PROXY_CANDIDATES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://proxy.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const state = loadState();
normalizeState();

function loadState() {
  const fallback = { players: [], courses: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('golf-matchbook-v4');
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function normalizeState() {
  state.players = Array.isArray(state.players) ? state.players : [];
  state.courses = Array.isArray(state.courses) ? state.courses : [];
  state.players.forEach(p => {
    if (!p.id) p.id = uid();
    p.name = p.name || '';
    p.index = Number.isFinite(Number(p.index)) ? Number(p.index) : 0;
  });
  state.courses.forEach(c => {
    if (!c.id) c.id = uid();
    c.name = c.name || 'Untitled Course';
    c.city = c.city || '';
    c.state = c.state || '';
    c.country = c.country || '';
    c.tees = Array.isArray(c.tees) ? c.tees : [];
    c.tees.forEach(t => normalizeTee(t, c.name));
  });
}
function normalizeTee(tee, courseName = '') {
  tee.id = tee.id || uid();
  tee.courseName = tee.courseName || courseName || '';
  tee.teeName = tee.teeName || 'Tee';
  tee.gender = tee.gender || 'M';
  tee.par = Number.isFinite(Number(tee.par)) ? Number(tee.par) : 72;
  tee.rating = Number.isFinite(Number(tee.rating)) ? Number(tee.rating) : 72;
  tee.slope = Number.isFinite(Number(tee.slope)) ? Number(tee.slope) : 113;
  tee.length = Number.isFinite(Number(tee.length)) ? Number(tee.length) : null;
  tee.holes = Array.isArray(tee.holes) ? tee.holes : buildDefaultHoles();
  tee.holes = tee.holes.map((h, idx) => ({
    holeNumber: Number(h.holeNumber) || idx + 1,
    yardage: Number.isFinite(Number(h.yardage)) ? Number(h.yardage) : null,
    par: Number.isFinite(Number(h.par)) ? Number(h.par) : null,
    strokeIndex: Number.isFinite(Number(h.strokeIndex)) ? Number(h.strokeIndex) : null,
  }));
  if (!tee.length) tee.length = sumYardage(tee.holes);
  if (!tee.par) tee.par = sumPar(tee.holes) || tee.par;
}
function buildDefaultHoles() {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    yardage: null,
    par: null,
    strokeIndex: i + 1,
  }));
}
function persist() {
  normalizeState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function toast(msg, duration = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), duration);
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}
function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function sumYardage(holes) {
  const total = (holes || []).reduce((sum, h) => sum + (Number(h.yardage) || 0), 0);
  return total || null;
}
function sumPar(holes) {
  const total = (holes || []).reduce((sum, h) => sum + (Number(h.par) || 0), 0);
  return total || null;
}
function strokeIndexSummary(holes) {
  const filled = (holes || []).filter(h => Number(h.strokeIndex));
  return filled.length ? `${filled.length}/18 stroke indexes set` : 'No stroke indexes set';
}
function courseHandicap(index, slope, rating, par) {
  return Math.round(Number(index) * (Number(slope) / 113) + (Number(rating) - Number(par)));
}
function playingHandicap(courseHdcp, allowancePct) {
  return Math.round(Number(courseHdcp) * (Number(allowancePct) / 100));
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
    el.innerHTML = '<div class="muted">No players saved yet.</div>';
    return;
  }
  el.innerHTML = state.players.map(p => `
    <div class="item">
      <div class="item-header">
        <div>
          <div class="item-title">${escapeHtml(p.name)}</div>
          <div class="muted">Handicap Index: ${Number(p.index).toFixed(1)}</div>
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
    el.innerHTML = '<div class="muted">No courses saved yet.</div>';
    return;
  }
  el.innerHTML = state.courses.map(c => `
    <div class="item">
      <div class="item-header">
        <div>
          <div class="item-title">${escapeHtml(c.name)}</div>
          <div class="muted">${[c.city, c.state].filter(Boolean).join(', ') || c.country || ''}</div>
          ${c.sourceUrl ? `<div class="tiny">Imported from USGA page</div>` : ''}
        </div>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-course="${c.id}">Edit course</button>
          <button class="secondary" data-delete-course="${c.id}">Delete</button>
        </div>
      </div>
      <hr>
      ${(c.tees || []).length ? c.tees.map(t => `
        <div class="tee-block">
          <div class="item-header">
            <div>
              <div class="tiny strong">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'}</div>
              <div class="tiny">Par ${t.par} · Rating ${t.rating} · Slope ${t.slope}${t.length ? ` · ${t.length} yds` : ''}</div>
              <div class="tiny">${strokeIndexSummary(t.holes)}</div>
            </div>
            <div class="actions wrap compact-actions">
              <button class="secondary" data-edit-tee="${c.id}|${t.id}">Edit tee & holes</button>
              <button class="secondary" data-delete-tee="${c.id}|${t.id}">Delete tee</button>
            </div>
          </div>
        </div>
      `).join('') : '<div class="tiny">No tee sets yet.</div>'}
    </div>
  `).join('');
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
  const select = document.getElementById('calcCourse');
  select.innerHTML = `<option value="">Select course</option>${options}`;
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
  teeSelect.innerHTML = course.tees.map(t => `<option value="${t.id}">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'} · ${t.rating}/${t.slope}</option>`).join('');
}

function parseCourseId(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const justDigits = trimmed.match(/^\d+$/);
  if (justDigits) return justDigits[0];
  const urlId = trimmed.match(/[?&]CourseID=(\d+)/i);
  if (urlId) return urlId[1];
  const pathId = trimmed.match(/courseTeeInfo\/?(\d+)/i);
  if (pathId) return pathId[1];
  return null;
}

async function fetchTextWithFallbacks(targetUrl) {
  const errors = [];
  for (const buildProxyUrl of PROXY_CANDIDATES) {
    const requestUrl = buildProxyUrl(targetUrl);
    try {
      const resp = await fetch(requestUrl, { headers: { 'Accept': 'text/html,text/plain,*/*' } });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`.trim());
      const text = await resp.text();
      if (!text || text.length < 150) throw new Error('empty response');
      if (/access denied|rate limit|temporarily unavailable/i.test(text)) throw new Error('proxy blocked');
      return text;
    } catch (err) {
      errors.push(err.message || String(err));
    }
  }
  throw new Error(`Live import could not reach the USGA page. ${errors.join(' | ')}`);
}

async function fetchCourseText(courseId) {
  const targetUrl = `https://ncrdb.usga.org/courseTeeInfo?CourseID=${courseId}`;
  const text = await fetchTextWithFallbacks(targetUrl);
  return { text, targetUrl };
}

function parseUSGATableRowsFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('tr')];
  const tees = [];
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td')].map(td => normalizeWhitespace(td.textContent));
    if (cells.length < 8) continue;
    const genderIndex = cells.findIndex(v => v === 'M' || v === 'F');
    if (genderIndex < 1) continue;
    const teeName = normalizeWhitespace(cells.slice(0, genderIndex).join(' '));
    const gender = cells[genderIndex];
    const par = Number(cells[genderIndex + 1]);
    const rating = Number(cells[genderIndex + 2]);
    const bogeyRating = Number(cells[genderIndex + 3]);
    const slope = Number(cells[genderIndex + 4]);
    const tail = cells.slice(genderIndex + 5).filter(Boolean);
    const numericTail = tail.filter(v => /^\d+(?:\.\d+)?$/.test(v));
    const teeId = Number(numericTail.at(-2));
    const length = Number(numericTail.at(-1));
    if (!teeName || !Number.isFinite(par) || !Number.isFinite(rating) || !Number.isFinite(slope) || !Number.isFinite(teeId) || !Number.isFinite(length)) continue;
    tees.push({ teeName, gender, par, rating, bogeyRating: Number.isFinite(bogeyRating) ? bogeyRating : null, slope, teeId, length, courseName: '' });
  }
  return tees;
}

function extractMetadataFromText(text, html = '') {
  const lines = normalizeWhitespace(text).split('\n').map(x => x.trim()).filter(Boolean);
  let courseName = 'Imported Course';
  let city = '';
  let stateName = '';

  const labeledLineIndex = lines.findIndex(line => /Club\/Course Name City State\/Province/i.test(line));
  if (labeledLineIndex >= 0 && lines[labeledLineIndex + 1]) {
    const raw = lines[labeledLineIndex + 1].replace(/\s+-\s+/g, ' - ').trim();
    const m = raw.match(/^(.*?)\s+-\s+(.*?)\s+([A-Za-z .'-]+)\s+([A-Z]{2}|[A-Za-z ]+)$/);
    if (m) {
      courseName = m[2].trim();
      city = m[3].trim();
      stateName = m[4].trim();
    } else {
      courseName = raw;
    }
  }

  if ((!courseName || courseName === 'Imported Course') && html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h1 = normalizeWhitespace(doc.querySelector('h1,h2,title')?.textContent || '');
    if (h1 && !/Course Rating|Slope Rating/i.test(h1)) courseName = h1;
  }

  const fallbackLine = lines.find(line => /Golf|Country Club|CC|Club|Links|Course/i.test(line) && !/Course Rating|Slope Rating|Bogey/i.test(line));
  if ((courseName === 'Imported Course' || !courseName) && fallbackLine) courseName = fallbackLine;

  return { courseName: courseName || 'Imported Course', city, state: stateName };
}

function parseUSGATeeText(sourceText, sourceUrl = '') {
  const decoded = decodeHtml(sourceText);
  const isHtml = /<html[\s>]|<table[\s>]|<tr[\s>]|<td[\s>]/i.test(decoded);
  let plainText = decoded;
  let tees = [];

  if (isHtml) {
    const doc = new DOMParser().parseFromString(decoded, 'text/html');
    plainText = normalizeWhitespace(doc.body?.innerText || doc.documentElement?.textContent || decoded);
    tees = parseUSGATableRowsFromHtml(decoded);
  } else {
    plainText = normalizeWhitespace(decoded);
  }

  const metadata = extractMetadataFromText(plainText, isHtml ? decoded : '');

  if (!tees.length) {
    const teePattern = /^(.*?)\s+(M|F)\s+(\d{2})\s+(\d{2,3}\.\d)\s+(\d{2,3}\.\d)\s+(\d{2,3})\b.*?\b(\d{5,7})\s+(\d{3,5})\b/gm;
    for (const match of plainText.matchAll(teePattern)) {
      tees.push({
        teeName: match[1].trim(),
        gender: match[2],
        par: Number(match[3]),
        rating: Number(match[4]),
        bogeyRating: Number(match[5]),
        slope: Number(match[6]),
        teeId: Number(match[7]),
        length: Number(match[8]),
        courseName: metadata.courseName,
      });
    }
  }

  const uniqueTees = [];
  const seen = new Set();
  for (const tee of tees) {
    const key = `${tee.teeName}|${tee.gender}|${tee.par}|${tee.rating}|${tee.slope}|${tee.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      tee.courseName = metadata.courseName;
      normalizeTee(tee, metadata.courseName);
      uniqueTees.push(tee);
    }
  }

  if (!uniqueTees.length) {
    throw new Error('No tee rows were found. Paste the full USGA tee page text into the fallback box and try again.');
  }

  return {
    name: metadata.courseName,
    city: metadata.city,
    state: metadata.state,
    country: 'United States of America',
    tees: uniqueTees,
    sourceUrl,
  };
}

function showImportPreview(course) {
  importDraft = course;
  const card = document.getElementById('importPreviewCard');
  const preview = document.getElementById('importPreview');
  preview.innerHTML = `
    <div class="item">
      <div class="item-title">${escapeHtml(course.name)}</div>
      <div class="muted">${[course.city, course.state].filter(Boolean).join(', ')}</div>
      ${course.sourceUrl ? `<div class="tiny">${escapeHtml(course.sourceUrl)}</div>` : ''}
      <hr>
      ${course.tees.map(t => `<div class="tiny">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'} · Par ${t.par} · Rating ${t.rating} · Slope ${t.slope}${t.length ? ` · ${t.length} yds` : ''}</div>`).join('')}
    </div>
  `;
  card.classList.remove('hidden');
}

function saveImportedCourse() {
  if (!importDraft) return;
  const existing = state.courses.find(c => c.name.toLowerCase() === importDraft.name.toLowerCase() && (c.city || '').toLowerCase() === (importDraft.city || '').toLowerCase());
  if (existing) {
    existing.state = importDraft.state;
    existing.country = importDraft.country;
    existing.sourceUrl = importDraft.sourceUrl;
    const existingKeys = new Set(existing.tees.map(t => `${t.teeName}|${t.gender}|${t.length || ''}`));
    importDraft.tees.forEach(t => {
      const key = `${t.teeName}|${t.gender}|${t.length || ''}`;
      if (!existingKeys.has(key)) existing.tees.push(t);
    });
    toast('Imported tees added to existing course.');
  } else {
    state.courses.push({ id: uid(), ...importDraft });
    toast('Imported course saved.');
  }
  importDraft = null;
  document.getElementById('importPreviewCard').classList.add('hidden');
  persist();
}

function discardImport() {
  importDraft = null;
  document.getElementById('importPreviewCard').classList.add('hidden');
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
  form.name.value = course.name || '';
  form.city.value = course.city || '';
  form.state.value = course.state || '';
  form.country.value = course.country || '';
  title.textContent = 'Edit course';
  submit.textContent = 'Update Course';
  cancel.classList.remove('hidden');
  document.querySelector('[data-tab="courses"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadTeeEditor(courseId, teeId = null) {
  const form = document.getElementById('teeForm');
  const title = document.getElementById('teeFormTitle');
  const submit = document.getElementById('teeSubmitBtn');
  const cancel = document.getElementById('cancelTeeEditBtn');
  editingTeeRef = teeId ? { courseId, teeId } : null;
  form.courseId.value = courseId || '';
  if (!teeId) {
    form.reset();
    form.courseId.value = courseId || '';
    title.textContent = 'Add tee set manually';
    submit.textContent = 'Save Tee Set';
    cancel.classList.add('hidden');
    form.holesJson.value = JSON.stringify(buildDefaultHoles(), null, 2);
    return;
  }
  const course = state.courses.find(c => c.id === courseId);
  const tee = course?.tees.find(t => t.id === teeId);
  if (!course || !tee) return;
  form.courseId.value = courseId;
  form.teeName.value = tee.teeName || '';
  form.gender.value = tee.gender || 'M';
  form.par.value = tee.par || '';
  form.rating.value = tee.rating || '';
  form.slope.value = tee.slope || '';
  form.length.value = tee.length || '';
  form.holesJson.value = JSON.stringify(tee.holes || buildDefaultHoles(), null, 2);
  title.textContent = `Edit tee & holes — ${course.name} / ${tee.teeName}`;
  submit.textContent = 'Update Tee Set';
  cancel.classList.remove('hidden');
  document.querySelector('[data-tab="courses"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function parseHolesInput(raw, teeName = '') {
  if (!raw.trim()) return buildDefaultHoles();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Hole detail must be valid JSON.');
  }
  if (!Array.isArray(parsed)) throw new Error('Hole detail must be an array of 18 rows.');
  const holes = parsed.map((h, idx) => ({
    holeNumber: Number(h.holeNumber) || idx + 1,
    yardage: h.yardage === '' || h.yardage == null ? null : Number(h.yardage),
    par: h.par === '' || h.par == null ? null : Number(h.par),
    strokeIndex: h.strokeIndex === '' || h.strokeIndex == null ? null : Number(h.strokeIndex),
  }));
  if (!holes.length) throw new Error('Enter at least one hole row.');
  const validStrokeIndexes = holes.filter(h => h.strokeIndex != null).every(h => h.strokeIndex >= 1 && h.strokeIndex <= 18);
  if (!validStrokeIndexes) throw new Error(`Stroke index for ${teeName || 'this tee'} must be between 1 and 18.`);
  return holes;
}

document.getElementById('loadTemplate18Btn').addEventListener('click', () => {
  document.getElementById('teeForm').holesJson.value = JSON.stringify(buildDefaultHoles(), null, 2);
});

document.getElementById('playerForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = { name: fd.get('name').trim(), index: Number(fd.get('index')) };
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
    name: fd.get('name').trim(),
    city: fd.get('city').trim(),
    state: fd.get('state').trim(),
    country: fd.get('country').trim(),
  };
  if (editingCourseId) {
    const course = state.courses.find(c => c.id === editingCourseId);
    if (course) {
      Object.assign(course, payload);
      course.tees.forEach(t => { t.courseName = course.name; });
    }
    toast('Course updated.');
  } else {
    state.courses.push({ id: uid(), ...payload, tees: [] });
    toast('Course created.');
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
  let holes;
  try {
    holes = parseHolesInput(fd.get('holesJson') || '', fd.get('teeName'));
  } catch (err) {
    return toast(err.message, 4200);
  }
  const payload = {
    courseName: course.name,
    teeName: fd.get('teeName').trim(),
    gender: fd.get('gender'),
    par: Number(fd.get('par')) || sumPar(holes) || 72,
    rating: Number(fd.get('rating')),
    slope: Number(fd.get('slope')),
    length: Number(fd.get('length')) || sumYardage(holes) || null,
    holes,
  };
  if (editingTeeRef) {
    const tee = course.tees.find(t => t.id === editingTeeRef.teeId);
    if (tee) Object.assign(tee, payload);
    normalizeTee(tee, course.name);
    toast('Tee set updated.');
  } else {
    const tee = { id: uid(), ...payload };
    normalizeTee(tee, course.name);
    course.tees.push(tee);
    toast('Tee set saved.');
  }
  loadTeeEditor(course.id, null);
  persist();
});

document.getElementById('cancelTeeEditBtn').addEventListener('click', () => loadTeeEditor(document.getElementById('teeCourseSelect').value || '', null));

document.getElementById('coursesList').addEventListener('click', e => {
  const courseId = e.target.getAttribute('data-delete-course');
  if (courseId) {
    const idx = state.courses.findIndex(c => c.id === courseId);
    if (idx >= 0) {
      state.courses.splice(idx, 1);
      persist();
      toast('Course deleted.');
    }
    return;
  }
  const editCourseId = e.target.getAttribute('data-edit-course');
  if (editCourseId) return loadCourseEditor(editCourseId);
  const teeRef = e.target.getAttribute('data-edit-tee');
  if (teeRef) {
    const [courseRef, teeRefId] = teeRef.split('|');
    return loadTeeEditor(courseRef, teeRefId);
  }
  const deleteTeeRef = e.target.getAttribute('data-delete-tee');
  if (deleteTeeRef) {
    const [courseRef, teeRefId] = deleteTeeRef.split('|');
    const course = state.courses.find(c => c.id === courseRef);
    if (!course) return;
    course.tees = course.tees.filter(t => t.id !== teeRefId);
    persist();
    toast('Tee deleted.');
  }
});

document.getElementById('playersList').addEventListener('click', e => {
  const playerId = e.target.getAttribute('data-delete-player');
  if (playerId) {
    const idx = state.players.findIndex(p => p.id === playerId);
    if (idx >= 0) {
      state.players.splice(idx, 1);
      persist();
      toast('Player deleted.');
    }
    return;
  }
  const editPlayerId = e.target.getAttribute('data-edit-player');
  if (editPlayerId) loadPlayerEditor(editPlayerId);
});

document.getElementById('importForm').addEventListener('submit', async e => {
  e.preventDefault();
  const source = document.getElementById('importSource').value;
  const courseId = parseCourseId(source);
  if (!courseId) return toast('Paste a CourseID or a full USGA tee page URL.');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    toast('Trying live import...');
    const { text, targetUrl } = await fetchCourseText(courseId);
    const parsed = parseUSGATeeText(text, targetUrl);
    showImportPreview(parsed);
    toast('Import ready to save.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Import failed.', 4200);
    document.querySelector('details').open = true;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import tee sets';
  }
});

document.getElementById('sampleImportBtn').addEventListener('click', () => {
  const sample = `Course Rating Search Results\nClub/Course Name City State/Province\nPrairieview Golf Club - Prairieview Golf Club Byron IL\nTee Name Gender Par Course Rating Bogey Rating Slope Rating RatingF9 RatingB9 Front (9) Back (9) Bogey Rating (F9) Bogey Rating (B9) Slope (F9) Slope (B9) TeeID Length CH\nBlack M 72 73.9 99.4 138 36.8 37.1 36.8 / 135 37.1 / 140 49.3 50.1 135 135 313333 7001\nBlue M 72 72.0 96.9 133 36.0 36.0 36.0 / 134 36.0 / 132 48.5 48.4 134 134 313332 6574\nWhite M 72 69.7 93.4 127 34.9 34.8 34.9 / 127 34.8 / 127 46.8 46.6 127 127 504017 6099\nBlue F 72 78.1 110.7 138 39.3 38.8 39.3 / 138 38.8 / 138 55.6 55.1 138 138 920060 6574\nWhite F 72 75.3 106.3 132 37.8 37.5 37.8 / 132 37.5 / 131 53.4 52.9 132 132 504016 6099`;
  try {
    showImportPreview(parseUSGATeeText(sample, 'https://ncrdb.usga.org/courseTeeInfo?CourseID=7300'));
    toast('Sample loaded.');
  } catch {
    toast('Sample parse failed.');
  }
});

document.getElementById('manualParseBtn').addEventListener('click', () => {
  const text = document.getElementById('manualSourceText').value.trim();
  if (!text) return toast('Paste the USGA tee page text first.');
  try {
    showImportPreview(parseUSGATeeText(text, 'Pasted USGA page text'));
    toast('Pasted text parsed.');
  } catch (err) {
    toast(err.message || 'Could not parse pasted text.', 4200);
  }
});

document.getElementById('saveImportedCourseBtn').addEventListener('click', saveImportedCourse);

document.getElementById('discardImportBtn').addEventListener('click', discardImport);
document.getElementById('pasteTextBtn').addEventListener('click', () => {
  document.querySelector('details').open = true;
  document.getElementById('manualSourceText').focus();
});

document.getElementById('calcCourse').addEventListener('change', populateCalcTees);
document.getElementById('teeCourseSelect').addEventListener('change', e => {
  if (!editingTeeRef) loadTeeEditor(e.target.value || '', null);
});

document.getElementById('calcForm').addEventListener('submit', e => {
  e.preventDefault();
  const player = state.players.find(p => p.id === document.getElementById('calcPlayer').value);
  const course = state.courses.find(c => c.id === document.getElementById('calcCourse').value);
  const tee = course?.tees?.find(t => t.id === document.getElementById('calcTee').value);
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
    state.players = Array.isArray(incoming.players) ? incoming.players : state.players;
    state.courses = Array.isArray(incoming.courses) ? incoming.courses : state.courses;
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
loadTeeEditor('', null);
renderAll();
