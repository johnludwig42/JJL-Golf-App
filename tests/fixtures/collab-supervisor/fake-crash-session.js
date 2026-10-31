// Fake coordinator only: the controller kills this process at one named boundary.
// No agent executable, shell, Git command or descendant is launched here.
import { runSession } from '../../../scripts/collab-supervisor/lib/state.js';
import { Evidence } from '../../../scripts/collab-supervisor/lib/evidence.js';
import { hash } from '../../../scripts/collab-supervisor/lib/policy.js';
import { Buffer } from 'node:buffer';
const [root, point] = process.argv.slice(2);
const bytes = Buffer.from('crash fixture approval');
const expectation = { codexLine: 'Logged in using ChatGPT', versions: { codex: 'fixture-v1', claude: 'fixture-v1' }, claudeFields: { authMethod: 'claude.ai', loggedIn: true } };
const config = { mode: 'fake', runId: 'crash-fixture', packageId: 'WP-CRASH', phase: 'A', baseSha: 'fixture-base', bundle: 'fixture-bundle', totalMs: 30000, stepMs: 20000, criteria: ['C1'], requiredChecks: ['validate'], authExpectation: expectation };
config.approval = { ...config, packageHash: hash(bytes) };
const implemented = { status: 'implemented', summary: 'fake only', criteria: [{ id: 'C1', result: 'PASS' }], disputes: [] };
const io = { now: () => 1000, packageBytes: () => bytes, approvedBytes: () => bytes, evidence: new Evidence(root),
  acquireLock: async () => {}, auth: async () => ({ versions: expectation.versions, exit: 0, codexLine: expectation.codexLine, claudeJson: JSON.stringify(expectation.claudeFields) }),
  prepare: async () => {}, identity: async () => 'fake-identity', implement: async () => implemented,
  integrity: async () => {}, scope: async () => {}, capture: async () => 'fake-fingerprint',
  check: async () => ({ result: 'PASS' }), signature: async () => 'fake-tree', snapshot: async () => 'fake-snapshot',
  verifySnapshot: async () => {}, review: async () => ({ verdict: 'ready', findings: [] }), stopChildren: async () => {} };
if (!['prepare', 'implement', 'capture', 'check', 'review', 'verifySnapshot'].includes(point)) throw new Error('Unknown fake crash boundary');
io[point] = async () => { setInterval(() => {}, 1000); process.stdout.write('FAKE_BOUNDARY_READY\n'); await new Promise(() => {}); };
await runSession(config, io);
