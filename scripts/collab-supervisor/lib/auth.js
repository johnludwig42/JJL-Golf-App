import { fault, hash } from './policy.js';
export const AUTH_KEYS = Object.freeze(['loggedIn','authenticated','mode','authMethod','apiProvider','subscriptionType','email','orgId','orgName','accountId']);
export const AUTH_WORDS = Object.freeze(['logged','in','not','using','ChatGPT','chatgpt','API','api','key','apiKey','oauth','subscription','claude.ai','console','firstParty','pro','max','team','enterprise','free','plus','none']);
export const AUTH_SCHEMA = Object.freeze({ rules: Object.freeze([]) });
const stops = new Set(['OVERSIZE','NON_UTF8','NOT_JSON','TOKEN_LIKE','EXTRACT_BUDGET','EXTRACT_FAULT','CAPTURE_UNAVAILABLE',
  'CAPTURE_FAULT','CAPTURE_INCOMPLETE','TIMEOUT','PARENT_DEATH','CANCELLED']);
function safeShape(value, depth = 0) {
  if (depth > 34) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 9;
  if (typeof value === 'string') return AUTH_WORDS.includes(value) || /^<number>$|^<digits:[0-9]{1,5}>$|^<redacted:len=[0-9]{1,5},class=(email-like|url-like|uuid-like|alnum|other)>$/.test(value);
  if (Array.isArray(value)) return value.every(item => safeShape(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.keys(value).join('|') !== 'fields' || !Array.isArray(value.fields)) return false;
  return value.fields.every(field => Array.isArray(field) && field.length === 2 && typeof field[0] === 'string' &&
    (AUTH_KEYS.includes(field[0]) || /^<key:len=[0-9]{1,5},class=(email-like|url-like|uuid-like|alnum|other)>$/.test(field[0])) && safeShape(field[1], depth + 1));
}
export function validateAuthProjection(projection) {
  const reject = () => { throw fault('AUTH_OR_USAGE', 'Auth projection is invalid'); };
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) reject();
  if (projection.stop) {
    const tokenDetails = projection.stop === 'TOKEN_LIKE' && Object.hasOwn(projection, 'hitClass');
    const keys = tokenDetails ? ['stop', 'hitClass', 'jsonPathOrLineNo'] : ['stop'];
    if (!stops.has(projection.stop) || Object.keys(projection).length !== keys.length ||
        Object.keys(projection).some(key => !keys.includes(key))) reject();
    if (tokenDetails && (!['LONG_ENCODED_RUN','SECRET_PREFIX','BEARER','PEM','SENTINEL','JWT_LIKE'].includes(projection.hitClass) ||
        !Number.isInteger(projection.jsonPathOrLineNo) || projection.jsonPathOrLineNo < 1 || projection.jsonPathOrLineNo > 65537)) reject();
  } else if (Object.keys(projection).sort().join('|') !== 'authMode|loggedIn|schema|shape' ||
    projection.authMode !== 'UNVERIFIED (bootstrap)' || projection.loggedIn !== 'UNVERIFIED (bootstrap)' ||
    projection.schema !== null || !safeShape(projection.shape)) reject();
  return Object.freeze({ projectionHash: hash(JSON.stringify(projection)), authMode: 'UNVERIFIED (bootstrap)' });
}
export function applyAuthSchema(projection, schema = AUTH_SCHEMA) {
  validateAuthProjection(projection);
  if (!schema || !Array.isArray(schema.rules) || schema.rules.length === 0) throw fault('AUTH_OR_USAGE', 'Auth schema awaits separate review');
  // No accepted S2-D schema exists in Stage 2a. Data cannot authorize a mode claim.
  throw fault('AUTH_OR_USAGE', 'Auth schema is not accepted');
}
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
