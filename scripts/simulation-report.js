import fs from 'node:fs';
import path from 'node:path';
import { deterministicFixtures } from '../tests/fixtures/rounds/simulation-fixtures.js';
import {
  DEFAULT_SEED,
  SIMULATION_VERSION,
  createRng,
  generateRandomRound,
  summarizeResult,
  validateRound,
} from './simulation-engine.js';

export function parseSimulationArgs(argv = process.argv.slice(2)) {
  const args = { rounds: 50, seed: DEFAULT_SEED, fixtures: true, writeReport: true };
  argv.forEach((arg, idx) => {
    if (arg === '--rounds') args.rounds = Number(argv[idx + 1] || args.rounds);
    if (arg.startsWith('--rounds=')) args.rounds = Number(arg.split('=')[1] || args.rounds);
    if (arg === '--seed') args.seed = argv[idx + 1] || args.seed;
    if (arg.startsWith('--seed=')) args.seed = arg.split('=').slice(1).join('=') || args.seed;
    if (arg === '--no-fixtures') args.fixtures = false;
    if (arg === '--no-report') args.writeReport = false;
  });
  args.rounds = Number.isFinite(args.rounds) && args.rounds >= 0 ? Math.round(args.rounds) : 50;
  return args;
}

export function runSimulationLab(options = {}) {
  const seed = options.seed || DEFAULT_SEED;
  const rng = createRng(seed);
  const fixtureRounds = options.fixtures === false ? [] : deterministicFixtures;
  const randomRounds = Array.from({ length: Number(options.rounds ?? 50) }, (_, idx) => generateRandomRound(rng, idx));
  const results = [...fixtureRounds, ...randomRounds].map(round => validateRound(round));
  const failures = results.flatMap(result => result.failures.map(message => ({ scenario: result.round.scenario, message })));
  const warnings = results.flatMap(result => result.warnings.map(message => ({ scenario: result.round.scenario, message })));
  const suspicious = results.flatMap(result => result.suspicious.map(message => ({ scenario: result.round.scenario, message })));
  const settlementTotals = {};
  results.forEach(result => {
    Object.entries(result.payout.finalTotals).forEach(([id, amount]) => {
      settlementTotals[id] = (settlementTotals[id] || 0) + Number(amount || 0);
    });
  });
  const gamesTested = [...new Set(results.flatMap(result => result.payout.games.map(game => game.key)))].sort();
  const interesting = results
    .map(result => ({ ...summarizeResult(result), result }))
    .sort((a, b) => (b.warnings + b.suspicious + b.settlement.length) - (a.warnings + a.suspicious + a.settlement.length))
    .slice(0, 8);
  return {
    version: SIMULATION_VERSION,
    timestamp: new Date().toISOString(),
    seed,
    randomRounds: randomRounds.length,
    fixtureCount: fixtureRounds.length,
    totalRounds: results.length,
    fixtureNames: fixtureRounds.map(round => round.scenario),
    gamesTested,
    results,
    failures,
    warnings,
    suspicious,
    settlementTotals,
    interesting,
  };
}

function listOrNone(items, formatter = item => `- ${item}`) {
  return items.length ? items.map(formatter).join('\n') : '- None';
}

