import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';

function flamtanaSeed({ totals = [3,4,5,6], tieMethod = 'split', picks = {p0:1,p1:1,p2:2,p3:2,p4:3,p5:3,p6:4,p7:4} } = {}) {
 const fixture = scrambleFixture(), engine = loadLiveEngine();
 fixture.match.players.forEach(player => { player.assignedTeamIndex=0;player.scores.forEach(score=>score.gross=totals[player.team-1]); });
 fixture.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:1,tieMethod,picks}];
 const match=engine.seedState({players:fixture.players,courses:[fixture.course],matches:[fixture.match]}).matches[0];
 return {engine,match,fixture};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('Flamtana keeps four independently funded stroke-total wagers and zero-sum player settlement',()=>{
 const {engine,match}=flamtanaSeed();
 let result=engine.computeFlamtanaResults(match);
 assert.equal(result.ready,true);assert.equal(result.final,false);assert.equal(result.components.length,5);
 assert.ok(result.components.every(component=>Object.values(component.amounts).every(value=>value===0)));
 match.status='complete';match.completedAt='2026-10-10T16:00:00Z';result=engine.computeFlamtanaResults(match);
 assert.equal(result.final,true);
 assert.deepEqual(plain(result.components.map(component=>component.result.winnerIds)),[['T1'],['T1'],['T3'],['F1'],['T1']]);
 assert.deepEqual(plain(result.components[0].amounts),{p0:60,p1:60,p2:-20,p3:-20,p4:-20,p5:-20,p6:-20,p7:-20});
 assert.deepEqual(plain(result.components[1].amounts),{p0:20,p1:20,p2:-20,p3:-20});
 result.components.forEach(component=>assert.ok(Math.abs(Object.values(component.amounts).reduce((sum,value)=>sum+value,0))<1e-9));
 const payouts=engine.computeLivePayoutGames(match,engine.computeMatchMetrics(match));assert.equal(payouts.length,5);assert.ok(payouts.every(row=>row.sourceKey==='flamtana_special'));
});

test('foursome scores sum each hole minimum, preserve nulls, and own an independent series',()=>{
 const {engine,match}=flamtanaSeed({totals:[6,6,6,6]});
 match.players.forEach(player=>{player.scores[0].gross=player.team===1?3:player.team===2?6:5;player.scores[1].gross=player.team===1?6:player.team===2?3:5;});
 const result=engine.computeFlamtanaResults(match);
 assert.deepEqual(plain(result.foursomes[0].scores.slice(0,2)),[3,3]);
 match.players[1].scores[0].gross=4;
 const pending=engine.computeFlamtanaResults(match);assert.equal(pending.foursomes[0].scores[0],null);assert.equal(pending.ready,false);
 assert.equal(engine.areAllGamesFinal(match,engine.computeMatchMetrics(match)),false);
 const progress=engine.getScrambleFoursomeProgress(match);assert.equal(progress[0].completed,17);assert.equal(progress[1].completed,18);
});

test('card-off compares saved series only at finalization and retains exhausted-tie evidence',()=>{
 const engine=loadLiveEngine(),a=Array(18).fill(4),b=Array(18).fill(4);a[0]=5;a[17]=3;
 const series=[{id:'A',scores:a},{id:'B',scores:b}];
 for(const method of ['hole18','back9','last6']){
  assert.deepEqual(plain(engine.resolveFlamtanaStrokeResult(series,method,false).winnerIds),['A','B']);
  const final=engine.resolveFlamtanaStrokeResult(series,method,true);assert.deepEqual(plain(final.winnerIds),['A']);assert.equal(final.evidence.length,2);
  const tied=engine.resolveFlamtanaStrokeResult([{id:'A',scores:b},{id:'B',scores:b}],method,true);assert.equal(tied.split,true);assert.ok(tied.evidence.length>1);
 }
 assert.deepEqual(plain(engine.resolveFlamtanaStrokeResult(series,'split',true).winnerIds),['A','B']);
});

