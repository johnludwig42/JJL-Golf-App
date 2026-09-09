import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('ledger-report', 'shell.html'), 'utf8');
const html = source
  .replaceAll('url(\'./fonts/', 'url(\'../ledger-report/fonts/')
  .replaceAll('src="./bootstrap.js', 'src="../ledger-report/bootstrap.js')
  .replaceAll('src="./pack.js', 'src="../ledger-report/pack.js')
  .replaceAll('src="./engines.js', 'src="../ledger-report/engines.js')
  .replaceAll('src="./report.js', 'src="../ledger-report/report.js');
const output = resolve('reports', 'ledger-entry-v31.0.02-reference.html');
writeFileSync(output, html, 'utf8');
console.log(`Generated ${output} from the production Ledger Entry shell.`);

const holes = Array.from({ length: 18 }, (_, index) => index + 1);
const par = holes.map((_, index) => [4, 4, 3, 5][index % 4]);
const pointPatterns = [[5, 3, 1], [3, 5, 1], [1, 3, 5]];
const playerIds = ['john', 'phil', 'tom'];
const pointsByHole = Object.fromEntries(playerIds.map((id, playerIndex) => [id,
  holes.map((_, holeIndex) => pointPatterns[holeIndex % pointPatterns.length][playerIndex]),
]));
const zeroStrokes = holes.map(() => 0);
const ninePointRound = {
  meta: { course: 'Nine Point Layout Club', layout: 'Blue', date: '2026-09-02', story: 'John, Phil and Tom traded points throughout a tightly matched 9-Point round.', primaryMatchStatus: '9-Point Game: Phil 66 · John 54 · Tom 42' },
  holes,
  card: { yds: holes.map((_, index) => 340 + index * 8), par, si: holes },
  sides: {},
  players: playerIds.map((id, index) => ({
    id, name: ['John Longlastname', 'Phil Player', 'Tom Tester'][index], side: 'FIELD', tee: 'Blue', index: 0, ch: 0, ph: 0,
    gross: par.map((value, holeIndex) => value + ((holeIndex + index) % 3 === 0 ? 1 : 0)),
    strokes: { courseNet: zeroStrokes, featured: zeroStrokes, offLow: zeroStrokes },
  })),
  games: [{
    id: 'nine-point', name: '9-Point Game', type: 'ninepoint', featured: true, scope: 'individual', unit: 'points', lowWins: false,
    playerIds, basis: 'net', allowance: { key: 'featured', label: 'Game Net' }, pointValue: 1, settlementMode: 'headToHead',
    pointsByHole, segments: [{ label: 'Round', holes }], money: { john: 0, phil: 36, tom: -36 },
  }],
  memories: [], payments: [],
};
const fixtureScript = resolve('reports', 'ledger-entry-nine-point-fixture.js');
writeFileSync(fixtureScript, `globalThis.__DYE_LEDGER_ROUND__=${JSON.stringify(ninePointRound)};\n`, 'utf8');
const ninePointHtml = html.replace(
  /(<script src="\.\.\/ledger-report\/bootstrap\.js[^>]*><\/script>)/,
  '$1\n<script src="./ledger-entry-nine-point-fixture.js"></script>',
);
const ninePointOutput = resolve('reports', 'ledger-entry-v31.0.33-nine-point.html');
writeFileSync(ninePointOutput, ninePointHtml, 'utf8');
console.log(`Generated ${ninePointOutput} with a dedicated three-player 9-Point round.`);

const sixesIds = ['john', 'phil', 'tom', 'drew'];
const sixesNames = ['John Longlastname', 'Phil Player', 'Tom Tester', 'Drew Driver'];
const rotations = [
  [['john', 'phil'], ['tom', 'drew']],
  [['john', 'tom'], ['phil', 'drew']],
  [['john', 'drew'], ['phil', 'tom']],
];
const sixesSegments = rotations.map((pairing, segmentIndex) => {
  const segmentHoles = holes.slice(segmentIndex * 6, segmentIndex * 6 + 6);
  let holesWonA = 0;
  let holesWonB = 0;
  const results = segmentHoles.map((holeNumber, offset) => {
    const aScore = 3 + ((offset + segmentIndex) % 3);
    const bScore = 3 + ((offset + segmentIndex + 1) % 3);
    const winner = aScore < bScore ? 'A' : bScore < aScore ? 'B' : 'halved';
    if (winner === 'A') holesWonA += 1;
    if (winner === 'B') holesWonB += 1;
    return { holeNumber, completed: true, aScore, bScore, winner };
  });
  const winner = holesWonA > holesWonB ? 'A' : holesWonB > holesWonA ? 'B' : 'halved';
  const side = ids => ({ playerIds: ids, label: ids.map(id => sixesNames[sixesIds.indexOf(id)]).join(' & ') });
  const amounts = Object.fromEntries(sixesIds.map(id => [id, 0]));
  if (winner !== 'halved') {
    const winningIds = winner === 'A' ? pairing[0] : pairing[1];
    const losingIds = winner === 'A' ? pairing[1] : pairing[0];
    winningIds.forEach(id => { amounts[id] = 5; });
    losingIds.forEach(id => { amounts[id] = -5; });
  }
  return {
    label: `Segment ${segmentIndex + 1}`, holes: segmentHoles, sideA: side(pairing[0]), sideB: side(pairing[1]),
    winner, statusText: winner === 'halved' ? 'Halved' : `${side(winner === 'A' ? pairing[0] : pairing[1]).label} won`,
    holesWonA, holesWonB, decided: true, complete: true, amounts, results,
  };
});
const sixesRound = {
  meta: { course: 'Sixes Layout Club', layout: 'Blue', date: '2026-09-07', story: 'Four golfers rotated partners across three close six-hole matches.', primaryMatchStatus: 'Sixes · Segment matches · all three decided' },
  holes,
  card: { yds: holes.map((_, index) => 350 + index * 7), par, si: holes },
  sides: {},
  players: sixesIds.map((id, index) => ({
    id, name: sixesNames[index], side: 'FIELD', tee: 'Blue', index: 0, ch: 0, ph: 0,
    gross: par.map((value, holeIndex) => value + ((holeIndex + index) % 4 === 0 ? 1 : 0)),
    strokes: { courseNet: zeroStrokes, featured: zeroStrokes, offLow: zeroStrokes },
  })),
  games: [{
    id: 'sixes', name: 'Sixes (6-6-6)', type: 'sixes', featured: true, scope: 'team', unit: 'segments', lowWins: false, mode: 'segments',
    playerIds: sixesIds, basis: 'net', allowance: { key: 'featured', label: '90% Game Net' }, stakePerSegment: 5,
    teamScoringMode: 'best_ball', segmentResultMode: 'match', segments: sixesSegments,
    totals: { john: 12, phil: 8, tom: 8, drew: 8 },
    pointsByHole: Object.fromEntries(sixesIds.map(id => [id, sixesSegments.flatMap(segment => segment.results.map(result => result.completed && (result.winner === 'A' ? segment.sideA.playerIds : result.winner === 'B' ? segment.sideB.playerIds : []).includes(id) ? 1 : 0))])),
    money: { john: 15, phil: -5, tom: -5, drew: -5 },
  }],
  memories: [], payments: [{ from: 'phil', to: 'john', amt: 5 }, { from: 'tom', to: 'john', amt: 5 }, { from: 'drew', to: 'john', amt: 5 }],
};
const sixesFixtureScript = resolve('reports', 'ledger-entry-sixes-fixture.js');
writeFileSync(sixesFixtureScript, `globalThis.__DYE_LEDGER_ROUND__=${JSON.stringify(sixesRound)};\n`, 'utf8');
const sixesHtml = html.replace(
  /(<script src="\.\.\/ledger-report\/bootstrap\.js[^>]*><\/script>)/,
  '$1\n<script src="./ledger-entry-sixes-fixture.js"></script>',
);
const sixesOutput = resolve('reports', 'ledger-entry-v31.0.40-sixes.html');
writeFileSync(sixesOutput, sixesHtml, 'utf8');
console.log(`Generated ${sixesOutput} with a dedicated four-player Sixes round.`);

const sixesPointsRound = JSON.parse(JSON.stringify(sixesRound));
sixesPointsRound.meta.primaryMatchStatus = 'Sixes: John 12 · Phil / Tom / Drew 8 pts thru 18';
sixesPointsRound.games[0].mode = 'points';
sixesPointsRound.games[0].unit = 'points';
sixesPointsRound.games[0].scope = 'individual';
sixesPointsRound.games[0].pointValue = 1;
sixesPointsRound.games[0].pointsPerHoleWin = 1;
sixesPointsRound.games[0].settlementMode = 'headToHead';
sixesPointsRound.games[0].segments.forEach(segment => { segment.amounts = Object.fromEntries(sixesIds.map(id => [id, 0])); });
sixesPointsRound.games[0].money = { john: 12, phil: -4, tom: -4, drew: -4 };
sixesPointsRound.payments = [{ from: 'phil', to: 'john', amt: 4 }, { from: 'tom', to: 'john', amt: 4 }, { from: 'drew', to: 'john', amt: 4 }];
const sixesPointsFixtureScript = resolve('reports', 'ledger-entry-sixes-points-fixture.js');
writeFileSync(sixesPointsFixtureScript, `globalThis.__DYE_LEDGER_ROUND__=${JSON.stringify(sixesPointsRound)};\n`, 'utf8');
const sixesPointsHtml = html.replace(/(<script src="\.\.\/ledger-report\/bootstrap\.js[^>]*><\/script>)/, '$1\n<script src="./ledger-entry-sixes-points-fixture.js"></script>');
const sixesPointsOutput = resolve('reports', 'ledger-entry-v31.0.40-sixes-points.html');
writeFileSync(sixesPointsOutput, sixesPointsHtml, 'utf8');
console.log(`Generated ${sixesPointsOutput} with a dedicated Sixes player-points round.`);

const wolfRound = JSON.parse(JSON.stringify(sixesPointsRound));
wolfRound.meta.course = 'Wolf Layout Club';
wolfRound.meta.date = '2026-09-08';
wolfRound.meta.story = 'Four golfers rotated as Wolf, chose partners, and settled the recorded point differentials.';
wolfRound.meta.primaryMatchStatus = 'Wolf: John 12 · Phil 8 · Tom 5 · Drew 3 pts thru 18';
const wolfPoints = { john: Array(18).fill(0), phil: Array(18).fill(0), tom: Array(18).fill(0), drew: Array(18).fill(0) };
const wolfHoles = holes.map((holeNumber, index) => {
  const wolfPlayerId = sixesIds[index % 4];
  const partnerPlayerId = sixesIds[(index + 1) % 4];
  const winner = index % 5 === 4 ? 'tied' : index % 2 === 0 ? 'wolf' : 'opponents';
  if (winner === 'wolf') { wolfPoints[wolfPlayerId][index] = 1; wolfPoints[partnerPlayerId][index] = 1; }
  if (winner === 'opponents') sixesIds.filter(id => ![wolfPlayerId, partnerPlayerId].includes(id)).forEach(id => { wolfPoints[id][index] = 1; });
  return { holeNumber, wolfPlayerId, choice: 'partner', partnerPlayerId, winner, resolved: true };
});
const wolfTotals = Object.fromEntries(sixesIds.map(id => [id, wolfPoints[id].reduce((sum, value) => sum + value, 0)]));
const wolfMoney = Object.fromEntries(sixesIds.map(id => [id, 0]));
sixesIds.forEach((first, index) => sixesIds.slice(index + 1).forEach(second => {
  const amount = wolfTotals[first] - wolfTotals[second];
  wolfMoney[first] += amount; wolfMoney[second] -= amount;
}));
wolfRound.games = [{
  id:'wolf', name:'Wolf', type:'wolf', featured:true, scope:'individual', unit:'points', lowWins:false,
  playerIds:sixesIds, basis:'net', allowance:{key:'featured',label:'100% Game Net'}, pointValue:1,
  settlementMode:'headToHead', totals:wolfTotals, pointsByHole:wolfPoints, holes:wolfHoles,
  money:wolfMoney,
}];
wolfRound.meta.primaryMatchStatus = `Wolf: ${sixesIds.map(id=>`${sixesNames[sixesIds.indexOf(id)].split(' ')[0]} ${wolfTotals[id]}`).join(' · ')} pts thru 18`;
wolfRound.payments = [];
const wolfFixtureScript = resolve('reports', 'ledger-entry-wolf-fixture.js');
writeFileSync(wolfFixtureScript, `globalThis.__DYE_LEDGER_ROUND__=${JSON.stringify(wolfRound)};\n`, 'utf8');
const wolfHtml = html.replace(/(<script src="\.\.\/ledger-report\/bootstrap\.js[^>]*><\/script>)/, '$1\n<script src="./ledger-entry-wolf-fixture.js"></script>');
const wolfOutput = resolve('reports', 'ledger-entry-v31.0.42-wolf.html');
writeFileSync(wolfOutput, wolfHtml, 'utf8');
console.log(`Generated ${wolfOutput} with a dedicated four-player Wolf round.`);