function buildReportMarkdown(summary) {
  const roi = [
    'Create an importable competition-engine adapter so simulations can call live app scoring functions directly.',
    'Add golden JSON snapshots for representative final settlements and game-level payout detail.',
    'Promote Shared Match assignment checks from model-only tests to browser/device automation.',
    'Add explicit provisional/final language assertions for incomplete rounds in Match Summary output.',
    'Add fixture-specific expected outcomes for Nassau split and skins winner detail.',
    'Add a saved-match backward-compatibility fixture pack from real historical saved match shapes.',
    'Add carryover-specific skins rule documentation because current app behavior awards only unique low holes.',
    'Add CLI diffing for report output so surprising product observations are easier to spot release to release.',
    'Add iPhone PWA manual acceptance result capture beside simulation findings.',
    'Add focused tests around post-clinch score edits and how they should affect Match Play reporting.',
  ];
  const productObservations = [
    'The current scoring model benefits from deterministic examples because money outcomes can be correct while still difficult to explain by eye.',
    'Incomplete rounds need careful wording: the math can reconcile, but product language should remain provisional.',
    '9-Point is especially well suited to invariant testing because every completed hole must allocate exactly 9 points.',
    'Shared Match authority can be modeled without a browser, but real trust still requires two-device automation or manual verification.',
  ];
  const engineeringFollowUps = [
    'Extract or expose a safe, DOM-free adapter for computeMatchMetrics and computeLivePayoutGames.',
    'Store deterministic expected outcomes beside fixtures once product-owner intent is confirmed.',
    'Add simulation output to future release validation checklists.',
    'Consider a small fixture loader for saved localStorage match payloads.',
  ];
  const uxFollowUps = [
    'Consider clearer provisional labels in Match Summary for incomplete Nassau and settlement views.',
    'Consider inline net-skin explanations that show gross score, stroke received, and resulting net score.',
    'Consider a compact Match Play clinch note when a match is mathematically closed before hole 18.',
  ];
  return `# Simulation Lab Summary

## Run Metadata
- Version: ${summary.version}
- Timestamp: ${summary.timestamp}
- Seed: ${summary.seed}
- Random rounds: ${summary.randomRounds}
- Fixtures run: ${summary.fixtureCount}
- Total rounds simulated: ${summary.totalRounds}
- Games tested: ${summary.gamesTested.join(', ') || 'None'}

## Pass/Fail Summary
- Failures: ${summary.failures.length}
- Warnings: ${summary.warnings.length}
- Suspicious outcomes: ${summary.suspicious.length}

## Failures
${listOrNone(summary.failures, item => `- ${item.scenario}: ${item.message}`)}

## Warnings / Suspicious Outcomes
${listOrNone(summary.warnings, item => `- Warning - ${item.scenario}: ${item.message}`)}
${summary.suspicious.length ? '\n' + summary.suspicious.map(item => `- Suspicious - ${item.scenario}: ${item.message}`).join('\n') : ''}

## Interesting Product Observations
${productObservations.map(item => `- ${item}`).join('\n')}

## Interesting Rounds
${listOrNone(summary.interesting, item => `- ${item.scenario}: ${item.completed} holes, ${item.warnings} warning(s), ${item.suspicious} suspicious item(s), settlement ${item.settlement.join('; ') || 'none'}`)}

## Suggested Engineering Follow-Ups
${engineeringFollowUps.map(item => `- ${item}`).join('\n')}

## Suggested UX/Product Improvements
${uxFollowUps.map(item => `- ${item}`).join('\n')}

## Top 10 Highest-ROI Improvements
${roi.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

## Fixtures
${summary.fixtureNames.map(name => `- ${name}`).join('\n')}

## Settlement Totals Across Run
${Object.entries(summary.settlementTotals).map(([id, amount]) => `- ${id}: $${amount.toFixed(2)}`).join('\n') || '- None'}
`;
}

export function writeSimulationReport(summary, reportPath = path.join('reports', 'simulation', 'latest-summary.md')) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, buildReportMarkdown(summary), 'utf8');
  return reportPath;
}

export function printSimulationSummary(summary, reportPath = null) {
  console.log(`Simulation Lab ${summary.version}`);
  console.log(`Seed: ${summary.seed}`);
  console.log(`Rounds: ${summary.totalRounds} (${summary.fixtureCount} fixtures, ${summary.randomRounds} random)`);
  console.log(`Games tested: ${summary.gamesTested.join(', ')}`);
  console.log(`Failures: ${summary.failures.length}`);
  console.log(`Warnings: ${summary.warnings.length}`);
  console.log(`Suspicious outcomes: ${summary.suspicious.length}`);
  if (reportPath) console.log(`Report: ${reportPath}`);
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseSimulationArgs(argv);
  const summary = runSimulationLab(args);
  const reportPath = args.writeReport ? writeSimulationReport(summary) : null;
  printSimulationSummary(summary, reportPath);
  if (summary.failures.length) {
    summary.failures.slice(0, 20).forEach(item => console.error(`${item.scenario}: ${item.message}`));
    process.exitCode = 1;
  }
  return summary;
}