test('finalization applies card-off to Featured, both Group totals and the distinct Foursome series',()=>{
 const {engine,match}=flamtanaSeed({totals:[4,4,4,4],tieMethod:'hole18'});
 match.players.filter(player=>player.team===1).forEach(player=>{player.scores[0].gross=5;player.scores[17].gross=3;});
 match.players.filter(player=>player.team===3).forEach(player=>{player.scores[1].gross=5;player.scores[16].gross=3;});
 let result=engine.computeFlamtanaResults(match);
 assert.deepEqual(plain(result.components[0].result.winnerIds),['T1','T2','T3','T4']);
 assert.deepEqual(plain(result.components[3].result.winnerIds),['F1','F2']);
 match.status='complete';match.completedAt='2026-10-16T16:00:00Z';result=engine.computeFlamtanaResults(match);
 assert.deepEqual(plain(result.components.map(component=>component.result.winnerIds)),[['T1'],['T1'],['T3'],['F1'],['T1']]);
 assert.equal(result.components[2].result.evidence.at(-1).label,'Hole 17');
 assert.equal(result.components[3].result.evidence.at(-1).label,'Hole 18');
 assert.deepEqual(plain(result.components[3].result.evidence[0].totals),[{id:'F1',total:71},{id:'F2',total:71}]);
});

test('Calcutta divides tied pool by teams then backers and pays unbacked partners with exact cents',()=>{
 const picks={p0:2,p1:2,p2:2,p3:2,p4:2,p5:2,p6:2,p7:2};
 const {engine,match}=flamtanaSeed({picks});match.status='complete';match.completedAt='2026-10-10T16:00:00Z';
 let result=engine.computeFlamtanaResults(match),calcutta=result.components.at(-1);
 assert.deepEqual(plain(calcutta.amounts),{p0:60,p1:60,p2:-20,p3:-20,p4:-20,p5:-20,p6:-20,p7:-20});assert.equal(calcutta.result.shares[0].unbacked,true);
 match.players.filter(player=>player.team===2).forEach(player=>player.scores.forEach(score=>score.gross=3));
 result=engine.computeFlamtanaResults(match);calcutta=result.components.at(-1);
 assert.equal(calcutta.result.shares.length,2);assert.deepEqual(plain(calcutta.result.shares.map(share=>share.grossPoolShare)),[80,80]);
 assert.equal(calcutta.amounts.p0,30);assert.equal(calcutta.amounts.p2,-10);
 match.selectedGames[0].calcuttaStake=19.99;assert.equal(engine.getFlamtanaSetupError(match,{requirePicks:true}),'');
 assert.ok(Math.abs(Object.values(engine.computeFlamtanaResults(match).components.at(-1).amounts).reduce((sum,value)=>sum+value,0))<1e-9);
});

