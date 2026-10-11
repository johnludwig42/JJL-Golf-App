import {scrambleFixture} from './scramble-fixture.js';
export function completedFixture(engine,{tracked=false,diagnostics=true,allTied=false}={}){
 const data=scrambleFixture(),host=engine.getSharedDeviceId();
 data.match.sharedHostDeviceId=host;data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;
 data.match.statTrackingEnabled=tracked;
 if(tracked){
  data.match.teamScoringPolicyVersion=0;data.match.assignedTeamIndexPolicyVersion=0;data.match.teamCount=2;
  data.match.players=data.match.players.slice(0,4);data.players=data.players.slice(0,4);data.match.storageMode='local';data.match.scoringAccessMode='single_device';
  data.match.players.forEach(player=>delete player.assignedTeamIndex);
  data.match.selectedGames=[{key:'nassau',basis:'net',stake:5}];
 }else data.match.selectedGames=[{key:'flamtana_special',tieMethod:'hole18',featuredStake:20,groupStake:20,foursomeStake:20,calcuttaStake:20,picks:Object.fromEntries(data.players.map((p,i)=>[p.id,Math.floor(i/2)+1]))}];
 if(allTied)data.match.players.forEach(player=>player.assignedTeamIndex=0);
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 match.players.forEach((player,index)=>{
  player.scores.forEach((score,hole)=>score.gross=allTied?4:4+((tracked?index:player.team)%2&&hole%3===0?1:0));
  if(tracked) player.stats.forEach((stat,hole)=>Object.assign(stat,{putts:hole%2?2:1,puttsSource:'user',fairway:true,fairwayResult:'HIT',green:true,greenResult:'ON',greenSource:'calculated',entryCompleted:true}));
 });
 match.sharedLedgerParity={parityConfirmed:true,status:'confirmed'};
 if(diagnostics)match.sharedSyncDiagnostics=Array.from({length:200},(_,i)=>({reasonCode:'REMOTE_SCORE_ACCEPTED',occurredAt:'2026-10-11T15:00:00Z',playerId:'p0',holeNumber:i%18+1,sourceParticipant:'hp',authorizedParticipantId:'hp',detail:'accepted score write'}));
 return {data,match,finished:engine.buildFinishedMatchCandidate(match,'2026-10-11T17:00:00Z').candidate};
}
