import { hash, fault, PHASE } from './policy.js';
import { verifyApproval } from './approvals.js';
import { newBudget, stepBudget, account, recoverBudget } from './budget.js';
import { authFixture } from './auth.js';
import { validate, schemaAt } from './agents.js';
import { report } from './report.js';
import { setInterval, clearInterval } from 'node:timers';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

export const STOPS = Object.freeze(['READY', 'OWNER_APPROVAL', 'SCOPE', 'INTEGRITY', 'ISOLATION', 'AUTH_OR_USAGE', 'DISPUTE', 'ROUNDS_EXHAUSTED', 'TIMEOUT', 'AGENT_ERROR', 'AGENT_VERSION', 'OWNER_INTERRUPT', 'EVIDENCE_WRITE']);
export const REFUSALS = Object.freeze(['NOT_APPROVED', 'NOT_PLATFORM_ACCEPTED', 'LOCK_HELD', 'LOCK_STALE', 'LOCK_DAMAGED', 'LOCK_INSPECTION_FAILED']);
export const EXIT = Object.freeze(Object.fromEntries([...STOPS, ...REFUSALS].map((name, index) => [name, name === 'READY' ? 0 : index + 10])));
const codexSchema = schemaAt(new URL('../schemas/codex-result.schema.json', import.meta.url));
const claudeSchema = schemaAt(new URL('../schemas/claude-review.schema.json', import.meta.url));

export function resumeState(state, { now, source, approved, record, identity, signature, expectedSignature, ownerRetry = false }) {
  verifyApproval(record, source, approved, identity);
  if (signature !== expectedSignature) throw fault('INTEGRITY');
  recoverBudget(state.budget, now, !!state.currentStep);
  if (state.currentStep?.startsWith('IMPLEMENT') || state.currentStep?.startsWith('CORRECT')) {
    if (!ownerRetry) throw fault('OWNER_APPROVAL', 'Interrupted agent step needs an owner choice and retained crash diff');
  }
  return { ...state, reconstructed: true };
}

