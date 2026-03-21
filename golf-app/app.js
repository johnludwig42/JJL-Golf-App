const STORAGE_KEY = 'golf-matchbook-v3';
let deferredPrompt = null;
let importDraft = null;

const state = loadState();

function loadState() {
  const fallback = { players: [], courses: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2200);
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
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
        <button class="secondary" data-delete-player="${p.id}">Delete</button>
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
        <button class="secondary" data-delete-course="${c.id}">Delete</button>
      </div>
      <hr>
      ${(c.tees || []).length ? c.tees.map(t => `
        <div class="tiny">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'} · Par ${t.par} · Rating ${t.rating} · Slope ${t.slope}${t.length ? ` · ${t.length} yds` : ''}</div>
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
  teeSelect.innerHTML = course.tees.map((t, idx) => `<option value="${idx}">${escapeHtml(t.teeName)} · ${t.gender === 'F' ? 'Women' : 'Men'} · ${t.rating}/${t.slope}</option>`).join('');
}

function parseCourseId(input) {
  const trimmed = input.trim();
  const justDigits = trimmed.match(/^\d+$/);
  if (justDigits) return justDigits[0];
  const urlId = trimmed.match(/CourseID=(\d+)/i);
  if (urlId) return urlId[1];
  return null;
}

async function fetchCourseText(courseId) {
  const targetUrl = `https://ncrdb.usga.org/courseTeeInfo?CourseID=${courseId}`;
  const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
  const resp = await fetch(proxied, { headers: { 'Accept': 'text/html,text/plain' } });
  if (!resp.ok) throw new Error(`Import request failed (${resp.status})`);
  return { text: await resp.text(), targetUrl };
}

function parseUSGATeeText(sourceText, sourceUrl='') {
  const text = sourceText.replace(/\r/g, '');
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
  const titleLineIndex = lines.findIndex(line => /Club\/Course Name City State\/Province/i.test(line));
  let courseName = 'Imported Course';
  let city = '';
  let state = '';
  if (titleLineIndex >= 0 && lines[titleLineIndex + 1]) {
    const raw = lines[titleLineIndex + 1];
    // Expected pattern like: Prairieview Golf Club - Prairieview Golf Club Byron IL
    const m = raw.match(/^(.*?)\s+-\s+(.*?)\s+([A-Za-z .'-]+)\s+([A-Z]{2}|[A-Za-z ]+)$/);
    if (m) {
      courseName = m[2].trim();
      city = m[3].trim();
      state = m[4].trim();
    } else {
      courseName = raw.trim();
    }
  }
  const tees = [];
  const teePattern = /^(.*?)\s+(M|F)\s+(\d{2})\s+(\d{2,3}\.\d)\s+(\d{2,3}\.\d)\s+(\d{2,3})(?:\s+.*)?\s+(\d{5,7})\s+(\d{3,5})$/;
  for (const line of lines) {
    const m = line.match(teePattern);
    if (!m) continue;
    tees.push({
      teeName: m[1].trim(),
      gender: m[2],
      par: Number(m[3]),
      rating: Number(m[4]),
      bogeyRating: Number(m[5]),
      slope: Number(m[6]),
      teeId: m[7],
      length: Number(m[8])
    });
  }
  if (!tees.length) throw new Error('No tee rows were found. Try the manual paste option from the actual USGA tee page text.');
  return { name: courseName, city, state, country: 'United States of America', tees, sourceUrl };
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

document.getElementById('playerForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.players.push({ id: uid(), name: fd.get('name').trim(), index: Number(fd.get('index')) });
  e.target.reset();
  persist();
  toast('Player saved.');
});

document.getElementById('courseForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.courses.push({
    id: uid(),
    name: fd.get('name').trim(),
    city: fd.get('city').trim(),
    state: fd.get('state').trim(),
    country: fd.get('country').trim(),
    tees: []
  });
  e.target.reset();
  persist();
  toast('Course created.');
});

document.getElementById('teeForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const course = state.courses.find(c => c.id === fd.get('courseId'));
  if (!course) return toast('Pick a course first.');
  course.tees.push({
    teeName: fd.get('teeName').trim(),
    gender: fd.get('gender'),
    par: Number(fd.get('par')),
    rating: Number(fd.get('rating')),
    slope: Number(fd.get('slope')),
    length: Number(fd.get('length')) || null
  });
  e.target.reset();
  persist();
  toast('Tee set saved.');
});

document.getElementById('coursesList').addEventListener('click', e => {
  const courseId = e.target.getAttribute('data-delete-course');
  if (courseId) {
    const idx = state.courses.findIndex(c => c.id === courseId);
    if (idx >= 0) {
      state.courses.splice(idx, 1);
      persist();
      toast('Course deleted.');
    }
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
  }
});

document.getElementById('importForm').addEventListener('submit', async e => {
  e.preventDefault();
  const source = document.getElementById('importSource').value;
  const courseId = parseCourseId(source);
  if (!courseId) return toast('Paste a CourseID or a full USGA tee page URL.');
  try {
    toast('Importing tee page...');
    const { text, targetUrl } = await fetchCourseText(courseId);
    const parsed = parseUSGATeeText(text, targetUrl);
    showImportPreview(parsed);
    toast('Import ready to save.');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Import failed.');
  }
});

document.getElementById('sampleImportBtn').addEventListener('click', () => {
  const sample = `Course Rating Search Results\nClub/Course Name City State/Province\nPrairieview Golf Club - Prairieview Golf Club Byron IL\nTee Name Gender Par Course Rating Bogey Rating Slope Rating RatingF9 RatingB9 Front (9) Back (9) Bogey Rating (F9) Bogey Rating (B9) Slope (F9) Slope (B9) TeeID Length CH\nBlack M 72 73.9 99.4 138 36.8 37.1 36.8 / 135 37.1 / 140 49.3 50.1 135 135 313333 7001\nBlue M 72 72.0 96.9 133 36.0 36.0 36.0 / 134 36.0 / 132 48.5 48.4 134 134 313332 6574\nWhite M 72 69.7 93.4 127 34.9 34.8 34.9 / 127 34.8 / 127 46.8 46.6 127 127 504017 6099\nBlue F 72 78.1 110.7 138 39.3 38.8 39.3 / 138 38.8 / 138 55.6 55.1 138 138 920060 6574\nWhite F 72 75.3 106.3 132 37.8 37.5 37.8 / 132 37.5 / 131 53.4 52.9 132 132 504016 6099`;
  try {
    showImportPreview(parseUSGATeeText(sample, 'https://ncrdb.usga.org/courseTeeInfo?CourseID=7300'));
    toast('Sample loaded.');
  } catch (err) {
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
    toast(err.message || 'Could not parse pasted text.');
  }
});

document.getElementById('saveImportedCourseBtn').addEventListener('click', saveImportedCourse);
document.getElementById('discardImportBtn').addEventListener('click', discardImport);
document.getElementById('pasteTextBtn').addEventListener('click', () => {
  document.querySelector('details').open = true;
  document.getElementById('manualSourceText').focus();
});

document.getElementById('calcCourse').addEventListener('change', populateCalcTees);
document.getElementById('calcForm').addEventListener('submit', e => {
  e.preventDefault();
  const player = state.players.find(p => p.id === document.getElementById('calcPlayer').value);
  const course = state.courses.find(c => c.id === document.getElementById('calcCourse').value);
  const tee = course?.tees?.[Number(document.getElementById('calcTee').value)];
  const allowance = Number(document.getElementById('calcAllowance').value || 100);
  if (!player || !course || !tee) return toast('Pick a player, course, and tee.');
  const ch = courseHandicap(player.index, tee.slope, tee.rating, tee.par);
  const ph = playingHandicap(ch, allowance);
  document.getElementById('calcResult').innerHTML = `
    <strong>${escapeHtml(player.name)}</strong><br>
    ${escapeHtml(course.name)} · ${escapeHtml(tee.teeName)} · ${tee.gender === 'F' ? 'Women' : 'Men'}<br>
    Course Handicap: <strong>${ch}</strong><br>
    Playing Handicap (${allowance}%): <strong>${ph}</strong>
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

renderAll();
