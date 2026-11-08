import assert from 'node:assert/strict';

const PRIMARY = 'the-dye-ledger-v20';
const BACKUP = `${PRIMARY}:last-known-good`;
const encode = value => JSON.stringify(value);
const DRAFT = `${PRIMARY}:setup-draft`;
const GENERATED_DRAFT_FIELDS = ['id', 'sharedMatchId', 'sharedMatchRef', 'sharedMatchCode', 'sessionId', 'sessionCreatedAt'];

function approvedBlankDraftRewrite(before, after, oldState, newState) {
  try {
    const a = JSON.parse(before);
    const b = JSON.parse(after);
    const blank = draft => draft && !Array.isArray(draft) && draft.name === '' && draft.courseId === ''
      && draft.teeId === '' && Array.isArray(draft.players) && draft.players.length === 0
      && draft.notes === '' && draft.roundRecapNotes === ''
      && Array.isArray(draft.selectedGames) && draft.selectedGames.length === 0
      && Array.isArray(draft.presses) && draft.presses.length === 0
      && GENERATED_DRAFT_FIELDS.every(field => typeof draft[field] === 'string' && draft[field].length > 0)
      && Number.isFinite(Date.parse(draft.sessionCreatedAt));
    const active = state => state.activeMatchId && state.matches.some(round => round.id === state.activeMatchId && round.status === 'active');
    if (!blank(a) || !blank(b) || !active(oldState) || !active(newState)) return null;
    const fields = differences(a, b);
    if (!fields.length || fields.some(change => !GENERATED_DRAFT_FIELDS.some(field => change.path === `$.${field}`))) return null;
    return fields;
  } catch { return null; }
}

export async function captureStorage(observer, subject = observer) {
  const local = await observer.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
  ));
  let session = null;
  try {
    session = await subject.evaluate(() => Object.fromEntries(
      Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)]),
    ));
  } catch { /* A browser-generated error page has no access to the fixture origin. */ }
  return { local, session };
}

export async function settledSnapshot(observer, subject = observer) {
  const deadline = Date.now() + 20000;
  let previous = await captureStorage(observer, subject);
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const next = await captureStorage(observer, subject);
    if (encode(previous.local) === encode(next.local)) return next;
    previous = next;
  }
  throw new Error('Persistence census did not settle within 20 seconds');
}

function differences(before, after, prefix = '$') {
  if (encode(before) === encode(after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return [{ path: prefix, before, after }];
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .flatMap(key => differences(before[key], after[key], `${prefix}.${key}`));
}

function protectedProjection(state) {
  const top = ['players', 'playerRegistry', 'savedRosters', 'courses', 'activeMatchId', 'completedSummaryMatchId'];
  const match = ['roundRecordSnapshot', 'courseSnapshot', 'ledgerEntrySnapshot', 'selectedGames', 'presses', 'memories', 'status', 'completedAt'];
  return {
    top: Object.fromEntries(top.map(key => [key, state[key]])),
    matchOrder: state.matches.map(row => row.id),
    matches: state.matches.map(row => ({
      id: row.id,
      ...Object.fromEntries(match.map(key => [key, row[key]])),
      players: row.players.map(player => ({
        playerId: player.playerId, team: player.team, slot: player.slot,
        teeId: player.teeId, scores: player.scores,
      })),
    })),
  };
}

export function comparePersistence(before, after, scenario, writes = []) {
  const writerLocations = (key, area) => writes.filter(row => row.key === key && row.area === area)
    .map(row => ({ operation: row.operation, url: row.url, stack: row.stack }));
  const a = JSON.parse(before.local[PRIMARY]);
  const b = JSON.parse(after.local[PRIMARY]);
  assert.equal(encode(protectedProjection(b)), encode(protectedProjection(a)), `${scenario}: protected round/user facts changed`);
  for (const round of a.matches.filter(row => row.roundRecordSnapshot)) {
    assert.equal(encode(b.matches.find(row => row.id === round.id)?.roundRecordSnapshot), encode(round.roundRecordSnapshot), `${scenario}: frozen record changed`);
  }
  const changes = [];
  for (const key of [...new Set([...Object.keys(before.local), ...Object.keys(after.local)])].sort()) {
    if (before.local[key] === after.local[key]) continue;
    if (key === PRIMARY) {
      changes.push(...differences(a, b).map(change => ({ key, ...change, classification: 'UNCLASSIFIED', ownerDecisionRequired: change.path.startsWith('$.matches.'), writerLocations: writerLocations(key, 'local'), writer: 'Observed storage-call stacks; field-level cause requires independent review' })));
    } else {
      const approvedBackup = key === BACKUP && after.local[key] === after.local[PRIMARY];
      const approvedDraft = key === DRAFT && approvedBlankDraftRewrite(before.local[key], after.local[key], a, b);
      changes.push({ key, before: before.local[key], after: after.local[key], classification: approvedBackup ? 'APPROVED_BACKUP_EQUAL_TO_PRIMARY' : approvedDraft ? 'APPROVED_BLANK_DRAFT_REGENERATION_D1_A' : 'UNCLASSIFIED', fieldChanges: approvedDraft || undefined, writerLocations: writerLocations(key, 'local') });
      // These exact keys contain protected recovery, authority or review data.
      const protectedKey = [
        `${PRIMARY}:shared-score-outbox:v1`, `${PRIMARY}:finish-recovery`, `${PRIMARY}:setup-draft`,
        `${PRIMARY}:course-publish-recovery:v1`, 'dye-ledger:pending-ledger-entry-acceptance',
        'dye-ledger:pending-ledger-entry-revision', 'the-dye-ledger-shared-device-id',
        'dyeLedger.matchTemplates.v1', 'dyeLedger.playerPreferences',
        'dyeLedger.deviceScoreAdvanceOverrides.v1', 'dyeLedgerSharedDeviceName',
        'dye-ledger-recent-app-errors', 'the-dye-ledger-shared-delivery-retry-v1',
      ].includes(key) || key.startsWith('dyeLedgerSharedParticipantId:');
      assert.equal(protectedKey && !approvedDraft, false, `${scenario}: protected storage key changed: ${key}`);
    }
  }
  const sessions = before.session && after.session
    ? differences(before.session, after.session).map(change => ({
      ...change,
      writerLocations: writerLocations(change.path.slice(2), 'session'),
      expected: change.path.startsWith('$.dye-ledger-report-') || change.path === '$.dye-ledger-report:last-consumed',
    })) : [{ path: '$', expected: false, note: 'Subject error page or fresh-tab session unavailable; origin localStorage still captured by observer' }];
  return { scenario, protectedEqual: true, changes, sessions, ac6: changes.some(row => row.classification === 'UNCLASSIFIED') ? 'PENDING_REVIEW' : 'PASS_FOR_CAPTURED_LOCAL_STORAGE', before, after };
}
