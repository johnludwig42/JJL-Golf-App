import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
function fixture(){const data=scrambleFixture();data.match.selectedGames=[{key:'flamtana_special',tieMethod:'split',picks:Object.fromEntries(data.players.map((p,i)=>[p.id,1+Math.floor(i/2)]))}];return data;}
test('Flamtana display strokes use the lowest of all four teams including teams outside the visible foursome',()=>{
 const engine=loadLiveEngine(),metrics={players:[1,2,3,4].flatMap((team,i)=>[0,1].map(()=>({team,courseHdcp:[20,25,2,5][i]})))};
 assert.equal(engine.getFlamtanaDisplayStrokes(metrics,metrics.players[0],1),1);
 assert.equal(engine.getFlamtanaDisplayStrokes(metrics,metrics.players[0],18),1);
 assert.equal(engine.getFlamtanaDisplayStrokes(metrics,metrics.players[4],1),0);
 metrics.players[4].courseHdcp=-2;metrics.players[5].courseHdcp=-2;
 assert.equal(engine.getFlamtanaDisplayStrokes(metrics,metrics.players[0],1),2);
});
test('Flamtana classic uses standard scorecard markup with four explicit team rows, full Course Net and Pending preservation',()=>{
 const engine=loadLiveEngine(),data=fixture();data.match.players.forEach(p=>p.scores[0].gross=4);data.match.players[1].scores[0].gross=5;
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0],metrics=engine.computeMatchMetrics(match),before=JSON.stringify(match);
 assert.match(engine.buildClassicScorecard(match,null),/Team scorecard unavailable/);
 const html=engine.buildClassicScorecardPanel(match,metrics,{readOnly:true});
 assert.match(html,/class="scorecard-table scorecard-no-team-col"/);assert.match(html,/>Team<\/th>/);assert.match(html,/Pending/);assert.match(html,/each team.*full Course Handicap/);assert.ok(!html.includes('data-scorecard-net-view'));
 assert.equal((html.match(/Tee:/g)||[]).length,4);assert.equal((html.match(/scorecard-sticky-name"><strong>First/g)||[]).length,1);assert.equal(JSON.stringify(match),before);
 data.match.selectedGames=[];const ordinary=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];assert.match(engine.buildClassicScorecard(ordinary,engine.computeMatchMetrics(ordinary)),/quick-scoreboard-table/);
});
