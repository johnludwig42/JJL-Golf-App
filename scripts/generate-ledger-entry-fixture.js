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
