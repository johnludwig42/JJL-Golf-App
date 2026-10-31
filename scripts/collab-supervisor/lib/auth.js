import { fault } from './policy.js';
export function authFixture(expectation, actual) {
  if (!expectation?.codexLine || !expectation?.claudeFields || !expectation?.versions || Object.keys(expectation.claudeFields).length === 0) throw fault('AUTH_OR_USAGE', 'Phase B auth expectations are not configured');
  if (JSON.stringify(actual.versions) !== JSON.stringify(expectation.versions)) throw fault('AGENT_VERSION');
  if (actual.exit !== 0 || actual.timeout || actual.codexLine !== expectation.codexLine) throw fault('AUTH_OR_USAGE');
  let body;
  try { body = JSON.parse(actual.claudeJson); } catch { throw fault('AUTH_OR_USAGE'); }
  if (Object.keys(body).some(key => !Object.hasOwn(expectation.claudeFields, key)) || Object.entries(expectation.claudeFields).some(([key, value]) => body[key] !== value)) throw fault('AUTH_OR_USAGE');
  if (/api.?key|console|third.party/i.test(actual.codexLine)) throw fault('AUTH_OR_USAGE');
  return true;
}