export async function runSession(config, io) {
  // Only the hash-pinned fake composition root can dispatch in Phase A.
  if (PHASE !== 'A' || config.mode !== 'fake') throw fault('NOT_PLATFORM_ACCEPTED');
  const state = config.resume ? { ...config.resume, stop:undefined, currentStep:null, reconstructed:true } : { schemaVersion: 1, runId: config.runId, packageId: config.packageId, baseSha: config.baseSha,
    approvedPackageSha256: config.approval?.packageHash, bundleSha256: config.bundle,
    phase: 'A', mode: 'fake',
    state: 'PRECHECK', round: 1, sequence: 0, currentStep: null, lastCompletedStep: null,
    budget: newBudget(io.now(), config.totalMs), findings: [], checks: [], criteria: [], evidenceIncomplete: [] };
  function persist() { io.evidence.write('state.json', state, { mutable: true }); }
  function incomplete(message) { if (!state.evidenceIncomplete.includes(message)) state.evidenceIncomplete.push(message); }
  function transition(name) {
    state.state = name; state.sequence++;
    io.evidence.event({ sequence: state.sequence, at: io.now(), state: name, round: state.round }); persist();
  }
  function approval() { verifyApproval(config.approval, io.packageBytes(), io.approvedBytes(), config); }
  async function step(name, operation) {
    approval(); if (io.interrupted?.()) throw fault('OWNER_INTERRUPT');
    const timeout = stepBudget(state.budget, name, config.stepMs, io.now());
    state.currentStep = name; persist();
    const monotonic = io.monotonic || (() => performance.now());
    let lastCharge = monotonic();
    const charge = () => {
      const now = io.now(), tick = monotonic(), elapsed = Math.max(0, tick - lastCharge);
      state.budget.steps[name] = (state.budget.steps[name] || 0) + elapsed;
      account(state.budget, now, elapsed); lastCharge = tick;
    };
    let timer, heartbeat;
    try {
      const timeoutOrEvidenceFailure = new Promise((_, reject) => {
        timer = setTimeout(() => reject(fault('TIMEOUT')), timeout);
        heartbeat = setInterval(() => {
          try { charge(); persist(); } catch (error) { reject(error); }
        }, 10000);
      });
      const output = await Promise.race([operation(timeout,Math.min(state.budget.originalDeadlineUtc,io.now()+timeout)), timeoutOrEvidenceFailure]);
      charge();
      if (io.now() >= state.budget.originalDeadlineUtc) throw fault('TIMEOUT');
      state.lastCompletedStep = name; state.currentStep = null; persist(); return output;
    } finally { clearTimeout(timer); clearInterval(heartbeat); charge(); }
  }
  try {
    approval(); await step('LOCK', () => io.acquireLock());
    authFixture(config.authExpectation, await step('AUTH', () => io.auth()));
    await step('PREPARE', () => io.prepare()); transition('PREPARE_WORKTREE');
    const identity = await io.identity();
    while (true) {
      transition(state.round === 1 ? 'IMPLEMENT' : 'CORRECT');
      const result = validate(codexSchema, await step(`${state.state}-${state.round}`, (timeout,deadline) => io.implement(state, timeout,deadline)));
      state.criteria = result.criteria;
      if (result.disputes.length) throw fault('DISPUTE');
      if (result.status !== 'implemented') throw fault('OWNER_APPROVAL');
      await io.integrity(identity); await io.scope(); transition('CAPTURE');
      state.fingerprint = await io.capture(state.round);
      state.checks = [];
      for (const name of config.requiredChecks) {
        const checked = await step(`CHECK-${state.round}-${name}`, (timeout,deadline) => io.check(name,timeout,deadline));
        state.checks.push({ name, ...checked });
      }
      await io.integrity(identity); await io.scope();
      const reviewSignature = await io.signature();
      const snapshotSignature = await io.snapshot(state.round);
      transition('REVIEW');
      const review = validate(claudeSchema, await step(`REVIEW-${state.round}`, (timeout,deadline) => io.review(state, timeout,deadline)));
      await io.verifySnapshot(snapshotSignature); await io.integrity(identity);
      if (await io.signature() !== reviewSignature) throw fault('INTEGRITY');
      state.findings = review.findings;
      if (review.verdict === 'needs_owner') throw fault('OWNER_APPROVAL');
      const required = config.criteria;
      const allCriteria = result.criteria.length === required.length && new Set(result.criteria.map(row => row.id)).size === required.length && required.every(id => result.criteria.some(row => row.id === id && row.result === 'PASS'));
      if (review.verdict === 'ready' && review.findings.length === 0 && state.checks.every(row => row.result === 'PASS') && allCriteria) {
        state.stop = 'READY'; transition('READY'); break;
      }
      if (review.verdict === 'ready' && (!allCriteria || state.checks.some(row => row.result !== 'PASS'))) {
        state.findings = [{ id: 'CHECK-GATE', scenario: 'Required checks or criteria not met' }];
      }
      if (state.round >= 3) throw fault('ROUNDS_EXHAUSTED');
      state.round++; transition('FINDINGS');
    }
  } catch (error) {
    state.stop = [...STOPS, ...REFUSALS].includes(error.code) ? error.code : 'AGENT_ERROR';
    state.failure={code:error.code||'AGENT_ERROR',message:error.message};
    if (state.stop === 'EVIDENCE_WRITE') incomplete(error.message);
    try { transition(state.stop); } catch (failure) { incomplete(failure.message); state.stop = 'EVIDENCE_WRITE'; }
  } finally {
    try { await io.stopChildren(); }
    catch (error) { state.stop = 'ISOLATION'; incomplete(`Child cleanup unverified: ${error.message}`); }
    try { await io.archiveLock?.(state); }
    catch (error) { incomplete(`Lock retained: ${error.message}`); state.stop = 'EVIDENCE_WRITE'; }
    try { persist(); } catch (error) { incomplete(error.message); state.stop = 'EVIDENCE_WRITE'; }
    try {
      io.evidence.write(`reports/final-${randomUUID()}.md`,report(state),{raw:true});
      io.evidence.write('report.md', report(state), { raw: true,mutable:true });
    }
    catch (error) { incomplete(error.message); state.stop = 'EVIDENCE_WRITE'; }
    io.console?.({ stop: state.stop, evidenceIncomplete: state.evidenceIncomplete });
  }
  return { state, exit: EXIT[state.stop] ?? 99, packageHash: hash(io.packageBytes()) };
}
