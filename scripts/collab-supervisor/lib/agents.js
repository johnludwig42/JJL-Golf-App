import { readFileSync } from 'node:fs';
import { spawnAllowed, fault } from './policy.js';
export function validate(schema, value, name = 'result') {
  if (!schema || !schema.type) throw fault('AGENT_ERROR', 'Unsupported schema');
  if (schema.enum && !schema.enum.includes(value)) throw fault('AGENT_ERROR', name);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault('AGENT_ERROR', name);
    if ((schema.required || []).some(key => !Object.hasOwn(value, key))) throw fault('AGENT_ERROR', name);
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw fault('AGENT_ERROR', name);
    for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) validate(child, value[key], `${name}.${key}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw fault('AGENT_ERROR', name);
    for (const row of value) validate(schema.items, row, name);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value) || (schema.minimum !== undefined && value < schema.minimum)) throw fault('AGENT_ERROR', name);
  } else if (typeof value !== schema.type) throw fault('AGENT_ERROR', name);
  return value;
}
export function schemaAt(url) { return JSON.parse(readFileSync(url, 'utf8')); }
export function parseAgentOutput(output, errorOutput = '', code = 0) {
  let parsed;
  try { parsed = JSON.parse(output); } catch { /* Only non-JSON stdout is diagnostic text. */ }
  const diagnostic = errorOutput + (parsed === undefined ? output : '');
  if (/usage|billing|sign.in|rate.limit/i.test(diagnostic) || ['USAGE_LIMIT', 'AUTH_REQUIRED', 'RATE_LIMIT'].includes(parsed?.error?.code)) throw fault('AUTH_OR_USAGE');
  if (code !== 0) throw fault('AGENT_ERROR');
  if (parsed === undefined) throw fault('AGENT_ERROR', 'Malformed agent result');
  return parsed;
}
export function fakeAgent(config, scenario, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnAllowed('fake-agent', config, scenario, options); } catch (error) { reject(error); return; }
    let output = ''; let errorOutput = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs || 1000);
    child.stdout.on('data', bytes => { output += bytes; if (output.length > 1024 * 1024) { timedOut = true; child.kill(); } });
    child.stderr.on('data', bytes => { errorOutput += bytes; if (errorOutput.length > 1024 * 1024) { timedOut = true; child.kill(); } });
    child.on('error', error => { clearTimeout(timer); reject(fault('AGENT_ERROR', error.code)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) { reject(fault('TIMEOUT')); return; }
      try { resolve(parseAgentOutput(output, errorOutput, code)); } catch (error) { reject(error); }
    });
  });
}
