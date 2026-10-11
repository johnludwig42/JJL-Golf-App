import {loadLiveEngine} from '../../scripts/live-engine-adapter.js';
export function pressReportFixture({badStory=false,frozen=true}={}){
 const engine=loadLiveEngine(),pars=[4,4,5,3,4,3,5,4,4,4,4,3,5,4,3,4,4,5],si=[12,14,8,16,10,18,4,6,2,5,11,15,7,1,17,13,3,9],yds=[410,405,590,215,363,181,520,398,433,384,369,192,572,460,200,401,433,547];
 const holes=pars.map((par,i)=>({holeNumber:i+1,par,strokeIndex:si[i],yardage:yds[i]}));
 // Synthetic rating/slope reproduce the printed CH 9/11; not course-library facts.
 const course={id:'press-review-course',name:'Prairie View regression fixture',tees:[{id:'black',teeName:'Black',par:72,rating:76,slope:113,holes}]};
 const players=[{id:'john',name:'John Ludwig',index:4.9},{id:'tom',name:'Tom O’Brien',index:6.8}];
 const scores=[[4,4,5,2,4,3,5,4,4,4,4,2,5,4,3,4,4,5],[4,4,5,4,4,3,5,4,4,4,4,3,5,4,2,4,4,5]];
 const match={id:'press-review',date:'2026-10-11',courseId:course.id,teeId:'black',holeCount:18,status:'active',teamCount:2,playersPerTeam:1,allowance:100,teamNames:players.map(p=>p.name),roundContext:{weather:{temperature:58,humidity:91,windSpeed:5,windDirection:45,conditionsText:'Overcast skies'}},greeniesWinners:{4:'john',12:'john',15:'tom'},selectedGames:[{key:'nassau',basis:'net',countingBalls:1,scoringPolicyVersion:1,handicapAllowanceMode:'custom',handicapAllowancePercent:100,stakesFront:5,stakesBack:5,stakesOverall:5},{key:'greenies',participants:['john','tom'],stakePerPlayer:1,winnersByHole:{4:'john',12:'john',15:'tom'}}],players:players.map((p,i)=>({playerId:p.id,team:i+1,teeId:'black',scores:holes.map((h,j)=>({holeNumber:h.holeNumber,gross:scores[i][j]}))})),presses:[{pressId:'review-press',parentGameId:'nassau_net',rootGameId:'nassau_net',parentSegmentId:'nassau_net:front',parentSegmentType:'FRONT',startingHole:5,endingHole:9,declaredForHole:5,initiatedByTeamId:'2',wagerAmount:5,scoringMode:'net',scoringPolicyVersion:1,handicapAllowancePercent:100,countingBalls:1,status:'FINAL',outcomeGameKey:'nassau'}],roundRecapFinal:badStory?'John held that lead through nine holes. Tom won the press by five. Conditions remained steady throughout the round.':'Tom won the H5–H9 press by one. The front nine finished all square. John pays Tom $14.'};
 const live=engine.seedState({players,courses:[course],matches:[match]}).matches[0],metrics=engine.computeMatchMetrics(live);
 if(frozen){const record=engine.buildRoundRecord(live,metrics);record.isFrozen=true;record.frozenAt='2026-10-11T12:00:00Z';live.roundRecordSnapshot=record;live.status='complete';}
 return {engine,match:live,metrics,players,course};
}
