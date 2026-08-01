import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import './v30.3.77-pwa-round-completion.test.js';
import './v30.3.77-calculation-assurance.test.js';
import './v30.3.78-summary-insights.test.js';
import './v30.3.79-match-summary-recap.test.js';
import './v30.3.80-match-setup-navigation.test.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');

function option(slot, playerId, pointerType = 'touch') {
  const candidate = {
    dataset: { playerComboboxOption: String(slot), playerId },
    closest: selector => selector === '[data-assignment-slot]' ? { dataset: { assignmentSlot: String(slot) } } : null,
  };
  return {
    candidate,
    event: {
      target: { closest: selector => selector === '[data-player-combobox-option]' ? candidate : null },
      pointerType,
      button: 0,
      preventDefault() {},
    },
  };
}

function sspSeed(puttsSource = 'default') {
  const players = [{ id: 'p1', name: 'Alex', index: 4 }, { id: 'p2', name: 'Blake', index: 8 }];
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
  const course = { id: 'c', name: 'Course', tees: [{ id: 't', teeName: 'Tee', rating: 72, slope: 113, par: 72, holes }] };
  const rows = players.map((player, index) => ({
    playerId: player.id,
    team: index + 1,
    slot: index,
    teeId: 't',
    scores: Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, gross: hole === 0 ? 4 : null })),
    stats: Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, putts: 2, puttsSource: hole === 0 ? puttsSource : 'default' })),
  }));
  const match = {
    id: 'm', courseId: 'c', teeId: 't', holeCount: 18, teamCount: 2, playersPerTeam: 1,
    statTrackingEnabled: false, statTrackingPlayerIds: [],
    selectedGames: [{ key: 'sneaky_sandy_poley', pointValue: 1, validateGreenyProx: true }],
    players: rows,
    sneakySandyPoleyInputs: { 1: { players: { p1: { greeny: true }, p2: { greeny: false } }, proxPlayerId: 'p1' } },
  };
  return { players, courses: [course], matches: [match], activeMatchId: 'm' };
}

test('validated Greeny and Prox support manual validation without forcing Stat Tracking', () => {
  const engine = loadLiveEngine();
  const pending = engine.seedState(sspSeed('default')).matches[0];
  assert.equal(pending.statTrackingEnabled, false);
  assert.equal(pending.statTrackingPlayerIds.length, 0);
  assert.equal(engine.getSneakySandyPoleyPlayerStat(pending, 'p1', 0).available, false);
  let ledger = engine.buildSneakySandyPoleyLedger(pending, { metrics: engine.computeMatchMetrics(pending) });
  assert.equal(ledger.holes['1'].categoriesByTeam['1'].some(row => row.category === 'greeny' || row.category === 'prox'), false);
  assert.ok(ledger.holes['1'].warnings.some(row => /manual validation required/i.test(row)));

  pending.statTrackingEnabled = true;
  pending.statTrackingPlayerIds = ['p1', 'p2'];
  pending.players[0].stats[0].puttsSource = 'user';
  assert.equal(engine.getSneakySandyPoleyPlayerStat(pending, 'p1', 0).available, true);
  ledger = engine.buildSneakySandyPoleyLedger(pending, { metrics: engine.computeMatchMetrics(pending) });
  const categories = ledger.holes['1'].categoriesByTeam['1'].map(row => row.category);
  assert.equal(categories.filter(category => category === 'greeny').length, 1);
  assert.equal(categories.filter(category => category === 'prox').length, 1);

  const reloaded = engine.seedState(JSON.parse(JSON.stringify({ ...sspSeed('user'), matches: [pending] }))).matches[0];
  engine.normalizeMatch(reloaded);
  const replay = engine.buildSneakySandyPoleyLedger(reloaded, { metrics: engine.computeMatchMetrics(reloaded) });
  assert.deepEqual(replay.holes['1'].categoriesByTeam, ledger.holes['1'].categoriesByTeam);
  const shared = engine.buildSharedSspFacts(reloaded);
  assert.equal(shared.inputs['1'].players.p1.greeny, true);
  assert.equal(shared.inputs['1'].proxPlayerId, 'p1');
});

