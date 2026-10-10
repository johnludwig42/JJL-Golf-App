import fs from 'node:fs';
import {loadLiveEngine} from './live-engine-adapter.js';
import {scrambleFixture} from '../tests/support/scramble-fixture.js';

const fixture = scrambleFixture();
fixture.match.date = '2026-10-16';
fixture.match.name = 'Flamtana Special acceptance';
fixture.course.name = 'Flamtana Layout Club';
fixture.players.forEach((player, i) => { player.name = ['John Longlastname','Phil Player','Tom Tester','Drew Driver','Morgan Backer','Lee Partner','Casey Scorer','Blair Golfer'][i]; });
fixture.match.players.forEach(player => {
  player.assignedTeamIndex = 0;
  player.scores.forEach((score, i) => { score.gross = [3,4,5,6][player.team-1] + (i % 3 === 0 ? 1 : 0); });
});
// Equal Featured totals resolved on 18; F1's series still takes each hole minimum.
fixture.match.players.filter(player => player.team === 2).forEach(player => player.scores.forEach((score, i) => { score.gross = fixture.match.players[0].scores[i].gross; }));
fixture.match.players.filter(player => player.team === 1).forEach(player => { player.scores[0].gross += 1;player.scores[17].gross -= 1; });
fixture.match.selectedGames = [{ key:'flamtana_special', scoringPolicyVersion:1, tieMethod:'hole18', featuredStake:20, groupStake:20, foursomeStake:20, calcuttaStake:20,
  picks:{p0:2,p1:2,p2:2,p3:2,p4:3,p5:3,p6:4,p7:4} }];
fixture.match.status = 'complete';
fixture.match.completedAt = '2026-10-16T18:00:00Z';
const engine = loadLiveEngine();
const state = engine.seedState({players:fixture.players,courses:[fixture.course],matches:[fixture.match]});
const match = state.matches[0], metrics = engine.computeMatchMetrics(match);
match.roundRecordSnapshot = engine.buildFrozenRoundRecord(match, metrics, match.completedAt);
const report = engine.buildLedgerEntryReportModel(match, metrics);
fs.writeFileSync('reports/ledger-entry-flamtana-fixture.js', 'globalThis.__DYE_LEDGER_ROUND__=' + JSON.stringify(report) + ';\n');
const html = fs.readFileSync('ledger-report/shell.html','utf8')
  .replaceAll("url('./fonts/", "url('../ledger-report/fonts/")
  .replaceAll('src="./', 'src="../ledger-report/')
  .replace(/(<script src="..\/ledger-report\/bootstrap.js[^>]*><\/script>)/, '$1\n<script src="./ledger-entry-flamtana-fixture.js"></script>');
fs.writeFileSync('reports/ledger-entry-flamtana.html', html);
console.log('Generated dedicated Flamtana fixture with frozen card-off evidence and eight-player settlement.');
