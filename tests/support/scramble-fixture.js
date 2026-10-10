export function scrambleFixture() {
 const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:360}));
 const course={id:'c',name:'Scramble Course',tees:[{id:'t',teeName:'White',slope:113,rating:72,par:72,holes}]};
 const players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'Golfer '+i,index:i}));
 const match={id:'r',courseId:'c',teeId:'t',courseSnapshot:course,holeCount:18,teamCount:4,playersPerTeam:2,teamNames:['First','Second','Third','Fourth'],allowance:50,teamScoringPolicyVersion:1,assignedTeamIndexPolicyVersion:1,storageMode:'shared',scoringAccessMode:'assigned_players',status:'active',selectedGames:[],roundTiming:{startedAt:'2026-10-10T12:00:00Z'},sharedHostDeviceId:'host',sharedHostParticipantId:'hp',sharedDevices:[{id:'host',name:'Host'},{id:'cart2',name:'Cart 2'}],sharedParticipants:[{participantId:'hp',deviceId:'host',deviceName:'Host'},{participantId:'jp',deviceId:'cart2',deviceName:'Cart 2'}],sharedPlayerAssignments:Object.fromEntries(players.map((p,i)=>[p.id,i<4?'hp':'jp'])),players:players.map((p,i)=>({playerId:p.id,team:Math.floor(i/2)+1,slot:i,teeId:'t',assignedTeamIndex:i<2?10:i<4?-2:0,scores:holes.map(h=>({holeNumber:h.holeNumber,gross:null}))}))};
 return {course,players,match};
}
