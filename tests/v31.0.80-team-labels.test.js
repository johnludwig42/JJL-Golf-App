import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {visualFixture} from './support/design-browser.js';

test('compact team labels prefer a custom name, otherwise first names with duplicate disambiguation',()=>{
 const engine=loadLiveEngine(),fixture=visualFixture();const state=engine.seedState(fixture.state),match=state.matches[0];
 match.teamNames=['  Birdie Club  ',''];assert.equal(engine.getTeamDisplayName(match,1),'Birdie Club');assert.equal(engine.getTeamDisplayName(match,2),'Casey/Drew');
 match.teamNames=['',''];state.players[0].name='John Ludwig';state.players[1].name='John Smith';assert.equal(engine.getTeamDisplayName(match,1),'John L./John S.');
 state.players[1].name='John Lewis';assert.equal(engine.getTeamDisplayName(match,1),'John Ludwig/John Lewis');
});

test('host publication carries explicit empty team names; initial remote hydration retains first-name fallback',()=>{
 const engine=loadLiveEngine(),fixture=visualFixture(),state=engine.seedState(fixture.state),match=state.matches[0];
 match.teamNames=['','Owls'];match.storageMode='shared';match.sharedMatchId='DYE-NAMES';
 const payload=engine.buildCloudMatchPayload(match,'owner');assert.deepEqual(JSON.parse(JSON.stringify(payload.matchRow.course_snapshot.sharedMatchMeta.teamNames)),['','Owls']);
 const hydrated=engine.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players,scoreEntries:payload.scoreEntries});
 assert.equal(engine.getTeamDisplayName(hydrated,1),'Alex/Blake');assert.equal(engine.getTeamDisplayName(hydrated,2),'Owls');
});

test('a live label refresh does not rewrite frozen round evidence or wager amounts',()=>{
 const engine=loadLiveEngine(),fixture=visualFixture(),state=engine.seedState(fixture.state),match=state.matches[0];
 match.players.forEach((player,index)=>player.scores.forEach(score=>score.gross=index<2?4:5));
 const metrics=engine.computeMatchMetrics(match),record=engine.buildFrozenRoundRecord(match,metrics);match.roundRecordSnapshot=record;
 const before=JSON.stringify(record),diffs=JSON.stringify(engine.computeTeamGameDiffs(match,metrics,'nassau'));
 match.teamNames=['Eagles','Owls'];
 assert.equal(JSON.stringify(match.roundRecordSnapshot),before);assert.equal(JSON.stringify(engine.computeTeamGameDiffs(match,metrics,'nassau')),diffs);
});