test('120 varied player-selection interactions preserve slot, team, tee, uniqueness, and handicap invariants', () => {
  const engine = loadLiveEngine();
  const players = Array.from({ length: 24 }, (_, index) => ({
    id: `p-${index}`,
    name: index < 2 ? 'Alex Morgan' : index % 5 === 0 ? `Extremely Long Player Name ${index} With Suffix` : `Player ${index}`,
    index: index - 6,
  }));
  engine.seedState({ players, courses: [], matches: [] });
  assert.equal(engine.getPlayerByLookupLabel('Alex Morgan', players), null, 'ambiguous plain names must never silently choose a player');
  assert.equal(engine.getPlayerByLookupLabel('Player 3', players)?.id, 'p-3');

  let draft = Array.from({ length: 8 }, (_, slot) => ({ slot, team: Math.floor(slot / 2) + 1, playerId: '', teeId: slot % 2 ? 'white' : 'blue' }));
  for (let cycle = 0; cycle < 120; cycle += 1) {
    const slot = cycle % draft.length;
    const allowed = engine.getSelectablePlayersForDraftSlot(players, draft, slot);
    assert.ok(allowed.length >= players.length - draft.length + 1);
    const partial = cycle % 5 === 0 ? 'extremely long' : 'player';
    assert.ok(engine.getPlayerComboboxMatches(partial, allowed).every(player => engine.getPlayerLookupLabel(player).toLowerCase().includes(partial)));
    const target = allowed[(cycle * 7 + slot) % allowed.length];
    const before = draft.map(row => ({ ...row }));
    const pick = option(slot, target.id, ['mouse', 'touch', 'pen'][cycle % 3]);
    const calls = [];
    if (cycle % 2) engine.handlePlayerComboboxOptionPointerDown(pick.event, (...args) => calls.push(args));
    else engine.selectPlayerComboboxOption(pick.candidate, (...args) => calls.push(args));
    assert.equal(calls.length, 1);
    draft = engine.updatePlayerDraftSlot(draft, calls[0][0], calls[0][1], { playersPerTeam: 2, defaultTeeId: 'gold' });
    assert.equal(draft[slot].playerId, target.id);
    assert.equal(draft[slot].team, before[slot].team);
    assert.equal(draft[slot].teeId, before[slot].teeId);
    assert.equal(new Set(draft.map(row => row.playerId).filter(Boolean)).size, draft.filter(row => row.playerId).length);
    draft.forEach((row, index) => { if (index !== slot) assert.equal(JSON.stringify(row), JSON.stringify(before[index])); });

    if (cycle % 10 === 9) draft = engine.updatePlayerDraftSlot(draft, slot, '', { playersPerTeam: 2 });
    if (cycle % 13 === 12) {
      const occupied = draft.find((row, index) => index !== slot && row.playerId);
      if (occupied) assert.equal(JSON.stringify(engine.updatePlayerDraftSlot(draft, slot, occupied.playerId, { playersPerTeam: 2 })), JSON.stringify(draft));
    }
    const sample = players[cycle % players.length];
    const ch = engine.courseHandicap(sample.index, cycle % 2 ? 125 : 113, cycle % 2 ? 73.2 : 72, 72);
    assert.equal(engine.playingHandicap(ch, 85), Math.round(ch * 0.85));
  }
});

test('focused setup disclosures, Honors pill, and header-only icon change match acceptance markup', () => {
  for (const id of ['playersTeamsDisclosure', 'gamesDisclosure']) {
    assert.match(html, new RegExp(`<details id="${id}"[^>]*\\bopen\\b`));
  }
  assert.match(app, /addEventListener\('toggle', \(\) => syncSetupDisclosureAria/);
  assert.match(app, /summary\.setAttribute\('aria-expanded'/);
  assert.match(app, /expandSetupDisclosuresForWarnings\(state\.warnings\)/);
  assert.match(css, /\.setup-section-disclosure>summary/);
  assert.match(app, /score-primary-status score-honors-status/);
  assert.match(css, /\.score-status-row\{display:grid;justify-items:center/);
  assert.doesNotMatch(css, /score-honors-status::before/);
  assert.match(html, /<img src="\.\/branding\/apple-touch-icon-v30\.3\.83\.png" alt="The Dye Ledger"/);
  assert.equal((html.match(/branding\/app-icon-192\.png/g) || []).length, 0);
  assert.match(manifest, /branding\/app-icon-192-v30\.3\.83\.png/);
  assert.match(manifest, /branding\/apple-touch-icon-v30\.3\.83\.png/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
