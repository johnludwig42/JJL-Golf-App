import test from 'node:test';
import assert from 'node:assert/strict';
import '../ledger-report/stroke-play.js';
import {reportFixture} from './support/report-fixtures.js';
const {buildStrokePlaySummary,strokePlayCallout,strokePlayChart,strokePlayStrip,handicapTable}=globalThis.DYE_LEDGER_STROKE_REPORT;
const reference=()=>JSON.parse(JSON.stringify(reportFixture(0).report));

test('Southern Dunes report follows the appendix playing allocations, not course net',()=>{
  const round=reference(),game=round.games.find(game=>game.featured),summary=buildStrokePlaySummary(game,round);
  assert.deepEqual(summary.rows.map(row=>row.total),[70,71,72,70]);
  assert.deepEqual(summary.rows.map(row=>row.position),['T1','3','4','T1']);
  assert.deepEqual(summary.rows.map(row=>row.strokes.reduce((a,b)=>a+b,0)),[6,0,5,5]);
  assert.equal(round.players[0].gross.reduce((s,g,i)=>s+g-round.players[0].strokes.courseNet[i],0),55);
  assert.equal(summary.leadFixed,14);
  // Manual appendix check: Hush 4+4+5+5=18; Magic 3+4+3+3=13.
  assert.deepEqual(summary.swing,{start:6,end:9,gain:5,winnerId:'T4',leaderId:'T2'});
  assert.deepEqual(summary.rows[3].scores.slice(12,15),[3,3,3]);
  assert.equal(summary.rows[0].positions[6],'T1');
  assert.equal(summary.rows[3].positions[14],'T1');
  const text=strokePlayCallout(summary,round);
  assert.match(text,/tied at 70/);assert.match(text,/established at hole 15/);
  assert.match(text,/matched each other 5–4–4/);
  assert.doesNotMatch(text,/takes the lead at hole 7|17 under|net 2–2–2/);
});

test('gross plots use the same leader-gap view without handicap dots',()=>{
  const round=reference(),game=round.games.find(game=>game.featured);
  game.basis='gross';game.seriesByHole.forEach(row=>row.scores=row.gross.slice());
  const summary=buildStrokePlaySummary(game,round);
  assert.deepEqual(summary.rows.map(row=>row.total),[76,71,77,75]);
  assert.equal(summary.ranked[0].name,'Hush & Lud');
  assert.ok(!strokePlayStrip(summary,round,'par').includes('handicap strokes'));
  assert.equal(summary.basis,'Gross');
});

test('leader gaps and positions retain ties and exclude uncontested holes',()=>{
  const round=reference(),game=round.games.find(game=>game.featured);
  game.seriesByHole[0].scores[17]=null;
  const summary=buildStrokePlaySummary(game,round);
  assert.equal(summary.complete,false);assert.equal(summary.leadFixed,-1);assert.equal(summary.swing,null);
  assert.ok(summary.rows.every(row=>row.behind[17]===null&&row.positions[17]==='—'));
  assert.match(strokePlayCallout(summary,round),/provisional/);
  game.seriesByHole.forEach(row=>row.scores=round.holes.map(()=>null));
  const empty=buildStrokePlaySummary(game,round);
  assert.deepEqual(empty.winners,[]);assert.ok(empty.rows.every(row=>row.position==='—'));
});

test('lead fixed uses the final leader set, including ties, from its first permanent hole',()=>{
  const round={holes:[1,2,3,4],card:{par:[4,4,4,4]},players:[],sides:{a:{name:'A'},b:{name:'B'}}};
  const game={id:'test',type:'strokeplay',basis:'gross',seriesByHole:[{id:'a',name:'A',scores:[3,4,5,4],pars:round.card.par},{id:'b',name:'B',scores:[4,3,5,4],pars:round.card.par}]};
  const summary=buildStrokePlaySummary(game,round);
  assert.equal(summary.leadFixed,1);assert.deepEqual(summary.rows[0].positions,['1','T1','T1','T1']);
  game.seriesByHole[1].scores=[4,4,5,4];assert.equal(buildStrokePlaySummary(game,round).leadFixed,0);
});

