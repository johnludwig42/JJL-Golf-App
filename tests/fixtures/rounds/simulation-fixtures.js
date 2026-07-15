import { DEFAULT_GAMES, makeDefaultCourse } from '../../../scripts/simulation-engine.js';

const course = makeDefaultCourse();
const players = [
  { id: 'p1', name: 'Alex', index: 7.2, team: 1 },
  { id: 'p2', name: 'Blake', index: 12.4, team: 2 },
  { id: 'p3', name: 'Casey', index: 15.1, team: 1 },
  { id: 'p4', name: 'Drew', index: 18.6, team: 2 },
];
const teams = [{ team: 1, name: 'North' }, { team: 2, name: 'South' }];
const pressScores = {
  p1: [4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4],
  p2: [5, 6, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
  p3: [5, 5, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
  p4: [6, 6, 5, 6, 6, 7, 6, 5, 6, 6, 7, 5, 6, 6, 7, 6, 5, 6],
};

function fixture(overrides) {
  return {
    course,
    holeCount: 18,
    players,
    teams,
    allowance: 100,
    selectedGames: DEFAULT_GAMES,
    expectedInvariants: [
      'final_settlement_zero_sum',
      'game_payouts_reconcile',
      'save_reload_stable',
      'nassau_components_reconcile',
      'gross_skins_unique_low',
      'net_skins_unique_low',
      'nine_point_totals',
    ],
    ...overrides,
  };
}

function pressFixture(scenario, purpose, pressRegression) {
  return fixture({
    scenario,
    purpose,
    scores: pressScores,
    selectedGames: [
      { key: 'match_play', basis: 'net', stake: 10, pressesEnabled: true, maxPressesPerRound: 6, maxRePresses: 2 },
      { key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5, pressesEnabled: true, maxPressesPerRound: 6, maxRePresses: 2 },
    ],
    pressRegression: { deterministic: true, ...pressRegression },
  });
}

export const deterministicFixtures = [
  fixture({
    scenario: 'close_match_18',
    purpose: 'A complete 18-hole match where teams remain close and every enabled current game has usable data.',
    scores: {
      p1: [4, 5, 3, 4, 5, 5, 4, 3, 4, 4, 5, 3, 5, 4, 5, 4, 3, 4],
      p2: [4, 6, 3, 5, 4, 5, 5, 3, 4, 5, 5, 4, 4, 5, 6, 4, 3, 5],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5, 4, 6, 3, 5, 5, 6, 5, 4, 5],
      p4: [5, 5, 4, 5, 5, 6, 4, 4, 5, 5, 6, 4, 5, 4, 6, 5, 4, 5],
    },
  }),
  fixture({
    scenario: 'blowout_match_play',
    purpose: 'A one-sided match that should close before the final hole while later completed scores remain settlement-safe.',
    scores: {
      p1: [3, 4, 3, 3, 4, 5, 3, 3, 4, 4, 4, 3, 4, 4, 5, 4, 3, 4],
      p2: [5, 6, 4, 6, 6, 7, 5, 4, 6, 6, 7, 4, 6, 6, 7, 5, 4, 6],
      p3: [4, 5, 3, 4, 5, 5, 4, 3, 4, 4, 5, 3, 4, 5, 5, 4, 3, 4],
      p4: [6, 7, 5, 6, 6, 7, 6, 5, 6, 6, 7, 5, 6, 7, 7, 6, 5, 6],
    },
  }),
  fixture({
    scenario: 'nassau_front_back_split',
    purpose: 'Team 1 wins the front while Team 2 wins the back, validating split Nassau accounting.',
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4, 3, 4, 5, 6, 4, 5, 5, 6, 5, 4, 5],
      p2: [5, 6, 4, 5, 5, 6, 5, 4, 5, 4, 5, 3, 4, 4, 5, 4, 3, 4],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5, 6, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [6, 6, 4, 5, 6, 6, 5, 4, 5, 4, 5, 3, 4, 4, 5, 4, 3, 4],
    },
  }),
  fixture({
    scenario: 'gross_skins_carryover',
    purpose: 'Tied low gross holes should not award a gross skin; unique low gross holes should award cleanly.',
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 5, 4, 5, 4, 3, 4],
      p2: [4, 5, 3, 5, 4, 6, 5, 3, 5, 5, 5, 4, 4, 5, 6, 4, 4, 5],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [5, 6, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
    },
  }),
  fixture({
    scenario: 'net_skins_handicap_stroke',
    purpose: 'A higher-handicap player receives a stroke on a hard hole and can win a net skin on net basis.',
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4],
      p2: [4, 6, 3, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [5, 5, 4, 5, 5, 6, 4, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
    },
  }),
  fixture({
    scenario: 'nine_point_tie_scenarios',
    purpose: '9-Point holes include all-tie, two-way-low tie, and two-way-high tie allocations.',
    scores: {
      p1: [4, 5, 3, 4, 5, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4],
      p2: [4, 5, 4, 4, 5, 6, 5, 3, 5, 4, 6, 4, 5, 4, 6, 5, 4, 5],
      p3: [4, 6, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [5, 6, 4, 5, 5, 6, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 4, 5],
    },
  }),
  fixture({
    scenario: 'incomplete_round_7_holes',
    purpose: 'Only seven completed holes should produce provisional findings without claiming final-round certainty.',
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4],
      p2: [5, 5, 3, 5, 5, 6, 5],
      p3: [5, 6, 4, 5, 5, 6, 5],
      p4: [5, 6, 4, 5, 5, 6, 5],
    },
  }),
  fixture({
    scenario: 'save_reload_mid_round',
    purpose: 'A 9-hole save/reload normalization check should preserve players, scores, games, handicaps, and settlement.',
    holeCount: 9,
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4, 3, 4],
      p2: [5, 5, 3, 5, 5, 6, 5, 3, 5],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [5, 6, 4, 5, 5, 6, 5, 4, 5],
    },
  }),
  fixture({
    scenario: 'shared_match_two_device_assignment_model',
    purpose: 'Model assigned-player authority without browser automation.',
    scoringAccessMode: 'assigned_players',
    sharedParticipants: [{ participantId: 'host', role: 'host' }, { participantId: 'cart-two', role: 'participant' }],
    sharedAssignments: { p2: 'cart-two', p4: 'cart-two' },
    holeCount: 9,
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4, 3, 4],
      p2: [5, 5, 3, 5, 5, 6, 5, 3, 5],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [5, 6, 4, 5, 5, 6, 5, 4, 5],
    },
  }),
  fixture({
    scenario: 'host_correction_after_joiner_score',
    purpose: 'Model a host correction after joined-device scoring and ensure normalization/settlement stays deterministic.',
    scoringAccessMode: 'assigned_players',
    sharedParticipants: [{ participantId: 'host', role: 'host' }, { participantId: 'cart-two', role: 'participant' }],
    sharedAssignments: { p2: 'cart-two' },
    correctionLog: [{ playerId: 'p2', holeNumber: 4, from: 6, to: 5, actor: 'host' }],
    holeCount: 9,
    scores: {
      p1: [4, 5, 3, 4, 4, 5, 4, 3, 4],
      p2: [5, 5, 3, 5, 5, 6, 5, 3, 5],
      p3: [5, 6, 4, 5, 5, 6, 5, 4, 5],
      p4: [5, 6, 4, 5, 5, 6, 5, 4, 5],
    },
  }),
  pressFixture('press_front_lane', 'Deterministic Front Press eligibility and original-wager fixture.', { parent: 'nassau', segment: 'FRONT', chainDepth: 1 }),
  pressFixture('press_back_lane', 'Deterministic Back Press eligibility and future-hole fixture.', { parent: 'nassau', segment: 'BACK', chainDepth: 1 }),
  pressFixture('press_overall_lane', 'Deterministic Overall Press eligibility and final-settlement fixture.', { parent: 'nassau', segment: 'OVERALL', chainDepth: 1 }),
  pressFixture('press_match_play', 'Deterministic standalone Match Play Press fixture.', { parent: 'match_play', segment: 'OVERALL', chainDepth: 1 }),
  pressFixture('press_repress_chain_1', 'Deterministic Press to Re-Press hierarchy fixture.', { parent: 'match_play', chainDepth: 2 }),
  pressFixture('press_repress_chain_2', 'Deterministic Press to two-level Re-Press hierarchy fixture.', { parent: 'match_play', chainDepth: 3 }),
  pressFixture('press_multiple_independent_chains', 'Deterministic independent Front, Back, Overall, and Match Play chains.', { parent: 'mixed', chainDepth: 3, independentChains: 4 }),
  pressFixture('press_round_limit_exhausted', 'Deterministic round-wide Maximum Presses exhaustion fixture.', { parent: 'mixed', existingCount: 6, maxPressesPerRound: 6 }),
  pressFixture('press_mid_round_enable', 'Deterministic future-only mid-round Press enablement fixture.', { transition: 'OFF_TO_ON', completedHoles: 5 }),
  pressFixture('press_disable_after_use_blocked', 'Deterministic disable-after-creation rejection fixture.', { transition: 'ON_TO_OFF', existingCount: 1, expectedReason: 'PRESS_DISABLE_BLOCKED_EXISTING_PRESS' }),
  pressFixture('press_limit_reduction_blocked', 'Deterministic count/depth limit reduction rejection fixture.', { existingCount: 3, chainDepth: 2, expectedReasons: ['MAX_PRESSES_BELOW_EXISTING_COUNT', 'MAX_REPRESSES_BELOW_EXISTING_DEPTH'] }),
  pressFixture('press_shared_sync_reconnect', 'Deterministic host transport, replay, disconnect, and reconnect fixture.', { shared: true, syncCycles: 3, disconnectReconnect: true }),
  pressFixture('press_reopen_refinish', 'Deterministic Finish, reopen, and refinish history fixture.', { reopenCycles: 1, settlementDerivations: 2 }),
  pressFixture('press_frozen_history_reload', 'Deterministic frozen RoundRecord reload and immutability fixture.', { frozen: true, reloads: 2 }),
  pressFixture('press_repeated_settlement', 'Deterministic repeated Press settlement derivation fixture.', { settlementDerivations: 3, expectedDuplicateTransactions: 0 }),
];