test('Flamtana blocks missing picks and invalid formats, survives cloud reload, and freezes result evidence',()=>{
 const {engine,match}=flamtanaSeed();delete match.selectedGames[0].picks.p7;
 assert.match(engine.getScrambleSetupError(match,{assignments:true}),/eight golfers/);
 assert.equal(engine.computeFlamtanaResults(match).valid,false);
 match.selectedGames[0].picks.p7=4;
 const payload=engine.buildCloudMatchPayload(match),reader=loadLiveEngine();reader.seedState({players:[],courses:[],matches:[]});
 assert.deepEqual(plain(payload.matchRow.course_snapshot.sharedMatchMeta.flamtanaConfig.picks),plain(match.selectedGames[0].picks));
 const remote=reader.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players,scoreEntries:match.players.flatMap(player=>player.scores.map(score=>({player_id:player.playerId,hole_number:score.holeNumber,gross:score.gross})))});
 assert.deepEqual(plain(remote.selectedGames[0].picks),plain(match.selectedGames[0].picks));assert.equal(reader.computeFlamtanaResults(remote).ready,true);
 match.status='complete';match.completedAt='2026-10-10T16:00:00Z';
 const metrics=engine.computeMatchMetrics(match),record=engine.buildFrozenRoundRecord(match,metrics);
 assert.equal(record.games[0].componentResults.final,true);assert.ok(record.games[0].componentResults.components.every(component=>component.result.evidence.length));
 match.roundRecordSnapshot=record;
 const report=engine.buildLedgerEntryReportModel(match,metrics);assert.equal(report.players.length,4);assert.equal(report.settlementPlayers.length,8);assert.equal(report.games.length,5);
 assert.ok(report.games.slice(0,4).every(game=>game.type==='strokeplay'));assert.deepEqual(plain(report.games[3].seriesByHole.map(series=>series.id)),['F1','F2']);
 assert.deepEqual(Object.keys(report.players[0]).sort(),['ch','gross','id','index','memberIds','name','ph','postable','side','statistics','strokes','tee']);
 assert.match(report.meta.recap,/Featured, Group, Foursome and Calcutta/);assert.ok(report.payments.length>0);
 const storyFacts=engine.buildRoundRecapPayload(match,metrics);
 assert.equal(storyFacts.individualStatisticsEligible,false);assert.equal(storyFacts.wagers.length,5);assert.equal(storyFacts.foursomes.length,2);assert.equal(storyFacts.final,true);
 const savedReport=plain(report.players),savedEvidence=plain(report.meta.flamtanaEvidence);
 match.players.forEach(player=>{player.assignedTeamIndex=30;player.scores.forEach(score=>score.gross=9);});
 match.teamNames=['Changed','Changed','Changed','Changed'];match.selectedGames[0].picks.p0=4;
 const unchanged=engine.buildLedgerEntryReportModel(match);
 assert.deepEqual(plain(unchanged.players),savedReport);assert.deepEqual(plain(unchanged.meta.flamtanaEvidence),savedEvidence);
 assert.deepEqual(plain(engine.buildRoundRecapPayload(match,engine.computeMatchMetrics(match)).wagers),plain(storyFacts.wagers));
});

test('Flamtana uses signed full team handicaps once, including more than eighteen strokes',()=>{
 const {engine,match}=flamtanaSeed({totals:[6,6,6,6]});
 match.players.forEach(player=>player.assignedTeamIndex=[35,-2,10,0][player.team-1]);
 const result=engine.computeFlamtanaResults(match);
 assert.deepEqual(plain(result.teams.map(team=>team.scores.reduce((sum,value)=>sum+value,0))),[73,110,98,108]);
 assert.deepEqual(plain(result.foursomes.map(group=>group.scores.reduce((sum,value)=>sum+value,0))),[73,98]);
});

