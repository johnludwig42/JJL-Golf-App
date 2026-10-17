import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(version=2){
 const engine=loadLiveEngine(),data=scrambleFixture(),host=engine.getSharedDeviceId();
 data.match.sharedHostDeviceId=host;data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;
 data.match.sharedParticipants.forEach(participant=>participant.userId='same-account');
 data.match.players.forEach(player=>player.assignedTeamIndex=[3,6,9,12][player.team-1]);
 data.match.selectedGames=[{key:'flamtana_special',scoringPolicyVersion:version,tieMethod:'hole18',featuredStake:20,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:Object.fromEntries(data.players.map((player,i)=>[player.id,Math.floor(i/2)+1]))}];
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 return {engine,data,match};
}
test('server-authorized rows from two devices on one account hydrate on host without inventing the first participant',()=>{
 const {engine,match}=fixture();
 const rows=Array.from({length:18},(_,hole)=>['p4','p5','p6','p7'].map(player_id=>({player_id,hole_number:hole+1,gross:4,updated_by:'same-account',updated_at:'2026-10-11T20:00:00Z'}))).flat();
 engine.mergeRemoteScoreEntriesIntoMatch(match,rows);
 assert.ok(match.players.slice(4).every(player=>player.scores.every(score=>score.gross===4)));
 assert.equal(engine.resolveRemoteScoreParticipant(match,rows[0]),'');
 assert.ok(!match.sharedSyncDiagnostics.some(row=>row.reasonCode==='JOINED_OVERWRITE_PREVENTED'));
});
test('explicit wrong participant is still rejected and explicit device resolves shared-account actor correctly',()=>{
 const {engine,match}=fixture();
 assert.equal(engine.resolveRemoteScoreParticipant(match,{device_id:'cart2',updated_by:'same-account'}),'jp');
 const wrong={player_id:'p4',hole_number:1,gross:4,participant_id:'hp',updated_by:'same-account'};
 engine.mergeRemoteScoreEntriesIntoMatch(match,[wrong]);assert.equal(match.players[4].scores[0].gross,null);
 engine.mergeRemoteScoreEntriesIntoMatch(match,[{...wrong,participant_id:'jp'}]);assert.equal(match.players[4].scores[0].gross,4);
});
test('host overrides and stale-write guards remain effective for shared-account scores',()=>{
 const {engine,match}=fixture();engine.applyTeamGrossScore(match,3,1,6);
 engine.mergeRemoteScoreEntriesIntoMatch(match,[{player_id:'p4',hole_number:1,gross:4,updated_by:'same-account'}]);
 assert.equal(match.players[4].scores[0].gross,6);
 assert.ok(match.sharedHostScoreOverrides['p4:1']);
});
test('new-policy net strokes use lowest of all four Course Handicaps, with no additional allowance',()=>{
 const {engine,match}=fixture(),metrics=engine.computeMatchMetrics(match);
 assert.deepEqual(metrics.players.filter((_,i)=>i%2===0).map(player=>engine.getFlamtanaStrokeHandicap(match,player,metrics)),[0,3,6,9]);
 assert.equal(engine.getFeaturedCompetitionStrokeAllowance(match,metrics,metrics.players[0],1),0);
 assert.equal(engine.getFeaturedCompetitionStrokeAllowance(match,metrics,metrics.players[2],1),1);
 assert.equal(engine.getFeaturedCompetitionStrokeAllowance(match,metrics,metrics.players[2],4),0);
 for(let team=1;team<=4;team++)for(let hole=1;hole<=18;hole++)engine.applyTeamGrossScore(match,team,hole,4);
 const result=engine.computeFlamtanaResults(match);assert.deepEqual(plain(result.teams.map(team=>team.scores.reduce((a,b)=>a+b,0))),[72,69,66,63]);
 assert.equal(result.teams[0].scores[0],4);assert.equal(result.teams[1].scores[0],3);assert.equal(result.teams[1].scores[3],4);
 const finished=engine.buildFinishedMatchCandidate(match).candidate,record=JSON.stringify(finished.roundRecordSnapshot),report=engine.buildLedgerEntryReportModel(finished);
 assert.equal(finished.roundRecordSnapshot.isFrozen,true);assert.equal(report.meta.flamtanaOffLow,true);
 assert.deepEqual(plain(report.players.map(player=>player.ph)),[0,3,6,9]);assert.equal(report.players[0].strokes.featured.reduce((a,b)=>a+b,0),0);
 assert.equal(report.players[0].strokes.courseNet.reduce((a,b)=>a+b,0),3);assert.equal(JSON.stringify(finished.roundRecordSnapshot),record);
});
test('existing policy retains full Course Net, and frozen legacy evidence survives new reader',()=>{
 const {engine,match,data}=fixture(1);
 for(let team=1;team<=4;team++)for(let hole=1;hole<=18;hole++)engine.applyTeamGrossScore(match,team,hole,4);
 assert.deepEqual(plain(engine.computeFlamtanaResults(match).teams.map(team=>team.scores.reduce((a,b)=>a+b,0))),[69,66,63,60]);
 const finished=engine.buildFinishedMatchCandidate(match).candidate,before=JSON.stringify(finished.roundRecordSnapshot);
 const reloaded=engine.seedState(plain({players:data.players,courses:[data.course],matches:[finished]})).matches[0];
 assert.equal(engine.usesFlamtanaOffLow(reloaded),false);engine.buildLedgerEntryReportModel(reloaded);assert.equal(JSON.stringify(reloaded.roundRecordSnapshot),before);
 assert.equal(engine.normalizeFlamtanaConfig({key:'flamtana_special'}).scoringPolicyVersion,1);
 assert.equal(engine.normalizeFlamtanaConfig().scoringPolicyVersion,3);
});
test('lowest team is determined from Course HCP on its own tee, rather than lowest assigned index',()=>{
 const {engine,data,match}=fixture();
 const alt={...data.course.tees[0],id:'alt',teeName:'Forward',rating:65,holes:data.course.tees[0].holes.map(hole=>({...hole,strokeIndex:19-hole.strokeIndex}))};
 data.course.tees.push(alt);match.courseSnapshot.tees.push(plain(alt));match.players.filter(player=>player.team===2).forEach(player=>player.teeId='alt');
 const metrics=engine.computeMatchMetrics(match),representatives=metrics.players.filter((_,i)=>i%2===0);
 assert.deepEqual(representatives.map(player=>player.courseHdcp),[3,-1,9,12]);
 assert.deepEqual(representatives.map(player=>engine.getFlamtanaStrokeHandicap(match,player,metrics)),[4,0,10,13]);
});
test('live leaderboards compare common completed holes, keep out-of-sync progress visible and never settle early',()=>{
 const {engine,match}=fixture();
 for(let team=1;team<=2;team++)for(let hole=1;hole<=5;hole++)engine.applyTeamGrossScore(match,team,hole,4);
 for(let team=3;team<=4;team++)engine.applyTeamGrossScore(match,team,1,5);
 const before=JSON.stringify(match),data=engine.buildFlamtanaLeaderboardData(match);
 const featured=data.tables[0];assert.deepEqual(plain(featured.holes),[1]);assert.equal(featured.rows.find(row=>row.id==='T1').completed,5);
 assert.equal(data.tables.find(table=>table.key==='group1').holes.length,5);assert.equal(data.tables.find(table=>table.key==='foursome').holes.length,1);
 assert.equal(data.final,false);assert.equal(JSON.stringify(match),before);assert.equal(data.calcutta.reduce((sum,row)=>sum+row.amount,0),0);
 match.players[5].scores[0].gross=6;
 const pending=engine.buildFlamtanaLeaderboardData(match);assert.equal(pending.tables[0].holes.length,0);assert.ok(pending.calcutta.every(row=>row.amount===null));
});
test('final Calcutta leaderboard uses saved amounts and remains immutable',()=>{
 const {engine,match}=fixture();for(let team=1;team<=4;team++)for(let hole=1;hole<=18;hole++)engine.applyTeamGrossScore(match,team,hole,4);
 const finished=engine.buildFinishedMatchCandidate(match).candidate,before=JSON.stringify(finished.roundRecordSnapshot),data=engine.buildFlamtanaLeaderboardData(finished);
 assert.equal(data.final,true);const amounts=finished.roundRecordSnapshot.games[0].componentResults.components.find(row=>row.key==='calcutta').amounts;
 data.calcutta.forEach(row=>assert.equal(row.amount,amounts[row.id]));assert.equal(JSON.stringify(finished.roundRecordSnapshot),before);
});
test('readiness routes shared scoring and game-pick requirements away from Players',()=>{
 const {engine}=fixture();assert.equal(engine.getSetupDestinationForReadinessItem({warning:'Two-man Scramble requires a Shared Match with assigned-player scoring.'}),'scoring');
 assert.equal(engine.getSetupDestinationForReadinessItem({warning:'Choose a team for each Calcutta pick.'}),'games');
 assert.equal(engine.getSetupDestinationForReadinessItem({label:'Sixes scoring mode'}),'games');
 assert.equal(engine.getSetupDestinationForReadinessItem({warning:'Both partners must use the same tee.'}),'players');
});
