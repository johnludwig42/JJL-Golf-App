const DYE_LEDGER_ADAPTER_MODE = typeof window !== 'undefined' && !!window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__;
const STORAGE_KEY = 'the-dye-ledger-v20';
const BUILD_INFO = {
  version: 'v30.3.62',
  versionNumber: '30.3.62',
  cacheName: 'the-dye-ledger-v30.3.62',
  buildDate: new Date().toISOString(),
  buildLabel: 'Match Summary v2 / Analyst Report Layout'
};
const APP_VERSION = BUILD_INFO.version;
const BUILD_TIMESTAMP = BUILD_INFO.buildDate;
const BUILD_LABEL = BUILD_INFO.buildLabel;
const APP_CACHE_NAME = BUILD_INFO.cacheName;
const APP_VERSION_NUMBER = BUILD_INFO.versionNumber;

const MATCH_TEMPLATES_STORAGE_KEY = 'dyeLedger.matchTemplates.v1';
const DEFAULT_SMART_SCORE_ADVANCE = true;
const SMART_SCORE_ADVANCE_PRESETS = {
  fast: { label: 'Fast', delay: 500 },
  normal: { label: 'Normal', delay: 750 },
  relaxed: { label: 'Relaxed', delay: 1000 }
};
const DEFAULT_SMART_SCORE_ADVANCE_PRESET = 'normal';
const WEATHER_CAPTURE_SOURCE = 'open-meteo';
const WEATHER_CAPTURE_TIMEOUT_MS = 5000;
const WEATHER_GEOLOCATION_MAX_AGE_MS = 10 * 60 * 1000;
const WEATHER_LAT_LON_PRECISION = 2;



const APP_ERROR_STORAGE_KEY = 'dye-ledger-recent-app-errors';
const APP_ERROR_LIMIT = 20;

function normalizeAppError(error) {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const message = error.message || error.reason || JSON.stringify(error);
    const normalized = new Error(String(message || 'Unknown app error'));
    normalized.name = error.name || 'AppError';
    if (error.stack) normalized.stack = error.stack;
    return normalized;
  }
  return new Error(String(error || 'Unknown app error'));
}

function readRecentAppErrors() {
  try {
    const raw = localStorage.getItem(APP_ERROR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, APP_ERROR_LIMIT) : [];
  } catch (err) {
    return [];
  }
}

function writeRecentAppErrors(errors) {
  try {
    const bounded = Array.isArray(errors) ? errors.slice(0, APP_ERROR_LIMIT) : [];
    localStorage.setItem(APP_ERROR_STORAGE_KEY, JSON.stringify(bounded));
  } catch (err) {
    // Ignore diagnostics storage failures.
  }
}

function getSafeUserAgent() {
  try { return navigator.userAgent || ''; } catch (err) { return ''; }
}

function getSafeUrl() {
  try { return window.location.href || ''; } catch (err) { return ''; }
}

function recordAppError(error, context = 'App') {
  try {
    const normalized = normalizeAppError(error);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      context: String(context || 'App'),
      name: normalized.name || 'Error',
      message: normalized.message || 'Unknown app error',
      stack: normalized.stack || '',
      appVersion: APP_VERSION,
      buildDate: BUILD_TIMESTAMP,
      cacheName: APP_CACHE_NAME,
      url: getSafeUrl(),
      userAgent: getSafeUserAgent()
    };
    const existing = readRecentAppErrors();
    writeRecentAppErrors([entry, ...existing]);
    return entry;
  } catch (diagnosticsError) {
    console.warn('Unable to record app error', diagnosticsError);
    return null;
  }
}

function clearRecentAppErrors() {
  writeRecentAppErrors([]);
  renderRecentAppErrorsDiagnostics();
}

function formatDiagnosticsTimestamp(timestamp) {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp || 'Unknown time');
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date) + ' ET';
  } catch (err) {
    return String(timestamp || 'Unknown time');
  }
}

function getMatchSetupDiagnosticsText() {
  try {
    if (typeof getMatchSetupDiagnosticSnapshot !== 'function') return 'Match Setup Diagnostics: unavailable';
    const diag = getMatchSetupDiagnosticSnapshot();
    return [
      'Match Setup Diagnostics:',
      `Ready: ${diag?.ready ? 'Yes' : 'No'}`,
      `Missing Requirements: ${(diag?.missingRequirements || []).join(', ') || 'None'}`,
      `Course Selected: ${diag?.summary?.courseSelected ? 'Yes' : 'No'}`,
      `Tee Selected: ${diag?.summary?.teeSelected ? 'Yes' : 'No'}`,
      `Players: ${diag?.summary?.playerCount ?? 'Unknown'}`,
      `Selected Holes: ${diag?.summary?.selectedHoleCount ?? 'Unknown'}`,
      `Shared Match: ${diag?.summary?.sharedMatchEnabled ? 'Yes' : 'No'}`,
      `Assignments Complete: ${diag?.summary?.assignmentsComplete ?? 'N/A'}`,
      `Round Started: ${diag?.summary?.roundStarted ? 'Yes' : 'No'}`
    ].join('\n');
  } catch (err) {
    return `Match Setup Diagnostics: unavailable (${err.message || err})`;
  }
}

function getAppDiagnosticsText() {
  const errors = readRecentAppErrors().slice(0, 5);
  const lines = [
    'The Dye Ledger Diagnostics',
    `App Version: ${APP_VERSION}`,
    `Build Date: ${formatDiagnosticsTimestamp(BUILD_TIMESTAMP)}`,
    `Build Label: ${BUILD_LABEL}`,
    `Cache Name: ${APP_CACHE_NAME}`,
    `URL: ${getSafeUrl()}`,
    `User Agent: ${getSafeUserAgent()}`,
    '',
    getMatchSetupDiagnosticsText(),
    '',
    'Recent App Errors:'
  ];
  if (!errors.length) {
    lines.push('None');
  } else {
    errors.forEach((err, index) => {
      lines.push('');
      lines.push(`#${index + 1} ${formatDiagnosticsTimestamp(err.timestamp)}`);
      lines.push(`Context: ${err.context || 'App'}`);
      lines.push(`${err.name || 'Error'}: ${err.message || 'Unknown error'}`);
      if (err.stack) lines.push(`Stack:\n${err.stack}`);
    });
  }
  return lines.join('\n');
}

async function copyAppDiagnostics() {
  const text = getAppDiagnosticsText();
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      toast('Diagnostics copied.');
      return;
    }
  } catch (err) {
    recordAppError(err, 'Copy Diagnostics');
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
    toast('Diagnostics copied.');
  } catch (err) {
    recordAppError(err, 'Copy Diagnostics Fallback');
    toast('Unable to copy diagnostics automatically.');
  }
}

function installGlobalErrorHandlers() {
  if (DYE_LEDGER_ADAPTER_MODE) return;
  if (window.__dyeLedgerErrorHandlersInstalled) return;
  window.__dyeLedgerErrorHandlersInstalled = true;
  window.addEventListener('error', event => {
    const error = event.error || new Error(event.message || 'Unhandled script error');
    recordAppError(error, 'Unhandled Error');
    renderRecentAppErrorsDiagnostics();
  });
  window.addEventListener('unhandledrejection', event => {
    recordAppError(event.reason || new Error('Unhandled promise rejection'), 'Unhandled Promise Rejection');
    renderRecentAppErrorsDiagnostics();
  });
}

installGlobalErrorHandlers();


function cssEscape(value) {
  const text = String(value == null ? '' : value);
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const GAME_LIBRARY = [
  { key: 'nassau', label: 'Nassau' },
  { key: 'singles_match', label: 'Singles Match Play' },
  { key: 'individual_match', label: 'Head-to-Head Side Match' },
  { key: 'team_match', label: 'Team Match Play' },
  { key: 'team_stroke', label: 'Team Stroke Play' },
  { key: 'skins', label: 'Skins' },
  { key: 'net_skins', label: 'Net Skins' },
  { key: 'greenies', label: 'Greenies' },
  { key: 'sneaky_sandy_poley', label: 'Sneaky / Sandy / Poley' },
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
const SHARED_PARTICIPANT_REFRESH_MS = 30000;
const SHARED_CONNECTION_FAST_REFRESH_MS = 3000;
const SHARED_CONNECTION_FAST_REFRESH_DURATION_MS = 60000;
const SHARED_SCORE_REFRESH_MS = 30000;
let sharedScoreRefreshTimer = null;
const SHARED_DEVICE_ID_KEY = 'the-dye-ledger-shared-device-id';
const SHARED_DEVICE_NAME_KEY = 'dyeLedgerSharedDeviceName';
const SHARED_PARTICIPANT_ID_PREFIX = 'dyeLedgerSharedParticipantId:';
let sharedParticipantRefreshTimer = null;
let sharedConnectionFastRefreshTimer = null;
let sharedConnectionFastRefreshUntil = 0;
let sharedParticipantPanelRefreshPending = false;
let latestSharedAssignmentMetadataSnapshot = null;
let sharedAssignmentDropdownRefreshAt = 0;
let pendingScoreCommitFocus = null;
let scoreAutoAdvanceGeneration = 0;
const scoreInputSessionState = new Map();
let pendingScoreAutoAdvanceTimer = null;
let pendingScoreAutoAdvancePlayerId = null;
const SCORE_ENTRY_MODES = {
  single_device: 'One device scores for everyone',
  assigned_players: 'Assigned Players Score Entry',
  team_codes: 'Each team enters its own scores (legacy)',
  open_edit: 'Anyone can enter scores (future)',
};

function normalizeSmartScoreAdvancePreset(value) {
  const key = String(value || '').trim().toLowerCase();
  return SMART_SCORE_ADVANCE_PRESETS[key] ? key : DEFAULT_SMART_SCORE_ADVANCE_PRESET;
}

function getSmartScoreAdvanceDelay(match = getActiveMatch()) {
  const preset = normalizeSmartScoreAdvancePreset(match?.smartScoreAdvancePreset);
  return SMART_SCORE_ADVANCE_PRESETS[preset].delay;
}

function getSmartScoreAdvancePresetLabel(value) {
  const preset = normalizeSmartScoreAdvancePreset(value);
  return SMART_SCORE_ADVANCE_PRESETS[preset].label;
}
const LEGACY_SCORE_ENTRY_MODE_MAP = {
  official_scorer: 'single_device',
  team_input: 'assigned_players',
  single_device: 'single_device',
  assigned_players: 'assigned_players',
  team_codes: 'assigned_players',
  open_edit: 'open_edit',
};
const SCORE_ACCESS_ROLE_LABELS = {
  event_admin: 'Event Admin',
  official_scorer: 'Official Scorer',
  team_scorer: 'Team Scorer',
  viewer: 'Viewer',
};
function getGameLabel(key) {
  const resolvedKey = typeof key === 'object' && key !== null ? key.key : key;
  const label = GAME_LABELS[resolvedKey] || resolvedKey;
  return String(label || '').trim();
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

function getSharedDeviceId() {
  let id = '';
  try { id = localStorage.getItem(SHARED_DEVICE_ID_KEY) || ''; } catch {}
  if (!id) {
    id = `device-${uid()}`;
    try { localStorage.setItem(SHARED_DEVICE_ID_KEY, id); } catch {}
  }
  return id;
}
function getStoredSharedDeviceName() {
  try { return String(localStorage.getItem(SHARED_DEVICE_NAME_KEY) || '').trim(); } catch { return ''; }
}
function setStoredSharedDeviceName(name = '') {
  const normalized = String(name || '').trim().slice(0, 40);
  if (!normalized) return '';
  try { localStorage.setItem(SHARED_DEVICE_NAME_KEY, normalized); } catch {}
  return normalized;
}
function getPreferredSharedDeviceName(fallback = 'Joined Device') {
  return getStoredSharedDeviceName() || fallback || 'Joined Device';
}
function makeSharedDeviceDisplayName(device = {}, match = null, index = 0) {
  const id = String(device?.id || device?.deviceId || device?.sharedDeviceId || '').trim();
  const hostId = String(match?.sharedHostDeviceId || '').trim();
  if (hostId && id && id === hostId) return String(device?.name || device?.deviceName || 'Host Device').trim() || 'Host Device';
  const raw = String(device?.name || device?.deviceName || device?.label || '').trim();
  if (raw && raw !== 'Device' && raw !== 'This Device') return raw;
  const suffix = id ? id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() : String(index + 1);
  return suffix ? `Joined Device ${suffix}` : 'Joined Device';
}
function getSharedDeviceName(match = null, deviceId = null) {
  const id = deviceId || getSharedDeviceId();
  const devices = Array.isArray(match?.sharedDevices) ? match.sharedDevices : [];
  const existing = devices.find(d => String(d.id) === String(id));
  if (existing?.name) return existing.name;
  if (match?.sharedHostDeviceId === id) return 'Host Device';
  if (String(id) === String(getSharedDeviceId())) return getPreferredSharedDeviceName('Joined Device');
  return makeSharedDeviceDisplayName({ id }, match);
}
function normalizeMatchCode(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  const digitsOnly = compact.replace(/[^0-9]/g, '');
  if (/^\d{6}$/.test(compact)) return `DYE-${compact}`;
  if (/^DYE-?\d{6}$/.test(compact)) return `DYE-${compact.replace(/^DYE-?/, '')}`;
  if (/^DYE\d{6}$/.test(compact)) return `DYE-${compact.slice(3)}`;
  if (digitsOnly.length === 6 && compact.startsWith('DYE')) return `DYE-${digitsOnly}`;
  return compact.slice(0, 16);
}
function generateSharedMatchCode() {
  const n = Math.floor(Math.random() * 1000000);
  return `DYE-${String(n).padStart(6, '0')}`;
}
function isCanonicalSharedMatchCode(value = '') {
  return /^DYE-\d{6}$/.test(normalizeMatchCode(value));
}

function getDefaultSharedDeviceLabel(match = null, deviceId = null) {
  const id = deviceId || getSharedDeviceId();
  if (match?.sharedHostDeviceId && String(match.sharedHostDeviceId) === String(id)) return 'Host Device';
  return 'Joined Device';
}
function normalizeSharedDeviceRecord(device = {}, fallbackName = '') {
  const id = String(device?.id || device?.sharedDeviceId || device?.deviceId || '').trim();
  if (!id) return null;
  const name = String(device?.name || device?.deviceName || device?.label || fallbackName || '').trim();
  return {
    id,
    name: name || 'Joined Device',
    joinedAt: device?.joinedAt || device?.joined_at || new Date().toISOString(),
    lastSeenAt: device?.lastSeenAt || device?.last_seen_at || device?.lastSeen || new Date().toISOString(),
  };
}
function normalizeSharedDeviceList(devices = [], match = null) {
  const map = new Map();
  (Array.isArray(devices) ? devices : []).forEach(device => {
    const normalized = normalizeSharedDeviceRecord(device);
    if (!normalized) return;
    const prior = map.get(normalized.id) || {};
    map.set(normalized.id, { ...prior, ...normalized, name: normalized.name || prior.name || getDefaultSharedDeviceLabel(match, normalized.id) });
  });
  const hostId = match?.sharedHostDeviceId || '';
  if (hostId && !map.has(hostId)) {
    map.set(hostId, { id: hostId, name: 'Host Device', joinedAt: match?.createdAt || new Date().toISOString(), lastSeenAt: match?.lastCloudSyncAt || new Date().toISOString() });
  }
  return Array.from(map.values()).map((device, idx) => {
    const displayName = makeSharedDeviceDisplayName(device, match, idx);
    return { ...device, name: displayName, deviceName: displayName };
  });
}

function getSharedParticipantStorageKey(match = null) {
  const sharedId = String(match?.sharedMatchId || match?.sharedMatchRef || match?.sharedMatchCode || match?.id || 'default').trim() || 'default';
  return `${SHARED_PARTICIPANT_ID_PREFIX}${sharedId}`;
}
function getStoredSharedParticipantId(match = null) {
  try { return String(localStorage.getItem(getSharedParticipantStorageKey(match)) || '').trim(); } catch { return ''; }
}
function setStoredSharedParticipantId(match = null, participantId = '') {
  const id = String(participantId || '').trim();
  if (!id) return '';
  try { localStorage.setItem(getSharedParticipantStorageKey(match), id); } catch {}
  return id;
}
function fallbackParticipantIdForDevice(deviceId = '') {
  const id = String(deviceId || '').trim();
  return id ? `participant-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}` : `participant-${uid()}`;
}
function normalizeSharedParticipantRecord(record = {}, match = null, index = 0) {
  const deviceId = String(record?.deviceId || record?.sharedDeviceId || record?.idDevice || record?.device_id || record?.device?.id || '').trim();
  let participantId = String(record?.participantId || record?.participant_id || record?.id || '').trim();
  if (!participantId && deviceId) participantId = fallbackParticipantIdForDevice(deviceId);
  if (!participantId) return null;
  const role = String(record?.role || (match?.sharedHostDeviceId && deviceId && String(deviceId) === String(match.sharedHostDeviceId) ? 'host' : 'participant') || 'participant').trim();
  const deviceName = String(record?.deviceName || record?.name || record?.label || '').trim();
  const deviceLike = deviceId ? { id: deviceId, name: deviceName, deviceName } : { id: participantId, name: deviceName, deviceName };
  const displayName = role === 'host' || role === 'organizer' || (match?.sharedHostDeviceId && deviceId && String(deviceId) === String(match.sharedHostDeviceId))
    ? (deviceName || 'Host Device')
    : makeSharedDeviceDisplayName(deviceLike, match, index);
  return {
    participantId,
    id: participantId,
    deviceId,
    deviceName: displayName,
    name: displayName,
    role: role === 'organizer' ? 'host' : role,
    joinedAt: record?.joinedAt || record?.joined_at || new Date().toISOString(),
    lastSeenAt: record?.lastSeenAt || record?.last_seen_at || record?.lastSeen || new Date().toISOString(),
    legacyDeviceId: deviceId,
  };
}
function participantsFromDevices(devices = [], match = null) {
  return (Array.isArray(devices) ? devices : []).map((device, idx) => normalizeSharedParticipantRecord({
    participantId: device?.participantId || device?.participant_id || '',
    deviceId: device?.id || device?.deviceId || device?.sharedDeviceId || '',
    deviceName: device?.name || device?.deviceName || '',
    role: match?.sharedHostDeviceId && String(device?.id || device?.deviceId || '') === String(match.sharedHostDeviceId) ? 'host' : 'participant',
    joinedAt: device?.joinedAt || device?.joined_at || '',
    lastSeenAt: device?.lastSeenAt || device?.last_seen_at || device?.lastSeen || '',
  }, match, idx)).filter(Boolean);
}
function normalizeSharedParticipantList(participants = [], devices = [], match = null) {
  const map = new Map();
  const add = (record, idx = 0) => {
    const normalized = normalizeSharedParticipantRecord(record, match, idx);
    if (!normalized) return;
    const prior = map.get(normalized.participantId) || {};
    map.set(normalized.participantId, {
      ...prior,
      ...normalized,
      deviceName: normalized.deviceName || prior.deviceName || normalized.name || prior.name || 'Joined Device',
      name: normalized.name || normalized.deviceName || prior.name || prior.deviceName || 'Joined Device',
      lastSeenAt: normalized.lastSeenAt || prior.lastSeenAt,
      joinedAt: prior.joinedAt || normalized.joinedAt,
    });
  };
  (Array.isArray(participants) ? participants : []).forEach(add);
  participantsFromDevices(devices, match).forEach(add);
  const hostDeviceId = String(match?.sharedHostDeviceId || '').trim();
  if (hostDeviceId) {
    const hostParticipantId = String(match?.sharedHostParticipantId || '').trim() || fallbackParticipantIdForDevice(hostDeviceId);
    add({ participantId: hostParticipantId, deviceId: hostDeviceId, deviceName: 'Host Device', role: 'host', joinedAt: match?.createdAt || '', lastSeenAt: match?.lastCloudSyncAt || '' });
  }
  const currentDeviceId = getSharedDeviceId();
  const currentStoredParticipantId = getStoredSharedParticipantId(match);
  if (currentDeviceId && currentStoredParticipantId) {
    const current = Array.from(map.values()).find(p => String(p.deviceId) === String(currentDeviceId));
    if (current && String(current.participantId) !== String(currentStoredParticipantId)) {
      map.delete(current.participantId);
      map.set(currentStoredParticipantId, { ...current, participantId: currentStoredParticipantId, id: currentStoredParticipantId });
    }
  }
  return Array.from(map.values());
}
function ensureSharedParticipantRegistered(match, preferredName = '') {
  if (!match || match.storageMode !== 'shared') return '';
  ensureSharedDeviceRegistered(match, preferredName);
  const deviceId = getSharedDeviceId();
  const now = new Date().toISOString();
  match.sharedParticipants = normalizeSharedParticipantList(match.sharedParticipants || [], match.sharedDevices || [], match);
  let participantId = getStoredSharedParticipantId(match);
  const existingForDevice = match.sharedParticipants.find(p => String(p.deviceId) === String(deviceId));
  if (!participantId && existingForDevice?.participantId) participantId = existingForDevice.participantId;
  if (!participantId) participantId = fallbackParticipantIdForDevice(deviceId);
  setStoredSharedParticipantId(match, participantId);
  const isHost = match.sharedHostDeviceId && String(match.sharedHostDeviceId) === String(deviceId);
  if (isHost) match.sharedHostParticipantId = match.sharedHostParticipantId || participantId;
  const fallbackName = isHost ? 'Host Device' : (preferredName || getPreferredSharedDeviceName('Joined Device'));
  const record = { participantId, deviceId, deviceName: fallbackName, role: isHost ? 'host' : 'participant', joinedAt: existingForDevice?.joinedAt || now, lastSeenAt: now };
  match.sharedParticipants = normalizeSharedParticipantList([...(match.sharedParticipants || []), record], match.sharedDevices || [], match);
  return participantId;
}
function getCurrentSharedParticipantId(match = null) {
  if (!match || match.storageMode !== 'shared') return '';
  return ensureSharedParticipantRegistered(match, isCurrentDeviceMatchHost(match) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
}
function getSharedAssignmentParticipants(match) {
  if (!match) return [];
  match.sharedParticipants = normalizeSharedParticipantList(match.sharedParticipants || [], match.sharedDevices || [], match);
  return match.sharedParticipants;
}
function getSharedParticipantById(match, participantId) {
  const id = String(participantId || '').trim();
  return getSharedAssignmentParticipants(match).find(p => String(p.participantId) === id) || null;
}
function getSharedParticipantByDeviceId(match, deviceId) {
  const id = String(deviceId || '').trim();
  return getSharedAssignmentParticipants(match).find(p => String(p.deviceId) === id || String(p.legacyDeviceId || '') === id) || null;
}
function getSharedParticipantName(match, participantId = '') {
  const p = getSharedParticipantById(match, participantId);
  return p?.deviceName || p?.name || (participantId ? 'Unknown participant' : 'Unassigned');
}
function resolveAssignmentValueToParticipantId(match, value) {
  const raw = String(value || '').trim();
  if (!raw || !match) return '';
  if (getSharedParticipantById(match, raw)) return raw;
  const byDevice = getSharedParticipantByDeviceId(match, raw);
  if (byDevice?.participantId) return byDevice.participantId;
  return raw;
}
function migrateSharedPlayerAssignmentsToParticipants(match) {
  if (!match || match.storageMode !== 'shared') return false;
  ensureSharedParticipantRegistered(match, isCurrentDeviceMatchHost(match) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
  const assignments = match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object' ? match.sharedPlayerAssignments : {};
  const next = {};
  let changed = false;
  Object.keys(assignments).forEach(playerId => {
    const prior = String(assignments[playerId] || '').trim();
    const resolved = resolveAssignmentValueToParticipantId(match, prior);
    next[playerId] = resolved;
    if (resolved !== prior) changed = true;
  });
  match.sharedPlayerAssignments = next;
  return changed;
}
function getSharedMembershipDeviceRecord(row = {}, match = null) {
  const raw = String(row?.device_label || '').trim();
  let parsed = null;
  if (raw && raw.startsWith('{')) {
    try { parsed = JSON.parse(raw); } catch {}
  }
  const id = String(parsed?.sharedDeviceId || parsed?.deviceId || row?.shared_device_id || '').trim();
  if (!id) return null;
  const role = String(row?.role || '').toLowerCase() === 'organizer' ? 'Host Device' : '';
  return normalizeSharedDeviceRecord({
    id,
    participantId: parsed?.participantId || '',
    name: parsed?.deviceName || parsed?.name || role || '',
    joinedAt: row?.joined_at || parsed?.joinedAt || '',
    lastSeenAt: row?.last_seen_at || parsed?.lastSeenAt || '',
  }, role || 'Joined Device');
}
function getSharedMembershipParticipantRecord(row = {}, match = null) {
  const raw = String(row?.device_label || '').trim();
  let parsed = null;
  if (raw && raw.startsWith('{')) {
    try { parsed = JSON.parse(raw); } catch {}
  }
  const deviceId = String(parsed?.sharedDeviceId || parsed?.deviceId || row?.shared_device_id || '').trim();
  if (!deviceId) return null;
  const isHost = String(row?.role || '').toLowerCase() === 'organizer';
  return normalizeSharedParticipantRecord({
    participantId: parsed?.participantId || '',
    deviceId,
    deviceName: parsed?.deviceName || parsed?.name || (isHost ? 'Host Device' : ''),
    role: isHost ? 'host' : 'participant',
    joinedAt: row?.joined_at || parsed?.joinedAt || '',
    lastSeenAt: row?.last_seen_at || parsed?.lastSeenAt || '',
  }, match || { sharedHostDeviceId: '' });
}
function getSharedDeviceLabelPayload(match = null) {
  const id = getSharedDeviceId();
  const participantId = match?.storageMode === 'shared' ? getCurrentSharedParticipantId(match) : '';
  const label = match?.sharedHostDeviceId && String(match.sharedHostDeviceId) !== String(id) ? getPreferredSharedDeviceName(getSharedDeviceName(match, id) || 'Joined Device') : (getSharedDeviceName(match, id) || getDefaultSharedDeviceLabel(match, id));
  return JSON.stringify({ sharedDeviceId: id, participantId, deviceName: label, userAgent: navigator.userAgent.slice(0, 120) });
}

async function upsertSharedMembershipForCurrentDevice(match, { role = null } = {}) {
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  const client = await ensureSupabaseClient();
  if (!client) return false;
  const user = await getSupabaseUser();
  if (!user?.id) return false;
  ensureSharedParticipantRegistered(match, isCurrentDeviceMatchHost(match) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
  const now = new Date().toISOString();
  const memberRole = role || (isCurrentDeviceMatchHost(match) ? 'organizer' : 'team_scorer');
  const membership = {
    id: `${match.sharedMatchId}:member:${user.id}:${getSharedDeviceId()}`,
    match_id: match.sharedMatchId,
    user_id: user.id,
    role: memberRole === 'organizer' ? 'organizer' : 'team_scorer',
    team_id: null,
    team_number: null,
    status: 'active',
    joined_at: now,
    last_seen_at: now,
    device_label: getSharedDeviceLabelPayload(match),
  };
  const { error } = await client.from('match_memberships').upsert(membership, { onConflict: 'id' });
  if (error) throw error;
  return true;
}
async function publishCurrentSharedDeviceToCloudMetadata(match) {
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  const client = await ensureSupabaseClient();
  if (!client) return false;
  ensureSharedParticipantRegistered(match, isCurrentDeviceMatchHost(match) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
  const { data: matchRow, error: readError } = await client.from('matches').select('id,course_snapshot').eq('id', match.sharedMatchId).maybeSingle();
  if (readError) throw readError;
  const snapshot = matchRow?.course_snapshot && typeof matchRow.course_snapshot === 'object' ? matchRow.course_snapshot : {};
  const existingMeta = snapshot.sharedMatchMeta && typeof snapshot.sharedMatchMeta === 'object' ? snapshot.sharedMatchMeta : {};
  const devices = normalizeSharedDeviceList([...(Array.isArray(existingMeta.devices) ? existingMeta.devices : []), ...(match.sharedDevices || [])], match);
  const participants = normalizeSharedParticipantList([...(Array.isArray(existingMeta.participants) ? existingMeta.participants : []), ...(match.sharedParticipants || [])], devices, match);
  match.sharedParticipants = participants;
  migrateSharedPlayerAssignmentsToParticipants(match);
  const nextSnapshot = {
    ...snapshot,
    sharedMatchMeta: {
      ...existingMeta,
      scoringAccessMode: normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || existingMeta.scoringAccessMode || 'single_device'),
      matchCode: normalizeMatchCode(match.sharedMatchCode || match.sharedMatchRef || match.sharedMatchId || existingMeta.matchCode || ''),
      hostDeviceId: match.sharedHostDeviceId || existingMeta.hostDeviceId || '',
      hostParticipantId: match.sharedHostParticipantId || existingMeta.hostParticipantId || getCurrentSharedParticipantId(match),
      devices,
      participants,
      playerAssignments: isCurrentDeviceMatchHost(match)
        ? { ...((match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object') ? match.sharedPlayerAssignments : {}) }
        : (existingMeta.playerAssignments && typeof existingMeta.playerAssignments === 'object' ? existingMeta.playerAssignments : (match.sharedPlayerAssignments || {})),
      memories: mergeRoundMemoryLists(existingMeta.memories || [], match.memories || []),
      memoriesUpdatedAt: existingMeta.memoriesUpdatedAt || null,
    },
  };
  const { error: updateError } = await client.from('matches').update({ course_snapshot: nextSnapshot, updated_at: new Date().toISOString() }).eq('id', match.sharedMatchId);
  if (updateError) throw updateError;
  mergeSharedDevices(match, devices);
  return true;
}
function mergeSharedDevices(match, incomingDevices = []) {
  if (!match || !Array.isArray(incomingDevices) || !incomingDevices.length) return false;
  const before = JSON.stringify(normalizeSharedDeviceList(match.sharedDevices || [], match));
  const merged = normalizeSharedDeviceList([...(match.sharedDevices || []), ...incomingDevices], match);
  match.sharedDevices = merged;
  return JSON.stringify(merged) !== before;
}
function ensureSharedDeviceRegistered(match, preferredName = '') {
  if (!match) return '';
  const id = getSharedDeviceId();
  const now = new Date().toISOString();
  match.sharedDevices = normalizeSharedDeviceList(match.sharedDevices || [], match);
  const existing = match.sharedDevices.find(d => String(d.id) === String(id));
  const fallbackName = preferredName || (match.sharedHostDeviceId && String(match.sharedHostDeviceId) !== String(id) ? getPreferredSharedDeviceName('Joined Device') : getDefaultSharedDeviceLabel(match, id));
  if (!existing) {
    match.sharedDevices.push({ id, name: fallbackName, joinedAt: now, lastSeenAt: now });
  } else {
    match.sharedDevices = match.sharedDevices.map(d => String(d.id) === String(id) ? { ...d, name: d.name || fallbackName, lastSeenAt: now } : d);
  }
  if (!match.sharedHostDeviceId) match.sharedHostDeviceId = id;
  match.sharedDevices = normalizeSharedDeviceList(match.sharedDevices, match);
  return id;
}
function isAssignedPlayersMode(match) {
  return normalizeScoringAccessMode(match?.scoringAccessMode || match?.scoreEntryMode || 'single_device') === 'assigned_players';
}
function getAssignedParticipantForPlayer(match, playerId) {
  if (!match) return '';
  migrateSharedPlayerAssignmentsToParticipants(match);
  const assignments = match?.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object' ? match.sharedPlayerAssignments : {};
  return assignments[String(playerId || '')] || '';
}
function getAssignedDeviceForPlayer(match, playerId) {
  const assignedParticipantId = getAssignedParticipantForPlayer(match, playerId);
  const participant = getSharedParticipantById(match, assignedParticipantId);
  return participant?.deviceId || assignedParticipantId || '';
}
function canCurrentDeviceEditPlayer(match, playerId) {
  if (!match || !playerId) return false;
  if (!isAssignedPlayersMode(match)) return true;
  const currentParticipantId = getCurrentSharedParticipantId(match);
  if (isCurrentDeviceMatchHost(match)) return true;
  const assigned = getAssignedParticipantForPlayer(match, playerId);
  if (!assigned) return false;
  if (!getSharedParticipantById(match, assigned)) return false;
  if (latestSharedAssignmentMetadataSnapshot?.matchId && String(latestSharedAssignmentMetadataSnapshot.matchId) === String(match.sharedMatchId || match.sharedMatchRef || match.id)) {
    const cloudAssignments = latestSharedAssignmentMetadataSnapshot.playerAssignments;
    if (cloudAssignments && typeof cloudAssignments === 'object' && Object.prototype.hasOwnProperty.call(cloudAssignments, String(playerId))) {
      const cloudAssigned = resolveAssignmentValueToParticipantId(match, cloudAssignments[String(playerId)]);
      if (cloudAssigned && String(cloudAssigned) !== String(assigned)) return false;
    }
  }
  return String(assigned) === String(currentParticipantId);
}

function getSharedLocallyOwnedPlayerIds(match) {
  if (!match || match.storageMode !== 'shared') return new Set((match?.players || []).map(mp => mp.playerId));
  if (!isAssignedPlayersMode(match)) return new Set((match.players || []).map(mp => mp.playerId));
  const currentParticipantId = getCurrentSharedParticipantId(match);
  const assignments = match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object' ? match.sharedPlayerAssignments : {};
  const hasAssignments = Object.values(assignments).some(Boolean);
  if (!hasAssignments) return isCurrentDeviceMatchHost(match) ? new Set((match.players || []).map(mp => mp.playerId)) : new Set();
  return new Set((match.players || [])
    .filter(mp => String(getAssignedParticipantForPlayer(match, mp.playerId) || '') === String(currentParticipantId))
    .map(mp => mp.playerId));
}
function getSharedHostOverrideKeys(match) {
  const raw = match?.sharedHostScoreOverrides;
  if (!raw || typeof raw !== 'object') return new Set();
  return new Set(Object.keys(raw).filter(key => raw[key]));
}
function getSharedPlayerHoleKey(playerId, holeNumber) {
  return `${String(playerId || '')}:${Number(holeNumber) || 0}`;
}
function normalizeSharedLedgerValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function normalizeSharedLedgerOptionalNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function normalizeSharedLedgerOptionalBoolean(value) {
  return value === true || value === false ? !!value : null;
}
function sharedLedgerPlayerName(match, playerId = '') {
  return getPlayer(playerId)?.name || (match?.players || []).find(mp => String(mp.playerId) === String(playerId))?.player?.name || String(playerId || 'Unknown player');
}
function buildSharedLedgerEntry({ match = null, playerId = '', playerKey = '', playerName = '', holeNumber = 0, gross = null, stats = {}, source = '', sourceDevice = '', sourceParticipant = '', updatedAt = '' } = {}) {
  const resolvedPlayerId = String(playerId || playerKey || '').trim();
  const resolvedHole = Number(holeNumber) || 0;
  const resolvedGross = normalizeSharedLedgerValue(gross);
  if (!resolvedPlayerId || !resolvedHole || resolvedGross == null) return null;
  const normalizedStats = {
    putts: normalizeSharedLedgerOptionalNumber(stats?.putts),
    fairway: normalizeSharedLedgerOptionalBoolean(stats?.fairway),
    green: normalizeSharedLedgerOptionalBoolean(stats?.green),
    upAndDown: normalizeSharedLedgerOptionalBoolean(stats?.upAndDown ?? stats?.up_and_down),
    sandy: normalizeSharedLedgerOptionalBoolean(stats?.sandy),
  };
  return {
    key: getSharedPlayerHoleKey(resolvedPlayerId, resolvedHole),
    playerId: resolvedPlayerId,
    playerKey: String(playerKey || resolvedPlayerId),
    playerName: playerName || sharedLedgerPlayerName(match, resolvedPlayerId),
    holeNumber: resolvedHole,
    gross: resolvedGross,
    scored: true,
    stats: normalizedStats,
    source,
    sourceDevice,
    sourceParticipant,
    updatedAt,
  };
}
function summarizeSharedLedgerCounts(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((acc, entry) => {
    const label = entry.playerName || entry.playerId || 'Unknown player';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}
function extractLocalScoredLedger(match) {
  const entries = [];
  const holeCount = getRequestedHoleCount(match);
  (match?.players || []).forEach(mp => {
    const playerId = String(mp.playerId || '').trim();
    (Array.isArray(mp.scores) ? mp.scores : []).slice(0, holeCount).forEach((score, idx) => {
      const holeNumber = Number(score?.holeNumber) || idx + 1;
      const entry = buildSharedLedgerEntry({
        match,
        playerId,
        holeNumber,
        gross: score?.gross,
        stats: mp.stats?.[idx] || {},
        source: 'local',
        sourceParticipant: getAssignedParticipantForPlayer(match, playerId) || '',
      });
      if (entry) entries.push(entry);
    });
  });
  return entries.sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)) || a.holeNumber - b.holeNumber);
}
function extractRemoteScoredLedger(match, scoreEntries = []) {
  return (Array.isArray(scoreEntries) ? scoreEntries : []).map(entry => buildSharedLedgerEntry({
    match,
    playerId: entry?.player_id || entry?.playerId || '',
    playerKey: entry?.player_id || entry?.playerId || entry?.match_player_id || entry?.matchPlayerId || '',
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
function sharedLedgerChecksum(entries = []) {
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
function compareScoredLedgers(localLedger = [], remoteLedger = []) {
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
      if (localValue !== remoteValue) conflicts.push({
        playerId: local.playerId || remote.playerId,
        playerName: local.playerName || remote.playerName,
        holeNumber: local.holeNumber || remote.holeNumber,
        field,
        localValue,
        remoteValue,
        sourceDevice: remote.sourceDevice || '',
        sourceParticipant: remote.sourceParticipant || '',
      });
    });
  });
  localMap.forEach((local, key) => {
    if (!remoteMap.has(key)) missingRemote.push(local);
  });
  return {
    parityConfirmed: !missingLocal.length && !missingRemote.length && !conflicts.length,
    localCount: localMap.size,
    remoteCount: remoteMap.size,
    localCountsByPlayer: summarizeSharedLedgerCounts(localLedger),
    remoteCountsByPlayer: summarizeSharedLedgerCounts(remoteLedger),
    missingLocal,
    missingRemote,
    conflicts,
    checksum: {
      local: sharedLedgerChecksum(localLedger),
      remote: sharedLedgerChecksum(remoteLedger),
    },
  };
}
function summarizeLedgerParity(comparison = null, { checkedAt = new Date().toISOString(), warning = '' } = {}) {
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
function recordSharedLedgerParity(match, comparison = null, options = {}) {
  if (!match || match.storageMode !== 'shared') return null;
  match.sharedLedgerParity = summarizeLedgerParity(comparison, options);
  match.lastSharedParityCheckAt = match.sharedLedgerParity.checkedAt;
  return match.sharedLedgerParity;
}
function mergeSharedScoredLedgerIntoMatch(match, remoteLedger = []) {
  if (!match || !Array.isArray(remoteLedger)) return { changed: false, conflicts: [] };
  let changed = false;
  const conflicts = [];
  const byPlayerId = new Map((match.players || []).map(mp => [String(mp.playerId), mp]));
  remoteLedger.forEach(remote => {
    const playerId = String(remote?.playerId || '').trim();
    const holeNumber = Number(remote?.holeNumber || 0);
    if (!playerId || !holeNumber) return;
    if (!shouldAcceptRemoteSharedPlayerHoleEntry(match, playerId, holeNumber)) return;
    const mp = byPlayerId.get(playerId);
    if (!mp) return;
    const idx = holeNumber - 1;
    if (!Array.isArray(mp.scores)) mp.scores = buildEmptyScores(getRequestedHoleCount(match));
    if (!mp.scores[idx]) mp.scores[idx] = { holeNumber, gross: null };
    const localGross = normalizeSharedLedgerValue(mp.scores[idx].gross);
    if (localGross == null && remote.gross != null) {
      mp.scores[idx].gross = remote.gross;
      changed = true;
    } else if (localGross != null && remote.gross != null && localGross !== remote.gross) {
      conflicts.push({ playerId, playerName: remote.playerName, holeNumber, field: 'gross', localValue: localGross, remoteValue: remote.gross, sourceDevice: remote.sourceDevice || '', sourceParticipant: remote.sourceParticipant || '' });
    }
    if (!Array.isArray(mp.stats)) mp.stats = buildEmptyStats(getRequestedHoleCount(match));
    const currentStat = normalizeHoleStat(mp.stats[idx] || {}, idx);
    const nextStat = { ...currentStat };
    ['putts', 'fairway', 'green', 'upAndDown', 'sandy'].forEach(field => {
      const remoteValue = remote.stats?.[field];
      if (remoteValue == null) return;
      const localValue = currentStat[field];
      if (localValue == null || localValue === false && remoteValue === true) {
        nextStat[field] = remoteValue;
      } else if (localValue !== remoteValue) {
        conflicts.push({ playerId, playerName: remote.playerName, holeNumber, field, localValue, remoteValue, sourceDevice: remote.sourceDevice || '', sourceParticipant: remote.sourceParticipant || '' });
      }
    });
    if (JSON.stringify(nextStat) !== JSON.stringify(currentStat)) {
      mp.stats[idx] = normalizeHoleStat(nextStat, idx);
      changed = true;
    }
  });
  if (changed) {
    const progress = computeMatchProgress(match);
    match.lastTouchedHole = progress.lastTouchedHole;
    match.lastFullyCompletedHole = progress.lastFullyCompletedHole;
  }
  return { changed, conflicts };
}
function countSharedLocalScoreEntries(match) {
  if (!match || match.storageMode !== 'shared') return 0;
  const owned = getSharedLocallyOwnedPlayerIds(match);
  return (match.players || []).reduce((total, mp) => {
    if (!owned.has(mp.playerId)) return total;
    return total + (Array.isArray(mp.scores) ? mp.scores.filter(score => Number.isFinite(Number(score?.gross)) && Number(score.gross) > 0).length : 0);
  }, 0);
}
function shouldUploadSharedPlayerEntry(match, playerId) {
  if (!match || match.storageMode !== 'shared') return true;
  if (!isAssignedPlayersMode(match)) return true;
  return getSharedLocallyOwnedPlayerIds(match).has(playerId);
}
function shouldUploadSharedPlayerHoleEntry(match, playerId, holeNumber) {
  if (shouldUploadSharedPlayerEntry(match, playerId)) return true;
  if (isCurrentDeviceMatchHost(match)) return getSharedHostOverrideKeys(match).has(getSharedPlayerHoleKey(playerId, holeNumber));
  return false;
}
function shouldAcceptRemoteSharedPlayerEntry(match, playerId) {
  if (!match || match.storageMode !== 'shared') return true;
  if (!isAssignedPlayersMode(match)) return true;
  const owned = getSharedLocallyOwnedPlayerIds(match);
  return !owned.has(playerId);
}
function shouldAcceptRemoteSharedPlayerHoleEntry(match, playerId, holeNumber) {
  if (!shouldAcceptRemoteSharedPlayerEntry(match, playerId)) return false;
  if (isCurrentDeviceMatchHost(match) && getSharedHostOverrideKeys(match).has(getSharedPlayerHoleKey(playerId, holeNumber))) return false;
  return true;
}
function shouldShowOtherSharedPlayers(match, { stats = false } = {}) {
  if (!match || match.storageMode !== 'shared' || !isAssignedPlayersMode(match)) return true;
  const key = stats ? 'sharedShowOtherStats' : 'sharedShowOtherScores';
  // Hosts default to the full-card view unless they intentionally turn the toggle off.
  // Joined devices default to assigned-player focus unless they intentionally turn the toggle on.
  if (Object.prototype.hasOwnProperty.call(match, key)) return !!match[key];
  return isCurrentDeviceMatchHost(match);
}
function hasSharedAssignedPlayerFocus(match) {
  if (!match || match.storageMode !== 'shared' || !isAssignedPlayersMode(match)) return false;
  const owned = getSharedLocallyOwnedPlayerIds(match);
  const total = Array.isArray(match.players) ? match.players.length : 0;
  return owned.size > 0 && owned.size < total;
}
function getVisibleScoringPlayers(match, metricPlayers = [], { stats = false } = {}) {
  if (!match || match.storageMode !== 'shared' || !isAssignedPlayersMode(match)) return metricPlayers;
  const owned = getSharedLocallyOwnedPlayerIds(match);
  if (!owned.size) return isCurrentDeviceMatchHost(match) ? metricPlayers : [];
  const showOther = shouldShowOtherSharedPlayers(match, { stats });
  return metricPlayers.filter(p => owned.has(p.playerId) || showOther);
}

function isCurrentDeviceMatchHost(match) {
  if (!match) return true;
  if (match.storageMode !== 'shared') return true;
  const hostId = match.sharedHostDeviceId || '';
  return !hostId || hostId === getSharedDeviceId();
}
function getSetupRoleLabel(match = getActiveMatch()) {
  if (!match) return setupWorkflowMode === 'join' ? 'Join a Match' : 'No active match';
  if (match.storageMode !== 'shared') return 'Host Device';
  return isCurrentDeviceMatchHost(match) ? 'Host Device' : 'Joined Device';
}

function getSharedOnlineLabel() {
  return navigator.onLine === false ? 'Offline' : 'Online';
}
function getSharedSyncStatus(match) {
  if (!match || match.storageMode !== 'shared') {
    return { label: 'Local only', detail: 'This match is stored on this device.', tone: 'neutral', pending: 0 };
  }
  const stateLabel = String(match.cloudSyncState || 'local-cache');
  const pending = stateLabel === 'pending-sync' || sharedMatchSyncTimers.has(match.id) || sharedMatchSyncDirty.get(match.id) ? 1 : 0;
  const lastError = String(match.lastSharedSyncError || '').trim();
  if (navigator.onLine === false) {
    if (stateLabel) return { label: 'Connection unavailable - keep scoring', detail: 'Scores are saved on this phone and will sync when connected.', tone: 'warning', pending };
    return { label: 'Offline — changes saved locally', detail: pending ? `${pending} change waiting to sync` : 'Local scoring remains available.', tone: 'warning', pending };
  }
  if (stateLabel === 'syncing' || sharedMatchSyncInflight.has(match.id)) {
    if (stateLabel) return { label: 'Syncing with host...', detail: 'Sending the latest saved scores.', tone: 'working', pending };
    return { label: 'Syncing…', detail: 'Sending the latest shared-match changes.', tone: 'working', pending };
  }
  if (pending || stateLabel === 'pending-sync') {
    if (stateLabel) return { label: 'Waiting to sync', detail: 'Scores are saved on this phone. Keep scoring or tap Sync Now.', tone: 'warning', pending };
    return { label: pending > 1 ? `${pending} changes waiting to sync` : 'Pending changes', detail: 'Tap Sync Now or keep scoring. Changes are saved locally.', tone: 'warning', pending };
  }
  if (lastError) {
    return { label: 'Sync needs attention', detail: `${lastError} Scores are still saved on this phone.`, tone: 'warning', pending };
  }
  const parity = match.sharedLedgerParity && typeof match.sharedLedgerParity === 'object' ? match.sharedLedgerParity : null;
  if (parity?.status === 'conflict') {
    return { label: 'Conflict detected', detail: 'Shared scores differ for at least one player/hole. Review diagnostics before final summary.', tone: 'warning', pending };
  }
  if (parity?.status === 'confirmed') {
    return { label: 'Score parity confirmed', detail: 'Latest shared scores were pulled, reconciled, and compared on this device.', tone: 'good', pending: 0 };
  }
  if (parity?.status === 'warning' || parity?.status === 'not-confirmed') {
    return { label: 'Sync warning', detail: parity.warning || 'Shared score parity has not been confirmed on this device.', tone: 'warning', pending };
  }
  if (stateLabel === 'cloud-synced' || stateLabel === 'synced') {
    if (stateLabel) return { label: 'Pushed to shared match', detail: 'Network save completed. Pull and compare shared scores to confirm parity.', tone: 'neutral', pending: 0 };
    return { label: 'Pushed', detail: 'Shared match network save completed.', tone: 'neutral', pending: 0 };
  }
  if (stateLabel === 'local-cache' || stateLabel === 'pending' || stateLabel === 'local-draft') {
    if (stateLabel) return { label: 'Saved on this phone', detail: 'Scoring works here even if cloud sync is delayed.', tone: 'neutral', pending: 0 };
    return { label: 'Saved locally — sync available', detail: 'Tap Sync Now to push the latest shared-match state.', tone: 'neutral', pending: 0 };
  }
  return { label: 'Needs attention', detail: 'Shared match status should be checked before continuing.', tone: 'warning', pending };
}
function formatSharedLastSync(match) {
  return match?.lastCloudSyncAt ? formatTimestampET(match.lastCloudSyncAt, { includeDate: false }) : 'Not synced yet';
}
function formatSharedStatusTimestamp(ts) {
  return ts ? formatTimestampET(ts, { includeDate: false }) : 'Not yet';
}
function getSharedFriendlyError(err) {
  const raw = String(err?.message || err?.details || err || '').trim();
  if (!raw) return 'Cloud sync is unavailable right now.';
  if (/network|fetch|failed|offline|unavailable|timeout/i.test(raw)) return 'Cloud sync is unavailable right now.';
  if (/not found/i.test(raw)) return 'Shared match was not found.';
  if (/permission|policy|auth|jwt|login/i.test(raw)) return 'Cloud permission needs attention.';
  return 'Cloud sync needs attention.';
}
function getAssignedPlayerNamesForParticipant(match, participantId = getCurrentSharedParticipantId(match)) {
  if (!match || match.storageMode !== 'shared') return [];
  migrateSharedPlayerAssignmentsToParticipants(match);
  return (match.players || [])
    .filter(mp => String(getAssignedParticipantForPlayer(match, mp.playerId) || '') === String(participantId || ''))
    .map(mp => getPlayer(mp.playerId)?.name || 'Player')
    .filter(Boolean);
}
function getAssignedPlayerNamesForDevice(match, deviceId = getSharedDeviceId()) {
  const participant = getSharedParticipantByDeviceId(match, deviceId);
  return getAssignedPlayerNamesForParticipant(match, participant?.participantId || deviceId);
}
function getSharedAssignmentSummary(match) {
  if (!match || match.storageMode !== 'shared') return '';
  if (!isAssignedPlayersMode(match)) return 'This shared match allows the active scorer to score according to the selected scoring mode.';
  const names = getAssignedPlayerNamesForParticipant(match, getCurrentSharedParticipantId(match));
  if (isCurrentDeviceMatchHost(match)) return 'Host device - can score all players and manage assignments.';
  return names.length ? `You are assigned to score: ${names.join(', ')}` : 'Waiting for the host to assign players to this device.';
}
function getSharedDeviceStatus(match, device) {
  const currentId = getSharedDeviceId();
  const isThis = String(device?.id || '') === currentId;
  if (isThis && navigator.onLine === false) return 'Offline';
  if (isThis && String(match?.cloudSyncState || '') === 'syncing') return 'Syncing';
  if (isThis && (String(match?.cloudSyncState || '') === 'pending-sync' || sharedMatchSyncTimers.has(match?.id))) return 'Pending changes';
  return isThis ? 'Online' : (device?.lastSeenAt ? 'Synced' : 'Needs attention');
}

function getSharedParticipantSeenStatus(participant = {}) {
  const ts = participant?.lastSeenAt || participant?.last_seen_at || participant?.lastSeen || '';
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return { icon: '⚪', label: 'Not seen recently', tone: 'muted' };
  const ageMs = Date.now() - d.getTime();
  if (ageMs <= 2 * 60 * 1000) return { icon: '🟢', label: 'Seen now', tone: 'good' };
  if (ageMs <= 15 * 60 * 1000) return { icon: '🟡', label: 'Seen recently', tone: 'warning' };
  return { icon: '⚪', label: 'Not seen recently', tone: 'muted' };
}
function getParticipantAssignmentCount(match) {
  if (!match || !Array.isArray(match.players)) return { assigned: 0, total: 0 };
  const total = match.players.length;
  const assigned = match.players.filter(mp => !!getAssignedParticipantForPlayer(match, mp.playerId)).length;
  return { assigned, total };
}
function getSharedMatchReadinessLines(match, participants = getSharedAssignmentParticipants(match)) {
  if (!match || match.storageMode !== 'shared') return [];
  const isHost = isCurrentDeviceMatchHost(match);
  const hostPid = String(match.sharedHostParticipantId || getCurrentSharedParticipantId(match) || '');
  const joined = (participants || []).filter(p => String(p.participantId || '') !== hostPid);
  const { assigned, total } = getParticipantAssignmentCount(match);
  const lines = [];
  if (isHost) {
    if (!joined.length) lines.push('Waiting for joined devices...');
    else lines.push(`${joined.length} joined device${joined.length === 1 ? '' : 's'}.`);
    if (isAssignedPlayersMode(match)) lines.push(`${assigned} of ${total} players assigned.`);
    if (!isAssignedPlayersMode(match) || assigned >= total) lines.push('Ready to start scoring.');
  } else {
    const names = getAssignedPlayerNamesForParticipant(match, getCurrentSharedParticipantId(match));
    lines.push(names.length ? `Ready to score: ${names.join(', ')}.` : 'Joined — waiting for host assignment.');
  }
  return lines;
}
function showSharedJoinConfirmation(match) {
  if (!match || match.storageMode !== 'shared') return;
  const summary = getSharedAssignmentSummary(match);
  toast(summary === 'Waiting for the host to assign players to this device.' ? 'Joined match. Waiting for host assignment.' : `Joined match. ${summary}`);
}
function setSetupWorkflowMode(mode = 'landing') {
  const anchor = captureSetupScrollAnchor('#setupEntryCard');
  setupWorkflowMode = ['landing', 'create', 'join'].includes(mode) ? mode : 'landing';
  renderMatchSetupState();
  restoreSetupScrollAnchor(anchor);
}
function copyTextToClipboard(text = '') {
  const value = String(text || '');
  if (!value) return Promise.resolve(false);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
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
  const mode = normalizeScoringAccessMode(match?.scoringAccessMode || match?.scoreEntryMode || 'single_device');
  const defaultRole = mode === 'assigned_players' ? 'assigned_player_scorer' : 'official_scorer';
  const role = String(match?.activeScoreRole || defaultRole);
  const allowedRole = mode === 'single_device' && role === 'team_scorer' ? 'official_scorer' : role;
  const teamCount = Math.max(1, Number(match?.teamCount) || 1);
  const selectedTeam = Math.min(teamCount, Math.max(1, Number(match?.activeScoreTeam) || 1));
  const validRoles = ['event_admin','official_scorer','assigned_player_scorer','team_scorer','viewer'];
  return { mode, role: validRoles.includes(allowedRole) ? allowedRole : 'viewer', team: selectedTeam };
}
function canEditPlayerScore(match, teamNo = 1, playerId = '') {
  const access = getScoreAccessState(match);
  if (access.role === 'viewer') return false;
  if (access.mode === 'single_device') return true;
  if (access.mode === 'assigned_players') return canCurrentDeviceEditPlayer(match, playerId);
  if (access.mode === 'open_edit' && access.role !== 'viewer') return true;
  if (access.role === 'team_scorer') return Number(teamNo) === Number(access.team);
  return access.role === 'event_admin' || access.role === 'official_scorer';
}

function getSharedDeviceByIdForDiagnostics(match, deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  return (getSharedAssignmentDevices(match) || []).find(d => String(d.id) === id) || null;
}
function explainPlayerEditability(match, playerId) {
  const pid = String(playerId || '').trim();
  const mp = (match?.players || []).find(row => String(row.playerId) === pid) || null;
  const player = getPlayer(pid) || {};
  const currentDeviceId = getSharedDeviceId();
  const currentParticipantId = match?.storageMode === 'shared' ? getCurrentSharedParticipantId(match) : '';
  const assignedParticipantId = getAssignedParticipantForPlayer(match, pid);
  const assignedParticipant = getSharedParticipantById(match, assignedParticipantId);
  const currentParticipant = getSharedParticipantById(match, currentParticipantId);
  const legacyAssignedDeviceId = assignedParticipant?.deviceId || '';
  const isHost = !!(match && isCurrentDeviceMatchHost(match));
  let canEdit = false;
  let reason = 'shared match not initialized';
  if (!match) reason = 'shared match not initialized';
  else if (!pid || !mp) reason = 'player missing from matchPlayers';
  else if (match.storageMode !== 'shared') { canEdit = true; reason = 'local match, unrestricted'; }
  else if (!isAssignedPlayersMode(match)) { canEdit = true; reason = 'shared match not in assigned-player mode'; }
  else if (isHost) { canEdit = true; reason = 'shared host can edit all'; }
  else if (!assignedParticipantId) reason = 'no assignment found';
  else if (!assignedParticipant) reason = 'assigned participant not found';
  else if (!currentParticipant) reason = 'current participant missing from participants';
  else if (String(assignedParticipantId) === String(currentParticipantId)) { canEdit = true; reason = 'shared assigned player matches current participant'; }
  else reason = 'shared assigned player does not match current participant';
  return {
    playerId: pid,
    playerName: player.name || pid || 'Unknown Player',
    currentDeviceId,
    currentParticipantId,
    currentParticipantName: currentParticipant?.deviceName || currentParticipant?.name || getSharedDeviceName(match, currentDeviceId),
    assignedParticipantId,
    assignedParticipantName: assignedParticipant?.deviceName || assignedParticipant?.name || (assignedParticipantId ? 'Unknown participant' : 'Unassigned'),
    legacyAssignedDeviceId,
    isHost,
    canEdit,
    reason,
  };
}
function describeSharedAssignmentState(match) {
  const currentDeviceId = getSharedDeviceId();
  const currentParticipantId = match?.storageMode === 'shared' ? getCurrentSharedParticipantId(match) : '';
  const participants = getSharedAssignmentParticipants(match || null);
  const devices = getSharedAssignmentDevices(match || null);
  const owned = getSharedLocallyOwnedPlayerIds(match || null);
  const assignmentCount = getParticipantAssignmentCount(match || null);
  const sync = getSharedSyncStatus(match || null);
  const localLedger = extractLocalScoredLedger(match || null);
  const parity = match?.sharedLedgerParity && typeof match.sharedLedgerParity === 'object' ? match.sharedLedgerParity : null;
  return {
    sharedMatchMode: match?.storageMode === 'shared' ? 'Shared Match' : 'Local Match',
    role: match?.storageMode === 'shared' ? (isCurrentDeviceMatchHost(match) ? 'Host device' : 'Joined device') : 'Local device',
    currentDeviceId,
    currentParticipantId,
    deviceName: getSharedDeviceName(match, currentDeviceId),
    isHost: !!(match && isCurrentDeviceMatchHost(match)),
    sharedHostDeviceId: match?.sharedHostDeviceId || '',
    sharedHostParticipantId: match?.sharedHostParticipantId || '',
    sharedMatchId: match?.sharedMatchId || '',
    sharedMatchCode: match?.sharedMatchCode || match?.sharedMatchRef || '',
    sharedAccessMode: normalizeScoringAccessMode(match?.scoringAccessMode || match?.scoreEntryMode || 'single_device'),
    sharedDevices: devices,
    sharedParticipants: participants,
    sharedPlayerAssignments: { ...((match?.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object') ? match.sharedPlayerAssignments : {}) },
    assignmentCount,
    ownedPlayerIds: Array.from(owned || []),
    ownedPlayerNames: Array.from(owned || []).map(id => getPlayer(id)?.name || id),
    localScoredHoleCount: localLedger.length,
    localScoredHolesByPlayer: summarizeSharedLedgerCounts(localLedger),
    remoteScoredHolesByPlayer: parity?.remoteCountsByPlayer || {},
    lastParityCheckAt: match?.lastSharedParityCheckAt || parity?.checkedAt || null,
    parityStatus: parity?.status || 'not-checked',
    parityConfirmed: !!parity?.parityConfirmed,
    missingLocalEntries: parity?.missingLocal || [],
    missingRemoteEntries: parity?.missingRemote || [],
    conflictsDetected: parity?.conflicts || [],
    ledgerChecksum: parity?.checksum || null,
    cloudSyncState: match?.cloudSyncState || '',
    sharedSyncLabel: sync.label,
    sharedSyncDetail: sync.detail,
    lastSyncAttemptAt: match?.lastSharedSyncAttemptAt || null,
    lastSuccessfulPullAt: match?.lastSharedScorePullAt || null,
    lastSuccessfulPushAt: match?.lastSharedScorePushAt || null,
    lastSuccessfulSyncAt: match?.lastCloudSyncAt || null,
    lastSyncError: match?.lastSharedSyncError || '',
    players: (match?.players || []).map(mp => explainPlayerEditability(match, mp.playerId)),
    latestMetadata: latestSharedAssignmentMetadataSnapshot,
  };
}
function logSharedAssignmentDiag(label, match, extra = {}) {
  if (!match || match.storageMode !== 'shared') return;
  try {
    console.debug('[SharedAssignmentDiag]', label, { ...describeSharedAssignmentState(match), ...extra });
  } catch (err) {
    console.debug('[SharedAssignmentDiag]', label, extra, err);
  }
}
function renderSharedAssignmentDiagnosticsPanel(match, { context = 'setup' } = {}) {
  if (!match || match.storageMode !== 'shared') return '';
  const state = describeSharedAssignmentState(match);
  const playerRows = state.players.map(row => `<tr><td>${escapeHtml(row.playerName)}</td><td><code>${escapeHtml(row.playerId)}</code></td><td>${escapeHtml(row.assignedParticipantName || 'Unassigned')}<div class="tiny"><code>${escapeHtml(row.assignedParticipantId || '—')}</code></div>${row.legacyAssignedDeviceId ? `<div class="tiny">legacy device <code>${escapeHtml(row.legacyAssignedDeviceId)}</code></div>` : ''}</td><td>${row.assignedParticipantId && String(row.assignedParticipantId) === String(state.currentParticipantId) ? 'Yes' : 'No'}</td><td>${row.canEdit ? 'Yes' : 'No'}<div class="tiny">${escapeHtml(row.reason)}</div></td></tr>`).join('');
  const participantRows = state.sharedParticipants.map((participant, idx) => `<tr><td>${escapeHtml(participant.deviceName || participant.name || `Participant ${idx + 1}`)}</td><td><code>${escapeHtml(participant.participantId || '')}</code></td><td><code>${escapeHtml(participant.deviceId || '')}</code></td><td>${String(participant.participantId) === String(state.currentParticipantId) ? 'Yes' : 'No'}</td><td>${String(participant.participantId) === String(state.sharedHostParticipantId) || String(participant.deviceId) === String(state.sharedHostDeviceId) ? 'Yes' : 'No'}</td><td>${escapeHtml(participant.lastSeenAt || '')}</td></tr>`).join('');
  const snapshot = {
    localAssignments: state.sharedPlayerAssignments,
    localParticipants: state.sharedParticipants.map(p => ({ participantId: p.participantId, deviceId: p.deviceId, deviceName: p.deviceName || p.name || '', role: p.role || '', joinedAt: p.joinedAt || '', lastSeenAt: p.lastSeenAt || '' })),
    localDevices: state.sharedDevices.map(d => ({ id: d.id, name: d.name || d.deviceName || '', joinedAt: d.joinedAt || '', lastSeenAt: d.lastSeenAt || '' })),
    latestMetadataAssignments: state.latestMetadata?.playerAssignments || null,
    latestMetadataParticipants: state.latestMetadata?.participants || null,
    latestMetadataDevices: state.latestMetadata?.devices || null,
    ledgerParity: {
      status: state.parityStatus,
      confirmed: state.parityConfirmed,
      localScoredHolesByPlayer: state.localScoredHolesByPlayer,
      remoteScoredHolesByPlayer: state.remoteScoredHolesByPlayer,
      missingLocalEntries: state.missingLocalEntries,
      missingRemoteEntries: state.missingRemoteEntries,
      conflictsDetected: state.conflictsDetected,
      checksum: state.ledgerChecksum,
    },
  };
  return `<details class="shared-assignment-diagnostics top-gap" data-shared-assignment-diagnostics="${escapeHtml(context)}">
    <summary>Shared Assignment Diagnostics</summary>
    <div class="tiny top-gap"><strong>Current Participant</strong></div>
    <div class="diag-grid tiny">
      <div>currentParticipantId<br><code>${escapeHtml(state.currentParticipantId || '—')}</code></div>
      <div>currentDeviceId<br><code>${escapeHtml(state.currentDeviceId || '—')}</code></div>
      <div>deviceName<br><strong>${escapeHtml(state.deviceName || '—')}</strong></div>
      <div>isHost<br><strong>${state.isHost ? 'Yes' : 'No'}</strong></div>
      <div>role<br><strong>${escapeHtml(state.role || 'N/A')}</strong></div>
      <div>assignmentCount<br><strong>${escapeHtml(`${state.assignmentCount.assigned}/${state.assignmentCount.total}`)}</strong></div>
      <div>sharedHostParticipantId<br><code>${escapeHtml(state.sharedHostParticipantId || '—')}</code></div>
      <div>sharedMatchCode<br><code>${escapeHtml(state.sharedMatchCode || '—')}</code></div>
      <div>parityStatus<br><strong>${escapeHtml(state.parityStatus || 'not-checked')}</strong></div>
      <div>lastParityCheck<br><strong>${escapeHtml(formatSharedStatusTimestamp(state.lastParityCheckAt))}</strong></div>
    </div>
    <div class="tiny top-gap"><strong>Scoring Access</strong>: ${escapeHtml(state.sharedAccessMode)} · Owned: ${escapeHtml(state.ownedPlayerNames.join(', ') || 'None')}</div>
    <div class="tiny top-gap"><strong>Sync</strong>: ${escapeHtml(state.sharedSyncLabel)} - Attempt: ${escapeHtml(formatSharedStatusTimestamp(state.lastSyncAttemptAt))} - Pull: ${escapeHtml(formatSharedStatusTimestamp(state.lastSuccessfulPullAt))} - Push: ${escapeHtml(formatSharedStatusTimestamp(state.lastSuccessfulPushAt))} - Local scored holes: ${escapeHtml(String(state.localScoredHoleCount || 0))}${state.lastSyncError ? ` - Last error: ${escapeHtml(state.lastSyncError)}` : ''}</div>
    <div class="tiny top-gap"><strong>Ledger</strong>: Local ${escapeHtml(JSON.stringify(state.localScoredHolesByPlayer || {}))} - Remote ${escapeHtml(JSON.stringify(state.remoteScoredHolesByPlayer || {}))} - Missing local ${escapeHtml(String((state.missingLocalEntries || []).length))} - Missing remote ${escapeHtml(String((state.missingRemoteEntries || []).length))} - Conflicts ${escapeHtml(String((state.conflictsDetected || []).length))}</div>
    <div class="table-scroll top-gap"><table class="mini-table"><thead><tr><th>Participant</th><th>Participant ID</th><th>Device ID</th><th>Current?</th><th>Host?</th><th>Last seen</th></tr></thead><tbody>${participantRows || '<tr><td colspan="6">No participants</td></tr>'}</tbody></table></div>
    <div class="table-scroll top-gap"><table class="mini-table"><thead><tr><th>Player</th><th>Player ID</th><th>Assigned Participant</th><th>Matches Current?</th><th>Editable?</th></tr></thead><tbody>${playerRows || '<tr><td colspan="5">No players</td></tr>'}</tbody></table></div>
    <div class="tiny top-gap"><strong>Metadata Snapshot</strong></div>
    <pre class="diag-json">${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>
  </details>`;
}
function runSharedAssignmentDiagnosticSimulation() {
  const scenarios = [
    { scenario: 'A - Participant happy path', currentParticipantId: 'participant-cart2', participants: [{ participantId: 'participant-host', deviceId: 'host-1', deviceName: 'Host Device' }, { participantId: 'participant-cart2', deviceId: 'joined-1', deviceName: 'Cart 2' }], sharedPlayerAssignments: { player1: 'participant-cart2' }, expected: 'can edit' },
    { scenario: 'B - Old deviceId assignment migrates', currentParticipantId: 'participant-cart2', participants: [{ participantId: 'participant-cart2', deviceId: 'device-joined-1', deviceName: 'Cart 2' }], sharedPlayerAssignments: { player1: 'device-joined-1' }, expected: 'migrates and can edit' },
    { scenario: 'C - Device ID mismatch no longer breaks assignment', currentParticipantId: 'participant-cart2', participants: [{ participantId: 'participant-cart2', deviceId: 'joined-2', deviceName: 'Cart 2' }], sharedPlayerAssignments: { player1: 'participant-cart2' }, expected: 'can edit despite device change' },
    { scenario: 'D - Display name assignment invalid', currentParticipantId: 'participant-cart2', participants: [{ participantId: 'participant-cart2', deviceId: 'joined-1', deviceName: 'Cart 2' }], sharedPlayerAssignments: { player1: 'Cart 2' }, expected: 'cannot edit; invalid participant id' },
    { scenario: 'E - Missing participant', currentParticipantId: 'participant-cart2', participants: [{ participantId: 'participant-cart2', deviceId: 'joined-1', deviceName: 'Cart 2' }], sharedPlayerAssignments: { player1: 'participant-missing' }, expected: 'locked; missing participant' },
  ];
  const rows = scenarios.map(s => {
    const participants = s.participants || [];
    const assignedRaw = s.sharedPlayerAssignments.player1 || '';
    const byParticipant = participants.find(p => p.participantId === assignedRaw);
    const byLegacyDevice = participants.find(p => p.deviceId === assignedRaw);
    const resolved = byParticipant?.participantId || byLegacyDevice?.participantId || assignedRaw;
    const participantFound = participants.some(p => p.participantId === resolved);
    const currentFound = participants.some(p => p.participantId === s.currentParticipantId);
    const canEdit = participantFound && currentFound && resolved === s.currentParticipantId;
    let reason = canEdit ? 'shared assigned player matches current participant' : 'shared assigned player does not match current participant';
    if (!assignedRaw) reason = 'no assignment found';
    else if (!participantFound) reason = 'assigned participant not found';
    else if (!currentFound) reason = 'current participant missing from participants';
    return { scenario: s.scenario, expected: s.expected, currentParticipantId: s.currentParticipantId, rawAssignment: assignedRaw, resolvedAssignment: resolved, participantFound, currentFound, canEdit, reason };
  });
  console.group('[SharedParticipant] Simulation');
  console.table(rows);
  console.groupEnd();
  return rows;
}
if (typeof window !== 'undefined') {
  window.runSharedAssignmentDiagnosticSimulation = runSharedAssignmentDiagnosticSimulation;
  window.describeSharedAssignmentState = describeSharedAssignmentState;
  window.explainPlayerEditability = explainPlayerEditability;
  window.extractLocalScoredLedger = extractLocalScoredLedger;
  window.extractRemoteScoredLedger = extractRemoteScoredLedger;
  window.compareScoredLedgers = compareScoredLedgers;
  window.summarizeLedgerParity = summarizeLedgerParity;
}
function canEditGreenies(match, teamNo = 1, playerId = '') {
  return canEditPlayerScore(match, teamNo, playerId);
}
function getScoreAccessHint(match) {
  const access = getScoreAccessState(match);
  if (access.mode === 'assigned_players') return 'Assigned Players Score Entry: this device can edit only the players assigned to it. Other players remain visible as read-only.';
  if (access.role === 'event_admin') return 'Organizer / Admin can edit all teams, correct scores, and manage shared-round setup.';
  if (access.mode === 'open_edit' && access.role !== 'viewer') return 'Anyone Can Enter Scores mode keeps score entry open to any authorized non-viewer device.';
  if (access.role === 'official_scorer') return 'One Device Scores for Everyone keeps one full-access scorer in charge of entry.';
  if (access.role === 'team_scorer') return `Each Team Enters Its Own Scores mode limits editing to ${getTeamLabel(match, access.team)}.`;
  return 'Viewer is read-only and can monitor the round without editing any scores.';
}

function normalizeSelectedGamesOrder(games = []) {
  const ordered = Array.isArray(games) ? games.slice() : [];
  const priority = {
    nassau: 10,
    team_match: 15,
    singles_match: 20,
    skins: 30,
    net_skins: 31,
    nine_point: 40,
    greenies: 50,
    long_drive: 51,
    closest_to_pin: 52,
    individual_match: 80,
  };
  ordered.sort((a, b) => {
    const aRank = priority[a?.key] ?? 70;
    const bRank = priority[b?.key] ?? 70;
    if (aRank !== bRank) return aRank - bRank;
    return String(getGameLabel(a?.key || '')).localeCompare(String(getGameLabel(b?.key || '')));
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
    <div class="scorecard-wrap nine-point-scorecard-wrap top-gap">
      <table class="scorecard-table nine-point-scorecard-table">
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
    || ordered.find(g => g.key === 'singles_match')?.key
    || ordered.find(g => g.key === 'team_stroke')?.key
    || ordered.find(g => g.key !== 'individual_match')?.key
    || ordered[0]?.key
    || 'team_match';
}

function normalizeFeaturedCompetition(value) {
  const v = String(value || 'auto').trim();
  if (!v) return 'auto';
  if (['auto', 'none', 'stroke_net', 'stroke_gross'].includes(v)) return v;
  return GAME_LIBRARY.some(g => g.key === v) ? v : 'auto';
}
function getFeaturedCompetitionOptions(selectedGames = []) {
  const selected = normalizeSelectedGamesOrder(Array.isArray(selectedGames) ? selectedGames : []);
  const opts = [
    { key: 'auto', label: 'Auto' },
    { key: 'none', label: 'None / Social Round' },
    { key: 'stroke_net', label: 'Stroke Play — Low Net' },
    { key: 'stroke_gross', label: 'Stroke Play — Low Gross' },
  ];
  selected.forEach(game => {
    if (game?.key && !opts.some(opt => opt.key === game.key)) opts.push({ key: game.key, label: getGameLabel(game.key) });
  });
  return opts;
}
function getFeaturedCompetitionSelection(matchOrValue, selectedGames = null) {
  if (typeof matchOrValue === 'string') return normalizeFeaturedCompetition(matchOrValue);
  const match = matchOrValue || {};
  return normalizeFeaturedCompetition(match.featuredCompetition || 'auto');
}
function resolveAutoFeaturedCompetition(match, metrics = null) {
  const selected = getOrderedSelectedGames(match);
  const nonSideGames = selected.filter(g => g.key !== 'greenies');
  if (nonSideGames.length === 1) return nonSideGames[0].key;
  if (selected.some(g => g.key === 'nassau')) return 'nassau';
  if (selected.some(g => g.key === 'singles_match')) return 'singles_match';
  if (selected.some(g => g.key === 'nine_point')) return 'nine_point';
  const skinsOnly = selected.filter(g => ['skins', 'net_skins'].includes(g.key));
  if (skinsOnly.length === 1 && selected.length === 1) return skinsOnly[0].key;
  return 'stroke_net';
}
function resolveFeaturedCompetitionKey(match, metrics = null) {
  const selected = getFeaturedCompetitionSelection(match);
  if (selected === 'auto') return resolveAutoFeaturedCompetition(match, metrics);
  return selected;
}
function getFeaturedCompetitionDisplayName(match, key) {
  if (key === 'auto') return 'Auto';
  if (key === 'none') return 'Social Round';
  if (key === 'stroke_net') return 'Stroke Play — Low Net';
  if (key === 'stroke_gross') return 'Stroke Play — Low Gross';
  return getFeaturedGameLabel(match, key) || getGameLabel(key) || 'Featured Competition';
}
function formatStrokeFeaturedResult(match, metrics, basis = 'net') {
  const players = Array.isArray(metrics?.players) ? metrics.players : [];
  if (!players.length) return 'Featured result unavailable until more holes are scored.';
  const field = basis === 'gross' ? 'grossTotal' : 'leaderboardNetTotal';
  const rows = getLowRows(players, field);
  if (!rows.rows.length || !Number.isFinite(Number(rows.value))) return 'Featured result unavailable until more holes are scored.';
  const completion = getRoundCompletionState(match, metrics);
  const label = formatAwardWinners(rows.rows.map(r => r.player?.name), rows.value);
  return `${label}${formatIncompleteScopeSuffix(completion)}`;
}
function getFeaturedCompetitionResult(match, metrics) {
  const selection = getFeaturedCompetitionSelection(match);
  const key = resolveFeaturedCompetitionKey(match, metrics);
  const completion = metrics ? getRoundCompletionState(match, metrics) : null;
  if (key === 'none') return { key, label: 'Social Round', result: 'No featured competition selected.', selection };
  if (key === 'stroke_net') return { key, label: 'Low Net', result: formatStrokeFeaturedResult(match, metrics, 'net'), selection };
  if (key === 'stroke_gross') return { key, label: 'Low Gross', result: formatStrokeFeaturedResult(match, metrics, 'gross'), selection };
  if (key === 'sneaky_sandy_poley') {
    const ledger = buildSneakySandyPoleyLedger(match, { metrics });
    const leader = ledger?.finalLeader || {};
    const label = 'Sneaky / Sandy / Poley';
    if (!ledger?.enabled || !Number(leader.thru)) return { key, label, result: 'SSP result unavailable until at least one SSP hole is scored.', selection };
    const result = leader.tied
      ? `Tied thru ${Number(leader.thru)} SSP hole${Number(leader.thru) === 1 ? '' : 's'}`
      : `${formatSneakySandyPoleyTeamName(ledger, match, leader.teamId)} +${Number(leader.margin || 0)} thru ${Number(leader.thru)} SSP hole${Number(leader.thru) === 1 ? '' : 's'}`;
    return { key, label, result, selection };
  }
  if (key === 'singles_match') {
    const result = computeSinglesMatchPlayResult(match, metrics, getSinglesMatchConfig(match) || {});
    const text = result?.displayResult || result?.statusText || result?.winnerText || 'Featured result unavailable until more holes are scored.';
    return { key, label: 'Singles Match Play', result: completion?.isIncomplete && !String(text).includes('through') ? `${text}${formatIncompleteScopeSuffix(completion)}` : text, selection };
  }
  if (['nassau', 'team_match'].includes(key) && metrics?.teams?.length === 2) {
    const diffs = computeTeamGameDiffs(match, metrics, key);
    const result = completion?.isIncomplete ? formatTeamGameStatusScoped(match, metrics, diffs.overall, completion) : formatTeamGameStatus(match, metrics, diffs.overall);
    return { key, label: getGameLabel(key), result, selection };
  }
  if (key === 'team_stroke' && metrics?.teams?.length >= 2) {
    const cfg = (match.selectedGames || []).find(g => g.key === key) || {};
    const stroke = getTeamStrokeScoreboardData(match, metrics, cfg);
    const result = !stroke.leader ? 'Featured result unavailable until more holes are scored.' : (stroke.tie ? `Tied at ${stroke.leader.total}` : `${describeTeamLabel(match, stroke.leader.team, metrics)} by ${stroke.margin} stroke${stroke.margin === 1 ? '' : 's'}`);
    return { key, label: getGameLabel(key), result, selection };
  }
  if (key === 'nine_point') {
    const nine = computeNinePointResults(match, metrics, (match.selectedGames || []).find(g => g.key === 'nine_point') || {});
    const rows = Object.entries(nine?.amounts || {}).map(([id, amount]) => ({ id, amount: Number(amount || 0), name: getPlayer(id)?.name || id }));
    const high = getHighRows(rows, 'amount');
    const result = high.rows.length && high.value > 0 ? formatAwardWinners(high.rows.map(r => r.name), formatMoneyAccounting(high.value)) : 'No 9-Point winner yet.';
    return { key, label: '9-Point', result, selection };
  }
  if (['skins','net_skins','greenies','individual_match'].includes(key)) {
    const ctx = getPayoutReportContext(match, metrics);
    const game = (ctx.payoutGames || []).find(g => g.key === key);
    const rows = Object.entries(game?.amounts || {}).map(([id, amount]) => ({ id, amount: Number(amount || 0), name: getPlayer(id)?.name || id }));
    const high = getHighRows(rows, 'amount');
    const result = high.rows.length && high.value > 0 ? formatAwardWinners(high.rows.map(r => r.name), formatMoneyAccounting(high.value)) : 'Featured result unavailable until more holes are scored.';
    return { key, label: getGameLabel(key), result, selection };
  }
  return { key, label: getFeaturedCompetitionDisplayName(match, key), result: 'Featured result unavailable until more holes are scored.', selection };
}
function renderFeaturedCompetitionSetup(selectedGames = null, selectedValue = null) {
  const select = document.getElementById('featuredCompetitionSelect');
  if (!select) return;
  const games = Array.isArray(selectedGames) ? selectedGames : collectSelectedGames();
  const current = normalizeFeaturedCompetition(selectedValue || select.value || 'auto');
  const options = getFeaturedCompetitionOptions(games);
  select.innerHTML = options.map(opt => `<option value="${escapeHtml(opt.key)}" ${opt.key === current ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
  if (!options.some(opt => opt.key === current)) select.value = 'auto';
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
  return selected.some(g => g.key === 'nassau' || g.key === 'singles_match' || g.key === 'team_match' || g.key === 'team_stroke' || (g.key === 'individual_match' && Array.isArray(g.matchups) && g.matchups.some(row => ['nassau','match_play'].includes(String(row?.game || 'nassau').toLowerCase()))));
}
function hasTeamMomentumMatch(match, metrics) {
  const teams = metrics?.teams || [];
  const hasTwoCompetingTeams = teams.length === 2 && teams.every(team => Array.isArray(team.members) && team.members.length > 0);
  const hasSinglesMatch = (Array.isArray(match?.selectedGames) ? match.selectedGames : []).some(g => g.key === 'singles_match') && isSinglesMatchPlayEligible(match, metrics);
  const hasSideMatch = getSideMatchConfigs(match).some(row => ['nassau', 'match_play'].includes(String(row?.game || 'nassau').toLowerCase()));
  return (hasTwoCompetingTeams || hasSideMatch || hasSinglesMatch) && hasMomentumGame(match);
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
let currentHoleSequenceStart = 1;
let finishConfirmArmed = false;
let roundCompletePromptShownForMatchId = null;
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
  courseLibraryDiagnostics: { cloudCourses: 0, localCourses: 0, renderedCourseOptions: 0 },
  courseSyncTimers: {},
  scorecardImportData: null,
  scorecardImportFileName: '',
  scorecardImportFiles: [],
  scorecardImportStatus: '',
  scorecardImportLoading: false,
  completedSummaryMatchId: null,
  matchPlayerDraft: [],
  referenceTeeManual: false,
  referenceTeeAutoId: '',
  teamPayoutMobileWindowByMatch: {},
  teamPayoutMobileOpenHeaderKey: '',
  grossGameDetailOpenByMatch: {},
  memoryDraftCategory: 'General',
  roundRecapEditing: false,
};
let pendingNextRoundSessionContext = null;


const state = DYE_LEDGER_ADAPTER_MODE ? { players: [], courses: [], matches: [], notes: '' } : loadState();
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

function roundWeatherCoordinate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** WEATHER_LAT_LON_PRECISION;
  return Math.round(n * factor) / factor;
}

function roundWeatherNumber(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** Math.max(0, Number(digits) || 0);
  return Math.round(n * factor) / factor;
}

function normalizeRoundWeatherStatus(status = {}) {
  const allowed = new Set(['not_requested', 'pending', 'captured', 'permission_needed', 'unavailable', 'skipped']);
  const stateValue = String(status?.state || 'not_requested');
  return {
    state: allowed.has(stateValue) ? stateValue : 'not_requested',
    reason: String(status?.reason || '').trim(),
    updatedAt: String(status?.updatedAt || '').trim(),
  };
}

function normalizeRoundWeatherSnapshot(weather) {
  if (!weather || typeof weather !== 'object') return null;
  const summary = String(weather.summary || '').trim();
  const normalized = {
    capturedAt: String(weather.capturedAt || '').trim(),
    source: String(weather.source || WEATHER_CAPTURE_SOURCE).trim() || WEATHER_CAPTURE_SOURCE,
    latitudeApprox: roundWeatherCoordinate(weather.latitudeApprox),
    longitudeApprox: roundWeatherCoordinate(weather.longitudeApprox),
    temperature: roundWeatherNumber(weather.temperature),
    apparentTemperature: roundWeatherNumber(weather.apparentTemperature),
    windSpeed: roundWeatherNumber(weather.windSpeed),
    windDirection: roundWeatherNumber(weather.windDirection),
    precipitation: roundWeatherNumber(weather.precipitation, 2),
    conditionsCode: Number.isFinite(Number(weather.conditionsCode)) ? Number(weather.conditionsCode) : null,
    conditionsText: String(weather.conditionsText || '').trim(),
    humidity: roundWeatherNumber(weather.humidity),
    summary,
  };
  const hasWeatherData = !!normalized.summary
    || !!normalized.capturedAt
    || normalized.temperature != null
    || normalized.apparentTemperature != null
    || normalized.windSpeed != null
    || normalized.conditionsCode != null;
  return hasWeatherData ? normalized : null;
}

function normalizeRoundContext(context = {}) {
  const roundContext = context && typeof context === 'object' ? context : {};
  const weather = normalizeRoundWeatherSnapshot(roundContext.weather);
  const weatherStatus = normalizeRoundWeatherStatus(roundContext.weatherStatus || (weather ? { state: 'captured', updatedAt: weather.capturedAt } : {}));
  return {
    ...roundContext,
    weather,
    weatherStatus: weather ? { ...weatherStatus, state: 'captured', reason: weatherStatus.reason || 'Weather context captured.' } : weatherStatus,
  };
}

function setRoundWeatherStatus(match, stateValue, reason = '') {
  if (!match) return;
  match.roundContext = normalizeRoundContext(match.roundContext);
  match.roundContext.weatherStatus = normalizeRoundWeatherStatus({
    state: stateValue,
    reason,
    updatedAt: new Date().toISOString(),
  });
}

function getWeatherConditionText(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'clear skies';
  if (n === 1) return 'mostly clear skies';
  if (n === 2) return 'partly cloudy skies';
  if (n === 3) return 'overcast skies';
  if (n === 45 || n === 48) return 'fog';
  if ([51, 53, 55].includes(n)) return 'drizzle';
  if ([56, 57].includes(n)) return 'freezing drizzle';
  if ([61, 63, 65].includes(n)) return 'rain';
  if ([66, 67].includes(n)) return 'freezing rain';
  if ([71, 73, 75, 77].includes(n)) return 'snow';
  if ([80, 81, 82].includes(n)) return 'rain showers';
  if ([85, 86].includes(n)) return 'snow showers';
  if ([95, 96, 99].includes(n)) return 'thunderstorms';
  return 'current conditions';
}

function getTemperatureDescriptor(temp) {
  const n = Number(temp);
  if (!Number.isFinite(n)) return '';
  if (n < 45) return 'cold';
  if (n < 60) return 'cool';
  if (n < 76) return 'mild';
  if (n < 86) return 'warm';
  return 'hot';
}

function getWindDirectionText(degrees) {
  const n = Number(degrees);
  if (!Number.isFinite(n)) return '';
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return directions[Math.round((((n % 360) + 360) % 360) / 45) % 8];
}

function getWindDescriptor(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 1) return 'calm';
  if (n < 8) return 'light';
  if (n < 15) return 'steady';
  if (n < 22) return 'breezy';
  return 'windy';
}

function buildWeatherSummary(weather) {
  const condition = String(weather?.conditionsText || getWeatherConditionText(weather?.conditionsCode) || 'conditions').trim();
  const temp = roundWeatherNumber(weather?.temperature);
  const temperatureText = temp == null ? '' : `${temp}F`;
  const descriptor = getTemperatureDescriptor(temp);
  const windSpeed = roundWeatherNumber(weather?.windSpeed);
  const windDirection = getWindDirectionText(weather?.windDirection);
  const windDescriptor = getWindDescriptor(windSpeed);
  const conditionLead = condition ? `${condition.charAt(0).toUpperCase()}${condition.slice(1)}` : 'Weather';
  const tempLead = [descriptor, temperatureText].filter(Boolean).join(', ');
  const windText = windSpeed == null || windDescriptor === 'calm'
    ? 'calm winds'
    : `${windDescriptor}${windDirection ? ` ${windDirection}` : ''} wind around ${windSpeed} mph`;
  const precip = Number(weather?.precipitation);
  const precipText = Number.isFinite(precip) && precip > 0 ? `, with ${roundWeatherNumber(precip, 2)} in. precipitation reported` : '';
  return `${conditionLead}${tempLead ? ` and ${tempLead}` : ''}, with ${windText}${precipText}.`;
}

function getRoundWeatherSummary(match) {
  return String(match?.roundContext?.weather?.summary || '').trim();
}

function formatRoundWeatherDisplay(match) {
  try {
    const weather = normalizeRoundWeatherSnapshot(match?.roundContext?.weather || match?.weatherSnapshot || match?.weather);
    if (!weather) return '';
    const bits = [];
    if (weather.temperature != null) bits.push(`${weather.temperature}°F`);
    const condition = String(weather.conditionsText || getWeatherConditionText(weather.conditionsCode) || '').trim();
    const windDirection = getWindDirectionText(weather.windDirection);
    if (weather.windSpeed != null) bits.push(`Wind ${weather.windSpeed} mph${windDirection ? ` ${windDirection}` : ''}`);
    if (condition) bits.push(condition.charAt(0).toUpperCase() + condition.slice(1));
    return bits.length ? `Weather: ${bits.join(' · ')}` : String(weather.summary || '').trim();
  } catch (_) {
    return '';
  }
}

function getRoundWeatherStatusLabel(match) {
  const summary = getRoundWeatherSummary(match);
  if (summary) return { label: 'Weather context captured', detail: summary, kind: 'ok' };
  const status = normalizeRoundWeatherStatus(match?.roundContext?.weatherStatus || {});
  if (status.state === 'pending') return { label: 'Weather capture in progress', detail: 'Scoring is available while weather context is captured.', kind: 'info' };
  if (status.state === 'permission_needed') return { label: 'Location permission needed', detail: status.reason || 'Weather context was skipped because location was not available.', kind: 'warn' };
  if (status.state === 'unavailable') return { label: 'Weather unavailable', detail: status.reason || 'Weather context could not be captured for this round.', kind: 'warn' };
  if (status.state === 'skipped') return { label: 'Weather skipped', detail: status.reason || 'Weather context was skipped for this round.', kind: 'info' };
  return { label: 'Weather context optional', detail: 'Weather context uses your location once when the round starts. It is saved only with this round.', kind: 'info' };
}

function getCurrentWeatherPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: WEATHER_CAPTURE_TIMEOUT_MS,
      maximumAge: WEATHER_GEOLOCATION_MAX_AGE_MS,
    });
  });
}

async function fetchOpenMeteoCurrentWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Weather unavailable (${response.status}).`);
  return data;
}

function buildWeatherSnapshotFromOpenMeteo(position, data) {
  const current = data?.current && typeof data.current === 'object' ? data.current : null;
  if (!current) throw new Error('Weather response did not include current conditions.');
  const weather = {
    capturedAt: new Date().toISOString(),
    source: WEATHER_CAPTURE_SOURCE,
    latitudeApprox: roundWeatherCoordinate(position?.coords?.latitude),
    longitudeApprox: roundWeatherCoordinate(position?.coords?.longitude),
    temperature: roundWeatherNumber(current.temperature_2m),
    apparentTemperature: roundWeatherNumber(current.apparent_temperature),
    windSpeed: roundWeatherNumber(current.wind_speed_10m),
    windDirection: roundWeatherNumber(current.wind_direction_10m),
    precipitation: roundWeatherNumber(current.precipitation, 2),
    conditionsCode: Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : null,
    conditionsText: getWeatherConditionText(current.weather_code),
    humidity: roundWeatherNumber(current.relative_humidity_2m),
  };
  weather.summary = buildWeatherSummary(weather);
  return normalizeRoundWeatherSnapshot(weather);
}

function getWeatherFailureStatus(error) {
  const code = Number(error?.code);
  if (code === 1) return { state: 'permission_needed', reason: 'Location permission was denied, so weather context was skipped.' };
  if (code === 2) return { state: 'unavailable', reason: 'Location was unavailable, so weather context was skipped.' };
  if (code === 3) return { state: 'unavailable', reason: 'Location timed out, so weather context was skipped.' };
  return { state: 'unavailable', reason: 'Weather context could not be captured.' };
}

async function captureWeatherForMatch(matchId) {
  const match = getMatch(matchId);
  if (!match) return false;
  match.roundContext = normalizeRoundContext(match.roundContext);
  if (match.roundContext.weather) return false;
  try {
    if (navigator.onLine === false) {
      setRoundWeatherStatus(match, 'skipped', 'Weather unavailable offline.');
      persistWeatherCaptureResult(match);
      return false;
    }
    if (!navigator.geolocation) {
      setRoundWeatherStatus(match, 'skipped', 'Weather skipped because location is not available on this device.');
      persistWeatherCaptureResult(match);
      return false;
    }
    setRoundWeatherStatus(match, 'pending', 'Capturing weather context...');
    persistWeatherCaptureResult(match);
    const position = await getCurrentWeatherPosition();
    const data = await fetchOpenMeteoCurrentWeather(position.coords.latitude, position.coords.longitude);
    const snapshot = buildWeatherSnapshotFromOpenMeteo(position, data);
    if (!snapshot) throw new Error('Weather response did not include usable current conditions.');
    match.roundContext = normalizeRoundContext(match.roundContext);
    match.roundContext.weather = snapshot;
    setRoundWeatherStatus(match, 'captured', 'Weather context captured.');
    persistWeatherCaptureResult(match);
    return true;
  } catch (err) {
    const status = getWeatherFailureStatus(err);
    setRoundWeatherStatus(match, status.state, status.reason);
    persistWeatherCaptureResult(match);
    return false;
  }
}

function persistWeatherCaptureResult(match) {
  normalizeMatch(match);
  persist({ skipRender: true });
  if (match?.storageMode === 'shared') scheduleSharedMatchSync(match, { immediate: true, silent: true });
  renderRoundReadiness();
  renderRoundRecapControlPanel(match);
}

function scheduleWeatherCaptureForMatch(matchId) {
  if (!matchId) return;
  window.setTimeout(() => { captureWeatherForMatch(matchId).catch(() => {}); }, 0);
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

function getCourseLastPlayedAt(course) {
  if (!course) return '';
  const direct = String(course.lastPlayedAt || course.lastUsedAt || '').trim();
  const fromMatches = state.matches
    .filter(m => String(m.courseId || '') === String(course.id || '') && (m.date || m.createdAt || m.completedAt))
    .map(m => String(m.date || m.completedAt || m.createdAt || '').slice(0, 10))
    .sort((a, b) => b.localeCompare(a))[0] || '';
  return direct || fromMatches || '';
}
function formatRelativeCourseDate(value = '') {
  const iso = String(value || '').slice(0, 10);
  if (!iso) return '';
  try {
    const today = new Date(todayIso() + 'T00:00:00');
    const day = new Date(iso + 'T00:00:00');
    const diff = Math.round((today - day) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    if (diff < 14) return '1 week ago';
    if (diff < 45) return `${Math.round(diff / 7)} weeks ago`;
    return iso;
  } catch { return iso; }
}
function getRecentCourses(limit = 3) {
  return state.courses
    .map(course => ({ course, lastPlayedAt: getCourseLastPlayedAt(course) }))
    .filter(row => row.lastPlayedAt)
    .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || String(a.course.name || '').localeCompare(String(b.course.name || '')))
    .slice(0, limit)
    .map(row => row.course);
}
function markCourseRecentlyUsed(courseId, dateValue = todayIso()) {
  const course = getCourse(courseId);
  if (!course) return;
  const next = String(dateValue || todayIso()).slice(0, 10);
  if (!course.lastPlayedAt || String(course.lastPlayedAt).slice(0, 10) < next) course.lastPlayedAt = next;
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

function getDefaultSneakySandyPoleyConfig() {
  return {
    key: 'sneaky_sandy_poley',
    enabled: true,
    pointValue: 1,
    validateGreenyProx: false,
    allowBridgeRebridge: false,
    allowUmbee: false,
    allowUmbeeWithBridge: false,
    sspSequenceMode: 'routing',
    version: 1,
  };
}

function normalizeSneakySandyPoleyConfig(config = {}) {
  const defaults = getDefaultSneakySandyPoleyConfig();
  const pointValue = Number(config.pointValue ?? config.stakePerPoint ?? defaults.pointValue);
  const allowUmbee = !!config.allowUmbee;
  const sspSequenceMode = String(config.sspSequenceMode || '').toLowerCase() === 'entry' ? 'entry' : 'routing';
  return {
    ...defaults,
    ...config,
    key: 'sneaky_sandy_poley',
    enabled: config.enabled == null ? true : !!config.enabled,
    pointValue: Number.isFinite(pointValue) && pointValue >= 0 ? pointValue : defaults.pointValue,
    validateGreenyProx: !!config.validateGreenyProx,
    allowBridgeRebridge: !!config.allowBridgeRebridge,
    allowUmbee,
    allowUmbeeWithBridge: allowUmbee && !!config.allowUmbeeWithBridge,
    sspSequenceMode,
    version: 1,
  };
}

function isSneakySandyPoleyEnabled(match) {
  return (match?.selectedGames || []).some(g => g.key === 'sneaky_sandy_poley');
}

function getSneakySandyPoleyConfig(match) {
  const cfg = (match?.selectedGames || []).find(g => g.key === 'sneaky_sandy_poley');
  return cfg ? normalizeSneakySandyPoleyConfig(cfg) : null;
}

function getDefaultSneakySandyPoleyHoleInput(match, holeNumber = 1) {
  const playerIds = getMatchPlayerIds(match);
  const players = {};
  playerIds.forEach(playerId => {
    players[playerId] = { sneaky: false, sandy: false, poley: false, greeny: false };
  });
  return { holeNumber: Number(holeNumber) || 1, players, proxPlayerId: '', bridge: false, rebridge: false, notes: '' };
}

function normalizeSneakySandyPoleyHoleInput(match, raw = {}, holeNumber = 1) {
  const defaults = getDefaultSneakySandyPoleyHoleInput(match, holeNumber);
  const rawPlayers = raw?.players && typeof raw.players === 'object' ? raw.players : {};
  Object.keys(defaults.players).forEach(playerId => {
    const row = rawPlayers[playerId] || {};
    const sandy = !!row.sandy;
    defaults.players[playerId] = {
      sneaky: !!row.sneaky || sandy,
      sandy,
      poley: !!row.poley,
      greeny: !!row.greeny,
    };
  });
  const allowedIds = new Set(Object.keys(defaults.players));
  const proxPlayerId = String(raw?.proxPlayerId || '');
  defaults.proxPlayerId = allowedIds.has(proxPlayerId) ? proxPlayerId : '';
  defaults.bridge = !!raw?.bridge;
  defaults.rebridge = !!raw?.rebridge;
  defaults.notes = String(raw?.notes || '').slice(0, 240);
  return defaults;
}

function normalizeSneakySandyPoleyInputs(match) {
  const source = match?.sneakySandyPoleyInputs && typeof match.sneakySandyPoleyInputs === 'object' ? match.sneakySandyPoleyInputs : {};
  const normalized = {};
  Object.keys(source).forEach(key => {
    const holeNumber = Number(key);
    if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) return;
    normalized[String(holeNumber)] = normalizeSneakySandyPoleyHoleInput(match, source[key], holeNumber);
  });
  match.sneakySandyPoleyInputs = normalized;
  return normalized;
}

function buildSharedSspFacts(match) {
  if (!isSneakySandyPoleyEnabled(match)) return null;
  return {
    version: 1,
    settings: getSneakySandyPoleyConfig(match),
    inputs: JSON.parse(JSON.stringify(normalizeSneakySandyPoleyInputs(match))),
    playedHoleOrder: Array.isArray(match.playedHoleOrder) ? [...match.playedHoleOrder] : [],
    holeFirstCompletedAt: { ...(match.holeFirstCompletedAt || {}) },
    updatedAt: match.sharedSspUpdatedAt || new Date().toISOString(),
    sourceDeviceId: match.sharedSspSourceDeviceId || getSharedDeviceId(),
  };
}
function flattenSharedSspFacts(facts = null) {
  const flat = {};
  if (!facts || typeof facts !== 'object') return flat;
  if (facts.settings) flat.settings = JSON.stringify(facts.settings);
  Object.entries(facts.inputs || {}).forEach(([hole, input]) => {
    Object.entries(input?.players || {}).forEach(([playerId, row]) => {
      ['sneaky', 'sandy', 'poley', 'greeny'].forEach(key => {
        flat[`holes.${hole}.players.${playerId}.${key}`] = key === 'sneaky' ? (!!row?.sneaky || !!row?.sandy) : !!row?.[key];
      });
    });
    ['proxPlayerId', 'bridge', 'rebridge', 'notes'].forEach(key => { flat[`holes.${hole}.${key}`] = input?.[key] ?? (key === 'proxPlayerId' || key === 'notes' ? '' : false); });
  });
  flat.playedHoleOrder = JSON.stringify(facts.playedHoleOrder || []);
  flat.holeFirstCompletedAt = JSON.stringify(facts.holeFirstCompletedAt || {});
  return flat;
}
function reconcileSharedSspFacts(localFacts, remoteFacts, baselineFacts = null, { isHost = false } = {}) {
  if (!localFacts) return { facts: remoteFacts || null, conflicts: [] };
  if (!remoteFacts) return { facts: localFacts, conflicts: [] };
  const local = flattenSharedSspFacts(localFacts);
  const remote = flattenSharedSspFacts(remoteFacts);
  const base = flattenSharedSspFacts(baselineFacts);
  const conflicts = [];
  const useRemote = new Set();
  new Set([...Object.keys(local), ...Object.keys(remote)]).forEach(field => {
    if (local[field] === remote[field]) return;
    const localChanged = !baselineFacts || local[field] !== base[field];
    const remoteChanged = !baselineFacts || remote[field] !== base[field];
    if (localChanged && remoteChanged) conflicts.push({ field, localValue: local[field], remoteValue: remote[field], holeNumber: Number(field.match(/^holes\.(\d+)/)?.[1] || 0), remoteSourceDeviceId: remoteFacts.sourceDeviceId || '' });
    else if (remoteChanged || (!localChanged && !isHost)) useRemote.add(field);
  });
  if (conflicts.length) return { facts: localFacts, conflicts };
  if (!useRemote.size) return { facts: localFacts, conflicts: [] };
  const merged = JSON.parse(JSON.stringify(localFacts));
  useRemote.forEach(field => {
    if (field === 'settings') merged.settings = JSON.parse(remote[field]);
    else if (field === 'playedHoleOrder') merged.playedHoleOrder = JSON.parse(remote[field]);
    else if (field === 'holeFirstCompletedAt') merged.holeFirstCompletedAt = JSON.parse(remote[field]);
    else {
      const parts = field.split('.');
      if (parts[0] === 'holes') parts[0] = 'inputs';
      let cursor = merged;
      parts.forEach((part, idx) => {
        if (idx === parts.length - 1) cursor[part] = remote[field];
        else cursor = cursor[part] || (cursor[part] = {});
      });
    }
  });
  merged.updatedAt = remoteFacts.updatedAt || merged.updatedAt;
  return { facts: merged, conflicts: [] };
}
function applySharedSspFacts(match, facts, { baseline = true } = {}) {
  if (!match || !facts) return false;
  const before = JSON.stringify(buildSharedSspFacts(match));
  if (facts.settings) {
    const others = (match.selectedGames || []).filter(game => game.key !== 'sneaky_sandy_poley');
    match.selectedGames = normalizeSelectedGamesOrder([...others, normalizeSneakySandyPoleyConfig(facts.settings)]);
  }
  match.sneakySandyPoleyInputs = JSON.parse(JSON.stringify(facts.inputs || {}));
  match.playedHoleOrder = Array.isArray(facts.playedHoleOrder) ? [...facts.playedHoleOrder] : [];
  match.holeFirstCompletedAt = { ...(facts.holeFirstCompletedAt || {}) };
  normalizeSneakySandyPoleyInputs(match);
  match.sharedSspUpdatedAt = facts.updatedAt || null;
  match.sharedSspSourceDeviceId = facts.sourceDeviceId || '';
  if (baseline) match.sharedSspBaseline = JSON.parse(JSON.stringify(facts));
  return before !== JSON.stringify(buildSharedSspFacts(match));
}

function getSneakySandyPoleyHoleInput(match, holeNumber = currentHole) {
  if (!match) return getDefaultSneakySandyPoleyHoleInput(match, holeNumber);
  if (!match.sneakySandyPoleyInputs || typeof match.sneakySandyPoleyInputs !== 'object') match.sneakySandyPoleyInputs = {};
  const key = String(Number(holeNumber) || 1);
  return normalizeSneakySandyPoleyHoleInput(match, match.sneakySandyPoleyInputs[key] || {}, Number(key));
}

function getSneakySandyPoleyTeamWarnings({ teamCount = 1, playersPerTeam = 1, players = [] } = {}) {
  const warnings = [];
  const totalPlayers = Array.isArray(players) ? players.length : 0;
  if (Number(teamCount) !== 2) warnings.push('Sneaky / Sandy / Poley requires exactly two teams.');
  if (totalPlayers % 2 !== 0) warnings.push('Sneaky / Sandy / Poley requires an even number of players.');
  if (Number(playersPerTeam) > 4) warnings.push('Sneaky / Sandy / Poley supports 1 to 4 players per team.');
  const teamSizes = new Map();
  (players || []).forEach(row => {
    const team = Number(row.team) || 1;
    teamSizes.set(team, (teamSizes.get(team) || 0) + 1);
  });
  if (Number(teamCount) === 2 && teamSizes.size !== 2) warnings.push('Sneaky / Sandy / Poley requires two populated teams.');
  if (Number(teamCount) === 2 && teamSizes.size === 2) {
    const sizes = [teamSizes.get(1) || 0, teamSizes.get(2) || 0];
    if (sizes[0] !== sizes[1]) warnings.push('Sneaky / Sandy / Poley requires equal team sizes.');
    if (sizes.some(size => size > 4)) warnings.push('Sneaky / Sandy / Poley supports no more than 4 players per team.');
  }
  return [...new Set(warnings)];
}

function getSneakySandyPoleyPlayerStat(match, playerId, holeIdx) {
  const playerRef = (match?.players || []).find(row => String(row.playerId) === String(playerId));
  const available = !!(match && playerRef && isStatTrackingEnabled(match) && isPlayerStatTrackingEnabled(match, playerId) && Array.isArray(playerRef.stats) && playerRef.stats[holeIdx]);
  return { available, stat: available ? normalizeHoleStat(playerRef.stats[holeIdx] || {}, holeIdx) : null };
}

function createSneakySandyPoleyTeamPointMap(teams = [], value = 0) {
  return Object.fromEntries((teams || []).map(team => [team.id, Number(value) || 0]));
}

function getSneakySandyPoleyPointWinner(pointsByTeam = {}, teams = []) {
  if ((teams || []).length !== 2) return { teamId: null, tied: true, margin: 0, total: 0 };
  const a = Number(pointsByTeam[teams[0].id] || 0);
  const b = Number(pointsByTeam[teams[1].id] || 0);
  const total = a + b;
  if (a === b) return { teamId: null, tied: true, margin: 0, total };
  return { teamId: a > b ? teams[0].id : teams[1].id, tied: false, margin: Math.abs(a - b), total };
}

function getSneakySandyPoleyBridgeState(cfg = {}, holeInput = {}, holeWarnings = []) {
  const requestedRebridge = !!holeInput?.rebridge;
  const requestedBridge = !!holeInput?.bridge || requestedRebridge;
  if (!requestedBridge) return { active: false, rebridge: false, multiplier: 1, label: '1x' };
  if (!cfg.allowBridgeRebridge) {
    if (holeWarnings) holeWarnings.push('Bridge/Re-Bridge ignored because it is off in Match Setup.');
    return { active: false, rebridge: false, multiplier: 1, label: '1x' };
  }
  if (requestedRebridge) return { active: true, rebridge: true, multiplier: 4, label: 'Re-Bridge 4x' };
  return { active: true, rebridge: false, multiplier: 2, label: 'Bridge 2x' };
}

function getSneakySandyPoleyUmbeeState(cfg = {}, holeLedger, teams = [], bridge = null, holeWarnings = []) {
  const inactive = { active: false, multiplier: 1, teamId: null, reason: '' };
  if (!cfg.allowUmbee) return inactive;
  if (bridge?.active && !cfg.allowUmbeeWithBridge) {
    return { ...inactive, reason: 'Umbee skipped on bridged hole.' };
  }
  const postPoints = holeLedger?.pointsAfterTakeKeepByTeam || {};
  const qualifiers = (teams || []).map(team => {
    const rows = holeLedger?.categoriesByTeam?.[team.id] || [];
    const birdies = rows.filter(row => row.category === 'birdie').length;
    const eagles = rows.filter(row => row.category === 'eagle').length;
    let multiplier = 1;
    let reason = '';
    if (eagles >= 1) {
      multiplier = 4;
      reason = eagles > 1 ? 'Eagle/Eagle Umbee 4x' : 'Eagle Umbee 4x';
    } else if (birdies >= 2) {
      multiplier = 4;
      reason = 'Birdie/Birdie Umbee 4x';
    } else if (birdies === 1) {
      multiplier = 2;
      reason = 'Birdie Umbee 2x';
    }
    const opponentHasPoints = (teams || []).some(other => other.id !== team.id && Number(postPoints[other.id] || 0) > 0);
    return {
      teamId: team.id,
      multiplier,
      reason,
      qualifies: multiplier > 1 && Number(postPoints[team.id] || 0) > 0 && !opponentHasPoints,
    };
  }).filter(row => row.qualifies);
  if (qualifiers.length === 1) {
    const winner = qualifiers[0];
    return { active: true, multiplier: winner.multiplier, teamId: winner.teamId, reason: winner.reason };
  }
  if (qualifiers.length > 1 && holeWarnings) holeWarnings.push('Umbee skipped because both teams qualified.');
  return inactive;
}

function buildSneakySandyPoleySettlement(match, ledger) {
  const teams = ledger?.teams || [];
  const invalid = (label = 'SSP: settlement unavailable — teams must be equal') => ({ valid: false, tied: true, netPoints: 0, pointValue: 0, amount: 0, perPlayerAmount: 0, totalTransferred: 0, playerAmounts: {}, payerTeamId: null, payeeTeamId: null, label });
  if (teams.length !== 2) return invalid('SSP: setup incomplete');
  const teamPlayerIds = teams.map(team => Array.isArray(team.playerIds) ? team.playerIds.filter(Boolean) : []);
  if (!teamPlayerIds[0].length || teamPlayerIds[0].length !== teamPlayerIds[1].length) return invalid();
  const totals = ledger?.finalTotalsByTeam || ledger?.totalsByTeam || {};
  const pointValue = Number(ledger?.settings?.pointValue ?? getSneakySandyPoleyConfig(match)?.pointValue ?? 0) || 0;
  const a = Number(totals[teams[0].id] || 0);
  const b = Number(totals[teams[1].id] || 0);
  const netPoints = Math.abs(a - b);
  if (!netPoints) return { valid: true, tied: true, netPoints: 0, pointValue, amount: 0, perPlayerAmount: 0, totalTransferred: 0, playerAmounts: {}, payerTeamId: null, payeeTeamId: null, label: 'SSP: tied, no money changes hands' };
  const payeeTeamId = a > b ? teams[0].id : teams[1].id;
  const payerTeamId = a > b ? teams[1].id : teams[0].id;
  const amount = netPoints * pointValue;
  const payer = formatSneakySandyPoleyTeamName(ledger, match, payerTeamId);
  const payee = formatSneakySandyPoleyTeamName(ledger, match, payeeTeamId);
  const payerIds = teams.find(team => team.id === payerTeamId)?.playerIds || [];
  const payeeIds = teams.find(team => team.id === payeeTeamId)?.playerIds || [];
  const playerAmounts = {};
  payerIds.forEach(playerId => { playerAmounts[playerId] = -amount; });
  payeeIds.forEach(playerId => { playerAmounts[playerId] = amount; });
  const totalTransferred = amount * payerIds.length;
  return {
    valid: true,
    tied: false,
    netPoints,
    pointValue,
    amount,
    perPlayerAmount: amount,
    totalTransferred,
    playerAmounts,
    payerTeamId,
    payeeTeamId,
    payerTeamName: payer,
    payeeTeamName: payee,
    label: `SSP: ${payee} +${netPoints} · ${formatPositiveCurrency(amount, 2)}/player`,
    payerLabel: `Each ${payer} player pays ${formatPositiveCurrency(amount, 2)}`,
    payeeLabel: `Each ${payee} player receives ${formatPositiveCurrency(amount, 2)}`,
  };
}

function buildSneakySandyPoleyLedger(match, options = {}) {
  const cfg = getSneakySandyPoleyConfig(match);
  const empty = {
    enabled: false,
    settings: cfg,
    teams: [],
    holes: {},
    totalsByTeam: {},
    baseTotalsByTeam: {},
    finalTotalsByTeam: {},
    leader: { teamId: null, margin: 0, thru: 0, tied: true },
    finalLeader: { teamId: null, margin: 0, thru: 0, tied: true },
    settlement: { tied: true, netPoints: 0, pointValue: 0, amount: 0, payerTeamId: null, payeeTeamId: null, label: '' },
    honorsByHole: {},
    warnings: [],
  };
  if (!match || !cfg) return empty;
  const metrics = options.metrics || computeMatchMetrics(match);
  if (!metrics || !Array.isArray(metrics.players) || !Array.isArray(metrics.holeResults)) {
    return { ...empty, enabled: true, warnings: ['SSP ledger requires course, tee, and player score context.'] };
  }
  const teamNos = [...new Set((metrics.players || []).map(p => Number(p.team) || 1))].sort((a, b) => a - b).slice(0, 2);
  const teams = teamNos.map(teamNo => ({
    id: String(teamNo),
    team: teamNo,
    name: getTeamLabel(match, teamNo),
    playerIds: (metrics.players || []).filter(p => Number(p.team) === teamNo).map(p => String(p.playerId)),
  }));
  const warnings = [];
  if (teams.length !== 2) warnings.push('SSP base ledger requires exactly two teams.');
  const totalsByTeam = Object.fromEntries(teams.map(team => [team.id, 0]));
  const finalTotalsByTeam = Object.fromEntries(teams.map(team => [team.id, 0]));
  const holes = {};
  const honorsByHole = {};
  const getTeamIdForPlayer = playerId => {
    const row = (metrics.players || []).find(p => String(p.playerId) === String(playerId));
    return row ? String(Number(row.team) || 1) : '';
  };
  const getPlayerName = playerId => getPlayer(playerId)?.name || (metrics.players || []).find(p => String(p.playerId) === String(playerId))?.player?.name || 'Player';
  const addCategory = (holeLedger, teamId, item) => {
    if (!teamId || !holeLedger.basePointsByTeam.hasOwnProperty(teamId)) return;
    const points = Number(item.points) || 0;
    if (!points) return;
    holeLedger.basePointsByTeam[teamId] += points;
    holeLedger.categoriesByTeam[teamId].push({ ...item, points });
  };
  metrics.holeResults.forEach((holeResult, idx) => {
    const holeNumber = Number(holeResult?.holeNumber || idx + 1);
    const rawHoleInputs = match?.sneakySandyPoleyInputs && typeof match.sneakySandyPoleyInputs === 'object' ? match.sneakySandyPoleyInputs : {};
    const holeInput = normalizeSneakySandyPoleyHoleInput(match, rawHoleInputs[String(holeNumber)] || {}, holeNumber);
    const holeWarnings = [];
    const holeLedger = {
      holeNumber,
      complete: !!holeResult?.completed,
      counted: false,
      basePointsByTeam: Object.fromEntries(teams.map(team => [team.id, 0])),
      categoriesByTeam: Object.fromEntries(teams.map(team => [team.id, []])),
      baseCategoriesByTeam: Object.fromEntries(teams.map(team => [team.id, []])),
      takeKeep: { type: null, teamId: null, points: 0, reason: '' },
      pointsAfterTakeKeepByTeam: Object.fromEntries(teams.map(team => [team.id, 0])),
      bridge: { active: false, rebridge: false, multiplier: 1, label: '1x' },
      umbee: { active: false, multiplier: 1, teamId: null, reason: '' },
      finalMultiplierByTeam: Object.fromEntries(teams.map(team => [team.id, 1])),
      finalPointsByTeam: Object.fromEntries(teams.map(team => [team.id, 0])),
      warnings: holeWarnings,
    };
    const playerScores = Array.isArray(holeResult?.playerScores) ? holeResult.playerScores : [];
    const byPlayer = new Map(playerScores.map(score => [String(score.playerId), score]));
    (metrics.players || []).forEach(playerMetric => {
      const playerId = String(playerMetric.playerId);
      const teamId = String(Number(playerMetric.team) || 1);
      if (!holeLedger.basePointsByTeam.hasOwnProperty(teamId)) return;
      const score = byPlayer.get(playerId) || {};
      const gross = Number(score.gross);
      const par = Number(score.par || holeResult?.par || 0);
      const hasGross = Number.isFinite(gross) && gross > 0;
      const hasPar = Number.isFinite(par) && par > 0;
      const input = holeInput.players?.[playerId] || {};
      const { available: statsAvailable, stat } = getSneakySandyPoleyPlayerStat(match, playerId, idx);
      if (input.sneaky) {
        if (!hasGross || !hasPar) holeWarnings.push(`${getPlayerName(playerId)} Sneaky pending score/par validation.`);
        else if (gross !== par) holeWarnings.push(`${getPlayerName(playerId)} Sneaky requires par.`);
        else addCategory(holeLedger, teamId, { category: 'sneaky', points: 1, playerId, label: `${getPlayerName(playerId)}: Sneaky` });
      }
      if (input.sandy) {
        if (!hasGross || !hasPar) holeWarnings.push(`${getPlayerName(playerId)} Sandy pending score/par validation.`);
        else if (gross !== par) holeWarnings.push(`${getPlayerName(playerId)} Sandy requires par.`);
        else addCategory(holeLedger, teamId, { category: 'sandy', points: 1, playerId, label: `${getPlayerName(playerId)}: Sandy` });
        if (!input.sneaky) holeWarnings.push(`${getPlayerName(playerId)} Sandy stacks with Sneaky; confirm Sneaky if applicable.`);
      }
      if (input.poley) {
        if (!hasGross || !hasPar) holeWarnings.push(`${getPlayerName(playerId)} Poley pending score/par validation.`);
        else if (gross > par + 2) holeWarnings.push(`${getPlayerName(playerId)} Poley requires double bogey or better.`);
        else addCategory(holeLedger, teamId, { category: 'poley', points: 1, playerId, label: `${getPlayerName(playerId)}: Poley` });
      }
      if (input.greeny) {
        if (cfg.validateGreenyProx) {
          if (!statsAvailable) holeWarnings.push(`${getPlayerName(playerId)} Greeny requires 2 putts or less to validate.`);
          else if (Number(stat.putts) <= 2) addCategory(holeLedger, teamId, { category: 'greeny', points: 1, playerId, label: `${getPlayerName(playerId)}: Greeny` });
          else holeWarnings.push(`${getPlayerName(playerId)} Greeny requires 2 putts or less to validate.`);
        } else {
          addCategory(holeLedger, teamId, { category: 'greeny', points: 1, playerId, label: `${getPlayerName(playerId)}: Greeny` });
        }
      }
      if (hasGross && hasPar && gross === par - 1) addCategory(holeLedger, teamId, { category: 'birdie', points: 2, playerId, label: `${getPlayerName(playerId)}: Birdie` });
      if (hasGross && hasPar && gross <= par - 2) addCategory(holeLedger, teamId, { category: 'eagle', points: 4, playerId, label: `${getPlayerName(playerId)}: Eagle` });
    });
    if (holeInput.proxPlayerId) {
      const playerId = String(holeInput.proxPlayerId);
      const teamId = getTeamIdForPlayer(playerId);
      const playerInput = holeInput.players?.[playerId] || {};
      const { available: statsAvailable, stat } = getSneakySandyPoleyPlayerStat(match, playerId, idx);
      const validateOk = !cfg.validateGreenyProx || (statsAvailable && Number(stat?.putts) <= 2);
      if (!teamId || !holeLedger.basePointsByTeam.hasOwnProperty(teamId)) holeWarnings.push('Prox player is not on an SSP team.');
      else if (!playerInput.greeny) holeWarnings.push('Prox requires an eligible Greeny.');
      else if (!validateOk) holeWarnings.push('Prox requires 2 putts or less to validate.');
      else addCategory(holeLedger, teamId, { category: 'prox', points: 2, playerId, label: `${getPlayerName(playerId)}: Prox` });
    }
    const scoredByTeam = teams.map(team => {
      const scores = playerScores.filter(score => String(score.team) === team.id && score.net != null && Number.isFinite(Number(score.net)));
      return { teamId: team.id, scores };
    });
    if (scoredByTeam.length === 2 && scoredByTeam.every(row => row.scores.length > 0)) {
      const lowNet = Math.min(...scoredByTeam.flatMap(row => row.scores.map(score => Number(score.net))));
      const lowTeams = new Set(scoredByTeam.flatMap(row => row.scores.filter(score => Number(score.net) === lowNet).map(() => row.teamId)));
      if (lowTeams.size === 1) addCategory(holeLedger, [...lowTeams][0], { category: 'lowBall', points: 2, label: 'Low Ball' });
    } else {
      holeWarnings.push('Low Ball requires at least one valid score on each team.');
    }
    const teamTotals = scoredByTeam.map(row => {
      const expected = teams.find(team => team.id === row.teamId)?.playerIds.length || 0;
      return { ...row, expected, complete: expected > 0 && row.scores.length === expected, net: row.scores.reduce((sum, score) => sum + Number(score.net), 0) };
    });
    if (teamTotals.length === 2 && teamTotals.every(row => row.complete)) {
      if (teamTotals[0].net < teamTotals[1].net) addCategory(holeLedger, teamTotals[0].teamId, { category: 'lowTotal', points: 2, label: 'Low Total' });
      else if (teamTotals[1].net < teamTotals[0].net) addCategory(holeLedger, teamTotals[1].teamId, { category: 'lowTotal', points: 2, label: 'Low Total' });
    } else {
      holeWarnings.push('Low Total requires all players on both teams to have valid scores.');
    }
    const holeTotal = Object.values(holeLedger.basePointsByTeam).reduce((sum, value) => sum + Number(value || 0), 0);
    holeLedger.counted = holeLedger.complete || holeTotal > 0;
    Object.entries(holeLedger.basePointsByTeam).forEach(([teamId, points]) => { totalsByTeam[teamId] = (totalsByTeam[teamId] || 0) + Number(points || 0); });
    holeLedger.baseCategoriesByTeam = Object.fromEntries(teams.map(team => [team.id, (holeLedger.categoriesByTeam[team.id] || []).slice()]));
    holes[String(holeNumber)] = holeLedger;
  });

  let controlTeamId = null;
  let mostRecentTakeTeamId = null;
  let priorHonorsTeamId = teams[0]?.id || null;
  const routingSequence = Object.values(holes).sort((a, b) => Number(a.holeNumber) - Number(b.holeNumber));
  const playedOrder = Array.isArray(match?.playedHoleOrder) ? match.playedHoleOrder.map(Number).filter(Number.isFinite) : [];
  const entryRank = new Map(playedOrder.map((holeNumber, idx) => [holeNumber, idx]));
  const hasEntryMetadata = entryRank.size > 0;
  const sequence = cfg.sspSequenceMode === 'entry' && hasEntryMetadata
    ? routingSequence.slice().sort((a, b) => {
      const aRank = entryRank.has(Number(a.holeNumber)) ? entryRank.get(Number(a.holeNumber)) : Number.MAX_SAFE_INTEGER;
      const bRank = entryRank.has(Number(b.holeNumber)) ? entryRank.get(Number(b.holeNumber)) : Number.MAX_SAFE_INTEGER;
      return aRank - bRank || Number(a.holeNumber) - Number(b.holeNumber);
    })
    : routingSequence;
  sequence.forEach(holeLedger => {
    const holeKey = String(holeLedger.holeNumber);
    const baseWinner = getSneakySandyPoleyPointWinner(holeLedger.basePointsByTeam, teams);
    honorsByHole[holeKey] = priorHonorsTeamId;
    holeLedger.honorsTeamId = priorHonorsTeamId;
    holeLedger.honors = {
      teamId: priorHonorsTeamId,
      label: priorHonorsTeamId ? `Honors: ${formatSneakySandyPoleyTeamName({ teams }, match, priorHonorsTeamId)}` : 'Honors: Team 1',
    };
    holeLedger.pointsAfterTakeKeepByTeam = { ...holeLedger.basePointsByTeam };
    if (holeLedger.counted && baseWinner.total > 0) {
      if (baseWinner.teamId) {
        if (!controlTeamId || controlTeamId !== baseWinner.teamId) {
          controlTeamId = baseWinner.teamId;
          mostRecentTakeTeamId = baseWinner.teamId;
          holeLedger.takeKeep = { type: 'take', teamId: baseWinner.teamId, points: 2, reason: 'Take +2' };
        } else {
          holeLedger.takeKeep = { type: 'keep', teamId: controlTeamId, points: 1, reason: 'Keep +1' };
        }
      } else if (controlTeamId || mostRecentTakeTeamId) {
        controlTeamId = controlTeamId || mostRecentTakeTeamId;
        holeLedger.takeKeep = { type: 'keep', teamId: controlTeamId, points: 1, reason: 'Keep +1' };
      }
      if (holeLedger.takeKeep.teamId) {
        holeLedger.pointsAfterTakeKeepByTeam[holeLedger.takeKeep.teamId] = Number(holeLedger.pointsAfterTakeKeepByTeam[holeLedger.takeKeep.teamId] || 0) + Number(holeLedger.takeKeep.points || 0);
        holeLedger.categoriesByTeam[holeLedger.takeKeep.teamId].push({
          category: holeLedger.takeKeep.type,
          points: holeLedger.takeKeep.points,
          label: holeLedger.takeKeep.reason,
        });
      }
    }
    if (holeLedger.counted) {
      holeLedger.bridge = getSneakySandyPoleyBridgeState(cfg, getSneakySandyPoleyHoleInput(match, holeLedger.holeNumber), holeLedger.warnings);
      holeLedger.umbee = getSneakySandyPoleyUmbeeState(cfg, holeLedger, teams, holeLedger.bridge, holeLedger.warnings);
      teams.forEach(team => {
        const bridgeMultiplier = Number(holeLedger.bridge?.multiplier || 1);
        const umbeeMultiplier = holeLedger.umbee?.teamId === team.id ? Number(holeLedger.umbee.multiplier || 1) : 1;
        const finalMultiplier = bridgeMultiplier * umbeeMultiplier;
        holeLedger.finalMultiplierByTeam[team.id] = finalMultiplier;
        holeLedger.finalPointsByTeam[team.id] = Number(holeLedger.pointsAfterTakeKeepByTeam[team.id] || 0) * finalMultiplier;
        finalTotalsByTeam[team.id] = Number(finalTotalsByTeam[team.id] || 0) + Number(holeLedger.finalPointsByTeam[team.id] || 0);
      });
    }
    const runningWinner = getSneakySandyPoleyPointWinner(finalTotalsByTeam, teams);
    holeLedger.runningTotalsByTeam = { ...finalTotalsByTeam };
    holeLedger.runningLeader = {
      teamId: runningWinner.tied ? null : runningWinner.teamId,
      margin: runningWinner.margin,
      tied: runningWinner.tied,
    };
    if (!runningWinner.tied && runningWinner.teamId) priorHonorsTeamId = runningWinner.teamId;
  });
  const totalEntries = Object.entries(totalsByTeam);
  const sortedTotals = totalEntries.slice().sort((a, b) => Number(b[1]) - Number(a[1]));
  const margin = sortedTotals.length >= 2 ? Math.abs(Number(sortedTotals[0][1]) - Number(sortedTotals[1][1])) : 0;
  const tied = !margin;
  const finalEntries = Object.entries(finalTotalsByTeam);
  const sortedFinalTotals = finalEntries.slice().sort((a, b) => Number(b[1]) - Number(a[1]));
  const finalMargin = sortedFinalTotals.length >= 2 ? Math.abs(Number(sortedFinalTotals[0][1]) - Number(sortedFinalTotals[1][1])) : 0;
  const finalTied = !finalMargin;
  const thru = Object.values(holes).filter(hole => hole.counted).length;
  const ledger = {
    enabled: true,
    settings: cfg,
    teams,
    holes,
    totalsByTeam,
    baseTotalsByTeam: totalsByTeam,
    finalTotalsByTeam,
    leader: {
      teamId: tied ? null : sortedTotals[0]?.[0] || null,
      margin,
      thru,
      tied,
    },
    finalLeader: {
      teamId: finalTied ? null : sortedFinalTotals[0]?.[0] || null,
      margin: finalMargin,
      thru,
      tied: finalTied,
    },
    settlement: null,
    honorsByHole,
    sequenceMode: cfg.sspSequenceMode,
    sequenceHoleNumbers: sequence.filter(hole => hole.counted).map(hole => Number(hole.holeNumber)),
    entryOrderFallback: cfg.sspSequenceMode === 'entry' && !hasEntryMetadata,
    warnings,
  };
  ledger.settlement = buildSneakySandyPoleySettlement(match, ledger);
  return {
    ...ledger,
  };
}

function formatSneakySandyPoleyTeamName(ledger, match, teamId) {
  const team = (ledger?.teams || []).find(row => String(row.id) === String(teamId));
  return team?.name || getTeamLabel(match, Number(teamId) || 1);
}

function getSneakySandyPoleyTeamDiffText(match, ledger, holeLedger = null, options = {}) {
  const teams = ledger?.teams || [];
  if (teams.length !== 2) return '';
  const points = options.final
    ? (holeLedger?.finalPointsByTeam || ledger.finalTotalsByTeam || ledger.totalsByTeam || {})
    : options.beforeMultiplier
      ? (holeLedger?.pointsAfterTakeKeepByTeam || {})
      : (holeLedger?.basePointsByTeam || ledger.totalsByTeam || {});
  const a = Number(points[teams[0].id] || 0);
  const b = Number(points[teams[1].id] || 0);
  if (a === b) return 'Tied';
  const leader = a > b ? teams[0] : teams[1];
  return `${leader.name} +${Math.abs(a - b)}`;
}

function getSneakySandyPoleyStatus(match, metrics = null) {
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  if (!ledger.enabled) return '';
  if ((ledger.teams || []).length !== 2) return 'SSP: setup incomplete';
  const leader = ledger.finalLeader || ledger.leader || {};
  if (!leader.thru) return 'SSP: Not started';
  if (leader.tied) return `SSP: Tied thru ${leader.thru}`;
  return `SSP: ${formatSneakySandyPoleyTeamName(ledger, match, leader.teamId)} +${leader.margin} thru ${leader.thru}`;
}

function buildSneakySandyPoleyMomentumData(match, options = {}) {
  const ledger = options.ledger || buildSneakySandyPoleyLedger(match, options);
  const teams = ledger?.teams || [];
  if (!ledger?.enabled || teams.length !== 2) return [];
  let cumulative = 0;
  return (ledger.sequenceHoleNumbers || []).map(holeNumber => {
    const hole = ledger.holes?.[String(holeNumber)];
    if (!hole?.counted) return null;
    const margin = Number(hole.finalPointsByTeam?.[teams[0].id] || 0) - Number(hole.finalPointsByTeam?.[teams[1].id] || 0);
    cumulative += margin;
    return { holeNumber: Number(holeNumber), margin, cumulative, leaderTeamId: cumulative === 0 ? null : (cumulative > 0 ? teams[0].id : teams[1].id) };
  }).filter(Boolean);
}

function getSneakySandyPoleySmartTrend(match, options = {}) {
  const ledger = options.ledger || buildSneakySandyPoleyLedger(match, options);
  const data = buildSneakySandyPoleyMomentumData(match, { ...options, ledger });
  if (data.length < 2) return '';
  const teamName = id => formatSneakySandyPoleyTeamName(ledger, match, id);
  for (let i = data.length - 1; i > 0; i -= 1) {
    const before = data[i - 1].cumulative;
    const after = data[i].cumulative;
    if (before && after && Math.sign(before) !== Math.sign(after)) return `Trend: ${teamName(data[i].leaderTeamId)} took the lead on Hole ${data[i].holeNumber}`;
  }
  const recent = data.slice(-3);
  const swing = recent.reduce((sum, row) => sum + row.margin, 0);
  if (recent.length === 3 && swing === 0) return 'Trend: Match is tied over the last 3 holes';
  if (recent.length === 3 && Math.abs(swing) >= 2) return `Trend: ${teamName(swing > 0 ? ledger.teams[0].id : ledger.teams[1].id)} gained ${Math.abs(swing)} over the last 3 holes`;
  const biggest = data.slice().sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin) || b.holeNumber - a.holeNumber)[0];
  if (biggest && Math.abs(biggest.margin) >= 2) return `Trend: ${teamName(biggest.margin > 0 ? ledger.teams[0].id : ledger.teams[1].id)} gained ${Math.abs(biggest.margin)} on Hole ${biggest.holeNumber}`;
  return '';
}

function flattenSneakySandyPoleyCategories(holeLedger) {
  return Object.entries(holeLedger?.categoriesByTeam || {}).flatMap(([teamId, rows]) => (rows || []).map(row => ({ ...row, teamId })));
}

function getSneakySandyPoleyEligibleProxPlayers(input, players = []) {
  const rows = input?.players || {};
  return (players || []).filter(player => !!rows[player.playerId]?.greeny);
}

function isSneakySandyPoleyProxEligible(input, playerId) {
  if (!playerId) return false;
  return !!input?.players?.[String(playerId)]?.greeny;
}

const SSP_PROX_TBD_VALUE = '__tbd';

function resolveSneakySandyPoleyProxSelection(input, players = [], options = {}) {
  const eligiblePlayers = getSneakySandyPoleyEligibleProxPlayers(input, players);
  const eligibleIds = eligiblePlayers.map(player => String(player.playerId || '')).filter(Boolean);
  const requested = String(options.requestedProxPlayerId ?? input?.proxPlayerId ?? '');
  const forceTbdOnMultiple = !!options.forceTbdOnMultiple;
  if (!eligibleIds.length) {
    return { proxPlayerId: '', uiValue: '', mode: 'none', eligiblePlayers };
  }
  if (eligibleIds.length === 1) {
    return { proxPlayerId: eligibleIds[0], uiValue: eligibleIds[0], mode: 'auto', eligiblePlayers };
  }
  if (!forceTbdOnMultiple && requested && requested !== SSP_PROX_TBD_VALUE && eligibleIds.includes(requested)) {
    return { proxPlayerId: requested, uiValue: requested, mode: 'selected', eligiblePlayers };
  }
  return { proxPlayerId: '', uiValue: SSP_PROX_TBD_VALUE, mode: 'tbd', eligiblePlayers };
}

function buildSneakySandyPoleyTeamDetailsHtml(match, ledger, holeLedger) {
  const teams = ledger?.teams || [];
  const sections = teams.map(team => {
    const rows = (holeLedger?.categoriesByTeam?.[team.id] || []);
    const details = rows.length
      ? rows.map(item => {
          const category = getSspCategoryLabel(item.category);
          const owner = item.playerId ? (getPlayer(item.playerId)?.name || 'Player') : team.name;
          return `<div class="ssp-ledger-detail"><span>${escapeHtml(owner)}: ${escapeHtml(category)}</span><strong>+${Number(item.points || 0)}</strong></div>`;
        }).join('')
      : '<div class="tiny">No base points.</div>';
    return `<div class="ssp-ledger-team-detail"><div class="ssp-ledger-team-name">${escapeHtml(team.name || formatSneakySandyPoleyTeamName(ledger, match, team.id))}</div>${details}</div>`;
  }).join('');
  return sections || '<div class="tiny">No base points calculated for this hole yet.</div>';
}

function buildSneakySandyPoleyTeamTilesHtml(ledger, pointsByTeam = {}) {
  return (ledger?.teams || []).map(team => `<div class="ssp-ledger-tile"><span>${escapeHtml(team.name)}</span><strong>${Number(pointsByTeam?.[team.id] || 0)}</strong></div>`).join('');
}

function buildSneakySandyPoleyRunningText(match, ledger, holeLedger, options = {}) {
  const running = holeLedger?.runningLeader || ledger?.finalLeader || {};
  const holeNumber = Number(holeLedger?.holeNumber) || '';
  const prefix = options.includesDraft ? `Live SSP After Hole ${holeNumber}` : `SSP After Hole ${holeNumber}`;
  if (!holeLedger?.counted) return `${prefix}: Not scored`;
  if (running.tied) return `${prefix}: Tied`;
  return `${prefix}: ${formatSneakySandyPoleyTeamName(ledger, match, running.teamId)} +${Number(running.margin || 0)}`;
}

function buildSneakySandyPoleyHolePreviewHtml(match, ledger, holeNumber) {
  if (!ledger.enabled) return '<div class="tiny top-gap">SSP ledger unavailable.</div>';
  const holeLedger = ledger.holes?.[String(holeNumber)];
  if (!holeLedger) return '<div class="tiny top-gap">No SSP ledger row for this hole yet.</div>';
  const finalTiles = buildSneakySandyPoleyTeamTilesHtml(ledger, holeLedger.finalPointsByTeam);
  const details = buildSneakySandyPoleyTeamDetailsHtml(match, ledger, holeLedger);
  const multiplierText = holeLedger.bridge?.label || '1x';
  const umbeeText = holeLedger.umbee?.active
    ? `${formatSneakySandyPoleyTeamName(ledger, match, holeLedger.umbee.teamId)} ${holeLedger.umbee.reason}`
    : 'None';
  const warnings = (holeLedger.warnings || []).slice(0, 3).map(item => `<div class="ssp-ledger-warning">${escapeHtml(item)}</div>`).join('');
  return `
    <div class="ssp-ledger-preview top-gap">
      <div class="ssp-ledger-head"><span>Hole Points · Hole ${Number(holeNumber) || ''}</span><span class="tiny">Live preview</span></div>
      <div class="ssp-ledger-mini-row"><span>Points Before Multiplier</span><strong>${escapeHtml(getSneakySandyPoleyTeamDiffText(match, ledger, holeLedger, { beforeMultiplier: true }))}</strong></div>
      <div class="ssp-ledger-tiles">${buildSneakySandyPoleyTeamTilesHtml(ledger, holeLedger.pointsAfterTakeKeepByTeam)}</div>
      <div class="ssp-ledger-detail-list">${details}</div>
      <div class="ssp-ledger-adjustment-line"><span>Multiplier:</span> <strong>${escapeHtml([multiplierText, umbeeText === 'None' ? 'Umbee off' : umbeeText].join(' · '))}</strong></div>
      <div class="ssp-ledger-mini-row"><span>Final Hole Total</span><strong>${escapeHtml(getSneakySandyPoleyTeamDiffText(match, ledger, holeLedger, { final: true }))}</strong></div>
      <div class="ssp-ledger-tiles">${finalTiles}</div>
      <div class="ssp-ledger-match-line">${escapeHtml(buildSneakySandyPoleyRunningText(match, ledger, holeLedger, { includesDraft: !!match.__includesUnsavedDraft }))}</div>
      ${warnings ? `<div class="ssp-ledger-warning-list top-gap">${warnings}</div>` : ''}
    </div>`;
}

function getSneakySandyPoleyPlayerContribution(match, metrics, playerId) {
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  if (!ledger.enabled) return null;
  const categoryCounts = {};
  let points = 0;
  Object.values(ledger.holes || {}).forEach(hole => {
    flattenSneakySandyPoleyCategories(hole).forEach(item => {
      if (String(item.playerId || '') !== String(playerId)) return;
      points += Number(item.points || 0);
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });
  });
  const playerTeamId = String((metrics?.players || []).find(p => String(p.playerId) === String(playerId))?.team || '');
  const teamLeader = ledger.finalLeader || {};
  const teamStatus = playerTeamId ? getSneakySandyPoleyStatus(match, metrics) : '';
  return { points, categoryCounts, teamId: playerTeamId, teamStatus, finalLeader: teamLeader };
}

function getSspCategoryLabel(key = '') {
  return ({
    sneaky: 'Sneaky',
    sandy: 'Sandy',
    poley: 'Poley',
    greeny: 'Greeny',
    prox: 'Prox',
    lowBall: 'Low Ball',
    lowTotal: 'Low Total',
    birdie: 'Birdie',
    eagle: 'Eagle',
    take: 'Take',
    keep: 'Keep',
  })[key] || String(key || 'SSP');
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
function getMatchPlayerIds(match) {
  return Array.isArray(match?.players) ? match.players.map(p => String(p.playerId || '')).filter(Boolean) : [];
}
function getStatTrackingParticipantIds(match) {
  if (!isStatTrackingEnabled(match)) return [];
  const playerIds = getMatchPlayerIds(match);
  if (!playerIds.length) return [];
  if (!Array.isArray(match?.statTrackingPlayerIds)) return playerIds;
  const selected = new Set(match.statTrackingPlayerIds.map(id => String(id || '')).filter(Boolean));
  return playerIds.filter(id => selected.has(id));
}
function isPlayerStatTrackingEnabled(match, playerId) {
  if (!isStatTrackingEnabled(match) || !playerId) return false;
  return getStatTrackingParticipantIds(match).includes(String(playerId));
}
function normalizeStatTrackingParticipants(match) {
  if (!match) return [];
  const playerIds = getMatchPlayerIds(match);
  if (!match.statTrackingEnabled) {
    match.statTrackingPlayerIds = [];
    return match.statTrackingPlayerIds;
  }
  if (!Array.isArray(match.statTrackingPlayerIds)) {
    match.statTrackingPlayerIds = playerIds.slice();
  } else {
    const selected = new Set(match.statTrackingPlayerIds.map(id => String(id || '')).filter(Boolean));
    match.statTrackingPlayerIds = playerIds.filter(id => selected.has(id));
  }
  return match.statTrackingPlayerIds;
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

function getPlayableHoleSequence(match, tee = null, startHole = currentHoleSequenceStart) {
  const count = getPlayableHoleCount(match, tee);
  const base = Array.from({ length: count }, (_, idx) => idx + 1);
  // The app's scoring arrays are indexed by selected-hole position. Only full 18-hole
  // rounds should wrap after Hole 18 for shotgun/back-nine starts. Nine-hole and custom
  // selections finish at the end of their selected sequence.
  if (count !== 18) return base;
  const start = Math.max(1, Math.min(count, Number(startHole) || 1));
  if (start <= 1) return base;
  return base.slice(start - 1).concat(base.slice(0, start - 1));
}

function getAdjacentPlayableHole(match, current = currentHole, direction = 1, tee = null) {
  const sequence = getPlayableHoleSequence(match, tee);
  if (!sequence.length) return null;
  const currentNumber = Math.max(1, Math.min(sequence.length, Number(current) || sequence[0] || 1));
  const idx = sequence.indexOf(currentNumber);
  if (idx < 0) return sequence[0] || null;
  const nextIdx = idx + (direction >= 0 ? 1 : -1);
  return nextIdx >= 0 && nextIdx < sequence.length ? sequence[nextIdx] : null;
}

function isSelectedRoundComplete(match, tee = null) {
  if (!match) return false;
  const count = getPlayableHoleCount(match, tee || getTee(match.courseId, match.teeId));
  const players = Array.isArray(match.players) ? match.players : [];
  return count > 0 && players.length > 0 && Array.from({ length: count }, (_, idx) => idx).every(idx =>
    players.every(player => Number(player?.scores?.[idx]?.gross) > 0)
  );
}

function shouldInferRotatedHoleSequenceStart(match, position, tee = null) {
  const count = getPlayableHoleCount(match, tee || getTee(match?.courseId, match?.teeId));
  const pos = Number(position) || 1;
  if (!match || count !== 18 || pos <= 1 || currentHoleSequenceStart !== 1) return false;
  const players = Array.isArray(match.players) ? match.players : [];
  if (!players.length) return false;
  const anyPriorScores = Array.from({ length: pos - 1 }, (_, idx) => idx).some(idx =>
    players.some(player => Number(player?.scores?.[idx]?.gross) > 0)
  );
  const anyCurrentOrLaterScores = Array.from({ length: count - pos + 1 }, (_, offset) => pos - 1 + offset).some(idx =>
    players.some(player => Number(player?.scores?.[idx]?.gross) > 0)
  );
  return !anyPriorScores && anyCurrentOrLaterScores;
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
function formatToPar(n) {
  const value = Number(n) || 0;
  return value === 0 ? 'E' : formatSigned(value);
}
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
function getMatchCourse(match) {
  const snapshot = match?.courseSnapshot;
  return snapshot && Array.isArray(snapshot.tees) && snapshot.tees.length ? snapshot : getCourse(match?.courseId);
}
function getMatchTee(match, teeId = '') {
  const course = getMatchCourse(match);
  const requestedId = teeId || match?.teeId || '';
  return course?.tees?.find(tee => String(tee.id) === String(requestedId)) || course?.tees?.[0] || null;
}
function getPlayerTee(match, playerRef = null) {
  return getMatchTee(match, getPlayerTeeId(match, playerRef));
}
function getPlayerHole(match, playerRef, holeIdx, fallbackTee = null) {
  const tee = getPlayerTee(match, playerRef) || fallbackTee || getMatchTee(match, match?.teeId);
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
function formatPositiveCurrency(amount, fallback = 1) {
  const value = Number(amount);
  const normalized = Number.isFinite(value) && value >= 0 ? value : Number(fallback) || 0;
  return `$${normalized.toFixed(2)}`;
}
function formatFinalNetSettlementMoney(amount) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value).toFixed(2);
  if (Math.abs(value) < 0.0001) return '$0.00';
  return value < 0 ? `($${abs})` : `+$${abs}`;
}
function getFeaturedGameLabel(match, gameKey) {
  const cfg = (match.selectedGames || []).find(g => g.key === gameKey) || {};
  if (gameKey === 'singles_match') {
    return `${getGameLabel(gameKey)} (${formatBasisLabel(cfg.basis || 'net')} · ${String(cfg.stakeType || 'match') === 'per_hole' ? 'Per-Hole' : 'Match'} Stakes)`;
  }
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
function formatStrokesDisplay(strokes) {
  const n = Number(strokes) || 0;
  return n > 0 ? String(n) : '—';
}
function formatNassauSegmentStatus(match, metrics, diff) {
  const n = Number(diff) || 0;
  if (!Number.isFinite(n) || n === 0) return 'AS';
  const teamNo = n > 0 ? 1 : 2;
  return `${getTeamLabel(match, teamNo) || `Team ${teamNo}`} +${Math.abs(n)}`;
}
function buildNassauOneLineStatus(match, metrics) {
  if (!match || !metrics || !(match.selectedGames || []).some(g => g.key === 'nassau')) return '';
  if ((metrics.teams || []).length !== 2) return '';
  const cfg = (match.selectedGames || []).find(g => g.key === 'nassau') || {};
  const basis = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
  const diffs = computeNassauDiffsForBasis(metrics, basis);
  const holeCount = getPlayableHoleCount(match, metrics.tee);
  const parts = [];
  if (holeCount <= 9) {
    parts.push(`${getHoleSegmentLabel(match, metrics.tee)}: ${formatNassauSegmentStatus(match, metrics, diffs.overall)}`);
  } else {
    parts.push(`Front: ${formatNassauSegmentStatus(match, metrics, diffs.front)}`);
    parts.push(`Back: ${formatNassauSegmentStatus(match, metrics, diffs.back)}`);
    parts.push(`18: ${formatNassauSegmentStatus(match, metrics, diffs.overall)}`);
  }
  return `Nassau: ${parts.join(' · ')}`;
}
function formatCompactTeeName(name = '') {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const withoutCombo = clean
    .replace(/\bcombo\b/ig, '')
    .replace(/\bc\.\s*/ig, '')
    .replace(/\bcourse\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutCombo || clean;
}
function getPlayerHoleTeeInfo(match, playerRef, selectedHoleIdx, fallbackTee = null) {
  const tee = getPlayerTee(match, playerRef) || fallbackTee || getTee(match?.courseId, match?.teeId);
  const hole = getPlayerHole(match, playerRef, selectedHoleIdx, fallbackTee);
  const teeName = getHoleTeeNameForDisplay(match?.courseId, tee, selectedHoleIdx, getMatchCourse(match)) || tee?.teeName || '';
  const yardage = Number(hole?.yardage);
  const compactTeeName = formatCompactTeeName(teeName);
  const yardageLabel = Number.isFinite(yardage) && yardage > 0 ? `${formatYardageValue(yardage)}y` : '—';
  return {
    teeName: compactTeeName,
    yardage: Number.isFinite(yardage) && yardage > 0 ? yardage : null,
    label: compactTeeName
      ? `${compactTeeName} · ${yardageLabel}`
      : ''
  };
}
function getPlayerScorecardYardage(match, playerRef, selectedHoleIdx, fallbackTee = null, fallbackHole = null) {
  const playerTee = getPlayerTee(match, playerRef);
  if (playerTee) {
    const selectedIndexes = getSelectedHoleIndexes(match, playerTee);
    const actualIdx = Number.isFinite(selectedIndexes[selectedHoleIdx]) ? selectedIndexes[selectedHoleIdx] : selectedHoleIdx;
    const yardage = Number(playerTee?.holes?.[actualIdx]?.yardage);
    return Number.isFinite(yardage) && yardage > 0 ? yardage : null;
  }
  const fallbackYardage = Number((getPlayerHole(match, playerRef, selectedHoleIdx, fallbackTee) || fallbackHole)?.yardage);
  return Number.isFinite(fallbackYardage) && fallbackYardage > 0 ? fallbackYardage : null;
}
function formatRoundDuration(totalMs) {
  if (!Number.isFinite(Number(totalMs)) || Number(totalMs) < 0) return '';
  const totalMinutes = Math.max(0, Math.round(Number(totalMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours ? `${hours}h ` : ''}${minutes}m`.trim();
}
function formatRoundClockTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
function ensureRoundTimingStarted(match, timestamp = new Date().toISOString()) {
  if (!match) return false;
  match.roundTiming = match.roundTiming && typeof match.roundTiming === 'object' ? match.roundTiming : { startedAt: null, endedAt: null };
  if (match.roundTiming.startedAt) return false;
  match.roundTiming.startedAt = timestamp;
  return true;
}
function ensureRoundTimingEnded(match, timestamp = new Date().toISOString(), { overwrite = false } = {}) {
  if (!match) return false;
  match.roundTiming = match.roundTiming && typeof match.roundTiming === 'object' ? match.roundTiming : { startedAt: null, endedAt: null };
  if (match.roundTiming.endedAt && !overwrite) return false;
  match.roundTiming.endedAt = timestamp;
  return true;
}
function recordHoleFirstCompletedAt(match, holeNumber, timestamp = new Date().toISOString()) {
  if (!match || !Number(holeNumber)) return false;
  match.holeFirstCompletedAt = match.holeFirstCompletedAt && typeof match.holeFirstCompletedAt === 'object' ? match.holeFirstCompletedAt : {};
  const key = String(Number(holeNumber));
  if (match.holeFirstCompletedAt[key]) return false;
  match.holeFirstCompletedAt[key] = timestamp;
  return true;
}
function getRoundElapsedTimeState(match, metrics = null, nowMs = Date.now()) {
  const start = match?.roundTiming?.startedAt || match?.roundStartedAt || '';
  const isComplete = match?.status === 'complete';
  const end = isComplete ? (match?.roundTiming?.endedAt || match?.completedAt || match?.roundEndedAt || '') : '';
  const startMs = start ? Date.parse(start) : NaN;
  const effectiveEndMs = isComplete ? Date.parse(end) : Number(nowMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(effectiveEndMs) || effectiveEndMs < startMs) return { available: false, valid: false, label: 'Timing unavailable' };
  const elapsedMs = effectiveEndMs - startMs;
  const completion = metrics ? getRoundCompletionState(match, metrics) : null;
  const completedHoleCount = Number(completion?.completedHoleCount || 0);
  const selectedHoleCount = Number(completion?.selectedHoleCount || getRequestedHoleCount(match) || 0);
  const minutes = elapsedMs / 60000;
  const minutesPerCompletedHole = completedHoleCount ? minutes / completedHoleCount : null;
  const valid = elapsedMs > 0
    && !(completedHoleCount >= 9 && minutes < 90)
    && !(completedHoleCount > 0 && minutesPerCompletedHole < 8);
  if (!valid) return { available: false, valid: false, isComplete, elapsedMs, minutes: Math.round(minutes), completedHoleCount, selectedHoleCount, projectionAvailable: false, projectedTotalMs: null, projectedFinishMs: null, label: 'Timing unavailable' };
  const projectionCandidate = !isComplete && completedHoleCount >= 3 && selectedHoleCount > completedHoleCount;
  const candidateTotalMs = projectionCandidate ? elapsedMs / completedHoleCount * selectedHoleCount : null;
  const minimumProjectedMs = selectedHoleCount <= 9
    ? 45 * 60000
    : selectedHoleCount >= 18
      ? 90 * 60000
      : Math.max(45, selectedHoleCount * 5) * 60000;
  const maximumProjectedMs = selectedHoleCount <= 9
    ? 4 * 3600000
    : selectedHoleCount >= 18
      ? 7 * 3600000
      : Math.min(7 * 60, selectedHoleCount * 24) * 60000;
  const projectionAvailable = projectionCandidate
    && elapsedMs >= 30 * 60000
    && candidateTotalMs >= minimumProjectedMs
    && candidateTotalMs <= maximumProjectedMs;
  const projectedTotalMs = projectionAvailable ? candidateTotalMs : null;
  const projectedFinishMs = projectionAvailable ? startMs + projectedTotalMs : null;
  const elapsedLabel = formatRoundDuration(elapsedMs);
  const bits = isComplete
    ? [`Round Time ${elapsedLabel}`, `Started ${formatRoundClockTime(startMs)}`, `Finished ${formatRoundClockTime(effectiveEndMs)}`]
    : [`Elapsed ${elapsedLabel}`];
  if (projectionAvailable) bits.push(`Projected pace ${formatRoundDuration(projectedTotalMs)}`, `Est. finish ${formatRoundClockTime(projectedFinishMs)}`);
  else if (!isComplete && completedHoleCount < 3) bits.push('Pace available after 3 completed holes');
  else if (projectionCandidate) bits.push('Pace projection available after more playing time');
  return { available: true, valid: true, isComplete, elapsedMs, minutes: Math.round(elapsedMs / 60000), completedHoleCount, selectedHoleCount, projectionAvailable, projectedTotalMs, projectedFinishMs, label: bits.filter(Boolean).join(' · ') };
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
  if (match.status === 'complete') lines.push(`Completed ${formatTimestampET(match.completedAt || Date.now())}`);
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
      lines.push(`${getTeamLabel(match, team.team)} (${team.members.map(m => m.player.name).join(', ')}): gross ${team.grossTotal}, net ${team.netTotal}, to par ${formatToPar(team.toPar)}, net diff ${formatToPar(team.netDiff)}, skins ${team.skins}`);
    });
    lines.push('');
  }

  lines.push('Player Totals');
  metrics.players.slice().sort((a, b) => a.netDiff - b.netDiff || a.toPar - b.toPar).forEach(p => {
    lines.push(`${p.player.name} (${getTeamLabel(match, p.team)}): gross ${p.grossTotal || 0}, net ${p.netTotal || 0}, to par ${formatToPar(p.toPar || 0)}, net diff ${formatToPar(p.netDiff || 0)}, skins ${p.skins}`);
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
  const completion = getRoundCompletionState(match, metrics);
  const sortedPlayers = (metrics?.players || []).slice().sort((a, b) => a.leaderboardNetDiff - b.leaderboardNetDiff || a.toPar - b.toPar || a.player.name.localeCompare(b.player.name));
  if (!sortedPlayers.length) return '<div class="export-empty">No player leaderboard available.</div>';
  const showTeamColumn = hasMultiPlayerTeam(metrics);
  const rows = sortedPlayers.map(p => `
    <tr>
      <td>${escapeHtml(p.player.name)}</td>
      ${showTeamColumn ? `<td>${escapeHtml(getTeamLabel(match, p.team))}</td>` : ''}
      <td>${p.grossTotal || 0}</td>
      <td>${p.leaderboardNetTotal || 0}</td>
      <td>${formatToPar(p.leaderboardNetDiff || 0)}</td>
      <td>${p.postableTotal || 0}</td>
    </tr>
  `).join('');
  const teamHead = showTeamColumn ? '<th>Team</th>' : '';
  return `
    ${completion?.isIncomplete ? `<div class="export-section-sub">Through ${completion.completedHoleCount} of ${completion.selectedHoleCount} holes.</div>` : ''}
    <div class="fit-stage" data-fit="width" data-fit-min="0.84">
      <div class="fit-box">
        <table class="export-table">
          <thead>
            <tr><th>Player</th>${teamHead}<th>Gross</th><th>Net</th><th>Net to Par</th><th>Postable</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildExportTeamLeaderboard(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  if (!hasMultiPlayerTeam(metrics)) return '';
  const sortedTeams = (metrics?.teams || []).slice().sort((a, b) => (a.netTotal - b.netTotal) || (a.grossTotal - b.grossTotal) || (a.team - b.team));
  if (!sortedTeams.length) return '<div class="export-empty">No team leaderboard available.</div>';
  const showH2h = showTeamMatchMetric(match, metrics);
  const rows = sortedTeams.map(t => `
    <tr>
      <td>${escapeHtml(getTeamLabel(match, t.team))}</td>
      <td>${escapeHtml(t.members.map(m => m.player.name).join(', '))}</td>
      <td>${t.grossTotal || 0}</td>
      <td>${t.netTotal || 0}</td>
      <td>${formatToPar(t.toPar || 0)}</td>
      <td>${formatToPar(t.netDiff || 0)}</td>
      <td>${showH2h ? formatSigned(t.overall || 0) : '—'}</td>
    </tr>
  `).join('');
  return `
    ${completion?.isIncomplete ? `<div class="export-section-sub">Through ${completion.completedHoleCount} of ${completion.selectedHoleCount} holes.</div>` : ''}
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
  if (!hasTeamMomentumMatch(match, metrics)) return '';
  const options = getMomentumOptions(match, metrics);
  const selectedGame = getDefaultMomentumGameKey(match, metrics);
  if (!selectedGame || !options.length) return '';
  const perspectiveTeam = getMomentumPerspectiveTeam(match);
  let running = 0;
  const completion = getRoundCompletionState(match, metrics);
  const allResults = getMomentumHoleResults(match, metrics, selectedGame);
  const renderedResults = completion.isIncomplete
    ? allResults.filter(h => computeMomentumOutcome(match, metrics, h, selectedGame) !== 'pending')
    : allResults;
  const pills = renderedResults.map(h => {
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
    const txt = outcome === 'pending' ? 'Not played' : formatPerspectiveStatus(running, perspectiveTeam);
    return `<div class="export-pill ${cls}">H${h.holeNumber}<span>${escapeHtml(txt)}</span></div>`;
  }).join('');
  const unplayed = completion.isIncomplete
    ? allResults.filter(h => computeMomentumOutcome(match, metrics, h, selectedGame) === 'pending').map(h => Number(h.holeNumber)).filter(Number.isFinite)
    : [];
  const unplayedLabel = unplayed.length
    ? `${unplayed.length === 1 ? `H${unplayed[0]}` : `H${unplayed[0]}–H${unplayed[unplayed.length - 1]}`}`
    : '';
  return `
    <section class="export-section export-section-momentum">
      <div class="export-section-head">
        <h2>Hole-by-hole momentum</h2>
        <div class="export-section-sub">${describeMomentumMeta(match, metrics, selectedGame)}</div>
      </div>
      <div class="export-pill-grid">${pills || '<div class="export-empty">No completed momentum holes yet.</div>'}</div>
      ${unplayedLabel ? `<div class="export-momentum-pending"><strong>Not played:</strong> ${escapeHtml(unplayedLabel)}</div>` : ''}
    </section>`;
}


function getStoredRoundRecap(match) {
  return String(match?.roundRecapFinal || match?.roundRecapGenerated || match?.roundRecap || '').trim();
}
function getDraftRoundRecap(match) {
  return String(match?.roundRecapGenerated || match?.roundRecap || '').trim();
}
function getFinalRoundRecap(match) {
  return String(match?.roundRecapFinal || '').trim();
}

function splitRoundRecapParagraphs(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const paragraphs = raw.split(/\n\s*\n+/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  const sentences = raw.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) || [raw];
  if (sentences.length < 6) return [raw.replace(/\s+/g, ' ').trim()];
  const per = Math.ceil(sentences.length / 3);
  return [
    sentences.slice(0, per).join(' '),
    sentences.slice(per, per * 2).join(' '),
    sentences.slice(per * 2).join(' '),
  ].map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function formatRoundRecapHtml(text) {
  const paragraphs = splitRoundRecapParagraphs(text);
  if (!paragraphs.length) return '';
  return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
}
function buildRoundRecapExport(match, metrics = null) {
  const recap = getStoredRoundRecap(match);
  if (!recap) return '';
  const completion = metrics ? getRoundCompletionState(match, metrics) : null;
  const incompleteNote = completion?.isIncomplete
    ? `<div class="export-provisional-label">${areAllGamesFinal(match, metrics) ? 'Clinched Early — recap reflects completed holes.' : 'Incomplete Round — recap should be read as provisional.'}</div>`
    : '';
  return `
    <section class="export-section export-section-round-recap">
      <div class="export-section-head">
        <h2>AI Round Recap</h2>
        <div class="export-section-sub">Story-driven recap centered on the Featured Competition, round notes, memories, scores, games, and stats.</div>
      </div>
      ${incompleteNote}
      <div class="export-round-recap-text">${formatRoundRecapHtml(recap)}</div>
    </section>`;
}

function getPlayerGrossScoreForHole(match, metrics, playerId, holeNumber, selectedHoleIdx = null) {
  const holeNum = Number(holeNumber);
  const selectedIdx = Number(selectedHoleIdx);
  const metricHoleResult = Array.isArray(metrics?.holeResults) && Number.isInteger(selectedIdx)
    ? metrics.holeResults[selectedIdx]
    : null;
  const metricScore = metricHoleResult?.playerScores?.find(ps => String(ps.playerId) === String(playerId));
  if (metricScore && metricScore.gross !== null && metricScore.gross !== undefined && metricScore.gross !== '') {
    const gross = Number(metricScore.gross);
    return Number.isFinite(gross) && gross > 0 ? gross : null;
  }
  const matchPlayer = (match?.players || []).find(mp => String(mp.playerId) === String(playerId));
  if (!matchPlayer || !Array.isArray(matchPlayer.scores)) return null;
  const byHoleNumber = matchPlayer.scores.find(score => Number(score?.holeNumber) === holeNum);
  const scoreObj = byHoleNumber || matchPlayer.scores[Math.max(0, holeNum - 1)] || (Number.isInteger(selectedIdx) ? matchPlayer.scores[selectedIdx] : null);
  const gross = Number(scoreObj?.gross);
  return Number.isFinite(gross) && gross > 0 ? gross : null;
}
function getMissingScoreEntries(match, metrics) {
  const holes = metrics?.tee ? getSelectedScoringHoles(match, metrics.tee) : [];
  const players = Array.isArray(metrics?.players) ? metrics.players : [];
  const missing = [];
  holes.forEach((hole, holeIdx) => {
    const holeNumber = Number(hole?.holeNumber || holeIdx + 1);
    players.forEach(pm => {
      const gross = getPlayerGrossScoreForHole(match, metrics, pm.playerId, holeNumber, holeIdx);
      if (!Number.isFinite(Number(gross)) || Number(gross) <= 0) {
        missing.push({
          playerId: pm.playerId,
          playerName: pm.player?.name || 'Player',
          holeNumber,
          type: 'gross score'
        });
      }
    });
  });
  return missing;
}

function isHoleComplete(holeNumberOrResult, activePlayers = [], scoresOrMetrics = null) {
  const holeResult = holeNumberOrResult && typeof holeNumberOrResult === 'object' ? holeNumberOrResult : null;
  const players = Array.isArray(activePlayers) ? activePlayers : [];
  if (holeResult) {
    const playerScores = Array.isArray(holeResult.playerScores) ? holeResult.playerScores : [];
    const required = players.length ? players : playerScores;
    return required.length > 0 && required.every(p => {
      const playerId = p.playerId || p.id;
      const scoreObj = playerScores.find(ps => String(ps.playerId) === String(playerId));
      const gross = Number(scoreObj?.gross);
      return Number.isFinite(gross) && gross > 0;
    });
  }
  const holeNumber = Number(holeNumberOrResult);
  const metrics = scoresOrMetrics;
  const result = (metrics?.holeResults || []).find(h => Number(h?.holeNumber) === holeNumber);
  return result ? isHoleComplete(result, activePlayers, metrics) : false;
}
function getRoundCompletionState(match, metrics) {
  const tee = metrics?.tee || getTee(match?.courseId, match?.teeId);
  const holes = tee ? getSelectedScoringHoles(match, tee) : [];
  const holeResults = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  const players = Array.isArray(metrics?.players) ? metrics.players : (Array.isArray(match?.players) ? match.players : []);
  const completedHoles = [];
  const missingHoles = [];
  holes.forEach((hole, idx) => {
    const result = holeResults[idx];
    const holeNumber = Number(hole?.holeNumber || result?.holeNumber || idx + 1);
    if (result && isHoleComplete(result, players, metrics)) completedHoles.push(holeNumber);
    else missingHoles.push(holeNumber);
  });
  const selectedHoleCount = holes.length || Number(metrics?.holeCount) || getPlayableHoleCount(match, tee);
  const completedHoleCount = completedHoles.length;
  const incompleteHoleCount = Math.max(0, selectedHoleCount - completedHoleCount);
  const remainingHoleNumbers = missingHoles.slice();
  const selectedHoleNumbers = holes.map((hole, idx) => Number(hole?.holeNumber || idx + 1));
  const expectedPrefix = selectedHoleNumbers.slice(0, completedHoleCount);
  const isSequential = completedHoles.length === expectedPrefix.length && completedHoles.every((holeNumber, idx) => holeNumber === expectedPrefix[idx]);
  return {
    selectedHoleCount,
    completedHoleCount,
    incompleteHoleCount,
    completedHoles,
    missingHoles,
    remainingHoleNumbers,
    isSequential,
    completedHolesLabel: completedHoles.join(', '),
    completionPct: selectedHoleCount ? Math.round((completedHoleCount / selectedHoleCount) * 100) : 0,
    isComplete: selectedHoleCount > 0 && completedHoleCount >= selectedHoleCount,
    isIncomplete: selectedHoleCount > 0 && completedHoleCount < selectedHoleCount,
    label: `${completedHoleCount} of ${selectedHoleCount} holes completed`,
    throughLabel: `through ${completedHoleCount} completed hole${completedHoleCount === 1 ? '' : 's'}`
  };
}
function isHoleRangeComplete(match, metrics, startIdx, endIdx) {
  const holeResults = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  const players = Array.isArray(metrics?.players) ? metrics.players : [];
  const slice = holeResults.slice(startIdx, endIdx);
  return slice.length === Math.max(0, endIdx - startIdx) && slice.every(h => isHoleComplete(h, players, metrics));
}
function getCompletedHoleCountInRange(match, metrics, startIdx, endIdx) {
  const players = Array.isArray(metrics?.players) ? metrics.players : [];
  return (metrics?.holeResults || []).slice(startIdx, endIdx).filter(h => isHoleComplete(h, players, metrics)).length;
}
function formatIncompleteScopeSuffix(completion) {
  return completion?.isIncomplete ? ` ${completion.throughLabel}` : '';
}
function formatProvisionalSuffix(completion) {
  return completion?.isIncomplete ? ' — provisional' : '';
}
function getMatchClinchState({ margin, holesRemaining } = {}) {
  const m = Math.abs(Number(margin) || 0);
  const r = Math.max(0, Number(holesRemaining) || 0);
  const isClinched = m > 0 && m > r;
  return {
    isClinched,
    margin: m,
    holesRemaining: r,
    resultText: isClinched ? `Won ${m} & ${r}` : (m ? `Leads ${m} up · ${r} hole${r === 1 ? '' : 's'} remain` : `All square · ${r} hole${r === 1 ? '' : 's'} remain`)
  };
}
function isMatchResultClinched(diff, remainingHoles) {
  return getMatchClinchState({ margin: diff, holesRemaining: remainingHoles }).isClinched;
}
function formatTeamGameStatusScoped(match, metrics, diff, completion, { holesRemaining = null, scopeLabel = '', forceProvisional = false } = {}) {
  if (!completion?.isIncomplete && holesRemaining == null) return formatTeamGameStatus(match, metrics, diff);
  if (!metrics || metrics.teams?.length !== 2) return '—';
  const margin = Math.abs(Number(diff) || 0);
  const remaining = holesRemaining == null ? Number(completion?.incompleteHoleCount || 0) : Math.max(0, Number(holesRemaining) || 0);
  const teamLabel = diff > 0 ? describeTeamLabel(match, 1, metrics) : diff < 0 ? describeTeamLabel(match, 2, metrics) : '';
  const clinch = getMatchClinchState({ margin, holesRemaining: remaining });
  const suffix = scopeLabel || completion?.throughLabel || '';
  if (!margin) return `AS${suffix ? ` ${suffix}` : ''}${remaining ? ' — provisional' : ''}`;
  if (clinch.isClinched && !forceProvisional) return `${teamLabel} won ${margin} & ${remaining}`;
  return `${teamLabel} lead ${margin} up${suffix ? ` ${suffix}` : ''} — provisional`;
}
function getRoundEndReasonLabel(reason) {
  const map = {
    completed: 'Completed normally',
    darkness: 'darkness',
    weather: 'weather',
    injury: 'injury',
    conceded: 'concession',
    endedEarly: 'the group ending early',
    time: 'time constraints',
    other: 'early'
  };
  return map[String(reason || '').trim()] || '';
}
function buildRoundEndReasonSentence(match) {
  const reason = String(match?.roundEndReason || '').trim();
  if (!reason || reason === 'completed') return '';
  if (reason === 'conceded') return 'Match was conceded before all holes were completed.';
  if (reason === 'other' || reason === 'endedEarly') return 'Round ended early.';
  const label = getRoundEndReasonLabel(reason);
  return label ? `Round ended due to ${label}.` : '';
}
function getGameClinchStates(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  const selected = Array.isArray(match?.selectedGames) ? match.selectedGames : [];
  const states = [];
  selected.forEach(cfg => {
    const key = cfg.key;
    try {
      if ((key === 'nassau' || key === 'team_match') && metrics?.teams?.length === 2) {
        const diffs = key === 'nassau' ? computeNassauDiffsForBasis(metrics, String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net') : computeTeamGameDiffs(match, metrics, key);
        const frontCompleted = getCompletedHoleCountInRange(match, metrics, 0, Math.min(9, metrics?.holeResults?.length || 0));
        const backCompleted = getCompletedHoleCountInRange(match, metrics, 9, metrics?.holeResults?.length || 0);
        const frontRemaining = Math.max(0, Math.min(9, getPlayableHoleCount(match, metrics?.tee)) - frontCompleted);
        const backSpan = Math.max(0, getPlayableHoleCount(match, metrics?.tee) - 9);
        const backRemaining = Math.max(0, backSpan - backCompleted);
        states.push({ key, segment: 'front', diff: diffs.front, ...getMatchClinchState({ margin: diffs.front, holesRemaining: frontRemaining }) });
        if (backSpan) states.push({ key, segment: 'back', diff: diffs.back, ...getMatchClinchState({ margin: diffs.back, holesRemaining: backRemaining }) });
        states.push({ key, segment: 'overall', diff: diffs.overall, ...getMatchClinchState({ margin: diffs.overall, holesRemaining: completion.incompleteHoleCount }) });
      } else if (key === 'singles_match') {
        const singles = computeSinglesMatchPlayResult(match, metrics, cfg);
        states.push({ key, segment: 'overall', isClinched: singles.isClinched || singles.isComplete || singles.stakeType === 'per_hole', holesRemaining: singles.holesRemaining, resultText: singles.resultText });
      } else if (completion.isComplete) {
        states.push({ key, segment: 'overall', isClinched: true, holesRemaining: 0, resultText: 'Complete' });
      } else {
        states.push({ key, segment: 'overall', isClinched: false, holesRemaining: completion.incompleteHoleCount, resultText: 'Provisional' });
      }
    } catch (_) {
      states.push({ key, segment: 'overall', isClinched: false, holesRemaining: completion.incompleteHoleCount, resultText: 'Unavailable' });
    }
  });
  return states;
}
function areAllGamesFinal(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  if (completion.isComplete) return true;
  const states = getGameClinchStates(match, metrics);
  if (!states.length) return false;
  const selectedKeys = new Set((match?.selectedGames || []).map(g => g.key));
  if ([...selectedKeys].some(key => ['skins','net_skins','greenies','nine_point','team_stroke','individual_match'].includes(key))) return false;
  if (selectedKeys.has('singles_match')) {
    const cfg = (match?.selectedGames || []).find(g => g.key === 'singles_match');
    const singles = computeSinglesMatchPlayResult(match, metrics, cfg);
    if (!singles.isComplete && !singles.isClinched && singles.stakeType !== 'per_hole') return false;
  }
  return states.every(s => s.isClinched || Number(s.holesRemaining || 0) === 0);
}
function buildIncompleteRoundNotice(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  if (!completion.isIncomplete) return '';
  const reasonSentence = buildRoundEndReasonSentence(match);
  const finality = areAllGamesFinal(match, metrics)
    ? 'All selected game outcomes are mathematically determined despite the unplayed holes.'
    : 'Some game outcomes may still change if the remaining holes are played.';
  return `
    <div class="export-provisional-detail">
      <strong>Incomplete Round — Provisional</strong><br>
      ${escapeHtml(completion.label)}.<br>
      ${reasonSentence ? `${escapeHtml(reasonSentence)}<br>` : ''}
      Only completed holes are included. Unplayed holes are not estimated.<br>
      ${escapeHtml(finality)}
    </div>`;
}

function buildMissingScoreWarning(match, metrics, { exportMode = false } = {}) {
  const missing = getMissingScoreEntries(match, metrics);
  const count = missing.length;
  const complete = count === 0;
  const title = complete ? 'Round Complete — no missing scores' : `Round Incomplete — ${count} score${count === 1 ? '' : 's'} missing`;
  const items = missing.slice(0, 12).map(row => `<li>${escapeHtml(row.playerName)} — Hole ${escapeHtml(row.holeNumber)} (${escapeHtml(row.type)})</li>`).join('');
  const more = missing.length > 12 ? `<li>+${missing.length - 12} more missing score${missing.length - 12 === 1 ? '' : 's'}</li>` : '';
  if (exportMode) {
    if (complete) return '';
    return buildIncompleteRoundNotice(match, metrics) || `
      <div class="export-provisional-label">
        Provisional Report — Incomplete Round
      </div>`;
  }
  return `
    <details class="incomplete-round-warning ${complete ? 'round-complete-warning' : ''}">
      <summary class="missing-score-summary"><span>${escapeHtml(title)}</span></summary>
      ${complete
        ? '<div class="tiny top-gap">All selected players have gross scores for all selected holes.</div>'
        : `<div class="tiny top-gap">Totals and reports may be provisional until every player has a gross score for every selected hole.</div>
           <ul class="tight-list top-gap">${items}${more}</ul>
           <div class="actions wrap compact-actions top-gap"><button type="button" class="secondary" data-jump-missing-score>Jump to Missing Scores</button><button type="button" class="secondary" data-continue-incomplete-report>Continue Anyway</button></div>`}
    </details>`;
}
function formatAwardWinners(names, value) {
  const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
  if (!list.length) return '';
  return `${escapeHtml(list.join(', '))}${value != null && value !== '' ? ` — ${escapeHtml(value)}` : ''}`;
}
function getLowRows(rows, key) {
  const vals = (rows || []).map(r => Number(r?.[key])).filter(Number.isFinite);
  if (!vals.length) return { value: null, rows: [] };
  const value = Math.min(...vals);
  return { value, rows: rows.filter(r => Number(r?.[key]) === value) };
}
function getHighRows(rows, key) {
  const vals = (rows || []).map(r => Number(r?.[key])).filter(Number.isFinite);
  if (!vals.length) return { value: null, rows: [] };
  const value = Math.max(...vals);
  return { value, rows: rows.filter(r => Number(r?.[key]) === value) };
}
function buildRoundStatusSummary(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  const selectedHoleCount = Number(completion.selectedHoleCount || getPlayableHoleCount(match, metrics?.tee) || 0);
  const completedHoleCount = Number(completion.completedHoleCount || metrics?.completed || 0);
  const scopeText = `${completedHoleCount} of ${selectedHoleCount} holes completed`;
  if (!completion.isIncomplete) {
    return {
      badge: 'Complete Round',
      tone: 'complete',
      headline: 'Final results',
      detail: 'All selected holes were completed.'
    };
  }
  const allFinal = areAllGamesFinal(match, metrics);
  const reasonSentence = buildRoundEndReasonSentence(match);
  if (allFinal) {
    return {
      badge: 'Clinched Early',
      tone: 'clinched',
      headline: `Match clinched early — final after ${completedHoleCount} completed holes`,
      detail: `${reasonSentence ? `${reasonSentence} ` : ''}Result is final based on completed holes; remaining holes were not required to determine the selected game outcomes.`.trim()
    };
  }
  return {
    badge: 'Incomplete Round — Provisional',
    tone: 'provisional',
    headline: `Round incomplete — ${scopeText}`,
    detail: `${reasonSentence ? `${reasonSentence} ` : ''}Remaining holes were not completed. Settlement is provisional unless a selected game was already decided.`.trim()
  };
}
function computePlayerFrontBack(match, metrics, playerMetric) {
  const holes = getSelectedScoringHoles(match, metrics?.tee);
  const frontCount = Math.min(9, holes.length);
  const scores = Array.isArray(playerMetric?.scores) ? playerMetric.scores : [];
  const grossAt = (idx) => {
    const v = Number(scores[idx]?.gross);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const completeRange = (start, end) => Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i).every(idx => grossAt(idx) != null);
  const sumRange = (start, end) => Array.from({ length: Math.max(0, end - start) }, (_, i) => grossAt(start + i)).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return {
    front: completeRange(0, frontCount) ? sumRange(0, frontCount) : null,
    back: holes.length > 9 ? (completeRange(9, holes.length) ? sumRange(9, holes.length) : null) : null
  };
}
function getPartialNineLeaderRows(match, metrics, startIdx, endIdx) {
  const holeResults = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  const players = Array.isArray(metrics?.players) ? metrics.players : [];
  const completedIndexes = [];
  for (let idx = startIdx; idx < endIdx; idx += 1) {
    const h = holeResults[idx];
    if (h && isHoleComplete(h, players, metrics)) completedIndexes.push(idx);
  }
  if (!completedIndexes.length) return { completedCount: 0, span: Math.max(0, endIdx - startIdx), leaders: [], value: null };
  const totals = players.map(p => {
    const total = completedIndexes.reduce((sum, idx) => {
      const scoreObj = holeResults[idx]?.playerScores?.find(ps => String(ps.playerId) === String(p.playerId));
      return sum + (Number(scoreObj?.gross) || 0);
    }, 0);
    return { name: p.player?.name || 'Player', value: total };
  });
  const low = getLowRows(totals, 'value');
  return { completedCount: completedIndexes.length, span: Math.max(0, endIdx - startIdx), leaders: low.rows, value: low.value };
}
function buildRoundAwardsRows(match, metrics) {
  if (!metrics) return [];
  const completion = getRoundCompletionState(match, metrics);
  if (completion.completedHoleCount < 6) return [];
  const players = metrics.players || [];
  const dist = computeScoreDistributionSummary(match, metrics);
  const stats = computeStatTrackingSummary(match, metrics);
  const awards = [];
  const lowGross = getLowRows(players, 'grossTotal');
  const lowNet = getLowRows(players, 'leaderboardNetTotal');
  if (lowGross.rows.length) awards.push([completion.isIncomplete ? 'Low Gross Leader' : 'Low Gross', `${formatAwardWinners(lowGross.rows.map(r => r.player?.name), lowGross.value)}${formatIncompleteScopeSuffix(completion)}`]);
  if (lowNet.rows.length) awards.push([completion.isIncomplete ? 'Low Net Leader' : 'Low Net', `${formatAwardWinners(lowNet.rows.map(r => r.player?.name), lowNet.value)}${formatIncompleteScopeSuffix(completion)}`]);
  const frontRows = players.map(p => ({ ...p, fb: computePlayerFrontBack(match, metrics, p) }));
  const frontSpan = Math.min(9, metrics.holeResults?.length || 0);
  const frontComplete = isHoleRangeComplete(match, metrics, 0, frontSpan);
  if (frontComplete) {
    const bestFront = getLowRows(frontRows.map(p => ({ name: p.player?.name, value: p.fb.front })).filter(r => r.value != null), 'value');
    if (bestFront.rows.length) awards.push(['Best Front Nine', formatAwardWinners(bestFront.rows.map(r => r.name), bestFront.value)]);
  } else if (completion.isIncomplete && getCompletedHoleCountInRange(match, metrics, 0, frontSpan) >= 7) {
    const partial = getPartialNineLeaderRows(match, metrics, 0, frontSpan);
    if (partial.leaders.length) awards.push(['Front Nine Leader', `${formatAwardWinners(partial.leaders.map(r => r.name), partial.value)} through ${partial.completedCount} of ${partial.span} holes — provisional`]);
  }
  const backExists = (metrics.holeResults || []).length > 9;
  const backComplete = backExists && isHoleRangeComplete(match, metrics, 9, metrics.holeResults.length);
  if (backComplete) {
    const backCandidates = frontRows.filter(p => p.fb.back != null).map(p => ({ name: p.player?.name, value: p.fb.back }));
    const bestBack = getLowRows(backCandidates, 'value');
    if (bestBack.rows.length) awards.push(['Best Back Nine', formatAwardWinners(bestBack.rows.map(r => r.name), bestBack.value)]);
  } else if (backExists && completion.isIncomplete && getCompletedHoleCountInRange(match, metrics, 9, metrics.holeResults.length) >= 7) {
    const partial = getPartialNineLeaderRows(match, metrics, 9, metrics.holeResults.length);
    if (partial.leaders.length) awards.push(['Back Nine Leader', `${formatAwardWinners(partial.leaders.map(r => r.name), partial.value)} through ${partial.completedCount} of ${partial.span} holes — provisional`]);
  }
  const birdies = getHighRows(dist.map(r => ({ name: r.playerMetric?.player?.name, value: Number(r.totals?.birdie || 0) })), 'value');
  if (birdies.rows.length && birdies.value > 0) awards.push(['Most Birdies', `${formatAwardWinners(birdies.rows.map(r => r.name), birdies.value)}${formatIncompleteScopeSuffix(completion)}`]);
  const pars = getHighRows(dist.map(r => ({ name: r.playerMetric?.player?.name, value: Number(r.totals?.par || 0) })), 'value');
  if (pars.rows.length && pars.value > 0) awards.push(['Most Pars', `${formatAwardWinners(pars.rows.map(r => r.name), pars.value)}${formatIncompleteScopeSuffix(completion)}`]);
  const updowns = getHighRows(stats.map(r => ({ name: r.playerMetric?.player?.name, value: Number(r.totals?.upAndDowns || 0) })), 'value');
  if (updowns.rows.length && updowns.value > 0) awards.push(['Most Up & Downs', `${formatAwardWinners(updowns.rows.map(r => r.name), updowns.value)}${formatIncompleteScopeSuffix(completion)}`]);
  const putts = getLowRows(stats.map(r => ({ name: r.playerMetric?.player?.name, value: Number(r.totals?.putts || 0) })).filter(r => r.value > 0), 'value');
  if (putts.rows.length) awards.push(['Fewest Putts', `${formatAwardWinners(putts.rows.map(r => r.name), putts.value)}${formatIncompleteScopeSuffix(completion)}`]);
  return awards;
}
function buildExecutiveDriverRows(match, metrics, ctx = getPayoutReportContext(match, metrics)) {
  const completion = getRoundCompletionState(match, metrics);
  const selected = getOrderedSelectedGames(match);
  const payoutGames = ctx.payoutGames || [];
  const rows = selected.map(cfg => {
    const game = payoutGames.find(row => row.key === cfg.key || row.sourceKey === cfg.key || (cfg.key === 'nassau' && String(row.key || '').startsWith('nassau_')));
    const amounts = Object.entries(game?.amounts || {}).map(([id, amount]) => ({ name: getPlayer(id)?.name || id, amount: Number(amount || 0) }));
    const winners = amounts.filter(row => row.amount > 0.0001).sort((a, b) => b.amount - a.amount);
    let result = 'Pending more completed holes';
    let stakes = '';
    if (cfg.key === 'sneaky_sandy_poley') {
      const ledger = buildSneakySandyPoleyLedger(match, { metrics });
      const leader = ledger?.finalLeader || {};
      result = !Number(leader.thru) ? 'Selected · momentum pending' : leader.tied ? `Tied through ${leader.thru} SSP holes` : `${formatSneakySandyPoleyTeamName(ledger, match, leader.teamId)} +${Number(leader.margin || 0)} points`;
      stakes = `${formatPositiveCurrency(Number(ledger?.settings?.pointValue || cfg.pointValue || 0), 2)}/point`;
    } else if (cfg.key === 'nassau' || cfg.key === 'team_match') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      result = completion.isIncomplete ? formatTeamGameStatusScoped(match, metrics, diffs.overall, completion) : formatTeamGameStatus(match, metrics, diffs.overall);
      if (cfg.key === 'nassau') stakes = [cfg.stakesFront, cfg.stakesBack, cfg.stakesOverall].some(Number) ? `${formatMoneyAccounting(Number(cfg.stakesFront || 0))} front · ${formatMoneyAccounting(Number(cfg.stakesBack || 0))} back · ${formatMoneyAccounting(Number(cfg.stakesOverall || 0))} overall` : 'No wager configured';
    } else if (game?.label) {
      result = winners.length ? winners.map(row => `${row.name} ${formatMoneyAccounting(row.amount)}`).join(' · ') : 'No current payout';
    }
    const impact = winners.length ? winners.map(row => `${row.name} +${formatMoneyAccounting(row.amount)}`).join(' · ') : 'No current payout';
    return { key: cfg.key, label: getFeaturedGameLabel(match, cfg.key), result, stakes, impact };
  });
  return rows.slice(0, 5);
}

const ROUND_RECORD_SCHEMA_VERSION = 1;
function getRoundRecordPlayerId(match, playerMetric, index) {
  return String(playerMetric?.playerId || playerMetric?.player?.id || match?.players?.[index]?.playerId || `round:${match?.id || 'legacy'}:player:${index + 1}`);
}
function buildRoundRecordEvents(match, metrics) {
  const events = [];
  const push = event => events.push({ salience: 1, ...event, sourceRef: event.sourceRef || event.auditRef || '' });
  if (isSneakySandyPoleyEnabled(match)) {
    const ledger = buildSneakySandyPoleyLedger(match, { metrics });
    const teams = ledger?.teams || [];
    const momentum = buildSneakySandyPoleyMomentumData(match, { ledger });
    momentum.forEach((row, index) => {
      const hole = ledger?.holes?.[String(row.holeNumber)] || {};
      const winnerTeam = row.margin > 0 ? teams[0] : row.margin < 0 ? teams[1] : null;
      const before = index ? momentum[index - 1].cumulative : 0;
      const bridgeLabel = String(hole?.bridge?.label || '');
      const multiplier = Number(hole?.bridge?.multiplier || bridgeLabel.match(/(\d+)x/i)?.[1] || 1);
      const auditRef = `ssp-hole-${row.holeNumber}`;
      if (row.margin) push({ type: 'swing', gameId: 'sneaky_sandy_poley', holeNumber: row.holeNumber, teamId: winnerTeam?.id || null, magnitude: Math.abs(row.margin), unit: 'points', description: `${Math.abs(row.margin)}-point swing to ${winnerTeam?.name || 'the leading team'}`, auditRef, salience: 50 + Math.abs(row.margin) });
      if (multiplier > 1) push({ type: 'multiplier', gameId: 'sneaky_sandy_poley', holeNumber: row.holeNumber, teamId: winnerTeam?.id || null, magnitude: multiplier, unit: 'multiplier', description: `${bridgeLabel || `${multiplier}x`} multiplier`, auditRef, salience: 70 + multiplier });
      if (before && row.cumulative && Math.sign(before) !== Math.sign(row.cumulative)) push({ type: 'lead_change', gameId: 'sneaky_sandy_poley', holeNumber: row.holeNumber, teamId: row.leaderTeamId, magnitude: Math.abs(row.margin), unit: 'points', description: `${winnerTeam?.name || 'The match leader'} flipped the SSP lead`, auditRef, salience: 100 + Math.abs(row.margin) });
    });
    const final = momentum[momentum.length - 1];
    if (final) push({ type: 'final_margin', gameId: 'sneaky_sandy_poley', holeNumber: final.holeNumber, teamId: final.leaderTeamId, magnitude: Math.abs(final.cumulative), unit: 'points', description: final.cumulative ? `${final.cumulative > 0 ? teams[0]?.name : teams[1]?.name} ${Math.abs(final.cumulative)} points ahead` : 'SSP finished tied', auditRef: 'ssp-summary', salience: 25 });
  }
  (metrics?.holeResults || []).forEach(hole => {
    if (!hole?.completed) return;
    (hole.playerScores || []).forEach(score => {
      const gross = Number(score?.gross);
      const par = Number(hole?.par);
      if (!Number.isFinite(gross) || !Number.isFinite(par)) return;
      if (gross <= par - 1) push({ type: 'signature_score', gameId: null, holeNumber: Number(hole.holeNumber), playerId: String(score.playerId), magnitude: par - gross, unit: 'strokes', description: gross <= par - 2 ? 'Eagle or better' : 'Birdie', auditRef: `scorecard-hole-${hole.holeNumber}`, salience: gross <= par - 2 ? 65 : 35 });
      if (gross >= par + 4) push({ type: 'blowup', gameId: null, holeNumber: Number(hole.holeNumber), playerId: String(score.playerId), magnitude: gross - par, unit: 'strokes', description: `${gross - par} over par`, auditRef: `scorecard-hole-${hole.holeNumber}`, salience: 20 + gross - par });
    });
  });
  const ctx = getPayoutReportContext(match, metrics);
  (ctx.payoutGames || []).forEach(game => {
    const rows = Object.entries(game.amounts || {}).map(([playerId, amount]) => ({ playerId, amount: Number(amount || 0) })).filter(row => row.amount > 0.0001).sort((a, b) => b.amount - a.amount);
    if (rows[0]) push({ type: 'payout_driver', gameId: game.sourceKey || game.key, playerId: rows[0].playerId, magnitude: rows[0].amount, unit: 'dollars', description: `${game.label || getGameLabel(game.key)} moved ${formatMoneyAccounting(rows[0].amount)} to ${getPlayer(rows[0].playerId)?.name || rows[0].playerId}`, auditRef: `game-${game.sourceKey || game.key}`, salience: 40 + Math.min(50, rows[0].amount) });
  });
  return events.sort((a, b) => Number(b.salience || 0) - Number(a.salience || 0) || Number(a.holeNumber || 999) - Number(b.holeNumber || 999));
}
function buildPlayerSignatureStat(playerMetric, events, completion) {
  const playerId = String(playerMetric?.playerId || '');
  const signature = events.find(event => String(event.playerId || '') === playerId && event.type === 'signature_score');
  if (signature) return `${signature.description} on H${signature.holeNumber}`;
  const scores = (playerMetric?.scores || []).filter(score => Number(score?.gross) > 0);
  const pars = scores.filter((score, index) => Number(score.gross) === Number(playerMetric?.holePars?.[index] || 0)).length;
  if (pars > 0) return `${pars} par${pars === 1 ? '' : 's'} in ${completion.completedHoleCount} completed hole${completion.completedHoleCount === 1 ? '' : 's'}`;
  return null;
}
function buildRoundRecord(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  const ctx = getPayoutReportContext(match, metrics);
  const timing = getRoundElapsedTimeState(match, metrics);
  const events = buildRoundRecordEvents(match, metrics);
  const paymentRows = optimalSettlementRows(ctx.finalTotals || {});
  const playerRecords = (metrics?.players || []).map((playerMetric, index) => ({
    playerId: getRoundRecordPlayerId(match, playerMetric, index), displayName: playerMetric?.player?.name || `Player ${index + 1}`,
    index: Number.isFinite(Number(playerMetric?.player?.index)) ? Number(playerMetric.player.index) : null,
    courseHandicap: Number.isFinite(Number(playerMetric?.courseHdcp ?? playerMetric?.courseHandicap)) ? Number(playerMetric.courseHdcp ?? playerMetric.courseHandicap) : null,
    teeId: match?.players?.[index]?.teeId || match?.teeId || null, teamId: playerMetric?.team ?? match?.players?.[index]?.team ?? null,
    statLines: isPlayerStatTrackingEnabled(match, playerMetric.playerId) ? (computeStatTrackingSummary(match, metrics).find(row => String(row.playerMetric?.playerId) === String(playerMetric.playerId))?.totals || null) : null,
    scoreDistribution: completion.completedHoleCount >= 6 ? (computeScoreDistributionSummary(match, metrics).find(row => String(row.playerMetric?.playerId) === String(playerMetric.playerId))?.totals || null) : null,
    grossTotal: Number(playerMetric?.grossTotal || 0), netTotal: Number(playerMetric?.leaderboardNetTotal || 0), netToPar: Number(playerMetric?.leaderboardNetDiff || 0), postable: Number(playerMetric?.postableTotal || 0),
    signatureStat: null
  }));
  playerRecords.forEach((record, index) => { record.signatureStat = buildPlayerSignatureStat(metrics.players[index], events, completion); });
  const holes = (metrics?.holeResults || []).map((hole, index) => ({
    holeNumber: Number(hole?.holeNumber || index + 1), par: Number(hole?.par || 0) || null, yards: Number(hole?.yardage || 0) || null, strokeIndex: Number(hole?.strokeIndex || 0) || null,
    scores: (hole?.playerScores || []).map(score => ({ playerId: String(score.playerId), gross: Number(score.gross) || null, net: Number.isFinite(Number(score.net)) ? Number(score.net) : null, strokesReceived: Number(score.strokes || score.strokesReceived || 0) }))
  }));
  const games = getOrderedSelectedGames(match).map(config => ({ gameId: config.key, type: config.key, config: clonePlain(config), result: buildExecutiveDriverRows(match, metrics, ctx).find(row => row.key === config.key) || null, auditRef: `game-${config.key}` }));
  const contributingGameIds = (ctx.payoutGames || []).filter(game => Object.values(game.amounts || {}).some(amount => Math.abs(Number(amount || 0)) > 0.0001)).map(game => String(game.sourceKey || game.key));
  const transactionGameId = contributingGameIds.length === 1 ? contributingGameIds[0] : 'combined_settlement';
  const transactions = paymentRows.map((row, index) => ({ transactionId: `${match?.id || 'round'}:settlement:${index + 1}`, payerId: String(row.from), payeeId: String(row.to), amount: Number(row.amount || 0), gameId: transactionGameId, sourceGameIds: contributingGameIds.slice(), roundId: String(match?.id || ''), status: completion.isIncomplete && !areAllGamesFinal(match, metrics) ? 'provisional' : 'final', auditRef: 'final-net-settlement' }));
  const crossFoot = Object.values(ctx.finalTotals || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
  return {
    schemaVersion: ROUND_RECORD_SCHEMA_VERSION,
    meta: { roundId: String(match?.id || ''), tripId: match?.tripId || null, courseSnapshot: clonePlain(match?.courseSnapshot || metrics?.course || null), teeSnapshot: clonePlain(metrics?.tee || null), date: match?.date || null, holesPlanned: completion.selectedHoleCount, holesCompleted: completion.completedHoleCount, completedHoleNumbers: completion.completedHoles.slice(), status: completion.isIncomplete ? 'provisional' : 'final', endReason: match?.roundEndReason || (completion.isComplete ? 'completed' : null), timing: { valid: !!timing.valid, available: !!timing.available, elapsedMs: timing.valid ? timing.elapsedMs : null, label: timing.valid ? timing.label : null }, handicapConvention: match?.handicapConvention || 'low_man', lowManPlayerId: playerRecords.filter(player => player.courseHandicap != null).sort((a, b) => a.courseHandicap - b.courseHandicap)[0]?.playerId || null },
    players: playerRecords, holes, games, events, transactions,
    settlement: { netPositions: Object.fromEntries(Object.entries(ctx.finalTotals || {}).map(([id, amount]) => [String(id), Number(amount || 0)])), payments: transactions, crossFoot: Number(crossFoot.toFixed(2)) },
    notes: { hostLog: String(match?.roundRecapNotes || ''), photos: clonePlain(match?.roundPhotos || []), weather: clonePlain(match?.roundContext?.weather || null) }
  };
}
function buildLegacyRoundSnapshot(match, metrics) {
  if (!metrics) return '';
  const completion = getRoundCompletionState(match, metrics);
  const ctx = getPayoutReportContext(match, metrics);
  const players = metrics.players || [];
  const status = buildRoundStatusSummary(match, metrics);
  const settlement = ctx.finalTotals || {};
  const settlementRows = Object.entries(settlement).map(([id, amount]) => ({ id, amount: Number(amount || 0), name: getPlayer(id)?.name || id }));
  const biggest = getHighRows(settlementRows, 'amount');
  const lowGross = getLowRows(players, 'grossTotal');
  const lowNet = getLowRows(players, 'leaderboardNetTotal');
  const featured = getFeaturedCompetitionResult(match, metrics);
  const timing = getRoundElapsedTimeState(match, metrics);
  const weather = formatRoundWeatherDisplay(match);
  const drivers = buildExecutiveDriverRows(match, metrics, ctx);
  const keyDetails = [];
  const currentResult = biggest.rows.length && biggest.value > 0
    ? formatAwardWinners(biggest.rows.map(r => r.name), formatMoneyAccounting(biggest.value))
    : 'All square — no current net payment';
  keyDetails.push(['Round Status', completion.isIncomplete ? `${completion.completedHoleCount} of ${completion.selectedHoleCount} holes completed · Provisional` : `${completion.completedHoleCount} of ${completion.selectedHoleCount} holes completed · Final`]);
  if (completion.isIncomplete && !completion.isSequential && completion.completedHolesLabel) keyDetails.push(['Completed Holes', completion.completedHolesLabel]);
  if (timing.available) keyDetails.push(['Round Timing', escapeHtml(timing.label)]);
  if (weather) keyDetails.push(['Weather', escapeHtml(weather.replace(/^Weather:\s*/i, ''))]);
  if (featured?.result) keyDetails.push(['Featured Competition', `${escapeHtml(featured.label)} — ${escapeHtml(featured.result)}`]);
  if (lowGross.rows.length) keyDetails.push([completion.isIncomplete ? 'Low Gross Leader' : 'Low Gross', `${formatAwardWinners(lowGross.rows.map(r => r.player?.name), lowGross.value)}${formatIncompleteScopeSuffix(completion)}`]);
  if (lowNet.rows.length) keyDetails.push([completion.isIncomplete ? 'Low Net Leader' : 'Low Net', `${formatAwardWinners(lowNet.rows.map(r => r.player?.name), lowNet.value)}${formatIncompleteScopeSuffix(completion)}`]);
  (ctx.payoutGames || []).slice(0, 4).forEach(game => {
    const rows = Object.entries(game.amounts || {}).map(([id, amount]) => ({ id, amount: Number(amount || 0), name: getPlayer(id)?.name || id }));
    const high = getHighRows(rows, 'amount');
    if (high.rows.length && high.value > 0) keyDetails.push([game.label || getGameLabel(game.key), formatAwardWinners(high.rows.map(r => r.name), formatMoneyAccounting(high.value))]);
  });
  const awards = buildRoundAwardsRows(match, metrics);
  const metaBits = [metrics?.course?.name || getCourse(match?.courseId)?.name || 'Course', metrics?.tee?.teeName || getTee(match?.courseId, match?.teeId)?.teeName || 'Tee', match?.date || todayIso()].filter(Boolean);
  const playerNames = players.map(p => p?.player?.name).filter(Boolean).join(' · ');
  const uniqueAwardKeys = new Set(keyDetails.map(([label]) => String(label).replace(/ Leader$/,'').toLowerCase()));
  const compactAwards = awards.filter(([label]) => !uniqueAwardKeys.has(String(label).replace(/ Leader$/,'').toLowerCase())).slice(0, 8);
  const takeaways = [];
  if (featured?.result) takeaways.push(`${featured.label}: ${featured.result}`);
  if (biggest.rows.length && biggest.value > 0) takeaways.push(`${biggest.rows.map(row => row.name).join(', ')} lead the money result at ${formatMoneyAccounting(biggest.value)}.`);
  if (lowNet.rows.length) takeaways.push(`${lowNet.rows.map(row => row.player?.name).filter(Boolean).join(', ')} ${lowNet.rows.length > 1 ? 'share' : 'leads'} low net at ${formatToPar(Number(lowNet.rows[0]?.leaderboardNetDiff || 0))}.`);
  if (completion.isIncomplete) takeaways.push('Only completed holes are included; unplayed holes are not estimated.');
  return `
    <section class="export-section export-section-round-snapshot report-section--major print-keep-together">
      <div class="export-section-head round-snapshot-head">
        <div>
          <h2>Executive Round Summary</h2>
          <div class="export-section-sub">Result, economic drivers, timing, and audit scope.</div>
        </div>
        <span class="round-snapshot-badge round-snapshot-badge-${escapeHtml(status.tone)}">${escapeHtml(status.badge)}</span>
      </div>
      <div class="round-snapshot-hero">
        <div class="round-snapshot-kicker">Current Result · ${escapeHtml(metaBits.join(' · '))}</div>
        <div class="round-snapshot-title">${escapeHtml(currentResult)}${completion.isIncomplete && !areAllGamesFinal(match, metrics) ? ' · Provisional' : ''}</div>
        <div class="round-snapshot-detail"><strong>${escapeHtml(status.headline)}</strong> · ${escapeHtml(status.detail)}</div>
        ${playerNames ? `<div class="round-snapshot-players">${escapeHtml(playerNames)}</div>` : ''}
      </div>
      <div class="round-snapshot-body">
        <div class="round-snapshot-primary">
          <div class="round-snapshot-section-title">Primary Drivers</div>
          ${drivers.length ? `<div class="executive-driver-list">${drivers.map(row => `<div class="executive-driver-row"><div><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.result)}</span></div><div class="executive-driver-impact">${escapeHtml(row.impact)}</div>${row.stakes ? `<small>${escapeHtml(row.stakes)}</small>` : ''}</div>`).join('')}</div>` : '<div class="export-empty">No payout games have moved yet.</div>'}
          ${takeaways.length ? `<div class="round-snapshot-takeaways"><div class="round-snapshot-awards-title">Key Takeaways</div><ul>${takeaways.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
        </div>
        <div class="round-snapshot-secondary">
          ${keyDetails.length ? `<div class="round-snapshot-grid">${keyDetails.map(([label, value]) => `<div class="round-snapshot-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div>` : `<div class="export-empty empty-state-card">No round highlights available yet.</div>`}
          ${compactAwards.length ? `<div class="round-snapshot-awards"><div class="round-snapshot-awards-title">Leaders & Awards</div><div class="round-snapshot-awards-grid">${compactAwards.slice(0, 4).map(([label, value]) => `<div class="round-snapshot-award"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div></div>` : ''}
        </div>
      </div>
    </section>`;
}

function buildRoundRecordResultLine(record) {
  const positions = Object.entries(record?.settlement?.netPositions || {}).map(([playerId, amount]) => ({ playerId, amount: Number(amount || 0) }));
  const winners = positions.filter(row => row.amount > 0.0001).sort((a, b) => b.amount - a.amount);
  if (!winners.length) return record?.meta?.holesCompleted ? 'All square — no current settlement' : 'No settlement yet';
  const top = winners[0].amount;
  const names = winners.filter(row => Math.abs(row.amount - top) < 0.0001).map(row => record.players.find(player => player.playerId === row.playerId)?.displayName || row.playerId);
  const verb = record.meta.status === 'provisional' ? (names.length === 1 ? 'leads' : 'lead') : (names.length === 1 ? 'takes it' : 'take it');
  return `${names.join(' and ')} ${verb}, +${formatMoneyAccounting(top)}${record.meta.status === 'provisional' ? ' provisional' : ''}`;
}
function describeRoundRecordEvent(record, event) {
  if (!event) return '';
  const teamName = event.teamId != null ? (record.games.find(game => game.gameId === event.gameId)?.result?.result?.match(/^[^+]+/)?.[0]?.trim() || `Team ${event.teamId}`) : '';
  if (event.type === 'lead_change') return `${teamName || 'The match leader'} flipped the ${event.gameId === 'sneaky_sandy_poley' ? 'SSP ' : ''}match on H${event.holeNumber} with a ${event.magnitude}-point swing.`;
  if (event.type === 'swing') return `H${event.holeNumber} produced a ${event.magnitude}-point swing${teamName ? ` to ${teamName}` : ''}.`;
  if (event.type === 'multiplier') return `The ${event.magnitude}x multiplier on H${event.holeNumber} changed the shape of the match.`;
  if (event.type === 'payout_driver') return `${event.description}.`;
  if (event.type === 'signature_score') return `${record.players.find(player => player.playerId === event.playerId)?.displayName || 'A player'} recorded ${String(event.description).toLowerCase()} on H${event.holeNumber}.`;
  return event.description ? `${event.description}.` : '';
}
function buildRoundRecordStory(record) {
  const turningPoint = record.events.find(event => ['lead_change', 'swing', 'multiplier'].includes(event.type)) || record.events.find(event => Number(event.holeNumber)) || null;
  const resultLine = buildRoundRecordResultLine(record);
  const storyLine = describeRoundRecordEvent(record, turningPoint) || describeRoundRecordEvent(record, record.events[0]) || `${record.meta.holesCompleted} completed hole${record.meta.holesCompleted === 1 ? '' : 's'} define the current result.`;
  const headline = turningPoint?.holeNumber && Number(turningPoint.magnitude) ? `The ${Number(turningPoint.magnitude)}-Point ${turningPoint.holeNumber === 3 ? 'Third' : `H${turningPoint.holeNumber}`}` : (record.meta.status === 'provisional' ? 'The Round So Far' : 'How the Round Turned');
  const provisional = record.meta.status === 'provisional' ? `Only ${record.meta.holesCompleted} of ${record.meta.holesPlanned} holes were completed, so the round record remains provisional.` : '';
  const consequence = record.transactions.length ? `${record.transactions.length} payment${record.transactions.length === 1 ? '' : 's'} settle the current game ledger.` : 'No payment is currently required.';
  const secondaryEvent = record.events.map(event => describeRoundRecordEvent(record, event)).find(description => description && description !== storyLine) || '';
  const resultSentence = `${resultLine}.`;
  const narrative = [resultSentence, secondaryEvent || consequence, provisional || (secondaryEvent ? consequence : '')].filter(Boolean).slice(0, 3).join(' ');
  return { headline: headline.split(/\s+/).slice(0, 8).join(' '), dek: resultSentence.split(/\s+/).slice(0, 25).join(' '), storyLine, narrative, turningPoint };
}
function buildRoundRecordMomentum(match, metrics, record) {
  if (!isSneakySandyPoleyEnabled(match)) return '';
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  const data = buildSneakySandyPoleyMomentumData(match, { ledger });
  if (!data.length) return '<div class="round-record-momentum-pending">SSP selected — momentum pending.</div>';
  const width = 680, height = 170, left = 46, right = 28, top = 22, bottom = 34;
  const max = Math.max(1, ...data.map(row => Math.abs(row.cumulative)));
  const zero = top + (height - top - bottom) / 2;
  const x = index => data.length === 1 ? (left + width - right) / 2 : left + index * (width - left - right) / (data.length - 1);
  const y = value => zero - value / max * ((height - top - bottom) / 2);
  const points = data.map((row, index) => `${x(index)},${y(row.cumulative)}`).join(' ');
  const annotations = data.map((row, index) => {
    const multiplier = record.events.find(event => event.type === 'multiplier' && event.holeNumber === row.holeNumber);
    return `<circle cx="${x(index)}" cy="${y(row.cumulative)}" r="4" class="ssp-momentum-dot"/>${multiplier ? `<text x="${x(index)}" y="${Math.max(12, y(row.cumulative) - 10)}" text-anchor="middle">H${row.holeNumber} ${multiplier.magnitude}x</text>` : `<text x="${x(index)}" y="${height - 10}" text-anchor="middle">H${row.holeNumber}</text>`}`;
  }).join('');
  const final = data[data.length - 1];
  const teams = ledger.teams || [];
  const finalLabel = final.cumulative ? `${final.cumulative > 0 ? teams[0]?.name : teams[1]?.name} +${Math.abs(final.cumulative)}` : 'Tied';
  return `<div class="round-record-momentum"><div class="round-record-momentum-head"><strong>SSP Momentum</strong><span>Final: ${escapeHtml(finalLabel)}</span></div><div class="tiny">Above zero favors ${escapeHtml(teams[0]?.name || 'Team 1')}; below zero favors ${escapeHtml(teams[1]?.name || 'Team 2')}.</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="SSP cumulative point margin"><line x1="${left}" y1="${zero}" x2="${width - right}" y2="${zero}" class="ssp-momentum-zero"/><polyline points="${points}" class="ssp-momentum-line" fill="none"/>${annotations}</svg></div>`;
}
function buildRoundSnapshot(match, metrics, roundRecord = null) {
  if (!metrics) return '';
  const record = roundRecord || buildRoundRecord(match, metrics);
  const story = buildRoundRecordStory(record);
  const course = metrics?.course?.name || 'Course';
  const tee = metrics?.tee?.teeName || 'Tee';
  const status = record.meta.status === 'provisional' ? `Provisional · ${record.meta.holesCompleted} of ${record.meta.holesPlanned}` : 'Final';
  const paymentChips = record.transactions.map(row => {
    const payer = record.players.find(player => player.playerId === row.payerId)?.displayName || row.payerId;
    const payee = record.players.find(player => player.playerId === row.payeeId)?.displayName || row.payeeId;
    return `<span class="settle-up-chip">${escapeHtml(payer)} → ${escapeHtml(payee)} <strong>${formatMoneyAccounting(row.amount)}</strong></span>`;
  }).join('');
  const turning = story.turningPoint;
  const turningHole = record.holes.find(hole => hole.holeNumber === turning?.holeNumber);
  const heroStoryLine = turning
    ? (record.transactions.length ? `${record.transactions.length} payment${record.transactions.length === 1 ? '' : 's'} reconcile the current game ledger.` : 'The turning point below defines the current match position.')
    : story.storyLine;
  const footer = record.players.map(player => `<span><strong>${escapeHtml(player.displayName)}</strong> · Course HCP ${player.courseHandicap == null ? '—' : escapeHtml(player.courseHandicap)}</span>`).join('');
  return `<section class="export-section export-section-round-snapshot report-layer report-layer--hero report-section--major print-keep-together" data-round-record-schema="${record.schemaVersion}">
    <div class="round-record-masthead"><div><div class="round-record-brand">The Dye Ledger</div><div>${escapeHtml(course)} · ${escapeHtml(tee)} · ${escapeHtml(record.meta.date || '')}</div></div><span class="round-snapshot-badge round-snapshot-badge-${record.meta.status === 'provisional' ? 'provisional' : 'complete'}">${escapeHtml(status)}</span></div>
    <div class="round-record-result">${escapeHtml(buildRoundRecordResultLine(record))}</div>
    <div class="round-record-storyline">${escapeHtml(heroStoryLine)}</div>
    ${buildRoundRecordMomentum(match, metrics, record)}
    ${turning ? `<div class="round-record-turning"><span>Turning Point · H${escapeHtml(turning.holeNumber || '—')}${turningHole?.par ? ` · Par ${escapeHtml(turningHole.par)}` : ''}${turningHole?.yards ? ` · ${escapeHtml(turningHole.yards)} yds` : ''}</span><strong>${escapeHtml(describeRoundRecordEvent(record, turning))}</strong></div>` : ''}
    <div class="round-record-settle">${paymentChips || '<span class="settle-up-chip settle-up-chip--even">No payment required</span>'}</div>
    <div class="round-record-reconcile">${record.transactions.length} payment${record.transactions.length === 1 ? '' : 's'} settle all games · ${Math.abs(record.settlement.crossFoot) <= 0.0001 ? 'reconciled' : 'review required'}</div>
    <div class="round-record-footer">${footer}</div>
  </section>`;
}

function buildRoundStorySection(match, metrics, record) {
  const story = buildRoundRecordStory(record);
  const capsules = record.players.filter(player => player.signatureStat).map(player => `<li><strong>${escapeHtml(player.displayName)}</strong> — ${escapeHtml(player.signatureStat)}</li>`).join('');
  const awards = buildRoundAwardsRows(match, metrics);
  return `<section class="export-section export-section-round-story report-layer report-layer--story">
    <div class="round-story-heading"><div class="section-label">Round Story</div><h2>${escapeHtml(story.headline)}</h2><div class="round-story-dek">${escapeHtml(story.dek)}</div><div class="export-section-sub">Generated from scoring, games, settlement, and round events.</div></div>
    <div class="round-story-copy"><p>${escapeHtml(story.narrative)}</p></div>
    ${capsules ? `<div class="round-story-capsules"><h3>Player Capsules</h3><ul>${capsules}</ul></div>` : ''}
    ${awards.length ? `<div class="round-story-awards"><h3>Leaders & Awards</h3>${awards.slice(0, 4).map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong> ${value}</span>`).join('')}</div>` : ''}
  </section>`;
}

function formatTimestampET(timestamp, { includeDate = true } = {}) {
  if (!timestamp) return '';
  const dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!dt || Number.isNaN(dt.getTime())) return '';
  const options = includeDate
    ? { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' };
  return `${new Intl.DateTimeFormat('en-US', options).format(dt)} ET`;
}
function formatBuildDateET(timestamp) {
  const formatted = formatTimestampET(timestamp, { includeDate: true });
  return formatted ? `Build Date: ${formatted}` : 'Build Date: unavailable';
}

function getUrlVersionDiagnostic() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('v') || url.searchParams.get('version') || '';
  } catch {
    return '';
  }
}

function cleanupStaleUrlVersionParameter() {
  try {
    const url = new URL(window.location.href);
    const versionValue = url.searchParams.get('v');
    const versionParamIsStale = versionValue && versionValue !== BUILD_INFO.versionNumber && versionValue !== BUILD_INFO.version;
    if (versionParamIsStale || url.searchParams.get('version')) {
      url.searchParams.delete('v');
      url.searchParams.delete('version');
      const clean = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, document.title, clean);
    }
  } catch (err) {
    console.warn('[PWA] URL version cleanup skipped:', err);
  }
}

function getVersionConsistencyStatus({ sw = null, appCaches = [] } = {}) {
  const urlVersion = getUrlVersionDiagnostic();
  const staleUrl = !!urlVersion && urlVersion !== BUILD_INFO.versionNumber && urlVersion !== BUILD_INFO.version;
  const currentCachePresent = appCaches.includes(APP_CACHE_NAME);
  const staleCaches = appCaches.filter(key => key !== APP_CACHE_NAME);
  const cacheMismatch = appCaches.length > 0 && !currentCachePresent;
  const pageUncontrolled = !!sw?.supported && !sw?.controller;
  const warnings = [];
  if (staleUrl) warnings.push(`URL version is stale (${urlVersion}).`);
  if (cacheMismatch) warnings.push('Detected app cache does not match the current app version.');
  if (staleCaches.length && !currentCachePresent) warnings.push(`Old app cache detected: ${staleCaches.join(', ')}.`);
  if (pageUncontrolled) warnings.push('This page is not currently controlled by the service worker.');
  return {
    ok: warnings.length === 0,
    urlVersion,
    currentCachePresent,
    staleCaches,
    warnings
  };
}
function hasActiveRound(match, metrics = null) {
  if (!match || match.status === 'complete') return false;
  const players = Array.isArray(metrics?.players) ? metrics.players : (Array.isArray(match.players) ? match.players : []);
  const tee = metrics?.tee || getTee(match.courseId, match.teeId) || getCourse(match.courseId)?.tees?.find(t => t.id === match.teeId) || null;
  const holes = tee ? getSelectedScoringHoles(match, tee) : [];
  return players.length > 0 && holes.length > 0 && state.activeMatchId === match.id;
}
function buildRoundRecapStatus(match) {
  const status = String(match?.roundRecapStatus || '').trim();
  const generatedText = match?.roundRecapGeneratedAt ? formatTimestampET(match.roundRecapGeneratedAt) : '';
  return status || (generatedText ? `Generated ${generatedText}.` : '');
}
function buildRecapInputTransparency(match) {
  const memories = getRoundMemories(match);
  const notes = String(match?.roundRecapNotes || '').trim();
  const previewMemories = memories.slice(0, 5);
  return `
    <div class="round-recap-input-preview" aria-label="AI recap inputs preview">
      <div class="recap-input-row">
        <strong>Featured Competition</strong>
        <span>${escapeHtml(getFeaturedCompetitionDisplayName(match, resolveFeaturedCompetitionKey(match, match ? computeMatchMetrics(match) : null)))}</span>
      </div>
      <div class="recap-input-row">
        <strong>Round Notes Included</strong>
        <span>${notes ? `${notes.length} characters` : 'None yet — recap will rely on scores, games, and stats.'}</span>
      </div>
      <div class="recap-input-row">
        <strong>Weather Context</strong>
        <span>${escapeHtml(getRoundWeatherSummary(match) || 'None captured yet.')}</span>
      </div>
      <div class="recap-input-row recap-input-row-stack">
        <strong>Memories Included in Recap (${memories.length})</strong>
        ${previewMemories.length ? `<ul>${previewMemories.map(m => `<li>${escapeHtml(m.holeNumber ? `Hole ${m.holeNumber}: ` : '')}${escapeHtml(m.category && m.category !== 'General' ? `[${m.category}] ` : '')}${escapeHtml(m.text)}</li>`).join('')}</ul>` : '<div class="tiny">No memories saved yet. Use Add Memory on the Play tab to add moments for the recap.</div>'}
        ${memories.length > previewMemories.length ? `<div class="tiny">+ ${memories.length - previewMemories.length} more memor${memories.length - previewMemories.length === 1 ? 'y' : 'ies'} included.</div>` : ''}
      </div>
    </div>`;
}
function buildRoundRecapControls(match) {
  if (!match) return '';
  const recap = getStoredRoundRecap(match);
  const finalRecap = getFinalRoundRecap(match);
  const draftRecap = getDraftRoundRecap(match);
  const online = navigator.onLine !== false;
  const configured = !!getRoundRecapUrl();
  const disabled = !online || !configured;
  const memoryCount = getRoundMemories(match).length;
  const reason = !configured ? 'Configure Supabase to enable AI round recaps.' : (!online ? 'Round Recap requires an internet connection.' : `AI recap uses Round Notes plus ${memoryCount} saved memor${memoryCount === 1 ? 'y' : 'ies'}.`);
  const editing = !!uiState.roundRecapEditing && !!recap;
  const recapStatus = finalRecap ? 'Accepted recap ready for Match Summary and PDF.' : (draftRecap ? 'Draft recap ready for host review.' : (buildRoundRecapStatus(match) || reason));
  const recapPreview = recap ? (editing
    ? `<textarea id="roundRecapEditBox" class="round-recap-edit-box" rows="10">${escapeHtml(recap)}</textarea>`
    : `<div class="round-recap-preview">${formatRoundRecapHtml(recap)}</div>`) : '';
  return `
    <div class="round-recap-control-card no-print">
      <div>
        <div class="section-label">AI Round Recap</div>
        <div class="tiny">${escapeHtml(recapStatus)}</div>
      </div>
      <div class="round-recap-notes-field">
        <label for="roundRecapNotesBox">Round Notes for AI Recap</label>
        <div class="tiny">Add context the scorecard cannot see — funny moments, clutch shots, weather, side bets, injuries, pace, or anything worth remembering. Memories captured on the Play tab are also included.</div>
        <textarea id="roundRecapNotesBox" rows="7" placeholder="Example: Tom birdied 16 to close out match play. Mike holed a bunker shot on 8. Wind picked up on the back nine.">${escapeHtml(match.roundRecapNotes || '')}</textarea>
      </div>
      ${buildRecapInputTransparency(match)}
      <div class="actions wrap compact-actions">
        <button id="generateRoundRecapBtn" type="button" class="secondary" ${disabled ? 'disabled' : ''}>${recap ? 'Regenerate' : 'Generate AI Recap'}</button>
        ${recap ? `<button id="editRoundRecapBtn" type="button" class="secondary">${editing ? 'Stop Editing' : 'Edit'}</button>` : ''}
        ${recap ? '<button id="acceptRoundRecapBtn" type="button">Accept</button>' : ''}
        ${recap ? '<button id="clearRoundRecapBtn" type="button" class="secondary">Clear Recap</button>' : ''}
      </div>
      ${recapPreview}
    </div>`;
}
function summarizeSelectedGamesForRecap(match, metrics) {
  const selected = getOrderedSelectedGames(match);
  return selected.map(cfg => {
    const item = { key: cfg.key, label: getFeaturedGameLabel(match, cfg.key) };
    try {
      if (cfg.key === 'greenies') {
        const g = getGreeniesResults(match, metrics, cfg);
        item.summary = {
          winners: g.winnersByHole.map(h => ({ hole: h.holeNumber, player: getPlayer(h.winner)?.name || 'Unknown' })),
          counts: Object.fromEntries(Object.entries(g.counts || {}).map(([id, n]) => [getPlayer(id)?.name || id, n])),
        };
      } else if (cfg.key === 'nine_point') {
        const nine = computeNinePointResults(match, metrics, cfg);
        item.summary = {
          basis: formatBasisLabel(nine.basis),
          stakePerPoint: nine.stakePerPoint,
          completedHoles: nine.completedHoles,
          leaderboard: nine.leaderboard.map(r => ({ player: r.name, points: r.total, payout: Number(r.amount || 0) })),
        };
      } else if (cfg.key === 'individual_match') {
        item.summary = getIndividualMatchPairings(match, metrics).map(p => ({ label: p.label, game: getSideMatchGameLabel(p.game), basis: formatBasisLabel(p.basis), stake: Number(p.stake) || 0, status: p.status, completedHoles: p.completedCount }));
      } else if (cfg.key === 'nassau' || cfg.key === 'team_match') {
        const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
        item.summary = { basis: formatBasisLabel(cfg.basis), front: diffs.front, back: diffs.back, overall: diffs.overall, status: formatTeamGameStatus(match, metrics, diffs.overall) };
      }
    } catch (err) {
      item.summary = 'Unavailable';
    }
    return item;
  });
}

function sortRecapLeaderboard(players, key) {
  return (players || [])
    .filter(p => Number.isFinite(Number(p[key])) && Number(p[key]) > 0)
    .slice()
    .sort((a, b) => Number(a[key]) - Number(b[key]) || String(a.name).localeCompare(String(b.name)))
    .map((p, idx) => ({ rank: idx + 1, player: p.name, value: Number(p[key]) }));
}
function buildRoundRecapStatLeaders(playerSummaries) {
  const stats = (playerSummaries || []).filter(p => p.statsTracked !== false && p.stats);
  const leaderFor = (label, path, mode = 'max') => {
    const rows = stats.map(p => {
      const val = path.reduce((obj, part) => obj && obj[part], p);
      return { player: p.name, value: Number(val) };
    }).filter(r => Number.isFinite(r.value));
    if (!rows.length) return null;
    const target = mode === 'min' ? Math.min(...rows.map(r => r.value)) : Math.max(...rows.map(r => r.value));
    return { label, mode, value: target, players: rows.filter(r => r.value === target).map(r => r.player) };
  };
  return {
    totalPutts: leaderFor('Total Putts', ['stats', 'puttsTotal'], 'min') || leaderFor('Total Putts', ['stats', 'totalPutts'], 'min'),
    averagePutts: leaderFor('Average Putts', ['stats', 'avgPutts'], 'min') || leaderFor('Average Putts', ['stats', 'puttsAvg'], 'min'),
    gir: leaderFor('GIR', ['stats', 'girMade'], 'max') || leaderFor('GIR', ['stats', 'gir'], 'max'),
    fairways: leaderFor('Fairways', ['stats', 'fairwaysMade'], 'max') || leaderFor('Fairways', ['stats', 'fairways'], 'max'),
    penalties: leaderFor('Penalty Strokes', ['stats', 'penalties'], 'min') || leaderFor('Penalty Strokes', ['stats', 'penaltyStrokes'], 'min'),
    upAndDowns: leaderFor('Up & Downs', ['stats', 'upAndDowns'], 'max'),
    sandies: leaderFor('Sandies', ['stats', 'sandies'], 'max'),
  };
}
function buildRoundRecapAuthoritativeFacts(match, metrics, playerSummaries, finalSettlement, payoutGames) {
  const grossLeaderboard = sortRecapLeaderboard(playerSummaries, 'gross');
  const netLeaderboard = sortRecapLeaderboard(playerSummaries, 'net');
  const lowGrossScore = grossLeaderboard[0]?.value ?? null;
  const lowNetScore = netLeaderboard[0]?.value ?? null;
  const lowGrossPlayers = lowGrossScore == null ? [] : grossLeaderboard.filter(r => r.value === lowGrossScore).map(r => r.player);
  const lowNetPlayers = lowNetScore == null ? [] : netLeaderboard.filter(r => r.value === lowNetScore).map(r => r.player);
  const gameWinners = (payoutGames || []).map(game => {
    const amounts = Object.entries(game.amounts || {}).map(([player, amount]) => ({ player, amount: Number(amount || 0) }));
    const max = amounts.length ? Math.max(...amounts.map(r => r.amount)) : 0;
    const winners = amounts.filter(r => r.amount === max && r.amount > 0).map(r => ({ player: r.player, amount: r.amount }));
    return { label: game.label, winners, amounts, paymentLines: game.paymentLines || [] };
  });
  const settlementTotals = {};
  (finalSettlement || []).forEach(row => {
    settlementTotals[row.from] = (settlementTotals[row.from] || 0) - Number(row.amount || 0);
    settlementTotals[row.to] = (settlementTotals[row.to] || 0) + Number(row.amount || 0);
  });
  return {
    lowGrossPlayer: lowGrossPlayers.join(', ') || null,
    lowGrossPlayers,
    lowGrossScore,
    lowNetPlayer: lowNetPlayers.join(', ') || null,
    lowNetPlayers,
    lowNetScore,
    grossLeaderboard,
    netLeaderboard,
    finalSettlement,
    finalSettlementTotals: settlementTotals,
    gameResults: gameWinners,
    gameWinners,
    greenieWinners: (summarizeSelectedGamesForRecap(match, metrics).find(g => g.key === 'greenies')?.summary?.winners) || [],
    statLeaders: buildRoundRecapStatLeaders(playerSummaries),
  };
}
function buildRoundRecapPayload(match, metrics) {
  const courseName = metrics?.course?.name || getCourse(match?.courseId)?.name || 'Course';
  const teeName = metrics?.tee?.teeName || getTee(match?.courseId, match?.teeId)?.teeName || 'Tee';
  const payoutCtx = getPayoutReportContext(match, metrics);
  const finalSettlement = optimalSettlementRows(payoutCtx.finalTotals || {}).map(row => ({
    from: getPlayer(row.from)?.name || row.from,
    to: getPlayer(row.to)?.name || row.to,
    amount: Number(row.amount || 0),
  }));
  const playerSummaries = (metrics?.players || []).map(pm => {
    const dist = computeScoreDistributionSummary(match, metrics).find(r => r.playerMetric?.playerId === pm.playerId)?.totals || {};
    const statsTracked = isPlayerStatTrackingEnabled(match, pm.playerId);
    const stat = statsTracked ? (computeStatTrackingSummary(match, metrics).find(r => r.playerMetric?.playerId === pm.playerId)?.totals || {}) : null;
    return {
      name: pm.player?.name || 'Player',
      team: getTeamLabel(match, pm.team),
      index: Number(pm.player?.index),
      tee: pm.tee?.teeName || '',
      courseHandicap: Number(pm.courseHdcp),
      playingHandicap: Number(pm.playHdcp),
      gross: Number(pm.grossTotal || 0),
      net: Number(pm.leaderboardNetTotal || pm.netTotal || 0),
      netToPar: Number(pm.leaderboardNetDiff || 0),
      postable: Number(pm.postableTotal || 0),
      scoreDistribution: dist,
      statsTracked,
      stats: stat,
    };
  });
  const payoutGames = (payoutCtx.payoutGames || []).map(game => ({
    label: game.label,
    amounts: Object.fromEntries(Object.entries(game.amounts || {}).map(([id, amt]) => [getPlayer(id)?.name || id, Number(amt || 0)])),
    paymentLines: Array.isArray(game.paymentLines) ? game.paymentLines.map(line => ({ from: getPlayer(line.from)?.name || line.from, to: getPlayer(line.to)?.name || line.to, amount: Number(line.amount || 0) })) : [],
  }));
  let momentum = null;
  try {
    const key = getDefaultMomentumGameKey(match, metrics) || match.momentumGame || '';
    if (key && hasTeamMomentumMatch(match, metrics)) {
      momentum = { description: describeMomentumMeta(match, metrics, key), holes: [] };
      let running = 0;
      (metrics?.holeResults || []).forEach(h => {
        const outcome = computeMomentumOutcome(match, metrics, h, key);
        if (outcome === 'team1') running += 1;
        else if (outcome === 'team2') running -= 1;
        if (outcome !== 'pending') momentum.holes.push({ hole: h.holeNumber, status: formatPerspectiveStatus(running, getMomentumPerspectiveTeam(match)) });
      });
    }
  } catch (_) {}
  const roundCompletionState = getRoundCompletionState(match, metrics);
  const gameClinchStates = getGameClinchStates(match, metrics);
  const allGamesFinal = areAllGamesFinal(match, metrics);
  return {
    app: 'The Dye Ledger',
    course: courseName,
    tee: teeName,
    date: match?.date || todayIso(),
    holesCompleted: Number(metrics?.completed || 0),
    holeCount: getPlayableHoleCount(match, metrics?.tee),
    status: match?.status || 'active',
    roundCompletionState,
    roundEndReason: match?.roundEndReason || (roundCompletionState.isComplete ? 'completed' : ''),
    allGamesFinal,
    gameClinchStates,
    roundNotes: String(match?.roundRecapNotes || '').trim(),
    roundContext: {
      weather: normalizeRoundWeatherSnapshot(match?.roundContext?.weather),
      roundTiming: {
        startedAt: match?.roundTiming?.startedAt || null,
        endedAt: match?.roundTiming?.endedAt || match?.completedAt || null,
        elapsedLabel: getRoundElapsedTimeState(match, metrics).label,
      },
    },
    featuredCompetition: {
      selected: getFeaturedCompetitionSelection(match),
      resolved: resolveFeaturedCompetitionKey(match, metrics),
      label: getFeaturedCompetitionResult(match, metrics).label,
      result: getFeaturedCompetitionResult(match, metrics).result,
    },
    memories: getRoundMemories(match).map(m => ({ text: m.text, category: m.category, holeNumber: m.holeNumber, createdAt: m.createdAt })),
    recapInstructions: 'Write a polished, private-club style golf recap with short sections: Round Story, Featured Competition, Turning Points, Player Highlights, Game Story, Statistical Notes, Memorable Moments, and Closing Note or Fun Awards when supported. Center the Featured Competition first, distinguish it from Low Gross, Low Net, Money Winner, game winners, and awards, and use Round Notes and Memories for personality. If roundContext.weather.summary is present, you may reference the weather naturally where it helps explain the round, but do not force a weather mention or recite raw weather metrics awkwardly. Do not fabricate shots, weather, holes, or emotions not supported by data or notes. For an incomplete round, say completed holes and use the supplied completed-hole list; never say opening holes or front nine unless that exact sequential range is complete. Treat incomplete-round money as provisional unless the relevant game is mathematically decided. If clinched early, explain that the featured competition was decided before all holes were played. Do not fabricate untracked statistics. Keep the tone professional, fun, golf-aware, specific, and concise on mobile.',
    players: playerSummaries,
    games: summarizeSelectedGamesForRecap(match, metrics),
    finalSettlement,
    payoutGames,
    momentum,
    authoritativeFacts: buildRoundRecapAuthoritativeFacts(match, metrics, playerSummaries, finalSettlement, payoutGames),
  };
}
async function generateRoundRecapForActiveMatch() {
  const match = getActiveMatch();
  if (!match) return toast('Create or load a match first.');
  if (navigator.onLine === false) return toast('Round Recap requires an internet connection.');
  const url = getRoundRecapUrl();
  if (!url) return toast('Configure Supabase before generating a Round Recap.');
  const metrics = computeMatchMetrics(match);
  if (!metrics) return toast('Match data is not ready yet.');
  const btn = document.getElementById('generateRoundRecapBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }
  match.roundRecapStatus = 'Generating Round Recap…';
  persist({ skipRender: true });
  renderRoundMemoriesPanel(match);
  renderRoundRecapControlPanel(match);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getRoundRecapHeaders(),
      body: JSON.stringify({ match: buildRoundRecapPayload(match, metrics) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) throw new Error(data?.error || `Round Recap failed (${response.status}).`);
    const recap = String(data?.recap || data?.text || '').trim();
    if (!recap) throw new Error('Round Recap returned no text.');
    match.roundRecapGenerated = recap;
    if (!String(match.roundRecapFinal || '').trim()) match.roundRecap = recap;
    match.roundRecapGeneratedAt = new Date().toISOString();
    match.roundRecapStatus = String(match.roundRecapFinal || '').trim() ? 'New draft recap generated. Accepted recap preserved.' : 'Draft recap generated. Review, edit, or accept it.';
    persist({ skipRender: true });
    renderLeaderboard();
    toast('Round Recap generated.');
  } catch (err) {
    console.error(err);
    match.roundRecapStatus = err?.message || 'Round Recap unavailable.';
    persist({ skipRender: true });
    renderLeaderboard();
    toast('Round Recap unavailable. Match Summary still works normally.');
  }
}

function acceptRoundRecapForActiveMatch() {
  const match = getActiveMatch();
  if (!match) return;
  const editBox = document.getElementById('roundRecapEditBox');
  const text = String(editBox?.value || getStoredRoundRecap(match) || '').trim();
  if (!text) return toast('No recap text to accept.');
  match.roundRecapFinal = text;
  match.roundRecap = text;
  match.roundRecapStatus = 'Accepted recap saved for Match Summary and PDF.';
  uiState.roundRecapEditing = false;
  persist({ skipRender: true });
  renderLeaderboard();
  toast('Recap accepted.');
}
function clearRoundRecapForActiveMatch() {
  const match = getActiveMatch();
  if (!match) return;
  match.roundRecap = '';
  match.roundRecapGenerated = '';
  match.roundRecapFinal = '';
  match.roundRecapGeneratedAt = null;
  match.roundRecapStatus = 'Round Recap cleared.';
  uiState.roundRecapEditing = false;
  persist({ skipRender: true });
  renderLeaderboard();
}
function renderRoundRecapControlPanel(match = getActiveMatch()) {
  const panel = document.getElementById('roundRecapControls');
  if (!panel) return;
  panel.innerHTML = match ? buildRoundRecapControls(match) : '';
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

function buildExportHeaderPlayers(match, metrics) {
  const players = Array.isArray(metrics?.players) ? metrics.players : [];
  if (!players.length) return '';
  const rows = players.map(p => {
    const indexValue = Number(p?.player?.index);
    const indexText = Number.isFinite(indexValue) ? indexValue.toFixed(1) : '—';
    const teeText = p?.tee?.teeName || '—';
    const courseHdcpText = Number.isFinite(Number(p?.courseHdcp)) ? String(Number(p.courseHdcp)) : '—';
    return `
      <div class="export-header-player-card">
        <div class="export-header-player-name">${escapeHtml(p?.player?.name || 'Player')}</div>
        <div class="export-header-player-meta">
          <span>Index: <strong>${escapeHtml(indexText)}</strong></span>
          <span>Tee: <strong>${escapeHtml(teeText)}</strong></span>
          <span>Course HCP: <strong>${escapeHtml(courseHdcpText)}</strong></span>
        </div>
      </div>`;
  }).join('');
  return `<div class="export-header-players">${rows}</div>`;
}

function buildSharedLedgerReportNote(match) {
  if (!match || match.storageMode !== 'shared') return '';
  const parity = match.sharedLedgerParity && typeof match.sharedLedgerParity === 'object' ? match.sharedLedgerParity : null;
  const confirmed = parity?.parityConfirmed || parity?.status === 'confirmed';
  const conflicts = Array.isArray(parity?.conflicts) ? parity.conflicts.length : 0;
  const missingLocal = Array.isArray(parity?.missingLocal) ? parity.missingLocal.length : 0;
  const missingRemote = Array.isArray(parity?.missingRemote) ? parity.missingRemote.length : 0;
  const sspConflicts = isSneakySandyPoleyEnabled(match) ? (match.sharedSspConflicts || []).length : 0;
  const detail = confirmed
    ? 'Shared Match reconciliation: confirmed'
    : `Shared Match reconciliation was not confirmed before this summary was generated.${conflicts ? ` Conflicts: ${conflicts}.` : ''}${missingLocal ? ` Missing local entries: ${missingLocal}.` : ''}${missingRemote ? ` Missing remote entries: ${missingRemote}.` : ''}`;
  return `<section class="export-section export-section-shared-ledger-note print-keep-together">
    <div class="export-section-head">
      <h2>Shared Match Reconciliation</h2>
      <div class="export-section-sub">${escapeHtml(detail)}${sspConflicts ? ` Shared SSP conflict${sspConflicts === 1 ? '' : 's'} must be resolved before settlement is final.` : (isSneakySandyPoleyEnabled(match) ? ' SSP reconciled from shared facts.' : '')}</div>
    </div>
  </section>`;
}

function buildSneakySandyPoleyExportSummary(match, metrics) {
  if (!isSneakySandyPoleyEnabled(match)) return '';
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  const countedHoles = Object.values(ledger?.holes || {}).filter(hole => hole?.counted);
  if (!ledger?.enabled || (ledger.teams || []).length !== 2 || !countedHoles.length) {
    return `<section class="export-section export-section-ssp-summary export-section-ssp-pending">
      <div class="export-section-head"><h2>Sneaky / Sandy / Poley</h2></div>
      <div class="ssp-momentum-empty"><strong>SSP selected — momentum pending.</strong><br>Momentum will appear after the first completed SSP hole. Earlier holes without valid SSP ledger data are not backfilled or estimated.</div>
    </section>`;
  }
  const teams = ledger.teams || [];
  const leader = ledger.finalLeader || {};
  const leaderText = leader.tied
    ? 'Tied'
    : `${formatSneakySandyPoleyTeamName(ledger, match, leader.teamId)} +${Number(leader.margin || 0)}`;
  const totalRows = teams.map(team => `
    <div class="game-summary-card">
      <div class="game-summary-title">${escapeHtml(team.name)}</div>
      <div class="game-summary-value">${Number(ledger.finalTotalsByTeam?.[team.id] || 0)} pts</div>
      <div class="game-summary-sub">Base ${Number(ledger.baseTotalsByTeam?.[team.id] || 0)} pts</div>
    </div>`).join('');
  const holeRows = countedHoles.map(hole => {
    const base = teams.map(team => `${team.name} ${Number(hole.pointsAfterTakeKeepByTeam?.[team.id] || 0)}`).join(' / ');
    const final = teams.map(team => `${team.name} ${Number(hole.finalPointsByTeam?.[team.id] || 0)}`).join(' / ');
    const takeKeep = hole.takeKeep?.teamId ? `${formatSneakySandyPoleyTeamName(ledger, match, hole.takeKeep.teamId)} ${hole.takeKeep.type === 'take' ? 'Take +2' : 'Keep +1'}` : '-';
    const umbee = hole.umbee?.active ? `${formatSneakySandyPoleyTeamName(ledger, match, hole.umbee.teamId)} ${hole.umbee.reason}` : '-';
    const running = hole.runningLeader?.tied ? 'Tied' : `${formatSneakySandyPoleyTeamName(ledger, match, hole.runningLeader?.teamId)} +${Number(hole.runningLeader?.margin || 0)}`;
    return `<tr>
      <td>${Number(hole.holeNumber) || ''}</td>
      <td>${escapeHtml(base)}</td>
      <td>${escapeHtml(takeKeep)}</td>
      <td>${escapeHtml(hole.bridge?.label || '1x')}</td>
      <td>${escapeHtml(umbee)}</td>
      <td>${escapeHtml(final)}</td>
      <td>${escapeHtml(running)}</td>
    </tr>`;
  }).join('');
  const pointValue = Number(ledger.settlement?.pointValue || ledger.settings?.pointValue || 0);
  const momentum = buildSneakySandyPoleyMomentumData(match, { ledger });
  const momentumHtml = momentum.length ? (() => {
    const width = 680, height = 230, padLeft = 54, padRight = 28, padTop = 28, padBottom = 42;
    const max = Math.max(1, ...momentum.map(row => Math.abs(row.cumulative)));
    const chartHeight = height - padTop - padBottom;
    const zeroY = padTop + chartHeight / 2;
    const x = i => momentum.length === 1 ? (padLeft + width - padRight) / 2 : padLeft + (i * (width - padLeft - padRight) / (momentum.length - 1));
    const y = value => zeroY - (value / max) * (chartHeight / 2);
    const points = momentum.map((row, i) => `${x(i)},${y(row.cumulative)}`).join(' ');
    const xLabels = momentum.map((row, i) => `<text x="${x(i)}" y="${height - 14}" text-anchor="middle">H${row.holeNumber}</text>`).join('');
    const dots = momentum.map((row, i) => `<circle cx="${x(i)}" cy="${y(row.cumulative)}" r="4.5" class="ssp-momentum-dot"><title>Hole ${row.holeNumber}: ${row.cumulative > 0 ? teams[0].name : row.cumulative < 0 ? teams[1].name : 'Tied'} ${row.cumulative ? `+${Math.abs(row.cumulative)}` : ''}</title></circle>`).join('');
    const last = momentum[momentum.length - 1];
    const finalText = last.cumulative === 0 ? 'Tied' : `${last.cumulative > 0 ? teams[0].name : teams[1].name} +${Math.abs(last.cumulative)}`;
    const finalLabel = `<div class="ssp-momentum-result"><strong>Final:</strong> ${escapeHtml(finalText)}</div>`;
    const biggest = momentum.slice().sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin)).slice(0, 3).filter(row => row.margin);
    const swings = biggest.length ? `<div class="ssp-momentum-swings"><strong>${biggest.length === 1 ? 'Largest swing' : 'Key swings'}:</strong> ${biggest.map(row => `H${row.holeNumber} — ${Math.abs(row.margin)}-point swing to ${escapeHtml(row.margin > 0 ? teams[0].name : teams[1].name)}`).join(' · ')}</div>` : '';
    return `<div class="ssp-momentum print-keep-together"><div class="ssp-momentum-heading"><h3>SSP Momentum</h3>${finalLabel}</div><div class="export-section-sub">Cumulative SSP point margin by completed SSP hole. Above zero favors ${escapeHtml(teams[0].name)} · below zero favors ${escapeHtml(teams[1].name)}.</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="SSP cumulative point margin"><line x1="${padLeft}" y1="${zeroY}" x2="${width - padRight}" y2="${zeroY}" class="ssp-momentum-zero"/><line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="ssp-momentum-axis"/><text x="${padLeft - 8}" y="${padTop + 4}" text-anchor="end">+${max}</text><text x="${padLeft - 8}" y="${zeroY + 4}" text-anchor="end">0</text><text x="${padLeft - 8}" y="${height - padBottom + 4}" text-anchor="end">−${max}</text><polyline points="${points}" class="ssp-momentum-line" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${xLabels}</svg>${swings}</div>`;
  })() : '<div class="ssp-momentum-empty">SSP Momentum will appear after holes are scored.</div>';
  return `
    <section class="export-section export-section-ssp-summary">
      <div class="export-section-head">
        <h2>Sneaky / Sandy / Poley</h2>
        <div class="export-section-sub">${getRoundCompletionState(match, metrics).isIncomplete ? 'Provisional' : 'Final'} SSP team points, stakes, settlement, and hole-by-hole audit trail.</div>
      </div>
      <div class="game-summary-grid">
        ${totalRows}
        <div class="game-summary-card game-summary-card-accent">
          <div class="game-summary-title">Net</div>
          <div class="game-summary-value">${escapeHtml(leaderText)}</div>
          <div class="game-summary-sub">Thru ${Number(leader.thru || 0)} SSP hole(s)</div>
        </div>
        <div class="game-summary-card">
          <div class="game-summary-title">Stakes</div>
          <div class="game-summary-value">${escapeHtml(formatPositiveCurrency(pointValue, 2))}</div>
          <div class="game-summary-sub">per point</div>
        </div>
        <div class="game-summary-card span-2">
          <div class="game-summary-title">SSP Settlement</div>
          <div class="game-summary-value">${escapeHtml(ledger.settlement?.tied ? 'Tied' : leaderText)}</div>
          <div class="game-summary-sub">${ledger.settlement?.valid === false
            ? escapeHtml(ledger.settlement.label)
            : ledger.settlement?.tied
              ? 'No SSP money changes hands.'
              : `${escapeHtml(formatPositiveCurrency(ledger.settlement.perPlayerAmount, 2))} per player · ${escapeHtml(ledger.settlement.payerLabel)} · ${escapeHtml(ledger.settlement.payeeLabel)} · Total transferred: ${escapeHtml(formatPositiveCurrency(ledger.settlement.totalTransferred, 2))}`}</div>
        </div>
      </div>
      ${momentumHtml}
    </section>`;
}

function buildSneakySandyPoleyAuditDetail(match, metrics) {
  if (!isSneakySandyPoleyEnabled(match)) return '';
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  const teams = ledger?.teams || [];
  const countedHoles = Object.values(ledger?.holes || {}).filter(hole => hole?.counted);
  if (!ledger?.enabled || teams.length !== 2 || !countedHoles.length) return '';
  const rows = countedHoles.map(hole => {
    const base = teams.map(team => `${team.name} ${Number(hole.pointsAfterTakeKeepByTeam?.[team.id] || 0)}`).join(' / ');
    const final = teams.map(team => `${team.name} ${Number(hole.finalPointsByTeam?.[team.id] || 0)}`).join(' / ');
    const takeKeep = hole.takeKeep?.teamId ? `${formatSneakySandyPoleyTeamName(ledger, match, hole.takeKeep.teamId)} ${hole.takeKeep.type === 'take' ? 'Take +2' : 'Keep +1'}` : '—';
    const umbee = hole.umbee?.active ? `${formatSneakySandyPoleyTeamName(ledger, match, hole.umbee.teamId)} ${hole.umbee.reason}` : '—';
    const running = hole.runningLeader?.tied ? 'Tied' : `${formatSneakySandyPoleyTeamName(ledger, match, hole.runningLeader?.teamId)} +${Number(hole.runningLeader?.margin || 0)}`;
    return `<tr><td>${Number(hole.holeNumber) || ''}</td><td>${escapeHtml(base)}</td><td>${escapeHtml(takeKeep)}</td><td>${escapeHtml(hole.bridge?.label || '1x')}</td><td>${escapeHtml(umbee)}</td><td>${escapeHtml(final)}</td><td>${escapeHtml(running)}</td></tr>`;
  }).join('');
  return `<section class="export-section export-section-ssp-audit"><div class="export-section-head"><h2>SSP Hole-by-Hole Audit</h2><div class="export-section-sub">Counted SSP holes only; missing or pre-SSP holes are not fabricated.</div></div><div class="fit-stage" data-fit="width" data-fit-min="0.72"><div class="fit-box"><table class="export-table ssp-export-table"><thead><tr><th>Hole</th><th>Points Before Multiplier</th><th>Take/Keep</th><th>Multiplier</th><th>Umbee</th><th>Final Hole Total</th><th>Match</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
}

function decorateReportSections(html) {
  const appendixClasses = ['export-section-classic', 'export-section-leaderboards', 'export-section-ssp-audit', 'export-section-score-distribution', 'export-section-stat-tracking', 'export-section-gross-game-detail', 'export-section-settlement-audit', 'export-section-nine-point'];
  const denseClasses = ['export-section-leaderboards', 'export-section-ssp-audit', 'export-section-score-distribution', 'export-section-stat-tracking', 'export-section-gross-game-detail', 'export-section-classic'];
  return String(html || '').replace(/<section class="([^"]*\bexport-section\b[^"]*)"/g, (full, className) => {
    const appendix = appendixClasses.some(name => className.includes(name));
    const dense = denseClasses.some(name => className.includes(name));
    const classes = `${className} report-section report-section--${appendix ? 'appendix' : 'main'} report-section--${dense ? 'dense report-section--allow-break' : 'summary report-section--avoid-break'}`;
    return `<section class="${classes}" data-report-section-type="${appendix ? 'appendix' : 'main'}" data-report-section-density="${dense ? 'detail' : 'summary'}" data-report-print-priority="${appendix ? '2' : '1'}"`;
  });
}

function buildSummaryExportBody(match, metrics) {
  const roundRecord = buildRoundRecord(match, metrics);
  const completion = getRoundCompletionState(match, metrics);
  const unavailableStatPlayers = isStatTrackingEnabled(match) ? roundRecord.players.filter(player => !player.statLines) : [];
  const exportScoreDistributionHtml = buildExportScoreDistributionSummary(match, metrics);
  const exportStatTrackingHtml = buildExportStatTrackingSummary(match, metrics);
  const exportGrossGameDetailHtml = buildExportGrossGameDetailSummary(match, metrics);
  const exportRoundSnapshotHtml = buildRoundSnapshot(match, metrics, roundRecord);
  const exportSharedLedgerNoteHtml = buildSharedLedgerReportNote(match);
  const exportSspAuditHtml = buildSneakySandyPoleyAuditDetail(match, metrics);
  const showNinePoint = (match.selectedGames || []).some(g => g.key === 'nine_point');
  const exportNinePointScorecardHtml = showNinePoint ? `
    <section class="export-section export-section-nine-point export-section-nine-point-scorecard">
      <div class="export-section-head">
        <h2>9-Point Scorecard</h2>
        <div class="export-section-sub">Hole-by-hole 9-Point scoring and payout totals.</div>
      </div>
      <div class="fit-stage" data-fit="width" data-fit-min="0.72">
        <div class="fit-box">
          ${buildNinePointScorecard(match, metrics)}
        </div>
      </div>
    </section>` : '';
  const html = `
    ${exportRoundSnapshotHtml}
    ${buildRoundStorySection(match, metrics, roundRecord)}

    <section class="export-section export-section-net-payout">
      <div class="export-section-head">
        <h2>${getRoundCompletionState(match, metrics).isIncomplete ? (areAllGamesFinal(match, metrics) ? 'Final Net Settlement' : 'Net Settlement — Provisional') : 'Final Net Settlement'}</h2>
        ${getRoundCompletionState(match, metrics).isIncomplete ? `<div class="export-section-sub">${areAllGamesFinal(match, metrics) ? 'All selected games are mathematically determined despite unplayed holes.' : 'Based on completed holes only. Some game outcomes may still change.'}</div>` : ''}
      </div>
      ${roundRecord.transactions.length ? `<div class="round-record-settle round-record-settle--section">${roundRecord.transactions.map(row => `<span class="settle-up-chip">${escapeHtml(roundRecord.players.find(player => player.playerId === row.payerId)?.displayName || row.payerId)} → ${escapeHtml(roundRecord.players.find(player => player.playerId === row.payeeId)?.displayName || row.payeeId)} <strong>${formatMoneyAccounting(row.amount)}</strong></span>`).join('')}</div>` : '<div class="export-empty">No settlement yet.</div>'}
    </section>


    <section class="export-section export-section-games-summary">
      <div class="export-section-head">
        <h2>Game Drivers</h2>
        <div class="export-section-sub">Competition status, stakes, and current economic contribution.</div>
      </div>
      ${buildSelectedGamesSummary(match, metrics)}
    </section>

    <div class="export-appendix-label">Ledger / Audit Detail</div>
    <div class="report-layer report-layer--ledger">
    ${exportSharedLedgerNoteHtml}
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

    ${exportNinePointScorecardHtml}

    <section class="export-section export-section-leaderboards">
      <div class="export-section-head"><h2>Leaderboards</h2><div class="export-section-sub">Full player and team tables supporting the executive highlights.</div></div>
      <h3>Player leaderboard</h3>
      ${buildExportPlayerLeaderboard(match, metrics)}
      ${hasMultiPlayerTeam(metrics) ? `<div class="leaderboard-team-block"><h3>Team leaderboard</h3>${buildExportTeamLeaderboard(match, metrics)}</div>` : ''}
    </section>

    ${exportSspAuditHtml}

    ${completion.completedHoleCount >= 6 ? `<section class="export-section export-section-score-distribution">
      <div class="export-section-head">
        <h2>Score Distribution</h2>
        <div class="export-section-sub">Gross scores only; completed holes only. Missing holes are skipped, not estimated.</div>
      </div>
      ${exportScoreDistributionHtml}
    </section>` : ''}

    ${exportStatTrackingHtml ? `
    <section class="export-section export-section-stat-tracking">
      <div class="export-section-head">
        <h2>Stat Tracking Summary</h2>
        <div class="export-section-sub">Completed holes only.</div>
      </div>
      ${exportStatTrackingHtml}
    </section>` : ''}
    ${unavailableStatPlayers.length ? `<div class="export-audit-footnote">${unavailableStatPlayers.map(player => `${escapeHtml(player.displayName)} stat line unavailable and excluded from totals.`).join(' ')}</div>` : ''}

    ${exportGrossGameDetailHtml ? `
    <section class="export-section export-section-gross-game-detail">
      <div class="export-section-head">
        <h2>Game Payout Detail</h2>
      </div>
      ${exportGrossGameDetailHtml}
    </section>` : ''}

    <section class="export-section export-section-settlement-audit">
      <div class="export-section-head"><h2>Settlement Reconciliation</h2><div class="export-section-sub">Canonical balances, payments, and cross-foot audit.</div></div>
      ${buildExportFinalNetSettlementSummary(match, metrics)}
    </section>

    ${buildExportNotes()}
    </div>`;
  return decorateReportSections(html);
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
    .export-header-players { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .export-header-player-card { border: 1px solid var(--border); background: #fff; border-radius: 12px; padding: 8px 9px; min-width: 0; }
    .export-header-player-name { font-size: 12px; font-weight: 800; color: #243247; overflow-wrap: anywhere; }
    .export-header-player-meta { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 5px 10px; color: var(--muted); font-size: 10px; line-height: 1.3; }
    .export-header-player-meta strong { color: #243247; }
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
    .export-provisional-label {
      display: inline-block;
      margin: 8px 0 12px;
      padding: 7px 10px;
      border: 1px solid rgba(180,83,9,.28);
      border-radius: 999px;
      background: #fff7ed;
      color: #7c2d12;
      font-weight: 800;
      font-size: 12px;
    }
    .recap-highlights-grid { display: grid; gap: 12px; }
    @media (min-width: 860px) { .recap-highlights-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; } }
    .snapshot-grid, .round-awards-grid { display: grid; gap: 8px; }
    .snapshot-row, .round-award {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: baseline;
      gap: 12px;
      padding: 8px 10px;
      border: 1px solid rgba(12,55,33,.10);
      border-radius: 12px;
      background: #fff;
    }
    .snapshot-row .award-label, .round-award .award-label { color: var(--muted); font-weight: 800; padding-right: 6px; white-space: nowrap; }
    .snapshot-row strong, .round-award strong { text-align: left; padding-left: 2px; }
    .round-snapshot-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .round-snapshot-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 7px 10px; font-size: 10px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; border: 1px solid var(--border); }
    .round-snapshot-badge-complete { background: #edf7f1; color: #0b5d3b; border-color: rgba(11,93,59,.22); }
    .round-snapshot-badge-clinched { background: #eff6ff; color: #1d4ed8; border-color: rgba(29,78,216,.22); }
    .round-snapshot-badge-provisional { background: #fff7ed; color: #9a3412; border-color: rgba(154,52,18,.25); }
    .round-snapshot-hero { border: 1px solid rgba(11,93,59,.14); background: linear-gradient(180deg, #f8fbf9 0%, #fff 100%); border-radius: 16px; padding: 12px; margin-bottom: 10px; }
    .round-snapshot-kicker { color: var(--muted); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    .round-snapshot-title { margin-top: 5px; color: #172033; font-weight: 900; font-size: 17px; line-height: 1.16; letter-spacing: -.015em; }
    .round-snapshot-detail, .round-snapshot-players { margin-top: 6px; color: var(--muted); font-size: 11px; line-height: 1.35; }
    .round-snapshot-body { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(260px, .85fr); gap: 12px; align-items: start; }
    .round-snapshot-primary, .round-snapshot-secondary { min-width: 0; }
    .round-snapshot-section-title { margin-bottom: 7px; color: #243247; font-size: 11px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }
    .executive-driver-list { display: grid; gap: 6px; }
    .executive-driver-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; padding: 8px 9px; border-left: 3px solid var(--accent); background: #f8fbf9; border-radius: 0 10px 10px 0; }
    .executive-driver-row strong, .executive-driver-row span { display: block; }
    .executive-driver-row span, .executive-driver-row small { color: var(--muted); font-size: 10px; line-height: 1.3; }
    .executive-driver-impact { color: #243247; font-size: 11px; font-weight: 800; text-align: right; }
    .executive-driver-row small { grid-column: 1 / -1; }
    .round-snapshot-grid { display: grid; grid-template-columns: 1fr; gap: 7px; }
    .round-snapshot-row, .round-snapshot-award { border: 1px solid var(--border); background: #fff; border-radius: 13px; padding: 9px 10px; min-width: 0; }
    .round-snapshot-row span, .round-snapshot-award span, .round-snapshot-recap-teaser span { display: block; color: var(--muted); font-weight: 850; font-size: 10px; text-transform: uppercase; letter-spacing: .045em; margin-bottom: 4px; }
    .round-snapshot-row strong, .round-snapshot-award strong { font-size: 12px; line-height: 1.25; overflow-wrap: anywhere; }
    .round-snapshot-awards { margin-top: 11px; border-top: 1px solid var(--border); padding-top: 10px; }
    .round-snapshot-awards-title { font-size: 11px; font-weight: 900; color: #243247; margin-bottom: 7px; text-transform: uppercase; letter-spacing: .05em; }
    .round-snapshot-takeaways { margin-top: 10px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 13px; background: #f8fbf9; }
    .round-snapshot-takeaways ul { margin: 5px 0 0; padding-left: 17px; display: grid; gap: 3px; font-size: 11px; }
    .round-snapshot-awards-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
    .round-snapshot-recap-teaser, .empty-state-card { margin-top: 10px; border: 1px dashed var(--border-strong); border-radius: 13px; padding: 10px; background: #fbfcfd; color: var(--muted); font-size: 11px; line-height: 1.38; }
    .ssp-momentum { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 13px; background: #fff; color: var(--accent); break-inside: avoid; page-break-inside: avoid; }
    .ssp-momentum-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .ssp-momentum h3 { margin: 0; color: var(--text); }
    .ssp-momentum-result { color: var(--text); font-size: 12px; white-space: nowrap; }
    .ssp-momentum svg { display: block; width: 100%; max-height: 210px; margin-top: 7px; overflow: visible; }
    .ssp-momentum text { font-size: 11px; fill: var(--muted); }
    .ssp-momentum-zero { stroke: #7b8794; stroke-width: 1; stroke-dasharray: 4 4; }
    .ssp-momentum-axis { stroke: #c8d2cc; stroke-width: 1; }
    .ssp-momentum-line { fill: none !important; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .ssp-momentum-dot { fill: #fff; stroke: var(--accent); stroke-width: 3; }
    .ssp-momentum-swings { margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.4; }
    .ssp-momentum-empty { margin-top: 12px; padding: 10px; border: 1px dashed var(--border); border-radius: 10px; color: var(--muted); }
    .leaderboard-team-block { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border); }
    .print-keep-together { break-inside: avoid; page-break-inside: avoid; }
    .export-note-block {
      font-size: 12px;
      line-height: 1.45;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .export-round-recap-text {
      font-size: 14px;
      line-height: 1.48;
      white-space: normal;
      overflow-wrap: anywhere;
      color: #243247;
    }
    .export-round-recap-text p,
    .round-recap-preview p {
      margin: 0 0 0.72em;
    }
    .export-round-recap-text p:last-child,
    .round-recap-preview p:last-child {
      margin-bottom: 0;
    }
    .round-recap-notes-field {
      width: 100%;
      margin-top: 10px;
    }
    .round-recap-notes-field label {
      display: block;
      font-size: 12px;
      font-weight: 800;
      color: #243247;
      margin-bottom: 4px;
    }
    .round-recap-notes-field textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
      margin-top: 6px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 11px;
      font: inherit;
      font-size: 13px;
      line-height: 1.35;
      color: #243247;
      background: #fff;
    }
    .round-recap-notes-field textarea:focus {
      outline: 2px solid rgba(22, 101, 52, 0.18);
      border-color: rgba(22, 101, 52, 0.45);
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
    .export-momentum-pending { margin-top: 9px; color: var(--muted); font-size: 11px; }
    .export-appendix-label { margin: 16px 0 8px; padding-top: 10px; border-top: 2px solid var(--border-strong); color: var(--muted); font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; break-after: avoid-page; page-break-after: avoid; }
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
    .settlement-balance-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .settlement-balance-group { min-width: 0; }
    .settlement-balance-title { margin-bottom: 6px; color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
    .settlement-even-line { color: var(--muted); font-size: 10px; }
    .final-net-settlement-list { display: grid; gap: 5px; }
    .final-net-settlement-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 9px; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
    .final-net-settlement-player { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .final-net-settlement-amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .final-net-settlement-crossfoot { font-size: 10px; text-align: right; color: #65758b; font-variant-numeric: tabular-nums; }
    .gross-game-detail-body { display: grid; gap: 11px; }
    .gross-game-player-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
    .gross-game-player-card, .gross-game-section { border: 1px solid var(--border); border-radius: 14px; background: #fff; padding: 9px; display: grid; gap: 7px; }
    .gross-game-player-name, .gross-game-section-title { font-weight: 800; color: #243247; }
    .gross-game-card-lines, .gross-game-section-lines { display: grid; gap: 5px; }
    .gross-game-card-line, .gross-game-card-total { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; font-variant-numeric: tabular-nums; }
    .gross-game-card-line span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
    .gross-game-card-total { border-top: 1px solid var(--border); padding-top: 7px; font-weight: 800; }
    .gross-game-detail-list { display: grid; gap: 9px; }
    .gross-game-payment-row { font-size: 11px; line-height: 1.35; color: #334155; }
    .gross-game-section-total { font-size: 10px; color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
    @media (max-width: 760px) { .gross-game-player-cards { grid-template-columns: 1fr; } }
    
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
    .score-birdie { text-decoration: none; }
    .payout-total-positive { color: #0b6b3e; }
    .payout-total-negative { color: #9f1d1d; }
    strong { font-weight: 800; }
    .report-section--main { border-left-color: rgba(11,93,59,.28); }
    .report-section--appendix { box-shadow: none; background: #fcfdff; }
    .report-section--avoid-break { break-inside: avoid-page; page-break-inside: avoid; }
    .report-section--allow-break { break-inside: auto; page-break-inside: auto; }
    .report-section--major { break-before: auto; }

    .export-section-round-snapshot,
    .export-section-games-summary,
    .export-section-round-recap,
    .export-section-net-payout,
    .export-section-player-leaderboard,
    .export-section-team-leaderboard,
    .export-section-momentum,
    .export-section-score-distribution,
    .export-section-stat-tracking,
    .export-section-gross-game-detail,
    .export-section-nine-point,
    .export-section-notes,
    .gross-game-player-card,
    .gross-game-section,
    .game-summary-card,
    .match-status-tile,
    .final-net-settlement-card,
    .export-pill-grid,
    .export-table {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .export-section-gross-game-detail {
      break-before: auto;
      page-break-before: auto;
    }
    .export-page-break {
      display: block;
      height: 0;
      margin: 0;
      padding: 0;
      border: 0;
      break-before: page;
      page-break-before: always;
    }
    .export-force-page-before {
      break-before: page !important;
      page-break-before: always !important;
    }
    .export-section-round-recap { break-inside: auto; page-break-inside: auto; }
    .nine-point-scorecard-table th:nth-child(2),
    .nine-point-scorecard-table td:nth-child(2) {
      position: static !important;
      left: auto !important;
      z-index: auto !important;
      box-shadow: none !important;
      text-align: center !important;
    }
    .nine-point-scorecard-wrap::before,
    .nine-point-scorecard-wrap::after {
      display: none !important;
    }
    .report-layer { position: relative; }
    .report-layer--hero { background: linear-gradient(145deg, #0b3325 0%, #0b5d3b 62%, #174b38 100%); color: #fff; border: 0; padding: 22px; overflow: hidden; }
    .round-record-masthead { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; font-size:11px; color:rgba(255,255,255,.78); }
    .round-record-brand { font-size:14px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; color:#fff; margin-bottom:4px; }
    .round-record-result { margin-top:22px; font-size:30px; line-height:1.05; font-weight:900; letter-spacing:-.035em; max-width:760px; }
    .round-record-storyline { margin-top:9px; max-width:780px; font-size:14px; line-height:1.45; color:rgba(255,255,255,.9); }
    .round-record-momentum { margin-top:16px; background:rgba(255,255,255,.96); color:var(--text); border-radius:14px; padding:11px 13px 4px; }
    .round-record-momentum-head { display:flex; justify-content:space-between; gap:12px; font-size:12px; }
    .round-record-momentum svg { width:100%; height:145px; display:block; }
    .round-record-momentum text { font-size:10px; fill:#526071; }
    .round-record-momentum-pending { margin-top:16px; padding:12px; border:1px solid rgba(255,255,255,.25); border-radius:12px; color:rgba(255,255,255,.86); }
    .round-record-turning { margin-top:12px; display:grid; gap:4px; padding:10px 12px; border-left:3px solid #bfe8cf; background:rgba(255,255,255,.1); border-radius:0 10px 10px 0; }
    .round-record-turning span { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:rgba(255,255,255,.7); }
    .round-record-settle { display:flex; flex-wrap:wrap; gap:7px; margin-top:13px; }
    .settle-up-chip { display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.12); color:inherit; padding:7px 10px; border-radius:999px; font-size:11px; white-space:nowrap; }
    .round-record-settle--section .settle-up-chip { color:var(--text); background:var(--accent-soft); border-color:#c8dfd1; }
    .round-record-reconcile { margin-top:7px; font-size:10px; color:rgba(255,255,255,.65); }
    .round-record-footer { margin-top:16px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18); display:flex; flex-wrap:wrap; gap:6px 16px; font-size:10px; color:rgba(255,255,255,.78); }
    .export-section-round-story { padding:20px; }
    .round-story-heading h2 { margin:3px 0 5px; font-size:27px; letter-spacing:-.035em; }
    .round-story-dek { font-size:14px; font-weight:650; color:#344258; max-width:780px; }
    .round-story-copy { font-family:Georgia, serif; font-size:14px; line-height:1.6; max-width:820px; }
    .round-story-capsules ul { margin:8px 0 0; padding-left:18px; columns:2; column-gap:28px; }
    .round-story-capsules li { break-inside:avoid; margin-bottom:5px; font-size:11px; }
    .round-story-awards { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
    .round-story-awards h3 { width:100%; margin:0; }
    .round-story-awards span { padding:6px 8px; background:var(--ink-soft); border:1px solid var(--border); border-radius:8px; font-size:10px; }
    .report-layer--ledger { break-before:page; page-break-before:always; }
    .export-section-net-payout { padding:12px 14px; }
    .export-section-net-payout .export-section-head { margin-bottom:4px; }
    @media print {
      .export-page-break-before-gross-game-detail {
        display: block !important;
        break-before: page !important;
        page-break-before: always !important;
      }
      .export-force-page-before {
        break-before: page !important;
        page-break-before: always !important;
      }
      .export-section-gross-game-detail {
        break-before: auto;
        page-break-before: auto;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .export-section-settlement-audit {
        break-before: page !important;
        page-break-before: always !important;
      }
      .export-section-head {
        break-after: avoid;
        page-break-after: avoid;
      }
      .gross-game-player-card,
      .gross-game-section,
      .gross-game-payment-row,
      .final-net-settlement-row,
      .game-summary-card,
      .export-pill {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .score-birdie {
        text-decoration: none !important;
      }
    }

    @media (max-width: 760px) {
      .export-pill-grid, .match-status-grid, .game-summary-grid, .stat-summary-grid, .round-snapshot-awards-grid, .export-header-players { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .round-snapshot-body, .settlement-balance-grid { grid-template-columns: 1fr; }
      .round-snapshot-head { display: grid; }
      .round-snapshot-badge { justify-self: start; }
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
      .export-header-players { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; break-inside: avoid-page; page-break-inside: avoid; }
      .export-header-player-card { padding: 6px 7px; break-inside: avoid-page; page-break-inside: avoid; }
      .export-header-player-name { font-size: 10px; }
      .export-header-player-meta { font-size: 8.5px; gap: 3px 7px; }
      .export-section {
        padding: 10px 0;
        margin-bottom: 10px;
        break-inside: avoid-page;
        page-break-inside: avoid;
        break-before: auto;
        page-break-before: auto;
        min-height: 0;
      }
      .export-section-round-snapshot,
      .export-section-net-payout,
      .export-section-games-summary,
      .export-section-classic-summary,
      .export-section-nine-point,
      .export-section-notes {
        break-inside: auto;
        page-break-inside: auto;
      }
      .export-section-round-recap,
      .export-section-ssp-summary,
      .export-section-ssp-audit,
      .export-section-leaderboards,
      .export-section-score-distribution,
      .export-section-stat-tracking,
      .export-section-gross-game-detail {
        break-inside: auto;
        page-break-inside: auto;
      }
      .export-section-classic-summary {
        break-before: page;
        page-break-before: always;
        break-after: page;
        page-break-after: always;
      }
      .export-section-round-recap {
        break-before: page;
        page-break-before: always;
      }
      .round-snapshot-recap-teaser { display: none !important; }
      .ssp-momentum-line { fill: none !important; stroke: #0b5d3b !important; }
      .ssp-momentum-dot { fill: #fff !important; stroke: #0b5d3b !important; }
      .export-section-ssp-audit { break-before: page; page-break-before: always; }
      .export-section-leaderboards h3 { break-after: avoid; page-break-after: avoid; }
      .export-section-head h2 { font-size: 13px; }
      .export-section-sub, .match-status-meta, .game-summary-sub, .tiny, .scorecard-sub { font-size: 9px; }
      .match-status-grid, .game-summary-grid, .stat-summary-grid, .round-snapshot-grid, .round-snapshot-awards-grid { gap: 6px; }
      .round-snapshot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .round-snapshot-body { grid-template-columns: minmax(0, 1.35fr) minmax(230px, .85fr); gap: 8px; }
      .round-snapshot-secondary .round-snapshot-grid { grid-template-columns: 1fr; }
      .round-snapshot-awards-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .round-snapshot-hero { padding: 9px; }
      .round-snapshot-title { font-size: 13px; }
      .match-status-tile, .game-summary-card, .stat-summary-card, .gross-game-player-card, .gross-game-section, .export-pill {
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
      .round-snapshot-row, .round-snapshot-award, .round-snapshot-recap-teaser, .empty-state-card { padding: 7px; }
      .round-snapshot-row strong, .round-snapshot-award strong { font-size: 10px; }
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
      ${requestedView === 'summary' ? buildExportHeaderPlayers(match, metrics) : ''}
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
      function reserveFirstPageForRecap() {
        const recap = document.querySelector('.export-section-round-recap');
        const games = document.querySelector('.export-section-games-summary-after-recap');
        if (!recap || !games) return;
        games.classList.remove('export-force-page-before');
        const printableHeight = getPrintablePageHeightPx();
        const header = document.querySelector('.export-header');
        const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const recapHeight = Math.ceil(recap.getBoundingClientRect().height || recap.offsetHeight || 0);
        const gamesHeight = Math.ceil(games.getBoundingClientRect().height || games.offsetHeight || 0);
        const buffer = SECTION_GAP_PX * 3;
        if (headerHeight + recapHeight + gamesHeight + buffer > printableHeight) {
          games.classList.add('export-force-page-before');
        }
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
        reserveFirstPageForRecap();
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

async function openUnifiedExport(match, printView = 'summary') {
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
  exportWindow.document.open();
  exportWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing Match Summary</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;"><strong>Reconciling shared scores...</strong><div style="margin-top:8px;color:#5a667a;">Pulling latest shared scores before creating the summary.</div></body></html>');
  exportWindow.document.close();
  if (match.storageMode === 'shared' && printView !== 'scorecard') {
    await reconcileSharedMatchBeforeSummary(match, { silent: false });
  }
  const refreshedMetrics = computeMatchMetrics(match) || metrics;
  const exportHtml = buildUnifiedExportDocument(match, refreshedMetrics, printView);
  try {
    const versionQuery = String(APP_VERSION || '').replace(/^v/i, '');
    const basePath = window.location.pathname || '/';
    exportWindow.history.replaceState(null, '', `${window.location.origin}${basePath}?v=${encodeURIComponent(versionQuery)}`);
  } catch (err) {}
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
    scoringAccessMode: normalizeScoringAccessMode(overrides.scoringAccessMode || overrides.scoreEntryMode || 'single_device'),
    scoreEntryMode: getLegacyScoreEntryMode(normalizeScoringAccessMode(overrides.scoringAccessMode || overrides.scoreEntryMode || 'single_device')),
    officialScorerName: String(overrides.officialScorerName || 'Official scorer').trim() || 'Official scorer',
    statTrackingEnabled: !!overrides.statTrackingEnabled,
    smartScoreAdvanceEnabled: overrides.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!overrides.smartScoreAdvanceEnabled,
    smartScoreAdvancePreset: normalizeSmartScoreAdvancePreset(overrides.smartScoreAdvancePreset),
    statTrackingPlayerIds: Array.isArray(overrides.statTrackingPlayerIds) ? overrides.statTrackingPlayerIds.map(String) : null,
    selectedGames: Array.isArray(overrides.selectedGames) ? overrides.selectedGames : [],
    status: 'active',
    completedAt: null,
    roundTiming: overrides.roundTiming || { startedAt: null, endedAt: null },
    players: Array.isArray(overrides.players) ? overrides.players : [],
    greeniesWinners: {},
    storageMode: 'local',
    sharedMatchId: '',
    sharedMatchRef: '',
    cloudSyncState: 'local-only',
    notes: '',
    roundRecapNotes: '',
    roundContext: normalizeRoundContext(overrides.roundContext || {}),
    sharedMatchCode: '',
    sharedHostDeviceId: '',
    sharedHostParticipantId: '',
    sharedDevices: [],
    sharedParticipants: [],
    sharedPlayerAssignments: {},
    sessionId: overrides.sessionId || overrides.id || uid(),
    sessionName: overrides.sessionName || 'Session',
    sessionCreatedAt: overrides.sessionCreatedAt || new Date().toISOString(),
    roundNumber: Number(overrides.roundNumber) || 1,
    previousRoundId: overrides.previousRoundId || '',
    startedFromPriorRoundId: overrides.startedFromPriorRoundId || ''
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

function mergeRoundNoteText(primary, legacy) {
  const cleanPrimary = String(primary || '').trim();
  const cleanLegacy = String(legacy || '').trim();
  if (!cleanPrimary) return cleanLegacy;
  if (!cleanLegacy) return cleanPrimary;
  if (cleanPrimary === cleanLegacy || cleanPrimary.includes(cleanLegacy)) return cleanPrimary;
  if (cleanLegacy.includes(cleanPrimary)) return cleanLegacy;
  return `${cleanPrimary}

Legacy Notes:
${cleanLegacy}`;
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
  match.roundTiming = match.roundTiming && typeof match.roundTiming === 'object' ? match.roundTiming : {};
  match.roundTiming.startedAt = match.roundTiming.startedAt || match.roundStartedAt || null;
  match.roundTiming.endedAt = match.roundTiming.endedAt || match.roundEndedAt || match.completedAt || null;
  match.scoringAccessMode = normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'single_device');
  match.scoreEntryMode = getLegacyScoreEntryMode(match.scoringAccessMode);
  match.officialScorerName = String(match.officialScorerName || 'Official scorer').trim() || 'Official scorer';
  match.teamNames = Array.isArray(match.teamNames) ? match.teamNames : [];
  match.teamScorers = buildTeamScorerAssignments(Number(match.teamCount) || Math.max(1, match.teamNames.length || 1), match.teamNames, match.teamScorers);
  match.activeScoreRole = match.activeScoreRole || (match.scoringAccessMode === 'assigned_players' ? 'assigned_player_scorer' : 'official_scorer');
  if (match.scoringAccessMode === 'single_device' && (match.activeScoreRole === 'team_scorer' || match.activeScoreRole === 'assigned_player_scorer')) match.activeScoreRole = 'official_scorer';
  match.activeScoreTeam = Math.min(Math.max(1, Number(match.activeScoreTeam) || 1), Math.max(1, Number(match.teamCount) || 1));
  match.statTrackingEnabled = !!match.statTrackingEnabled;
  match.smartScoreAdvanceEnabled = match.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!match.smartScoreAdvanceEnabled;
  match.smartScoreAdvancePreset = normalizeSmartScoreAdvancePreset(match.smartScoreAdvancePreset);
  match.players = Array.isArray(match.players) ? match.players : [];
  match.players = match.players.map((mp, idx) => ({
    playerId: mp.playerId,
    team: Number(mp.team) || 1,
    slot: Number.isFinite(Number(mp.slot)) ? Number(mp.slot) : idx,
    teeId: mp.teeId || match.teeId || '',
    scores: Array.isArray(mp.scores) && mp.scores.length ? mp.scores.map((s, scoreIdx) => ({ holeNumber: scoreIdx + 1, gross: Number(s.gross) || null })) : buildEmptyScores(match.holeCount),
    stats: Array.isArray(mp.stats) && mp.stats.length ? mp.stats.map((s, statIdx) => normalizeHoleStat(s, statIdx)) : buildEmptyStats(match.holeCount),
  }));
  match.selectedGames = normalizeSelectedGamesOrder(Array.isArray(match.selectedGames) ? match.selectedGames.map(game => game?.key === 'sneaky_sandy_poley' ? normalizeSneakySandyPoleyConfig(game) : game).filter(Boolean) : []);
  normalizeSneakySandyPoleyInputs(match);
  normalizeStatTrackingParticipants(match);
  match.greeniesWinners = match.greeniesWinners && typeof match.greeniesWinners === 'object' ? match.greeniesWinners : {};
  match.greeniesSuggestions = match.greeniesSuggestions && typeof match.greeniesSuggestions === 'object' ? match.greeniesSuggestions : {};
  match.sharedHostScoreOverrides = match.sharedHostScoreOverrides && typeof match.sharedHostScoreOverrides === 'object' ? match.sharedHostScoreOverrides : {};
  match.matchStatusGame = match.matchStatusGame || getDefaultFeaturedGameKey(match.selectedGames || []);
  match.momentumGame = match.momentumGame || match.matchStatusGame || getDefaultFeaturedGameKey(match.selectedGames || []);
  match.storageMode = match.storageMode === 'shared' ? 'shared' : 'local';
  match.sharedMatchId = String(match.sharedMatchId || match.id || '');
  match.cloudSyncState = String(match.cloudSyncState || (match.storageMode === 'shared' ? 'local-cache' : 'local-only'));
  match.lastCloudSyncAt = match.lastCloudSyncAt || null;
  match.lastSharedSyncAttemptAt = match.lastSharedSyncAttemptAt || null;
  match.lastSharedScorePullAt = match.lastSharedScorePullAt || null;
  match.lastSharedScorePushAt = match.lastSharedScorePushAt || null;
  match.lastSharedParityCheckAt = match.lastSharedParityCheckAt || null;
  match.sharedLedgerParity = match.sharedLedgerParity && typeof match.sharedLedgerParity === 'object' ? match.sharedLedgerParity : null;
  match.sharedSspBaseline = match.sharedSspBaseline && typeof match.sharedSspBaseline === 'object' ? match.sharedSspBaseline : null;
  match.sharedSspConflicts = Array.isArray(match.sharedSspConflicts) ? match.sharedSspConflicts : [];
  match.sharedSspSyncState = String(match.sharedSspSyncState || (isSneakySandyPoleyEnabled(match) && match.storageMode === 'shared' ? 'pending' : 'not-applicable'));
  match.lastSharedSyncError = String(match.lastSharedSyncError || '');
  match.sharedOwnerUserId = match.sharedOwnerUserId || null;
  match.sharedMatchRef = match.sharedMatchRef || match.sharedMatchId || match.id;
  match.sharedMatchCode = normalizeMatchCode(match.sharedMatchCode || match.sharedMatchRef || match.sharedMatchId || '');
  match.sharedHostDeviceId = match.sharedHostDeviceId || '';
  match.sharedHostParticipantId = match.sharedHostParticipantId || '';
  match.sharedDevices = Array.isArray(match.sharedDevices) ? match.sharedDevices : [];
  match.sharedParticipants = Array.isArray(match.sharedParticipants) ? match.sharedParticipants : [];
  match.sharedPlayerAssignments = match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object' ? match.sharedPlayerAssignments : {};
  match.sessionId = String(match.sessionId || match.id || uid());
  match.sessionName = String(match.sessionName || 'Session');
  match.sessionCreatedAt = match.sessionCreatedAt || match.date || todayIso();
  match.roundNumber = Math.max(1, Number(match.roundNumber) || 1);
  match.previousRoundId = String(match.previousRoundId || '');
  match.startedFromPriorRoundId = String(match.startedFromPriorRoundId || '');
  if (match.storageMode === 'shared') ensureSharedParticipantRegistered(match, match.sharedHostDeviceId ? '' : 'Host Device');
  if (match.scoringAccessMode === 'assigned_players') {
    const localDeviceId = getSharedDeviceId();
    if (!match.sharedHostDeviceId) match.sharedHostDeviceId = localDeviceId;
    const hostParticipantId = match.sharedHostParticipantId || getCurrentSharedParticipantId(match);
    match.players.forEach(mp => { if (!match.sharedPlayerAssignments[mp.playerId]) match.sharedPlayerAssignments[mp.playerId] = hostParticipantId; });
    migrateSharedPlayerAssignmentsToParticipants(match);
  }
  match.roundRecap = typeof match.roundRecap === 'string' ? match.roundRecap : '';
  match.roundRecapGenerated = typeof match.roundRecapGenerated === 'string' ? match.roundRecapGenerated : match.roundRecap;
  match.roundRecapFinal = typeof match.roundRecapFinal === 'string' ? match.roundRecapFinal : '';
  match.roundRecapGeneratedAt = match.roundRecapGeneratedAt || null;
  match.roundRecapStatus = typeof match.roundRecapStatus === 'string' ? match.roundRecapStatus : '';
  match.roundEndReason = String(match.roundEndReason || '').trim();
  match.roundCompletionState = match.roundCompletionState && typeof match.roundCompletionState === 'object' ? match.roundCompletionState : null;
  match.roundContext = normalizeRoundContext(match.roundContext);
  match.playedHoleOrder = Array.isArray(match.playedHoleOrder) ? [...new Set(match.playedHoleOrder.map(Number).filter(n => Number.isFinite(n) && n > 0))] : [];
  match.holeFirstCompletedAt = match.holeFirstCompletedAt && typeof match.holeFirstCompletedAt === 'object' ? match.holeFirstCompletedAt : {};
  match.notes = typeof match.notes === 'string' ? match.notes : '';
  match.roundRecapNotes = mergeRoundNoteText(match.roundRecapNotes, match.notes);
  match.notes = match.roundRecapNotes;
  match.memories = Array.isArray(match.memories) ? match.memories.map(normalizeRoundMemory).filter(Boolean) : [];
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
    c.lastPlayedAt = String(c.lastPlayedAt || c.lastUsedAt || '').slice(0, 10);
    c.strokeIndexes = getCourseStrokeTemplate(c);
    c.tees = Array.isArray(c.tees) ? c.tees : [];
    c.tees.forEach(t => normalizeTee(t, c.name));
    if (!c.strokeIndexes) {
      const seeded = c.tees.map(t => extractStrokeTemplate(t.holes)).find(Boolean);
      if (seeded) c.strokeIndexes = seeded;
    }
  });
  state.matches.forEach(normalizeMatch);
  if (state.notes && state.activeMatchId) {
    const activeForNotes = state.matches.find(m => m.id === state.activeMatchId);
    if (activeForNotes && !String(activeForNotes.roundRecapNotes || '').trim()) {
      activeForNotes.roundRecapNotes = String(state.notes || '').trim();
      activeForNotes.notes = activeForNotes.roundRecapNotes;
    }
  }
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
function holeMetadataMatches(a, b) {
  if (!a || !b) return false;
  const ay = Number(a.yardage) || 0;
  const by = Number(b.yardage) || 0;
  const ap = Number(a.par) || 0;
  const bp = Number(b.par) || 0;
  const asi = Number(a.strokeIndex) || 0;
  const bsi = Number(b.strokeIndex) || 0;
  return ay > 0 && by > 0 && ay === by && (!ap || !bp || ap === bp) && (!asi || !bsi || asi === bsi);
}
function getHoleByNumberOrIndex(tee, holeNumber, holeIdx) {
  const holes = Array.isArray(tee?.holes) ? tee.holes : [];
  return holes.find(row => Number(row?.holeNumber) === Number(holeNumber)) || holes[holeIdx] || null;
}
function getNonComboSourceTeeCandidates(courseId, targetTee) {
  const course = getCourse(courseId);
  const all = Array.isArray(course?.tees) ? course.tees : [];
  return all.filter(t => t && t.id !== targetTee?.id && !t.isCombo && Array.isArray(t.holes) && t.holes.length);
}
function inferComboSourceTeeName(courseId, comboTee, holeIdx) {
  const course = getCourse(courseId);
  const comboHole = comboTee?.holes?.[holeIdx];
  if (!course || !comboHole) return '';
  const displayHoleNumber = Number(comboHole.holeNumber) || holeIdx + 1;
  const matches = getNonComboSourceTeeCandidates(courseId, comboTee).filter(t => holeMetadataMatches(getHoleByNumberOrIndex(t, displayHoleNumber, holeIdx), comboHole));
  return matches.length === 1 ? (matches[0]?.teeName || '') : '';
}
function inferFlattenedComboSourceTeeName(courseId, tee, holeIdx) {
  if (!tee || tee.isCombo) return '';
  const targetHoles = Array.isArray(tee.holes) ? tee.holes : [];
  if (!targetHoles.length) return '';
  const teeNameText = String(tee.teeName || '').trim().toLowerCase();
  const nameCandidates = getNonComboSourceTeeCandidates(courseId, tee).filter(t => {
    const name = String(t?.teeName || '').trim().toLowerCase();
    return name && teeNameText.includes(name);
  });
  if (nameCandidates.length < 2) return '';
  const resolvedByHole = targetHoles.map((targetHole, idx) => {
    const displayHoleNumber = Number(targetHole?.holeNumber) || idx + 1;
    const matches = nameCandidates.filter(t => holeMetadataMatches(getHoleByNumberOrIndex(t, displayHoleNumber, idx), targetHole));
    return matches.length === 1 ? matches[0] : null;
  });
  if (resolvedByHole.some(row => !row)) return '';
  const distinctIds = new Set(resolvedByHole.map(t => t.id));
  if (distinctIds.size < 2) return '';
  return resolvedByHole[holeIdx]?.teeName || '';
}
function getComboSourceTeeName(courseId, comboTee, holeIdx, courseOverride = null) {
  if (!comboTee?.isCombo) return '';
  const displayHoleNumber = Number(comboTee.holes?.[holeIdx]?.holeNumber) || holeIdx + 1;
  const source = Array.isArray(comboTee.comboSources)
    ? (comboTee.comboSources.find(row => Number(row?.holeNumber) === displayHoleNumber) || comboTee.comboSources[holeIdx])
    : null;
  const sourceId = source?.sourceTeeId || '';
  if (sourceId) {
    const sourceTee = (courseOverride?.tees || []).find(t => String(t?.id || '') === String(sourceId)) || getTee(courseId, sourceId) || (getCourse(courseId)?.tees || []).find(t => String(t?.id || '') === String(sourceId));
    if (sourceTee?.teeName) return sourceTee.teeName;
  }
  return inferComboSourceTeeName(courseId, comboTee, holeIdx);
}
function getHoleTeeNameForDisplay(courseId, tee, holeIdx, courseOverride = null) {
  if (!tee) return '';
  if (tee.isCombo) return getComboSourceTeeName(courseId, tee, holeIdx, courseOverride) || '';
  return inferFlattenedComboSourceTeeName(courseId, tee, holeIdx) || tee.teeName || '';
}
function formatComboHoleTeeIndicator(courseId, comboTee, holeIdx, prefix = 'Tee') {
  const teeName = comboTee?.isCombo ? getComboSourceTeeName(courseId, comboTee, holeIdx) : inferFlattenedComboSourceTeeName(courseId, comboTee, holeIdx);
  return teeName ? `${prefix}: ${teeName}` : '';
}
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
  const course = getMatchCourse(match);
  const tee = getMatchTee(match, match.teeId);
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
      const leaderboardStrokes = holePostingStrokeAllowance(strokeIndex, p.courseHdcp);
      const postableLimit = playerPar + 2 + postingStrokes;
      const postable = gross ? Math.min(gross, postableLimit) : null;
      const net = gross ? gross - strokes : null;
      const leaderboardNet = gross ? gross - leaderboardStrokes : null;
      return { playerId: p.playerId, team: p.team, gross, net, strokes, leaderboardNet, leaderboardStrokes, par: playerPar, teeId: p.teeId, postingStrokes, postableLimit, postable };
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
    const leaderboardNetTotal = scoredHoles.reduce((sum, s) => sum + (Number.isFinite(Number(s.leaderboardNet)) ? Number(s.leaderboardNet) : (s.gross || 0)), 0);
    const totalPar = scoredHoles.reduce((sum, s) => sum + (Number(s.par) || 0), 0);
    const toPar = grossTotal - totalPar;
    const netDiff = netTotal - totalPar;
    const leaderboardNetDiff = leaderboardNetTotal - totalPar;
    const skins = holeResults.filter(h => h.completed && h.indivWinners.length === 1 && h.indivWinners[0] === p.playerId).length;
    return {
      ...p,
      grossTotal,
      postableTotal,
      netTotal,
      leaderboardNetTotal,
      totalPar,
      toPar,
      netDiff,
      leaderboardNetDiff,
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
  const bestPlayerNet = playersWithTotals.slice().sort((a, b) => a.leaderboardNetDiff - b.leaderboardNetDiff || a.grossTotal - b.grossTotal)[0];
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
    courseSource: match.courseSnapshot ? 'round-snapshot' : 'legacy-library-fallback',
    teeFallbackUsed: !!match.teeId && String(tee?.id || '') !== String(match.teeId),
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



function getSinglesMatchConfig(match) {
  return (Array.isArray(match?.selectedGames) ? match.selectedGames : []).find(g => g.key === 'singles_match') || null;
}
function isSinglesMatchPlayEligible(match, metrics = null) {
  const teams = Array.isArray(metrics?.teams) && metrics.teams.length ? metrics.teams : null;
  if (teams) return teams.length === 2 && teams.every(t => Array.isArray(t.members) && t.members.length === 1);
  const players = Array.isArray(match?.players) ? match.players : [];
  const teamNos = [...new Set(players.map(p => Number(p.team) || 1))];
  if (teamNos.length !== 2) return false;
  return teamNos.every(teamNo => players.filter(p => (Number(p.team) || 1) === teamNo).length === 1);
}
function getSinglesMatchPlayers(match, metrics = null) {
  if (!isSinglesMatchPlayEligible(match, metrics)) return null;
  if (Array.isArray(metrics?.teams) && metrics.teams.length === 2) {
    const teams = metrics.teams.slice().sort((a, b) => Number(a.team) - Number(b.team));
    return { teamA: teams[0], teamB: teams[1], playerA: teams[0].members[0], playerB: teams[1].members[0] };
  }
  const players = (match?.players || []).slice().sort((a, b) => (Number(a.team) || 1) - (Number(b.team) || 1));
  const teamA = { team: Number(players[0]?.team) || 1, members: [players[0]] };
  const teamB = { team: Number(players[1]?.team) || 2, members: [players[1]] };
  return { teamA, teamB, playerA: players[0], playerB: players[1] };
}
function formatSinglesStakeLabel(result) {
  const stake = formatMoneyAccounting(result?.stake || 0);
  return result?.stakeType === 'per_hole' ? `${stake} per hole` : `${stake} Match`;
}
function computeSinglesMatchPlayResult(match, metrics, cfg = null) {
  const config = cfg || getSinglesMatchConfig(match) || { basis: 'net', stakeType: 'match', stake: 0 };
  const basis = String(config.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
  const stakeType = String(config.stakeType || config.payoutType || 'match').toLowerCase() === 'per_hole' ? 'per_hole' : 'match';
  const stake = Number(config.stake || 0) || 0;
  const pair = getSinglesMatchPlayers(match, metrics);
  const result = {
    eligible: !!pair,
    basis,
    stakeType,
    stake,
    playerAId: pair?.playerA?.playerId || '',
    playerBId: pair?.playerB?.playerId || '',
    playerAName: pair?.playerA?.player?.name || getPlayer(pair?.playerA?.playerId)?.name || 'Player A',
    playerBName: pair?.playerB?.player?.name || getPlayer(pair?.playerB?.playerId)?.name || 'Player B',
    holes: [],
    completedHoles: 0,
    selectedHoleCount: getPlayableHoleCount(match, metrics?.tee),
    holesRemaining: 0,
    diff: 0,
    leaderId: '',
    leaderName: '',
    status: 'Unavailable',
    isComplete: false,
    isClinched: false,
    isProvisional: true,
    resultText: 'Singles Match Play requires two teams with one player on each team.',
    playerAWins: 0,
    playerBWins: 0,
    halvedHoles: 0,
    amounts: {},
    paymentLines: []
  };
  if (!pair || !metrics) return result;
  const pa = pair.playerA;
  const pb = pair.playerB;
  const lowPlaying = Math.min(Number(pa.playHdcp) || 0, Number(pb.playHdcp) || 0);
  (metrics.holeResults || []).forEach((hole, holeIdx) => {
    const scoreAObj = hole?.playerScores?.find(ps => String(ps.playerId) === String(pa.playerId));
    const scoreBObj = hole?.playerScores?.find(ps => String(ps.playerId) === String(pb.playerId));
    const grossA = Number(scoreAObj?.gross) || null;
    const grossB = Number(scoreBObj?.gross) || null;
    const row = { holeNumber: hole?.holeNumber || holeIdx + 1, completed: false, winnerId: '', scoreA: null, scoreB: null, runningDiff: result.diff };
    if (!grossA || !grossB) {
      result.holes.push(row);
      return;
    }
    const scoreA = basis === 'net' ? getSideMatchNetHoleScore(match, holeIdx, pa, lowPlaying, hole) : grossA;
    const scoreB = basis === 'net' ? getSideMatchNetHoleScore(match, holeIdx, pb, lowPlaying, hole) : grossB;
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
      result.holes.push(row);
      return;
    }
    row.completed = true;
    row.scoreA = scoreA;
    row.scoreB = scoreB;
    result.completedHoles += 1;
    if (scoreA < scoreB) {
      result.diff += 1;
      result.playerAWins += 1;
      row.winnerId = pa.playerId;
    } else if (scoreB < scoreA) {
      result.diff -= 1;
      result.playerBWins += 1;
      row.winnerId = pb.playerId;
    } else {
      result.halvedHoles += 1;
    }
    row.runningDiff = result.diff;
    result.holes.push(row);
  });
  result.holesRemaining = Math.max(0, result.selectedHoleCount - result.completedHoles);
  const margin = Math.abs(result.diff);
  result.leaderId = result.diff > 0 ? pa.playerId : result.diff < 0 ? pb.playerId : '';
  result.leaderName = result.diff > 0 ? result.playerAName : result.diff < 0 ? result.playerBName : '';
  const clinch = getMatchClinchState({ margin, holesRemaining: result.holesRemaining });
  result.isComplete = result.completedHoles >= result.selectedHoleCount && result.selectedHoleCount > 0;
  result.isClinched = !!clinch.isClinched;
  result.isProvisional = !result.isComplete && !result.isClinched;
  if (!margin) result.resultText = result.isComplete ? 'Halved match' : `All square through ${result.completedHoles} holes — provisional`;
  else if (result.isComplete || result.isClinched) result.resultText = `${result.leaderName} defeated ${result.diff > 0 ? result.playerBName : result.playerAName} ${margin} & ${result.holesRemaining}`;
  else result.resultText = `${result.leaderName} leads ${margin} up through ${result.completedHoles} holes — provisional`;
  result.status = result.isComplete || result.isClinched ? 'Final' : 'Provisional';
  result.amounts[pa.playerId] = 0;
  result.amounts[pb.playerId] = 0;
  if (stake) {
    if (stakeType === 'match') {
      if (result.leaderId && (result.isComplete || result.isClinched)) {
        const loserId = result.leaderId === pa.playerId ? pb.playerId : pa.playerId;
        result.amounts[result.leaderId] += stake;
        result.amounts[loserId] -= stake;
        result.paymentLines.push({ from: loserId, to: result.leaderId, amount: stake });
      }
    } else {
      const amount = (result.playerAWins - result.playerBWins) * stake;
      result.amounts[pa.playerId] += amount;
      result.amounts[pb.playerId] -= amount;
      if (amount > 0) result.paymentLines.push({ from: pb.playerId, to: pa.playerId, amount: Math.abs(amount) });
      else if (amount < 0) result.paymentLines.push({ from: pa.playerId, to: pb.playerId, amount: Math.abs(amount) });
    }
  }
  return result;
}
function getActualPlayOrder(match, metrics = null) {
  const selectedHoles = getSelectedScoringHoles(match, metrics?.tee || getTee(match?.courseId, match?.teeId)).map(h => Number(h.holeNumber)).filter(Boolean);
  const selectedSet = new Set(selectedHoles);
  const base = Array.isArray(match?.playedHoleOrder) ? match.playedHoleOrder.map(Number).filter(h => selectedSet.has(h)) : [];
  const seen = new Set(base);
  const completed = (metrics?.holeResults || []).filter(h => h?.completed).map(h => Number(h.holeNumber)).filter(h => selectedSet.has(h) && !seen.has(h));
  completed.forEach(h => { seen.add(h); base.push(h); });
  selectedHoles.forEach(h => { if (!seen.has(h)) base.push(h); });
  return base;
}
function getMomentumHoleResults(match, metrics, gameKey) {
  const holes = Array.isArray(metrics?.holeResults) ? metrics.holeResults.slice() : [];
  if (String(gameKey || '') === 'singles_match') {
    const order = getActualPlayOrder(match, metrics);
    const byNumber = new Map(holes.map(h => [Number(h.holeNumber), h]));
    return order.map(holeNo => byNumber.get(Number(holeNo))).filter(Boolean);
  }
  return holes;
}


function getMatchStatusOptions(match) {
  const selected = getOrderedSelectedGames(match);
  if (!selected.length) return [];
  return selected.map(g => ({ key: g.key, label: getGameLabel(g.key) }));
}

function formatLeaderThruStatus(leaderLabel, diff, thruCount, { tiedLabel = 'Tied', notStarted = 'Not started' } = {}) {
  const thru = Math.max(0, Number(thruCount) || 0);
  if (!thru) return notStarted;
  const n = Number(diff) || 0;
  if (!Number.isFinite(n) || n === 0) return `${tiedLabel} thru ${thru}`;
  return `${String(leaderLabel || 'Leader').trim()} +${Math.abs(n)} thru ${thru}`;
}

function getTeamGameThruCount(match, metrics, gameKey = 'team_match') {
  const holes = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  return holes.filter(hole => computeMomentumOutcome(match, metrics, hole, gameKey) !== 'pending').length;
}

function formatTeamGameThruStatus(match, metrics, diff, gameKey = 'team_match') {
  const n = Number(diff) || 0;
  const teamNo = n > 0 ? 1 : n < 0 ? 2 : 0;
  const label = teamNo ? getConciseTeamName(match, teamNo, metrics) : '';
  return formatLeaderThruStatus(label, n, getTeamGameThruCount(match, metrics, gameKey));
}

function formatSinglesMatchThruStatus(result) {
  if (!result?.eligible) return 'Not started';
  return formatLeaderThruStatus(result.leaderName, result.diff, result.completedHoles);
}

function formatSideMatchThruStatus(pairing) {
  if (!pairing) return '';
  const diff = Number(pairing.diff) || 0;
  const leader = diff > 0 ? pairing.playerA?.player?.name : diff < 0 ? pairing.playerB?.player?.name : '';
  return formatLeaderThruStatus(leader, diff, pairing.completedCount);
}

function getPrimaryMatchStatusLine(match, metrics, options = {}) {
  if (!match || !metrics) return '';
  const statusOptions = getMatchStatusOptions(match);
  if (!statusOptions.length && getFeaturedCompetitionSelection(match) === 'auto') return '';
  const selectedKeys = new Set(statusOptions.map(opt => opt.key));
  const featuredSelection = getFeaturedCompetitionSelection(match);
  const featured = resolveFeaturedCompetitionKey(match, metrics);
  let key = featuredSelection !== 'auto' && (selectedKeys.has(featured) || ['stroke_net', 'stroke_gross'].includes(featured)) ? featured : '';
  if (!key) key = selectedKeys.has(match.matchStatusGame) ? match.matchStatusGame : '';
  if (!key) {
    key = selectedKeys.has(featured) || ['stroke_net', 'stroke_gross'].includes(featured) ? featured : '';
  }
  if (!key || key === 'none') return '';
  const text = getCompactGameStatus(match, metrics, key);
  if (!text || text === 'Active') return '';
  if (key === 'sneaky_sandy_poley') {
    const ledger = buildSneakySandyPoleyLedger(match, { metrics });
    const leader = ledger.finalLeader || {};
    const prefix = options.includesDraft ? 'Live SSP' : 'SSP Match';
    if (!leader.thru) return `${prefix}: Not started`;
    if (leader.tied) return `${prefix}: Tied thru ${Number(leader.thru) || 0}`;
    return `${prefix}: ${formatSneakySandyPoleyTeamName(ledger, match, leader.teamId)} +${Number(leader.margin || 0)} thru ${Number(leader.thru) || 0}`;
  }
  const label = key === 'nassau' ? 'Nassau' : getGameLabel(key);
  const statusLabel = options.includesDraft && label ? `Live ${label}` : label;
  return statusLabel ? `${statusLabel}: ${text}` : text;
}

function getSneakySandyPoleyHonorsLine(match, metrics) {
  if (!isSneakySandyPoleyEnabled(match) || !metrics) return '';
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  if (!ledger.enabled || !(ledger.sequenceHoleNumbers || []).length) return '';
  const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
  const actualHoleNumber = Number(scoringHoles[currentHole - 1]?.holeNumber || currentHole);
  const honorsTeamId = ledger.honorsByHole?.[String(actualHoleNumber)];
  return honorsTeamId ? `Honors for Hole ${actualHoleNumber}: ${formatSneakySandyPoleyTeamName(ledger, match, honorsTeamId)}` : '';
}

function describeMomentumMeta(match, metrics, gameKey) {
  if (gameKey === 'singles_match') {
    const result = computeSinglesMatchPlayResult(match, metrics, getSinglesMatchConfig(match) || {});
    const basis = escapeHtml(formatBasisLabel(result.basis, 'Net'));
    const playerA = escapeHtml(result.playerAName || 'Player A');
    const playerB = escapeHtml(result.playerBName || 'Player B');
    return `Singles Match Play · Actual play order · ${basis} · ${playerA} vs ${playerB}`;
  }
  const sidePairing = getMomentumSidePairing(match, metrics, gameKey);
  if (sidePairing) {
    const gameLabel = getSideMatchGameLabel(sidePairing.game || 'nassau');
    const basis = formatBasisLabel(sidePairing.basis || 'net', 'Net');
    const perspective = getMomentumPerspectiveLabel(match, metrics, gameKey);
    return `${escapeHtml(sidePairing.label)} · ${escapeHtml(gameLabel)} · ${escapeHtml(basis)} · ${escapeHtml(perspective)} perspective`;
  }
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
  if (gameKey === 'skins' || gameKey === 'net_skins') {
    const skinsCfg = gameKey === 'net_skins' ? { ...cfg, basis: 'net' } : cfg;
    const basis = gameKey === 'net_skins' ? 'Net' : formatBasisLabel(cfg.basis);
    const skins = computeSkinResults(match, metrics, skinsCfg);
    if (skinsCfg.skinsType === 'team') {
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

function buildClassicScorecard(match, metrics, opts = {}) {
  const tee = metrics?.tee;
  if (!tee) return '<div class="tiny">No scorecard available.</div>';
  const readOnly = !!opts.readOnly;
  const blankCourseTeamCell = !!opts.blankCourseTeamCell;
  const hideTeamColumn = !!opts.hideTeamColumn;
  const blankPlayerHeader = !!opts.blankPlayerHeader;
  const selectedPlayerId = opts.playerId ? String(opts.playerId) : '';
  const holeCount = getPlayableHoleCount(match, tee);
  const holes = getSelectedScoringHoles(match, tee);
  const front = holes.slice(0, Math.min(9, holeCount));
  const back = holeCount > 9 ? holes.slice(9, holeCount) : [];
  const holeHeader = holes.map(h => `<th class="scorecard-hole-col">H${h.holeNumber}</th>`).join('');
  const sum = arr => arr.reduce((s,h)=>s+(Number(h)||0),0);
  const totalColumns = holeCount > 9 ? '<th>Out</th><th>In</th><th>Total</th>' : '<th>Out</th><th>Total</th>';
  const scorecardMetaRow = (label, extractor, { showTotals = true } = {}) => {
    const holeValues = holes.map((h, idx) => extractor(h, idx));
    const outTotal = sum(front.map((h, idx) => extractor(h, idx)));
    const inTotal = back.length ? sum(back.map((h, idx) => extractor(h, idx + front.length))) : null;
    const total = sum(holes.map((h, idx) => extractor(h, idx)));
    return `<tr><td class="scorecard-sticky-name"><strong>${label}</strong></td>${hideTeamColumn ? '' : `<td class="scorecard-sticky-team">${blankCourseTeamCell ? '' : 'Course'}</td>`}${holeValues.map(v => `<td class="scorecard-hole-col">${v ?? '—'}</td>`).join('')}<td><strong>${showTotals ? (outTotal || '—') : '—'}</strong></td>${back.length ? `<td><strong>${showTotals ? (inTotal || '—') : '—'}</strong></td>` : ''}<td><strong>${showTotals ? (total || '—') : '—'}</strong></td></tr>`;
  };
  const dotMarkup = count => count > 0 ? `<span class="score-dots">${'•'.repeat(Math.min(count,3))}${count>3?`<sup>${count}</sup>`:''}</span>` : '';
  const visiblePlayers = selectedPlayerId ? metrics.players.filter(p => String(p.playerId) === selectedPlayerId) : metrics.players;
  const selectedPlayerMetric = selectedPlayerId ? visiblePlayers[0] : null;
  const yardageRow = scorecardMetaRow('Yds', (h, idx) => {
    const yardage = selectedPlayerMetric
      ? getPlayerScorecardYardage(match, selectedPlayerMetric, idx, tee, h)
      : Number(h.yardage);
    return Number.isFinite(yardage) && yardage > 0 ? formatYardageValue(yardage) : null;
  });
  const parRow = scorecardMetaRow('Par', h => Number(h.par) || 0);
  const siRow = scorecardMetaRow('Handicap', h => Number(h.strokeIndex) || 0, { showTotals: false });
  const summarizePlayerScorecardRange = (p, startIdx, endIdx) => {
    let gross = 0;
    let net = 0;
    let scored = 0;
    for (let idx = startIdx; idx < endIdx; idx += 1) {
      const score = p.scores?.[idx];
      const grossValue = Number(score?.gross);
      if (!Number.isFinite(grossValue) || grossValue <= 0) continue;
      const hole = holes[idx];
      const playerHole = getPlayerHole(match, p, idx, tee) || hole;
      const strokes = holeStrokeAllowanceForPlayer(playerHole?.strokeIndex, p.playHdcp, metrics.lowPlaying);
      gross += grossValue;
      net += grossValue - strokes;
      scored += 1;
    }
    return { gross, net, scored };
  };
  const scorecardSubtotalCell = summary => `<td><strong>${summary.scored ? summary.gross : '—'}</strong><div class="score-sub total-sub">${summary.scored ? summary.net : '—'}</div></td>`;
  const playerRows = visiblePlayers.map(p => {
    const playerScores = (p.scores || []).slice(0, holeCount);
    const cells = holes.map((hole, idx) => {
      const gross = Number(playerScores[idx]?.gross) || null;
      const playerHole = getPlayerHole(match, p, idx, tee) || hole;
      const strokes = holeStrokeAllowanceForPlayer(playerHole.strokeIndex, p.playHdcp, metrics.lowPlaying);
      const editAttrs = readOnly ? '' : `data-scorecard-edit="1" data-edit-hole="${idx + 1}" data-edit-player="${p.playerId}" title="Edit ${escapeHtml(p.player.name)} on hole ${hole.holeNumber}"`;
      const editClass = readOnly ? '' : ' editable-scorecard-cell';
      if (!gross) return `<td class="scorecard-hole-col score-hole-cell${editClass}" ${editAttrs}><div class="score-main">${formatGolfScoreMarkup(null, hole.par, 'gross')}</div><div class="score-sub">${formatGolfScoreMarkup(null, hole.par, 'net')}${dotMarkup(strokes)}</div></td>`;
      const net = gross - strokes;
      return `<td class="scorecard-hole-col score-hole-cell${editClass}" ${editAttrs}><div class="score-main">${formatGolfScoreMarkup(gross, hole.par, 'gross')}</div><div class="score-sub">${formatGolfScoreMarkup(net, hole.par, 'net')}${dotMarkup(strokes)}</div></td>`;
    }).join('');
    const frontSummary = summarizePlayerScorecardRange(p, 0, Math.min(9, holeCount));
    const backSummary = back.length ? summarizePlayerScorecardRange(p, 9, holeCount) : { gross: 0, net: 0, scored: 0 };
    const totalSummary = summarizePlayerScorecardRange(p, 0, holeCount);
    const totals = back.length
      ? `${scorecardSubtotalCell(frontSummary)}${scorecardSubtotalCell(backSummary)}${scorecardSubtotalCell(totalSummary)}`
      : `${scorecardSubtotalCell(frontSummary)}${scorecardSubtotalCell(totalSummary)}`;
    const playerTeeName = p.tee?.teeName || tee?.teeName || 'Tee';
    return `<tr><td class="scorecard-sticky-name"><strong>${escapeHtml(p.player.name)}</strong><div class="tiny">Tee: ${escapeHtml(playerTeeName)}</div></td>${hideTeamColumn ? '' : `<td class="scorecard-sticky-team">${escapeHtml(getTeamLabel(match,p.team))}</td>`}${cells}${totals}</tr>`;
  }).join('');
  const completion = getRoundCompletionState(match, metrics);
  const teeNames = [...new Set(visiblePlayers.map(p => p.tee?.teeName || tee?.teeName || 'Tee'))];
  const teeNote = teeNames.length === 1 ? ` All players: ${teeNames[0]} tee.` : ' Player tees are shown in each row.';
  const partialNote = completion.isIncomplete ? ' Unplayed holes are shown as dashes and excluded from totals.' : '';
  return `<div class="scorecard-sub tiny">Gross score shown above net score. Dots indicate strokes received.${escapeHtml(teeNote)}${escapeHtml(partialNote)}</div><div class="scorecard-wrap"><table class="scorecard-table ${hideTeamColumn ? 'scorecard-no-team-col' : ''}"><thead><tr><th class="scorecard-sticky-name">${blankPlayerHeader ? '' : 'Player'}</th>${hideTeamColumn ? '' : '<th class="scorecard-sticky-team">Team</th>'}${holeHeader}${totalColumns}</tr></thead><tbody>${yardageRow}${parRow}${siRow}${playerRows}</tbody></table></div>`;
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
      <div class="settle-up-route"><strong>${escapeHtml(getPlayer(row.from)?.name || 'Unknown')}</strong><span aria-hidden="true">&nbsp;→&nbsp;</span><strong>${escapeHtml(getPlayer(row.to)?.name || 'Unknown')}</strong></div>
      <div class="settle-up-amount"><strong>${formatMoneyAccounting(row.amount)}</strong></div>
    </div>`).join('')}</div>`;
}

function buildFinalNetSettlementSection(players, totals) {
  const balanceRows = players.map(player => ({ player, amount: Number(totals[player.id] || 0) }));
  const buildBalanceGroup = (title, groupRows, emptyText) => `<div class="settlement-balance-group"><div class="settlement-balance-title">${title}</div><div class="final-net-settlement-list">${groupRows.length ? groupRows.map(({ player, amount }) => {
    const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
    return `
      <div class="final-net-settlement-row">
        <div class="final-net-settlement-player"><strong>${escapeHtml(player.name)}</strong></div>
        <div class="final-net-settlement-amount ${cls}"><strong>${formatFinalNetSettlementMoney(amount)}</strong></div>
      </div>`;
  }).join('') : `<div class="tiny">${emptyText}</div>`}</div></div>`;
  const winners = balanceRows.filter(row => row.amount > 0.0001).sort((a, b) => b.amount - a.amount);
  const owers = balanceRows.filter(row => row.amount < -0.0001).sort((a, b) => a.amount - b.amount);
  const even = balanceRows.filter(row => Math.abs(row.amount) <= 0.0001);
  const crossFoot = players.reduce((sum, player) => sum + (totals[player.id] || 0), 0);
  const crossFootClass = Math.abs(crossFoot) <= 0.0001 ? '' : 'payout-total-negative';
  const settlements = optimalSettlementRows(totals || {});
  return `
    <div class="final-net-settlement-card top-gap">
      <div class="settlement-balance-grid">
        ${buildBalanceGroup('Winners', winners, 'No positive balances yet.')}
        ${buildBalanceGroup('Owers', owers, 'No amounts owed.')}
      </div>
      ${even.length ? `<div class="settlement-even-line"><strong>Even:</strong> ${escapeHtml(even.map(row => row.player.name).join(', '))}</div>` : ''}
      <div class="settle-up-card">
        <div class="payout-settlement-head"><strong>Settle Up</strong></div>
        <div class="tiny">Minimum payments needed to settle all games.</div>
        ${buildSettleUpList(settlements)}
      </div>
      <div class="final-net-settlement-crossfoot ${crossFootClass}">Cross-foot: ${formatMoneyAccounting(crossFoot)}</div>
    </div>`;
}
function formatGrossGameAmount(amount) {
  const value = Number(amount) || 0;
  if (Math.abs(value) <= 0.0001) return 'Even';
  return value > 0 ? `+${formatMoneyAccounting(value)}` : formatMoneyAccounting(value);
}
function buildPlayerGrossSummaryCards(players, games) {
  if (!games.length) return '<div class="tiny">No payout-producing games selected.</div>';
  return `<div class="gross-game-player-cards">${players.map(player => {
    const lines = games.map(game => {
      const amount = Number(game.amounts?.[player.id] || 0);
      const cls = amount > 0.0001 ? 'payout-total-positive' : amount < -0.0001 ? 'payout-total-negative' : '';
      return `<div class="gross-game-card-line"><span>${escapeHtml(game.label)}</span><strong class="${cls}">${formatGrossGameAmount(amount)}</strong></div>`;
    }).join('');
    const total = games.reduce((sum, game) => sum + (Number(game.amounts?.[player.id] || 0)), 0);
    const totalCls = total > 0.0001 ? 'payout-total-positive' : total < -0.0001 ? 'payout-total-negative' : '';
    return `<div class="gross-game-player-card">
      <div class="gross-game-player-name">${escapeHtml(player.name)}</div>
      <div class="gross-game-card-lines">${lines}</div>
      <div class="gross-game-card-total"><span>Game Total</span><strong class="${totalCls}">${formatGrossGameAmount(total)}</strong></div>
    </div>`;
  }).join('')}</div>`;
}
function buildGrossGamePaymentDetail(players, games) {
  if (!games.length) return '<div class="tiny">No game payout detail available.</div>';
  return `<div class="gross-game-detail-list">${games.map(game => {
    const rows = Array.isArray(game.paymentLines) && game.paymentLines.length
      ? game.paymentLines
      : optimalSettlementRows(game.amounts || {});
    const body = rows.length
      ? rows.map(row => `<div class="gross-game-payment-row"><span><strong>${escapeHtml(getPlayer(row.to)?.name || 'Unknown')}</strong> receives ${formatMoneyAccounting(row.amount)} from <strong>${escapeHtml(getPlayer(row.from)?.name || 'Unknown')}</strong></span></div>`).join('')
      : (game?.meta?.noWagerConfigured ? '<div class="tiny">Nassau enabled with no wager configured.</div>' : '<div class="tiny">No payout.</div>');
    const gameTotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const totalLine = gameTotal > 0.0001 ? `<div class="gross-game-section-total">Total transferred: ${formatMoneyAccounting(gameTotal)}</div>` : '';
    return `<div class="gross-game-section">
      <div class="gross-game-section-title">${escapeHtml(game.key === 'nine_point' ? '9-Point Result' : game.label)}</div>
      <div class="gross-game-section-lines">${body}</div>
      ${totalLine}
    </div>`;
  }).join('')}</div>`;
}
function buildGrossGameDetailSection(match, players, games) {
  const matchId = String(match?.id || 'active');
  const open = !!uiState.grossGameDetailOpenByMatch[matchId];
  const label = open ? 'Hide Game Payout Detail ▲' : 'Show Game Payout Detail ▼';
  const detail = open ? `
    <div class="gross-game-detail-body" id="grossGameDetailBody">
      <div class="payout-summary-intro"><strong>Player Game Summary</strong><br><span class="tiny">Game results by player before efficient settlement.</span></div>
      ${buildPlayerGrossSummaryCards(players, games)}
      <div class="payout-summary-intro top-gap"><strong>Game-by-Game Payout Detail</strong><br><span class="tiny">Pre-settlement audit trail that reconciles to the net settlement above.</span></div>
      ${buildGrossGamePaymentDetail(players, games)}
    </div>` : '';
  return `<div class="gross-game-detail-card top-gap">
    <button type="button" class="gross-game-detail-toggle" data-gross-game-detail-toggle aria-expanded="${open ? 'true' : 'false'}" aria-controls="grossGameDetailBody">${label}</button>
    ${detail}
  </div>`;
}


function getPayoutReportContext(match, metrics) {
  const selected = getOrderedSelectedGames(match);
  const games = computeLivePayoutGames(match, metrics);
  const players = (metrics?.players || []).map(p => ({ id: p.playerId, name: p.player.name }));
  const selectedKeys = new Set(selected.map(game => game.key));
  const isSelectedPayoutGame = (game) => {
    if (!game || !game.amounts) return false;
    if (selectedKeys.has(game.key) || selectedKeys.has(game.sourceKey)) return true;
    if (String(game.key || '').startsWith('nassau_') && selectedKeys.has('nassau')) return true;
    return false;
  };
  const payoutGames = games.filter(isSelectedPayoutGame);
  const finalTotals = {};
  payoutGames.forEach(game => addAmounts(finalTotals, game.amounts));
  return { selected, games, players, payoutGames, finalTotals };
}

function buildExportFinalNetSettlementSummary(match, metrics) {
  const ctx = getPayoutReportContext(match, metrics);
  const completion = getRoundCompletionState(match, metrics);
  if (!ctx.selected.length) return '<div><strong>Net payout (live):</strong> No gambling games selected.</div>';
  if (!ctx.payoutGames.length) return '<div><strong>Net payout (live):</strong> No payout-producing games selected.</div>';
  const settlementFinal = areAllGamesFinal(match, metrics);
  const note = completion.isIncomplete ? `<div class="export-provisional-label">${settlementFinal ? 'Final Net Settlement — all selected games are mathematically determined despite unplayed holes.' : `Net Settlement — Provisional · based on ${completion.completedHoleCount} completed holes. Some game outcomes may still change.`}</div>` : '';
  return `<div class="payout-summary-stack">${note}${buildFinalNetSettlementSection(ctx.players, ctx.finalTotals)}</div>`;
}

function buildExportGrossGameDetailSummary(match, metrics) {
  const ctx = getPayoutReportContext(match, metrics);
  if (!ctx.selected.length) return '';
  if (!ctx.payoutGames.length) return '<div class="export-empty">No game payout detail available.</div>';
  return `
    <div class="gross-game-detail-body export-gross-game-detail-body">
      <div class="payout-summary-intro"><strong>Player Gross Summary</strong><br><span class="tiny">Gross game results by player before the final efficient settlement.</span></div>
      ${buildPlayerGrossSummaryCards(ctx.players, ctx.payoutGames)}
      <div class="payout-summary-intro top-gap"><strong>Game-by-Game Payout Detail</strong><br><span class="tiny">Audit trail of the gross payment lines that reconcile to the final net settlement above.</span></div>
      ${buildGrossGamePaymentDetail(ctx.players, ctx.payoutGames)}
    </div>`;
}

function buildNetPayoutSummary(match, metrics) {
  const ctx = getPayoutReportContext(match, metrics);
  if (!ctx.selected.length) return '<div><strong>Net payout (live):</strong> No gambling games selected.</div>';
  if (!ctx.payoutGames.length) return '<div><strong>Net payout (live):</strong> No payout-producing games selected.</div>';
  return `<div class="payout-summary-stack">${buildFinalNetSettlementSection(ctx.players, ctx.finalTotals)}${buildGrossGameDetailSection(match, ctx.players, ctx.payoutGames)}</div>`;
}
function getCompletedStatHoleLimit(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  return Math.max(0, Math.min(Number(completion.completedHoleCount || 0), Number(metrics?.holeCount) || getRequestedHoleCount(match)));
}

function computeStatTrackingSummary(match, metrics) {
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  if (!completedLimit) return [];
  const trackedPlayers = (metrics?.players || []).filter(playerMetric => isPlayerStatTrackingEnabled(match, playerMetric.playerId));
  const summary = trackedPlayers.map(playerMetric => {
    const playerRef = match.players.find(row => row.playerId === playerMetric.playerId);
    const totals = { fairwaysHit: 0, fairwayOpps: 0, greens: 0, putts: 0, penaltyStrokes: 0, upAndDowns: 0, sandies: 0 };
    (metrics?.holeResults || []).forEach((holeResult, holeIdx) => {
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
  const holeResults = Array.isArray(metrics?.holeResults) ? metrics.holeResults : [];
  if (!holeResults.length) return [];
  return (metrics?.players || []).map(playerMetric => {
    const totals = { eagle: 0, birdie: 0, par: 0, bogey: 0, doubleBogey: 0, other: 0 };
    holeResults.forEach((holeResult, holeIdx) => {
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
  const rows = computeScoreDistributionSummary(match, metrics);
  if (!rows.length) return '<div class="tiny">No player scores available yet.</div>';
  const anyScores = rows.some(r => Object.values(r.totals || {}).some(v => Number(v) > 0));
  if (!anyScores) return '<div class="tiny">No completed holes yet.</div>';
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
  const rows = computeScoreDistributionSummary(match, metrics);
  if (!rows.length) return '<div class="export-empty">No player scores available yet.</div>';
  const anyScores = rows.some(r => Object.values(r.totals || {}).some(v => Number(v) > 0));
  if (!anyScores) return '<div class="export-empty">No completed holes yet.</div>';
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
  const trackedPlayers = (metrics?.players || []).filter(playerMetric => isPlayerStatTrackingEnabled(match, playerMetric.playerId));
  if (!trackedPlayers.length) return '';
  const rows = trackedPlayers.map(playerMetric => {
    const playerRef = match.players.find(row => row.playerId === playerMetric.playerId);
    const totals = { fairwaysHit: 0, fairwayOpps: 0, greens: 0, greenOpps: 0, putts: 0, puttOpps: 0, penaltyStrokes: 0, upAndDowns: 0, sandies: 0 };
    (metrics?.holeResults || []).forEach((holeResult, holeIdx) => {
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
        <td>${totals.putts}</td>
        <td>${avgPutts}</td>
        <td>${totals.upAndDowns}</td>
        <td>${totals.sandies}</td>
        <td>${totals.penaltyStrokes}</td>
      </tr>`;
  }).join('');
  if (!rows) return '';
  return `
    <div class="fit-stage" data-fit="width" data-fit-min="0.84">
      <div class="fit-box">
        <table class="export-table export-stat-summary-table">
          <thead>
            <tr><th>Player</th><th>Fairways</th><th>GIR</th><th>Total Putts</th><th>Avg Putts</th><th>Up & Downs</th><th>Sandies</th><th>Penalty</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildPlayerHoleStatSummaryTable(match, metrics, playerMetric, completedLimit) {
  const playerRef = match.players.find(row => row.playerId === playerMetric.playerId);
  if (!playerRef) return '<div class="tiny top-gap">No hole-by-hole stats available.</div>';
  const statRows = (metrics?.holeResults || []).map((holeResult, holeIdx) => {
    if (!holeResult?.completed) return null;
    const scoreObj = holeResult?.playerScores?.find(ps => ps.playerId === playerMetric.playerId);
    const gross = Number(scoreObj?.gross);
    if (!Number.isFinite(gross) || gross <= 0) return null;
    const hole = getPlayerHole(match, playerMetric, holeIdx, metrics?.tee) || metrics?.tee?.holes?.[holeIdx] || null;
    const stat = getPlayerStatEntry(playerRef, holeIdx);
    const par = Number(hole?.par) || Number(scoreObj?.par) || 0;
    const fairwayEligible = par === 4 || par === 5;
    const mark = (value) => value ? '✓' : '';
    return {
      hole: escapeHtml(hole?.holeNumber || holeIdx + 1),
      fw: fairwayEligible ? mark(stat.fairway) : '—',
      gir: mark(stat.green),
      putts: Number.isFinite(Number(stat.putts)) ? Number(stat.putts) : '—',
      upDown: mark(stat.upAndDown),
      sandy: mark(stat.sandy),
      pen: Number.isFinite(Number(stat.penaltyStrokes)) ? Number(stat.penaltyStrokes) : 0
    };
  }).filter(Boolean);
  if (!statRows.length) return '<div class="tiny top-gap">No completed stat holes available.</div>';
  const holeRows = statRows.map(row => `<tr><td>${row.hole}</td></tr>`).join('');
  const valueRows = statRows.map(row => `
    <tr>
      <td>${row.fw}</td>
      <td>${row.gir}</td>
      <td>${row.putts}</td>
      <td>${row.upDown}</td>
      <td>${row.sandy}</td>
      <td>${row.pen}</td>
    </tr>`).join('');
  return `
    <div class="player-hole-stat-grid top-gap">
      <table class="player-hole-stat-table player-hole-stat-fixed" aria-hidden="false">
        <thead><tr><th>Hole</th></tr></thead>
        <tbody>${holeRows}</tbody>
      </table>
      <div class="player-hole-stat-scroll" tabindex="0" aria-label="Scrollable hole-by-hole player statistics">
        <table class="player-hole-stat-table player-hole-stat-values">
          <thead><tr><th>FW</th><th>GIR</th><th>Putts</th><th>U&amp;D</th><th>Sandy</th><th>Pen</th></tr></thead>
          <tbody>${valueRows}</tbody>
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
  if (!summary.length) return '<div class="tiny">No players were selected for stat tracking.</div>' + scoreDistributionHtml;
  const manualStatsHtml = `<div class="section-subhead">Manual stat tracking</div><div class="stat-summary-grid top-gap">${summary.map(({ playerMetric, totals }) => `
    <div class="stat-summary-card">
      <div class="stat-summary-name">${escapeHtml(playerMetric.player.name)}</div>
      <div class="tiny">${escapeHtml(getTeamLabel(match, playerMetric.team))}</div>
      <div class="stat-summary-list top-gap">
        <div><span>Fairways hit</span><strong>${totals.fairwaysHit} / ${totals.fairwayOpps}</strong></div>
        <div><span>Greens in regulation</span><strong>${totals.greens}</strong></div>
        <div><span>Total putts</span><strong>${totals.putts}</strong></div>
        <div><span>Up and downs</span><strong>${totals.upAndDowns}</strong></div>
        <div><span>Sandies</span><strong>${totals.sandies}</strong></div>
        <div><span>Penalty strokes</span><strong>${totals.penaltyStrokes}</strong></div>
      </div>
      <details class="player-hole-stat-details top-gap">
        <summary>Hole-by-hole stats</summary>
        ${buildPlayerHoleStatSummaryTable(match, metrics, playerMetric, completedLimit)}
      </details>
    </div>`).join('')}</div>`;
  return manualStatsHtml + scoreDistributionHtml;
}

function getPlayerDetailThroughLabel(match, metrics, playerMetric) {
  const holes = getSelectedScoringHoles(match, metrics?.tee);
  const scores = Array.isArray(playerMetric?.scores) ? playerMetric.scores : [];
  let scoredCount = 0;
  let lastHole = null;
  scores.slice(0, holes.length || scores.length).forEach((score, idx) => {
    if (Number(score?.gross) > 0) {
      scoredCount += 1;
      lastHole = holes[idx]?.holeNumber || score?.holeNumber || idx + 1;
    }
  });
  const total = getPlayableHoleCount(match, metrics?.tee);
  return lastHole ? `H${lastHole} (${scoredCount}/${total})` : `0/${total}`;
}

function getPlayerDetailMatchStatus(match, metrics, playerMetric) {
  if (!match || !metrics || !playerMetric) return '';
  const games = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!games.length) return '';
  if (games.some(g => g.key === 'singles_match') && isSinglesMatchPlayEligible(match, metrics)) {
    const result = computeSinglesMatchPlayResult(match, metrics, getSinglesMatchConfig(match) || {});
    if ([result.playerAId, result.playerBId].map(String).includes(String(playerMetric.playerId))) return result.resultText || '';
  }
  const sidePairing = getIndividualMatchPairings(match, metrics).find(pair => (
    String(pair.playerA?.playerId) === String(playerMetric.playerId) || String(pair.playerB?.playerId) === String(playerMetric.playerId)
  ));
  if (sidePairing && ['match_play', 'nassau'].includes(String(sidePairing.game || '').toLowerCase())) {
    return `${getSideMatchGameLabel(sidePairing.game)}: ${sidePairing.status}`;
  }
  if (metrics.teams?.length === 2) {
    const teamGame = games.find(g => g.key === 'team_match') || games.find(g => g.key === 'nassau');
    if (teamGame) {
      const diffs = computeTeamGameDiffs(match, metrics, teamGame.key);
      return `${getGameLabel(teamGame.key)}: ${formatTeamGameStatus(match, metrics, diffs.overall)}`;
    }
  }
  return '';
}

function buildPlayerDetailStatBlock(match, metrics, playerMetric) {
  if (!isStatTrackingEnabled(match) || !isPlayerStatTrackingEnabled(match, playerMetric?.playerId)) {
    return '<div class="player-detail-empty tiny">No hole-by-hole stat tracking is enabled for this player.</div>';
  }
  const summary = computeStatTrackingSummary(match, metrics).find(row => String(row.playerMetric?.playerId) === String(playerMetric.playerId));
  const totals = summary?.totals || { fairwaysHit: 0, fairwayOpps: 0, greens: 0, putts: 0, penaltyStrokes: 0, upAndDowns: 0, sandies: 0 };
  const completedLimit = getCompletedStatHoleLimit(match, metrics);
  return `
    <div class="player-detail-stat-totals">
      <div><span>Fairways</span><strong>${totals.fairwaysHit} / ${totals.fairwayOpps}</strong></div>
      <div><span>GIR</span><strong>${totals.greens}</strong></div>
      <div><span>Putts</span><strong>${totals.putts}</strong></div>
      <div><span>Penalties</span><strong>${totals.penaltyStrokes}</strong></div>
      <div><span>U&amp;D</span><strong>${totals.upAndDowns}</strong></div>
      <div><span>Sand</span><strong>${totals.sandies}</strong></div>
    </div>
    ${buildPlayerHoleStatSummaryTable(match, metrics, playerMetric, completedLimit)}
  `;
}

function buildPlayerDetailGameStatusBlock(match, metrics, playerMetric) {
  if (!match || !metrics || !playerMetric) return '';
  const games = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!games.length) return '';
  const rows = [];
  const add = (label, value) => {
    const clean = String(value || '').trim();
    if (clean) rows.push(`<div class="player-detail-action-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(clean)}</strong></div>`);
  };
  const teamNo = Number(playerMetric.team) || 1;
  const teamLabel = getTeamLabel(match, teamNo);
  const playerId = String(playerMetric.playerId);
  const selectedKeys = new Set(games.map(g => g.key));
  if (selectedKeys.has('nassau') && (metrics.teams || []).length === 2) {
    add('Nassau', getCompactGameStatus(match, metrics, 'nassau', games.find(g => g.key === 'nassau')));
  }
  if (selectedKeys.has('team_match') && (metrics.teams || []).length === 2) {
    add('Match', getCompactGameStatus(match, metrics, 'team_match', games.find(g => g.key === 'team_match')));
  }
  const teamStrokeCfg = games.find(g => g.key === 'team_stroke');
  if (teamStrokeCfg) {
    const stroke = getTeamStrokeScoreboardData(match, metrics, teamStrokeCfg);
    const teamRow = (stroke.rows || []).find(row => Number(row.team) === teamNo);
    if (teamRow) {
      const status = !stroke.leader
        ? 'Active'
        : stroke.tie
          ? `Tied at ${stroke.leader.total}`
          : `${getTeamLabel(match, stroke.leader.team)} by ${stroke.margin} stroke${stroke.margin === 1 ? '' : 's'}`;
      add('Team Stroke', `${teamLabel} ${teamRow.total} · ${status}`);
    } else {
      add('Team Stroke', 'Active');
    }
  }
  const singlesCfg = games.find(g => g.key === 'singles_match');
  if (singlesCfg) {
    const singles = computeSinglesMatchPlayResult(match, metrics, singlesCfg);
    const involved = [singles.playerAId, singles.playerBId].map(String).includes(playerId);
    if (involved) add('Singles', `${formatSinglesMatchThruStatus(singles)} · ${formatBasisLabel(singles.basis)}`);
  }
  games.filter(g => g.key === 'skins' || g.key === 'net_skins').forEach(cfg => {
    const skinsCfg = cfg.key === 'net_skins' ? { ...cfg, basis: 'net' } : cfg;
    const skins = computeSkinResults(match, metrics, skinsCfg);
    const isTeam = skinsCfg.skinsType === 'team';
    const key = isTeam ? String(teamNo) : String(playerMetric.playerId);
    const count = Number(skins.counts?.[key] || 0);
    const label = cfg.key === 'net_skins' ? 'Net Skins' : 'Skins';
    add(label, count ? `${count} won${isTeam ? ` · ${teamLabel}` : ''}` : 'None yet');
  });
  const greeniesCfg = games.find(g => g.key === 'greenies');
  if (greeniesCfg) {
    const participants = new Set((greeniesCfg.participants || []).map(String));
    if (!participants.size || participants.has(String(playerMetric.playerId))) {
      const greenies = getGreeniesResults(match, metrics, greeniesCfg);
      const count = Number(greenies.counts?.[playerMetric.playerId] || 0);
      add('Greenies', count ? `${count} won` : 'Eligible · none yet');
    }
  }
  if (selectedKeys.has('sneaky_sandy_poley')) {
    const contribution = getSneakySandyPoleyPlayerContribution(match, metrics, playerMetric.playerId);
    if (contribution) {
      const categoryText = Object.entries(contribution.categoryCounts || {})
        .filter(([, count]) => Number(count) > 0)
        .map(([key, count]) => `${getSspCategoryLabel(key)} ${count}`)
        .join(', ');
      add('SSP', `${Number(contribution.points || 0)} base pts contributed${categoryText ? ` · ${categoryText}` : ''}`);
      add('Team SSP', String(contribution.teamStatus || '').replace(/^SSP:\s*/, ''));
    }
  }
  const ninePointCfg = games.find(g => g.key === 'nine_point');
  if (ninePointCfg) {
    const nine = computeNinePointResults(match, metrics, ninePointCfg);
    const configuredIds = new Set((ninePointCfg.playerIds || nine.playerIds || []).map(String));
    if (configuredIds.has(playerId)) {
      const row = (nine.leaderboard || []).find(item => String(item.playerId) === playerId);
      const pointText = row ? `${row.total} pts` : 'Active';
      const moneyText = row ? ` · ${formatMoneyAccounting(row.amount || 0)}` : '';
      add('9-Point', `${pointText} · ${nine.completedHoles || 0} hole(s) complete${moneyText}`);
    }
  }
  const side = getIndividualMatchPairings(match, metrics).find(pair => (
    String(pair.playerA?.playerId) === String(playerMetric.playerId) || String(pair.playerB?.playerId) === String(playerMetric.playerId)
  ));
  if (side) add(getSideMatchGameLabel(side.game), formatSideMatchThruStatus(side) || 'Live');
  if (!rows.length) return '';
  return `<section class="player-detail-section player-detail-action-section"><h3>Games / Action</h3><div class="player-detail-action-list">${rows.join('')}</div></section>`;
}

function getPlayerScoringMixLabel(match, metrics, playerMetric) {
  if (!match || !metrics || !playerMetric) return 'No scored holes yet';
  const counts = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  const tee = metrics?.tee || getTee(match.courseId, match.teeId);
  const holeCount = getPlayableHoleCount(match, tee);
  (playerMetric.scores || []).slice(0, holeCount).forEach((score, idx) => {
    const gross = Number(score?.gross);
    const playerHole = getPlayerHole(match, playerMetric, idx, tee);
    const par = Number(playerHole?.par);
    if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(par) || par <= 0) return;
    const diff = gross - par;
    if (diff <= -2) counts.eagle += 1;
    else if (diff === -1) counts.birdie += 1;
    else if (diff === 0) counts.par += 1;
    else if (diff === 1) counts.bogey += 1;
    else counts.double += 1;
  });
  const parts = [
    ['Eagle+', 'Eagles+', counts.eagle],
    ['Birdie', 'Birdies', counts.birdie],
    ['Par', 'Pars', counts.par],
    ['Bogey', 'Bogeys', counts.bogey],
    ['Double+', 'Doubles+', counts.double],
  ]
    .filter(([, , count]) => count > 0)
    .map(([singular, plural, count]) => `${count} ${count === 1 ? singular : plural}`);
  return parts.length ? parts.join(' • ') : 'No scored holes yet';
}

function buildPlayerDetailView(match, metrics, playerId) {
  const playerMetric = (metrics?.players || []).find(p => String(p.playerId) === String(playerId));
  if (!match || !metrics || !playerMetric) return '<div class="player-detail-empty">Player details are unavailable.</div>';
  const showNet = Number(playerMetric.playHdcp || 0) !== 0 || Number(playerMetric.netTotal || 0) !== Number(playerMetric.grossTotal || 0);
  const scoreTiles = [
    ['Gross', playerMetric.grossTotal || 0],
    ...(showNet ? [['Net', playerMetric.netTotal || 0]] : []),
    ['Vs Par', formatToPar(playerMetric.toPar || 0)],
    ['Through', getPlayerDetailThroughLabel(match, metrics, playerMetric)],
    ['Scoring Mix', getPlayerScoringMixLabel(match, metrics, playerMetric)],
  ];
  return `
    <div class="player-detail-hero">
      <div>
        <div class="tiny">${escapeHtml(getTeamLabel(match, playerMetric.team))} · ${escapeHtml(playerMetric.tee?.teeName || metrics.tee?.teeName || 'Tee')} · ${escapeHtml(getPlayerDetailThroughLabel(match, metrics, playerMetric))}</div>
      </div>
      <div class="player-detail-score-grid">
        ${scoreTiles.map(([label, value]) => `<div class="player-detail-score-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('')}
      </div>
    </div>
    ${buildPlayerDetailGameStatusBlock(match, metrics, playerMetric)}
    <section class="player-detail-section">
      <h3>Classic scorecard</h3>
      ${buildClassicScorecard(match, metrics, { playerId: playerMetric.playerId, readOnly: true, blankCourseTeamCell: true, hideTeamColumn: true, blankPlayerHeader: true })}
    </section>
    <section class="player-detail-section">
      <h3>Hole statistics</h3>
      ${buildPlayerDetailStatBlock(match, metrics, playerMetric)}
    </section>
  `;
}

function openPlayerDetailView(playerId) {
  const match = getActiveMatch();
  if (!match || !playerId) return;
  const modal = document.getElementById('playerDetailDialog');
  const body = document.getElementById('playerDetailBody');
  if (!modal || !body) return;
  const metrics = computeMatchMetrics(match);
  body.innerHTML = buildPlayerDetailView(match, metrics, playerId);
  const playerMetric = (metrics?.players || []).find(p => String(p.playerId) === String(playerId));
  const title = document.getElementById('playerDetailTitle');
  if (title) title.textContent = playerMetric?.player?.name || 'Player Detail';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('player-detail-open');
  document.getElementById('playerDetailCloseBtn')?.focus({ preventScroll: true });
}

function closePlayerDetailView() {
  const modal = document.getElementById('playerDetailDialog');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('player-detail-open');
}

function buildQuickScoreboardView(match, metrics) {
  if (!match || !metrics) return '<div class="player-detail-empty">Scoreboard is unavailable.</div>';
  const sortedPlayers = (metrics.players || []).slice().sort((a, b) => a.leaderboardNetDiff - b.leaderboardNetDiff || a.toPar - b.toPar || String(a.player?.name || '').localeCompare(String(b.player?.name || '')));
  const playerRows = sortedPlayers.map((p, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(p.player?.name || 'Player')}</td>
      <td>${p.grossTotal || 0}</td>
      <td>${p.leaderboardNetTotal || 0}</td>
      <td>${formatToPar(p.leaderboardNetDiff || 0)}</td>
    </tr>`).join('');
  const showTeams = hasMultiPlayerTeam(metrics);
  const teamRows = showTeams ? (metrics.teams || []).slice().sort((a, b) => a.netTotal - b.netTotal || a.grossTotal - b.grossTotal || a.team - b.team).map(t => `
    <tr>
      <td>${escapeHtml(getTeamLabel(match, t.team))}</td>
      <td>${t.grossTotal || 0}</td>
      <td>${t.netTotal || 0}</td>
      <td>${formatToPar(t.netDiff || 0)}</td>
    </tr>`).join('') : '';
  const completion = getRoundCompletionState(match, metrics);
  const elapsed = getRoundElapsedTimeState(match);
  const primaryStatus = getPrimaryMatchStatusLine(match, metrics);
  const gameStatusRows = buildQuickScoreboardGameStatusRows(match, metrics);
  const payout = getPayoutReportContext(match, metrics);
  const sspSettlement = isSneakySandyPoleyEnabled(match) ? buildSneakySandyPoleyLedger(match, { metrics }).settlement : null;
  const sspMoneyHtml = sspSettlement?.valid && !sspSettlement.tied && sspSettlement.amount > 0 ? `
    <div class="quick-ssp-money">
      <strong>${escapeHtml(sspSettlement.label)}</strong>
      <span>${escapeHtml(sspSettlement.payerLabel)}</span>
      <span>${escapeHtml(sspSettlement.payeeLabel)}</span>
    </div>` : '';
  const moneyRows = Object.entries(payout.finalTotals || {})
    .map(([id, amount]) => ({ name: getPlayer(id)?.name || id, amount: Number(amount) || 0 }))
    .filter(row => Math.abs(row.amount) > 0.0001)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map(row => `<div class="quick-money-row"><span>${escapeHtml(row.name)}</span><strong>${formatFinalNetSettlementMoney(row.amount)}</strong></div>`)
    .join('');
  return `
    <div class="quick-scoreboard-meta">${escapeHtml(completion.label)}${match.status === 'complete' ? ' · Final' : ' · Live'}${elapsed.available ? ` · ${escapeHtml(elapsed.label.replace(/^Round elapsed time:\s*/i, ''))}` : ''}</div>
    ${primaryStatus ? `<div class="quick-scoreboard-status">${escapeHtml(primaryStatus)}</div>` : ''}
    <section class="quick-scoreboard-section">
      <h4>Players</h4>
      <div class="quick-table-wrap">
        <table class="quick-scoreboard-table quick-player-table">
          <thead><tr><th>#</th><th>Player</th><th>Gross</th><th>Net</th><th>Net +/-</th></tr></thead>
          <tbody>${playerRows || '<tr><td colspan="5">No player standings yet.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    ${showTeams ? `<section class="quick-scoreboard-section"><h4>Teams</h4><div class="quick-table-wrap"><table class="quick-scoreboard-table quick-team-table"><thead><tr><th>Team</th><th>Gross</th><th>Net</th><th>Net +/-</th></tr></thead><tbody>${teamRows}</tbody></table></div></section>` : ''}
    ${gameStatusRows}
    <section class="quick-scoreboard-section">
      <h4>Money</h4>
      ${sspMoneyHtml}
      ${moneyRows ? `<div class="quick-money-list">${moneyRows}</div>` : '<div class="tiny">No money summary available yet.</div>'}
    </section>`;
}

function openQuickScoreboardView() {
  const match = getActiveMatch();
  if (!match) return toast('Create or load a match first.');
  const modal = document.getElementById('quickScoreboardDialog');
  const body = document.getElementById('quickScoreboardBody');
  if (!modal || !body) return;
  const previewMatch = document.getElementById('score')?.classList.contains('active') ? JSON.parse(JSON.stringify(match)) : match;
  if (previewMatch !== match) applyCurrentHoleDomToMatch(previewMatch);
  const metrics = computeMatchMetrics(previewMatch);
  body.innerHTML = buildQuickScoreboardView(previewMatch, metrics);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('quick-scoreboard-open');
  document.documentElement.classList.add('quick-scoreboard-open');
  document.getElementById('quickScoreboardCloseBtn')?.focus({ preventScroll: true });
}

function closeQuickScoreboardView() {
  const modal = document.getElementById('quickScoreboardDialog');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('quick-scoreboard-open');
  document.documentElement.classList.remove('quick-scoreboard-open');
}

function renderLeaderboard() {
  const match = getActiveMatch();
  const empty = document.getElementById('leaderboardEmpty');
  const wrap = document.getElementById('leaderboardWrap');
  const completedSummaryBanner = document.getElementById('completedSummarySessionBanner');
  const playerBody = document.getElementById('playerLeaderboardBody');
  const teamBody = document.getElementById('teamLeaderboardBody');
  const matchStatus = document.getElementById('matchStatusSummary');
  const executiveSummary = document.getElementById('roundExecutiveSummary');
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
    completedSummaryBanner?.classList.add('hidden');
    syncFinishRoundUi(null);
    empty.classList.remove('hidden');
    wrap.classList.add('hidden');
    if (executiveSummary) executiveSummary.innerHTML = '';
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
  if (executiveSummary) executiveSummary.innerHTML = buildRoundSnapshot(match, metrics);
  completedSummaryBanner?.classList.toggle('hidden', !isCompletedSummarySession(match));
  syncFinishRoundUi(match);
  const missingScoreEl = document.getElementById('missingScoreWarning');
  if (missingScoreEl) {
    const activeRound = hasActiveRound(match, metrics);
    const warning = activeRound ? buildMissingScoreWarning(match, metrics) : '';
    missingScoreEl.innerHTML = warning;
    missingScoreEl.classList.toggle('hidden', !warning);
    missingScoreEl.style.display = warning ? '' : 'none';
    missingScoreEl.setAttribute('aria-hidden', warning ? 'false' : 'true');
  }

  const sortedPlayers = metrics.players.slice().sort((a, b) => a.leaderboardNetDiff - b.leaderboardNetDiff || a.toPar - b.toPar);
  const showPlayerTeamColumn = hasMultiPlayerTeam(metrics);
  const playerLeaderboardCard = playerBody?.closest('details');
  if (playerLeaderboardCard) playerLeaderboardCard.classList.toggle('hide-player-team-column', !showPlayerTeamColumn);
  playerBody.innerHTML = sortedPlayers.map(p => `
    <tr>
      <td>${escapeHtml(p.player.name)}</td>
      <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
      <td>${p.grossTotal || 0}</td>
      <td>${p.postableTotal || 0}</td>
      <td>${formatToPar(p.toPar || 0)}</td>
      <td>${p.leaderboardNetTotal || 0}</td>
      <td>${formatToPar(p.leaderboardNetDiff || 0)}</td>
    </tr>
  `).join('');
  const playerMobile = document.getElementById('playerLeaderboardMobile');
  if (playerMobile) {
    playerMobile.innerHTML = sortedPlayers.map(p => `
      <div class="leader-mobile-card">
        <div><strong>${escapeHtml(p.player.name)}</strong>${showPlayerTeamColumn ? ` <span class="tiny">· ${escapeHtml(getTeamLabel(match, p.team))}</span>` : ''}</div>
        <div class="leader-mobile-grid">
          <div><div class="leader-mobile-label">Gross</div><div>${p.grossTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Postable</div><div>${p.postableTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Gross to Par</div><div>${formatToPar(p.toPar || 0)}</div></div>
          <div><div class="leader-mobile-label">Net</div><div>${p.leaderboardNetTotal || 0}</div></div>
          <div><div class="leader-mobile-label">Net to Par</div><div>${formatToPar(p.leaderboardNetDiff || 0)}</div></div>
        </div>
      </div>
    `).join('');
  }

  const sortedTeams = metrics.teams.slice().sort((a, b) => (a.netTotal - b.netTotal) || (a.grossTotal - b.grossTotal) || (a.team - b.team));
  const showTeamLeaderboard = hasMultiPlayerTeam(metrics);
  const teamLeaderboardCard = teamBody?.closest('details');
  if (teamLeaderboardCard) teamLeaderboardCard.classList.toggle('hidden', !showTeamLeaderboard);
  const teamMatchRelevant = showTeamLeaderboard && showTeamMatchMetric(match, metrics);
  const teamMetricLabel = teamMatchRelevant ? 'H2H' : '—';
  const teamMetricValue = t => teamMatchRelevant ? formatSigned(t.overall) : '—';
  const teamLeaderHeader = document.querySelectorAll('#leaderboard .leader-table thead tr th:last-child')[1];
  if (teamLeaderHeader) teamLeaderHeader.textContent = teamMatchRelevant ? 'H2H' : '—';
  teamBody.innerHTML = showTeamLeaderboard ? sortedTeams.map(t => `
    <tr>
      <td>${escapeHtml(getTeamLabel(match, t.team))}</td>
      <td>${escapeHtml(t.members.map(m => m.player.name).join(', '))}</td>
      <td>${t.grossTotal}</td>
      <td>${t.netTotal}</td>
      <td>${formatToPar(t.toPar)}</td>
      <td>${formatToPar(t.netDiff)}</td>
      <td>${teamMetricValue(t)}</td>
    </tr>
  `).join('') : '';
  const teamMobile = document.getElementById('teamLeaderboardMobile');
  if (teamMobile) {
    teamMobile.innerHTML = showTeamLeaderboard ? sortedTeams.map(t => `
      <div class="leader-mobile-card">
        <div><strong>${escapeHtml(getTeamLabel(match, t.team))}</strong></div>
        <div class="tiny">${escapeHtml(t.members.map(m => m.player.name).join(', '))}</div>
        <div class="leader-mobile-grid">
          <div><div class="leader-mobile-label">Gross</div><div>${t.grossTotal}</div></div>
          <div><div class="leader-mobile-label">Net</div><div>${t.netTotal}</div></div>
          <div><div class="leader-mobile-label">To Par</div><div>${formatToPar(t.toPar)}</div></div>
          <div><div class="leader-mobile-label">Net Diff</div><div>${formatToPar(t.netDiff)}</div></div>
          <div><div class="leader-mobile-label">${teamMetricLabel}</div><div>${teamMetricValue(t)}</div></div>
        </div>
      </div>
    `).join('') : '';
  }

  const activePrintView = (match.printView === 'scorecard') ? 'scorecard' : 'summary';
  syncScoreboardPrintControls(activePrintView);
  applyScoreboardPrintView(activePrintView);
  renderRoundMemoriesPanel(match);
  renderRoundRecapControlPanel(match);

  const statusOptions = getMatchStatusOptions(match);
  if (matchStatusGameSelect) {
    matchStatusGameSelect.innerHTML = statusOptions.map(opt => `<option value="${opt.key}" ${opt.key === match.matchStatusGame ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    if (!statusOptions.find(opt => opt.key === match.matchStatusGame)) {
      match.matchStatusGame = statusOptions[0]?.key || 'team_match';
      matchStatusGameSelect.value = match.matchStatusGame;
    }
  }
  matchStatus.innerHTML = buildFeaturedMatchStatus(match, metrics, match.matchStatusGame || statusOptions[0]?.key || 'team_match');
  gamesSummary.innerHTML = `${buildSelectedGamesSummary(match, metrics)}${buildSneakySandyPoleyExportSummary(match, metrics)}`;
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
  const showMomentum = hasTeamMomentumMatch(match, metrics);
  if (momentumCard) momentumCard.classList.toggle('hidden', !showMomentum);
  const momentumSelect = document.getElementById('momentumGameSelect');
  const options = getMomentumOptions(match, metrics);
  if (showMomentum && momentumSelect) {
    momentumSelect.innerHTML = options.map(opt => `<option value="${opt.key}" ${opt.key === match.momentumGame ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    if (!options.find(opt => opt.key === match.momentumGame)) {
      match.momentumGame = getDefaultMomentumGameKey(match, metrics) || options[0]?.key || '';
      momentumSelect.value = match.momentumGame;
    }
  }
  if (showMomentum && perspectiveSelect) {
    const activeMomentumGame = getDefaultMomentumGameKey(match, metrics) || match.momentumGame || options[0]?.key || '';
    const sides = getMomentumSides(match, metrics, activeMomentumGame);
    perspectiveSelect.innerHTML = [
      `<option value="1" ${getMomentumPerspectiveTeam(match) === 1 ? 'selected' : ''}>${escapeHtml(sides.side1Label || 'Side 1')}</option>`,
      `<option value="2" ${getMomentumPerspectiveTeam(match) === 2 ? 'selected' : ''}>${escapeHtml(sides.side2Label || 'Side 2')}</option>`
    ].join('');
    if (![1, 2].includes(getMomentumPerspectiveTeam(match))) {
      match.momentumPerspective = 1;
      perspectiveSelect.value = '1';
    }
  }
  const activeMomentumGame = getDefaultMomentumGameKey(match, metrics) || match.momentumGame || options[0]?.key || '';
  if (showMomentum && momentumMeta) {
    momentumMeta.textContent = describeMomentumMeta(match, metrics, activeMomentumGame);
  }
  if (showMomentum && holeMomentum) {
    let running = 0;
    const perspectiveTeam = getMomentumPerspectiveTeam(match);
    holeMomentum.innerHTML = getMomentumHoleResults(match, metrics, activeMomentumGame).map(h => {
      const outcome = computeMomentumOutcome(match, metrics, h, activeMomentumGame);
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
      const txt = outcome === 'pending' ? 'Not played' : formatPerspectiveStatus(running, perspectiveTeam);
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
function getCourseStableIdentity(course = {}) {
  return String(course.cloudCourseId || (course.source === 'supabase' ? course.id : '') || '').trim();
}
function getCourseRenderedIdentity(course = {}) {
  const stable = getCourseStableIdentity(course);
  if (stable) return `cloud:${stable}`;
  const identity = buildCourseIdentity(course);
  return `local:${[identity.name, identity.city, identity.state, identity.country, identity.holeCount || ''].join('|')}`;
}
function isCourseBetterDropdownCandidate(candidate = {}, current = {}, selectedCourseId = '') {
  if (selectedCourseId && String(candidate.id) === String(selectedCourseId)) return true;
  if (selectedCourseId && String(current.id) === String(selectedCourseId)) return false;
  const candidateCloud = !!getCourseStableIdentity(candidate);
  const currentCloud = !!getCourseStableIdentity(current);
  if (candidateCloud !== currentCloud) return candidateCloud;
  const candidateTees = Array.isArray(candidate.tees) ? candidate.tees.length : 0;
  const currentTees = Array.isArray(current.tees) ? current.tees.length : 0;
  if (candidateTees !== currentTees) return candidateTees > currentTees;
  return String(candidate.name || '').localeCompare(String(current.name || '')) < 0;
}
function getDedupedCourseOptions(selectedCourseId = '') {
  const byStableOrName = new Map();
  (state.courses || []).forEach(course => {
    if (!course?.id || !String(course.name || '').trim()) return;
    const key = getCourseRenderedIdentity(course);
    const existing = byStableOrName.get(key);
    if (!existing || isCourseBetterDropdownCandidate(course, existing, selectedCourseId)) byStableOrName.set(key, course);
  });
  const byDisplayName = new Map();
  Array.from(byStableOrName.values()).forEach(course => {
    const identity = buildCourseIdentity(course);
    const key = [identity.name, identity.city, identity.state, identity.country, identity.holeCount || ''].join('|');
    const existing = byDisplayName.get(key);
    if (!existing || isCourseBetterDropdownCandidate(course, existing, selectedCourseId)) byDisplayName.set(key, course);
  });
  return Array.from(byDisplayName.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || '')));
}
function updateCourseLibraryDiagnostics({ cloudCourses = null, localCourses = null, renderedCourseOptions = null } = {}) {
  const prior = uiState.courseLibraryDiagnostics || {};
  uiState.courseLibraryDiagnostics = {
    cloudCourses: cloudCourses == null ? Number(prior.cloudCourses || 0) : Number(cloudCourses) || 0,
    localCourses: localCourses == null ? (state.courses || []).length : Number(localCourses) || 0,
    renderedCourseOptions: renderedCourseOptions == null ? Number(prior.renderedCourseOptions || 0) : Number(renderedCourseOptions) || 0,
  };
  return uiState.courseLibraryDiagnostics;
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
    updateCourseLibraryDiagnostics({
      cloudCourses: cloudCourses.length,
      localCourses: (state.courses || []).length,
      renderedCourseOptions: getDedupedCourseOptions(document.getElementById('matchCourseSelect')?.value || '').length,
    });
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

function normalizeCourseIdentityText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function getCourseHoleCount(course = {}) {
  const teeHoleCounts = (Array.isArray(course.tees) ? course.tees : [])
    .map(tee => Array.isArray(tee.holes) ? tee.holes.length : 0)
    .filter(Boolean);
  if (teeHoleCounts.length) return Math.max(...teeHoleCounts);
  const explicit = Number(course.holeCount ?? course.holes ?? course.num_holes ?? course.number_of_holes);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : null;
}
function buildCourseIdentity(course = {}) {
  return {
    name: normalizeCourseIdentityText(course.name),
    city: normalizeCourseIdentityText(course.city),
    state: normalizeCourseIdentityText(course.state || course.region),
    country: normalizeCourseIdentityText(course.country),
    holeCount: getCourseHoleCount(course),
  };
}
function getCloudCourseMatchKey(course = {}) {
  const identity = buildCourseIdentity(course);
  return [identity.name, identity.city, identity.state, identity.country, identity.holeCount || ''].join('|');
}
function getCloudCourseNameKey(course = {}) {
  return normalizeCourseIdentityText(course?.name);
}
function isSameCourseIdentity(a = {}, b = {}) {
  const left = buildCourseIdentity(a);
  const right = buildCourseIdentity(b);
  if (!left.name || !right.name || left.name !== right.name) return false;
  const scopedFields = ['city', 'state', 'country'];
  for (const field of scopedFields) {
    if (left[field] && right[field] && left[field] !== right[field]) return false;
  }
  if (left.holeCount && right.holeCount && left.holeCount !== right.holeCount) return false;
  return true;
}
function findLikelyDuplicateCourses(course = {}, excludeId = '') {
  return (state.courses || []).filter(existing => String(existing.id || '') !== String(excludeId || '') && isSameCourseIdentity(existing, course));
}
function makeDuplicateCloudCourseError(course, matches = []) {
  const courseName = String(course?.name || 'Course').trim() || 'Course';
  const count = Array.isArray(matches) ? matches.length : 0;
  const err = new Error(`Duplicate cloud course detected. ${count || 'Multiple'} matching cloud records found for ${courseName}. Please remove duplicate cloud courses and try again.`);
  err.code = 'DUPLICATE_CLOUD_COURSE';
  err.courseName = courseName;
  err.matchCount = count;
  err.userMessage = `Duplicate cloud course detected. ${count || 'Multiple'} matching cloud records found.`;
  return err;
}
function formatCourseSyncError(course, err) {
  const courseName = String(course?.name || err?.courseName || 'Course').trim() || 'Course';
  if (err?.code === 'DUPLICATE_CLOUD_COURSE') {
    const count = Number(err.matchCount) || 0;
    return `${courseName}: Duplicate cloud course detected.${count ? ` ${count} matching cloud records found.` : ''} Please resolve duplicate cloud courses before syncing.`;
  }
  const raw = String(err?.message || err || 'Sync failed');
  if (raw.toLowerCase().includes('cannot coerce the result to a single json object')) {
    return `${courseName}: Duplicate cloud course detected. Multiple matching cloud records found. Please resolve duplicate cloud courses before syncing.`;
  }
  return `${courseName}: ${raw}`;
}
function findMatchingCloudCourseRows(cloudRows = [], course = {}) {
  const courseId = String(course?.cloudCourseId || '').trim();
  if (courseId) {
    const byId = (cloudRows || []).filter(row => String(row?.id || '') === courseId);
    if (byId.length) return byId;
  }
  return (cloudRows || []).filter(row => isSameCourseIdentity(row, course));
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
  if (course?.cloudCourseId) {
    const { data: byId, error: idError } = await client.from('courses').select('*').eq('id', String(course.cloudCourseId)).limit(2);
    if (idError) throw idError;
    if ((byId || []).length > 1) throw makeDuplicateCloudCourseError(course, byId);
    if ((byId || []).length === 1) return byId[0];
  }
  const { data, error } = await client.from('courses').select('*');
  if (error) throw error;
  const matches = findMatchingCloudCourseRows(data || [], course);
  if (matches.length > 1) throw makeDuplicateCloudCourseError(course, matches);
  return matches[0] || null;
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

function createCourseSyncDiagnostics() {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    totalMs: 0,
    phases: {
      localScanMs: 0,
      cloudLookupMs: 0,
      duplicateCheckMs: 0,
      courseWriteMs: 0,
      teeSyncMs: 0,
      holeSyncMs: 0,
      skippedCheckMs: 0,
      errorHandlingMs: 0,
      refreshMs: 0,
    },
    perCourse: [],
    _start: now,
  };
}
function courseSyncNow() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function addCourseSyncTiming(target, key, startedAt) {
  if (!target || !key || !startedAt) return;
  const elapsed = Math.max(0, courseSyncNow() - startedAt);
  target[key] = (Number(target[key]) || 0) + elapsed;
}
function finishCourseSyncDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  diagnostics.finishedAt = new Date().toISOString();
  diagnostics.totalMs = Math.max(0, courseSyncNow() - (Number(diagnostics._start) || courseSyncNow()));
  delete diagnostics._start;
  return diagnostics;
}
function formatCourseSyncMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 'Not measured';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}s`;
  return `${Math.round(value)}ms`;
}

async function syncCourseLibrary() {
  const diagnostics = createCourseSyncDiagnostics();
  const finishSummary = summary => {
    summary.diagnostics = finishCourseSyncDiagnostics(diagnostics);
    return summary;
  };
  if (!hasSupabaseConfig()) {
    uiState.cloudCoursesStatus = 'Cloud sync unavailable. Local courses are still available.';
    renderCourses();
    const unavailableSummary = finishSummary({ uploaded: 0, updated: 0, current: 0, failed: 0, errors: ['Cloud sync unavailable. Local courses are still available.'] });
    renderLocalCourseSyncResult(unavailableSummary);
    toast('Cloud sync unavailable. Local courses are still available.');
    return unavailableSummary;
  }
  if (uiState.cloudCoursesLoading) return finishSummary({ uploaded: 0, updated: 0, current: 0, failed: 0 });
  uiState.cloudCoursesLoading = true;
  uiState.cloudCoursesStatus = 'Cloud Course Library: Syncing course library...';
  renderCourses();
  const summary = { uploaded: 0, updated: 0, current: 0, failed: 0, errors: [], diagnostics };
  try {
    const client = await ensureSupabaseClient({ anonymousAuth: false });
    if (!client) throw new Error('Supabase client unavailable.');
    let phaseStarted = courseSyncNow();
    const { data: cloudRows, error: cloudError } = await client.from('courses').select('*');
    addCourseSyncTiming(diagnostics.phases, 'cloudLookupMs', phaseStarted);
    if (cloudError) throw cloudError;
    const cloudRowsList = cloudRows || [];
    phaseStarted = courseSyncNow();
    const cloudByNameKey = new Map();
    cloudRowsList.forEach(row => {
      const key = getCloudCourseNameKey(row);
      if (!key) return;
      if (!cloudByNameKey.has(key)) cloudByNameKey.set(key, []);
      cloudByNameKey.get(key).push(row);
    });
    const localCourses = state.courses.filter(c => c?.name);
    addCourseSyncTiming(diagnostics.phases, 'localScanMs', phaseStarted);
    if (!localCourses.length) {
      uiState.cloudCoursesStatus = 'No local courses found to sync.';
      renderCourses();
      const emptySummary = finishSummary(summary);
      renderLocalCourseSyncResult(emptySummary);
      toast('No local courses found to sync.');
      return emptySummary;
    }
    for (const course of localCourses) {
      const courseTiming = {
        courseName: String(course?.name || 'Course').trim() || 'Course',
        totalMs: 0,
        cloudLookupMs: 0,
        duplicateCheckMs: 0,
        courseWriteMs: 0,
        teeSyncMs: 0,
        holeSyncMs: 0,
        status: 'pending',
      };
      const courseStarted = courseSyncNow();
      diagnostics.perCourse.push(courseTiming);
      const nameKey = getCloudCourseNameKey(course);
      if (!nameKey) {
        courseTiming.status = 'skipped';
        courseTiming.totalMs = Math.max(0, courseSyncNow() - courseStarted);
        continue;
      }
      let existingCourse = null;
      try {
        phaseStarted = courseSyncNow();
        if (course.cloudCourseId) {
          existingCourse = cloudRowsList.find(row => String(row.id) === String(course.cloudCourseId)) || null;
        }
        addCourseSyncTiming(diagnostics.phases, 'cloudLookupMs', phaseStarted);
        addCourseSyncTiming(courseTiming, 'cloudLookupMs', phaseStarted);
        if (!existingCourse) {
          phaseStarted = courseSyncNow();
          const candidates = findMatchingCloudCourseRows(cloudRowsList, course);
          addCourseSyncTiming(diagnostics.phases, 'duplicateCheckMs', phaseStarted);
          addCourseSyncTiming(courseTiming, 'duplicateCheckMs', phaseStarted);
          if (candidates.length > 1) throw makeDuplicateCloudCourseError(course, candidates);
          existingCourse = candidates[0] || null;
        }
        const wasExisting = !!existingCourse;
        const wasPending = course.cloudSyncState === 'pending-sync';
        phaseStarted = courseSyncNow();
        const savedCourse = await insertOrUpdateCloudCourse(client, course, existingCourse);
        addCourseSyncTiming(diagnostics.phases, 'courseWriteMs', phaseStarted);
        addCourseSyncTiming(courseTiming, 'courseWriteMs', phaseStarted);
        const cloudCourseId = String(savedCourse?.id || existingCourse?.id || course.cloudCourseId || '');
        if (!cloudCourseId) throw new Error('Cloud course save did not return a course id.');
        course.cloudCourseId = cloudCourseId;
        course.cloudSyncState = 'synced';
        course.cloudSyncError = '';

        let existingTees = [];
        phaseStarted = courseSyncNow();
        const { data: teeRows, error: teeLoadError } = await client.from('course_tees').select('*').eq('course_id', cloudCourseId);
        addCourseSyncTiming(diagnostics.phases, 'teeSyncMs', phaseStarted);
        addCourseSyncTiming(courseTiming, 'teeSyncMs', phaseStarted);
        if (teeLoadError) throw teeLoadError;
        existingTees = teeRows || [];
        for (const tee of (course.tees || [])) {
          if (!tee?.teeName) continue;
          phaseStarted = courseSyncNow();
          const existingTee = tee.cloudTeeId
            ? existingTees.find(row => String(row.id) === String(tee.cloudTeeId)) || null
            : existingTees.find(row => getCloudTeeMatchKey({ teeName: row.tee_name, gender: row.gender }) === getCloudTeeMatchKey(tee)) || null;
          const savedTee = await insertOrUpdateCloudTee(client, cloudCourseId, tee, existingTee);
          addCourseSyncTiming(diagnostics.phases, 'teeSyncMs', phaseStarted);
          addCourseSyncTiming(courseTiming, 'teeSyncMs', phaseStarted);
          const cloudTeeId = String(savedTee?.id || existingTee?.id || tee.cloudTeeId || '');
          if (!cloudTeeId) continue;
          tee.cloudTeeId = cloudTeeId;
          tee.source = 'supabase';
          phaseStarted = courseSyncNow();
          await insertOrUpdateCloudTeeHoles(client, cloudCourseId, cloudTeeId, tee);
          addCourseSyncTiming(diagnostics.phases, 'holeSyncMs', phaseStarted);
          addCourseSyncTiming(courseTiming, 'holeSyncMs', phaseStarted);
        }
        const updatedKey = getCloudCourseNameKey(savedCourse || course);
        if (updatedKey) cloudByNameKey.set(updatedKey, [{ ...(existingCourse || {}), ...(savedCourse || {}) }]);
        if (!wasExisting) {
          summary.uploaded += 1;
          courseTiming.status = 'uploaded';
        } else if (wasPending) {
          summary.updated += 1;
          courseTiming.status = 'updated';
        } else {
          summary.current += 1;
          courseTiming.status = 'already current';
        }
      } catch (courseErr) {
        const errorStarted = courseSyncNow();
        summary.failed += 1;
        markCoursePendingSync(course, courseErr?.message || 'Course sync failed');
        summary.errors.push(formatCourseSyncError(course, courseErr));
        courseTiming.status = 'requires attention';
        addCourseSyncTiming(diagnostics.phases, 'errorHandlingMs', errorStarted);
      } finally {
        courseTiming.totalMs = Math.max(0, courseSyncNow() - courseStarted);
      }
    }
    persist({ skipRender: true });
    phaseStarted = courseSyncNow();
    await loadSupabaseCourses({ silent: true });
    addCourseSyncTiming(diagnostics.phases, 'refreshMs', phaseStarted);
    uiState.cloudCoursesStatus = `Cloud sync complete: ${summary.uploaded} uploaded, ${summary.updated} updated, ${summary.current} already current, ${summary.failed} require attention.`;
    const finishedSummary = finishSummary(summary);
    renderAll();
    renderLocalCourseSyncResult(finishedSummary);
    toast(`${summary.uploaded} uploaded · ${summary.updated} updated · ${summary.current} current · ${summary.failed} failed`);
    return finishedSummary;
  } catch (err) {
    console.warn('Course library sync failed:', err);
    uiState.cloudCoursesStatus = 'Cloud sync unavailable. Local courses are still available.';
    renderCourses();
    summary.error = err;
    summary.failed = summary.failed || 0;
    summary.errors.push(err?.message || 'Cloud sync unavailable. Local courses are still available.');
    const failedSummary = finishSummary(summary);
    renderLocalCourseSyncResult(failedSummary);
    toast('Cloud sync unavailable. Local courses are still available.');
    return failedSummary;
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
  await loadSupabaseCourses({ silent });
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
  if (match?.courseSnapshot && Array.isArray(match.courseSnapshot.tees) && match.courseSnapshot.tees.length) {
    return JSON.parse(JSON.stringify(match.courseSnapshot));
  }
  const course = getCourse(match.courseId);
  const selectedTeeIds = [...new Set([match.teeId, ...(match.players || []).map(p => p.teeId)].filter(Boolean))];
  const comboSourceIds = selectedTeeIds.flatMap(teeId => {
    const tee = getTee(match.courseId, teeId);
    return tee?.isCombo ? (tee.comboSources || []).map(source => source?.sourceTeeId).filter(Boolean) : [];
  });
  const teeIds = [...new Set([...selectedTeeIds, ...comboSourceIds])];
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
    greeniesCfg.suggestionsByHole = { ...(match?.greeniesSuggestions || {}) };
  }
  return games;
}
function extractGreeniesWinnersFromSelectedGames(selectedGames) {
  const greeniesCfg = (selectedGames || []).find(g => g.key === 'greenies');
  const winners = greeniesCfg?.winnersByHole;
  return winners && typeof winners === 'object' ? { ...winners } : {};
}
function extractGreeniesSuggestionsFromSelectedGames(selectedGames) {
  const greeniesCfg = (selectedGames || []).find(g => g.key === 'greenies');
  const suggestions = greeniesCfg?.suggestionsByHole;
  return suggestions && typeof suggestions === 'object' ? { ...suggestions } : {};
}
function applyCurrentHoleDomToMatch(match, options = {}) {
  if (!match) return false;
  const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
  const holeMeta = scoringHoles[currentHole - 1] || null;
  const actualHoleNumber = holeMeta?.holeNumber || currentHole;
  let mutated = false;
  document.querySelectorAll('input[data-score-player]').forEach(input => {
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
    document.querySelectorAll('input[data-stat-player][data-stat-key]').forEach(input => {
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
  const existingSuggestion = match.greeniesSuggestions?.[String(actualHoleNumber)] || '';
  const isHostDevice = isCurrentDeviceMatchHost(match);
  if (selectedWinner) {
    if (isHostDevice) {
      if (!match.greeniesWinners) match.greeniesWinners = {};
      if (existingWinner !== selectedWinner) {
        match.greeniesWinners[String(actualHoleNumber)] = selectedWinner;
        if (match.greeniesSuggestions) delete match.greeniesSuggestions[String(actualHoleNumber)];
        mutated = true;
      }
    } else {
      if (!match.greeniesSuggestions) match.greeniesSuggestions = {};
      if (existingSuggestion !== selectedWinner) {
        match.greeniesSuggestions[String(actualHoleNumber)] = selectedWinner;
        mutated = true;
      }
    }
  } else if (isHostDevice && existingWinner) {
    delete match.greeniesWinners[String(actualHoleNumber)];
    mutated = true;
  } else if (!isHostDevice && existingSuggestion) {
    delete match.greeniesSuggestions[String(actualHoleNumber)];
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
    const nextSuggestions = { ...(match.greeniesSuggestions || {}) };
    if (JSON.stringify(greeniesCfg.winnersByHole || {}) !== JSON.stringify(nextWinners)) {
      greeniesCfg.winnersByHole = nextWinners;
      mutated = true;
    }
    if (JSON.stringify(greeniesCfg.suggestionsByHole || {}) !== JSON.stringify(nextSuggestions)) {
      greeniesCfg.suggestionsByHole = nextSuggestions;
      mutated = true;
    }
  }
  if (isSneakySandyPoleyEnabled(match)) {
    const prior = getSneakySandyPoleyHoleInput(match, actualHoleNumber);
    const next = normalizeSneakySandyPoleyHoleInput(match, prior, actualHoleNumber);
    document.querySelectorAll('[data-ssp-player][data-ssp-key]').forEach(input => {
      const playerId = input.dataset.sspPlayer || '';
      const key = input.dataset.sspKey || '';
      if (!next.players[playerId] || !['sneaky', 'sandy', 'poley', 'greeny'].includes(key)) return;
      next.players[playerId][key] = !!input.checked;
    });
    Object.values(next.players).forEach(row => { if (row.sandy) row.sneaky = true; });
    const prox = document.querySelector('[data-ssp-prox]');
    const requestedProxPlayerId = prox ? String(prox.value || '') : next.proxPlayerId;
    document.querySelectorAll('[data-ssp-hole-key]').forEach(input => {
      const key = input.dataset.sspHoleKey || '';
      if (key === 'bridge' || key === 'rebridge') next[key] = !!input.checked;
    });
    const notes = document.querySelector('[data-ssp-notes]');
    if (notes) next.notes = String(notes.value || '').slice(0, 240);
    const proxState = resolveSneakySandyPoleyProxSelection(
      next,
      (match.players || []).map(player => ({ playerId: player.playerId })),
      { requestedProxPlayerId, forceTbdOnMultiple: !!options.sspGreenyChanged }
    );
    next.proxPlayerId = proxState.proxPlayerId;
    if (!getSneakySandyPoleyConfig(match)?.allowBridgeRebridge) {
      next.bridge = false;
      next.rebridge = false;
    }
    const before = JSON.stringify(prior);
    const after = JSON.stringify(next);
    if (before !== after) {
      match.sneakySandyPoleyInputs = match.sneakySandyPoleyInputs && typeof match.sneakySandyPoleyInputs === 'object' ? match.sneakySandyPoleyInputs : {};
      match.sneakySandyPoleyInputs[String(actualHoleNumber)] = next;
      match.sharedSspUpdatedAt = new Date().toISOString();
      match.sharedSspSourceDeviceId = getSharedDeviceId();
      match.sharedSspSyncState = match.storageMode === 'shared' ? 'pending' : 'not-applicable';
      mutated = true;
    }
  }
  return mutated;
}
function scheduleSharedActiveMatchSyncFromDom({ immediate = false, silent = true, persistLocal = true, applyOptions = {} } = {}) {
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared') return;
  const mutated = applyCurrentHoleDomToMatch(match, applyOptions);
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
        assignedDeviceId: getAssignedDeviceForPlayer(match, player.id) || match.sharedHostDeviceId || getSharedDeviceId(),
        assignedParticipantId: getAssignedParticipantForPlayer(match, player.id) || match.sharedHostParticipantId || getCurrentSharedParticipantId(match),
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
    created_by: null,
    name: match.name || 'Round',
    match_date: match.date || todayIso(),
    status: match.status || 'active',
    course_id: match.courseId || '',
    reference_tee_id: match.teeId || '',
    course_snapshot: { ...courseSnapshot, sharedMatchMeta: { scoringAccessMode: normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'single_device'), matchCode: normalizeMatchCode(match.sharedMatchCode || match.sharedMatchRef || match.sharedMatchId || ''), hostDeviceId: match.sharedHostDeviceId || getSharedDeviceId(), hostParticipantId: match.sharedHostParticipantId || getCurrentSharedParticipantId(match), devices: Array.isArray(match.sharedDevices) ? match.sharedDevices : [], participants: getSharedAssignmentParticipants(match), playerAssignments: match.sharedPlayerAssignments || {}, memories: getRoundMemories(match), memoriesUpdatedAt: new Date().toISOString(), roundContext: normalizeRoundContext(match.roundContext), roundTiming: match.roundTiming || { startedAt: null, endedAt: null }, holeFirstCompletedAt: match.holeFirstCompletedAt || {}, sspFacts: buildSharedSspFacts(match) } },
    format: match.format || 'teams',
    allowance: Number(match.allowance) || 100,
    hole_count: getRequestedHoleCount(match),
    nine_hole_segment: getNineHoleSegment(match),
    custom_start_hole: Number(match.customStartHole) || 1,
    team_count: Number(match.teamCount) || 1,
    players_per_team: Number(match.playersPerTeam) || 1,
    scoring_access_mode: normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'single_device') === 'assigned_players' ? 'team_codes' : normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'single_device'),
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
      if (!shouldUploadSharedPlayerHoleEntry(match, mp.playerId, holeNumber)) continue;
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
    body: String(match.roundRecapNotes || match.notes || ''),
    updated_at: createdAt,
    updated_by: organizerUserId,
  };
  const membership = organizerUserId ? {
    id: `${match.sharedMatchId || match.id}:member:${organizerUserId}:${getSharedDeviceId()}`,
    match_id: match.sharedMatchId || match.id,
    user_id: organizerUserId,
    role: isCurrentDeviceMatchHost(match) ? 'organizer' : 'team_scorer',
    team_id: null,
    team_number: null,
    status: 'active',
    joined_at: createdAt,
    last_seen_at: createdAt,
    device_label: getSharedDeviceLabelPayload(match),
  } : null;
  return { matchRow, teams, players, scoreEntries, notesRow, membership };
}
async function uploadSharedMatch(match) {
  const client = await ensureSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const user = await getSupabaseUser();
  ensureSharedParticipantRegistered(match, isCurrentDeviceMatchHost(match) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
  migrateSharedPlayerAssignmentsToParticipants(match);
  const payload = buildCloudMatchPayload(match, user?.id || null);
  // buildCloudMatchPayload() stamps course_snapshot.sharedMatchMeta.memories from
  // LOCAL state only. A raw upsert of matchRow therefore clobbers memories (and can
  // drop devices/assignments) that another device published since our last poll.
  // The host uploads far more often (200ms debounce while scoring) than it polls
  // memories (30s), so without this it repeatedly stomps a joined device's freshly
  // published memory. Re-read the live row and union before writing.
  try {
    const { data: liveRow, error: liveReadError } = await client
      .from('matches').select('id,course_snapshot').eq('id', payload.matchRow.id).maybeSingle();
    if (liveReadError) throw liveReadError;
    const liveSnapshot = liveRow?.course_snapshot && typeof liveRow.course_snapshot === 'object' ? liveRow.course_snapshot : null;
    const liveMeta = liveSnapshot?.sharedMatchMeta && typeof liveSnapshot.sharedMatchMeta === 'object' ? liveSnapshot.sharedMatchMeta : null;
    if (liveMeta) {
      const payloadMeta = payload.matchRow.course_snapshot.sharedMatchMeta;
      // Memories: union live + local so no device's memory is ever lost.
      const mergedMemories = mergeRoundMemoryLists(liveMeta.memories || [], payloadMeta.memories || []);
      payloadMeta.memories = mergedMemories;
      payloadMeta.memoriesUpdatedAt = new Date().toISOString();
      match.memories = mergedMemories;
      const liveRoundContext = normalizeRoundContext(liveMeta.roundContext || {});
      const payloadRoundContext = normalizeRoundContext(payloadMeta.roundContext || {});
      if (liveRoundContext.weather && !payloadRoundContext.weather) {
        payloadMeta.roundContext = liveRoundContext;
        match.roundContext = liveRoundContext;
      }
      // Devices: union so a just-joined device isn't dropped by a host upload.
      payloadMeta.devices = normalizeSharedDeviceList(
        [...(Array.isArray(liveMeta.devices) ? liveMeta.devices : []), ...(Array.isArray(payloadMeta.devices) ? payloadMeta.devices : [])],
        match
      );
      payloadMeta.participants = normalizeSharedParticipantList(
        [...(Array.isArray(liveMeta.participants) ? liveMeta.participants : []), ...(Array.isArray(payloadMeta.participants) ? payloadMeta.participants : [])],
        payloadMeta.devices,
        match
      );
      // Assignments: the host owns the assignment map. A non-host upload must not
      // overwrite it, so keep the live copy unless we are the host.
      if (!isCurrentDeviceMatchHost(match) && liveMeta.playerAssignments && typeof liveMeta.playerAssignments === 'object') {
        payloadMeta.playerAssignments = liveMeta.playerAssignments;
      }
      if (payloadMeta.sspFacts || liveMeta.sspFacts) {
        if ((match.sharedSspConflicts || []).length) {
          payloadMeta.sspFacts = liveMeta.sspFacts || payloadMeta.sspFacts;
          match.sharedSspSyncState = 'conflict';
        } else {
        const result = reconcileSharedSspFacts(payloadMeta.sspFacts, liveMeta.sspFacts, match.sharedSspBaseline, { isHost: isCurrentDeviceMatchHost(match) });
        if (result.conflicts.length) {
          match.sharedSspConflicts = result.conflicts;
          match.sharedSspSyncState = 'conflict';
          payloadMeta.sspFacts = liveMeta.sspFacts || payloadMeta.sspFacts;
        } else {
          payloadMeta.sspFacts = result.facts;
          match.sharedSspConflicts = [];
          match.sharedSspSyncState = 'synced';
          if (result.facts) applySharedSspFacts(match, result.facts);
        }
        }
      }
    }
  } catch (err) {
    console.warn('Could not merge live shared metadata before upload; proceeding with local snapshot.', err);
  }
  let response = await client.from('matches').upsert(payload.matchRow, { onConflict: 'id' });
  if (response.error) throw response.error;
  if (payload.membership) {
    response = await client.from('match_memberships').upsert(payload.membership, { onConflict: 'id' });
    if (response.error) throw response.error;
  }
  if (payload.teams.length) {
    response = await client.from('match_teams').upsert(payload.teams, { onConflict: 'id' });
    if (response.error) throw response.error;
  }
  if (payload.players.length) {
    response = await client.from('match_players').upsert(payload.players, { onConflict: 'id' });
    if (response.error) throw response.error;
  }
  if (payload.scoreEntries.length) {
    response = await client.from('score_entries').upsert(payload.scoreEntries, { onConflict: 'id' });
    if (response.error) throw response.error;
  }
  response = await client.from('match_notes').upsert(payload.notesRow, { onConflict: 'match_id' });
  if (response.error) throw response.error;
  match.storageMode = 'shared';
  match.sharedMatchId = payload.matchRow.id;
  match.sharedMatchRef = payload.matchRow.id;
  match.sharedOwnerUserId = user?.id || null;
  match.cloudSyncState = 'cloud-synced';
  match.lastCloudSyncAt = new Date().toISOString();
  match.lastSharedScorePushAt = match.lastCloudSyncAt;
  match.lastSharedSyncError = '';
  if (payload.matchRow.course_snapshot.sharedMatchMeta.sspFacts && !(match.sharedSspConflicts || []).length) {
    match.sharedSspBaseline = JSON.parse(JSON.stringify(payload.matchRow.course_snapshot.sharedMatchMeta.sspFacts));
    match.sharedSspSyncState = 'synced';
  }
  rememberSharedMatchId(match.sharedMatchId);
  return match;
}
async function fetchSharedMatchBundle(matchId) {
  const client = await ensureSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const [{ data: matchRow, error: matchError }, { data: teams, error: teamsError }, { data: players, error: playersError }, { data: scoreEntries, error: scoresError }, { data: notesRows, error: notesError }, { data: memberships, error: membershipsError }] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).maybeSingle(),
    client.from('match_teams').select('*').eq('match_id', matchId).order('team_number'),
    client.from('match_players').select('*').eq('match_id', matchId).order('team_number').order('slot'),
    client.from('score_entries').select('*').eq('match_id', matchId).order('hole_number'),
    client.from('match_notes').select('*').eq('match_id', matchId).limit(1),
    client.from('match_memberships').select('*').eq('match_id', matchId).eq('status', 'active').order('joined_at'),
  ]);
  if (matchError) throw matchError;
  if (teamsError) throw teamsError;
  if (playersError) throw playersError;
  if (scoresError) throw scoresError;
  if (notesError) throw notesError;
  if (membershipsError) console.warn('Could not read shared match memberships.', membershipsError);
  if (!matchRow) throw new Error('Shared match not found.');
  const bundle = { matchRow, teams: teams || [], players: players || [], scoreEntries: scoreEntries || [], notes: notesRows?.[0] || null, memberships: memberships || [] };
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
  const { matchRow, teams = [], players = [], scoreEntries = [], notes = null, memberships = [] } = bundle || {};
  const sharedMeta = matchRow?.course_snapshot?.sharedMatchMeta || {};
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
    scoringAccessMode: normalizeScoringAccessMode(sharedMeta.scoringAccessMode || matchRow?.scoring_access_mode || 'single_device'),
    officialScorerName: 'Official scorer',
    statTrackingEnabled: !!matchRow?.stat_tracking_enabled,
    teamScorers: buildTeamScorerAssignments(Number(matchRow?.team_count) || Math.max(1, teamNames.length || 1), teamNames, []),
    sharedMatchCode: normalizeMatchCode(sharedMeta.matchCode || matchRow?.id || ''),
    sharedHostDeviceId: sharedMeta.hostDeviceId || '',
    sharedDevices: normalizeSharedDeviceList([...(Array.isArray(sharedMeta.devices) ? sharedMeta.devices : []), ...(memberships || []).map(row => getSharedMembershipDeviceRecord(row)).filter(Boolean)], { sharedHostDeviceId: sharedMeta.hostDeviceId || '' }),
    sharedParticipants: normalizeSharedParticipantList([...(Array.isArray(sharedMeta.participants) ? sharedMeta.participants : []), ...(memberships || []).map(row => getSharedMembershipParticipantRecord(row)).filter(Boolean)], [...(Array.isArray(sharedMeta.devices) ? sharedMeta.devices : []), ...(memberships || []).map(row => getSharedMembershipDeviceRecord(row)).filter(Boolean)], { sharedHostDeviceId: sharedMeta.hostDeviceId || '', sharedHostParticipantId: sharedMeta.hostParticipantId || '' }),
    sharedHostParticipantId: sharedMeta.hostParticipantId || '',
    sharedPlayerAssignments: sharedMeta.playerAssignments && typeof sharedMeta.playerAssignments === 'object' ? sharedMeta.playerAssignments : {},
    memories: Array.isArray(sharedMeta.memories) ? sharedMeta.memories.map(m => normalizeRoundMemory(m)).filter(Boolean) : [],
    roundContext: normalizeRoundContext(sharedMeta.roundContext || {}),
    roundTiming: sharedMeta.roundTiming && typeof sharedMeta.roundTiming === 'object' ? { ...sharedMeta.roundTiming } : { startedAt: null, endedAt: null },
    sneakySandyPoleyInputs: JSON.parse(JSON.stringify(sharedMeta.sspFacts?.inputs || {})),
    playedHoleOrder: Array.isArray(sharedMeta.sspFacts?.playedHoleOrder) ? [...sharedMeta.sspFacts.playedHoleOrder] : [],
    holeFirstCompletedAt: { ...(sharedMeta.holeFirstCompletedAt || sharedMeta.sspFacts?.holeFirstCompletedAt || {}) },
    sharedSspBaseline: sharedMeta.sspFacts ? JSON.parse(JSON.stringify(sharedMeta.sspFacts)) : null,
    sharedSspSyncState: sharedMeta.sspFacts ? 'synced' : 'not-applicable',
    sharedSspConflicts: [],
    notes: String(notes?.body || ''),
    roundRecapNotes: String(notes?.body || ''),
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
    greeniesSuggestions: extractGreeniesSuggestionsFromSelectedGames(matchRow?.selected_games || []),
    matchStatusGame: matchRow?.match_status_game || getDefaultFeaturedGameKey(matchRow?.selected_games || []),
    momentumGame: matchRow?.momentum_game || matchRow?.match_status_game || getDefaultFeaturedGameKey(matchRow?.selected_games || []),
    momentumPerspective: Number(matchRow?.momentum_perspective || 1) === 2 ? 2 : 1,
    activeScoreRole: 'official_scorer',
    activeScoreTeam: 1,
    lastTouchedHole: Number(matchRow?.last_touched_hole || 0) || 0,
    lastFullyCompletedHole: Number(matchRow?.last_fully_completed_hole || 0) || 0,
  };
  (players || []).forEach(row => {
    const assigned = row?.handicap_snapshot?.assignedParticipantId || row?.handicap_snapshot?.assignedDeviceId;
    if (row?.player_id && assigned && !hydrated.sharedPlayerAssignments[row.player_id]) hydrated.sharedPlayerAssignments[row.player_id] = assigned;
  });
  ensureSharedParticipantRegistered(hydrated, hydrated.sharedHostDeviceId ? '' : 'Device');
  migrateSharedPlayerAssignmentsToParticipants(hydrated);
  normalizeMatch(hydrated);
  if (notes?.body && !state.notes) state.notes = String(notes.body);
  return hydrated;
}

function mergeRemoteScoreEntriesIntoMatch(match, scoreEntries = []) {
  if (!match || !Array.isArray(scoreEntries) || !scoreEntries.length) return false;
  const remoteLedger = extractRemoteScoredLedger(match, scoreEntries);
  const mergeResult = mergeSharedScoredLedgerIntoMatch(match, remoteLedger);
  const comparison = compareScoredLedgers(extractLocalScoredLedger(match), remoteLedger);
  recordSharedLedgerParity(match, comparison);
  return mergeResult.changed;
}
async function pullSharedScoreEntries(match, { silent = true, render = true } = {}) {
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  try {
    const client = await ensureSupabaseClient();
    if (!client) return false;
    const { data, error } = await client.from('score_entries').select('*').eq('match_id', match.sharedMatchId).eq('entry_status', 'active').order('hole_number');
    if (error) throw error;
    const changed = mergeRemoteScoreEntriesIntoMatch(match, data || []);
    if (changed) {
      match.cloudSyncState = 'cloud-synced';
      match.lastCloudSyncAt = new Date().toISOString();
      match.lastSharedScorePullAt = match.lastCloudSyncAt;
      match.lastSharedSyncError = '';
      persist({ skipRender: true });
      if (render) renderAll();
      if (!silent) toast('Shared scores updated.');
    } else {
      match.lastSharedScorePullAt = new Date().toISOString();
      match.lastSharedSyncError = '';
      persist({ skipRender: true });
    }
    return changed;
  } catch (err) {
    console.warn('Shared score pull failed.', err);
    match.lastSharedSyncError = getSharedFriendlyError(err);
    persist({ skipRender: true });
    if (!silent) toast('Could not refresh shared scores. Local scoring is still saved.');
    return false;
  }
}
async function refreshActiveSharedScores({ silent = true, render = true } = {}) {
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared') return false;
  return pullSharedScoreEntries(match, { silent, render });
}
async function reconcileSharedMatchBeforeSummary(match, { silent = true } = {}) {
  if (!match || match.storageMode !== 'shared') return { parityConfirmed: true, status: 'not-shared' };
  const checkedAt = new Date().toISOString();
  match.sharedLedgerParity = summarizeLedgerParity(compareScoredLedgers(extractLocalScoredLedger(match), []), {
    checkedAt,
    warning: 'Shared Match scores may not be fully reconciled on this device. Pull latest scores before creating a final Match Summary.',
  });
  if (!match.sharedMatchId || !hasSupabaseConfig()) {
    match.lastSharedParityCheckAt = checkedAt;
    persist({ skipRender: true });
    if (!silent) toast('Shared Match scores may not be fully reconciled on this device.');
    return match.sharedLedgerParity;
  }
  try {
    const client = await ensureSupabaseClient();
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client.from('score_entries').select('*').eq('match_id', match.sharedMatchId).eq('entry_status', 'active').order('hole_number');
    if (error) throw error;
    const remoteLedger = extractRemoteScoredLedger(match, data || []);
    mergeSharedScoredLedgerIntoMatch(match, remoteLedger);
    await mergeCloudSharedMetadata(match, { includeAssignments: !isCurrentDeviceMatchHost(match), includeMemories: true });
    const comparison = compareScoredLedgers(extractLocalScoredLedger(match), remoteLedger);
    const parity = recordSharedLedgerParity(match, comparison, { checkedAt: new Date().toISOString() });
    match.lastSharedScorePullAt = parity.checkedAt;
    match.lastSharedSyncError = '';
    persist({ skipRender: true });
    if ((!parity.parityConfirmed || (match.sharedSspConflicts || []).length) && !silent) toast((match.sharedSspConflicts || []).length ? 'SSP conflicts must be resolved before final settlement.' : 'Shared Match scores may not be fully reconciled on this device.');
    return parity;
  } catch (err) {
    console.warn('Shared summary reconciliation failed.', err);
    const parity = recordSharedLedgerParity(match, compareScoredLedgers(extractLocalScoredLedger(match), []), {
      checkedAt: new Date().toISOString(),
      warning: 'Shared Match reconciliation was not confirmed before this summary was generated.',
    });
    match.lastSharedSyncError = getSharedFriendlyError(err);
    persist({ skipRender: true });
    if (!silent) toast('Shared Match scores may not be fully reconciled on this device.');
    return parity;
  }
}
function startSharedScoreRefresh() {
  if (sharedScoreRefreshTimer) return;
  sharedScoreRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const match = getActiveMatch();
    if (!match || match.storageMode !== 'shared' || match.status === 'complete') return;
    const activePanel = document.querySelector('.panel.active')?.id || '';
    if (activePanel !== 'score' && activePanel !== 'leaderboard') return;
    refreshActiveSharedScores({ silent: true, render: true });
  }, SHARED_SCORE_REFRESH_MS);
}
function setLastOpenedSharedMatch(matchOrId = null) {
  const match = typeof matchOrId === 'string' ? getMatch(matchOrId) : matchOrId;
  const sharedId = match?.sharedMatchId || match?.sharedMatchRef || (typeof matchOrId === 'string' ? String(matchOrId || '').trim() : '');
  state.lastOpenedSharedMatchId = sharedId || null;
}

async function fetchSharedMatchMetadata(matchId, match = null) {
  const client = await ensureSupabaseClient();
  if (!client) return { devices: [], playerAssignments: null, memories: [], sspFacts: null };
  const [{ data: matchRow, error: matchError }, { data: memberships, error: membershipsError }] = await Promise.all([
    client.from('matches').select('id,course_snapshot,updated_at').eq('id', matchId).maybeSingle(),
    client.from('match_memberships').select('*').eq('match_id', matchId).eq('status', 'active').order('joined_at'),
  ]);
  if (matchError) throw matchError;
  if (membershipsError) console.warn('Could not refresh shared participants.', membershipsError);
  const meta = matchRow?.course_snapshot?.sharedMatchMeta || {};
  const devices = normalizeSharedDeviceList([
    ...(Array.isArray(meta.devices) ? meta.devices : []),
    ...((memberships || []).map(row => getSharedMembershipDeviceRecord(row, match)).filter(Boolean)),
  ], match || { sharedHostDeviceId: meta.hostDeviceId || '' });
  const participants = normalizeSharedParticipantList([
    ...(Array.isArray(meta.participants) ? meta.participants : []),
    ...((memberships || []).map(row => getSharedMembershipParticipantRecord(row, match)).filter(Boolean)),
  ], devices, match || { sharedHostDeviceId: meta.hostDeviceId || '', sharedHostParticipantId: meta.hostParticipantId || '' });
  const playerAssignments = meta.playerAssignments && typeof meta.playerAssignments === 'object' ? meta.playerAssignments : null;
  latestSharedAssignmentMetadataSnapshot = {
    matchId,
    fetchedAt: new Date().toISOString(),
    devices,
    participants,
    playerAssignments,
    memberships: (memberships || []).map(row => ({ id: row.id, user_id: row.user_id, role: row.role, status: row.status, device_label: row.device_label, joined_at: row.joined_at, last_seen_at: row.last_seen_at })),
  };
  return {
    devices,
    participants,
    playerAssignments,
    memories: Array.isArray(meta.memories) ? meta.memories : [],
    sspFacts: meta.sspFacts && typeof meta.sspFacts === 'object' ? meta.sspFacts : null,
  };
}
async function fetchSharedParticipantDevices(matchId, match = null) {
  const meta = await fetchSharedMatchMetadata(matchId, match);
  return meta.devices || [];
}

async function refreshSharedDevicesForAssignment(match) {
  if (!match || match.storageMode !== 'shared') return getSharedAssignmentParticipants(match);
  ensureSharedParticipantRegistered(match, isCurrentDeviceMatchHost(match) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
  if (!match.sharedMatchId || !hasSupabaseConfig()) {
    match.sharedDevices = normalizeSharedDeviceList(match.sharedDevices || [], match);
    match.sharedParticipants = normalizeSharedParticipantList(match.sharedParticipants || [], match.sharedDevices || [], match);
    migrateSharedPlayerAssignmentsToParticipants(match);
    match.sharedDevicesHydratedForAssignmentAt = new Date().toISOString();
    return getSharedAssignmentParticipants(match);
  }
  const meta = await fetchSharedMatchMetadata(match.sharedMatchId, match);
  const mergedDevices = normalizeSharedDeviceList([...(match.sharedDevices || []), ...(meta.devices || [])], match);
  const mergedParticipants = normalizeSharedParticipantList([...(match.sharedParticipants || []), ...(meta.participants || [])], mergedDevices, match);
  match.sharedDevices = mergedDevices;
  match.sharedParticipants = mergedParticipants;
  match.sharedDevicesHydratedForAssignmentAt = new Date().toISOString();
  if (meta.playerAssignments && typeof meta.playerAssignments === 'object' && !isCurrentDeviceMatchHost(match)) {
    match.sharedPlayerAssignments = { ...(match.sharedPlayerAssignments || {}), ...meta.playerAssignments };
    migrateSharedPlayerAssignmentsToParticipants(match);
  } else {
    migrateSharedPlayerAssignmentsToParticipants(match);
  }
  if (Array.isArray(meta.memories) && meta.memories.length) {
    mergeRoundMemories(match, meta.memories, { source: 'shared' });
  }
  console.debug('[SharedParticipant]', { fetchedParticipants: meta.participants || [], mergedParticipants, hydratedAt: match.sharedDevicesHydratedForAssignmentAt });
  console.debug('[SharedAssignmentMap]', 'refreshSharedDevicesForAssignment', { currentParticipantId: getCurrentSharedParticipantId(match), participants: mergedParticipants, playerAssignments: match.sharedPlayerAssignments || {} });
  console.debug('[AssignmentOptions]', { options: mergedParticipants.map(p => ({ participantId: p.participantId, name: p.deviceName || p.name })), ready: mergedParticipants.some(p => String(p.participantId) !== String(match.sharedHostParticipantId || '')) });
  return mergedParticipants;
}
async function mergeCloudSharedMetadata(match, { includeAssignments = false, includeMemories = true } = {}) {
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  const localAssignmentsBefore = { ...((match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object') ? match.sharedPlayerAssignments : {}) };
  const localParticipantsBefore = getSharedAssignmentParticipants(match);
  const meta = await fetchSharedMatchMetadata(match.sharedMatchId, match);
  let changed = mergeSharedDevices(match, meta.devices || []);
  const beforeParticipants = JSON.stringify(getSharedAssignmentParticipants(match));
  match.sharedParticipants = normalizeSharedParticipantList([...(match.sharedParticipants || []), ...(meta.participants || [])], match.sharedDevices || [], match);
  if (JSON.stringify(match.sharedParticipants || []) !== beforeParticipants) changed = true;
  if (includeAssignments && meta.playerAssignments && typeof meta.playerAssignments === 'object') {
    const before = JSON.stringify(match.sharedPlayerAssignments || {});
    match.sharedPlayerAssignments = { ...(match.sharedPlayerAssignments || {}), ...meta.playerAssignments };
    migrateSharedPlayerAssignmentsToParticipants(match);
    if (JSON.stringify(match.sharedPlayerAssignments || {}) !== before) changed = true;
  } else {
    migrateSharedPlayerAssignmentsToParticipants(match);
  }
  if (includeMemories && Array.isArray(meta.memories) && meta.memories.length) {
    changed = mergeRoundMemories(match, meta.memories, { source: 'shared' }) || changed;
  }
  if (isSneakySandyPoleyEnabled(match) || meta.sspFacts) {
    if ((match.sharedSspConflicts || []).length) {
      match.sharedSspSyncState = 'conflict';
    } else {
    const result = reconcileSharedSspFacts(buildSharedSspFacts(match), meta.sspFacts, match.sharedSspBaseline, { isHost: isCurrentDeviceMatchHost(match) });
    match.sharedSspConflicts = result.conflicts;
    if (result.conflicts.length) {
      match.sharedSspSyncState = 'conflict';
    } else if (result.facts) {
      changed = applySharedSspFacts(match, result.facts) || changed;
      match.sharedSspSyncState = 'synced';
      match.lastSharedSspPullAt = new Date().toISOString();
    }
    }
  }
  console.debug('[SharedAssignmentMap]', 'mergeCloudSharedMetadata', {
    includeAssignments,
    includeParticipants: true,
    incomingAssignments: meta.playerAssignments || null,
    incomingParticipants: meta.participants || [],
    localAssignmentsBefore,
    localAssignmentsAfter: match.sharedPlayerAssignments || {},
    localParticipantsBefore,
    localParticipantsAfter: getSharedAssignmentParticipants(match),
  });
  return changed;
}

function getSharedAssignmentDevices(match) {
  if (!match) return [];
  return normalizeSharedDeviceList(Array.isArray(match.sharedDevices) ? match.sharedDevices : [], match);
}
function isValidSharedAssignmentDeviceId(match, deviceId) {
  const id = String(deviceId || '').trim();
  if (!match || !id) return false;
  return getSharedAssignmentDevices(match).some(device => String(device.id) === id);
}
function isValidSharedAssignmentParticipantId(match, participantId) {
  const id = String(participantId || '').trim();
  if (!match || !id) return false;
  return getSharedAssignmentParticipants(match).some(participant => String(participant.participantId) === id);
}
async function publishSharedPlayerAssignments(match) {
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  if (!isCurrentDeviceMatchHost(match)) return false;
  const client = await ensureSupabaseClient();
  if (!client) return false;
  const { data: matchRow, error: readError } = await client.from('matches').select('id,course_snapshot').eq('id', match.sharedMatchId).maybeSingle();
  if (readError) throw readError;
  const snapshot = matchRow?.course_snapshot && typeof matchRow.course_snapshot === 'object' ? matchRow.course_snapshot : {};
  const existingMeta = snapshot.sharedMatchMeta && typeof snapshot.sharedMatchMeta === 'object' ? snapshot.sharedMatchMeta : {};
  const devices = normalizeSharedDeviceList([...(Array.isArray(existingMeta.devices) ? existingMeta.devices : []), ...(match.sharedDevices || [])], match);
  mergeSharedDevices(match, devices);
  const participants = normalizeSharedParticipantList([...(Array.isArray(existingMeta.participants) ? existingMeta.participants : []), ...(match.sharedParticipants || [])], devices, match);
  match.sharedParticipants = participants;
  migrateSharedPlayerAssignmentsToParticipants(match);
  const assignments = { ...((match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object') ? match.sharedPlayerAssignments : {}) };
  const nextSnapshot = {
    ...snapshot,
    sharedMatchMeta: {
      ...existingMeta,
      scoringAccessMode: normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || existingMeta.scoringAccessMode || 'single_device'),
      matchCode: normalizeMatchCode(match.sharedMatchCode || match.sharedMatchRef || match.sharedMatchId || existingMeta.matchCode || ''),
      hostDeviceId: match.sharedHostDeviceId || existingMeta.hostDeviceId || getSharedDeviceId(),
      hostParticipantId: match.sharedHostParticipantId || existingMeta.hostParticipantId || getCurrentSharedParticipantId(match),
      devices,
      participants,
      playerAssignments: assignments,
      playerAssignmentsUpdatedAt: new Date().toISOString(),
      memories: mergeRoundMemoryLists(existingMeta.memories || [], match.memories || []),
      memoriesUpdatedAt: existingMeta.memoriesUpdatedAt || null,
    },
  };
  const { error: updateError } = await client.from('matches').update({ course_snapshot: nextSnapshot, updated_at: new Date().toISOString() }).eq('id', match.sharedMatchId);
  if (updateError) throw updateError;
  console.debug('[SharedAssignmentMap]', 'publishSharedPlayerAssignments', { devices, assignments, matchId: match.sharedMatchId });
  return true;
}
async function setSharedPlayerAssignment(match, playerId, participantId) {
  if (!match || !isCurrentDeviceMatchHost(match)) return false;
  const pid = String(playerId || '').trim();
  let assignedParticipantId = String(participantId || '').trim();
  if (!pid || !assignedParticipantId) return false;
  migrateSharedPlayerAssignmentsToParticipants(match);
  assignedParticipantId = resolveAssignmentValueToParticipantId(match, assignedParticipantId);
  if (!isValidSharedAssignmentParticipantId(match, assignedParticipantId)) {
    try {
      await refreshSharedDevicesForAssignment(match);
      assignedParticipantId = resolveAssignmentValueToParticipantId(match, assignedParticipantId);
    } catch (err) {
      console.warn('On-demand participant refresh before assignment failed.', err);
    }
    if (!isValidSharedAssignmentParticipantId(match, assignedParticipantId)) {
      toast('That participant is no longer available. Refresh participants and try again.');
      return false;
    }
  }
  match.sharedPlayerAssignments = match.sharedPlayerAssignments && typeof match.sharedPlayerAssignments === 'object' ? match.sharedPlayerAssignments : {};
  const assignmentMapBefore = { ...match.sharedPlayerAssignments };
  const selectedParticipant = getSharedParticipantById(match, assignedParticipantId);
  console.debug('[SharedAssignmentMap]', 'setSharedPlayerAssignment before', { playerId: pid, playerName: getPlayer(pid)?.name || pid, selectedValue: assignedParticipantId, selectedParticipantName: selectedParticipant?.deviceName || '', validationResult: isValidSharedAssignmentParticipantId(match, assignedParticipantId), assignmentMapBefore });
  match.sharedPlayerAssignments[pid] = assignedParticipantId;
  persist({ skipRender: true });
  try {
    const publishResult = await publishSharedPlayerAssignments(match);
    console.debug('[SharedAssignmentMap]', 'setSharedPlayerAssignment after', { playerId: pid, selectedValue: assignedParticipantId, assignmentMapBefore, assignmentMapAfter: { ...(match.sharedPlayerAssignments || {}) }, publishResult });
    scheduleSharedMatchSync(match, { immediate: true, silent: true });
    startSharedConnectionFastRefresh({ reason: 'assignment-save' });
    persist({ skipRender: true });
    return true;
  } catch (err) {
    console.error('Shared assignment save failed.', err);
    toast('Unable to save assignment. Please try Sync Now and save again.');
    return false;
  }
}


async function refreshActiveSharedParticipants({ silent = true } = {}) {
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  try {
    const beforeParticipants = JSON.stringify(getSharedAssignmentParticipants(match));
    const beforeAssignments = JSON.stringify(match.sharedPlayerAssignments || {});
    const beforeMemories = JSON.stringify(getRoundMemories(match));
    await refreshSharedDevicesForAssignment(match);
    if (!isCurrentDeviceMatchHost(match)) {
      await mergeCloudSharedMetadata(match, { includeAssignments: true, includeMemories: true });
    } else {
      await mergeCloudSharedMetadata(match, { includeAssignments: false, includeMemories: true });
    }
    const changed = beforeParticipants !== JSON.stringify(getSharedAssignmentParticipants(match))
      || beforeAssignments !== JSON.stringify(match.sharedPlayerAssignments || {})
      || beforeMemories !== JSON.stringify(getRoundMemories(match));
    if (changed) {
      persist({ skipRender: true });
      renderAll();
      if (!silent) toast(isCurrentDeviceMatchHost(match) ? 'Shared participants updated.' : 'Shared assignments updated.');
    }
    return changed;
  } catch (err) {
    console.warn('Shared participant refresh failed.', err);
    if (!silent) toast('Could not refresh participant list. Try Sync Now.');
    return false;
  }
}
function startSharedParticipantRefresh() {
  if (sharedParticipantRefreshTimer) return;
  sharedParticipantRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const match = getActiveMatch();
    if (!match || match.storageMode !== 'shared') return;
    refreshActiveSharedParticipants({ silent: true });
  }, SHARED_PARTICIPANT_REFRESH_MS);
}

function shouldRunSharedConnectionFastRefresh(match = getActiveMatch()) {
  if (!match || match.storageMode !== 'shared' || match.status === 'complete') return false;
  const activePanel = document.querySelector('.panel.active')?.id || '';
  if (activePanel === 'setup') return true;
  if (!isCurrentDeviceMatchHost(match) && getSharedAssignmentSummary(match) === 'Waiting for the host to assign players to this device.') return true;
  return false;
}

function stopSharedConnectionFastRefresh() {
  if (sharedConnectionFastRefreshTimer) window.clearInterval(sharedConnectionFastRefreshTimer);
  sharedConnectionFastRefreshTimer = null;
  sharedConnectionFastRefreshUntil = 0;
}

function startSharedConnectionFastRefresh({ reason = 'shared-connection', durationMs = SHARED_CONNECTION_FAST_REFRESH_DURATION_MS } = {}) {
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared') return;
  sharedConnectionFastRefreshUntil = Math.max(sharedConnectionFastRefreshUntil || 0, Date.now() + durationMs);
  const tick = async () => {
    const active = getActiveMatch();
    const stillNeeded = !!active
      && active.storageMode === 'shared'
      && document.visibilityState !== 'hidden'
      && shouldRunSharedConnectionFastRefresh(active);
    // Keep the fast cadence alive as long as it's still needed (e.g. the host is
    // sitting on the setup panel waiting to assign a just-joined device). Without
    // this the poll self-terminated after 60s and fell back to the 30s cadence,
    // which is exactly when the host tries to assign a newly joined device.
    if (stillNeeded) {
      sharedConnectionFastRefreshUntil = Math.max(sharedConnectionFastRefreshUntil || 0, Date.now() + SHARED_CONNECTION_FAST_REFRESH_DURATION_MS);
    }
    if (!stillNeeded || Date.now() > sharedConnectionFastRefreshUntil) {
      stopSharedConnectionFastRefresh();
      return;
    }
    try {
      await refreshActiveSharedParticipants({ silent: true });
      await refreshActiveSharedScores({ silent: true, render: false });
      renderAll();
    } catch (err) {
      console.warn('Shared connection fast refresh failed.', err);
    }
  };
  tick();
  if (sharedConnectionFastRefreshTimer) return;
  sharedConnectionFastRefreshTimer = window.setInterval(tick, SHARED_CONNECTION_FAST_REFRESH_MS);
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
  const cloudId = normalizeMatchCode(matchId || '');
  if (!cloudId) throw new Error('Enter a shared match code.');
  console.debug('[SharedJoin]', 'normalized match code', { input: matchId, normalized: cloudId });
  let bundle = null;
  try {
    bundle = await fetchSharedMatchBundle(cloudId);
  } catch (err) {
    bundle = readCachedCloudMatchBundle(cloudId);
    if (!bundle) {
      const friendly = new Error('Match not found. Please verify the code and try again.');
      friendly.cause = err;
      throw friendly;
    }
  }
  const hydrated = hydrateMatchFromCloudBundle(bundle);
  if (hydrated.storageMode === 'shared') {
    ensureSharedParticipantRegistered(hydrated, isCurrentDeviceMatchHost(hydrated) ? 'Host Device' : getPreferredSharedDeviceName('Joined Device'));
    try {
      await upsertSharedMembershipForCurrentDevice(hydrated);
      await publishCurrentSharedDeviceToCloudMetadata(hydrated).catch(err => console.warn('Could not publish shared-device metadata.', err));
      await mergeCloudSharedMetadata(hydrated, { includeAssignments: !isCurrentDeviceMatchHost(hydrated) });
    } catch (err) {
      console.warn('Could not register this device with the shared match.', err);
    }
  }
  upsertLocalMatch(hydrated);
  if (activate) {
    state.activeMatchId = hydrated.id;
    setLastOpenedSharedMatch(hydrated);
    currentHole = Math.min(getRequestedHoleCount(hydrated), Math.max(1, completedHoles(hydrated) || 1));
  }
  persist({ skipRender: true });
  renderAll();
  if (hydrated.storageMode === 'shared') {
    scheduleSharedMatchSync(hydrated, { immediate: true, silent: true });
    startSharedConnectionFastRefresh({ reason: 'join-match' });
  }
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
  match.lastSharedSyncAttemptAt = new Date().toISOString();
  persist({ skipRender: true });
  const task = (async () => {
    try {
      if (!isCurrentDeviceMatchHost(match)) {
        await mergeCloudSharedMetadata(match, { includeAssignments: true, includeMemories: true });
      } else {
        await mergeCloudSharedMetadata(match, { includeAssignments: false, includeMemories: true });
      }
      await uploadSharedMatch(match);
      await pullSharedScoreEntries(match, { silent: true, render: false });
      await mergeCloudSharedMetadata(match, { includeAssignments: !isCurrentDeviceMatchHost(match) });
      setLastOpenedSharedMatch(match);
      match.lastSharedSyncError = '';
      persist({ skipRender: true });
      if (!silent) toast('Shared match synced.');
    } catch (err) {
      console.error(err);
      match.cloudSyncState = 'local-cache';
      match.lastSharedSyncError = getSharedFriendlyError(err);
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
  match.lastSharedSyncAttemptAt = new Date().toISOString();
  persist({ skipRender: true });
  const timer = window.setTimeout(() => {
    sharedMatchSyncTimers.delete(matchId);
    flushSharedMatchSync(matchId, { silent });
  }, delay);
  sharedMatchSyncTimers.set(matchId, timer);
}

window.addEventListener('resize', updateAppChromeOffset);
window.addEventListener('orientationchange', () => window.setTimeout(updateAppChromeOffset, 120));

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

window.addEventListener('online', () => { refreshActiveSharedParticipants({ silent: true }); refreshActiveSharedScores({ silent: true }); });
window.addEventListener('focus', () => { refreshActiveSharedParticipants({ silent: true }); refreshActiveSharedScores({ silent: true }); });

function getCourseLibraryStatusMessage() {
  if (uiState.cloudCoursesLoading) return 'Loading cloud course library… manual setup remains available.';
  if (uiState.cloudCoursesStatus) return uiState.cloudCoursesStatus;
  return hasSupabaseConfig()
    ? 'Cloud course library connected. Manual setup remains available.'
    : 'Supabase not configured. Manual course entry remains available.';
}
function getCourseLibraryDiagnosticsText() {
  const diag = uiState.courseLibraryDiagnostics || {};
  return `Diagnostics: cloud ${Number(diag.cloudCourses || 0)}, local ${Number(diag.localCourses || 0)}, rendered options ${Number(diag.renderedCourseOptions || 0)}.`;
}
function getCourseLibraryStatusDisplayMessage(message = getCourseLibraryStatusMessage()) {
  return `${message} ${getCourseLibraryDiagnosticsText()}`;
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
  const requiresAttentionLabel = failed === 1 ? '1 course requires attention' : `${failed} courses require attention`;
  const detailItems = Array.isArray(summary.errors) ? summary.errors.slice(0, 8).map(msg => `<li>${escapeHtml(msg)}</li>`).join('') : '';
  const details = detailItems
    ? `<details class="top-gap"><summary>View Details</summary><ul class="tight-list">${detailItems}</ul></details>`
    : '';
  const diagnostics = summary.diagnostics || null;
  const phases = diagnostics?.phases || {};
  const timingRows = diagnostics ? [
    ['Total sync time', diagnostics.totalMs],
    ['Local course scan', phases.localScanMs],
    ['Cloud course lookup', phases.cloudLookupMs],
    ['Duplicate checks', phases.duplicateCheckMs],
    ['Course writes', phases.courseWriteMs],
    ['Tee sync', phases.teeSyncMs],
    ['Hole sync', phases.holeSyncMs],
    ['Cloud refresh', phases.refreshMs],
  ].map(([label, ms]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatCourseSyncMs(ms))}</li>`).join('') : '';
  const perCourseRows = Array.isArray(diagnostics?.perCourse) && diagnostics.perCourse.length
    ? `<details class="top-gap"><summary>Per-course timing</summary><ul class="tight-list">${diagnostics.perCourse.slice(0, 12).map(item => `<li><strong>${escapeHtml(item.courseName || 'Course')}:</strong> ${escapeHtml(formatCourseSyncMs(item.totalMs))} (${escapeHtml(item.status || 'measured')})${Number(item.teeSyncMs) || Number(item.holeSyncMs) ? `<br><span class="muted">Tees: ${escapeHtml(formatCourseSyncMs(item.teeSyncMs))} · Holes: ${escapeHtml(formatCourseSyncMs(item.holeSyncMs))}</span>` : ''}</li>`).join('')}</ul></details>`
    : '';
  const timingDetails = timingRows
    ? `<details class="top-gap"><summary>View Timing Details</summary><ul class="tight-list">${timingRows}</ul>${perCourseRows}</details>`
    : '';
  const html = `<strong>Course Sync Complete</strong><br>${uploaded} courses uploaded<br>${updated} courses updated<br>${current} already current<br>${requiresAttentionLabel}${details}${timingDetails}`;
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
function getRoundRecapUrl() {
  const url = String(SUPABASE_CONFIG.url || '').replace(/\/$/, '');
  return url ? `${url}/functions/v1/round-recap` : '';
}
function getRoundRecapHeaders() {
  return getScorecardImportHeaders();
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
      <div class="strong">Selected files (${files.length})</div>
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
  const cappedHoleCount = holeCount === 9 ? 9 : (holeCount <= 18 ? 18 : Math.min(36, holeCount));
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
  tees.forEach(t => { t.courseName = courseName || 'Imported Course'; });
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
function buildScorecardImportRequestBody(encodedFiles = []) {
  return encodedFiles.length === 1 ? {
    fileName: encodedFiles[0].fileName,
    mimeType: encodedFiles[0].mimeType,
    dataUrl: encodedFiles[0].dataUrl,
    requestedSchema: 'the-dye-ledger-scorecard-v1',
  } : {
    files: encodedFiles,
    requestedSchema: 'the-dye-ledger-scorecard-v1',
  };
}
function getScorecardImportReviewWarnings(data = {}) {
  const warnings = [];
  const courseName = String(data.courseName || data.name || '').trim();
  const tees = Array.isArray(data.tees) ? data.tees : [];
  if (!courseName) warnings.push('Course name is missing.');
  if (!tees.length) warnings.push('No tees were extracted.');
  tees.forEach((tee, idx) => {
    const name = String(tee?.teeName || '').trim() || `Tee ${idx + 1}`;
    const holes = Array.isArray(tee?.holes) ? tee.holes : [];
    const intendedHoleCount = Number(data.holeCount) === 9 ? 9 : 18;
    const meaningfulHoleNumbers = new Set(holes.filter(hole => Number(hole?.par) || Number(hole?.strokeIndex) || Number(hole?.yardage)).map(hole => Number(hole?.holeNumber)).filter(number => number >= 1 && number <= intendedHoleCount));
    const missingHoleNumbers = Array.from({ length: intendedHoleCount }, (_, holeIdx) => holeIdx + 1).filter(number => !meaningfulHoleNumbers.has(number));
    if (missingHoleNumbers.length) warnings.push(`${name}: incomplete ${intendedHoleCount}-hole draft; missing hole${missingHoleNumbers.length === 1 ? '' : 's'} ${missingHoleNumbers.join(', ')}.`);
    const missingPar = holes.filter(hole => !Number(hole?.par)).length;
    const missingSi = holes.filter(hole => !Number(hole?.strokeIndex)).length;
    const missingYardage = holes.filter(hole => !Number(hole?.yardage)).length;
    if (missingPar) warnings.push(`${name}: par missing on ${missingPar} hole${missingPar === 1 ? '' : 's'}.`);
    if (missingSi) warnings.push(`${name}: SI missing on ${missingSi} hole${missingSi === 1 ? '' : 's'}.`);
    if (missingYardage) warnings.push(`${name}: yardage missing on ${missingYardage} hole${missingYardage === 1 ? '' : 's'}.`);
    if (!Number(tee?.rating)) warnings.push(`${name}: course rating is missing.`);
    if (!Number(tee?.slope)) warnings.push(`${name}: slope is missing.`);
  });
  return warnings;
}
function getScorecardImportSaveGuard(data = {}) {
  const warnings = getScorecardImportReviewWarnings(data);
  return { warnings, requiresConfirmation: warnings.length > 0 };
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
  const body = buildScorecardImportRequestBody(encodedFiles);
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
  const holeCount = Number(wrap.dataset.importHoleCount) === 9 ? 9 : 18;
  return { courseName, city, state: stateValue, country, holeCount, tees };
}
function saveImportedScorecardCourse() {
  const reviewed = collectScorecardImportReviewData();
  if (!reviewed?.courseName) return toast('Course name is required before saving.');
  if (!reviewed.tees.length) return toast('At least one tee is required before saving.');
  const saveGuard = getScorecardImportSaveGuard(reviewed);
  if (saveGuard.requiresConfirmation && !confirm(`WARNING: This imported course is incomplete.\n\n${saveGuard.warnings.slice(0, 10).join('\n')}\n\nSave this incomplete course to the Library anyway?`)) {
    uiState.scorecardImportStatus = 'Course not saved. Correct the highlighted/missing course data in Review Imported Course.';
    updateScorecardImportStatus();
    return;
  }
  const course = {
    id: uid(),
    name: reviewed.courseName,
    city: reviewed.city,
    state: reviewed.state,
    country: reviewed.country,
    tees: reviewed.tees,
    strokeIndexes: extractStrokeTemplate(reviewed.tees[0]?.holes || []) || null,
    source: 'scorecard-import',
    cloudSyncState: 'local-draft',
    cloudSyncError: '',
    importedAt: new Date().toISOString(),
  };
  course.tees.forEach(t => { t.courseName = course.name; normalizeTee(t, course.name); });
  const duplicates = findLikelyDuplicateCourses(course);
  if (duplicates.length && !confirm(`A likely matching saved course already exists: ${duplicates[0].name}${duplicates[0].city ? ` (${duplicates[0].city})` : ''}. Save this import as a new course anyway?`)) {
    uiState.scorecardImportStatus = 'Import not saved. Review the existing saved course or change the course name/location.';
    renderScorecardImportStatus();
    return;
  }
  state.courses.push(course);
  uiState.expandedCourses.add(course.id);
  uiState.scorecardImportStatus = 'Course saved locally. Use Publish Local Changes to upload it to the cloud.';
  uiState.scorecardImportData = null;
  uiState.scorecardImportFiles = [];
  uiState.scorecardImportFileName = '';
  persist();
  renderAll();
  toast('Course saved locally. Use Publish Local Changes when you are ready to publish it.');
}

function deleteImportedScorecardTee(teeIdx) {
  const data = uiState.scorecardImportData;
  if (!data || !Array.isArray(data.tees)) return;
  const reviewed = collectScorecardImportReviewData();
  const currentTees = Array.isArray(reviewed?.tees) ? reviewed.tees : data.tees;
  const tee = currentTees[teeIdx] || data.tees[teeIdx];
  const teeName = tee?.teeName || `Tee ${teeIdx + 1}`;
  const ok = window.confirm(`Delete Tee?\n\n${teeName}\n\nAll holes associated with this tee will also be removed.`);
  if (!ok) return;
  const remainingTees = currentTees.filter((_, idx) => idx !== Number(teeIdx));
  uiState.scorecardImportData = {
    ...data,
    name: reviewed?.courseName || data.name,
    city: reviewed?.city || data.city,
    state: reviewed?.state || data.state,
    country: reviewed?.country || data.country || 'United States of America',
    holeCount: Math.max(1, ...remainingTees.map(t => (Array.isArray(t.holes) ? t.holes.length : 0))),
    totalPar: remainingTees[0]?.par || data.totalPar || null,
    tees: remainingTees,
  };
  renderScorecardImportReview();
  toast(`${teeName} deleted from imported course review.`);
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
  el.dataset.importHoleCount = Number(data.holeCount) === 9 ? '9' : '18';
  const confidence = data.confidence ? `<div class="import-confidence"><strong>Confidence:</strong> ${escapeHtml(data.confidence)}%</div>` : '<div class="import-confidence"><strong>Confidence:</strong> Review required</div>';
  const computedWarnings = getScorecardImportReviewWarnings(data);
  const uncertain = Array.isArray(data.uncertainFields) && data.uncertainFields.length
    ? `<div class="tiny warning-text">Please review: ${data.uncertainFields.slice(0, 8).map(escapeHtml).join(', ')}</div>`
    : '<div class="tiny">Review and correct the combined course draft before saving.</div>';
  const missingGuidance = computedWarnings.length
    ? `<div class="import-completeness-warning" role="alert"><strong>Incomplete import — review before saving.</strong><div>${computedWarnings.slice(0, 10).map(escapeHtml).join(' ')}</div><div>You may fill the blank hole fields below or explicitly confirm an incomplete save.</div></div>`
    : '<div class="tiny">All core extracted fields are present. Confirm them against every selected file before saving.</div>';
  const teeHtml = data.tees.map((tee, teeIdx) => `
    <details class="import-tee-card" data-import-tee="${teeIdx}" open>
      <summary><strong>${escapeHtml(tee.teeName || `Tee ${teeIdx + 1}`)}</strong> <span class="tiny">${Number(tee.par) || '—'} par · ${getTeeTotalYardage(tee) ? formatYardageValue(getTeeTotalYardage(tee)) : '—'} yds</span></summary>
      <div class="actions wrap compact-actions top-gap import-tee-actions">
        <button type="button" class="secondary mini" data-edit-import-tee="${teeIdx}">Edit</button>
        <button type="button" class="secondary mini danger-lite" data-delete-import-tee="${teeIdx}">Delete</button>
      </div>
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
      ${missingGuidance}
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
  el.querySelectorAll('[data-delete-import-tee]').forEach(btn => btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteImportedScorecardTee(Number(btn.dataset.deleteImportTee));
  }));
  el.querySelectorAll('[data-edit-import-tee]').forEach(btn => btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const details = btn.closest('[data-import-tee]');
    if (details) details.open = true;
    setTimeout(() => {
      try { details?.querySelector('[data-tee-field="teeName"]')?.focus({ preventScroll: true }); } catch (_) {}
    }, 0);
  }));
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
  const analyzeButton = document.getElementById('analyzeScorecardImportBtn');
  if (analyzeButton) {
    analyzeButton.disabled = uiState.scorecardImportLoading;
    analyzeButton.textContent = uiState.scorecardImportLoading ? 'Analyzing…' : 'Analyze Scorecard';
  }
}
async function analyzeSelectedScorecardImportFiles() {
  if (uiState.scorecardImportLoading) return;
  const files = getScorecardImportFiles();
  if (!files.length) return toast('Add at least one scorecard photo or file first.');
  uiState.scorecardImportLoading = true;
  uiState.scorecardImportFileName = files.map(f => f.name || 'Scorecard file').join(', ');
  uiState.scorecardImportStatus = files.length === 1 ? 'Preparing and reading 1 scorecard file with AI…' : `Preparing and combining ${files.length} scorecard files with AI…`;
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
function updateAppChromeOffset() {
  const chrome = document.querySelector('.app-chrome');
  if (!chrome) return;
  const height = Math.ceil(chrome.getBoundingClientRect().height || 0);
  document.documentElement.style.setProperty('--app-chrome-height', `${height}px`);
}


function renderSharedAssignmentDiagnosticsMore() {
  const el = document.getElementById('sharedAssignmentDiagnosticsMore');
  if (!el) return;
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared') {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `<h2>Shared Assignment Diagnostics</h2><div class="tiny">Troubleshooting details for joined devices, participants, and assignment ownership. Collapsed by default.</div>${renderSharedAssignmentDiagnosticsPanel(match, { context: 'more' })}`;
}

function renderRecentAppErrorsDiagnostics() {
  const el = document.getElementById('recentAppErrorsMore');
  if (!el) return;
  const errors = readRecentAppErrors();
  const latest = errors[0];
  const details = errors.slice(0, 5).map((err, index) => `
    <details class="top-gap">
      <summary>${index + 1}. ${escapeHtml(err.name || 'Error')} — ${escapeHtml(err.message || 'Unknown error')}</summary>
      <div class="tiny top-gap">
        <div><strong>Time:</strong> ${escapeHtml(formatDiagnosticsTimestamp(err.timestamp))}</div>
        <div><strong>Context:</strong> ${escapeHtml(err.context || 'App')}</div>
        <div><strong>Version:</strong> ${escapeHtml(err.appVersion || APP_VERSION)}</div>
        <div><strong>Build:</strong> ${escapeHtml(formatDiagnosticsTimestamp(err.buildDate || BUILD_TIMESTAMP))}</div>
        <div><strong>URL:</strong> <span class="break-word">${escapeHtml(err.url || '')}</span></div>
        ${err.stack ? `<pre class="diagnostics-pre">${escapeHtml(err.stack)}</pre>` : '<div>No stack trace available.</div>'}
      </div>
    </details>
  `).join('');
  el.classList.remove('hidden');
  el.innerHTML = `
    <h2>Recent App Errors</h2>
    <div class="tiny">Collapsed diagnostics for unexpected app errors. Use Copy Diagnostics to paste useful details into ChatGPT.</div>
    <div class="app-update-summary top-gap">
      <div><span class="muted-label">Last Error</span><strong>${latest ? `${escapeHtml(latest.name || 'Error')} — ${escapeHtml(latest.message || 'Unknown error')}` : 'None recorded'}</strong></div>
      <div><span class="muted-label">Error Count</span><strong>${errors.length}</strong></div>
    </div>
    ${details || '<div class="tiny top-gap">No recent app errors recorded.</div>'}
    <div class="actions wrap top-gap">
      <button id="copyAppDiagnosticsBtn" type="button" class="secondary">Copy Diagnostics</button>
      <button id="clearAppErrorsBtn" type="button" class="secondary">Clear Errors</button>
    </div>
  `;
  const copyBtn = document.getElementById('copyAppDiagnosticsBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyAppDiagnostics);
  const clearBtn = document.getElementById('clearAppErrorsBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearRecentAppErrors);
}


function renderAll() {
  updateAppChromeOffset();
  renderPlayers();
  renderCourses();
  renderMatches();
  renderSessionSummary();
  renderCurrentMatch();
  renderLeaderboard();
  renderMatchSetupState();
  renderSharedAssignmentDiagnosticsMore();
  renderRecentAppErrorsDiagnostics();
  populateCourseSelects();
  populateCalcPlayers();
  populateCalcCourses();
  preserveMatchSetupUi();
  renderSetupHandicapPreview();
  const versionEl = document.getElementById('appVersionLabel'); if (versionEl) versionEl.textContent = APP_VERSION;
  const footerVersionEl = document.getElementById('appVersionFooter'); if (footerVersionEl) footerVersionEl.textContent = APP_VERSION;
  const coursesSearchInput = document.getElementById('coursesSearchInput');
  if (coursesSearchInput && coursesSearchInput.value !== uiState.courseSearch) coursesSearchInput.value = uiState.courseSearch;
  syncNewMatchConflictUi();
  updateCloudConfigUi();
  startSharedParticipantRefresh();
startSharedScoreRefresh();
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

function normalizeRoundMemory(memory = {}) {
  const text = String(memory.text || memory.memory || '').trim();
  if (!text) return null;
  const categories = ['General', 'Key Moment', 'Best Shot', 'Betting Drama'];
  const rawCategory = String(memory.category || 'General').trim();
  const category = categories.includes(rawCategory) ? rawCategory : 'General';
  const id = String(memory.memoryId || memory.id || uid());
  const timestamp = memory.timestamp || memory.createdAt || new Date().toISOString();
  return {
    id,
    memoryId: id,
    text,
    category,
    holeNumber: Math.max(1, Math.min(18, Number(memory.holeNumber || memory.hole || currentHole) || currentHole || 1)),
    timestamp,
    createdAt: memory.createdAt || timestamp,
    createdByDeviceId: memory.createdByDeviceId || memory.deviceId || getSharedDeviceId(),
    createdByPlayerId: memory.createdByPlayerId || memory.playerId || '',
    createdByName: memory.createdByName || memory.playerName || memory.author || '',
    source: memory.source || 'local',
  };
}

function getRoundMemories(match) {
  return (Array.isArray(match?.memories) ? match.memories : [])
    .map(normalizeRoundMemory)
    .filter(Boolean)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function mergeRoundMemoryLists(existing = [], incoming = []) {
  const map = new Map();
  [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]
    .map(normalizeRoundMemory)
    .filter(Boolean)
    .forEach(memory => {
      const key = String(memory.memoryId || memory.id || '').trim();
      if (!key) return;
      map.set(key, { ...(map.get(key) || {}), ...memory, id: key, memoryId: key });
    });
  return Array.from(map.values()).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function mergeRoundMemories(match, incoming = [], { source = 'shared' } = {}) {
  if (!match) return false;
  const before = JSON.stringify(getRoundMemories(match));
  const stamped = (Array.isArray(incoming) ? incoming : []).map(memory => ({ ...memory, source: memory?.source || source }));
  match.memories = mergeRoundMemoryLists(match.memories || [], stamped);
  return JSON.stringify(getRoundMemories(match)) !== before;
}

async function publishSharedMemories(match) {
  if (!match || match.storageMode !== 'shared' || !match.sharedMatchId || !hasSupabaseConfig()) return false;
  const client = await ensureSupabaseClient();
  if (!client) return false;
  const { data: matchRow, error: readError } = await client.from('matches').select('id,course_snapshot').eq('id', match.sharedMatchId).maybeSingle();
  if (readError) throw readError;
  const snapshot = matchRow?.course_snapshot && typeof matchRow.course_snapshot === 'object' ? matchRow.course_snapshot : {};
  const existingMeta = snapshot.sharedMatchMeta && typeof snapshot.sharedMatchMeta === 'object' ? snapshot.sharedMatchMeta : {};
  const memories = mergeRoundMemoryLists(existingMeta.memories || [], match.memories || []);
  match.memories = memories;
  const nextSnapshot = {
    ...snapshot,
    sharedMatchMeta: {
      ...existingMeta,
      scoringAccessMode: normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || existingMeta.scoringAccessMode || 'single_device'),
      matchCode: normalizeMatchCode(match.sharedMatchCode || match.sharedMatchRef || match.sharedMatchId || existingMeta.matchCode || ''),
      hostDeviceId: match.sharedHostDeviceId || existingMeta.hostDeviceId || getSharedDeviceId(),
      hostParticipantId: match.sharedHostParticipantId || existingMeta.hostParticipantId || getCurrentSharedParticipantId(match),
      devices: normalizeSharedDeviceList([...(Array.isArray(existingMeta.devices) ? existingMeta.devices : []), ...(match.sharedDevices || [])], match),
      participants: normalizeSharedParticipantList([...(Array.isArray(existingMeta.participants) ? existingMeta.participants : []), ...(match.sharedParticipants || [])], match.sharedDevices || [], match),
      playerAssignments: existingMeta.playerAssignments && typeof existingMeta.playerAssignments === 'object' ? existingMeta.playerAssignments : (match.sharedPlayerAssignments || {}),
      memories,
      memoriesUpdatedAt: new Date().toISOString(),
    },
  };
  const { error: updateError } = await client.from('matches').update({ course_snapshot: nextSnapshot, updated_at: new Date().toISOString() }).eq('id', match.sharedMatchId);
  if (updateError) throw updateError;
  return true;
}
function formatMemoryMeta(memory) {
  const parts = [];
  if (memory.category && memory.category !== 'General') parts.push(memory.category);
  if (memory.holeNumber) parts.push(`Hole ${memory.holeNumber}`);
  const dt = memory.createdAt ? new Date(memory.createdAt) : null;
  if (dt && !Number.isNaN(dt.getTime())) parts.push(formatTimestampET(dt, { includeDate: false }));
  return parts.join(' · ');
}
function buildMemoriesDisplay(match) {
  const memories = getRoundMemories(match);
  if (!memories.length) {
    return `<div class="memory-feed-empty tiny">No memories saved yet. Use Add Memory on the Play tab to capture a quick moment.</div>`;
  }
  return `<div class="memory-feed-list">${memories.map(memory => `
    <div class="memory-feed-item">
      <div class="memory-feed-text">${escapeHtml(memory.text)}</div>
      <div class="memory-feed-meta tiny">${escapeHtml(formatMemoryMeta(memory))}</div>
    </div>`).join('')}</div>`;
}
function renderRoundMemoriesPanel(match = getActiveMatch()) {
  const panel = document.getElementById('roundMemoriesPanel');
  const count = document.getElementById('roundMemoriesCount');
  if (!panel) return;
  const memories = getRoundMemories(match);
  if (count) count.textContent = String(memories.length || 0);
  panel.innerHTML = match ? buildMemoriesDisplay(match) : '<div class="tiny">Create or load a match to see memories.</div>';
}
function openAddMemoryModal() {
  const match = getActiveMatch();
  if (!match) return toast('Create or load a match first.');
  const backdrop = document.getElementById('addMemoryDialog');
  const text = document.getElementById('memoryTextInput');
  const category = document.getElementById('memoryCategorySelect');
  const hole = document.getElementById('memoryHoleSelect');
  if (!backdrop || !text || !category || !hole) return;
  const maxHole = getPlayableHoleCount(match, getTee(match.courseId, match.teeId)) || 18;
  hole.innerHTML = Array.from({ length: maxHole }, (_, idx) => `<option value="${idx + 1}">Hole ${idx + 1}</option>`).join('');
  hole.value = String(Math.min(maxHole, Math.max(1, currentHole || 1)));
  category.value = 'General';
  text.value = '';
  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => text.focus(), 50);
}
function closeAddMemoryModal() {
  const backdrop = document.getElementById('addMemoryDialog');
  const text = document.getElementById('memoryTextInput');
  if (backdrop) {
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  if (text) text.value = '';
}
function saveMemoryFromModal() {
  const match = getActiveMatch();
  if (!match) return closeAddMemoryModal();
  const text = String(document.getElementById('memoryTextInput')?.value || '').trim();
  if (!text) return toast('Add a memory first.');
  const entry = normalizeRoundMemory({
    text,
    category: document.getElementById('memoryCategorySelect')?.value || 'General',
    holeNumber: Number(document.getElementById('memoryHoleSelect')?.value || currentHole) || currentHole,
    createdAt: new Date().toISOString(),
    source: 'local',
  });
  if (!entry) return toast('Add a memory first.');
  match.memories = Array.isArray(match.memories) ? match.memories : [];
  match.memories.push(entry);
  persist({ skipRender: true });
  if (match.storageMode === 'shared') {
    console.debug('[SharedMemories]', { action: 'local-memory-created', memory: entry, memoryCount: match.memories.length });
    publishSharedMemories(match)
      .then(published => {
        console.debug('[SharedMemories]', { action: 'publish-complete', published, memoryCount: getRoundMemories(match).length });
        if (published) persist({ skipRender: true });
      })
      .catch(err => {
        console.warn('[SharedMemories] publish failed.', err);
        scheduleSharedMatchSync(match, { immediate: true, silent: true });
      });
  }
  closeAddMemoryModal();
  toast('Memory saved.');
}
function renderMemoryQuickCapture(match) {
  const wrap = document.getElementById('memoryQuickCaptureWrap');
  if (!wrap) return;
  if (!match) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  const count = Array.isArray(match.memories) ? match.memories.length : 0;
  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="memory-quick-divider" aria-hidden="true"></div>
    <button id="addMemoryBtn" type="button" class="secondary memory-add-btn">📝 Add Memory</button>
    <div class="tiny memory-quick-hint">Capture a quick moment for the recap.${count ? ` ${count} saved.` : ''}</div>`;
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
  updateCourseLibraryDiagnostics({
    localCourses: (state.courses || []).length,
    renderedCourseOptions: getDedupedCourseOptions(document.getElementById('matchCourseSelect')?.value || '').length,
  });
  const statusMessage = getCourseLibraryStatusMessage();
  const statusDisplayMessage = getCourseLibraryStatusDisplayMessage(statusMessage);
  const statusClass = getCourseLibraryStatusClass(statusMessage);
  const cloudReachable = isCourseCloudReachableStatus(statusMessage);
  [cloudStatus, setupCloudStatus, moreCloudStatus].filter(Boolean).forEach(node => {
    node.textContent = statusDisplayMessage;
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
  const matchesQuery = course => {
    if (!query) return true;
    const location = [course.city, course.state, course.country].filter(Boolean).join(' ').toLowerCase();
    const teeText = (Array.isArray(course.tees) ? course.tees : []).map(t => [t.teeName, t.gender === 'F' ? 'women' : 'men', t.isCombo ? 'combo' : ''].join(' ')).join(' ').toLowerCase();
    return `${String(course.name || '').toLowerCase()} ${location} ${teeText}`.includes(query);
  };
  const visibleCourses = query ? state.courses.filter(matchesQuery) : getRecentCourses(3);
  if (!state.courses.length) {
    el.innerHTML = '<div class="tiny">No courses saved yet. Add a course or import a scorecard to build your Library.</div>';
    return;
  }
  if (!visibleCourses.length) {
    el.innerHTML = query
      ? '<div class="tiny">No courses match your search.</div>'
      : '<div class="tiny">No recently used courses yet. Search courses below to choose one for today’s round.</div>';
    return;
  }
  const heading = query ? `Search Results (${visibleCourses.length})` : 'Recently Used Courses';
  el.innerHTML = `<div class="section-label course-list-heading">${escapeHtml(heading)}</div>` + visibleCourses.map(c => {
    const expanded = query ? true : uiState.expandedCourses.has(c.id);
    const sortedTees = getSortedTeesByYardage(c);
    const lastPlayedAt = getCourseLastPlayedAt(c);
    const recentText = lastPlayedAt ? `Last Played: ${formatRelativeCourseDate(lastPlayedAt)}` : 'Saved Course';
    const holeCount = getCourseHoleCount(c);
    return `
    <div class="item compact-item course-card ${expanded ? 'expanded' : 'collapsed'}">
      <div class="item-header compact-item-header course-card-header">
        <button type="button" class="course-expand-btn" data-toggle-course="${c.id}" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="course-expand-icon">${expanded ? '▾' : '▸'}</span>
          <span>
            <span class="item-title">${escapeHtml(c.name)}</span>
            <span class="muted course-meta-line">${escapeHtml([c.city, c.state].filter(Boolean).join(', ') || c.country || 'Course')}</span>
            <span class="tiny course-meta-line">${escapeHtml(recentText)} · ${holeCount || '—'} holes · ${sortedTees.length} tee${sortedTees.length === 1 ? '' : 's'}</span>
          </span>
        </button>
        <div class="actions wrap compact-actions">
          <button class="secondary" data-edit-course="${c.id}">Edit course</button>
          <button class="secondary" data-delete-course-local="${c.id}">Delete Local</button>
          <button class="secondary" data-delete-course-cloud="${c.id}" ${c.cloudCourseId ? '' : 'disabled title="Publish this course before cloud deletion is available."'}>Delete Cloud</button>
          <button class="secondary" data-delete-course-all="${c.id}" ${c.cloudCourseId ? '' : 'disabled title="Publish this course before cloud deletion is available."'}>Delete Local + Cloud</button>
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


function getCourseCloudId(course) {
  return String(course?.cloudCourseId || (course?.source === 'supabase' ? course?.id : '') || '').trim();
}
function clearCourseCloudIds(course) {
  if (!course) return;
  course.cloudCourseId = '';
  course.cloudSyncState = 'local-only';
  course.cloudSyncError = '';
  course.source = course.source === 'supabase' ? 'local' : course.source;
  (course.tees || []).forEach(tee => {
    tee.cloudTeeId = '';
    tee.source = tee.source === 'supabase' ? 'local' : tee.source;
  });
}
function removeLocalCourse(courseId) {
  const before = state.courses.length;
  state.courses = state.courses.filter(c => String(c.id) !== String(courseId));
  if (editingCourseId === courseId) loadCourseEditor(null);
  if (editingTeeRef?.courseId === courseId) loadTeeEditor(null, null);
  normalizeState();
  persist();
  return before !== state.courses.length;
}
async function deleteCloudCourseById(course, { clearLocalCloudIds = false } = {}) {
  const cloudCourseId = getCourseCloudId(course);
  if (!cloudCourseId) throw new Error('This course does not have a cloud course ID yet.');
  if (!hasSupabaseConfig()) throw new Error('Supabase is not configured.');
  if (uiState.cloudCoursesLoading) throw new Error('Course library is already syncing.');
  uiState.cloudCoursesLoading = true;
  uiState.cloudCoursesStatus = 'Deleting course…';
  renderCourses();
  try {
    const client = await ensureSupabaseClient({ anonymousAuth: false });
    if (!client) throw new Error('Supabase client unavailable.');
    uiState.cloudCoursesStatus = 'Removing holes…';
    renderCourses();
    const { error: holeError } = await client.from('course_holes').delete().eq('course_id', cloudCourseId);
    if (holeError) throw holeError;
    uiState.cloudCoursesStatus = 'Removing tees…';
    renderCourses();
    const { error: teeError } = await client.from('course_tees').delete().eq('course_id', cloudCourseId);
    if (teeError) throw teeError;
    uiState.cloudCoursesStatus = 'Removing course…';
    renderCourses();
    const { error: courseError } = await client.from('courses').delete().eq('id', cloudCourseId);
    if (courseError) throw courseError;
    if (clearLocalCloudIds) clearCourseCloudIds(course);
    uiState.cloudCoursesStatus = 'Cloud course deleted. Local course preserved on this device.';
    return true;
  } catch (err) {
    uiState.cloudCoursesStatus = 'Unable to delete the cloud copy.';
    throw err;
  } finally {
    uiState.cloudCoursesLoading = false;
    renderCourses();
  }
}
async function handleDeleteLocalCourse(courseId) {
  const course = getCourse(courseId);
  if (!course) return;
  const ok = window.confirm(`Delete Local Course?\n\nThis removes ${course.name || 'this course'} from this device only. The cloud copy is preserved.\n\nDelete?`);
  if (!ok) return;
  removeLocalCourse(courseId);
  toast('Local course deleted.');
}
async function handleDeleteCloudCourse(courseId) {
  const course = getCourse(courseId);
  if (!course) return;
  if (!getCourseCloudId(course)) return toast('This course does not have a cloud copy to delete.');
  const ok = window.confirm(`Delete Cloud Course?\n\nThis permanently removes ${course.name || 'this course'} from the shared cloud library, including its tees and holes. This action cannot be undone.\n\nDelete?`);
  if (!ok) return;
  try {
    await deleteCloudCourseById(course, { clearLocalCloudIds: true });
    persist();
    renderAll();
    toast('Cloud course deleted. Local copy preserved.');
  } catch (err) {
    console.warn('Cloud course delete failed:', err);
    renderAll();
    toast('Unable to delete the cloud copy. Local course was not removed.');
  }
}
async function handleDeleteCourseEverywhere(courseId) {
  const course = getCourse(courseId);
  if (!course) return;
  if (!getCourseCloudId(course)) return toast('This course does not have a cloud copy to delete.');
  const ok = window.confirm(`Delete Course Everywhere?\n\nThis permanently removes ${course.name || 'this course'} from:\n\n• This device\n• The shared cloud library\n\nThis action cannot be undone.\n\nDelete Everywhere?`);
  if (!ok) return;
  try {
    await deleteCloudCourseById(course, { clearLocalCloudIds: false });
    removeLocalCourse(courseId);
    toast('Course deleted locally and from the cloud.');
  } catch (err) {
    console.warn('Delete everywhere failed:', err);
    renderAll();
    toast('Unable to delete the cloud copy. The local course was not removed.');
  }
}

function renderMatches() {
  const el = document.getElementById('matchesList');
  if (!el) return;
  if (!state.matches.length) {
    el.innerHTML = '<div class="tiny">No matches saved yet.</div>';
    return;
  }
  const sorted = state.matches.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const inProgress = sorted.filter(m => m.status !== 'complete');
  const completed = sorted.filter(m => m.status === 'complete');
  const renderRow = match => {
    const course = getCourse(match.courseId);
    const tee = getTee(match.courseId, match.teeId);
    const metrics = computeMatchMetrics(match);
    const status = match.status === 'complete' ? 'Complete' : (state.activeMatchId === match.id ? 'Active' : 'Saved');
    const timing = getRoundElapsedTimeState(match, metrics);
    const storage = match.storageMode === 'shared' ? 'Shared' : 'Local';
    const cloudMeta = match.storageMode === 'shared' ? `${storage} · ${match.cloudSyncState || 'local-cache'}${match.sharedMatchRef ? ` · ID ${match.sharedMatchRef}` : ''}` : storage;
    return `
      <div class="item compact-item">
        <div class="item-header compact-item-header">
          <div>
            <div class="item-title">${escapeHtml(match.name || 'Round')} · ${escapeHtml(match.date)}</div>
            <div class="muted">${escapeHtml(course?.name || 'No course')} · ${escapeHtml(tee?.teeName || 'No tee')} · ${escapeHtml(getHoleSegmentLabel(match, tee))} · ${status}${timing.available ? ` · ${escapeHtml(match.status === 'complete' ? formatRoundDuration(timing.elapsedMs) : `elapsed ${formatRoundDuration(timing.elapsedMs)}`)}` : ''}</div>
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
      </div>`;
  };
  const sections = [];
  sections.push(`<div class="section-label library-section-heading">Continue Playing</div>${inProgress.length ? inProgress.map(renderRow).join('') : '<div class="tiny">No in-progress rounds.</div>'}`);
  sections.push(`<div class="section-label library-section-heading top-gap">Saved Matches</div>${completed.length ? completed.map(renderRow).join('') : '<div class="tiny">No completed matches yet.</div>'}`);
  el.innerHTML = sections.join('');
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
    smartScoreAdvanceEnabled: DEFAULT_SMART_SCORE_ADVANCE,
    smartScoreAdvancePreset: DEFAULT_SMART_SCORE_ADVANCE_PRESET,
    selectedGames: [],
    players: [],
  });
}


function getSessionRounds(sessionId = '') {
  const id = String(sessionId || '').trim();
  if (!id) return [];
  return state.matches
    .filter(match => String(match.sessionId || match.id || '') === id)
    .sort((a, b) => (Number(a.roundNumber) || 1) - (Number(b.roundNumber) || 1) || String(a.date || '').localeCompare(String(b.date || '')));
}

function getSessionRoundLabel(match) {
  if (!match) return '';
  const rounds = getSessionRounds(match.sessionId || match.id);
  const total = Math.max(rounds.length || 1, Number(match.roundNumber) || 1);
  return `Session · Round ${Number(match.roundNumber) || 1} of ${total}`;
}

function buildNextRoundDraft(prior) {
  if (!prior) return createBlankSetupDraft();
  const sessionId = String(prior.sessionId || prior.id || uid());
  const rounds = getSessionRounds(sessionId);
  const nextRoundNumber = Math.max(1, ...rounds.map(r => Number(r.roundNumber) || 1)) + 1;
  const cleanPlayers = (Array.isArray(prior.players) ? prior.players : []).map((p, idx) => ({
    playerId: p.playerId,
    team: Number(p.team) || 1,
    slot: Number.isFinite(Number(p.slot)) ? Number(p.slot) : idx,
    teeId: '',
    scores: buildEmptyScores(18),
    stats: buildEmptyStats(18)
  }));
  const draft = createEmptyMatch({
    id: uid(),
    date: todayIso(),
    name: `Round ${nextRoundNumber}`,
    courseId: '',
    teeId: '',
    allowance: prior.allowance || 100,
    holeCount: getRequestedHoleCount(prior) || 18,
    nineHoleSegment: prior.nineHoleSegment || 'front',
    customStartHole: Number(prior.customStartHole) || 1,
    teamCount: Number(prior.teamCount) || 1,
    playersPerTeam: Number(prior.playersPerTeam) || Math.max(1, cleanPlayers.length),
    teamNames: Array.isArray(prior.teamNames) ? clonePlain(prior.teamNames) : [],
    scoringAccessMode: normalizeScoringAccessMode(prior.scoringAccessMode || prior.scoreEntryMode || 'single_device'),
    scoreEntryMode: getLegacyScoreEntryMode(prior.scoringAccessMode || prior.scoreEntryMode || 'single_device'),
    officialScorerName: prior.officialScorerName || 'Official scorer',
    statTrackingEnabled: !!prior.statTrackingEnabled,
    smartScoreAdvanceEnabled: prior.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!prior.smartScoreAdvanceEnabled,
    smartScoreAdvancePreset: normalizeSmartScoreAdvancePreset(prior.smartScoreAdvancePreset),
    statTrackingPlayerIds: Array.isArray(prior.statTrackingPlayerIds) ? clonePlain(prior.statTrackingPlayerIds) : null,
    selectedGames: [],
    players: cleanPlayers,
    storageMode: prior.storageMode === 'shared' ? 'shared' : 'local',
    sharedHostDeviceId: prior.sharedHostDeviceId || '',
    sharedHostParticipantId: prior.sharedHostParticipantId || '',
    sharedDevices: Array.isArray(prior.sharedDevices) ? clonePlain(prior.sharedDevices) : [],
    sharedParticipants: Array.isArray(prior.sharedParticipants) ? clonePlain(prior.sharedParticipants) : [],
    sharedPlayerAssignments: prior.sharedPlayerAssignments && typeof prior.sharedPlayerAssignments === 'object' ? clonePlain(prior.sharedPlayerAssignments) : {},
    sharedMatchCode: prior.sharedMatchCode || '',
    sessionId,
    sessionName: prior.sessionName || 'Session',
    sessionCreatedAt: prior.sessionCreatedAt || prior.date || todayIso(),
    roundNumber: nextRoundNumber,
    previousRoundId: prior.id,
    startedFromPriorRoundId: prior.id
  });
  draft.courseId = '';
  draft.teeId = '';
  draft.selectedGames = [];
  draft.players = cleanPlayers;
  draft.greeniesWinners = {};
  draft.notes = '';
  draft.roundRecapNotes = '';
  draft.roundRecap = '';
  draft.roundRecapGenerated = '';
  draft.roundRecapFinal = '';
  draft.completedAt = null;
  draft.status = 'active';
  draft.roundTiming = { startedAt: null, endedAt: null };
  draft.holeFirstCompletedAt = {};
  return draft;
}

function showPostRoundActions(match = getActiveMatch()) {
  const modal = document.getElementById('postRoundActionsPrompt');
  if (!modal || !match) return;
  const title = document.getElementById('postRoundActionsTitle');
  const text = document.getElementById('postRoundActionsText');
  if (title) title.textContent = 'Round Complete ✓';
  if (text) text.textContent = `${completedHoles(match)} holes completed. What would you like to do?`;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function hidePostRoundActions() {
  const modal = document.getElementById('postRoundActionsPrompt');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function isCompletedSummarySession(match, summaryMatchId = uiState.completedSummaryMatchId, activeMatchId = state.activeMatchId) {
  return !!match && match.status === 'complete' && String(summaryMatchId || '') === String(match.id || '') && String(activeMatchId || '') === String(match.id || '');
}

function closeCompletedSummarySession() {
  const summaryMatch = getMatch(uiState.completedSummaryMatchId);
  if (!isCompletedSummarySession(summaryMatch)) return false;
  clearScheduledSharedMatchSync(summaryMatch.id);
  sharedMatchSyncDirty.delete(summaryMatch.id);
  if (String(state.lastOpenedSharedMatchId || '') === String(summaryMatch.id)) state.lastOpenedSharedMatchId = null;
  state.activeMatchId = null;
  uiState.completedSummaryMatchId = null;
  setupWorkflowMode = 'landing';
  editingMatchId = null;
  currentHole = 1;
  currentHoleSequenceStart = 1;
  pendingScoreCommitFocus = null;
  scoreInputSessionState.clear();
  finishConfirmArmed = false;
  newMatchPromptFinishArmed = false;
  roundCompletePromptShownForMatchId = null;
  state.notes = '';
  hidePostRoundActions();
  hideRoundCompletePrompt();
  hideRoundEndPrompt();
  persist({ skipRender: true });
  return true;
}

function exitCompletedSummaryToMatch() {
  if (!closeCompletedSummarySession()) return false;
  activateTab('setup');
  renderAll();
  renderMatchSetupState();
  toast('Completed round saved. Start or join your next match.');
  return true;
}

function startAnotherRoundWithSameGroup() {
  const prior = getActiveMatch();
  if (!prior) return toast('No completed round is loaded.');
  hidePostRoundActions();
  const draft = buildNextRoundDraft(prior);
  pendingNextRoundSessionContext = {
    sessionId: draft.sessionId,
    sessionName: draft.sessionName,
    sessionCreatedAt: draft.sessionCreatedAt,
    roundNumber: draft.roundNumber,
    previousRoundId: prior.id,
    startedFromPriorRoundId: prior.id,
    sharedMatchCode: prior.sharedMatchCode || '',
    sharedHostDeviceId: prior.sharedHostDeviceId || '',
    sharedHostParticipantId: prior.sharedHostParticipantId || '',
    sharedDevices: Array.isArray(prior.sharedDevices) ? clonePlain(prior.sharedDevices) : [],
    sharedParticipants: Array.isArray(prior.sharedParticipants) ? clonePlain(prior.sharedParticipants) : [],
    sharedPlayerAssignments: prior.sharedPlayerAssignments && typeof prior.sharedPlayerAssignments === 'object' ? clonePlain(prior.sharedPlayerAssignments) : {},
    storageMode: prior.storageMode === 'shared' ? 'shared' : 'local'
  };
  closeCompletedSummarySession();
  state.activeMatchId = null;
  setupWorkflowMode = 'create';
  editingMatchId = null;
  currentHole = 1;
  currentHoleSequenceStart = 1;
  finishConfirmArmed = false;
  state.notes = '';
  roundCompletePromptShownForMatchId = null;
  resetMatchSetupFormDomToBlank();
  loadMatchEditor(null, draft);
  const title = document.getElementById('matchFormTitle');
  if (title) title.textContent = 'Start Another Round';
  renderMatchSetupState();
  activateTab('setup');
  toast('Same group copied forward. Select course, tees, and games for the new round.');
}

function renderSessionSummary() {
  const el = document.getElementById('sessionSummary');
  if (!el) return;
  const active = getActiveMatch();
  if (!active) {
    el.innerHTML = '<div class="tiny">No active session.</div>';
    return;
  }
  const rounds = getSessionRounds(active.sessionId || active.id);
  el.innerHTML = `
    <div class="item-header compact-item-header">
      <div>
        <div class="section-label">Session</div>
        <div class="tiny">${rounds.length} round${rounds.length === 1 ? '' : 's'} · ${escapeHtml(active.sessionName || 'Session')}</div>
      </div>
    </div>
    <div class="session-round-list top-gap">
      ${rounds.map(round => {
        const course = getCourse(round.courseId);
        const status = round.status === 'complete' ? 'Complete' : (state.activeMatchId === round.id ? 'In Progress' : 'Saved');
        return `<div class="session-round-row"><strong>Round ${Number(round.roundNumber) || 1}</strong><span>${escapeHtml(course?.name || 'Course not selected')} – ${escapeHtml(status)}</span></div>`;
      }).join('')}
    </div>`;
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
  const picker = document.getElementById('matchPlayersPicker');
  if (picker) picker.innerHTML = '';
  document.querySelectorAll('[data-player-slot], [data-player-tee-slot], [data-team-name], [data-game-key], [data-game-config], [data-side-field], [data-nine-point-player], [data-greenie-player]').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });
}

function startCleanNewMatchSetup() {
  closeCompletedSummarySession();
  pendingNextRoundSessionContext = null;
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
    setupWorkflowMode = 'create';
    editingMatchId = null;
    currentHole = 1;
    currentHoleSequenceStart = 1;
    pendingScoreCommitFocus = null;
    scoreInputSessionState.clear();
    finishConfirmArmed = false;
    newMatchPromptFinishArmed = false;
    roundCompletePromptShownForMatchId = null;
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

function startJoinNewMatchSetup({ message = 'Enter the new shared match code.' } = {}) {
  closeCompletedSummarySession();
  hidePostRoundActions();
  const priorId = state.activeMatchId;
  if (priorId) {
    const prior = getMatch(priorId);
    if (prior) {
      try { normalizeMatch(prior); } catch {}
    }
  }
  state.activeMatchId = null;
  setupWorkflowMode = 'join';
  editingMatchId = null;
  currentHole = 1;
  currentHoleSequenceStart = 1;
  finishConfirmArmed = false;
  roundCompletePromptShownForMatchId = null;
  persist({ skipRender: true });
  renderAll();
  renderMatchSetupState();
  activateTab('setup');
  window.setTimeout(() => {
    const nameInput = document.getElementById('setupJoinDeviceNameInput');
    if (nameInput && !nameInput.value) nameInput.value = getPreferredSharedDeviceName('');
    (nameInput || document.getElementById('setupJoinMatchCodeInput'))?.focus();
  }, 50);
  toast(message);
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
  setupWorkflowMode = 'create';
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


function hideRoundCompletePrompt() {
  const modal = document.getElementById('roundCompletePrompt');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
function showRoundCompletePrompt(match = getActiveMatch()) {
  if (!match || match.status === 'complete') return;
  if (!isSelectedRoundComplete(match, getTee(match.courseId, match.teeId))) return;
  if (roundCompletePromptShownForMatchId === match.id) return;
  roundCompletePromptShownForMatchId = match.id;
  const selectedCount = getPlayableHoleCount(match, getTee(match.courseId, match.teeId));
  const modal = document.getElementById('roundCompletePrompt');
  const title = document.getElementById('roundCompletePromptTitle');
  const text = document.getElementById('roundCompletePromptText');
  if (title) title.textContent = 'Round Complete';
  if (text) text.textContent = `${selectedCount}/${selectedCount} holes completed. Generate Match Summary?`;
  if (!modal) {
    const finishNow = window.confirm(`${selectedCount}/${selectedCount} holes completed. Finish round and generate Match Summary?\n\nOK = Finish Round\nCancel = Review Final Hole`);
    if (finishNow) {
      finishConfirmArmed = true;
      completeActiveRound();
    } else {
      currentHole = selectedCount;
      renderCurrentMatch();
    }
    return;
  }
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    try { document.getElementById('roundCompleteFinishBtn')?.focus?.({ preventScroll: true }); } catch (_) {}
  }, 0);
}
function reviewFinalHoleFromPrompt() {
  const match = getActiveMatch();
  if (match) currentHole = Math.max(1, getRequestedHoleCount(match));
  hideRoundCompletePrompt();
  renderCurrentMatch();
}
function finishRoundFromPrompt() {
  hideRoundCompletePrompt();
  finishConfirmArmed = true;
  completeActiveRound();
}

function syncFinishRoundUi(match = getActiveMatch()) {
  const scoringFinishBtn = document.getElementById('finishRoundBtn');
  const scoringConfirmBtn = document.getElementById('confirmFinishRoundBtn');
  const scoreboardFinishBtn = document.getElementById('scoreboardFinishRoundBtn');
  const scoreboardConfirmBtn = document.getElementById('scoreboardConfirmFinishRoundBtn');
  const setupFinishBtn = document.getElementById('setupFinishRoundBtn');
  const setupConfirmBtn = document.getElementById('setupConfirmFinishRoundBtn');
  const scoreboardRoundState = document.getElementById('scoreboardRoundState');
  const postRoundInline = document.getElementById('postRoundActionsInline');
  const postRoundInlineText = document.getElementById('postRoundActionsInlineText');
  const scoreboardRoundActions = scoreboardRoundState?.closest?.('.scoreboard-round-actions') || null;
  const isComplete = !!match && match.status === 'complete';
  const hasMatch = !!match;
  const activeRound = hasActiveRound(match);
  const reopenedEdit = !!match?.previousCompletedAt;
  const show = (el, visible) => {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    if (visible) el.style.removeProperty('display');
    else el.style.setProperty('display', 'none');
    el.disabled = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };
  show(scoringFinishBtn, false);
  show(scoringConfirmBtn, false);
  show(scoreboardFinishBtn, hasMatch && !isComplete && activeRound);
  show(scoreboardConfirmBtn, false);
  show(setupFinishBtn, false);
  show(setupConfirmBtn, false);
  show(postRoundInline, hasMatch && isComplete);
  if (scoreboardFinishBtn) scoreboardFinishBtn.textContent = reopenedEdit ? 'Save / End Round' : 'Finish / End Round';
  if (postRoundInlineText && hasMatch && isComplete) postRoundInlineText.textContent = `${completedHoles(match)} holes completed. What would you like to do next?`;
  if (scoreboardRoundActions) scoreboardRoundActions.classList.toggle('no-active-round', !activeRound && !isComplete);
  if (scoreboardRoundState) {
    if (!activeRound && !isComplete) scoreboardRoundState.textContent = 'No active round. Start scoring to generate reports and summaries.';
    else if (isComplete) scoreboardRoundState.textContent = 'Round complete. Next-step options are available below.';
    else if (reopenedEdit) scoreboardRoundState.textContent = 'Editing previously completed round. Finish / End Round will overwrite the saved round.';
    else scoreboardRoundState.textContent = `${completedHoles(match)}/${getRequestedHoleCount(match)} holes completed.`;
  }
}

function hideRoundEndPrompt() {
  const modal = document.getElementById('roundEndPrompt');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
function showRoundEndPrompt(mode, match = getActiveMatch()) {
  if (!match) return toast('No active match.');
  const requested = getRequestedHoleCount(match);
  const completed = completedHoles(match);
  const modal = document.getElementById('roundEndPrompt');
  const title = document.getElementById('roundEndPromptTitle');
  const text = document.getElementById('roundEndPromptText');
  const primary = document.getElementById('roundEndPrimaryBtn');
  const secondary = document.getElementById('roundEndSecondaryBtn');
  const reasonBox = document.getElementById('roundEndReasonChoices');
  if (!modal || !title || !text || !primary || !secondary) {
    if (mode === 'early') {
      const ok = window.confirm(`End Round Early?\n\n${completed} of ${requested} holes completed.\n\nOK = End Round\nCancel = Continue Playing`);
      if (ok) finishRoundFromPrompt();
      return;
    }
    const ok = window.confirm(`Round Complete\n\nGenerate Match Summary?\n\nOK = Finish Round\nCancel = Review Final Hole`);
    if (ok) finishRoundFromPrompt();
    else reviewFinalHoleFromPrompt();
    return;
  }
  modal.dataset.roundEndMode = mode;
  if (reasonBox) {
    reasonBox.innerHTML = '';
    reasonBox.classList.add('hidden');
  }
  if (mode === 'early') {
    title.textContent = 'End Round Early?';
    text.textContent = `${completed} of ${requested} holes completed. Why did the round end early?`;
    if (reasonBox) {
      reasonBox.classList.remove('hidden');
      const currentReason = String(match.roundEndReason || 'darkness');
      const options = [
        ['darkness', 'Darkness'],
        ['weather', 'Weather'],
        ['injury', 'Injury'],
        ['conceded', 'Conceded'],
        ['endedEarly', 'Group Ended Early'],
        ['other', 'Other']
      ];
      reasonBox.innerHTML = `<div class="round-end-reason-grid">${options.map(([value,label]) => `<label class="round-end-reason-option"><input type="radio" name="roundEndReason" value="${value}" ${value === currentReason ? 'checked' : ''}> <span>${label}</span></label>`).join('')}</div>`;
    }
    primary.textContent = 'End Round';
    secondary.textContent = 'Continue Playing';
  } else {
    title.textContent = 'Round Complete';
    text.textContent = 'Generate Match Summary?';
    primary.textContent = 'Finish Round';
    secondary.textContent = 'Review Final Hole';
  }
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => { try { primary.focus({ preventScroll: true }); } catch (_) {} }, 0);
}
function handleScoreboardFinishEndRound() {
  const match = getActiveMatch();
  if (!match) return toast('No active match.');
  showRoundEndPrompt(isSelectedRoundComplete(match, getTee(match.courseId, match.teeId)) ? 'complete' : 'early', match);
}
function handleRoundEndPrimary() {
  const match = getActiveMatch();
  const modal = document.getElementById('roundEndPrompt');
  const mode = modal?.dataset?.roundEndMode || '';
  if (match) {
    if (mode === 'early') match.roundEndReason = document.querySelector('input[name="roundEndReason"]:checked')?.value || 'endedEarly';
    else match.roundEndReason = 'completed';
  }
  hideRoundEndPrompt();
  finishConfirmArmed = true;
  completeActiveRound();
}
function handleRoundEndSecondary() {
  const modal = document.getElementById('roundEndPrompt');
  const mode = modal?.dataset?.roundEndMode || '';
  hideRoundEndPrompt();
  if (mode === 'complete') reviewFinalHoleFromPrompt();
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
    match.roundTiming = match.roundTiming && typeof match.roundTiming === 'object' ? match.roundTiming : {};
    match.roundTiming.startedAt = match.roundTiming.startedAt || match.roundStartedAt || match.createdAt || match.completedAt;
    ensureRoundTimingEnded(match, match.completedAt, { overwrite: wasReopened });
    const finishMetrics = computeMatchMetrics(match);
    const finishCompletion = getRoundCompletionState(match, finishMetrics);
    if (!match.roundEndReason) match.roundEndReason = finishCompletion.isComplete ? 'completed' : 'endedEarly';
    match.roundCompletionState = finishCompletion;
    match.completedHoleCount = finishCompletion.completedHoleCount;
    match.remainingHoleNumbers = finishCompletion.remainingHoleNumbers;
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
    showPostRoundActions(match);
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

function ensurePlayInputState(match) {
  if (!match) return false;
  let changed = false;
  const holeCount = getRequestedHoleCount(match);
  (match.players || []).forEach((mp, idx) => {
    if (!Array.isArray(mp.scores) || mp.scores.length < holeCount) {
      const existing = Array.isArray(mp.scores) ? mp.scores : [];
      mp.scores = Array.from({ length: holeCount }, (_, i) => existing[i] || { holeNumber: i + 1, gross: null });
      changed = true;
    }
    if (!Array.isArray(mp.stats) || mp.stats.length < holeCount) {
      const existing = Array.isArray(mp.stats) ? mp.stats : [];
      mp.stats = Array.from({ length: holeCount }, (_, i) => normalizeHoleStat(existing[i] || {}, i));
      changed = true;
    }
    if (!Number.isFinite(Number(mp.slot))) { mp.slot = idx; changed = true; }
  });
  currentHole = Math.min(Math.max(1, Number(currentHole) || 1), Math.max(1, holeCount));
  if (changed) console.debug?.('[PlayInputInit]', { players: match.players?.length || 0, holeCount, currentHole });
  return changed;
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
    renderMemoryQuickCapture(null);
    return;
  }
  const course = getMatchCourse(match);
  const tee = getMatchTee(match, match.teeId);
  if (ensurePlayInputState(match)) persist({ skipRender: true });
  const metrics = computeMatchMetrics(match);
  const holeCount = getPlayableHoleCount(match, tee);
  const scoringHoles = getSelectedScoringHoles(match, tee);
  const reopenedNote = match.previousCompletedAt
    ? ' · Reopened from completed round (Finish Round will overwrite the saved round)'
    : '';
  const timing = getRoundElapsedTimeState(match, metrics);
  metaEl.textContent = `${getSessionRoundLabel(match)} · ${match.date} · ${match.name || 'Round'} · ${course?.name || ''} · ${getHoleSegmentLabel(match, tee)} · ${metrics?.completed || 0}/${holeCount} holes completed${timing.available ? ` · ${timing.label}` : ''}${metrics?.teeFallbackUsed ? ` · Tee fallback: ${tee?.teeName || 'first saved tee'}` : ''}${match.storageMode === 'shared' ? ` · Shared ID ${match.sharedMatchRef || match.sharedMatchId || match.id}` : ''}${reopenedNote}`;
  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');
  currentHole = Math.min(holeCount, Math.max(1, currentHole));
  const hole = scoringHoles[currentHole - 1];
  renderHoleSelector(match, scoringHoles);
  const teamText = metrics?.teams?.length === 2 ? `${formatMatchDiff(metrics.matchDiff, match)} overall` : 'Singles leaderboard';
  const teeYardages = hole ? [...new Map((metrics?.players || []).map(p => {
    const playerTee = p.tee || tee;
    const playerHole = getPlayerHole(match, p, currentHole - 1, tee) || hole;
    const holeTeeName = getHoleTeeNameForDisplay(match.courseId, playerTee, currentHole - 1) || playerTee?.teeName || 'Tee';
    const key = `${playerTee?.id || p.teeId || ''}|${holeTeeName}|${playerHole?.yardage || ''}`;
    return [key, `${holeTeeName} ${playerHole?.yardage ? `${formatYardageValue(playerHole.yardage)} yds` : '— yds'}`];
  })).values()].join(' · ') : '';
  const primaryStatusLine = getPrimaryMatchStatusLine(match, metrics);
  const honorsStatusLine = getSneakySandyPoleyHonorsLine(match, metrics);
  const holeSummaryEl = document.getElementById('holeSummary');
  if (holeSummaryEl) {
    if (hole) {
      const holeMeta = `Par ${hole.par || '-'} · SI ${hole.strokeIndex || '-'}`;
      const statusItems = `${primaryStatusLine ? `<div class="score-primary-status">${escapeHtml(primaryStatusLine)}</div>` : ''}${honorsStatusLine ? `<div class="score-honors-status">${escapeHtml(honorsStatusLine)}</div>` : ''}`;
      holeSummaryEl.innerHTML = `<div class="score-hole-meta">${escapeHtml(holeMeta)}</div>${statusItems ? `<div class="score-status-row">${statusItems}</div>` : ''}`;
    } else {
      holeSummaryEl.innerHTML = '';
    }
  }
  if (match.storageMode === 'shared') console.debug('[SharedStatGate]', 'renderCurrentMatch shared gate summary', describeSharedAssignmentState(match));
  renderScoreAccessCard(match);
  renderMemoryQuickCapture(match);
  renderScoreGrid(match, tee, metrics, scoringHoles);
  renderSneakySandyPoleyEntry(match, hole, metrics);
  renderStatTrackingEntry(match, hole, metrics);
  renderSneakySandyPoleyNote(match, hole, metrics);
  renderGreeniesEntry(match, hole);
  renderHoleJumpTiles(match);
  initializePlayInputs();
  const saveBtn = document.getElementById('saveScoresBtn');
  if (saveBtn) saveBtn.disabled = getScoreAccessState(match).role === 'viewer';
  applyPendingScoreCommitFocus();
}



function getShortStatusName(name, maxLen = 10) {
  // v28.21.1: Preserve live-status player names and let the header wrap naturally
  // rather than truncating names with ellipses. Keep the maxLen argument for
  // backward-compatible call sites, but do not shorten the returned label here.
  return String(name || '').trim();
}

function getConciseTeamName(match, teamNo, metrics, maxLen = 12) {
  // v28.21.1: Preserve custom team names and player-derived team labels.
  // The live status line is styled to wrap instead of forcing truncation.
  const custom = String(match?.teamNames?.[Number(teamNo) - 1] || '').trim();
  if (custom) return custom;
  const members = (metrics?.teams || []).find(t => Number(t.team) === Number(teamNo))?.members || [];
  if (members.length) {
    const names = members.map(m => getShortStatusName(m?.player?.name || '')).filter(Boolean);
    if (names.length === 1) return names[0];
    const joined = names.join('/');
    return joined || `Team ${teamNo}`;
  }
  return `Team ${teamNo}`;
}

function formatConciseTeamDiff(match, metrics, diff) {
  const n = Number(diff) || 0;
  if (!Number.isFinite(n) || n === 0) return 'AS';
  const teamNo = n > 0 ? 1 : 2;
  return `${getConciseTeamName(match, teamNo, metrics)} +${Math.abs(n)}`;
}

function buildLiveNassauStatus(match, metrics) {
  return getCompactGameStatus(match, metrics, 'nassau', (match?.selectedGames || []).find(g => g.key === 'nassau'));
}

function buildLiveTeamMatchStatus(match, metrics) {
  const status = getCompactGameStatus(match, metrics, 'team_match', (match?.selectedGames || []).find(g => g.key === 'team_match'));
  return status ? `Match: ${status}` : '';
}

function buildLiveIndividualMatchStatus(match, metrics) {
  const pairings = getIndividualMatchPairings(match, metrics);
  const pairing = pairings.find(p => ['match_play', 'nassau'].includes(String(p.game || '').toLowerCase())) || pairings[0];
  if (!pairing) return '';
  if (String(pairing.game || '').toLowerCase() === 'nassau') {
    const diff = currentHole <= 9 ? pairing.front : pairing.back;
    const segment = currentHole <= 9 ? 'F' : 'B';
    if (!Number.isFinite(Number(diff)) || Number(diff) === 0) return `Match ${segment}: ${formatLeaderThruStatus('', 0, pairing.completedCount)}`;
    const leader = Number(diff) > 0 ? pairing.playerA?.player?.name : pairing.playerB?.player?.name;
    return `Match ${segment}: ${formatLeaderThruStatus(getShortStatusName(leader, 9), diff, pairing.completedCount)}`;
  }
  return `Match: ${formatSideMatchThruStatus(pairing)}`;
}

function getSkinCarryoverCount(match, metrics, cfg = {}) {
  const basis = String(cfg.basis || 'net').toLowerCase();
  const isTeam = cfg.skinsType === 'team';
  let carry = 0;
  (metrics?.holeResults || []).forEach(h => {
    if (!h.completed) return;
    let hasWinner = false;
    if (isTeam) {
      const scoredTeams = (metrics.teams || []).map(t => ({ team: t.team, value: getTeamHoleScore(h, t.team, basis, 'best_ball') })).filter(t => Number.isFinite(t.value));
      if (scoredTeams.length >= 2) {
        const best = Math.min(...scoredTeams.map(t => t.value));
        hasWinner = scoredTeams.filter(t => t.value === best).length === 1;
      }
    } else {
      const scoredPlayers = (h.playerScores || []).map(ps => ({ playerId: ps.playerId, value: getHoleValueForBasis(ps, basis) })).filter(p => Number.isFinite(p.value));
      if (scoredPlayers.length >= 2) {
        const best = Math.min(...scoredPlayers.map(p => p.value));
        hasWinner = scoredPlayers.filter(p => p.value === best).length === 1;
      }
    }
    carry = hasWinner ? 0 : carry + 1;
  });
  return carry;
}

function buildLiveSkinsStatus(match, metrics, cfg = {}) {
  const skins = computeSkinResults(match, metrics, cfg);
  const carry = getSkinCarryoverCount(match, metrics, cfg);
  if (carry > 0) return `Skins: ${carry} CO`;
  const counts = skins.counts || {};
  const max = Math.max(0, ...Object.values(counts).map(Number));
  if (max <= 0) return 'Skins: 0';
  const leaders = Object.entries(counts).filter(([, n]) => Number(n) === max);
  const label = cfg.skinsType === 'team'
    ? getConciseTeamName(match, leaders[0]?.[0], metrics, 9)
    : getShortStatusName(getPlayer(leaders[0]?.[0])?.name || 'Player', 9);
  return `Skins: ${label} ${max}`;
}

function buildLiveNinePointStatus(match, metrics, cfg = {}) {
  const nine = computeNinePointResults(match, metrics, cfg);
  const rows = Array.isArray(nine.leaderboard) ? nine.leaderboard : [];
  if (rows.length !== 3) return '';
  const parts = rows.map(row => `${getShortStatusName(row.name)} ${formatSigned(Number(row.total) || 0)}`);
  return `9PT: ${parts.join(' ')}`;
}

function buildLiveGreeniesStatus(match, metrics, cfg = {}) {
  const greenies = getGreeniesResults(match, metrics, cfg);
  const counts = greenies.counts || {};
  const max = Math.max(0, ...Object.values(counts).map(Number));
  if (max <= 0) return '';
  const leaders = Object.entries(counts).filter(([, n]) => Number(n) === max);
  const label = getShortStatusName(getPlayer(leaders[0]?.[0])?.name || 'Player', 8);
  return `G: ${label} ${max}`;
}

function getCompactGameStatus(match, metrics, gameKey, cfg = null) {
  if (!match || !metrics || !gameKey) return '';
  const config = cfg || (match.selectedGames || []).find(g => g.key === gameKey) || {};
  if (gameKey === 'nassau' && (metrics.teams || []).length === 2) {
    const basis = String(config.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
    const diffs = computeNassauDiffsForBasis(metrics, basis);
    return formatTeamGameThruStatus(match, metrics, diffs.overall, 'nassau');
  }
  if (gameKey === 'team_match' && (metrics.teams || []).length === 2) {
    const diffs = computeTeamGameDiffs(match, metrics, 'team_match');
    return formatTeamGameThruStatus(match, metrics, diffs.overall, 'team_match');
  }
  if (gameKey === 'singles_match') {
    return formatSinglesMatchThruStatus(computeSinglesMatchPlayResult(match, metrics, config));
  }
  if (gameKey === 'individual_match') {
    const pairings = getIndividualMatchPairings(match, metrics);
    return pairings.length ? pairings.map(pair => `${pair.label}: ${formatSideMatchThruStatus(pair)}`).join(' · ') : 'Active';
  }
  if (gameKey === 'team_stroke' && (metrics.teams || []).length >= 2) {
    const stroke = getTeamStrokeScoreboardData(match, metrics, config);
    const thru = Number(metrics.completed || 0);
    if (!stroke.leader) return thru ? `Tied thru ${thru}` : 'Not started';
    return stroke.tie
      ? (thru ? `Tied thru ${thru}` : 'Not started')
      : `${getConciseTeamName(match, stroke.leader.team, metrics)} +${stroke.margin} ${formatBasisLabel(stroke.basis).toLowerCase()} thru ${thru}`;
  }
  if (gameKey === 'stroke_net' || gameKey === 'stroke_gross') {
    const basis = gameKey === 'stroke_gross' ? 'gross' : 'net';
    const field = basis === 'gross' ? 'grossTotal' : 'leaderboardNetTotal';
    const rows = (metrics.players || []).filter(p => Number(p.holesPlayed || 0) > 0).sort((a, b) => Number(a[field] || 0) - Number(b[field] || 0));
    if (!rows.length) return 'Not started';
    const leader = rows[0];
    const runner = rows[1];
    const margin = runner ? Number(runner[field] || 0) - Number(leader[field] || 0) : 0;
    const thru = Math.max(0, ...rows.map(row => Number(row.holesPlayed || 0)));
    return margin ? `${leader.player?.name || 'Leader'} +${margin} ${basis} thru ${thru}` : `Tied thru ${thru}`;
  }
  if (gameKey === 'skins' || gameKey === 'net_skins') {
    const skinsCfg = gameKey === 'net_skins' ? { ...config, basis: 'net' } : config;
    const skins = computeSkinResults(match, metrics, skinsCfg);
    const entries = Object.entries(skins.counts || {}).filter(([, n]) => Number(n) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!entries.length) return 'None yet';
    return entries.slice(0, 3).map(([id, count]) => {
      const label = skinsCfg.skinsType === 'team' ? getConciseTeamName(match, Number(id), metrics) : (getPlayer(id)?.name || 'Player');
      return `${label} ${count} skin${Number(count) === 1 ? '' : 's'}`;
    }).join(' · ');
  }
  if (gameKey === 'greenies') {
    const greenies = getGreeniesResults(match, metrics, config);
    const entries = Object.entries(greenies.counts || {}).filter(([, n]) => Number(n) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!entries.length) return 'None yet';
    return entries.slice(0, 3).map(([id, count]) => `${getPlayer(id)?.name || 'Player'} ${count}`).join(' · ');
  }
  if (gameKey === 'nine_point') {
    const nine = computeNinePointResults(match, metrics, config);
    const rows = Array.isArray(nine.leaderboard) ? nine.leaderboard : [];
    if (rows.length !== 3) return 'Active';
    const lead = rows[0];
    const runner = rows[1];
    const margin = runner ? Number(lead.total || 0) - Number(runner.total || 0) : 0;
    return margin ? `${lead.name} +${margin}` : 'Tied';
  }
  if (gameKey === 'sneaky_sandy_poley') {
    return getSneakySandyPoleyStatus(match, metrics).replace(/^SSP(?: Base)?:\s*/, '');
  }
  return 'Active';
}

function buildQuickScoreboardGameStatusRows(match, metrics) {
  const selected = getOrderedSelectedGames(match);
  if (!selected.length) return '';
  const rows = selected.map(cfg => {
    const status = getCompactGameStatus(match, metrics, cfg.key, cfg);
    const label = cfg.key === 'sneaky_sandy_poley' ? 'SSP' : getGameLabel(cfg.key);
    const trend = cfg.key === 'sneaky_sandy_poley' ? getSneakySandyPoleySmartTrend(match, { metrics }) : '';
    return status ? `<div class="quick-game-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(status)}</strong>${trend ? `<small>${escapeHtml(trend)}</small>` : ''}</div>` : '';
  }).filter(Boolean).join('');
  return rows ? `<section class="quick-scoreboard-section"><h4>Active Games</h4><div class="quick-game-list">${rows}</div></section>` : '';
}

function buildLiveScoringStatusLine(match, metrics) {
  if (!match || !metrics) return '';
  const games = Array.isArray(match.selectedGames) ? match.selectedGames : [];
  if (!games.length) return '';
  const byKey = new Map(games.map(g => [g.key, g]));
  const items = [];
  const push = (text) => {
    const clean = String(text || '').trim();
    if (clean && items.length < 3) items.push(clean);
  };
  if (byKey.has('nassau')) push(buildLiveNassauStatus(match, metrics));
  if (byKey.has('team_match')) push(buildLiveTeamMatchStatus(match, metrics));
  if (byKey.has('individual_match')) push(buildLiveIndividualMatchStatus(match, metrics));
  if (byKey.has('skins')) push(buildLiveSkinsStatus(match, metrics, byKey.get('skins')));
  if (byKey.has('nine_point')) push(buildLiveNinePointStatus(match, metrics, byKey.get('nine_point')));
  if (byKey.has('greenies')) push(buildLiveGreeniesStatus(match, metrics, byKey.get('greenies')));
  if (byKey.has('sneaky_sandy_poley')) push(getSneakySandyPoleyStatus(match, metrics));
  return items.slice(0, 3).join(' | ');
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

function renderSneakySandyPoleyEntry(match, hole, metrics) {
  const wrap = document.getElementById('sneakySandyPoleyEntryWrap');
  if (!wrap) return;
  const cfg = getSneakySandyPoleyConfig(match);
  if (!cfg) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  const actualHoleNumber = Number(hole?.holeNumber || currentHole) || currentHole;
  const input = getSneakySandyPoleyHoleInput(match, actualHoleNumber);
  const players = getVisibleScoringPlayers(match, (metrics?.players || []), { stats: false });
  const canEditAny = players.some(p => canEditPlayerScore(match, p.team, p.playerId));
  const canEditHoleFacts = match.storageMode !== 'shared' || isCurrentDeviceMatchHost(match);
  const proxState = resolveSneakySandyPoleyProxSelection(input, players);
  const proxEligiblePlayers = proxState.eligiblePlayers;
  if (input.proxPlayerId !== proxState.proxPlayerId) {
    input.proxPlayerId = proxState.proxPlayerId;
    persist({ skipRender: true });
  }
  const actionKeys = [
    { key: 'sneaky', label: 'Sneaky' },
    { key: 'sandy', label: 'Sandy' },
    { key: 'poley', label: 'Poley' },
    { key: 'greeny', label: 'Greeny' },
  ];
  const ledger = buildSneakySandyPoleyLedger(match, { metrics });
  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="card inset-card ssp-entry-card">
      <div class="item-header compact-item-header">
        <div>
          <div class="section-label ssp-section-title">Sneaky / Sandy / Poley</div>
          <div class="tiny ssp-section-subline">Game Action · Live Preview · Hole ${actualHoleNumber}</div>
        </div>
      </div>
      <div class="ssp-status-row top-gap">
        <span>Stakes: ${formatPositiveCurrency(cfg.pointValue, 1)} per point</span>
        ${cfg.validateGreenyProx ? '<span>Validate on: Greeny/Prox require 2 putts or less.</span>' : '<span>Validate off</span>'}
        <span class="ssp-multiplier-status">${escapeHtml(input.rebridge ? 'Re-Bridge 4x' : input.bridge ? 'Bridge 2x' : '1x')}</span>
        ${cfg.allowUmbee ? `<span>Umbee allowed${cfg.allowUmbeeWithBridge ? ' with Bridge/Re-Bridge' : ''}</span>` : '<span>Umbee off</span>'}
      </div>
      ${cfg.allowBridgeRebridge ? `<div class="ssp-header-actions top-gap" aria-label="Bridge controls">
        <span class="tiny ssp-header-actions-label">Tee-box call</span>
        <div class="ssp-chip-group ssp-bridge-chip-group">
          <label class="ssp-chip"><input type="checkbox" data-ssp-hole-key="bridge" ${input.bridge ? 'checked' : ''} ${canEditHoleFacts ? '' : 'disabled'} /><span>${input.bridge ? '✓ Bridge' : 'Bridge'}</span></label>
          <label class="ssp-chip"><input type="checkbox" data-ssp-hole-key="rebridge" ${input.rebridge ? 'checked' : ''} ${canEditHoleFacts ? '' : 'disabled'} /><span>${input.rebridge ? '✓ Re-Bridge' : 'Re-Bridge'}</span></label>
        </div>
      </div>` : ''}
      <div class="ssp-player-list top-gap">
        ${players.map(p => {
          const row = input.players[p.playerId] || {};
          const canEdit = canEditPlayerScore(match, p.team, p.playerId);
          return `<div class="ssp-player-row ${canEdit ? '' : 'is-readonly'}">
            <div class="ssp-player-name"><strong title="${escapeHtml(p.player?.name || 'Player')}">${escapeHtml(p.player?.name || 'Player')}</strong><span class="tiny">${escapeHtml(getTeamLabel(match, p.team))}${canEdit ? '' : ' · read only'}</span></div>
            <div class="ssp-chip-group">
              ${actionKeys.map(action => `<label class="ssp-chip"><input type="checkbox" data-ssp-player="${escapeHtml(p.playerId)}" data-ssp-key="${action.key}" ${row[action.key] ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>${row[action.key] ? `✓ ${action.label}` : action.label}</span></label>`).join('')}
            </div>
          </div>`;
        }).join('') || '<div class="tiny">No scoring players available.</div>'}
      </div>
      <div class="grid two compact-grid top-gap">
        <label><span>Prox</span><select data-ssp-prox ${canEditHoleFacts && proxEligiblePlayers.length ? '' : 'disabled'}>
          <option value="">None</option>
          ${proxEligiblePlayers.length > 1 ? `<option value="${SSP_PROX_TBD_VALUE}" ${proxState.uiValue === SSP_PROX_TBD_VALUE ? 'selected' : ''}>TBD</option>` : ''}
          ${proxEligiblePlayers.map(p => `<option value="${escapeHtml(p.playerId)}" ${proxState.uiValue === p.playerId ? 'selected' : ''}>${escapeHtml(p.player?.name || 'Player')}</option>`).join('')}
        </select></label>
        ${proxEligiblePlayers.length ? (proxEligiblePlayers.length > 1 ? '<div class="tiny">Choose Prox when multiple Greenies are selected.</div>' : '<div class="tiny">Only Greeny is auto-selected for Prox.</div>') : '<div class="tiny">Select Greeny for a player to enable Prox.</div>'}
      </div>
      ${buildSneakySandyPoleyHolePreviewHtml(match, ledger, actualHoleNumber)}
    </div>`;
}

function refreshFeaturedCompetitionLivePreview() {
  const match = getActiveMatch();
  if (!match) return;
  const savedMetrics = computeMatchMetrics(match);
  const savedStatusLine = getPrimaryMatchStatusLine(match, savedMetrics);
  const previewMatch = JSON.parse(JSON.stringify(match));
  applyCurrentHoleDomToMatch(previewMatch);
  const metrics = computeMatchMetrics(previewMatch);
  const previewSavedLabel = getPrimaryMatchStatusLine(previewMatch, metrics);
  const includesDraft = hasUnsavedVisibleScoreInputs() && previewSavedLabel !== savedStatusLine;
  previewMatch.__includesUnsavedDraft = includesDraft;
  if (isSneakySandyPoleyEnabled(match)) {
    const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
    renderSneakySandyPoleyEntry(previewMatch, scoringHoles[currentHole - 1] || null, metrics);
  }
  const primaryStatusLine = includesDraft ? getPrimaryMatchStatusLine(previewMatch, metrics, { includesDraft: true }) : savedStatusLine;
  const statusEl = document.getElementById('holeSummary')?.querySelector('.score-primary-status');
  if (statusEl) statusEl.textContent = primaryStatusLine;
}

function renderSneakySandyPoleyNote(match, hole, metrics) {
  const wrap = document.getElementById('sneakySandyPoleyNoteWrap');
  if (!wrap) return;
  const cfg = getSneakySandyPoleyConfig(match);
  if (!cfg) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  const actualHoleNumber = Number(hole?.holeNumber || currentHole) || currentHole;
  const input = getSneakySandyPoleyHoleInput(match, actualHoleNumber);
  const players = getVisibleScoringPlayers(match, (metrics?.players || []), { stats: false });
  const canEditAny = players.some(p => canEditPlayerScore(match, p.team, p.playerId));
  const canEditHoleFacts = match.storageMode !== 'shared' || isCurrentDeviceMatchHost(match);
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<label class="ssp-note-field"><span>Optional SSP note</span><input type="text" maxlength="240" data-ssp-notes value="${escapeHtml(input.notes || '')}" placeholder="Optional SSP note" ${canEditHoleFacts ? '' : 'disabled'} /></label>${!canEditHoleFacts ? '<div class="tiny">Host controls Prox, Bridge/Re-Bridge, and the SSP note in Shared Match.</div>' : ''}`;
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
  const statPlayers = getVisibleScoringPlayers(match, (metrics?.players || []), { stats: true }).filter(p => isPlayerStatTrackingEnabled(match, p.playerId));
  wrap.classList.remove('hidden');
  if (!statPlayers.length) {
    wrap.innerHTML = '<div class="card inset-card stat-entry-card"><div class="section-label">Stat tracking</div><div class="tiny top-gap">No players were selected for stat tracking.</div></div>';
    return;
  }
  const canShowFairway = isFairwayHole;
  const columns = [
    ...(canShowFairway ? [{ key: 'fairway', label: 'FW' }] : []),
    { key: 'green', label: 'GIR' },
    { key: 'upAndDown', label: 'U&D' },
    { key: 'sandy', label: 'Sandy' },
    { key: 'putts', label: 'Putts' },
    { key: 'penaltyStrokes', label: 'Pen' },
  ];
  const stepper = (playerId, key, value, disabled, extraAttrs = '') => `
    <div class="stat-stepper ${disabled ? 'is-disabled' : ''}" role="group" aria-label="${escapeHtml(key === 'putts' ? 'Putts' : 'Penalty strokes')}">
      <button type="button" class="stat-step-btn" data-stat-step="down" data-stat-player="${escapeHtml(playerId)}" data-stat-key="${escapeHtml(key)}" ${disabled ? 'disabled' : ''}>−</button>
      <input class="score-input ${key === 'putts' ? 'stat-putts-input' : 'stat-penalty-input'} stat-step-input" type="tel" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" min="0" max="9" data-stat-player="${escapeHtml(playerId)}" data-stat-key="${escapeHtml(key)}" value="${Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : (key === 'putts' ? 2 : 0)}" ${extraAttrs} ${disabled ? 'disabled' : ''} />
      <button type="button" class="stat-step-btn" data-stat-step="up" data-stat-player="${escapeHtml(playerId)}" data-stat-key="${escapeHtml(key)}" ${disabled ? 'disabled' : ''}>+</button>
    </div>`;
  wrap.innerHTML = `
    <div class="card inset-card stat-entry-card stat-matrix-card">
      <div class="item-header compact-item-header">
        <div>
          <div class="section-label">Stat tracking · Hole ${hole?.holeNumber || currentHole}</div>
          <div class="tiny">Enter stats in one quick pass across the group.${canShowFairway ? '' : ' Fairway is hidden on par 3s.'}</div>
        </div>
      </div>
      <div class="stat-matrix-wrap top-gap">
        <div class="stat-matrix-scroll">
          <table class="stat-matrix-table">
            <thead>
              <tr>
                <th class="stat-player-col">Player</th>
                ${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${statPlayers.map(p => {
                const matchPlayer = match.players.find(mp => mp.playerId === p.playerId);
                const stat = getPlayerStatEntry(matchPlayer, currentHole - 1);
                const canEdit = canEditPlayerScore(match, p.team, p.playerId);
                const playerName = p.player?.name || 'Player';
                const teamLabel = getTeamLabel(match, p.team);
                return `<tr class="${canEdit ? '' : 'is-readonly'}">
                  <th class="stat-player-col" scope="row">
                    <span class="stat-matrix-player-name">${escapeHtml(playerName)}</span>
                    <span class="stat-matrix-team tiny">${escapeHtml(teamLabel)}${canEdit ? '' : ' · read only'}</span>
                  </th>
                  ${columns.map(col => {
                    if (col.key === 'putts') {
                      return `<td>${stepper(p.playerId, 'putts', Number.isFinite(Number(stat.putts)) ? Number(stat.putts) : 2, !canEdit, `data-putts-source="${escapeHtml(normalizePuttsSource(stat.puttsSource || 'default', 'default'))}"`)}</td>`;
                    }
                    if (col.key === 'penaltyStrokes') {
                      return `<td>${stepper(p.playerId, 'penaltyStrokes', Number.isFinite(Number(stat.penaltyStrokes)) ? Number(stat.penaltyStrokes) : 0, !canEdit)}</td>`;
                    }
                    const label = col.key === 'fairway' ? 'Fairway hit' : col.key === 'green' ? 'Green in regulation' : col.key === 'upAndDown' ? 'Up and down' : 'Sandy';
                    return `<td><label class="stat-matrix-check" aria-label="${escapeHtml(label)}"><input type="checkbox" data-stat-player="${escapeHtml(p.playerId)}" data-stat-key="${escapeHtml(col.key)}" ${stat[col.key] ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span></span></label></td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
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
  const suggestionId = match.greeniesSuggestions?.[String(hole.holeNumber)] || '';
  const isHost = isCurrentDeviceMatchHost(match);
  const currentPick = isHost ? winnerId : (suggestionId || winnerId);
  const suggestionText = suggestionId && !winnerId ? `<div class="greenies-suggestion tiny top-gap">Suggested Greenie: ${escapeHtml(getPlayer(suggestionId)?.name || 'Unknown')} · Host confirmation required.</div>` : '';
  const helper = isHost ? 'Host selection is official and used in settlement.' : 'Suggest the closest-to-the-pin winner. Host confirmation is required for settlement.';
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="card inset-card game-config-card greenies-card"><div class="section-label">Greenies · Hole ${hole.holeNumber}</div><div class="greenies-list top-gap">${eligible.map(row => `<label class="mini-check greenies-check ${canEditGreenies(match, row.team, row.player?.id) || !isHost ? '' : 'is-readonly'}"><input type="checkbox" data-greenies-winner="${row.player.id}" ${currentPick === row.player.id ? 'checked' : ''} ${canEditGreenies(match, row.team, row.player?.id) || !isHost ? '' : 'disabled'} /><span>${escapeHtml(row.player.name)}</span></label>`).join('') || '<div class="tiny">No greenies participants selected for this match.</div>'}</div>${suggestionText}<div class="tiny top-gap">${escapeHtml(helper)}</div></div>`;
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

function isJoinedDeviceWaitingForAssignment(match) {
  if (!match || match.storageMode !== 'shared') return false;
  if (!isAssignedPlayersMode(match)) return false;
  if (isCurrentDeviceMatchHost(match)) return false;
  return getSharedLocallyOwnedPlayerIds(match).size === 0;
}

function renderScoreGrid(match, tee, metrics, scoringHoles = null) {
  const body = document.getElementById('scoreGridBody');
  if (!match || !tee || !metrics) {
    body.innerHTML = '';
    return;
  }
  const holes = scoringHoles || getSelectedScoringHoles(match, tee);
  const hole = holes[currentHole - 1];
  const visiblePlayers = getVisibleScoringPlayers(match, metrics.players || [], { stats: false });
  if (!visiblePlayers.length && isJoinedDeviceWaitingForAssignment(match)) {
    body.innerHTML = `<tr><td colspan="5"><div class="joined-assignment-waiting"><strong>Joined device</strong><div class="tiny top-gap">Waiting for the host to assign players to this device.</div><div class="tiny">Scores are saved on this phone once you are assigned. Checking for assignment...</div><button type="button" class="secondary top-gap" data-check-shared-assignment="1">Check Assignment</button></div></td></tr>`;
    return;
  }
  body.innerHTML = visiblePlayers.map(p => {
    const score = p.scores[currentHole - 1];
    const playerHole = getPlayerHole(match, p, currentHole - 1, tee) || hole;
    const strokes = holeStrokeAllowanceForPlayer(playerHole?.strokeIndex, p.playHdcp, metrics.lowPlaying);
    const gross = score?.gross || '';
    const net = score?.gross ? score.gross - strokes : '';
    const canEdit = canEditPlayerScore(match, p.team, p.playerId);
    if (match.storageMode === 'shared') console.debug('[SharedScoreGate]', explainPlayerEditability(match, p.playerId));
    return `
      <tr class="${canEdit ? '' : 'score-row-readonly'}">
        <td><button type="button" class="player-detail-trigger score-player-name" data-player-detail="${escapeHtml(p.playerId)}" title="${escapeHtml(p.player.name)}">${escapeHtml(p.player.name)}</button><div class="tiny score-player-tee">${escapeHtml(getPlayerHoleTeeInfo(match, p, currentHole - 1, tee).label)}${canEdit ? '' : ' · locked'}</div></td>
        <td>${escapeHtml(getTeamLabel(match, p.team))}</td>
        <td><div class="gross-score-stepper" role="group" aria-label="Gross score for ${escapeHtml(p.player.name)}"><button type="button" class="score-step-btn" data-score-step="down" data-score-step-player="${escapeHtml(p.playerId)}" ${canEdit ? '' : 'disabled'}>−</button><input class="score-input" type="tel" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" min="1" max="15" data-score-player="${p.playerId}" data-score-locked="${canEdit ? '0' : '1'}" title="${canEdit ? 'Enter score' : 'You can only score your assigned players.'}" data-hole-par="${Number(playerHole?.par || hole?.par || 4) || 4}" placeholder="—" value="${gross}" ${canEdit ? '' : 'disabled'} /><button type="button" class="score-step-btn" data-score-step="up" data-score-step-player="${escapeHtml(p.playerId)}" ${canEdit ? '' : 'disabled'}>+</button></div></td>
        <td class="score-strokes-cell">${formatStrokesDisplay(strokes)}</td>
        <td>${net === '' ? '—' : net}</td>
      </tr>
    `;
  }).join('');
}



function getHoleParForScoreInput(inputEl) {
  const explicit = Number(inputEl?.dataset?.holePar);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const match = getActiveMatch();
  const tee = match ? getTee(match.courseId, match.teeId) : null;
  const holes = match ? getSelectedScoringHoles(match, tee) : [];
  const hole = holes[currentHole - 1];
  return Math.round(Number(hole?.par) || 4);
}

function isSmartScoreAdvanceEnabled(match = getActiveMatch()) {
  if (!match) return false;
  if (isSneakySandyPoleyEnabled(match)) return false;
  return match.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!match.smartScoreAdvanceEnabled;
}

function isGrossScoreValidValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function triggerSmartScoreHaptic() {
  // v30.3.40: intentionally no-op on iPhone/PWA. navigator.vibrate is not
  // supported reliably by iOS Safari, and scoring confirmation should not rely on haptics.
  return false;
}

function flashCompletedScoreInput(inputEl) {
  if (!inputEl || !inputEl.classList) return;
  inputEl.classList.remove('score-confirmed-flash');
  void inputEl.offsetWidth;
  inputEl.classList.add('score-confirmed-flash');
  setTimeout(() => { try { inputEl.classList.remove('score-confirmed-flash'); } catch (err) {} }, 360);
}

function allEditableScoresCompleteOnCurrentHole() {
  const inputs = getActiveScoringWorkflowInputs();
  return inputs.length > 0 && inputs.every(input => isGrossScoreValidValue(String(input.value || '').trim()));
}

function applySmartScoreStep(inputEl, direction) {
  if (!inputEl || inputEl.disabled) return false;
  const raw = String(inputEl.value || '').trim();
  let next;
  if (!raw) {
    next = getHoleParForScoreInput(inputEl);
  } else {
    const current = Number(raw);
    if (!Number.isFinite(current)) return false;
    next = Math.max(1, Math.round(current + (direction >= 0 ? 1 : -1)));
  }
  inputEl.value = String(next);
  updateLiveNetForScoreInput(inputEl);
  schedulePendingScoreAutoAdvance(inputEl);
  return true;
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

function isActiveScoringWorkflowInput(input) {
  if (!input || input.disabled || !input.matches?.('#score input[data-score-player]')) return false;
  if (input.dataset.scoreLocked === '1') return false;
  if (input.closest('.hidden,[hidden],[aria-hidden="true"]')) return false;
  const rect = typeof input.getBoundingClientRect === 'function' ? input.getBoundingClientRect() : null;
  return !rect || rect.width > 0 || rect.height > 0;
}

function getActiveScoringWorkflowInputs() {
  return Array.from(document.querySelectorAll('#score input[data-score-player]')).filter(isActiveScoringWorkflowInput);
}

function getEditableScoreInputs() {
  return getActiveScoringWorkflowInputs();
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
  if (!inputEl || inputEl.disabled || !inputEl.matches?.('input[data-score-player]')) return;
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
  scoreRoot.querySelectorAll('input[data-score-player]').forEach(input => {
    if (input.dataset.scoreWired === 'direct') return;
    input.dataset.scoreWired = 'direct';
    input.addEventListener('focus', () => handleLiveScoreInputFocus(input));
    input.addEventListener('input', () => handleLiveScoreInputEvent(input));
    input.addEventListener('keydown', handleLiveScoreInputKeydown);
    input.addEventListener('blur', () => handleLiveScoreInputBlur(input));
  });
}

function initializePlayInputs() {
  requestAnimationFrame(() => {
    wireLiveScoreInputs();
    const inputs = getEditableScoreInputs();
    console.debug('[PlayInputInit]', {
      inputCount: inputs.length,
      firstExists: !!inputs[0],
      firstDisabled: inputs[0] ? !!inputs[0].disabled : null,
      firstFocusable: inputs[0] ? inputs[0].tabIndex !== -1 : false,
      activeHole: currentHole,
    });
  });
}

function queueScoreCommitFocus(playerId, holeNumber = currentHole) {
  pendingScoreCommitFocus = playerId ? { playerId, holeNumber: Number(holeNumber) || currentHole } : null;
}

function applyPendingScoreCommitFocus() {
  if (!pendingScoreCommitFocus) return;
  const pending = pendingScoreCommitFocus;
  if (Number(pending.holeNumber) !== Number(currentHole)) return;
  const target = getLiveScoreInputForPlayer(pending.playerId);
  if (!target || target.disabled) {
    pendingScoreCommitFocus = null;
    return;
  }
  setTimeout(() => {
    requestAnimationFrame(() => {
      const liveTarget = getLiveScoreInputForPlayer(pending.playerId);
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
  const escapedId = cssEscape(playerId);
  return document.querySelector(`#score input[data-score-player="${escapedId}"]`);
}

function schedulePendingScoreAutoAdvance(inputEl) {
  const match = getActiveMatch();
  if (!match || !inputEl || inputEl.disabled) return;
  if (!isSmartScoreAdvanceEnabled(match)) return;
  if (isMatchFinished(match)) return;
  const playerId = inputEl.dataset.scorePlayer;
  if (!playerId) return;
  const session = scoreInputSessionState.get(playerId) || {};
  const normalizedValue = normalizeCommittedScoreValue(inputEl.value);
  if (!isGrossScoreValidValue(normalizedValue)) return;
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
    const activeEl = document.activeElement;
    const activeStepButton = activeEl?.matches?.('[data-score-step]') && String(activeEl?.dataset?.scoreStepPlayer || '') === String(playerId);
    if (activeEl && activeEl !== liveInput && !activeStepButton && activeEl.matches?.('input,select,textarea,button')) return;
    commitScoreInput(liveInput, { viaAutoAdvance: true, expectedGeneration: generation });
  }, getSmartScoreAdvanceDelay(match));
}

function commitScoreInput(inputEl, { viaEnter = false, viaAutoAdvance = false, expectedGeneration = null } = {}) {
  const match = getActiveMatch();
  if (!match || !inputEl || inputEl.disabled) return false;
  const playerId = inputEl.dataset.scorePlayer;
  if (!playerId) return false;
  cancelPendingScoreAutoAdvance(playerId);
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
    scoreInputSessionState.delete(playerId);
    return false;
  }
  if (changed) markRecentScoreCommit(playerId, normalizedValue);

  // v30.3.40: same-hole player-to-player auto focus was removed. Smart Score
  // Advance now only performs the no-stat-tracking end-of-hole auto-next behavior.
  const canAutoNextHole = viaAutoAdvance
    && isSmartScoreAdvanceEnabled(match)
    && !isMatchFinished(match)
    && initialValue === ''
    && hasCommittedValue
    && !isStatTrackingEnabled(match)
    && allEditableScoresCompleteOnCurrentHole();
  const nextHole = canAutoNextHole ? getAdjacentPlayableHole(match, currentHole, 1, getTee(match.courseId, match.teeId)) : null;

  if (changed && hasCommittedValue) {
    flashCompletedScoreInput(inputEl);
    triggerSmartScoreHaptic();
  }

  const saveFn = window.dyeLedgerSaveCurrentHole;
  if (typeof saveFn === 'function') {
    saveFn(canAutoNextHole && nextHole ? { advance: true, silent: true } : { targetHole: currentHole, silent: true });
  } else {
    persistCurrentMatch({ applyDom: true, immediateShared: true, silent: true });
  }

  scoreInputSessionState.delete(playerId);
  return true;
}


function getMomentumSidePairings(match, metrics) {
  return getIndividualMatchPairings(match, metrics).filter(pair => ['nassau', 'match_play'].includes(String(pair?.game || 'nassau').toLowerCase()));
}
function getMomentumSidePairing(match, metrics, gameKey) {
  const pairings = getMomentumSidePairings(match, metrics);
  if (!pairings.length) return null;
  const key = String(gameKey || '');
  if (key.startsWith('individual_match:')) {
    const id = key.slice('individual_match:'.length);
    return pairings.find(pair => String(pair.id) === id) || pairings[0];
  }
  if (key === 'individual_match') return pairings[0];
  return null;
}
function getMomentumTeamOptions(match) {
  const selected = Array.isArray(match?.selectedGames) ? match.selectedGames : [];
  const keys = [];
  selected.forEach(g => {
    if (g.key === 'nassau' || g.key === 'team_match' || g.key === 'team_stroke') keys.push(g.key);
  });
  const unique = [...new Set(keys)];
  unique.sort((a,b) => (a === 'nassau' ? -1 : b === 'nassau' ? 1 : 0));
  return unique.map(key => ({ key, label: key === 'team_match' ? 'Match Play' : getGameLabel(key), type: 'team' }));
}
function getMomentumOptions(match, metrics = null) {
  const options = [];
  const teamOptions = getMomentumTeamOptions(match);
  if ((metrics?.teams || []).length === 2) options.push(...teamOptions);
  const singlesCfg = (Array.isArray(match?.selectedGames) ? match.selectedGames : []).find(g => g.key === 'singles_match');
  if (singlesCfg && (!metrics || isSinglesMatchPlayEligible(match, metrics))) {
    options.push({ key: 'singles_match', label: `Singles Match Play (${formatBasisLabel(singlesCfg.basis || 'net')})`, type: 'singles_match' });
  }
  const sidePairings = metrics ? getMomentumSidePairings(match, metrics) : [];
  sidePairings.forEach((pair, idx) => {
    const gameLabel = getSideMatchGameLabel(pair.game || 'nassau');
    const basisLabel = formatBasisLabel(pair.basis || 'net', 'Net');
    options.push({
      key: `individual_match:${pair.id || idx + 1}`,
      label: `${pair.label} (${gameLabel} · ${basisLabel})`,
      type: 'side_match',
      pairId: pair.id,
    });
  });
  if (!options.length && !metrics) return teamOptions;
  return options;
}
function getDefaultMomentumGameKey(match, metrics = null) {
  const options = getMomentumOptions(match, metrics);
  if (!options.length) return '';
  const current = String(match?.momentumGame || '');
  if (options.some(opt => opt.key === current)) return current;
  if (current === 'nassau') {
    const sideNassau = options.find(opt => opt.type === 'side_match' && /nassau/i.test(opt.label || ''));
    if (sideNassau) return sideNassau.key;
  }
  return options[0].key;
}
function getMomentumSides(match, metrics, gameKey) {
  if (gameKey === 'singles_match') {
    const singles = computeSinglesMatchPlayResult(match, metrics, getSinglesMatchConfig(match) || {});
    return {
      type: 'singles_match',
      side1Label: singles.playerAName || 'Player A',
      side2Label: singles.playerBName || 'Player B',
      side1Members: [singles.playerAName].filter(Boolean),
      side2Members: [singles.playerBName].filter(Boolean),
      team1: 1,
      team2: 2,
      singles
    };
  }
  const sidePairing = getMomentumSidePairing(match, metrics, gameKey);
  if (sidePairing) {
    return {
      type: 'side_match',
      side1Label: sidePairing.playerA?.player?.name || sidePairing.team1Player?.player?.name || 'Side 1',
      side2Label: sidePairing.playerB?.player?.name || sidePairing.team2Player?.player?.name || 'Side 2',
      side1Members: [sidePairing.playerA?.player?.name || sidePairing.team1Player?.player?.name].filter(Boolean),
      side2Members: [sidePairing.playerB?.player?.name || sidePairing.team2Player?.player?.name].filter(Boolean),
      pairing: sidePairing,
    };
  }
  const teams = metrics?.teams || [];
  const t1 = teams.find(t => Number(t.team) === 1) || teams[0];
  const t2 = teams.find(t => Number(t.team) === 2) || teams[1];
  return {
    type: 'team',
    side1Label: getTeamLabel(match, Number(t1?.team) || 1),
    side2Label: getTeamLabel(match, Number(t2?.team) || 2),
    side1Members: (t1?.members || []).map(m => m.player?.name).filter(Boolean),
    side2Members: (t2?.members || []).map(m => m.player?.name).filter(Boolean),
    team1: Number(t1?.team) || 1,
    team2: Number(t2?.team) || 2,
  };
}
function getMomentumPerspectiveLabel(match, metrics, gameKey) {
  const sides = getMomentumSides(match, metrics, gameKey);
  const perspective = getMomentumPerspectiveTeam(match);
  return perspective === 2 ? sides.side2Label : sides.side1Label;
}
function computeMomentumOutcome(match, metrics, holeResult, gameKey) {
  if (!holeResult?.completed) return 'pending';
  if (gameKey === 'singles_match') {
    const result = computeSinglesMatchPlayResult(match, metrics, getSinglesMatchConfig(match) || {});
    const row = (result.holes || []).find(h => Number(h.holeNumber) === Number(holeResult?.holeNumber));
    if (!row || !row.completed) return 'pending';
    if (!row.winnerId) return 'tie';
    if (String(row.winnerId) === String(result.playerAId)) return 'team1';
    if (String(row.winnerId) === String(result.playerBId)) return 'team2';
    return 'tie';
  }
  const sidePairing = getMomentumSidePairing(match, metrics, gameKey);
  if (sidePairing) {
    const holeIdx = Math.max(0, (metrics?.holeResults || []).indexOf(holeResult));
    const scoreAObj = holeResult.playerScores.find(ps => ps.playerId === sidePairing.playerA?.playerId || ps.playerId === sidePairing.team1Player?.playerId);
    const scoreBObj = holeResult.playerScores.find(ps => ps.playerId === sidePairing.playerB?.playerId || ps.playerId === sidePairing.team2Player?.playerId);
    const grossA = Number(scoreAObj?.gross) || null;
    const grossB = Number(scoreBObj?.gross) || null;
    if (!grossA || !grossB) return 'pending';
    const useNet = String(sidePairing.basis || 'net').toLowerCase() !== 'gross';
    const scoreA = useNet ? getSideMatchNetHoleScore(match, holeIdx, sidePairing.playerA || sidePairing.team1Player, sidePairing.sideLowPlaying, holeResult) : grossA;
    const scoreB = useNet ? getSideMatchNetHoleScore(match, holeIdx, sidePairing.playerB || sidePairing.team2Player, sidePairing.sideLowPlaying, holeResult) : grossB;
    return getHeadToHeadOutcome(scoreA, scoreB);
  }
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
function hasMultiPlayerTeam(metrics) {
  return (metrics?.teams || []).some(team => Array.isArray(team.members) && team.members.length > 1);
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
  const pushGame = (key, label, amounts, group = 'team', paymentLines = null, sourceKey = key, meta = {}) => games.push({ key, sourceKey, label, amounts, group, paymentLines: Array.isArray(paymentLines) ? paymentLines : null, meta });

  selected.forEach(cfg => {
    if (cfg.key === 'sneaky_sandy_poley') {
      const ledger = buildSneakySandyPoleyLedger(match, { metrics });
      const settlement = ledger.settlement || {};
      pushGame(cfg.key, 'Sneaky / Sandy / Poley', settlement.valid ? { ...(settlement.playerAmounts || {}) } : {}, 'team', null, cfg.key, { settlement });
      return;
    }
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
        const noWagerConfigured = !front && !back && !overall;
        pushGame('nassau_' + basisKey, `Nassau (${basisLabel})`, amounts, 'team', null, 'nassau', {
          noWagerConfigured,
          stakesFront: front,
          stakesBack: back,
          stakesOverall: overall,
        });
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
    if (cfg.key === 'skins' || cfg.key === 'net_skins') {
      const amounts = {};
      const stake = Number(cfg.stake || 0);
      const skinsCfg = cfg.key === 'net_skins' ? { ...cfg, basis: 'net' } : cfg;
      const basisLabel = cfg.key === 'net_skins' ? 'Net' : formatBasisLabel(cfg.basis);
      const skins = computeSkinResults(match, metrics, skinsCfg);
      if (cfg.skinsType === 'team') {
        if (stake) {
          skins.winnersByHole.forEach(h => {
            const winner = h.winner;
            const losers = metrics.teams.filter(t => t.team !== winner).map(t => t.team);
            transferTeamStakePerPerson(amounts, winner, losers, stake);
          });
        }
        pushGame(cfg.key === 'net_skins' ? 'team_net_skins' : 'team_skins', `${cfg.key === 'net_skins' ? 'Team Net Skins' : 'Team Skins'} (${basisLabel})`, amounts, 'team', null, cfg.key, { winnersByHole: skins.winnersByHole, counts: skins.counts });
      } else {
        if (stake) {
          skins.winnersByHole.forEach(h => {
            const winner = h.winner;
            const others = metrics.players.filter(p => p.playerId !== winner).map(p => p.playerId);
            addVsField(amounts, winner, others, stake);
          });
        }
        pushGame(cfg.key === 'net_skins' ? 'individual_net_skins' : 'individual_skins', `${cfg.key === 'net_skins' ? 'Individual Net Skins' : 'Individual Skins'} (${basisLabel})`, amounts, 'individual', null, cfg.key, { winnersByHole: skins.winnersByHole, counts: skins.counts });
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
    if (cfg.key === 'singles_match') {
      const singles = computeSinglesMatchPlayResult(match, metrics, cfg);
      pushGame(cfg.key, `${getGameLabel(cfg.key)} (${formatBasisLabel(singles.basis)} · ${singles.stakeType === 'per_hole' ? 'Per-Hole' : 'Match'} Stakes)`, singles.amounts || {}, 'side', singles.paymentLines || null, cfg.key, { singles });
      return;
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
      const paymentLines = [];
      const nine = computeNinePointResults(match, metrics, cfg);
      Object.entries(nine.amounts || {}).forEach(([playerId, amount]) => { amounts[playerId] = Number(amount) || 0; });
      // Player Gross Summary should show each player's aggregate 9-Point result,
      // but Game-by-Game Payout Detail should preserve the raw pairwise 9-Point
      // obligations rather than optimizing them inside the game.
      const ids = Array.isArray(nine.playerIds) ? nine.playerIds : [];
      ids.forEach((playerI, i) => {
        ids.slice(i + 1).forEach(playerJ => {
          const diff = (Number(nine.totals?.[playerI]) || 0) - (Number(nine.totals?.[playerJ]) || 0);
          const amount = Math.abs(diff * (Number(nine.stakePerPoint) || 0));
          if (amount <= 0.0001) return;
          paymentLines.push(diff > 0
            ? { from: playerJ, to: playerI, amount }
            : { from: playerI, to: playerJ, amount });
        });
      });
      pushGame(cfg.key, `9-Point Game (${formatBasisLabel(nine.basis)})`, amounts, 'side', paymentLines);
      return;
    }
    pushGame(cfg.key, getGameLabel(cfg.key), {});
  });
  return games;
}

function buildSelectedGamesSummary(match, metrics) {
  const completion = getRoundCompletionState(match, metrics);
  const selected = getOrderedSelectedGames(match);
  const payoutGames = getPayoutReportContext(match, metrics).payoutGames || [];
  const payoutByKey = new Map(payoutGames.map(game => [game.key, game]));
  if (!selected.length) {
    return `<div class="game-summary-grid"><div class="game-summary-card empty-state-card"><div class="game-summary-title">No payout games selected</div><div class="game-summary-value">No payout games were selected for this round.</div><div class="game-summary-sub">${metrics.completed}/${getPlayableHoleCount(match, metrics.tee)} holes completed · ${getHoleSegmentLabel(match, metrics.tee)}</div></div></div>`;
  }
  const cards = selected.map(cfg => {
    const title = getFeaturedGameLabel(match, cfg.key);
    let value = 'Live';
    let sub = '';
    if (cfg.key === 'nassau') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      value = completion.isIncomplete ? formatTeamGameStatusScoped(match, metrics, diffs.overall, completion) : formatTeamGameStatus(match, metrics, diffs.overall);
      const frontStake = Number(cfg.stakesFront || 0);
      const backStake = Number(cfg.stakesBack || 0);
      const overallStake = Number(cfg.stakesOverall || 0);
      const wagerNote = (!frontStake && !backStake && !overallStake) ? ' · Nassau enabled with no wager configured.' : '';
      const frontSpan = Math.min(9, metrics.holeResults?.length || 0);
      const backSpan = Math.max(0, (metrics.holeResults || []).length - 9);
      const frontComplete = isHoleRangeComplete(match, metrics, 0, frontSpan);
      const backComplete = backSpan > 0 && isHoleRangeComplete(match, metrics, 9, metrics.holeResults.length);
      const frontPlayed = getCompletedHoleCountInRange(match, metrics, 0, frontSpan);
      const backPlayed = getCompletedHoleCountInRange(match, metrics, 9, metrics.holeResults.length);
      const frontRemaining = Math.max(0, frontSpan - frontPlayed);
      const backRemaining = Math.max(0, backSpan - backPlayed);
      const frontText = frontComplete ? `Front 9: ${formatTeamGameStatus(match, metrics, diffs.front)}` : `Front 9: ${formatTeamGameStatusScoped(match, metrics, diffs.front, completion, { holesRemaining: frontRemaining, scopeLabel: `through ${frontPlayed} of ${frontSpan} holes` })}`;
      const backText = backSpan ? (backComplete ? `Back 9: ${formatTeamGameStatus(match, metrics, diffs.back)}` : `Back 9: ${formatTeamGameStatusScoped(match, metrics, diffs.back, completion, { holesRemaining: backRemaining, scopeLabel: `through ${backPlayed} of ${backSpan} holes` })}`) : '';
      sub = (getPlayableHoleCount(match, metrics.tee) <= 9 ? `Format: ${getHoleSegmentLabel(match, metrics.tee)}` : `${frontText}${backText ? ` · ${backText}` : ''}`) + wagerNote;
    } else if (cfg.key === 'team_match') {
      const diffs = computeTeamGameDiffs(match, metrics, cfg.key);
      value = completion.isIncomplete ? formatTeamGameStatusScoped(match, metrics, diffs.overall, completion) : formatTeamGameStatus(match, metrics, diffs.overall);
      sub = getPlayableHoleCount(match, metrics.tee) <= 9 ? `Format: ${getHoleSegmentLabel(match, metrics.tee)}` : `Front 9: ${formatTeamGameStatus(match, metrics, diffs.front)} · Back 9: ${formatTeamGameStatus(match, metrics, diffs.back)}`;
    } else if (cfg.key === 'team_stroke') {
      const stroke = getTeamStrokeScoreboardData(match, metrics, cfg);
      value = stroke.leader ? `${describeTeamLabel(match, stroke.leader.team, metrics)} (${stroke.leader.total})` : '—';
      if (!stroke.leader) sub = `Mode: ${formatScoringModeLabel(cfg.scoringMode)} · ${formatBasisLabel(cfg.basis)}`;
      else if (stroke.tie) sub = `Tied at ${stroke.leader.total} · ${formatBasisLabel(stroke.basis)} · ${formatScoringModeLabel(stroke.scoringMode)}`;
      else sub = `${describeTeamLabel(match, stroke.leader.team, metrics)} by ${stroke.margin} stroke${stroke.margin === 1 ? '' : 's'} · ${formatBasisLabel(stroke.basis)} · ${formatScoringModeLabel(stroke.scoringMode)}`;
    } else if (cfg.key === 'singles_match') {
      const singles = computeSinglesMatchPlayResult(match, metrics, cfg);
      if (!singles.eligible) {
        value = 'Requires two singles teams';
        sub = 'Two teams with one player on each team.';
      } else {
        value = singles.resultText;
        sub = `${formatBasisLabel(singles.basis)} · ${formatSinglesStakeLabel(singles)} · ${singles.playerAName} ${singles.playerAWins} · ${singles.playerBName} ${singles.playerBWins} · ${singles.halvedHoles} halved`;
      }
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
    } else if (cfg.key === 'skins' || cfg.key === 'net_skins') {
      const skinsCfg = cfg.key === 'net_skins' ? { ...cfg, basis: 'net' } : cfg;
      const skins = computeSkinResults(match, metrics, skinsCfg);
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
    } else if (cfg.key === 'sneaky_sandy_poley') {
      const ledger = buildSneakySandyPoleyLedger(match, { metrics });
      const leader = ledger.finalLeader || {};
      value = !leader.thru ? 'Not started' : (leader.tied ? `Tied thru ${leader.thru}` : `${formatSneakySandyPoleyTeamName(ledger, match, leader.teamId)} +${leader.margin} thru ${leader.thru}`);
      const biggestSwing = buildSneakySandyPoleyMomentumData(match, { ledger }).slice().sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin))[0];
      const swingTeam = biggestSwing?.margin > 0 ? ledger.teams?.[0]?.id : ledger.teams?.[1]?.id;
      const swingText = biggestSwing?.margin ? ` · Primary swing: H${biggestSwing.holeNumber}, ${Math.abs(biggestSwing.margin)} points to ${formatSneakySandyPoleyTeamName(ledger, match, swingTeam)}` : '';
      sub = `${formatPositiveCurrency(Number(ledger.settings?.pointValue || 0), 2)} per point · ${ledger.settlement?.label || 'SSP: tied, no payment'}${swingText}`;
    }
    const payoutGame = payoutByKey.get(cfg.key) || payoutGames.find(game => String(game.key || '').startsWith(`${cfg.key}_`));
    const payoutRows = Object.entries(payoutGame?.amounts || {}).map(([id, amount]) => ({ name: getPlayer(id)?.name || id, amount: Number(amount || 0) }));
    const winners = payoutRows.filter(row => row.amount > 0.0001).sort((a, b) => b.amount - a.amount);
    const economic = winners.length
      ? `Current payout: ${winners.map(row => `${row.name} ${formatMoneyAccounting(row.amount)}`).join(' · ')}`
      : 'Current payout: $0.00';
    return `<div class="game-summary-card"><div class="game-summary-title">${escapeHtml(title)}</div><div class="game-summary-value">${escapeHtml(value)}</div>${sub ? `<div class="game-summary-sub">${escapeHtml(sub)}</div>` : ''}<div class="game-summary-sub game-summary-economic">${escapeHtml(economic)} · ${completion.isIncomplete ? 'Provisional' : 'Final'}</div></div>`;
  });
  return `<div class="game-summary-grid">${cards.join('')}</div>`;
}

function populateCourseSelects() {
  const courses = getDedupedCourseOptions(document.getElementById('teeCourseSelect')?.value || '');
  const options = courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('teeCourseSelect').innerHTML = `<option value="">Select course</option>${options}`;
}
function populateCalcPlayers() {
  const options = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${Number(p.index).toFixed(1)})</option>`).join('');
  document.getElementById('calcPlayer').innerHTML = `<option value="">Select player</option>${options}`;
}
function populateCalcCourses() {
  const courses = getDedupedCourseOptions(document.getElementById('calcCourse')?.value || '');
  const options = courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
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
  const courses = getDedupedCourseOptions(selectedCourseId || '');
  updateCourseLibraryDiagnostics({
    localCourses: (state.courses || []).length,
    renderedCourseOptions: courses.length,
  });
  const options = courses.map(c => `<option value="${c.id}" ${String(selectedCourseId || '') === String(c.id || '') ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const courseSelect = document.getElementById('matchCourseSelect');
  courseSelect.innerHTML = `<option value="">Select course</option>${options}`;
  if (selectedCourseId && courses.some(c => String(c.id) === String(selectedCourseId))) courseSelect.value = selectedCourseId;
  const renderedCourseId = courseSelect.value || '';
  populateMatchTees(renderedCourseId, selectedTeeId);
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
  const mode = normalizeScoringAccessMode(modeSelect?.value || existingMatch?.scoringAccessMode || existingMatch?.scoreEntryMode || 'single_device');
  wrap.classList.toggle('hidden', mode !== 'assigned_players');
  hint.textContent = mode === 'assigned_players'
    ? 'Assigned Players Score Entry creates a shared match and lets the host assign which players each device can edit.'
    : 'One Device Scores for Everyone keeps one lead scorer in charge of entry on this device.';
  if (mode !== 'assigned_players') {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="section-label">Assigned player scoring</div>
    <div class="tiny top-gap">Assigned Players Score Entry creates a shared match while course publishing remains intentional.</div>`;
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
  const titleSync = document.getElementById('scoringTitleSync');
  if (titleSync) titleSync.innerHTML = '';
  if (!card) return;
  if (!match || match.storageMode !== 'shared') {
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }
  const sync = getSharedSyncStatus(match);
  const indicator = sync.tone === 'good' ? '🟢' : sync.tone === 'warning' ? '🟡' : sync.tone === 'working' ? '🟡' : '🔴';
  const shortLabel = sync.label.replace('All changes synced', 'Synced').replace('Offline — changes will sync later', 'Offline — saved locally');
  if (titleSync) titleSync.innerHTML = `<span class="shared-title-sync-pill" title="${escapeHtml(sync.detail)}">${indicator} ${escapeHtml(shortLabel)}</span>`;
  const showToggles = isAssignedPlayersMode(match) && hasSharedAssignedPlayerFocus(match);
  const showOtherScores = shouldShowOtherSharedPlayers(match, { stats: false });
  const showOtherStats = shouldShowOtherSharedPlayers(match, { stats: true });
  const helper = isCurrentDeviceMatchHost(match)
    ? 'Optional: show or hide players outside this host device’s scoring focus.'
    : 'Optional: peek at the other team read-only after saving your hole.';
  const assignmentSummary = getSharedAssignmentSummary(match);
  const roleLabel = isCurrentDeviceMatchHost(match) ? 'Host device' : 'Joined device';
  const assignedNames = getAssignedPlayerNamesForParticipant(match, getCurrentSharedParticipantId(match));
  const assignmentLine = isAssignedPlayersMode(match)
    ? assignmentSummary
    : 'Shared scoring is open according to the selected scoring mode.';
  const parity = match.sharedLedgerParity && typeof match.sharedLedgerParity === 'object' ? match.sharedLedgerParity : null;
  const parityLabel = parity?.status === 'confirmed' ? 'Confirmed' : parity?.status === 'conflict' ? 'Conflict detected' : parity?.status === 'warning' ? 'Warning' : 'Not confirmed';
  const sspConflicts = Array.isArray(match.sharedSspConflicts) ? match.sharedSspConflicts : [];
  const sspLabel = sspConflicts.length ? `Conflict on Hole ${sspConflicts[0].holeNumber || '?'}` : match.sharedSspSyncState === 'pending' ? 'Pending sync' : match.sharedSspSyncState === 'synced' ? 'Synced' : 'Final pull needed';
  card.classList.remove('hidden');
  card.classList.add('shared-score-compact-card', 'shared-secondary-controls-card');
  card.innerHTML = `
    <div class="tiny shared-secondary-helper">${escapeHtml(helper)}</div>
    <div class="shared-secondary-toggle-list">
      <label class="shared-disclosure-toggle">
        <input type="checkbox" id="showOtherScoresToggle" ${showOtherScores ? 'checked' : ''} />
        <span>${showOtherScores ? '▲ Hide Other Scores' : '▼ Show Other Scores'}</span>
      </label>
      <label class="shared-disclosure-toggle">
        <input type="checkbox" id="showOtherStatsToggle" ${showOtherStats ? 'checked' : ''} />
        <span>${showOtherStats ? '▲ Hide Other Stats' : '▼ Show Other Stats'}</span>
      </label>
    </div>`;
  const statusHtml = `
    <div class="shared-status-grid">
      <div><div class="tiny">Mode</div><strong>${escapeHtml(roleLabel)}</strong></div>
      <div><div class="tiny">Connection</div><strong>${escapeHtml(getSharedOnlineLabel())}</strong></div>
      <div><div class="tiny">Sync</div><strong>${escapeHtml(sync.label)}</strong></div>
      <div><div class="tiny">Score parity</div><strong>${escapeHtml(parityLabel)}</strong></div>
      ${isSneakySandyPoleyEnabled(match) ? `<div><div class="tiny">SSP</div><strong>${escapeHtml(sspLabel)}</strong></div>` : ''}
      <div><div class="tiny">Last sync</div><strong>${escapeHtml(formatSharedLastSync(match))}</strong></div>
    </div>
    <div class="tiny top-gap"><strong>${escapeHtml(assignmentLine)}</strong></div>
    ${!isCurrentDeviceMatchHost(match) && isAssignedPlayersMode(match) && !assignedNames.length ? '<div class="joined-assignment-waiting top-gap"><strong>Waiting for the host to assign players to this device.</strong><div class="tiny top-gap">Scores are saved on this phone once you are assigned.</div><button type="button" class="secondary top-gap" data-check-shared-assignment="1">Check Assignment</button></div>' : ''}
    <div class="tiny top-gap">${escapeHtml(sync.detail)}</div>`;
  card.innerHTML = statusHtml + (showToggles ? card.innerHTML : '');
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



function getStableSetupAnchorSelector(el = document.activeElement) {
  const target = el?.closest?.('[data-assignment-slot], .match-player-assignment, .player-card, .tee-card, .combo-tee-row, .game-config-card, .shared-assignment-row, .card, select, input, button');
  if (!target) return null;
  if (target.id) return `#${CSS.escape(target.id)}`;
  if (target.dataset?.assignmentSlot) return `#matchPlayersPicker [data-assignment-slot="${CSS.escape(String(target.dataset.assignmentSlot))}"]`;
  if (target.dataset?.playerTeeSlot) return `#matchPlayersPicker [data-assignment-slot="${CSS.escape(String(target.dataset.playerTeeSlot))}"]`;
  if (target.dataset?.playerSelectSlot) return `#matchPlayersPicker [data-assignment-slot="${CSS.escape(String(target.dataset.playerSelectSlot))}"]`;
  return null;
}
function captureSetupScrollAnchor(selector = null) {
  const active = document.activeElement;
  const resolvedSelector = selector || getStableSetupAnchorSelector(active);
  const target = resolvedSelector ? document.querySelector(resolvedSelector) : null;
  return {
    scrollY: window.scrollY || 0,
    selector: resolvedSelector,
    anchorTop: target ? target.getBoundingClientRect().top + (window.scrollY || 0) : null,
    activeId: active?.id || '',
  };
}
function restoreSetupScrollAnchor(anchor = null) {
  if (!anchor) return;
  const restore = () => {
    try {
      const target = anchor.selector ? document.querySelector(anchor.selector) : null;
      if (target) {
        if (Number.isFinite(Number(anchor.anchorTop))) {
          const nextTop = target.getBoundingClientRect().top + (window.scrollY || 0);
          const delta = nextTop - Number(anchor.anchorTop);
          window.scrollTo({ top: Math.max(0, (window.scrollY || 0) + delta), behavior: 'auto' });
        }
        try { target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); } catch (_) {}
        return;
      }
      window.scrollTo({ top: Math.max(0, Number(anchor.scrollY) || 0), behavior: 'auto' });
    } catch (_) {
      try { window.scrollTo({ top: Math.max(0, Number(anchor.scrollY) || 0), behavior: 'auto' }); } catch (__) {}
    }
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 120);
  });
}
function preserveSetupScrollDuring(callback, selector = null) {
  const anchor = captureSetupScrollAnchor(selector);
  const result = callback?.();
  restoreSetupScrollAnchor(anchor);
  return result;
}
function getNextIncompletePlayerSetupSlot(completedSlot = -1) {
  const rows = Array.from(document.querySelectorAll('#matchPlayersPicker [data-assignment-slot]'));
  if (!rows.length) return null;
  const start = Math.max(0, Number(completedSlot) + 1 || 0);
  const isIncomplete = (row) => {
    if (!row) return false;
    const slot = Number(row.dataset.assignmentSlot);
    const playerInput = document.querySelector(`[data-player-slot="${slot}"]`);
    const teeSelect = document.querySelector(`[data-player-tee-slot="${slot}"]`);
    if (!playerInput || !playerInput.value) return true;
    if (teeSelect && !teeSelect.value) return true;
    return false;
  };
  for (const row of rows) {
    const slot = Number(row.dataset.assignmentSlot);
    if (Number.isFinite(slot) && slot >= start && isIncomplete(row)) return slot;
  }
  return null;
}
function focusPlayerSetupSlot(slot) {
  const row = document.querySelector(`#matchPlayersPicker [data-assignment-slot="${slot}"]`);
  if (!row) return false;
  const target = row.querySelector('[data-open-player-sheet], [data-player-tee-slot], input, select, button');
  try {
    row.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    setTimeout(() => {
      try { target?.focus?.({ preventScroll: true }); } catch (_) { try { target?.focus?.(); } catch (__) {} }
    }, 260);
    return true;
  } catch (_) {
    return false;
  }
}
function scheduleAdvanceToNextIncompletePlayerSetupSlot(completedSlot = -1) {
  const activeWrap = document.getElementById('matchSetupFormWrap');
  if (!activeWrap || activeWrap.classList.contains('hidden')) return;
  window.setTimeout(() => {
    const nextSlot = getNextIncompletePlayerSetupSlot(completedSlot);
    if (nextSlot === null || nextSlot === undefined) return;
    focusPlayerSetupSlot(nextSlot);
  }, 120);
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
  renderStatTrackingPlayerSelector();
}


function bindPlayerPickerTriggers() {
  const container = document.getElementById('matchPlayersPicker');
  if (!container) return;
  container.querySelectorAll('[data-open-player-sheet]').forEach(btn => {
    btn.setAttribute('type', 'button');
  });
}

function getCurrentSetupPlayerIds() {
  return getSelectedPlayersFromSetup().map(row => row.playerId).filter(Boolean);
}
function collectStatTrackingPlayerIdsFromSetup(selectedPlayers = null) {
  const enabled = !!document.getElementById('enableStatTrackingInput')?.checked;
  if (!enabled) return [];
  const boxes = Array.from(document.querySelectorAll('[data-stat-track-player]'));
  if (boxes.length) return boxes.filter(el => el.checked).map(el => String(el.value || '')).filter(Boolean);
  const players = Array.isArray(selectedPlayers) ? selectedPlayers : getSelectedPlayersFromSetup();
  return players.map(row => String(row.playerId || '')).filter(Boolean);
}
function renderStatTrackingPlayerSelector(explicitIds = null) {
  const wrap = document.getElementById('statTrackingPlayersWrap');
  if (!wrap) return;
  const enabled = !!document.getElementById('enableStatTrackingInput')?.checked;
  const selectedPlayers = getSelectedPlayersFromSetup();
  if (!enabled) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  if (!selectedPlayers.length) {
    wrap.innerHTML = '<div class="tiny top-gap">Select players above to choose who will have stat tracking enabled.</div>';
    return;
  }
  const existingBoxes = Array.from(document.querySelectorAll('[data-stat-track-player]'));
  let selectedIds;
  if (Array.isArray(explicitIds)) selectedIds = explicitIds.map(String);
  else if (existingBoxes.length) selectedIds = existingBoxes.filter(el => el.checked).map(el => String(el.value || ''));
  else if (editingMatchId) {
    const match = getMatch(editingMatchId);
    selectedIds = Array.isArray(match?.statTrackingPlayerIds) ? match.statTrackingPlayerIds.map(String) : selectedPlayers.map(row => String(row.playerId));
  } else selectedIds = selectedPlayers.map(row => String(row.playerId));
  const selectedSet = new Set(selectedIds.filter(Boolean));
  wrap.innerHTML = `
    <div class="top-gap stat-participants-card">
      <div class="section-subhead">Enable Stat Tracking For</div>
      <div class="tiny">Choose which players should show optional stat inputs and appear in Stat Tracking Summary.</div>
      <div class="stat-participant-list top-gap">
        ${selectedPlayers.map(row => {
          const player = getPlayer(row.playerId);
          if (!player) return '';
          return `<label class="mini-check stat-participant-check"><input type="checkbox" data-stat-track-player value="${escapeHtml(row.playerId)}" ${selectedSet.has(String(row.playerId)) ? 'checked' : ''} /><span>${escapeHtml(player.name)}</span></label>`;
        }).join('')}
      </div>
      <div class="actions wrap compact-actions top-gap">
        <button type="button" class="secondary" id="statTrackingSelectAllBtn">Select All</button>
        <button type="button" class="secondary" id="statTrackingClearAllBtn">Clear All</button>
      </div>
    </div>`;
}

function isSneakySandyPoleySelectedInSetup(matchOrDraft = null) {
  if ((matchOrDraft?.selectedGames || []).some(g => g.key === 'sneaky_sandy_poley')) return true;
  return !!document.querySelector('[data-game-key="sneaky_sandy_poley"]:checked');
}

function syncSmartScoreAdvancePresetUi(matchOrDraft = null) {
  const toggle = document.getElementById('smartScoreAdvanceInput');
  const preset = document.getElementById('smartScoreAdvancePresetSelect');
  const wrap = document.getElementById('smartScoreAdvancePresetWrap');
  const hint = document.getElementById('smartScoreAdvanceSspHint');
  if (!preset) return;
  preset.value = normalizeSmartScoreAdvancePreset(matchOrDraft?.smartScoreAdvancePreset || preset.value);
  const sspSelected = isSneakySandyPoleySelectedInSetup(matchOrDraft);
  if (toggle) {
    if (sspSelected) toggle.checked = false;
    toggle.disabled = sspSelected;
  }
  const enabled = !sspSelected && (toggle ? !!toggle.checked : true);
  preset.disabled = !enabled;
  if (wrap) wrap.classList.toggle('is-disabled', !enabled);
  if (hint) hint.classList.toggle('hidden', !sspSelected);
}

function getSmartScoreAdvancePresetFromSetup() {
  return normalizeSmartScoreAdvancePreset(document.getElementById('smartScoreAdvancePresetSelect')?.value || DEFAULT_SMART_SCORE_ADVANCE_PRESET);
}


function renderTodaysMatchSummary() {
  const wrap = document.getElementById('todaysMatchSummary');
  if (!wrap) return;
  const courseId = document.getElementById('matchCourseSelect')?.value || '';
  const teeId = document.getElementById('matchTeeSelect')?.value || getReferenceFallbackTeeId(courseId) || '';
  const course = getCourse(courseId);
  const tee = course ? getTee(courseId, teeId) : null;
  const selectedPlayers = getSelectedPlayersFromSetup();
  const teamCount = getCurrentSetupTeamCount();
  const selectedGames = collectSelectedGames();
  const hasSsp = selectedGames.some(g => g.key === 'sneaky_sandy_poley');
  const featuredCompetition = normalizeFeaturedCompetition(document.getElementById('featuredCompetitionSelect')?.value || 'auto');
  const gameNames = selectedGames.map(g => getGameLabel(g)).filter(Boolean);
  const statEnabled = !!document.getElementById('enableStatTrackingInput')?.checked;
  const smartAdvanceEnabled = !hasSsp && !!document.getElementById('smartScoreAdvanceInput')?.checked;
  const smartAdvancePreset = getSmartScoreAdvancePresetFromSetup();
  const statIds = statEnabled ? collectStatTrackingPlayerIdsFromSetup(selectedPlayers) : [];
  const statNames = statIds.map(id => getPlayer(id)?.name || '').filter(Boolean);
  const rows = [
    ['Course', course?.name || 'Select course'],
    ['Tee', tee?.teeName || 'Select tee'],
    ['Players', selectedPlayers.length ? String(selectedPlayers.length) : 'Select players'],
    ['Teams', String(teamCount)],
    ['Games', gameNames.length ? gameNames.join(', ') : 'None selected'],
    ['Featured Competition', getFeaturedCompetitionDisplayName({ selectedGames }, featuredCompetition === 'auto' ? resolveAutoFeaturedCompetition({ selectedGames }) : featuredCompetition)],
    ['Stat Tracking', statEnabled ? (statNames.length ? statNames.join(', ') : 'No players selected') : 'Off'],
    ['Smart Score Advance', hasSsp ? 'Disabled for Sneaky / Sandy / Poley' : smartAdvanceEnabled ? `${getSmartScoreAdvancePresetLabel(smartAdvancePreset)} (${SMART_SCORE_ADVANCE_PRESETS[smartAdvancePreset].delay} ms)` : 'Off'],
  ];
  wrap.innerHTML = rows.map(([label, value]) => `<div class="setup-summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  renderRoundReadiness();
}


function readMatchTemplates() {
  try {
    const raw = localStorage.getItem(MATCH_TEMPLATES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(t => t && typeof t === 'object') : [];
  } catch (err) {
    recordAppError(err, 'Read Match Templates');
    return [];
  }
}

function writeMatchTemplates(templates) {
  try {
    const cleaned = Array.isArray(templates) ? templates.slice(0, 50) : [];
    localStorage.setItem(MATCH_TEMPLATES_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (err) {
    recordAppError(err, 'Write Match Templates');
    toast('Could not save match template on this device.');
  }
}

function sanitizeTemplatePlayers(players) {
  return Array.isArray(players) ? players.map((p, idx) => ({
    playerId: String(p.playerId || ''),
    team: Number(p.team || 1) || 1,
    slot: Number.isFinite(Number(p.slot)) ? Number(p.slot) : idx,
    teeId: String(p.teeId || '')
  })).filter(p => p.playerId) : [];
}

function buildTemplateFromCurrentSetup(nameOverride = '') {
  const form = document.getElementById('matchForm');
  const fd = form ? new FormData(form) : new FormData();
  const teamCount = Number(fd.get('teamCount')) || Number(document.getElementById('teamCountSelect')?.value || 1) || 1;
  const selectedPlayers = getSelectedPlayersFromSetup();
  const selectedGames = normalizeSelectedGamesOrder(collectSelectedGames()).map(g => JSON.parse(JSON.stringify(g)));
  const templateName = String(nameOverride || fd.get('name') || '').trim() || `Match Template ${new Date().toLocaleDateString()}`;
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    name: templateName,
    matchName: String(fd.get('name') || '').trim(),
    courseId: String(fd.get('courseId') || ''),
    teeId: String(fd.get('teeId') || ''),
    allowance: Number(fd.get('allowance')) || 100,
    holeCount: Number(fd.get('holeCount')) === 9 ? 9 : 18,
    nineHoleSegment: String(fd.get('nineHoleSegment') || 'front'),
    customStartHole: Math.max(1, Math.min(10, Number(fd.get('customStartHole')) || 1)),
    teamCount,
    playersPerTeam: Number(fd.get('playersPerTeam')) || 1,
    teamNames: Array.from({ length: teamCount }, (_, i) => String(document.querySelector(`[data-team-name="${i + 1}"]`)?.value || '').trim().slice(0, 25)),
    players: sanitizeTemplatePlayers(selectedPlayers),
    selectedGames,
    featuredCompetition: normalizeFeaturedCompetition(fd.get('featuredCompetition') || 'auto'),
    scoringAccessMode: normalizeScoringAccessMode(fd.get('scoreEntryMode') || 'single_device'),
    officialScorerName: String(fd.get('officialScorerName') || '').trim() || 'Official scorer',
    statTrackingEnabled: fd.get('enableStatTracking') === 'on',
    smartScoreAdvanceEnabled: selectedGames.some(g => g.key === 'sneaky_sandy_poley') ? false : fd.get('smartScoreAdvance') === 'on',
    smartScoreAdvancePreset: getSmartScoreAdvancePresetFromSetup(),
    statTrackingPlayerIds: fd.get('enableStatTracking') === 'on' ? collectStatTrackingPlayerIdsFromSetup(selectedPlayers) : []
  };
}

function applyMatchTemplate(templateId) {
  const template = readMatchTemplates().find(t => t.id === templateId);
  if (!template) return toast('Template not found.');
  const draft = createEmptyMatch();
  Object.assign(draft, {
    id: uid(),
    date: todayIso(),
    name: template.matchName || template.name || 'Round',
    courseId: template.courseId || '',
    teeId: template.teeId || '',
    allowance: Number(template.allowance) || 100,
    holeCount: Number(template.holeCount) === 9 ? 9 : 18,
    nineHoleSegment: template.nineHoleSegment || 'front',
    customStartHole: Math.max(1, Math.min(10, Number(template.customStartHole) || 1)),
    teamCount: Number(template.teamCount) || 1,
    playersPerTeam: Number(template.playersPerTeam) || 1,
    teamNames: Array.isArray(template.teamNames) ? template.teamNames.slice() : [],
    selectedGames: normalizeSelectedGamesOrder(Array.isArray(template.selectedGames) ? template.selectedGames : []),
    featuredCompetition: normalizeFeaturedCompetition(template.featuredCompetition || 'auto'),
    scoringAccessMode: normalizeScoringAccessMode(template.scoringAccessMode || 'single_device'),
    officialScorerName: template.officialScorerName || 'Official scorer',
    statTrackingEnabled: !!template.statTrackingEnabled,
    smartScoreAdvanceEnabled: template.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!template.smartScoreAdvanceEnabled,
    smartScoreAdvancePreset: normalizeSmartScoreAdvancePreset(template.smartScoreAdvancePreset),
    statTrackingPlayerIds: Array.isArray(template.statTrackingPlayerIds) ? template.statTrackingPlayerIds.slice() : [],
    players: sanitizeTemplatePlayers(template.players).map((p, idx) => ({
      ...p,
      slot: Number.isFinite(Number(p.slot)) ? Number(p.slot) : idx,
      scores: buildEmptyScores(Number(template.holeCount) === 9 ? 9 : 18),
      stats: buildEmptyStats(Number(template.holeCount) === 9 ? 9 : 18)
    })),
    notes: '',
    roundRecap: '',
    roundRecapGenerated: '',
    roundRecapFinal: '',
    roundRecapNotes: '',
    completedAt: null,
    status: 'active'
  });
  loadMatchEditor(null, draft);
  renderMatchTemplatesPanel();
  toast('Template applied. Review setup, then start round.');
}

function saveCurrentSetupAsTemplate() {
  const name = window.prompt('Template name?', document.querySelector('#matchForm [name="name"]')?.value || 'Regular Group');
  if (name === null) return;
  const template = buildTemplateFromCurrentSetup(name);
  const templates = readMatchTemplates();
  templates.unshift(template);
  writeMatchTemplates(templates);
  renderMatchTemplatesPanel();
  toast('Match template saved.');
}

function renameMatchTemplate(templateId) {
  const templates = readMatchTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) return;
  const name = window.prompt('Rename template', template.name || 'Match Template');
  if (name === null) return;
  template.name = String(name || '').trim() || template.name || 'Match Template';
  template.updatedAt = new Date().toISOString();
  writeMatchTemplates(templates);
  renderMatchTemplatesPanel();
}

function deleteMatchTemplate(templateId) {
  const templates = readMatchTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) return;
  if (!window.confirm(`Delete template "${template.name || 'Match Template'}"?`)) return;
  writeMatchTemplates(templates.filter(t => t.id !== templateId));
  renderMatchTemplatesPanel();
  toast('Template deleted.');
}

function duplicateMatchTemplate(templateId) {
  const templates = readMatchTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) return;
  const clone = JSON.parse(JSON.stringify(template));
  clone.id = uid();
  clone.name = `${template.name || 'Match Template'} Copy`;
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = clone.createdAt;
  templates.unshift(clone);
  writeMatchTemplates(templates);
  renderMatchTemplatesPanel();
}

function renderMatchTemplatesPanel() {
  const wrap = document.getElementById('matchTemplatesPanel');
  if (!wrap) return;
  const templates = readMatchTemplates();
  if (!templates.length) {
    wrap.innerHTML = `<div class="empty-state-card compact-empty-state"><strong>No templates saved yet.</strong><br>Create your first Match Template from the current setup. Templates save setup only — never scores or results.</div>`;
    return;
  }
  wrap.innerHTML = templates.map(t => {
    const players = sanitizeTemplatePlayers(t.players).map(row => getPlayer(row.playerId)?.name || '').filter(Boolean);
    const games = normalizeSelectedGamesOrder(t.selectedGames || []).map(g => getGameLabel(g)).filter(Boolean);
    const course = getCourse(t.courseId);
    const tee = course ? getTee(t.courseId, t.teeId) : null;
    return `<div class="match-template-row" data-template-id="${escapeHtml(t.id)}">
      <div class="match-template-main">
        <strong>${escapeHtml(t.name || 'Match Template')}</strong>
        <div class="tiny">${escapeHtml([course?.name, tee?.teeName, players.length ? `${players.length} players` : '', games.length ? games.join(', ') : 'No games selected'].filter(Boolean).join(' · ') || 'Setup template')}</div>
      </div>
      <div class="actions wrap compact-actions match-template-actions">
        <button type="button" class="secondary" data-apply-template="${escapeHtml(t.id)}">Apply</button>
        <button type="button" class="secondary" data-rename-template="${escapeHtml(t.id)}">Rename</button>
        <button type="button" class="secondary" data-duplicate-template="${escapeHtml(t.id)}">Duplicate</button>
        <button type="button" class="secondary danger-lite" data-delete-template="${escapeHtml(t.id)}">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function getRoundReadinessState() {
  const courseId = document.getElementById('matchCourseSelect')?.value || '';
  const teeId = document.getElementById('matchTeeSelect')?.value || '';
  const course = getCourse(courseId);
  const tee = course ? getTee(courseId, teeId) : null;
  const selectedPlayers = getSelectedPlayersFromSetup();
  const selectedGames = collectSelectedGames();
  const featured = normalizeFeaturedCompetition(document.getElementById('featuredCompetitionSelect')?.value || 'auto');
  const checks = [];
  const add = (label, ok, warning = '') => checks.push({ label, ok: !!ok, warning });
  add('Course selected', !!courseId && !!course, courseId ? 'Selected course is not available locally.' : 'No course selected yet.');
  add('Tee selected', !!teeId && !!tee, teeId ? 'Selected tee is not available locally.' : 'No tee selected yet.');
  add('Course holes loaded', !!tee && Array.isArray(tee.holes) && tee.holes.length >= 18, 'Course holes are not fully loaded.');
  add('Players added', selectedPlayers.length > 0, 'No players selected yet.');
  add('Teams configured', getCurrentSetupTeamCount() >= 1, 'Team setup needs attention.');
  add('Handicaps assigned or intentionally blank', selectedPlayers.every(row => Number.isFinite(Number(getPlayer(row.playerId)?.index ?? 0))), 'One or more players may be missing a handicap index.');
  add('Games selected', selectedGames.length > 0, 'No games selected for this round.');
  add(`Featured Competition: ${getFeaturedCompetitionDisplayName({ selectedGames }, featured === 'auto' ? resolveAutoFeaturedCompetition({ selectedGames }) : featured) || 'Auto'}`, !!featured, 'No Featured Competition selected.');
  const selectedKeys = new Set(selectedGames.map(g => g.key));
  const featureMap = { nassau: 'nassau', singles_match: 'singles_match', skins: 'skins', net_skins: 'net_skins', nine_point: 'nine_point' };
  if (featureMap[featured]) add('Featured Competition matches selected games', selectedKeys.has(featureMap[featured]), 'Featured Competition references a game that is not selected.');
  if (selectedKeys.has('singles_match')) add('Singles Match Play setup', getCurrentSetupTeamCount() === 2 && Number(document.getElementById('playersPerTeamSelect')?.value || 1) === 1, 'Singles Match Play is designed for exactly two teams with one player each.');
  if (selectedKeys.has('nine_point')) {
    const cfg = selectedGames.find(g => g.key === 'nine_point');
    add('9-Point players selected', Array.isArray(cfg?.playerIds) && new Set(cfg.playerIds.filter(Boolean)).size === 3, 'Select exactly 3 players for 9-Point.');
  }
  if (selectedKeys.has('sneaky_sandy_poley')) {
    const warnings = getSneakySandyPoleyTeamWarnings({
      teamCount: getCurrentSetupTeamCount(),
      playersPerTeam: getCurrentSetupPlayersPerTeam(),
      players: selectedPlayers,
    });
    add('Sneaky / Sandy / Poley team setup', warnings.length === 0, warnings[0] || 'Sneaky / Sandy / Poley requires two equal teams with an even number of players.');
  }
  const warnings = checks.filter(c => !c.ok);
  return { checks, warnings, ready: warnings.length === 0 };
}

function buildRoundReadinessWeatherStatus() {
  const match = editingMatchId ? getMatch(editingMatchId) : null;
  const status = getRoundWeatherStatusLabel(match);
  return `<div class="readiness-weather-status ${escapeHtml(status.kind)}">
    <span>${status.kind === 'ok' ? 'OK' : status.kind === 'warn' ? '!' : 'i'}</span>
    <div><strong>${escapeHtml(status.label)}</strong><div class="tiny">${escapeHtml(status.detail)}</div></div>
  </div>`;
}

function renderRoundReadiness() {
  const wrap = document.getElementById('roundReadinessPanel');
  if (!wrap) return;
  const state = getRoundReadinessState();
  const statusTitle = state.ready ? 'Ready to Play' : 'Review Setup';
  const statusText = state.ready ? 'Everything looks good.' : `${state.warnings.length} item${state.warnings.length === 1 ? '' : 's'} may need attention.`;
  wrap.innerHTML = `<div class="round-readiness-status ${state.ready ? 'ready' : 'review'}">
      <div><div class="section-label">${escapeHtml(statusTitle)}</div><div class="tiny">${escapeHtml(statusText)}</div></div>
      <button type="submit" form="matchForm" class="setup-action-btn readiness-start-btn">${state.ready ? 'Start Round' : 'Continue Anyway'}</button>
    </div>
    <div class="readiness-check-list top-gap">
      ${state.checks.map(c => `<div class="readiness-check ${c.ok ? 'ok' : 'warn'}"><span>${c.ok ? '✓' : '⚠'}</span><div><strong>${escapeHtml(c.label)}</strong>${c.ok ? '' : `<div class="tiny">${escapeHtml(c.warning)}</div>`}</div></div>`).join('')}
    </div>
    ${buildRoundReadinessWeatherStatus()}`;
}

function renderSetupConfidencePanels() {
  renderTodaysMatchSummary();
  renderMatchTemplatesPanel();
  renderRoundReadiness();
}

function getDefaultGameConfigs() {
  return [
    { key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 },
    { key: 'singles_match', basis: 'net', stakeType: 'match', stake: 5 },
    { key: 'individual_match', matchups: [] },
    { key: 'team_match', basis: 'net', stake: 5 },
    { key: 'team_stroke', basis: 'net', scoringMode: 'aggregate', stake: 5 },
    { key: 'skins', basis: 'gross', skinsType: 'individual', stake: 5 },
    { key: 'net_skins', basis: 'net', skinsType: 'individual', stake: 5 },
    { key: 'greenies', stakePerPlayer: 1, participants: [] },
    getDefaultSneakySandyPoleyConfig(),
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
  const scrollAnchor = captureSetupScrollAnchor(Number.isFinite(normalizedSlot) ? `#matchPlayersPicker [data-assignment-slot="${normalizedSlot}"]` : null);
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
  restoreSetupScrollAnchor(scrollAnchor);
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
  const scrollAnchor = captureSetupScrollAnchor(`#matchPlayersPicker [data-assignment-slot="${Number(slot)}"]`);
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
  restoreSetupScrollAnchor(scrollAnchor);
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
  const singlesEligibleInSetup = getCurrentSetupTeamCount() === 2 && Number(document.getElementById('playersPerTeamSelect')?.value || 1) === 1;
  picker.innerHTML = GAME_LIBRARY.map(game => {
    const singlesBlocked = game.key === 'singles_match' && !singlesEligibleInSetup;
    return `
    <label class="game-pill ${selectedKeys.includes(game.key) ? 'selected' : ''} ${singlesBlocked ? 'disabled' : ''}" ${singlesBlocked ? 'title="Singles Match Play requires two teams with one player on each team."' : ''}>
      <input type="checkbox" data-game-key="${game.key}" ${selectedKeys.includes(game.key) ? 'checked' : ''} ${singlesBlocked ? 'disabled' : ''} />
      <span>${getGameLabel(game.key)}</span>
    </label>`;
  }).join('');
  const selectedGames = normalizeSelectedGamesOrder(GAME_LIBRARY.filter(g => selectedKeys.includes(g.key)));
  renderFeaturedCompetitionSetup(normalizedExisting, document.getElementById('featuredCompetitionSelect')?.value || 'auto');
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
    if (game.key === 'net_skins') {
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Net Skins</div><div class="tiny">Individual or team skins using net scores</div></div>
        <div class="grid two compact-grid top-gap">
          <label><span>Skin type</span><select data-game-config="${game.key}" data-field="skinsType">
            <option value="individual" ${cfg.skinsType === 'individual' ? 'selected' : ''}>Individual</option>
            <option value="team" ${cfg.skinsType === 'team' ? 'selected' : ''}>Team</option>
          </select></label>
          <input type="hidden" data-game-config="${game.key}" data-field="basis" value="net" />
          <div class="tiny">Basis: <strong>Net</strong></div>
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
    if (game.key === 'sneaky_sandy_poley') {
      const sspCfg = normalizeSneakySandyPoleyConfig(cfg);
      const warnings = getSneakySandyPoleyTeamWarnings({
        teamCount: getCurrentSetupTeamCount(),
        playersPerTeam: getCurrentSetupPlayersPerTeam(),
        players: getSelectedPlayersFromSetup(),
      });
      return `<div class="card inset-card game-config-card ssp-config-card">
        <div class="game-config-header"><div class="section-label">Sneaky / Sandy / Poley</div><div class="tiny">Two-team points game with manual action awards, low net points, optional Validate, Bridge/Re-Bridge, and Umbee rules.</div></div>
        ${warnings.length ? `<div class="setup-warning top-gap">${warnings.map(item => `<div>${escapeHtml(item)}</div>`).join('')}</div>` : ''}
        <div class="grid two compact-grid top-gap">
          <label><span>$ per point</span><span class="currency-input"><span aria-hidden="true">$</span><input type="number" step="0.01" min="0" data-game-config="${game.key}" data-field="pointValue" value="${Number(sspCfg.pointValue ?? 1).toFixed(2)}" /></span></label>
          <div class="tiny">Final point differential &times; dollar value per point is the amount paid or received by each player.</div>
          <label class="span-2"><span>SSP Hole Sequence</span><select data-game-config="${game.key}" data-field="sspSequenceMode"><option value="routing" ${sspCfg.sspSequenceMode !== 'entry' ? 'selected' : ''}>Standard hole order</option><option value="entry" ${sspCfg.sspSequenceMode === 'entry' ? 'selected' : ''}>Out-of-sequence / shotgun order</option></select></label>
          <div class="tiny span-2">Standard follows normal scorecard order. Out-of-sequence follows the order holes are actually completed.</div>
          <label class="inline-check span-2"><input type="checkbox" data-game-config="${game.key}" data-field="validateGreenyProx" ${sspCfg.validateGreenyProx ? 'checked' : ''} /><span>Validate Greeny/Prox</span></label>
          <div class="tiny span-2">When on, Greeny and Prox count only with 2 putts or less.</div>
          <label class="inline-check span-2"><input type="checkbox" data-game-config="${game.key}" data-field="allowBridgeRebridge" ${sspCfg.allowBridgeRebridge ? 'checked' : ''} /><span>Allow Bridge/Re-Bridge</span></label>
          <div class="tiny span-2">Optional per-hole multipliers: Bridge 2x, Re-Bridge 4x.</div>
          <label class="inline-check span-2"><input type="checkbox" data-game-config="${game.key}" data-field="allowUmbee" ${sspCfg.allowUmbee ? 'checked' : ''} /><span>Allow Umbee</span></label>
          <div class="tiny span-2">Optional pre-round multiplier for qualifying birdie/eagle holes.</div>
          ${sspCfg.allowUmbee ? `<label class="inline-check span-2"><input type="checkbox" data-game-config="${game.key}" data-field="allowUmbeeWithBridge" ${sspCfg.allowUmbeeWithBridge ? 'checked' : ''} /><span>Allow Umbee with Bridge/Re-Bridge</span></label><div class="tiny span-2">If on, Umbee and Bridge/Re-Bridge multipliers may stack.</div>` : ''}
        </div>
      </div>`;
    }
    if (game.key === 'singles_match') {
      const eligible = getCurrentSetupTeamCount() === 2 && Number(document.getElementById('playersPerTeamSelect')?.value || 1) === 1;
      const disabledNote = eligible ? '' : '<div class="tiny warning-text top-gap">Singles Match Play requires two teams with one player on each team.</div>';
      return `<div class="card inset-card game-config-card">
        <div class="game-config-header"><div class="section-label">Singles Match Play</div><div class="tiny">One-on-one match play for exactly two teams with one player each.</div></div>
        ${disabledNote}
        <div class="grid two compact-grid top-gap">
          <label><span>Basis</span><select data-game-config="${game.key}" data-field="basis">
            <option value="net" ${cfg.basis !== 'gross' ? 'selected' : ''}>Net</option>
            <option value="gross" ${cfg.basis === 'gross' ? 'selected' : ''}>Gross</option>
          </select></label>
          <label><span>Stakes</span><select data-game-config="${game.key}" data-field="stakeType">
            <option value="match" ${String(cfg.stakeType || 'match') !== 'per_hole' ? 'selected' : ''}>Match Stakes</option>
            <option value="per_hole" ${String(cfg.stakeType || '') === 'per_hole' ? 'selected' : ''}>Per-Hole Stakes</option>
          </select></label>
          <label><span>$ Amount</span><input type="number" step="0.01" data-game-config="${game.key}" data-field="stake" value="${cfg.stake ?? 5}" /></label>
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
  syncSmartScoreAdvancePresetUi({ selectedGames: normalizedExisting });
}
function collectSelectedGames() {
  const keys = Array.from(document.querySelectorAll('[data-game-key]:checked')).map(el => el.dataset.gameKey).slice(0, 5);
  const games = keys.map(key => {
    const cfg = { key };
    document.querySelectorAll(`[data-game-config="${key}"]`).forEach(el => {
      cfg[el.dataset.field] = el.type === 'checkbox' ? !!el.checked : el.value;
    });
    if (key === 'singles_match') {
      cfg.basis = String(cfg.basis || 'net').toLowerCase() === 'gross' ? 'gross' : 'net';
      cfg.stakeType = String(cfg.stakeType || 'match').toLowerCase() === 'per_hole' ? 'per_hole' : 'match';
      cfg.stake = Number(cfg.stake || 0) || 0;
    }
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
    if (key === 'sneaky_sandy_poley') {
      Object.assign(cfg, normalizeSneakySandyPoleyConfig(cfg));
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
  const hostCanEdit = !active || isCurrentDeviceMatchHost(active);
  const editBtn = document.getElementById("editActiveMatchBtn");
  const finalizeBtns = [document.getElementById("topCreateMatchBtn"), document.getElementById("matchSubmitBtn"), document.getElementById("topUpdateMatchBtn")].filter(Boolean);
  if (editBtn) {
    const showEdit = !!active && hostCanEdit;
    editBtn.classList.toggle('hidden', !showEdit);
    editBtn.disabled = !active || editingActive || !hostCanEdit;
    editBtn.classList.toggle("is-active", editingActive);
    editBtn.textContent = editingActive ? "Editing Match" : "Edit Match";
  }
  finalizeBtns.forEach(btn => {
    btn.textContent = editingMatchId ? "Update Match" : "Create Match";
    btn.disabled = !!active && !hostCanEdit;
    if (!!active && !hostCanEdit) btn.classList.add('hidden');
  });
}

function renderSetupSharedAdminPanel() {
  const panel = document.getElementById('setupSharedAdminPanel');
  if (!panel) return;
  const match = getActiveMatch();
  if (!match || match.storageMode !== 'shared') {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  ensureSharedParticipantRegistered(match);
  const isHost = isCurrentDeviceMatchHost(match);
  const mode = normalizeScoringAccessMode(match.scoringAccessMode || match.scoreEntryMode || 'single_device');
  const code = normalizeMatchCode(match.sharedMatchCode || match.sharedMatchRef || match.sharedMatchId || '');
  let participants = getSharedAssignmentParticipants(match);
  let devices = getSharedAssignmentDevices(match);
  if (match.sharedMatchId && hasSupabaseConfig() && isHost && !sharedParticipantPanelRefreshPending) {
    sharedParticipantPanelRefreshPending = true;
    refreshSharedDevicesForAssignment(match)
      .then(finalParticipants => {
        sharedParticipantPanelRefreshPending = false;
        const before = JSON.stringify(participants || []);
        participants = normalizeSharedParticipantList(finalParticipants || [], match.sharedDevices || [], match);
        devices = getSharedAssignmentDevices(match);
        if (before !== JSON.stringify(participants)) {
          persist({ skipRender: true });
          renderAll();
        }
      })
      .catch(err => {
        sharedParticipantPanelRefreshPending = false;
        console.warn('Shared participant panel refresh failed.', err);
      });
  }
  const sync = getSharedSyncStatus(match);
  const lastSync = formatSharedLastSync(match);
  const parity = match.sharedLedgerParity && typeof match.sharedLedgerParity === 'object' ? match.sharedLedgerParity : null;
  const parityLabel = parity?.status === 'confirmed' ? 'Confirmed' : parity?.status === 'conflict' ? 'Conflict detected' : parity?.status === 'warning' ? 'Warning' : 'Not confirmed';
  const currentRoundStatus = match.completedAt ? 'Round complete' : 'In progress';
  const assignmentRows = participants.map(participant => {
    const assignedNames = isAssignedPlayersMode(match) ? getAssignedPlayerNamesForParticipant(match, participant.participantId) : [];
    const assignmentText = isAssignedPlayersMode(match) ? (assignedNames.length ? assignedNames.join(', ') : 'No players assigned') : formatScoreEntryModeLabel(mode);
    const role = participant.role === 'host' || String(participant.participantId) === String(match.sharedHostParticipantId || '') ? 'Host' : 'Joined';
    const seen = getSharedParticipantSeenStatus(participant);
    return `<div class="shared-device-row shared-participant-card">
      <div><strong>${seen.icon} ${escapeHtml(participant.deviceName || participant.name || 'Participant')}</strong><div class="tiny">${escapeHtml(role)} · ${escapeHtml(seen.label)}</div></div>
      <div><div class="tiny"><strong>Assigned</strong></div><div class="tiny">${escapeHtml(assignmentText)}</div></div>
    </div>`;
  }).join('');
  const assignmentRowsByPlayer = isAssignedPlayersMode(match) ? (match.players || []).map(mp => {
    const player = getPlayer(mp.playerId) || { name: 'Player' };
    const savedAssigned = getAssignedParticipantForPlayer(match, mp.playerId);
    const assigned = savedAssigned && participants.some(p => String(p.participantId) === String(savedAssigned)) ? savedAssigned : (savedAssigned || match.sharedHostParticipantId || getCurrentSharedParticipantId(match));
    const assignedParticipant = participants.find(p => String(p.participantId) === String(assigned));
    const unavailableOption = savedAssigned && !assignedParticipant ? `<option value="${escapeHtml(savedAssigned)}" selected>Previously assigned participant unavailable</option>` : '';
    const options = unavailableOption + participants.map(p => `<option value="${escapeHtml(p.participantId)}" ${String(p.participantId) === String(assigned) ? 'selected' : ''}>${escapeHtml(p.deviceName || p.name || p.participantId)}</option>`).join('');
    return `<div class="shared-assignment-row">
      <div><strong>${escapeHtml(player.name)}</strong><div class="tiny">${escapeHtml(getTeamLabel(match, mp.team))}</div></div>
      ${isHost ? `<select data-shared-player-assignment="${escapeHtml(mp.playerId)}" aria-label="Assign scorer for ${escapeHtml(player.name)}">${options}</select>` : `<div class="tiny">${escapeHtml(assignedParticipant?.deviceName || assignedParticipant?.name || 'Unassigned')}</div>`}
    </div>`;
  }).join('') : '';
  if (match.storageMode === 'shared' && isHost && isAssignedPlayersMode(match)) console.debug('[SharedAssignmentMap]', 'render assignment dropdown', { currentParticipantId: getCurrentSharedParticipantId(match), hydratedParticipants: participants, assignmentDropdownOptions: participants.map(p => ({ participantId: p.participantId, name: p.deviceName || p.name })), playerAssignmentMap: match.sharedPlayerAssignments || {} });
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="item-header compact-item-header">
      <div>
        <h2>Shared Match</h2>
        <div class="tiny">Code: <strong>${escapeHtml(code || '—')}</strong> · Role: ${isHost ? 'Host' : 'Joined Device'} · ${escapeHtml(currentRoundStatus)}</div>
      </div>
      <span class="setup-role-badge">${isHost ? 'Host' : 'Joined'}</span>
    </div>
    <div class="shared-match-panel top-gap shared-match-status-${escapeHtml(sync.tone)}">
      <div class="shared-match-code"><span>Shared Match Code</span><strong>${escapeHtml(code || '—')}</strong><div class="tiny">Players can join this match using the code above.</div></div>
      <div class="shared-status-grid top-gap">
        <div><div class="tiny">Connection</div><strong>${escapeHtml(getSharedOnlineLabel())}</strong></div>
        <div><div class="tiny">Status</div><strong>${escapeHtml(sync.label)}</strong></div>
        <div><div class="tiny">Score parity</div><strong>${escapeHtml(parityLabel)}</strong></div>
        <div><div class="tiny">Last synced</div><strong>${escapeHtml(lastSync)}</strong></div>
        <div><div class="tiny">Assignment</div><strong>${escapeHtml(getSharedAssignmentSummary(match))}</strong></div>
      </div>
      <div class="tiny top-gap">${escapeHtml(sync.detail)}</div>
      <div class="shared-readiness-summary top-gap">${getSharedMatchReadinessLines(match, participants).map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>
      <div class="actions wrap compact-actions top-gap">
        <button type="button" class="secondary" data-copy-shared-code="${escapeHtml(code)}">Copy Code</button>
        <button type="button" class="secondary" data-share-shared-code="${escapeHtml(code)}">Share Code</button>
        <button type="button" class="secondary" id="setupSyncSharedMatchNowBtn">Sync Now</button>
        ${isHost && isAssignedPlayersMode(match) ? '<button type="button" class="secondary" data-focus-shared-assignments="1">Manage Assignments</button>' : ''}
        ${isHost ? '<button type="button" data-start-shared-scoring="1">Start Scoring</button>' : ''}
      </div>
    </div>
    <details class="top-gap shared-match-details" open>
      <summary>Participants / Carts (${participants.length})</summary>
      <div class="tiny top-gap">${(() => {
        const hydrated = !!match.sharedDevicesHydratedForAssignmentAt || !hasSupabaseConfig();
        const joinedParticipants = participants.filter(p => String(p.participantId) !== String(match.sharedHostParticipantId || ''));
        const joinedAssignable = joinedParticipants.some(p => isValidSharedAssignmentParticipantId(match, p.participantId));
        if (participants.length <= 1 && isHost) return sharedParticipantPanelRefreshPending || !hydrated ? 'Waiting for joined participants…' : 'Waiting for joined participants… Share the match code to allow another scorer to join.';
        if (isHost && isAssignedPlayersMode(match) && (!hydrated || sharedParticipantPanelRefreshPending)) return 'Joined participant detected. Preparing assignment options…';
        if (isHost && isAssignedPlayersMode(match) && joinedAssignable) return 'Ready for assignment.';
        if (isHost && isAssignedPlayersMode(match)) return 'Joined participant detected. Preparing assignment options…';
        return 'Joined participants are available as assignment targets.';
      })()}</div>
      <div class="shared-device-list top-gap">${assignmentRows}</div>
    </details>
    ${isAssignedPlayersMode(match) ? `<div class="top-gap" id="sharedAssignmentManager">
      <div class="section-label">Player assignments</div>
      <div class="tiny top-gap">${isHost ? 'Assign each player to the participant responsible for score entry.' : 'The host controls player assignments. You can score only assigned players.'}</div>
      <div class="shared-assignment-list top-gap">${assignmentRowsByPlayer}</div>
    </div>` : ''}
  `;
}

function renderMatchSetupState() {
  const wrap = document.getElementById('matchSetupFormWrap');
  const msg = document.getElementById('setupLockMsg');
  const entry = document.getElementById('setupEntryCard');
  const entryTitle = entry?.querySelector('h2');
  const joinPanel = document.getElementById('setupJoinPanel');
  const active = getActiveMatch();
  const started = matchHasStarted(active);
  const editingActive = !!(editingMatchId && active && editingMatchId === active.id);
  const hostCanEdit = !active || isCurrentDeviceMatchHost(active);
  if (!wrap || !msg) return;

  if (active?.storageMode === 'shared' && !hostCanEdit) setupWorkflowMode = 'join';
  if (editingMatchId || (!active && setupWorkflowMode === 'create')) setupWorkflowMode = 'create';

  const showJoin = setupWorkflowMode === 'join' && !(active && !hostCanEdit);
  const showForm = hostCanEdit && (setupWorkflowMode === 'create' || editingMatchId) && !(active && !editingActive);
  const showCurrentMatchPanel = !!active && !showForm && !showJoin;
  const choiceGrid = document.getElementById('setupChoiceGrid');

  if (entry) entry.classList.toggle('hidden', showForm || showJoin || (active?.storageMode === 'shared' && !hostCanEdit && !showCurrentMatchPanel));
  if (choiceGrid) choiceGrid.classList.toggle('hidden', !!active || setupWorkflowMode !== 'landing');
  if (joinPanel) {
    joinPanel.classList.toggle('hidden', !showJoin);
    const deviceNameInput = document.getElementById('setupJoinDeviceNameInput');
    if (showJoin && deviceNameInput && !deviceNameInput.value) deviceNameInput.value = getPreferredSharedDeviceName('');
  }

  if (entryTitle) entryTitle.textContent = active && !showForm ? 'Current Match' : 'Game setup';

  if (active?.storageMode === 'shared' && !hostCanEdit) {
    wrap.classList.add('hidden');
    msg.textContent = `${active.name || 'Shared match'} · ${getCourse(active.courseId)?.name || 'Course'} · Joined Match · ${getSharedAssignmentSummary(active)}`;
  } else if (active && !showForm) {
    wrap.classList.add('hidden');
    const courseName = getCourse(active.courseId)?.name || 'Course not selected';
    const playerCount = Array.isArray(active.players) ? active.players.length : 0;
    const mode = formatScoreEntryModeLabel(active.scoringAccessMode || active.scoreEntryMode || 'single_device');
    const sharedCode = normalizeMatchCode(active.sharedMatchCode || active.sharedMatchRef || active.sharedMatchId || '');
    const sharedLabel = sharedCode ? ` · Shared Match: ${sharedCode}` : '';
    const startedLabel = started ? ` · ${completedHoles(active)}/${getRequestedHoleCount(active)} holes entered` : '';
    msg.textContent = `${active.name || 'Active Match'} · ${courseName} · ${playerCount} players · ${mode}${sharedLabel}${startedLabel}`;
  } else if (!showForm) {
    wrap.classList.add('hidden');
    msg.textContent = 'Create a new match as host, or join a match created by another host.';
  } else {
    wrap.classList.remove('hidden');
    msg.textContent = active ? `${active.name || 'Active match'} · ${getSetupRoleLabel(active)} · ${completedHoles(active)}/${getRequestedHoleCount(active)} holes entered.` : 'Create a new match setup.';
  }
  const topCreateBtn = document.getElementById('topCreateMatchBtn');
  const topUpdateBtn = document.getElementById('topUpdateMatchBtn');
  const matchSubmitBtn = document.getElementById('matchSubmitBtn');
  const topCancelBtn = document.getElementById('topCancelMatchSetupBtn');
  const bottomCancelBtn = document.getElementById('cancelMatchEditBtn');
  if (topCreateBtn) topCreateBtn.classList.toggle('hidden', !showForm || !!editingMatchId);
  if (topUpdateBtn) topUpdateBtn.classList.toggle('hidden', !showForm || !editingMatchId);
  if (topCancelBtn) topCancelBtn.classList.toggle('hidden', !showForm);
  if (matchSubmitBtn) matchSubmitBtn.classList.toggle('hidden', !showForm);
  if (bottomCancelBtn) bottomCancelBtn.classList.toggle('hidden', !showForm);
  renderSetupSharedAdminPanel();
  updateSetupActionButtonStates();
}

function loadPlayerEditor(playerId = null) {
  const form = document.getElementById('playerForm');
  if (!form) return;
  editingPlayerId = playerId;
  document.getElementById('cancelPlayerEditBtn')?.classList.toggle('hidden', !playerId);
  const title = document.getElementById('playerFormTitle');
  const submit = document.getElementById('playerSubmitBtn');
  if (title) title.textContent = playerId ? 'Edit player' : 'Add player';
  if (submit) submit.textContent = playerId ? 'Update Player' : 'Save Player';
  if (!playerId) { form.reset(); return; }
  const player = getPlayer(playerId); if (!player) return;
  activateTab('courses');
  form.name.value = player.name; form.index.value = player.index;
  requestAnimationFrame(() => {
    const chrome = document.querySelector('.app-chrome');
    const offset = (chrome?.getBoundingClientRect?.().height || 0) + 12;
    const y = form.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    form.querySelector('[name="name"]')?.focus?.({ preventScroll: true });
  });
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
  const previousTabId = document.querySelector('.panel.active')?.id || '';
  const closedCompletedSummary = tabId === 'setup' && closeCompletedSummarySession();
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
  document.querySelectorAll('.panel').forEach(el => el.classList.toggle('active', el.id === tabId));
  if (closedCompletedSummary) renderAll();
  updateAppChromeOffset();
  syncFinishRoundUi(getActiveMatch());
  if (tabId === 'setup') {
    refreshActiveSharedParticipants({ silent: true });
    startSharedConnectionFastRefresh({ reason: 'match-tab-opened' });
  }
  if (tabId === 'score') {
    const match = getActiveMatch();
    if (ensurePlayInputState(match)) persist({ skipRender: true });
    renderCurrentMatch();
  }
  if (tabId === 'courses') renderPlayers();
  if (previousTabId !== tabId) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function viewCompletedMatchSummary() {
  const match = getActiveMatch();
  if (match?.status === 'complete') uiState.completedSummaryMatchId = match.id;
  hidePostRoundActions();
  activateTab('leaderboard');
  renderLeaderboard();
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


function cancelMatchSetupChanges() {
  const active = getActiveMatch();
  const wasEditingExisting = !!(editingMatchId && active && editingMatchId === active.id);
  pendingNextRoundSessionContext = null;
  editingMatchId = null;
  setupWorkflowMode = 'landing';

  if (wasEditingExisting || active) {
    resetMatchSetupFormDomToBlank();
    renderMatchSetupState();
    renderAll();
    activateTab('score');
    toast(wasEditingExisting ? 'Setup changes discarded.' : 'Match setup cancelled.');
    return;
  }

  resetMatchSetupFormDomToBlank();
  renderMatchSetupState();
  updateCloudConfigUi();
  activateTab('setup');
  toast('Match setup cancelled.');
}

function loadMatchEditor(matchId = null, draftMatch = null) {
  const form = document.getElementById('matchForm');
  editingMatchId = matchId;
  const bottomCancelBtn = document.getElementById('cancelMatchEditBtn');
  if (bottomCancelBtn) bottomCancelBtn.classList.toggle('hidden', false);
  const topUpdateBtn = document.getElementById('topUpdateMatchBtn');
  const topCreateBtn = document.getElementById('topCreateMatchBtn');
  const topUpdateNote = document.getElementById('topUpdateMatchNote');
  if (topUpdateBtn) topUpdateBtn.classList.add('hidden');
  if (topCreateBtn) topCreateBtn.classList.remove('hidden');
  if (topUpdateNote) topUpdateNote.classList.toggle('hidden', !matchId);
  const isNextRoundDraft = !matchId && draftMatch && Number(draftMatch.roundNumber) > 1;
  document.getElementById('matchFormTitle').textContent = matchId ? 'Edit match setup' : (isNextRoundDraft ? 'Start Another Round' : 'Match setup');
  const setupActionLabel = matchId ? 'Update Match' : (isNextRoundDraft ? 'Begin Round' : 'Create Match');
  document.getElementById('matchSubmitBtn').textContent = setupActionLabel;
  if (topCreateBtn) topCreateBtn.textContent = setupActionLabel;
  if (topUpdateBtn) topUpdateBtn.textContent = 'Update Match';
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
    document.getElementById('scoreEntryModeSelect').value = draft.scoringAccessMode || 'single_device';
    const sharedMatchToggle = document.getElementById('sharedMatchEnabled'); if (sharedMatchToggle) sharedMatchToggle.checked = draft.storageMode === 'shared';
    document.getElementById('officialScorerNameInput').value = draft.officialScorerName || 'Official scorer';
    const statToggle = document.getElementById('enableStatTrackingInput'); if (statToggle) statToggle.checked = !!draft.statTrackingEnabled;
    const smartToggle = document.getElementById('smartScoreAdvanceInput'); if (smartToggle) smartToggle.checked = draft.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!draft.smartScoreAdvanceEnabled;
    syncSmartScoreAdvancePresetUi(draft);
    populateMatchCourseSelects(draft.courseId || '', draft.teeId || '');
    renderTeamNameInputs(draft.teamCount || 1, draft.teamNames || []);
    renderScoringControlConfig(draft);
    uiState.matchPlayerDraft = Array.isArray(draft.players) ? draft.players.map((p, idx) => ({ ...p, slot: Number.isFinite(Number(p.slot)) ? Number(p.slot) : idx, teeId: p.teeId || '' })) : [];
    uiState.referenceTeeManual = false;
    uiState.referenceTeeAutoId = '';
    populateMatchPlayerPicker(uiState.matchPlayerDraft);
    renderStatTrackingPlayerSelector(Array.isArray(draft.statTrackingPlayerIds) ? draft.statTrackingPlayerIds : null);
    renderGamesPicker(draft.selectedGames || []);
    renderFeaturedCompetitionSetup(draft.selectedGames || [], draft.featuredCompetition || 'auto');
    renderSetupHandicapPreview();
    renderTodaysMatchSummary();
    renderMatchTemplatesPanel();
    renderRoundReadiness();
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
  const smartToggle = document.getElementById('smartScoreAdvanceInput'); if (smartToggle) smartToggle.checked = match.smartScoreAdvanceEnabled == null ? DEFAULT_SMART_SCORE_ADVANCE : !!match.smartScoreAdvanceEnabled;
  syncSmartScoreAdvancePresetUi(match);
  renderTeamNameInputs(match.teamCount || 2, match.teamNames || []);
  renderScoringControlConfig(match);
  uiState.matchPlayerDraft = (match.players || []).map((p, idx) => ({ ...p, slot: Number.isFinite(Number(p.slot)) ? Number(p.slot) : idx, teeId: p.teeId || match.teeId || '' }));
  uiState.referenceTeeManual = !!match.teeId;
  uiState.referenceTeeAutoId = '';
  syncReferenceTeeUi({ courseId: match.courseId, selections: uiState.matchPlayerDraft, forceAuto: !match.teeId });
  uiState.referenceTeeManual = !!(match.teeId && document.getElementById('matchTeeSelect')?.value === match.teeId);
  populateMatchPlayerPicker(uiState.matchPlayerDraft);
  renderStatTrackingPlayerSelector(Array.isArray(match.statTrackingPlayerIds) ? match.statTrackingPlayerIds : null);
  renderGamesPicker(match.selectedGames || []);
  renderFeaturedCompetitionSetup(match.selectedGames || [], match.featuredCompetition || 'auto');
  renderSetupHandicapPreview();
  renderTodaysMatchSummary();
  renderMatchTemplatesPanel();
  renderRoundReadiness();
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
  document.addEventListener('click', e => {
    const jump = e.target.closest?.('[data-jump-missing-score]');
    if (jump) {
      e.preventDefault();
      activateTab('score');
      toast('Review the highlighted missing scores on the Play tab.');
      return;
    }
  });
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    activateTab(tabId);
    if (['courses','setup'].includes(tabId)) refreshCourseLibraryFromCloud({ silent: true });
    if (tabId === 'setup') {
    refreshActiveSharedParticipants({ silent: true });
    startSharedConnectionFastRefresh({ reason: 'match-tab-opened' });
  }
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
    const duplicates = findLikelyDuplicateCourses(course, editingCourseId || '');
    if (duplicates.length && !confirm(`A likely matching saved course already exists: ${duplicates[0].name}${duplicates[0].city ? ` (${duplicates[0].city})` : ''}. Save this as a separate course anyway?`)) return;
    if (editingCourseId) state.courses = state.courses.map(c => c.id === editingCourseId ? course : c); else state.courses.push(course);
    markCoursePendingSync(course);
    loadCourseEditor(null); persist(); toast(editingCourseId ? 'Course updated locally. Use Publish Local Changes to publish changes.' : 'Course added locally. Use Publish Local Changes to publish it.');
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
  document.getElementById('importScorecardShortcutBtn')?.addEventListener('click', () => { document.getElementById('importScorecardBtn')?.click(); });
  document.getElementById('addCourseShortcutBtn')?.addEventListener('click', () => { document.getElementById('courseFormTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.querySelector('#courseForm input[name="name"]')?.focus(); });
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
    if (holes.length !== 18) return toast('A saved tee must include holes 1–18.');
    if (holes.some((hole, idx) => Number(hole.holeNumber) !== idx + 1)) return toast('Hole numbers must run from 1 through 18.');
    if (holes.some(hole => !Number.isFinite(Number(hole.par)) || Number(hole.par) < 3 || Number(hole.par) > 6)) return toast('Enter a reasonable par (3–6) for every hole.');
    if (holes.some(hole => hole.yardage != null && (!Number.isFinite(Number(hole.yardage)) || Number(hole.yardage) < 0))) return toast('Yardage must be a positive number or left blank.');
    if (holes.some(h => !Number.isFinite(h.strokeIndex) || !h.strokeIndex)) return toast('Enter stroke indexes for all 18 holes.');
    if (strokeTotal !== 171) return toast('Stroke indexes must total 171 before saving.');
    if (new Set(holes.map(hole => Number(hole.strokeIndex))).size !== 18) return toast('Stroke indexes must use each value from 1 through 18 once.');
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
    loadTeeEditor(courseId, null); persist(); toast(editingTeeRef ? 'Tee updated locally. Use Publish Local Changes to publish changes.' : 'Tee saved locally. Use Publish Local Changes to publish changes.');
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
      const idx = e.target.dataset.comboHole;
      preserveSetupScrollDuring(() => {
        const selected = collectComboSources();
        renderComboSourceRows(document.getElementById('teeCourseSelect').value, selected);
        syncComboTotals();
      }, `[data-combo-hole="${idx}"]`);
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
    const editCourse = e.target.dataset.editCourse;
    const deleteLocalCourse = e.target.dataset.deleteCourseLocal;
    const deleteCloudCourse = e.target.dataset.deleteCourseCloud;
    const deleteCourseAll = e.target.dataset.deleteCourseAll;
    const newTee = e.target.dataset.newTee; const editTee = e.target.dataset.editTee; const copyTee = e.target.dataset.copyTee; const deleteTee = e.target.dataset.deleteTee;
    if (editCourse) loadCourseEditor(editCourse);
    if (deleteLocalCourse) { handleDeleteLocalCourse(deleteLocalCourse); return; }
    if (deleteCloudCourse) { handleDeleteCloudCourse(deleteCloudCourse); return; }
    if (deleteCourseAll) { handleDeleteCourseEverywhere(deleteCourseAll); return; }
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

  
  document.getElementById('newMatchBtn').addEventListener('click', () => { setupWorkflowMode = 'create'; handleNewMatchRequest(); });
  const setupFinishRoundBtn = document.getElementById('setupFinishRoundBtn');
  if (setupFinishRoundBtn) setupFinishRoundBtn.addEventListener('click', armFinishRound);
  const setupConfirmFinishRoundBtn = document.getElementById('setupConfirmFinishRoundBtn');
  if (setupConfirmFinishRoundBtn) setupConfirmFinishRoundBtn.addEventListener('click', completeActiveRound);
  document.getElementById('editActiveMatchBtn').addEventListener('click', () => {
    const active = getActiveMatch();
    if (!active) return toast('No active match to edit.');
    if (matchHasStarted(active) && !confirm('Changing match setup after scoring has started may affect scores, handicaps, settlements, and reports. Continue?')) return;
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

  document.getElementById('matchCourseSelect').addEventListener('change', e => preserveSetupScrollDuring(() => { uiState.referenceTeeManual = false; populateMatchTees(e.target.value); const currentSelections = getCurrentMatchEditorSelections(); const defaultTeeId = getDefaultMatchTeeId(e.target.value); const normalizedSelections = currentSelections.map(row => ({ ...row, teeId: defaultTeeId })); syncMatchPlayerDraft(normalizedSelections); normalizeDraftTeeAssignments({ courseId: e.target.value, forceDefault: true }); syncReferenceTeeUi({ courseId: e.target.value, selections: uiState.matchPlayerDraft, forceAuto: true }); populateMatchPlayerPicker(uiState.matchPlayerDraft); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); renderTodaysMatchSummary(); }, '#matchCourseSelect'));
  document.getElementById('holeCountSelect').addEventListener('change', e => preserveSetupScrollDuring(() => { renderNineHoleConfigUi(); renderSetupHandicapPreview(); renderTodaysMatchSummary(); }, '#holeCountSelect'));
  document.getElementById('nineHoleSegmentSelect').addEventListener('change', e => preserveSetupScrollDuring(() => { renderNineHoleConfigUi(); renderSetupHandicapPreview(); renderTodaysMatchSummary(); }, '#nineHoleSegmentSelect'));
  document.getElementById('customNineHoleStartSelect').addEventListener('change', e => preserveSetupScrollDuring(() => { renderSetupHandicapPreview(); renderTodaysMatchSummary(); }, '#customNineHoleStartSelect'));
  document.getElementById('teamCountSelect').addEventListener('change', e => preserveSetupScrollDuring(() => {
    const teamCount = getCurrentSetupTeamCount();
    const teamNames = Array.from(document.querySelectorAll('[data-team-name]')).map(el => el.value);
    renderTeamNameInputs(teamCount, teamNames);
    renderScoringControlConfig();
    refreshMatchPlayerSlots({ preserveSelections: true });
    renderTodaysMatchSummary();
  }, '#teamCountSelect'));
  document.getElementById('playersPerTeamSelect').addEventListener('change', e => preserveSetupScrollDuring(() => {
    refreshMatchPlayerSlots({ preserveSelections: true });
    renderTodaysMatchSummary();
  }, '#playersPerTeamSelect'));
  document.getElementById('teamCountSelect').addEventListener('input', () => {
    refreshMatchPlayerSlots({ preserveSelections: true });
    renderTodaysMatchSummary();
  });
  document.getElementById('playersPerTeamSelect').addEventListener('input', () => {
    refreshMatchPlayerSlots({ preserveSelections: true });
    renderTodaysMatchSummary();
  });
  document.getElementById('scoreEntryModeSelect').addEventListener('change', e => preserveSetupScrollDuring(() => { renderScoringControlConfig(); renderTodaysMatchSummary(); }, '#scoreEntryModeSelect'));
  document.getElementById('matchTeeSelect').addEventListener('change', e => preserveSetupScrollDuring(() => { uiState.referenceTeeManual = true; uiState.referenceTeeAutoId = e.target.value || uiState.referenceTeeAutoId; const draft = normalizeDraftTeeAssignments({ forceDefault: false }).map(row => ({ ...row, teeId: row.teeId || e.target.value || '' })); syncMatchPlayerDraft(draft); normalizeDraftTeeAssignments({ forceDefault: false }); syncReferenceTeeUi({ selections: uiState.matchPlayerDraft, forceAuto: false }); populateMatchPlayerPicker(uiState.matchPlayerDraft); renderGamesPicker(collectSelectedGames()); renderSetupHandicapPreview(); renderTodaysMatchSummary(); }, '#matchTeeSelect'));
  document.getElementById('teamNamesGrid').addEventListener('input', e => {
    // Keep team-name typing stable on mobile. Rebuilding the setup controls on every
    // keystroke can replace focused inputs and collapse the iPhone keyboard.
    if (e.target?.matches('[data-team-name]')) {
      renderTodaysMatchSummary();
      return;
    }
    preserveSetupScrollDuring(() => { renderTodaysMatchSummary(); }, '#teamNamesGrid');
  });
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
      preserveSetupScrollDuring(() => assignPlayerToSlot(Number(e.target.dataset.playerSelectSlot), e.target.value || ''), `#matchPlayersPicker [data-assignment-slot="${Number(e.target.dataset.playerSelectSlot)}"]`);
      return;
    }
    if (e.target.matches('[data-player-tee-slot]')) {
      preserveSetupScrollDuring(() => updateMatchPlayerTee(Number(e.target.dataset.playerTeeSlot), e.target.value || ''), `#matchPlayersPicker [data-assignment-slot="${Number(e.target.dataset.playerTeeSlot)}"]`);
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
      preserveSetupScrollDuring(() => assignPlayerToSlot(Number(selectBtn.dataset.selectPlayerSlot), selectBtn.dataset.playerId || ''), `#matchPlayersPicker [data-assignment-slot="${Number(selectBtn.dataset.selectPlayerSlot)}"]`);
      return;
    }
    const clearBtn = e.target.closest('[data-clear-player-slot]');
    if (clearBtn) {
      preserveSetupScrollDuring(() => assignPlayerToSlot(Number(clearBtn.dataset.clearPlayerSlot), ''), `#matchPlayersPicker [data-assignment-slot="${Number(clearBtn.dataset.clearPlayerSlot)}"]`);
    }
  });
  document.getElementById('closePlayerSearchSheet').addEventListener('click', closePlayerSearchSheet);
  document.getElementById('playerSearchSheet').addEventListener('click', e => {
    if (e.target.id === 'playerSearchSheet') closePlayerSearchSheet();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('playerDetailDialog')?.classList.contains('hidden')) closePlayerDetailView();
    if (e.key === 'Escape' && !document.getElementById('quickScoreboardDialog')?.classList.contains('hidden')) closeQuickScoreboardView();
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
      if (e.target.matches('input[data-score-player]')) return;
      setTimeout(() => {
        if (document.activeElement !== e.target) return;
        try { e.target.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch (_) {}
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
    const grossToggle = e.target.closest('[data-gross-game-detail-toggle]');
    if (grossToggle) {
      const key = String(match.id || 'active');
      uiState.grossGameDetailOpenByMatch[key] = !uiState.grossGameDetailOpenByMatch[key];
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
    if (e.target && (e.target.id === 'enableStatTrackingInput' || e.target.matches('[data-player-slot], [data-stat-track-player]'))) renderStatTrackingPlayerSelector();
    if (e.target && (e.target.id === 'smartScoreAdvanceInput' || e.target.id === 'smartScoreAdvancePresetSelect')) syncSmartScoreAdvancePresetUi();
    if (e.target.matches('[data-player-slot], [data-player-tee-slot], [data-team-name], #teamCountSelect, #playersPerTeamSelect, #matchCourseSelect, #matchTeeSelect, #holeCountSelect, #nineHoleSegmentSelect, #customNineHoleStartSelect, [name="allowance"], #featuredCompetitionSelect, #scoreEntryModeSelect, #officialScorerNameInput, [data-team-scorer-label], [data-team-scorer-code], [data-side-field], [data-nine-point-player], [data-game-config], #enableStatTrackingInput, #smartScoreAdvanceInput, #smartScoreAdvancePresetSelect, [data-stat-track-player]')) {
      setTimeout(() => { renderSetupHandicapPreview(); renderGamesPicker(collectSelectedGames()); renderFeaturedCompetitionSetup(collectSelectedGames()); renderTodaysMatchSummary(); }, 0);
    }
  });
  document.getElementById('setup').addEventListener('input', e => {
    if (e.target.matches('[data-team-name], [name="allowance"], #scoreEntryModeSelect, #officialScorerNameInput, [data-team-scorer-label], [data-team-scorer-code], [data-game-config], [data-nine-point-player], #holeCountSelect, #nineHoleSegmentSelect, #customNineHoleStartSelect, #smartScoreAdvancePresetSelect')) {
      renderSetupHandicapPreview();
      renderTodaysMatchSummary();
    }
  });
  document.getElementById('setup').addEventListener('click', e => {
    const applyTemplateId = e.target.closest('[data-apply-template]')?.dataset.applyTemplate;
    if (applyTemplateId) { applyMatchTemplate(applyTemplateId); return; }
    const renameTemplateId = e.target.closest('[data-rename-template]')?.dataset.renameTemplate;
    if (renameTemplateId) { renameMatchTemplate(renameTemplateId); return; }
    const deleteTemplateId = e.target.closest('[data-delete-template]')?.dataset.deleteTemplate;
    if (deleteTemplateId) { deleteMatchTemplate(deleteTemplateId); return; }
    const duplicateTemplateId = e.target.closest('[data-duplicate-template]')?.dataset.duplicateTemplate;
    if (duplicateTemplateId) { duplicateMatchTemplate(duplicateTemplateId); return; }
    if (e.target.id === 'saveCurrentSetupTemplateBtn') { saveCurrentSetupAsTemplate(); return; }
    if (e.target.id === 'statTrackingSelectAllBtn') {
      document.querySelectorAll('[data-stat-track-player]').forEach(el => { el.checked = true; });
      renderTodaysMatchSummary();
      return;
    }
    if (e.target.id === 'statTrackingClearAllBtn') {
      document.querySelectorAll('[data-stat-track-player]').forEach(el => { el.checked = false; });
      renderTodaysMatchSummary();
      return;
    }
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
    const scoreStepBtn = e.target.closest('[data-score-step]');
    if (scoreStepBtn) {
      const playerId = scoreStepBtn.dataset.scoreStepPlayer || '';
      const escapedId = cssEscape(playerId);
      const input = document.querySelector(`input[data-score-player="${escapedId}"]`);
      if (!input || input.disabled) return;
      const dir = scoreStepBtn.dataset.scoreStep === 'down' ? -1 : 1;
      applySmartScoreStep(input, dir);
      return;
    }
    const stepBtn = e.target.closest('[data-stat-step]');
    if (stepBtn) {
      const match = getActiveMatch();
      if (!match) return;
      const playerId = stepBtn.dataset.statPlayer || '';
      const key = stepBtn.dataset.statKey || '';
      const dir = stepBtn.dataset.statStep === 'down' ? -1 : 1;
      const escapedId = cssEscape(playerId);
      const escapedKey = cssEscape(key);
      const input = document.querySelector(`input[data-stat-player="${escapedId}"][data-stat-key="${escapedKey}"]`);
      if (!input || input.disabled) return;
      const fallback = key === 'putts' ? 2 : 0;
      const current = Number.isFinite(Number(input.value)) ? Number(input.value) : fallback;
      const next = Math.max(0, Math.min(9, Math.round(current + dir)));
      input.value = String(next);
      if (key === 'putts') {
        input.dataset.puttsSource = 'user';
        commitSmartPuttsDomValue(input, 'user');
      }
      applyCurrentHoleDomToMatch(match);
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
      return;
    }
    const jumpHole = e.target.closest('[data-jump-hole]')?.dataset.jumpHole;
    if (jumpHole) {
      saveCurrentHole({ targetHole: Number(jumpHole), silent: true });
    }
  });
  document.getElementById('score').addEventListener('change', e => {
    if (e.target && e.target.id === 'currentHoleSelect') {
      const selectedHole = Number(e.target.value);
      const match = getActiveMatch();
      if (match && getPlayableHoleCount(match, getTee(match.courseId, match.teeId)) === 18 && Number.isFinite(selectedHole)) {
        currentHoleSequenceStart = Math.max(1, Math.min(18, selectedHole));
      }
      saveCurrentHole({ targetHole: selectedHole, silent: true });
      return;
    }
    if (e.target && e.target.matches('input[data-stat-player][data-stat-key]')) {
      const match = getActiveMatch();
      if (!match) return;
      if (e.target.matches('input[type="checkbox"]')) {
        applySmartPuttsAdjustmentFromCheckbox(e.target);
      } else if (e.target.matches('.stat-putts-input')) {
        e.target.dataset.puttsSource = 'user';
        commitSmartPuttsDomValue(e.target, 'user');
      }
      applyCurrentHoleDomToMatch(match);
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
    if (e.target && e.target.matches('[data-ssp-player][data-ssp-key], [data-ssp-prox], [data-ssp-hole-key]')) {
      const match = getActiveMatch();
      if (!match) return;
      if (e.target.matches('[data-ssp-player][data-ssp-key]')) {
        const playerId = e.target.dataset.sspPlayer || '';
        const key = e.target.dataset.sspKey || '';
        const escapedPlayerId = cssEscape(playerId);
        const sneaky = document.querySelector(`[data-ssp-player="${escapedPlayerId}"][data-ssp-key="sneaky"]`);
        const sandy = document.querySelector(`[data-ssp-player="${escapedPlayerId}"][data-ssp-key="sandy"]`);
        if (key === 'sandy' && e.target.checked && sneaky) sneaky.checked = true;
        if (key === 'sneaky' && !e.target.checked && sandy?.checked) e.target.checked = true;
      }
      const applyOptions = { sspGreenyChanged: e.target.matches('[data-ssp-player][data-ssp-key="greeny"]') };
      applyCurrentHoleDomToMatch(match, applyOptions);
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true, applyOptions });
      renderCurrentMatch();
    }
  });
  document.getElementById('score').addEventListener('input', e => {
    if (e.target && e.target.matches('[data-ssp-notes]')) {
      const match = getActiveMatch();
      if (!match) return;
      applyCurrentHoleDomToMatch(match);
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: false, silent: true, persistLocal: true });
    }
  });
  document.getElementById('score').addEventListener('focusin', e => {
    if (e.target.matches('input[data-score-player]')) {
      if (e.target.dataset.scoreWired !== 'direct') handleLiveScoreInputFocus(e.target);
    }
    if (e.target.matches('.stat-putts-input') && !e.target.disabled && typeof e.target.select === 'function') {
      requestAnimationFrame(() => {
        try { e.target.select(); } catch (err) {}
      });
    }
  });
  document.getElementById('score').addEventListener('keydown', e => {
    if (!e.target.matches('input[data-score-player]')) return;
    if (e.target.dataset.scoreWired === 'direct') return;
    handleLiveScoreInputKeydown(e);
  });
  document.getElementById('score').addEventListener('blur', e => {
    if (e.target.matches('input[data-score-player]')) {
      if (e.target.dataset.scoreWired !== 'direct') handleLiveScoreInputBlur(e.target);
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
    if (e.target.matches('.stat-putts-input')) {
      commitSmartPuttsDomValue(e.target, e.target.dataset.puttsSource || 'user');
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    } else if (e.target.matches('input[data-stat-player][data-stat-key]')) {
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
  }, true);
  document.getElementById('score').addEventListener('input', e => {
    if (e.target.matches('input[data-score-player]')) {
      if (e.target.dataset.scoreWired !== 'direct') handleLiveScoreInputEvent(e.target);
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
      refreshFeaturedCompetitionLivePreview();
    }
    if (e.target.matches('.stat-putts-input')) {
      e.target.dataset.puttsSource = 'user';
      commitSmartPuttsDomValue(e.target, 'user');
      persist({ skipRender: true });
      scheduleSharedActiveMatchSyncFromDom({ immediate: true, silent: true, persistLocal: true });
    }
  });
  document.getElementById('score').addEventListener('change', e => {
    if (e.target && (e.target.id === 'showOtherScoresToggle' || e.target.id === 'showOtherStatsToggle')) {
      const match = getActiveMatch();
      if (!match) return;
      match.sharedShowOtherScores = !!document.getElementById('showOtherScoresToggle')?.checked;
      match.sharedShowOtherStats = !!document.getElementById('showOtherStatsToggle')?.checked;
      persist({ skipRender: true });
      renderAll();
    }
  });
  document.getElementById('setupCreateMatchChoiceBtn')?.addEventListener('click', () => {
    setupWorkflowMode = 'create';
    handleNewMatchRequest();
  });
  document.getElementById('setupJoinMatchChoiceBtn')?.addEventListener('click', () => {
    setupWorkflowMode = 'join';
    renderMatchSetupState();
    const nameInput = document.getElementById('setupJoinDeviceNameInput');
    if (nameInput && !nameInput.value) nameInput.value = getPreferredSharedDeviceName('');
    (nameInput || document.getElementById('setupJoinMatchCodeInput'))?.focus();
  });
  document.getElementById('setupJoinCancelBtn')?.addEventListener('click', () => {
    setupWorkflowMode = 'landing';
    renderMatchSetupState();
  });
  document.getElementById('setupJoinMatchBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('setupJoinDeviceNameInput');
    const input = document.getElementById('setupJoinMatchCodeInput');
    const deviceName = setStoredSharedDeviceName(String(nameInput?.value || '').trim() || 'Joined Device');
    const matchId = normalizeMatchCode(input?.value || '');
    if (!matchId) return toast('Enter a shared match code.');
    try {
      const joined = await loadSharedMatchFromCloud(matchId, { activate: true, silent: false });
      setupWorkflowMode = 'join';
      if (joined) {
        joined.activeScoreRole = 'assigned_player_scorer';
        ensureSharedParticipantRegistered(joined, deviceName || getPreferredSharedDeviceName('Joined Device'));
        await upsertSharedMembershipForCurrentDevice(joined).catch(err => console.warn('Could not update joined-device membership.', err));
        await publishCurrentSharedDeviceToCloudMetadata(joined).catch(err => console.warn('Could not publish joined-device metadata.', err));
        console.debug('[SharedJoin]', 'joined device registered', { matchCode: matchId, joinedLocalDeviceId: getSharedDeviceId(), joinedDeviceName: deviceName, participants: joined.sharedParticipants || [], devices: joined.sharedDevices || [] });
        logSharedAssignmentDiag('joined-device-joined-match', joined, { matchCode: matchId, joinedLocalDeviceId: getSharedDeviceId(), joinedDeviceName: deviceName, sharedDevicesAfterRegistration: joined.sharedDevices || [] });
        persist({ skipRender: true });
        scheduleSharedMatchSync(joined, { immediate: true, silent: true });
      }
      renderAll();
      showSharedJoinConfirmation(joined);
      startSharedConnectionFastRefresh({ reason: 'joined-device-waiting-assignment' });
      activateTab('setup');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not join shared match.');
    }
  });
  document.getElementById('setupSharedAdminPanel')?.addEventListener('click', async e => {
    const copyBtn = e.target.closest('[data-copy-shared-code]');
    if (copyBtn) {
      const code = copyBtn.dataset.copySharedCode || '';
      const copied = await copyTextToClipboard(code);
      toast(copied ? 'Match code copied.' : (code || 'No match code.'));
      return;
    }
    const shareBtn = e.target.closest('[data-share-shared-code]');
    if (shareBtn) {
      const code = shareBtn.dataset.shareSharedCode || '';
      const text = `Join my Dye Ledger match with code ${code}`;
      if (navigator.share) {
        try { await navigator.share({ title: 'The Dye Ledger Shared Match', text }); toast('Share sheet opened.'); } catch (err) { if (err?.name !== 'AbortError') toast('Could not open share sheet.'); }
      } else {
        const copied = await copyTextToClipboard(code);
        toast(copied ? 'Match code copied.' : (code || 'No match code.'));
      }
      return;
    }
    if (e.target.closest('[data-start-shared-scoring]')) {
      const match = getActiveMatch();
      if (!match) return;
      if (ensureRoundTimingStarted(match)) {
        persist({ skipRender: true });
        scheduleSharedMatchSync(match, { immediate: true, silent: true });
      }
      activateTab('score');
      return;
    }
    if (e.target.closest('#setupSyncSharedMatchNowBtn')) {
      const match = getActiveMatch();
      if (!match?.sharedMatchId) return toast('No shared match is active.');
      await upsertSharedMembershipForCurrentDevice(match).catch(err => console.warn('Could not update shared membership before sync.', err));
      await publishCurrentSharedDeviceToCloudMetadata(match).catch(err => console.warn('Could not publish current device metadata before sync.', err));
      await flushSharedMatchSync(match.id, { silent: false });
      if (isCurrentDeviceMatchHost(match)) {
        const incoming = await fetchSharedParticipantDevices(match.sharedMatchId, match).catch(err => {
          console.warn('Could not refresh participant devices.', err);
          return [];
        });
        if (mergeSharedDevices(match, incoming || [])) persist({ skipRender: true });
      }
      await refreshActiveSharedParticipants({ silent: true });
      await refreshActiveSharedScores({ silent: true });
      startSharedConnectionFastRefresh({ reason: 'sync-now' });
      renderAll();
      return;
    }
    if (e.target.closest('[data-focus-shared-assignments]')) {
      const match = getActiveMatch();
      if (match?.sharedMatchId && isCurrentDeviceMatchHost(match)) {
        try {
          await upsertSharedMembershipForCurrentDevice(match);
          await mergeCloudSharedMetadata(match, { includeAssignments: false });
          persist({ skipRender: true });
          renderAll();
        } catch (err) {
          console.warn('Could not refresh devices before opening assignments.', err);
        }
      }
      document.getElementById('sharedAssignmentManager')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  });
  document.getElementById('score')?.addEventListener('click', async e => {
    if (!e.target.closest('[data-check-shared-assignment]')) return;
    const match = getActiveMatch();
    if (!match?.sharedMatchId) return toast('No shared match is active.');
    try {
      await upsertSharedMembershipForCurrentDevice(match).catch(err => console.warn('Could not update joined-device membership.', err));
      await publishCurrentSharedDeviceToCloudMetadata(match).catch(err => console.warn('Could not publish joined-device metadata.', err));
      await mergeCloudSharedMetadata(match, { includeAssignments: true });
      await refreshActiveSharedParticipants({ silent: true });
      await refreshActiveSharedScores({ silent: true, render: false });
      persist({ skipRender: true });
      startSharedConnectionFastRefresh({ reason: 'check-assignment' });
      renderAll();
      const summary = getSharedAssignmentSummary(match);
      toast(summary === 'Waiting for the host to assign players to this device.' ? 'Still waiting for host assignment.' : summary);
    } catch (err) {
      console.error(err);
      toast('Could not check assignment. Try Sync Now.');
    }
  });

  document.getElementById('setupSharedAdminPanel')?.addEventListener('change', async e => {
    if (!e.target.matches('[data-shared-player-assignment]')) return;
    const match = getActiveMatch();
    if (!match || !isCurrentDeviceMatchHost(match)) return;
    const ok = await setSharedPlayerAssignment(match, e.target.dataset.sharedPlayerAssignment, e.target.value);
    if (!ok) return renderAll();
    await refreshActiveSharedScores({ silent: true, render: false });
    renderAll();
  });

  // Pull the live device list the moment the host interacts with an assignment
  // dropdown, so a just-joined device is selectable without waiting for a poll.
  // Debounced, and only re-renders if the available device set actually changed
  // (re-rendering mid-open would otherwise collapse the native picker).
  const onDemandAssignmentRefresh = async target => {
    if (!target?.closest?.('[data-shared-player-assignment]')) return;
    const match = getActiveMatch();
    if (!match || !isCurrentDeviceMatchHost(match) || !match.sharedMatchId || !hasSupabaseConfig()) return;
    const now = Date.now();
    if (now - sharedAssignmentDropdownRefreshAt < 2000) return;
    sharedAssignmentDropdownRefreshAt = now;
    try {
      const before = JSON.stringify(getSharedAssignmentParticipants(match).map(p => String(p.participantId)).sort());
      await refreshSharedDevicesForAssignment(match);
      const after = JSON.stringify(getSharedAssignmentParticipants(match).map(p => String(p.participantId)).sort());
      if (before !== after) {
        persist({ skipRender: true });
        renderAll();
      }
    } catch (err) {
      console.warn('On-demand assignment-dropdown refresh failed.', err);
    }
  };
  document.getElementById('setupSharedAdminPanel')?.addEventListener('focusin', e => { onDemandAssignmentRefresh(e.target); });
  document.getElementById('setupSharedAdminPanel')?.addEventListener('pointerdown', e => { onDemandAssignmentRefresh(e.target); });



  function getMatchSetupValidationState({ fd = null, selectedPlayers = null, selectedGames = null, existing = null, sharedMatchEnabled = false, scoringAccessMode = '' } = {}) {
    const formData = fd || new FormData(document.getElementById('matchForm'));
    const teamCount = Number(formData.get('teamCount')) || 1;
    const playersPerTeam = Number(formData.get('playersPerTeam')) || 1;
    const courseId = String(formData.get('courseId') || '').trim();
    const players = Array.isArray(selectedPlayers) ? selectedPlayers : getSelectedPlayersFromSetup();
    const games = Array.isArray(selectedGames) ? selectedGames : collectSelectedGames();
    const requestedHoleCount = Number(formData.get('holeCount')) === 9 ? 9 : 18;
    const teeId = String(formData.get('teeId') || document.getElementById('matchTeeSelect')?.value || players[0]?.teeId || '').trim();
    const missing = [];
    const warnings = [];
    const uniqueIds = new Set(players.map(p => p.playerId).filter(Boolean));
    if ((teamCount * playersPerTeam) > 32) missing.push('Limit is 32 total players');
    if (!courseId) missing.push('Course selection');
    if (!teeId && !players.some(p => p.teeId)) missing.push('Tee selection');
    if (players.length < 1) missing.push('At least one player');
    if (players.length !== uniqueIds.size) missing.push('Each player can only be selected once');
    if (players.some(p => !p.teeId)) missing.push('A tee for each player');
    if (![9, 18].includes(requestedHoleCount)) missing.push('Selected holes');
    if (games.length > 5) missing.push('Select up to 5 gambling games');
    if (games.some(g => g.key === 'nassau') && teamCount !== 2) missing.push('Nassau requires exactly 2 teams');
    if (games.some(g => ['team_match','team_stroke'].includes(g.key)) && teamCount < 2) missing.push('Team games require at least 2 teams');
    if (games.some(g => g.key === 'nine_point') && players.length < 3) missing.push('9-Point Game requires at least 3 assigned players');
    if (games.some(g => g.key === 'nine_point' && (!Array.isArray(g.playerIds) || [...new Set(g.playerIds)].length !== 3))) missing.push('Select 3 players for the 9-Point Game');
    if (games.some(g => g.key === 'sneaky_sandy_poley')) missing.push(...getSneakySandyPoleyTeamWarnings({ teamCount, playersPerTeam, players }));
    if (sharedMatchEnabled && scoringAccessMode === 'assigned_players' && existing?.sharedPlayerAssignments) {
      const unassigned = players.filter(p => !existing.sharedPlayerAssignments[p.playerId]);
      if (unassigned.length && existing.sharedMatchId) warnings.push('Some Shared Match assignments will default to the host until changed');
    }
    return {
      ready: missing.length === 0,
      missingRequirements: [...new Set(missing)],
      warnings,
      summary: {
        courseSelected: !!courseId,
        teeSelected: !!teeId || players.every(p => p.teeId),
        playerCount: players.length,
        selectedHoles: requestedHoleCount,
        sharedMatch: !!sharedMatchEnabled,
        assignmentsComplete: sharedMatchEnabled ? (scoringAccessMode === 'assigned_players' ? 'Host default/managed' : 'N/A') : 'N/A',
        roundStarted: !!getActiveMatch()?.players?.some(mp => (mp.scores || []).some(s => Number(s.gross) > 0)),
      }
    };
  }

  function getUserFacingMissingRequirements(validationState) {
    const technicalPatterns = /\b(variable|undefined|null|referenceerror|typeerror|validationstate|matchstate|is not defined|cannot read|cannot access)\b/i;
    return (validationState?.missingRequirements || [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .filter(item => !technicalPatterns.test(item));
  }

  function formatMatchSetupFailureMessage(validationState) {
    const missing = getUserFacingMissingRequirements(validationState);
    if (!missing.length) return 'Could not finalize match setup because of an internal app error.\n\nPlease try Refresh Now. If this continues, check Match Setup Diagnostics.';
    return `Could not finalize match setup.\n\nMissing:\n${missing.map(item => `• ${item}`).join('\n')}`;
  }

  function toastMatchSetupFailure(validationState) {
    const message = formatMatchSetupFailureMessage(validationState);
    toast(message);
    try { window.dyeLedgerLastMatchSetupValidation = validationState; } catch {}
  }

  function logMatchFinalizationDiagnostics(stage, payload = {}) {
    try {
      console.group('Match Finalization');
      console.log('Stage:', stage);
      console.log('Course:', payload.courseId || payload.match?.courseId || '');
      console.log('Tee:', payload.teeId || payload.match?.teeId || '');
      console.log('Players:', payload.selectedPlayers || payload.match?.players || []);
      console.log('Selected Holes:', payload.holeCount || payload.match?.holeCount || '');
      console.log('Shared Match:', payload.sharedMatchEnabled ?? (payload.match?.storageMode === 'shared'));
      console.log('Assignments:', payload.match?.sharedPlayerAssignments || payload.existing?.sharedPlayerAssignments || {});
      console.log('Round State:', { activeMatchId: state.activeMatchId, currentHole, editingMatchId, setupWorkflowMode });
      if (payload.validationState) console.log('Validation:', payload.validationState);
      if (payload.error) console.error('Match finalization failed:', payload.error, payload);
      console.groupEnd();
    } catch (diagErr) {
      console.warn('Match finalization diagnostics failed:', diagErr);
    }
  }

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
    if (selectedGames.some(g => g.key === 'sneaky_sandy_poley')) {
      const sspWarnings = getSneakySandyPoleyTeamWarnings({ teamCount, playersPerTeam, players: selectedPlayers });
      if (sspWarnings.length) return toast(sspWarnings[0]);
    }
    const existing = editingMatchId ? getMatch(editingMatchId) : null;
    const scoringAccessMode = normalizeScoringAccessMode(fd.get('scoreEntryMode') || 'single_device');
    const scoreEntryMode = getLegacyScoreEntryMode(scoringAccessMode);
    const officialScorerName = String(fd.get('officialScorerName') || '').trim() || 'Official scorer';
    const sharedMatchEnabled = (scoringAccessMode === 'assigned_players' || fd.get('sharedMatchEnabled') === 'on') && hasSupabaseConfig();
    logMatchFinalizationDiagnostics('pre-build', { selectedPlayers, selectedGames, existing, sharedMatchEnabled, scoringAccessMode, courseId: String(fd.get('courseId') || ''), teeId: String(fd.get('teeId') || ''), holeCount: Number(fd.get('holeCount')) === 9 ? 9 : 18 });
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
      smartScoreAdvanceEnabled: selectedGames.some(g => g.key === 'sneaky_sandy_poley') ? false : fd.get('smartScoreAdvance') === 'on',
      smartScoreAdvancePreset: getSmartScoreAdvancePresetFromSetup(),
      statTrackingPlayerIds: fd.get('enableStatTracking') === 'on' ? collectStatTrackingPlayerIdsFromSetup(selectedPlayers) : [],
      teamScorers,
      selectedGames: normalizeSelectedGamesOrder(selectedGames),
      featuredCompetition: normalizeFeaturedCompetition(fd.get('featuredCompetition') || existing?.featuredCompetition || 'auto'),
      status: existing?.status || 'active',
      completedAt: existing?.completedAt || null,
      previousCompletedAt: existing?.previousCompletedAt || null,
      reopenedAt: existing?.reopenedAt || null,
      players: selectedPlayers.map(sp => {
        const old = Array.isArray(existing?.players) ? existing.players.find(op => op.playerId === sp.playerId) : null;
        return old ? { ...old, team: sp.team, slot: sp.slot, teeId: sp.teeId || selectedPlayers[0]?.teeId || '', stats: Array.isArray(old.stats) && old.stats.length ? old.stats : buildEmptyStats(Number(fd.get('holeCount')) === 9 ? 9 : 18) } : { playerId: sp.playerId, team: sp.team, slot: sp.slot, teeId: sp.teeId || selectedPlayers[0]?.teeId || '', scores: buildEmptyScores(Number(fd.get('holeCount')) === 9 ? 9 : 18), stats: buildEmptyStats(Number(fd.get('holeCount')) === 9 ? 9 : 18) };
      }),
      greeniesWinners: existing?.greeniesWinners || {},
      sneakySandyPoleyInputs: existing?.sneakySandyPoleyInputs || {},
      matchStatusGame: existing?.matchStatusGame || getDefaultFeaturedGameKey(selectedGames),
      momentumGame: existing?.momentumGame || existing?.matchStatusGame || getDefaultFeaturedGameKey(selectedGames),
      momentumPerspective: Number(existing?.momentumPerspective || 1) === 2 ? 2 : 1,
      activeScoreRole: existing?.activeScoreRole || (scoringAccessMode === 'assigned_players' ? 'assigned_player_scorer' : 'official_scorer'),
      activeScoreTeam: Math.min(teamCount, Math.max(1, Number(existing?.activeScoreTeam) || 1)),
      storageMode: sharedMatchEnabled ? 'shared' : (existing?.storageMode === 'shared' ? 'shared' : 'local'),
      sharedMatchId: existing?.sharedMatchId || null,
      sharedMatchRef: existing?.sharedMatchRef || existing?.sharedMatchId || null,
      sharedOwnerUserId: existing?.sharedOwnerUserId || null,
      sharedMatchCode: existing?.sharedMatchCode || '',
      sharedHostDeviceId: existing?.sharedHostDeviceId || '',
      sharedHostParticipantId: existing?.sharedHostParticipantId || '',
      sharedDevices: existing?.sharedDevices || [],
      sharedParticipants: existing?.sharedParticipants || [],
      sharedPlayerAssignments: existing?.sharedPlayerAssignments || {},
      cloudSyncState: existing?.cloudSyncState || (sharedMatchEnabled ? 'pending' : 'local-only'),
      lastCloudSyncAt: existing?.lastCloudSyncAt || null,
      notes: mergeRoundNoteText(existing?.roundRecapNotes, existing?.notes || state.notes || ''),
      roundRecap: existing?.roundRecapFinal || existing?.roundRecapGenerated || existing?.roundRecap || '',
      roundRecapGenerated: existing?.roundRecapGenerated || existing?.roundRecap || '',
      roundRecapFinal: existing?.roundRecapFinal || '',
      roundRecapGeneratedAt: existing?.roundRecapGeneratedAt || null,
      roundRecapStatus: existing?.roundRecapStatus || '',
      roundRecapNotes: mergeRoundNoteText(existing?.roundRecapNotes, existing?.notes || state.notes || ''),
      roundContext: normalizeRoundContext(existing?.roundContext || {}),
      roundTiming: existing?.roundTiming || { startedAt: null, endedAt: null },
      holeFirstCompletedAt: existing?.holeFirstCompletedAt || {},
    };
    if (!editingMatchId && pendingNextRoundSessionContext) {
      match.sessionId = pendingNextRoundSessionContext.sessionId;
      match.sessionName = pendingNextRoundSessionContext.sessionName || 'Session';
      match.sessionCreatedAt = pendingNextRoundSessionContext.sessionCreatedAt || todayIso();
      match.roundNumber = Number(pendingNextRoundSessionContext.roundNumber) || 1;
      match.previousRoundId = pendingNextRoundSessionContext.previousRoundId || '';
      match.startedFromPriorRoundId = pendingNextRoundSessionContext.startedFromPriorRoundId || '';
      match.sharedDevices = pendingNextRoundSessionContext.sharedDevices || match.sharedDevices || [];
      match.sharedParticipants = pendingNextRoundSessionContext.sharedParticipants || match.sharedParticipants || [];
      match.sharedPlayerAssignments = pendingNextRoundSessionContext.sharedPlayerAssignments || match.sharedPlayerAssignments || {};
      match.sharedHostDeviceId = pendingNextRoundSessionContext.sharedHostDeviceId || match.sharedHostDeviceId || '';
      match.sharedHostParticipantId = pendingNextRoundSessionContext.sharedHostParticipantId || match.sharedHostParticipantId || '';
      if (pendingNextRoundSessionContext.storageMode === 'shared') match.storageMode = 'shared';
    }
    normalizeMatch(match);
    if (!match.courseId) return toast('Select a course.');
    const courseChanged = !!existing && String(existing.courseId || '') !== String(match.courseId || '');
    const teeSetChanged = !!existing && JSON.stringify((existing.players || []).map(player => player.teeId || '').sort()) !== JSON.stringify((match.players || []).map(player => player.teeId || '').sort());
    match.courseSnapshot = (!existing || courseChanged || teeSetChanged || !existing.courseSnapshot)
      ? getCourseSnapshotForMatch({ ...match, courseSnapshot: null })
      : JSON.parse(JSON.stringify(existing.courseSnapshot));
    markCourseRecentlyUsed(match.courseId, match.date || todayIso());
    if (!match.players.every(p => p.teeId)) { markMissingTeeRows(); return toast('Each player needs a tee.'); }
    clearMatchTeeErrors();
    if (sharedMatchEnabled) {
      const localDeviceId = getSharedDeviceId();
      match.sharedMatchCode = normalizeMatchCode(existing?.sharedMatchCode || existing?.sharedMatchRef || existing?.sharedMatchId || generateSharedMatchCode());
      match.sharedMatchId = existing?.sharedMatchId || match.sharedMatchCode;
      match.sharedMatchRef = match.sharedMatchCode;
      match.sharedHostDeviceId = existing?.sharedHostDeviceId || localDeviceId;
      ensureSharedParticipantRegistered(match, 'Host Device');
      if (scoringAccessMode === 'assigned_players') {
        const hostParticipantId = match.sharedHostParticipantId || getCurrentSharedParticipantId(match);
        match.players.forEach(mp => { if (!match.sharedPlayerAssignments[mp.playerId]) match.sharedPlayerAssignments[mp.playerId] = hostParticipantId; });
        migrateSharedPlayerAssignmentsToParticipants(match);
      }
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
    pendingNextRoundSessionContext = null;
    state.activeMatchId = match.id;
    if (match.storageMode === 'shared') {
      setLastOpenedSharedMatch(match);
      logSharedAssignmentDiag('host-created-shared-match', match, { initialSharedParticipants: match.sharedParticipants || [], initialSharedDevices: match.sharedDevices || [], initialSharedPlayerAssignments: match.sharedPlayerAssignments || {} });
      startSharedConnectionFastRefresh({ reason: 'host-created-shared-match' });
    }
    currentHole = Math.min(getRequestedHoleCount(match), Math.max(1, completedHoles(match) || 1));
    if (!editingMatchId && match.storageMode !== 'shared') ensureRoundTimingStarted(match);
    persist({ skipRender: true });
    loadMatchEditor(null);
    renderAll();
    if (match.storageMode === 'shared') {
      setupWorkflowMode = 'landing';
      activateTab('setup');
      renderMatchSetupState();
    } else {
      activateTab('score');
    }
    if (!editingMatchId) scheduleWeatherCaptureForMatch(match.id);
    toast(editingMatchId ? 'Match setup saved.' : (sharedMatchEnabled ? 'Shared match setup saved. Assign devices, then tap Start Scoring.' : 'Match setup saved.'));
    } catch (err) {
      logMatchFinalizationDiagnostics('exception', { error: err });
      const diagnosticEntry = recordAppError(err, 'Match Finalization');
      console.error('Unexpected match finalization error:', err);
      toast('Could not finalize match setup because of an internal app error. The error has been saved in More → Recent App Errors.', 6200);
      try {
        window.dyeLedgerLastMatchSetupValidation = {
          ready: false,
          missingRequirements: ['Internal app error — see More → Recent App Errors'],
          summary: getMatchSetupDiagnosticSnapshot?.().summary || {},
          errorId: diagnosticEntry?.id || null
        };
      } catch {}
      renderRecentAppErrorsDiagnostics();
    }
  });
  document.getElementById('cancelMatchEditBtn').addEventListener('click', cancelMatchSetupChanges);
  document.getElementById('topCancelMatchSetupBtn')?.addEventListener('click', cancelMatchSetupChanges);
  const postRoundSummaryBtn = document.getElementById('postRoundViewSummaryBtn');
  if (postRoundSummaryBtn) postRoundSummaryBtn.addEventListener('click', viewCompletedMatchSummary);
  const postRoundAnotherBtn = document.getElementById('postRoundAnotherRoundBtn');
  if (postRoundAnotherBtn) postRoundAnotherBtn.addEventListener('click', startAnotherRoundWithSameGroup);
  const postRoundNewBtn = document.getElementById('postRoundNewMatchBtn');
  if (postRoundNewBtn) postRoundNewBtn.addEventListener('click', () => { hidePostRoundActions(); startCleanNewMatchSetup(); });
  const postRoundJoinBtn = document.getElementById('postRoundJoinMatchBtn');
  if (postRoundJoinBtn) postRoundJoinBtn.addEventListener('click', () => startJoinNewMatchSetup());
  const postRoundInlineSummaryBtn = document.getElementById('postRoundInlineViewSummaryBtn');
  if (postRoundInlineSummaryBtn) postRoundInlineSummaryBtn.addEventListener('click', viewCompletedMatchSummary);
  document.getElementById('completedSummaryDoneBtn')?.addEventListener('click', exitCompletedSummaryToMatch);
  const postRoundInlineAnotherBtn = document.getElementById('postRoundInlineAnotherRoundBtn');
  if (postRoundInlineAnotherBtn) postRoundInlineAnotherBtn.addEventListener('click', startAnotherRoundWithSameGroup);
  const postRoundInlineNewBtn = document.getElementById('postRoundInlineNewMatchBtn');
  if (postRoundInlineNewBtn) postRoundInlineNewBtn.addEventListener('click', () => { hidePostRoundActions(); startCleanNewMatchSetup(); });
  const postRoundInlineJoinBtn = document.getElementById('postRoundInlineJoinMatchBtn');
  if (postRoundInlineJoinBtn) postRoundInlineJoinBtn.addEventListener('click', () => startJoinNewMatchSetup());
  function saveCurrentHole({ advance = false, targetHole = null, silent = false } = {}) {
    const match = getActiveMatch(); if (!match) return false;
    if (getScoreAccessState(match).role === 'viewer') { if (!silent) toast('Viewer mode is read-only.'); return false; }
    const scoringHoles = getSelectedScoringHoles(match, getTee(match.courseId, match.teeId));
    const holeMeta = scoringHoles[currentHole - 1] || null;
    const actualHoleNumber = holeMeta?.holeNumber || currentHole;
    const wasCompleteBeforeSave = match.status === 'complete';
    const hostOverridePlayers = [];
    if (match.storageMode === 'shared' && isAssignedPlayersMode(match) && isCurrentDeviceMatchHost(match)) {
      const owned = getSharedLocallyOwnedPlayerIds(match);
      document.querySelectorAll('input[data-score-player]').forEach(input => {
        const playerId = input.dataset.scorePlayer;
        if (!playerId || owned.has(playerId)) return;
        const mp = (match.players || []).find(row => row.playerId === playerId);
        const prior = mp?.scores?.[currentHole - 1]?.gross ?? null;
        const next = String(input.value || '').trim() === '' ? null : (Number.isFinite(Number(input.value)) ? Math.round(Number(input.value)) : null);
        if (prior !== next) hostOverridePlayers.push(playerId);
      });
    }
    const mutated = applyCurrentHoleDomToMatch(match);
    try {
      match.playedHoleOrder = Array.isArray(match.playedHoleOrder) ? match.playedHoleOrder : [];
      match.holeFirstCompletedAt = match.holeFirstCompletedAt && typeof match.holeFirstCompletedAt === 'object' ? match.holeFirstCompletedAt : {};
      const nowCompleteAfterSave = (match.players || []).length > 0 && (match.players || []).every(mp => Number(mp?.scores?.[currentHole - 1]?.gross) > 0);
      if (nowCompleteAfterSave) {
        if (!match.playedHoleOrder.map(Number).includes(Number(actualHoleNumber))) match.playedHoleOrder.push(Number(actualHoleNumber));
        recordHoleFirstCompletedAt(match, actualHoleNumber);
      }
    } catch (orderErr) {
      recordAppError(orderErr, 'Actual Play Order Tracking');
    }
    if (hostOverridePlayers.length) {
      match.sharedHostScoreOverrides = match.sharedHostScoreOverrides && typeof match.sharedHostScoreOverrides === 'object' ? match.sharedHostScoreOverrides : {};
      hostOverridePlayers.forEach(playerId => { match.sharedHostScoreOverrides[getSharedPlayerHoleKey(playerId, actualHoleNumber)] = new Date().toISOString(); });
    }
    if (wasCompleteBeforeSave && mutated) markRoundReopenedForEditing(match);
    const savedHole = actualHoleNumber;
    const maxHole = getPlayableHoleCount(match, getTee(match.courseId, match.teeId));
    const savedPosition = currentHole;
    const normalizedTarget = Number(targetHole);
    const teeForNavigation = getTee(match.courseId, match.teeId);
    if (shouldInferRotatedHoleSequenceStart(match, savedPosition, teeForNavigation)) currentHoleSequenceStart = savedPosition;
    const sequence = getPlayableHoleSequence(match, teeForNavigation);
    const nextHoleInSequence = getAdjacentPlayableHole(match, savedPosition, 1, teeForNavigation);
    const prevHoleInSequence = getAdjacentPlayableHole(match, savedPosition, -1, teeForNavigation);
    if (Number.isFinite(normalizedTarget) && normalizedTarget >= 1 && normalizedTarget <= maxHole) {
      currentHole = normalizedTarget;
    } else if (advance) {
      currentHole = nextHoleInSequence || savedPosition;
    } else if (targetHole === 'previous') {
      currentHole = prevHoleInSequence || savedPosition;
    } else {
      currentHole = nextHoleInSequence || savedPosition;
    }
    persist();
    scheduleSharedMatchSync(match, { immediate: true, silent: true });
    if (match.storageMode === 'shared') refreshActiveSharedScores({ silent: true, render: false });
    if (!silent) toast(hostOverridePlayers && hostOverridePlayers.length ? `Host updated Hole ${savedHole} score.` : `Hole ${savedHole} saved.`);
    const savedHoleWasFinalInSequence = sequence.length > 0 && sequence[sequence.length - 1] === savedPosition;
    if (!wasCompleteBeforeSave && savedHoleWasFinalInSequence && !nextHoleInSequence) {
      if (isSelectedRoundComplete(match, teeForNavigation)) showRoundCompletePrompt(match);
      else showRoundEndPrompt('early', match);
    }
    return true;
  }
  window.dyeLedgerSaveCurrentHole = saveCurrentHole;

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
  document.getElementById('prevHoleBtn').addEventListener('click', () => { saveCurrentHole({ targetHole: 'previous', silent: true }); });
  document.getElementById('nextHoleBtn').addEventListener('click', () => { saveCurrentHole({ advance: true, silent: true }); });
  document.getElementById('leaderboard')?.addEventListener('click', e => {
    const promptBtn = e.target.closest('[data-round-note-prompt]');
    if (promptBtn) {
      const match = getActiveMatch();
      const box = document.getElementById('roundRecapNotesBox');
      if (!match || !box) return;
      const prompt = String(promptBtn.dataset.roundNotePrompt || promptBtn.textContent || '').trim();
      if (!prompt) return;
      const prefix = box.value && !box.value.endsWith('\n') ? '\n\n' : '';
      box.value = `${box.value || ''}${prefix}${prompt}\n`;
      match.roundRecapNotes = box.value;
      match.notes = match.roundRecapNotes;
      persist({ skipRender: true });
      scheduleSharedMatchSync(match, { immediate: false, silent: true });
      box.focus();
      try { box.setSelectionRange(box.value.length, box.value.length); } catch (_) {}
      return;
    }
    if (e.target.closest('#generateRoundRecapBtn')) {
      generateRoundRecapForActiveMatch();
      return;
    }
    if (e.target.closest('#editRoundRecapBtn')) {
      uiState.roundRecapEditing = !uiState.roundRecapEditing;
      renderRoundRecapControlPanel(getActiveMatch());
      return;
    }
    if (e.target.closest('#acceptRoundRecapBtn')) {
      acceptRoundRecapForActiveMatch();
      return;
    }
    if (e.target.closest('#clearRoundRecapBtn')) {
      clearRoundRecapForActiveMatch();
      return;
    }
  });
  document.getElementById('leaderboard')?.addEventListener('input', e => {
    if (!e.target || e.target.id !== 'roundRecapNotesBox') return;
    const match = getActiveMatch();
    if (!match) return;
    match.roundRecapNotes = e.target.value || '';
    match.notes = match.roundRecapNotes;
    persist({ skipRender: true });
    scheduleSharedMatchSync(match, { immediate: false, silent: true });
  });
  document.getElementById('scoreboardShareRoundBtn').addEventListener('click', () => { openPrintScorecard(); });
  document.getElementById('saveScoresBtn').addEventListener('click', () => { saveCurrentHole(); });
  document.getElementById('addMemorySaveBtn')?.addEventListener('click', saveMemoryFromModal);
  document.getElementById('addMemoryCancelBtn')?.addEventListener('click', closeAddMemoryModal);
  document.getElementById('addMemoryDialog')?.addEventListener('click', e => { if (e.target?.id === 'addMemoryDialog') closeAddMemoryModal(); });
  document.getElementById('playerDetailCloseBtn')?.addEventListener('click', closePlayerDetailView);
  document.getElementById('playerDetailDialog')?.addEventListener('click', e => { if (e.target?.id === 'playerDetailDialog') closePlayerDetailView(); });
  document.getElementById('quickScoreboardBtn')?.addEventListener('click', openQuickScoreboardView);
  document.getElementById('quickScoreboardCloseBtn')?.addEventListener('click', closeQuickScoreboardView);
  document.getElementById('quickScoreboardDialog')?.addEventListener('click', e => { if (e.target?.id === 'quickScoreboardDialog') closeQuickScoreboardView(); });
  document.getElementById('score')?.addEventListener('click', async e => {
    const playerDetailBtn = e.target.closest('[data-player-detail]');
    if (playerDetailBtn) {
      openPlayerDetailView(playerDetailBtn.dataset.playerDetail);
      return;
    }
    if (e.target.closest('#addMemoryBtn')) { openAddMemoryModal(); return; }
    if (e.target.closest('[data-score-locked="1"], .score-row-readonly')) {
      const match = getActiveMatch();
      if (match?.storageMode === 'shared' && isAssignedPlayersMode(match)) toast('You can only score your assigned players.');
    }
    const copyBtn = e.target.closest('[data-copy-shared-code]');
    if (copyBtn) {
      const code = copyBtn.dataset.copySharedCode || '';
      if (code && navigator.clipboard) {
        try { await navigator.clipboard.writeText(code); toast('Match code copied.'); }
        catch { toast(code); }
      } else if (code) toast(code);
      return;
    }
    if (e.target.closest('#syncSharedMatchNowBtn')) {
      const match = getActiveMatch();
      if (!match?.sharedMatchId) return toast('No shared match is active.');
      await flushSharedMatchSync(match.id, { silent: false });
      await refreshActiveSharedParticipants({ silent: true });
      await refreshActiveSharedScores({ silent: true });
      renderCurrentMatch();
    }
  });
  document.getElementById('score')?.addEventListener('change', async e => {
    if (!e.target.matches('[data-shared-player-assignment]')) return;
    const match = getActiveMatch();
    if (!match || !isCurrentDeviceMatchHost(match)) return;
    const ok = await setSharedPlayerAssignment(match, e.target.dataset.sharedPlayerAssignment, e.target.value);
    if (!ok) return renderCurrentMatch();
    renderCurrentMatch();
  });
  document.getElementById('finishRoundBtn').addEventListener('click', armFinishRound);
  document.getElementById('confirmFinishRoundBtn').addEventListener('click', completeActiveRound);
  document.getElementById('roundCompleteFinishBtn')?.addEventListener('click', finishRoundFromPrompt);
  document.getElementById('roundCompleteReviewBtn')?.addEventListener('click', reviewFinalHoleFromPrompt);
  document.getElementById('roundEndPrimaryBtn')?.addEventListener('click', handleRoundEndPrimary);
  document.getElementById('roundEndSecondaryBtn')?.addEventListener('click', handleRoundEndSecondary);
  const scoreboardFinishRoundBtn = document.getElementById('scoreboardFinishRoundBtn');
  if (scoreboardFinishRoundBtn) scoreboardFinishRoundBtn.addEventListener('click', handleScoreboardFinishEndRound);
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
    currentHole = Math.max(1, Math.min(getPlayableHoleCount(match, getTee(match.courseId, match.teeId)) || 18, holeNo));
    if (getPlayableHoleCount(match, getTee(match.courseId, match.teeId)) === 18) currentHoleSequenceStart = currentHole;
    queueScoreCommitFocus(playerId, currentHole);
    activateTab('score');
    renderCurrentMatch();
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

  const pwaCheckBtn = document.getElementById('pwaCheckForUpdatesBtn');
  if (pwaCheckBtn) pwaCheckBtn.addEventListener('click', checkForPwaUpdates);
  const pwaRefreshBtn = document.getElementById('pwaRefreshNowBtn');
  if (pwaRefreshBtn) pwaRefreshBtn.addEventListener('click', refreshPwaNow);
  const pwaResetBtn = document.getElementById('pwaResetCacheBtn');
  if (pwaResetBtn) pwaResetBtn.addEventListener('click', resetDyeLedgerAppCache);
}



function getBuildInfoSnapshot() {
  const swSupported = 'serviceWorker' in navigator;
  const controller = swSupported ? navigator.serviceWorker.controller : null;
  const registration = window.dyeLedgerServiceWorkerRegistration || swRegistration || null;
  const active = registration?.active || controller || null;
  return {
    appVersion: APP_VERSION,
    buildTimestamp: BUILD_TIMESTAMP,
    buildLabel: BUILD_LABEL,
    url: window.location.href,
    urlVersion: getUrlVersionDiagnostic(),
    userAgent: navigator.userAgent,
    serviceWorkerSupported: swSupported,
    serviceWorkerControlled: !!controller,
    serviceWorkerControllerScriptURL: controller?.scriptURL || active?.scriptURL || null,
    updateAvailable: !!window.dyeLedgerUpdateAvailable,
    activeCacheName: APP_CACHE_NAME,
    activeServiceWorkerState: active?.state || (registration?.waiting ? 'waiting' : 'unknown'),
    cacheKeys: 'pending'
  };
}

async function getDyeLedgerBuildInfo() {
  const info = getBuildInfoSnapshot();
  if (!('caches' in window)) {
    info.cacheKeys = 'Cache API unavailable';
    return info;
  }
  try {
    info.cacheKeys = await caches.keys();
  } catch (err) {
    info.cacheKeys = `Could not read cache keys: ${err?.message || err}`;
  }
  return info;
}

function getDyeLedgerScrollInfo() {
  const html = document.documentElement;
  const body = document.body;
  const main = document.querySelector('main');
  const chrome = document.querySelector('.app-chrome');
  const htmlStyle = html ? getComputedStyle(html) : null;
  const bodyStyle = body ? getComputedStyle(body) : null;
  const mainStyle = main ? getComputedStyle(main) : null;
  const chromeStyle = chrome ? getComputedStyle(chrome) : null;
  return {
    scrollY: window.scrollY,
    documentScrollHeight: Math.max(html?.scrollHeight || 0, body?.scrollHeight || 0),
    viewportHeight: window.innerHeight,
    bodyOverflow: bodyStyle ? `${bodyStyle.overflowX} / ${bodyStyle.overflowY}` : null,
    htmlOverflow: htmlStyle ? `${htmlStyle.overflowX} / ${htmlStyle.overflowY}` : null,
    mainOverflow: mainStyle ? `${mainStyle.overflowX} / ${mainStyle.overflowY}` : null,
    mainClientHeight: main?.clientHeight || null,
    mainScrollHeight: main?.scrollHeight || null,
    activeElement: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}#${document.activeElement.id || ''}.${document.activeElement.className || ''}` : null,
    appChromePosition: chromeStyle?.position || null,
    appChromeHeight: chrome ? Math.ceil(chrome.getBoundingClientRect().height || 0) : null
  };
}

function logDyeLedgerBuildInfo() {
  const info = getBuildInfoSnapshot();
  console.log('[BuildInfo] The Dye Ledger');
  console.log('[BuildInfo] Version:', info.appVersion);
  console.log('[BuildInfo] Build:', info.buildTimestamp);
  console.log('[BuildInfo] URL:', info.url);
  console.log('[BuildInfo] Service Worker controller:', info.serviceWorkerControlled ? 'yes' : 'no');
}

window.getDyeLedgerBuildInfo = getDyeLedgerBuildInfo;
window.getDyeLedgerScrollInfo = getDyeLedgerScrollInfo;

function getServiceWorkerDiagnosticSnapshot() {
  const supported = 'serviceWorker' in navigator;
  const registration = window.dyeLedgerServiceWorkerRegistration || swRegistration || null;
  const controller = supported ? navigator.serviceWorker.controller : null;
  const installing = registration?.installing || null;
  const waiting = registration?.waiting || null;
  const active = registration?.active || null;
  const workerState = installing?.state ? `Installing (${installing.state})`
    : waiting?.state ? `Waiting (${waiting.state})`
    : active?.state ? `Active (${active.state})`
    : controller?.state ? `Controller (${controller.state})`
    : 'None';
  return { supported, registration, controller, installing, waiting, active, workerState };
}



function getMatchSetupValidationState({ fd = null, selectedPlayers = null, selectedGames = null, existing = null, sharedMatchEnabled = false, scoringAccessMode = '' } = {}) {
  const form = document.getElementById('matchForm');
  const formData = fd || (form ? new FormData(form) : null);
  const active = getActiveMatch();
  const teamCount = formData ? (Number(formData.get('teamCount')) || 1) : (Number(active?.teamCount) || 1);
  const playersPerTeam = formData ? (Number(formData.get('playersPerTeam')) || 1) : (Number(active?.playersPerTeam) || 1);
  const courseId = String(formData?.get('courseId') || active?.courseId || '').trim();
  const players = Array.isArray(selectedPlayers) ? selectedPlayers : (form ? getSelectedPlayersFromSetup() : (Array.isArray(active?.players) ? active.players : []));
  const games = Array.isArray(selectedGames) ? selectedGames : (form ? collectSelectedGames() : (active?.selectedGames || []));
  const requestedHoleCount = formData ? (Number(formData.get('holeCount')) === 9 ? 9 : 18) : (active ? getRequestedHoleCount(active) : 0);
  const teeId = String(formData?.get('teeId') || document.getElementById('matchTeeSelect')?.value || active?.teeId || players[0]?.teeId || '').trim();
  const normalizedMode = normalizeScoringAccessMode(scoringAccessMode || formData?.get('scoreEntryMode') || active?.scoringAccessMode || 'single_device');
  const isShared = !!sharedMatchEnabled || active?.storageMode === 'shared' || normalizedMode === 'assigned_players';
  const missing = [];
  const warnings = [];
  const uniqueIds = new Set(players.map(p => p.playerId).filter(Boolean));
  if ((teamCount * playersPerTeam) > 32) missing.push('Limit is 32 total players');
  if (!courseId) missing.push('Course selection');
  if (!teeId && !players.some(p => p.teeId)) missing.push('Tee selection');
  if (players.length < 1) missing.push('At least one player');
  if (players.length !== uniqueIds.size) missing.push('Each player can only be selected once');
  if (players.some(p => !p.teeId)) missing.push('A tee for each player');
  if (![9, 18].includes(Number(requestedHoleCount))) missing.push('Selected holes');
  if (games.length > 5) missing.push('Select up to 5 gambling games');
  if (games.some(g => g.key === 'nassau') && teamCount !== 2) missing.push('Nassau requires exactly 2 teams');
  if (games.some(g => ['team_match','team_stroke'].includes(g.key)) && teamCount < 2) missing.push('Team games require at least 2 teams');
  if (games.some(g => g.key === 'nine_point') && players.length < 3) missing.push('9-Point Game requires at least 3 assigned players');
  if (games.some(g => g.key === 'nine_point' && (!Array.isArray(g.playerIds) || [...new Set(g.playerIds)].length !== 3))) missing.push('Select 3 players for the 9-Point Game');
  if (games.some(g => g.key === 'sneaky_sandy_poley')) missing.push(...getSneakySandyPoleyTeamWarnings({ teamCount, playersPerTeam, players }));
  return {
    ready: missing.length === 0,
    missingRequirements: [...new Set(missing)],
    warnings,
    summary: {
      courseSelected: !!courseId,
      teeSelected: !!teeId || players.every(p => p.teeId),
      playerCount: players.length,
      selectedHoles: requestedHoleCount,
      sharedMatch: !!isShared,
      assignmentsComplete: isShared ? (normalizedMode === 'assigned_players' ? 'Host default/managed' : 'N/A') : 'N/A',
      roundStarted: matchHasStarted(active)
    }
  };
}

function getMatchSetupDiagnosticSnapshot() {
  try {
    const validation = (document.getElementById('matchForm') ? getMatchSetupValidationState() : (window.dyeLedgerLastMatchSetupValidation || null));
    const active = getActiveMatch();
    if (validation) return validation;
    return {
      ready: false,
      missingRequirements: ['Match form not currently open'],
      summary: {
        courseSelected: !!active?.courseId,
        teeSelected: !!active?.teeId,
        playerCount: Array.isArray(active?.players) ? active.players.length : 0,
        selectedHoles: active ? getRequestedHoleCount(active) : 0,
        sharedMatch: active?.storageMode === 'shared',
        assignmentsComplete: active?.storageMode === 'shared' ? 'Review Shared Match' : 'N/A',
        roundStarted: matchHasStarted(active)
      }
    };
  } catch (err) {
    return { ready: false, missingRequirements: [err?.message || 'Unable to read setup state'], summary: {} };
  }
}

function renderMatchSetupDiagnosticsUi() {
  const box = document.getElementById('matchSetupDiagnosticsMore');
  if (!box) return;
  const diag = getMatchSetupDiagnosticSnapshot();
  const summary = diag.summary || {};
  const missing = diag.missingRequirements || [];
  box.innerHTML = `
    <details>
      <summary><strong>Match Setup Diagnostics</strong> — ${diag.ready ? 'Ready' : 'Not Ready'}</summary>
      <div class="app-update-summary top-gap">
        <div><span class="muted-label">Course Selected</span><strong>${summary.courseSelected ? 'Yes' : 'No'}</strong></div>
        <div><span class="muted-label">Tee Selected</span><strong>${summary.teeSelected ? 'Yes' : 'No'}</strong></div>
        <div><span class="muted-label">Players</span><strong>${Number(summary.playerCount || 0)}</strong></div>
        <div><span class="muted-label">Selected Holes</span><strong>${Number(summary.selectedHoles || 0) || 'None'}</strong></div>
        <div><span class="muted-label">Shared Match</span><strong>${summary.sharedMatch ? 'Yes' : 'No'}</strong></div>
        <div><span class="muted-label">Assignments Complete</span><strong>${escapeHtml(summary.assignmentsComplete || 'N/A')}</strong></div>
        <div><span class="muted-label">Round Started</span><strong>${summary.roundStarted ? 'Yes' : 'No'}</strong></div>
        <div><span class="muted-label">Match Finalization State</span><strong>${diag.ready ? 'Ready' : 'Not Ready'}</strong></div>
      </div>
      ${missing.length ? `<div class="tiny warning-text top-gap">Missing Requirements:<br>${missing.map(m => `• ${escapeHtml(m)}`).join('<br>')}</div>` : '<div class="tiny top-gap">No setup validation issues detected.</div>'}
    </details>`;
  box.classList.remove('hidden');
}

function renderBuildInfoUi() {
  const sw = getServiceWorkerDiagnosticSnapshot();
  renderMatchSetupDiagnosticsUi();
  const cacheName = APP_CACHE_NAME;
  const pageControl = sw.supported ? (sw.controller ? 'Controlled' : 'Not controlled yet') : 'Unsupported';
  const updateAvailable = !!(window.dyeLedgerUpdateAvailable || sw.waiting);
  const values = {
    appBuildTimestamp: formatBuildDateET(BUILD_TIMESTAMP),
    appBuildLabel: BUILD_LABEL,
    appCurrentUrl: window.location.href,
    appServiceWorkerStatus: sw.supported ? 'Supported' : 'Unsupported',
    appPageControlStatus: pageControl,
    appWorkerStateStatus: sw.workerState,
    appActiveCacheName: cacheName,
    appUrlVersionStatus: getUrlVersionDiagnostic() || 'Not used',
    appCacheMatchesStatus: 'Checking…',
    appVersionConsistencyStatus: 'Checking…',
    appUpdateAvailableStatus: updateAvailable ? 'Yes' : (pwaUpdateStatusMessage === 'Checking…' ? 'Checking…' : 'No'),
    appLastUpdateCheck: lastPwaUpdateCheckAt ? formatTimestampET(lastPwaUpdateCheckAt) : 'Not checked yet',
    appUpdateStatusMessage: pwaUpdateStatusMessage || 'Not checked yet',
    appVersionFooterBuild: formatBuildDateET(BUILD_TIMESTAMP),
    appCacheGuidance: sw.supported
      ? (sw.controller ? 'Use Check for Updates, then Refresh Now if a new build is available. Reset App Cache preserves saved matches and local courses.' : 'This page is not currently controlled by the service worker. Refresh Now or Reset App Cache may be needed.')
      : 'Service worker unavailable in this browser.'
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
  const footerBuild = document.getElementById('appVersionFooterBuild');
  if (footerBuild) footerBuild.title = `${BUILD_LABEL} · ${formatBuildDateET(BUILD_TIMESTAMP)} · ${window.location.href}`;

  if ('caches' in window) {
    caches.keys().then(keys => {
      const appCaches = keys.filter(key => key.includes('the-dye-ledger'));
      const cacheEl = document.getElementById('appActiveCacheName');
      if (cacheEl) cacheEl.textContent = appCaches.length ? appCaches.join(', ') : cacheName;
      const consistency = getVersionConsistencyStatus({ sw, appCaches });
      const matchEl = document.getElementById('appCacheMatchesStatus');
      if (matchEl) matchEl.textContent = appCaches.includes(cacheName) ? 'Yes' : (appCaches.length ? 'No' : 'Not cached yet');
      const urlEl = document.getElementById('appUrlVersionStatus');
      if (urlEl) urlEl.textContent = consistency.urlVersion || 'Not used';
      const consistencyEl = document.getElementById('appVersionConsistencyStatus');
      if (consistencyEl) consistencyEl.textContent = consistency.ok ? 'OK' : 'Warning';
      const warning = document.getElementById('appUpdateWarning');
      if (warning) {
        warning.classList.toggle('hidden', consistency.ok);
        warning.textContent = consistency.ok ? '' : `Warning: The app may be running stale cached files. ${consistency.warnings.join(' ')} Tap Refresh Now. If the warning remains, use Reset App Cache.`;
      }
    }).catch(() => {});
  }
}

let swRegistration = null;
let appUpdateBannerVisible = false;
let hasReloadedForServiceWorker = false;
let userRequestedAppReload = false;
let forceUnsafeAppReload = false;
let pendingDeferredAppReload = false;
let lastPwaUpdateCheckAt = null;
let pwaUpdateStatusMessage = 'Not checked yet';

function updateVersionUi() {
  const loadSharedMatchBtn = document.getElementById('loadSharedMatchBtn');
  if (loadSharedMatchBtn) loadSharedMatchBtn.addEventListener('click', async () => {
    const input = document.getElementById('sharedMatchIdInput');
    const matchId = normalizeMatchCode(input?.value || '');
    if (!matchId) return toast('Enter a shared match code or ID.');
    try {
      const joined = await loadSharedMatchFromCloud(matchId, { activate: true, silent: false });
      setupWorkflowMode = 'join';
      showSharedJoinConfirmation(joined);
      startSharedConnectionFastRefresh({ reason: 'joined-device-waiting-assignment' });
      activateTab('setup');
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
  renderBuildInfoUi();
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

function showUpdateBanner(options = {}) {
  window.dyeLedgerUpdateAvailable = true;
  if (options.deferred) pendingDeferredAppReload = true;
  setUpdateBannerContent({ deferred: !!options.deferred || pendingDeferredAppReload });
  renderBuildInfoUi();
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.remove('hidden');
  appUpdateBannerVisible = true;
}

function hideUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.add('hidden');
  appUpdateBannerVisible = false;
}


function setUpdateBannerContent({ deferred = false } = {}) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  const title = banner.querySelector('.update-banner-copy strong');
  const copy = banner.querySelector('.update-banner-copy span');
  const action = document.getElementById('updateNowBtn');
  if (deferred) {
    if (title) title.textContent = 'Update ready';
    if (copy) copy.textContent = 'Refresh when you are done with match setup or scoring.';
    if (action) action.textContent = 'Refresh Now Anyway';
  } else {
    if (title) title.textContent = 'New version available';
    if (copy) copy.textContent = 'Refresh to update to the latest build.';
    if (action) action.textContent = 'Update';
  }
}

function getActivePanelId() {
  return document.querySelector('.panel.active')?.id || '';
}

function hasOpenBlockingUi() {
  return Array.from(document.querySelectorAll('.modal-backdrop')).some(el => !el.classList.contains('hidden'));
}

function hasUnsavedVisibleScoreInputs() {
  const match = getActiveMatch();
  if (!match || getActivePanelId() !== 'score') return false;
  const inputs = Array.from(document.querySelectorAll('input[data-score-player]'));
  if (!inputs.length) return false;
  return inputs.some(input => {
    const playerId = input.dataset.scorePlayer;
    const player = match.players?.find(p => p.id === playerId || p.playerId === playerId);
    const saved = player?.scores?.[Math.max(0, currentHole - 1)]?.gross;
    const shown = String(input.value || '').trim();
    const savedText = saved == null || saved === '' ? '' : String(saved);
    return shown !== savedText;
  });
}

function hasUnsafeReloadContext() {
  const activePanel = getActivePanelId();
  const activeMatch = getActiveMatch();
  if (newMatchStartInProgress || cleanNewMatchSetupInProgress) return true;
  if (uiState.scorecardImportLoading || uiState.cloudCoursesLoading) return true;
  if (hasOpenBlockingUi()) return true;
  if (activePanel === 'setup' && (setupWorkflowMode === 'create' || setupWorkflowMode === 'join' || editingMatchId)) return true;
  if (activePanel === 'score') return true;
  if (hasUnsavedVisibleScoreInputs()) return true;
  if (activeMatch && activeMatch.status !== 'complete' && activePanel !== 'more') return true;
  return false;
}

function showReloadDeferredMessage() {
  pendingDeferredAppReload = true;
  pwaUpdateStatusMessage = 'Update ready. Refresh when you are done with match setup or scoring.';
  setUpdateBannerContent({ deferred: true });
  showUpdateBanner({ deferred: true });
  renderBuildInfoUi();
  toast('Update ready. Refresh when you are done with match setup or scoring.');
}

function reloadOnceSafely({ force = false } = {}) {
  if (hasReloadedForServiceWorker) return;
  if (!force && hasUnsafeReloadContext()) {
    showReloadDeferredMessage();
    return;
  }
  hasReloadedForServiceWorker = true;
  pendingDeferredAppReload = false;
  window.location.reload();
}

async function checkForPwaUpdates() {
  pwaUpdateStatusMessage = 'Checking…';
  lastPwaUpdateCheckAt = new Date().toISOString();
  renderBuildInfoUi();
  const result = await forceDyeLedgerUpdateCheck();
  const sw = getServiceWorkerDiagnosticSnapshot();
  if (!result.supported) {
    pwaUpdateStatusMessage = 'Service worker not supported in this browser.';
  } else if (result.error) {
    pwaUpdateStatusMessage = `Update check failed — ${result.error}`;
  } else if (sw.waiting || window.dyeLedgerUpdateAvailable) {
    window.dyeLedgerUpdateAvailable = true;
    pwaUpdateStatusMessage = 'Update available. Tap Refresh Now.';
  } else if (!sw.controller) {
    pwaUpdateStatusMessage = 'Service worker not controlling this page yet. Tap Refresh Now.';
  } else {
    pwaUpdateStatusMessage = 'App is up to date.';
  }
  renderBuildInfoUi();
  toast(pwaUpdateStatusMessage);
}

async function refreshPwaNow(options = {}) {
  userRequestedAppReload = true;
  forceUnsafeAppReload = !!options.force;
  if (!forceUnsafeAppReload && hasUnsafeReloadContext()) {
    showReloadDeferredMessage();
    return;
  }
  pwaUpdateStatusMessage = 'Refreshing…';
  renderBuildInfoUi();
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) hookServiceWorkerRegistration(registration);
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => reloadOnceSafely({ force: forceUnsafeAppReload }), 1200);
      return;
    }
    if (registration) {
      await registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => reloadOnceSafely({ force: forceUnsafeAppReload }), 1200);
        return;
      }
    }
  } catch (err) {
    console.warn('[PWA] Refresh Now update check failed:', err);
  }
  reloadOnceSafely({ force: forceUnsafeAppReload });
}

async function resetDyeLedgerAppCache() {
  const ok = window.confirm('Reset downloaded app files and reload?\n\nThis may help if the app is stuck on an old version. Saved matches, local courses, players, and scores will remain on this device.');
  if (!ok) return;
  userRequestedAppReload = true;
  forceUnsafeAppReload = true;
  pwaUpdateStatusMessage = 'Resetting app cache…';
  renderBuildInfoUi();
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.includes('the-dye-ledger')).map(key => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(reg => reg.scope && reg.scope.startsWith(window.location.origin)).map(reg => reg.unregister()));
    }
  } catch (err) {
    console.warn('[PWA] Reset App Cache failed:', err);
  }
  const base = window.location.pathname || './';
  window.location.href = `${base}?refresh=${Date.now()}`;
}

function triggerAppUpdate() {
  refreshPwaNow({ force: pendingDeferredAppReload });
}

function hookServiceWorkerRegistration(registration) {
  if (!registration) return;
  swRegistration = registration;
  window.dyeLedgerServiceWorkerRegistration = registration;
  if (registration.waiting) showUpdateBanner();
  renderBuildInfoUi();

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }
      renderBuildInfoUi();
    });
  });
}

async function forceDyeLedgerUpdateCheck() {
  const result = {
    supported: 'serviceWorker' in navigator,
    registrationsChecked: 0,
    updateAvailable: !!window.dyeLedgerUpdateAvailable,
    serviceWorkerControlled: !!navigator.serviceWorker?.controller,
    error: null
  };
  if (!result.supported) return result;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    result.registrationsChecked = registrations.length;
    for (const reg of registrations) {
      hookServiceWorkerRegistration(reg);
      await reg.update();
      if (reg.waiting) showUpdateBanner();
    }
    result.updateAvailable = !!window.dyeLedgerUpdateAvailable;
    return result;
  } catch (err) {
    result.error = err?.message || String(err);
    return result;
  }
}

window.forceDyeLedgerUpdateCheck = forceDyeLedgerUpdateCheck;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${BUILD_INFO.versionNumber}`, { scope: './' });
      hookServiceWorkerRegistration(registration);
      await forceDyeLedgerUpdateCheck();
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        renderBuildInfoUi();
        if (!userRequestedAppReload) {
          pwaUpdateStatusMessage = 'Service worker updated. Tap Refresh Now when you are ready.';
          renderBuildInfoUi();
          return;
        }
        reloadOnceSafely({ force: forceUnsafeAppReload });
      });
    } catch (error) {
      console.warn('[BuildInfo] Service worker registration/update check failed:', error);
      // Keep the app fully usable if service worker registration fails.
    }
  });
}

function installDyeLedgerLiveEngineAdapter() {
  window.__DYE_LEDGER_LIVE_ENGINE__ = {
    version: APP_VERSION,
    versionNumber: APP_VERSION_NUMBER,
    seedState(seed = {}) {
      state.players = Array.isArray(seed.players) ? seed.players : [];
      state.courses = Array.isArray(seed.courses) ? seed.courses : [];
      state.matches = Array.isArray(seed.matches) ? seed.matches : [];
      state.activeMatchId = seed.activeMatchId || state.matches[0]?.id || null;
      normalizeState();
      return state;
    },
    createEmptyMatch,
    normalizeMatch,
    computeMatchMetrics,
    computeLivePayoutGames,
    getPayoutReportContext,
    optimalSettlementRows,
    computeTeamGameDiffs,
    computeNassauDiffsForBasis,
    computeSkinResults,
    computeNinePointResults,
    buildSneakySandyPoleyLedger,
    normalizeSneakySandyPoleyHoleInput,
    buildSneakySandyPoleyMomentumData,
    getSneakySandyPoleySmartTrend,
    formatToPar,
    getPrimaryMatchStatusLine,
    getSneakySandyPoleyHonorsLine,
    buildSneakySandyPoleyRunningText,
    buildQuickScoreboardView,
    buildSneakySandyPoleyExportSummary,
    buildSneakySandyPoleyAuditDetail,
    buildExportMomentum,
    buildRoundRecord,
    buildRoundRecordEvents,
    buildRoundRecordStory,
    buildRoundSnapshot,
    buildExecutiveDriverRows,
    buildSelectedGamesSummary,
    buildSummaryExportBody,
    decorateReportSections,
    resolveSneakySandyPoleyProxSelection,
    buildSharedSspFacts,
    reconcileSharedSspFacts,
    applySharedSspFacts,
    getMatchCourse,
    getMatchTee,
    getCourseSnapshotForMatch,
    normalizeCourseIdentityText,
    isSameCourseIdentity,
    findLikelyDuplicateCourses,
    getDedupedCourseOptions,
    getPlayerHoleTeeInfo,
    buildScorecardImportRequestBody,
    getScorecardImportReviewWarnings,
    getScorecardImportSaveGuard,
    updateScorecardImportStatus,
    isCompletedSummarySession,
    formatRoundDuration,
    ensureRoundTimingStarted,
    ensureRoundTimingEnded,
    recordHoleFirstCompletedAt,
    getRoundElapsedTimeState,
    formatRoundWeatherDisplay,
    getRoundCompletionState,
    buildRoundStatusSummary,
    getFeaturedCompetitionResult,
    buildClassicScorecard,
  };
  return window.__DYE_LEDGER_LIVE_ENGINE__;
}

if (DYE_LEDGER_ADAPTER_MODE) {
  installDyeLedgerLiveEngineAdapter();
} else {
  cleanupStaleUrlVersionParameter();
  logDyeLedgerBuildInfo();
  registerServiceWorker();
}


function resetHorizontalViewportPosition() {
  // v30.3.8: horizontal drift is now prevented in CSS (html,body{overflow-x:hidden}),
  // so we only nudge any stray horizontal scroll back to the left edge. We must NOT
  // call window.scrollTo here: under the old fixed-shell layout the vertical scroll
  // churn (rAF + timed re-runs) fired on score-input focus and could swallow the
  // first tap that should raise the iOS keyboard [Defect 2].
  const root = document.documentElement;
  const body = document.body;
  if (root && root.scrollLeft) root.scrollLeft = 0;
  if (body && body.scrollLeft) body.scrollLeft = 0;
}

function installViewportStabilityGuards() {
  const resetSoon = () => {
    resetHorizontalViewportPosition();
    window.requestAnimationFrame(resetHorizontalViewportPosition);
    window.setTimeout(resetHorizontalViewportPosition, 60);
    window.setTimeout(resetHorizontalViewportPosition, 250);
  };
  window.addEventListener('resize', resetSoon, { passive: true });
  window.addEventListener('orientationchange', resetSoon, { passive: true });
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('#score') && !target.matches?.('input[data-score-player]')) resetSoon();
  });
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('#score')) resetSoon();
  }, { passive: true });
  document.addEventListener('scroll', () => {
    if (document.documentElement.scrollLeft || document.body.scrollLeft) {
      resetHorizontalViewportPosition();
    }
  }, { passive: true, capture: true });
}


function updateAppChromeHeight() {
  const chrome = document.querySelector('.app-chrome');
  if (!chrome) return;
  const height = Math.ceil(chrome.getBoundingClientRect().height || 0);
  if (height > 0) document.documentElement.style.setProperty('--app-chrome-height', `${height}px`);
}

function installAppChromeHeightSync() {
  updateAppChromeHeight();
  window.addEventListener('load', updateAppChromeHeight, { passive: true });
  window.addEventListener('resize', updateAppChromeHeight, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(updateAppChromeHeight, 120), { passive: true });
  if ('ResizeObserver' in window) {
    const chrome = document.querySelector('.app-chrome');
    if (chrome) new ResizeObserver(updateAppChromeHeight).observe(chrome);
  }
}

if (!DYE_LEDGER_ADAPTER_MODE) {
  installViewportStabilityGuards();
  installAppChromeHeightSync();

  installHandlers();
  renderHoleRows();
  loadPlayerEditor(null);
  loadCourseEditor(null);
  loadTeeEditor(null, null);
  loadMatchEditor(null);
  setupWorkflowMode = getActiveMatch() ? 'create' : 'landing';
  updateVersionUi();
  renderAll();
  if (hasSupabaseConfig()) {
    window.setTimeout(() => refreshCourseLibraryFromCloud({ silent: true, force: true }), 250);
  }
  resumeActiveSharedMatchOnStartup();
}


/* v30.2 placeholders: Shared Memories, Round Story, editable story workflow, <=350 words target */