test('individual net report is off-low without changing the saved app scoring or course-net appendix',()=>{
  const {engine,live,metrics}=reportFixture(32);
  live.featuredCompetition='stroke_net';live.selectedGames=[];
  const before=JSON.stringify(live),appTotals=Array.from(metrics.players,row=>row.leaderboardNetTotal);
  const round=engine.buildLedgerEntryReportModel(live,metrics),game=round.games.find(game=>game.featured);
  assert.match(game.allowance.label,/Off lowest/);
  for(const player of round.players){
    assert.deepEqual(Array.from(player.strokes[game.allowance.key]),Array.from(player.strokes.featured));
    assert.ok(player.strokes.courseNet.reduce((a,b)=>a+b,0)>=player.ph);
  }
  assert.equal(JSON.stringify(live),before);
  assert.deepEqual(Array.from(engine.computeMatchMetrics(live).players,row=>row.leaderboardNetTotal),appTotals);
});

test('the chart draws integer ticks, every hole/par and dashed overlapping runs',()=>{
  const round=reference(),summary=buildStrokePlaySummary(round.games.find(g=>g.featured),round),chart=strokePlayChart(summary,round);
  assert.match(chart,/data-overlap="true"[^>]*stroke-dasharray/);
  assert.ok([...chart.matchAll(/data-grid-tick="([^"]+)"/g)].every(match=>/^\d+$/.test(match[1])));
  assert.equal((chart.match(/data-entry-legend=/g)||[]).length,4);
  assert.match(chart,/Hole<\/text>/);assert.match(chart,/The swing · 7–10/);
  assert.equal(buildStrokePlaySummary({type:'nassau'},round),null);
  assert.equal(buildStrokePlaySummary({type:'strokeplay',overviewOnly:true},round),null);
});

test('counting strokes reconcile to net scores for best-ball and aggregate teams',()=>{
  for(const i of [1,2,3,4,5]){
    const {report}=reportFixture(i),game=report.games.find(g=>g.featured);
    game.seriesByHole.forEach(row=>row.scores.forEach((score,hole)=>{
      assert.equal(row.gross[hole]-row.strokes[hole],score);
      assert.equal(row.countingPlayerIds[hole].length,game.scoringMode==='aggregate'?report.players.filter(player=>player.side===row.id).length:1);
    }));
  }
});

test('handicap columns collapse only for matching values and preserve per-game footnotes',()=>{
  const round=reference(),game=round.games[0];
  round.games.push({...game,id:'other',name:'Other Stroke',allowance:{...game.allowance,label:'Alternate allowance'}});
  assert.equal((handicapTable(round,game).match(/<th>Match Handicap<\/th>/g)||[]).length,1);
  round.games[1].handicaps={...game.handicaps,p0:9};
  const table=handicapTable(round,game);assert.match(table,/<th>Other Stroke<\/th>/);assert.doesNotMatch(table,/<th>Match Handicap<\/th>/);
  assert.match(table,/White \/ Blue/);
});

test('story generation and canonical lead-fixed data use the same report basis',()=>{
  const {engine,live,metrics}=reportFixture(0),payload=engine.buildLedgerEntryStoryPayload(live,metrics);
  assert.equal(payload.authoritativeFacts.strokePlay.leadFixedHole,15);
  assert.deepEqual(Array.from(payload.authoritativeFacts.strokePlay.leaderboard,row=>row.value),[70,70,71,72]);
  assert.match(payload.reportCompetitionInstruction,/Do not discuss full-course net/);
  assert.equal(payload.authoritativeFacts.grossLeaderboard,undefined);
  assert.deepEqual(Array.from(payload.players,row=>row.playingHandicap),[6,0,5,5]);
  const fallback=engine.buildDeterministicLedgerEntryStory(live,metrics);
  assert.match(fallback.text,/tied at 70/);assert.match(fallback.text,/hole 15/);assert.doesNotMatch(fallback.text,/17 under|tied at 55/);
});
