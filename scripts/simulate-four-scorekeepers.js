import fs from 'node:fs';
import { createRng, generateRandomRound, cloneJson } from './simulation-engine.js';
import { loadLiveEngine, buildLiveMatchFromRound, evaluateRoundWithLiveEngine, compareRoundWithLiveEngine } from './live-engine-adapter.js';
import { extractLocalScoredLedger, extractRemoteScoredLedger, compareScoredLedgers, mergeRemoteLedgerIntoLocalMatch } from './shared-match-ledger.js';

// The server and network are modeled; queues and payout calculations use app.js.
const seed = 'four-scorekeepers-2026-10-02';
const rng = createRng(seed);
const engines = Array.from({ length: 4 }, () => loadLiveEngine());
const scoringEngine = loadLiveEngine();
const failures = [];
const rows = [];
let corrections = 0, duplicateAcks = 0, delayed = 0, reloads = 0;
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
for (let index = 0; index < 100; index += 1) {
  const round = generateRandomRound(rng, index);
  round.holeCount = 18;
  round.players.forEach(player => {
    round.scores[player.id] = Array.from({ length: 18 }, (_, hole) => round.scores[player.id][hole] ?? round.course.holes[hole].par + Math.floor(rng() * 4));
  });
  const template = buildLiveMatchFromRound(round).match;
  Object.assign(template, { storageMode: 'shared', sharedMatchId: `simulation-${index}`, id: `simulation-${index}` });
  template.players.forEach(player => player.scores.forEach(score => score.gross = null));
  const sessions = engines.map((engine, keeper) => ({ engine, keeper, store: storage(), match: cloneJson(template) }));
  const server = new Map();
  for (let hole = 1; hole <= 18; hole += 1) {
    for (const session of sessions) {
      const playerId = round.players[session.keeper].id;
      const expected = round.scores[playerId][hole - 1];
      const score = session.match.players.find(player => player.playerId === playerId).scores[hole - 1];
      score.gross = expected;
      const opts = { participantId: `keeper-${session.keeper}`, deviceId: `device-${session.keeper}` };
      if ((hole + index + session.keeper) % 7 === 0) {
        score.gross = expected + 1;
        session.engine.queueSharedScoreOperation(session.match, playerId, hole, opts, session.store);
        score.gross = expected;
        corrections += 1;
      }
      session.engine.queueSharedScoreOperation(session.match, playerId, hole, opts, session.store);
      if (hole === 9) {
        session.match = cloneJson(session.match);
        const before = session.engine.getSharedScoreOutboxOperations(session.match, session.store).length;
        session.engine = loadLiveEngine();
        if (before !== session.engine.getSharedScoreOutboxOperations(session.match, session.store).length) failures.push(`${index}: reload lost queue`);
        reloads += 1;
      }
      if ((hole + session.keeper) % 5 === 0 && hole !== 18) { delayed += 1; continue; }
      const queued = [...session.engine.getSharedScoreOutboxOperations(session.match, session.store)].reverse();
      for (const op of queued) {
        const gross = session.match.players.find(player => player.playerId === op.playerId).scores[op.holeNumber - 1].gross;
        server.set(op.key, { player_id: op.playerId, hole_number: op.holeNumber, gross });
        session.engine.acknowledgeSharedScoreOperations(session.match, [op.operationId], session.store);
        if (session.engine.acknowledgeSharedScoreOperations(session.match, [op.operationId], session.store) !== 0) failures.push(`${index}: duplicate acknowledgement removed another save`);
        duplicateAcks += 1;
      }
    }
    // Repeated pulls only fill missing values in this modeled ledger; corrections
    // above are made before submission, so they never overwrite remote scores.
    sessions.forEach(session => mergeRemoteLedgerIntoLocalMatch(session.match, extractRemoteScoredLedger(session.match, [...server.values()])));
  }
  const expectedTotals = evaluateRoundWithLiveEngine(round, { engine: scoringEngine }).finalTotals;
  const comparison = compareRoundWithLiveEngine(round, { engine: scoringEngine });
  comparison.differences.forEach(message => failures.push(`${index}: ${message}`));
  let consistent = true;
  sessions.forEach(session => {
    const parity = compareScoredLedgers(extractLocalScoredLedger(session.match), extractRemoteScoredLedger(session.match, [...server.values()]));
    const actualRound = cloneJson(round);
    actualRound.scores = Object.fromEntries(session.match.players.map(player => [player.playerId, player.scores.map(score => score.gross)]));
    const totals = evaluateRoundWithLiveEngine(actualRound, { engine: session.engine }).finalTotals;
    if (!parity.parityConfirmed || parity.localCount !== 72 || JSON.stringify(totals) !== JSON.stringify(expectedTotals) || session.engine.getSharedScoreOutboxOperations(session.match, session.store).length) {
      failures.push(`${index}: keeper ${session.keeper + 1} did not converge`); consistent = false;
    }
  });
  rows.push({ round: index + 1, consistent, finalTotals: expectedTotals });
}
const report = { seed, rounds: 100, scorekeepersPerRound: 4, scoreEntries: 7200, sessionChecks: 400, corrections, duplicateAcks, delayed, reloads, failures, rows,
  limitations: ['Server acceptance, assignment enforcement, and network transport are modeled.', 'Ledger propagation uses the standalone merge model, not the app cloud pull path.', 'Corrections are queued before submission; cross-device conflicting edits and stale server updates are not covered.', 'No live cloud, browser UI, phone, or PWA lifecycle verification.'] };
fs.mkdirSync('reports/simulation', { recursive: true });
fs.writeFileSync('reports/simulation/four-scorekeepers-100.json', JSON.stringify(report, null, 2));
fs.writeFileSync('reports/simulation/four-scorekeepers-100.md', `# 100-round, four-scorekeeper simulation\n\nSeed: ${seed}\n\n- Full 18-hole rounds: 100\n- Independent scoring sessions: 400\n- Scores: 7,200\n- Failures: ${failures.length}\n- Corrections before upload: ${corrections}\n- Delayed upload batches: ${delayed}\n- Duplicate acknowledgements: ${duplicateAcks}\n- Session reloads: ${reloads}\n\n${failures.join('\n')}\n\n## Coverage limits\n${report.limitations.map(item => `- ${item}`).join('\n')}\n`);
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
process.exitCode = failures.length ? 1 : 0;
