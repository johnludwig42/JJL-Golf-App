import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { cloneJson, normalizeRound, roundMoney, validateRound } from './simulation-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_PATH = path.resolve(__dirname, '..', 'app.js');

const LIVE_FUNCTIONS_USED = [
  'normalizeMatch',
  'computeMatchMetrics',
  'computeLivePayoutGames',
  'getPayoutReportContext',
  'optimalSettlementRows',
  'computeTeamGameDiffs',
  'computeNassauDiffsForBasis',
  'computeSkinResults',
  'computeNinePointResults',
];

const MIRRORED_FUNCTIONS_STILL_USED = [
  'Simulation fixture generation and normalization',
  'Simulation invariant checks',
  'Live-vs-mirror comparison classification',
];

const UNSUPPORTED_LIVE_AREAS = [
  'Browser-rendered Match Summary markup',
  'Actual localStorage save/reload I/O',
  'Shared Match cloud sync and two-device browser behavior',
  'Manual iPhone PWA service-worker lifecycle',
];

function createBrowserShim() {
  const sandbox = { console, setTimeout, clearTimeout, Math, Date, Intl, URL, URLSearchParams };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__ = true;
  sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  sandbox.navigator = { userAgent: 'node-live-engine-adapter', serviceWorker: null };
  sandbox.location = { href: 'http://localhost/live-engine-adapter', pathname: '/' };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.requestAnimationFrame = cb => setTimeout(cb, 0);
  sandbox.cancelAnimationFrame = id => clearTimeout(id);
  sandbox.ResizeObserver = class { observe() {} disconnect() {} };
  sandbox.CSS = { escape: value => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') };
  sandbox.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      appendChild() {},
      removeChild() {},
      select() {},
    }),
    documentElement: { style: { setProperty() {} }, scrollLeft: 0 },
    body: { style: {}, appendChild() {}, removeChild() {}, scrollLeft: 0 },
    fonts: null,
  };
  return sandbox;
}

export function loadLiveEngine(appPath = DEFAULT_APP_PATH) {
  const sandbox = createBrowserShim();
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(appPath, 'utf8'), sandbox, { filename: appPath });
  if (!sandbox.__DYE_LEDGER_LIVE_ENGINE__) {
    throw new Error('Live engine adapter failed to load from app.js.');
  }
  return sandbox.__DYE_LEDGER_LIVE_ENGINE__;
}

function toLiveSelectedGame(cfg = {}) {
  if (cfg.key === 'match_play') {
    return { ...cfg, key: 'team_match', basis: cfg.basis || 'net', stake: Number(cfg.stake || 0) };
  }
  return { ...cfg };
}

export function buildLiveMatchFromRound(roundInput) {
  const round = normalizeRound(roundInput);
  const courseId = `course-${round.scenario || 'simulation'}`;
  const teeId = `${courseId}-tee`;
  const holes = (round.course.holes || []).map((hole, idx) => ({
    holeNumber: Number(hole.holeNumber) || idx + 1,
    par: Number(hole.par) || 4,
    strokeIndex: Number(hole.strokeIndex) || idx + 1,
    yardage: Number(hole.yardage) || null,
  }));
  const course = {
    id: courseId,
    name: round.course.name || 'Simulation National',
    city: 'Simulation',
    state: 'Lab',
    country: 'United States of America',
    tees: [{
      id: teeId,
      courseName: round.course.name || 'Simulation National',
      teeName: round.course.teeName || 'Ledger',
      rating: Number(round.course.rating) || 72,
      slope: Number(round.course.slope) || 113,
      par: Number(round.course.par) || 72,
      holes,
    }],
  };
  const players = round.players.map(player => ({ id: player.id, name: player.name, index: Number(player.index || 0) }));
  const teamNames = (round.teams || []).sort((a, b) => Number(a.team) - Number(b.team)).map(team => team.name || `Team ${team.team}`);
  const match = {
    id: `match-${round.scenario || 'simulation'}`,
    date: '2026-07-08',
    name: round.scenario || 'Simulation Round',
    courseId,
    teeId,
    format: 'teams',
    allowance: Number(round.allowance || 100),
    holeCount: Number(round.holeCount) === 9 ? 9 : 18,
    nineHoleSegment: 'front',
    teamCount: Math.max(1, new Set(round.players.map(player => Number(player.team) || 1)).size),
    playersPerTeam: Math.max(1, Math.ceil(round.players.length / Math.max(1, new Set(round.players.map(player => Number(player.team) || 1)).size))),
    teamNames,
    selectedGames: (round.selectedGames || []).map(toLiveSelectedGame),
    scoringAccessMode: round.scoringAccessMode || 'single_device',
    sharedParticipants: cloneJson(round.sharedParticipants || []),
    sharedPlayerAssignments: cloneJson(round.sharedAssignments || {}),
    players: round.players.map((player, idx) => ({
      playerId: player.id,
      team: Number(player.team) || 1,
      slot: idx,
      teeId,
      scores: Array.from({ length: Number(round.holeCount) || 18 }, (_, holeIdx) => ({
        holeNumber: holeIdx + 1,
        gross: Number(round.scores?.[player.id]?.[holeIdx]) || null,
      })),
    })),
  };
  return { round, course, players, match };
}