test('cloud score rows carry unequal and partial pairs to a second device and block both freeze paths',()=>{
 const fixture=scrambleFixture(), writer=loadLiveEngine();
 const match=writer.seedState({players:fixture.players,courses:[fixture.course],matches:[fixture.match]}).matches[0];
 match.players.forEach(p=>p.scores.forEach(s=>s.gross=4));
 match.players[1].scores[0].gross=5;
 const payload=writer.buildCloudMatchPayload(match);
 const scoreEntries=match.players.flatMap(p=>p.scores.map(s=>({player_id:p.playerId,hole_number:s.holeNumber,gross:s.gross})));
 const reader=loadLiveEngine();reader.seedState({players:[],courses:[],matches:[]});
 const remote=reader.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players,scoreEntries});
 for(const [engine,round] of [[writer,match],[reader,remote]]){
  assert.equal(engine.getScrambleTeamHoleScore(round,1,1).inconsistent,true);
  assert.equal(engine.getRoundCompletionState(round,engine.computeMatchMetrics(round)).isComplete,false);
  assert.equal(engine.areAllGamesFinal(round,engine.computeMatchMetrics(round)),false);
  round.status='complete';round.completedAt='2026-10-10T16:00:00Z';
  assert.equal(engine.canFreezeRoundRecord(round,engine.computeMatchMetrics(round)),false);
 }
 // Give the independently hydrated reader host authority: equality must still gate it.
 remote.sharedHostDeviceId=reader.getSharedDeviceId();
 assert.equal(reader.isCurrentDeviceMatchHost(remote),true);
 assert.equal(reader.canFreezeRoundRecord(remote,reader.computeMatchMetrics(remote)),false);
 remote.players[1].scores[0].gross=4;
 assert.equal(reader.canFreezeRoundRecord(remote,reader.computeMatchMetrics(remote)),true);
 const partial=reader.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players,scoreEntries:scoreEntries.filter(s=>!(s.player_id==='p1'&&s.hole_number===1))});
 assert.equal(reader.getScrambleTeamHoleScore(partial,1,1).inconsistent,true);
 assert.equal(reader.canFreezeRoundRecord(partial,reader.computeMatchMetrics(partial)),false);
});

test('a pre-Start joined scorer receives host Start and saved picks without changing frozen rounds',()=>{
 const {engine,match}=flamtanaSeed();
 match.roundTiming={startedAt:null};match.selectedGames=[];
 const config={key:'flamtana_special',scoringPolicyVersion:1,tieMethod:'last6',picks:Object.fromEntries(match.players.map(player=>[player.playerId,player.team]))};
 const meta={flamtanaConfig:config,roundTiming:{startedAt:'2026-10-16T12:00:00Z'}};
 assert.equal(engine.applySharedScrambleSetupMetadata(match,meta),true);
 assert.equal(match.roundTiming.startedAt,meta.roundTiming.startedAt);assert.equal(match.selectedGames[0].tieMethod,'last6');
 assert.equal(engine.getScrambleSetupError(match,{assignments:true}),'');assert.equal(engine.applySharedScrambleSetupMetadata(match,meta),false);
 match.status='complete';match.completedAt='2026-10-16T16:00:00Z';match.roundRecordSnapshot=engine.buildFrozenRoundRecord(match,engine.computeMatchMetrics(match));
 const before=JSON.stringify(match);assert.equal(engine.applySharedScrambleSetupMetadata(match,{flamtanaConfig:null,roundTiming:{startedAt:'later'}}),false);assert.equal(JSON.stringify(match),before);
});

test('incremental score refresh on another device preserves Pending until the matching partner arrives',()=>{
 const {engine,match}=flamtanaSeed();
 const incoming=(playerId,gross,time)=>({player_id:playerId,hole_number:18,gross,participant_id:'jp',device_id:'cart2',updated_at:time});
 assert.equal(engine.mergeRemoteScoreEntriesIntoMatch(match,[incoming('p4',4,'2026-10-16T16:00:00Z')]),true);
 assert.equal(engine.getScrambleTeamHoleScore(match,3,18).inconsistent,true);
 assert.equal(engine.computeFlamtanaResults(match).ready,false);
 const issues=engine.getMissingScoreEntries(match,engine.computeMatchMetrics(match));
 assert.equal(issues.length,1);assert.equal(issues[0].team,3);assert.equal(issues[0].holeNumber,18);assert.match(issues[0].type,/re-enter team score to resolve/);
 match.status='complete';match.completedAt='2026-10-16T16:30:00Z';
 assert.equal(engine.canFreezeRoundRecord(match,engine.computeMatchMetrics(match)),false);
 assert.equal(engine.mergeRemoteScoreEntriesIntoMatch(match,[incoming('p5',4,'2026-10-16T16:01:00Z')]),true);
 assert.equal(engine.getScrambleTeamHoleScore(match,3,18).inconsistent,false);
 assert.equal(engine.computeFlamtanaResults(match).ready,true);
});
