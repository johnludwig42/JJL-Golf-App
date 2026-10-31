import { fault } from './policy.js';
export function newBudget(now, totalMs) {
  if (!Number.isFinite(totalMs) || totalMs <= 0) throw fault('NOT_APPROVED');
  return { runStartedAtUtc: now, originalDeadlineUtc: now + totalMs, totalMs, consumedMs: 0, lastHeartbeat: now, steps: {}, anomalies: [] };
}
export function remaining(budget, now) { return Math.max(0, Math.min(budget.totalMs - budget.consumedMs, budget.originalDeadlineUtc - now)); }
export function account(budget, now, elapsedMs) {
  if (now < budget.lastHeartbeat) budget.anomalies.push('CLOCK_BACKWARDS');
  if (now - budget.lastHeartbeat > 20000) budget.anomalies.push('HEARTBEAT_GAP');
  budget.consumedMs += Math.max(0, elapsedMs); budget.lastHeartbeat = now;
}
export function stepBudget(budget, key, maximum, now) {
  const result = Math.min(maximum - (budget.steps[key] || 0), remaining(budget, now));
  if (result <= 0) throw fault('TIMEOUT'); return result;
}
export function recoverBudget(budget, now, interrupted = false) {
  if (now < budget.lastHeartbeat) throw fault('OWNER_APPROVAL', 'Clock moved backwards; owner decision required, no automatic resume');
  if (interrupted) budget.consumedMs = Math.max(budget.consumedMs, Math.min(budget.totalMs, now - budget.runStartedAtUtc + 10000));
  if (remaining(budget, now) <= 0) throw fault('TIMEOUT'); return budget;
}