function normalizeAmounts(amounts = {}) {
  return Object.fromEntries(Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b)).map(([id, amount]) => [id, roundMoney(amount)]));
}

function normalizeSettlementRows(rows = []) {
  return rows.map(row => ({ from: row.from, to: row.to, amount: roundMoney(row.amount) })).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.amount - b.amount);
}

function normalizeLiveGameKey(game = {}) {
  if (game.key === 'team_match' || game.sourceKey === 'team_match') return 'match_play';
  if (game.sourceKey === 'skins') return 'skins';
  if (game.sourceKey === 'net_skins') return 'net_skins';
  if (game.sourceKey === 'nassau') return 'nassau';
  return game.sourceKey || game.key;
}

export function evaluateRoundWithLiveEngine(roundInput, options = {}) {
  const engine = options.engine || loadLiveEngine(options.appPath);
  const liveMatch = buildLiveMatchFromRound(roundInput);
  const match = engine.seedState({ courses: [liveMatch.course], players: liveMatch.players, matches: [liveMatch.match], activeMatchId: liveMatch.match.id }).matches[0];
  const metrics = engine.computeMatchMetrics(match);
  const context = engine.getPayoutReportContext(match, metrics);
  const finalTotals = normalizeAmounts(context.finalTotals || {});
  const games = (context.payoutGames || []).map(game => ({
    key: normalizeLiveGameKey(game),
    liveKey: game.key,
    sourceKey: game.sourceKey || game.key,
    label: game.label,
    amounts: normalizeAmounts(game.amounts || {}),
    paymentLines: normalizeSettlementRows(game.paymentLines || []),
    meta: game.meta || {},
  }));
  return {
    adapterMode: 'vm-app-js',
    coverage: getLiveAdapterCoverage(),
    round: liveMatch.round,
    match,
    metrics,
    games,
    finalTotals,
    settlementRows: normalizeSettlementRows(engine.optimalSettlementRows(context.finalTotals || {})),
  };
}

function diffJson(label, a, b) {
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${label} differed.`];
}

export function compareRoundWithLiveEngine(roundInput, options = {}) {
  const mirror = validateRound(roundInput);
  const live = evaluateRoundWithLiveEngine(roundInput, options);
  const differences = [
    ...diffJson('Final totals', normalizeAmounts(mirror.payout.finalTotals), live.finalTotals),
    ...diffJson('Final settlement rows', normalizeSettlementRows(mirror.payout.settlementRows), live.settlementRows),
  ];
  const mirrorGames = Object.fromEntries(mirror.payout.games.map(game => [game.key, normalizeAmounts(game.amounts || {})]));
  const liveGames = Object.fromEntries(live.games.map(game => [game.key, normalizeAmounts(game.amounts || {})]));
  [...new Set([...Object.keys(mirrorGames), ...Object.keys(liveGames)])].sort().forEach(key => {
    differences.push(...diffJson(`${key} game amounts`, mirrorGames[key] || {}, liveGames[key] || {}));
  });
  return { scenario: mirror.round.scenario, status: differences.length ? 'warning' : 'exact_match', differences, mirror, live };
}

export function getLiveAdapterCoverage() {
  return {
    adapterMode: 'vm-app-js',
    liveFunctionsUsed: LIVE_FUNCTIONS_USED.slice(),
    mirroredFunctionsStillUsed: MIRRORED_FUNCTIONS_STILL_USED.slice(),
    unsupportedAreas: UNSUPPORTED_LIVE_AREAS.slice(),
  };
}
