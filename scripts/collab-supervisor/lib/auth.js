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

// A synthetic status schema, not a guess at either installed CLI's output.
export function syntheticAuth(actual) {
  const allowed = ['schema','source','mode','authenticated','exit','timeout'];
  if (!actual || Object.keys(actual).length !== allowed.length || Object.keys(actual).some(k => !allowed.includes(k)) ||
      actual.schema !== 1 || actual.source !== 'fixture-subscription' || actual.mode !== 'subscription' ||
      actual.authenticated !== true || actual.exit !== 0 || actual.timeout !== false) throw fault('AUTH_OR_USAGE', 'Synthetic subscription status refused');
  const expectation = { codexLine:'Synthetic subscription',versions:{codex:'fixture-v1',claude:'fixture-v1'},claudeFields:{syntheticAuthSource:'fixture-subscription',authenticated:true} };
  authFixture(expectation,{versions:expectation.versions,exit:0,codexLine:expectation.codexLine,claudeJson:JSON.stringify(expectation.claudeFields)});
  return Object.freeze({ schema:1, mode:'synthetic-subscription', exit:0 });
}
