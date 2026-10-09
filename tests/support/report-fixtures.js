import {loadLiveEngine} from '../../scripts/live-engine-adapter.js';
export function reportFixture(index) {
  const engine=loadLiveEngine();
  const kind=index<32?'team_stroke':index<40?(index%2?'stroke_gross':'stroke_net'):index<45?'nassau':'nine_point';
  const count=kind==='nine_point'?3:4;
  const length=index===0?18:index%5===0?9:18;
  const partial=index!==0 && index%7===0;
  const holes=Array.from({length:18},(_,i)=>({holeNumber:i+1,par:[4,4,3,5][i%4],strokeIndex:i+1,yardage:350+i*3}));
  const tee={id:'white',teeName:'White',rating:70.4,slope:133,par:72,holes};
  const course={id:'report-course',name:'Report QA Club',tees:[tee]};
  const players=Array.from({length:count},(_,i)=>({id:'p'+i,name:['Mark & Kell','Hush & Lud','Neil & Kappy','Magic & Crabby Pants'][i],index:[19,13,18,18][i]}));
  const selectedGames=kind.startsWith('stroke_')?[]:[{key:kind,basis:index%3===0?'gross':'net',scoringMode:index%2?'best_ball':'aggregate',countingBalls:1,handicapAllowanceMode:'custom',handicapAllowancePercent:85,stake:5,stakesFront:5,stakesBack:5,stakesOverall:5,playerIds:players.map(p=>p.id)}];
  const match={id:'report-'+index,date:'2026-10-05',courseId:course.id,teeId:tee.id,holeCount:length,status:partial?'active':'complete',teamCount:index%4===0?4:2,playersPerTeam:index%4===0?1:2,allowance:100,featuredCompetition:kind,selectedGames,
    players:players.map((player,i)=>({playerId:player.id,team:index%4===0?i+1:(i<2?1:2),slot:i,teeId:tee.id,scores:holes.map((hole,j)=>({holeNumber:j+1,gross:j<length-(partial?2:0)?hole.par+((j+i+index)%3):null}))}))};
  if(index===0){
    course.name='Southern Dunes';
    const pars=[4,4,3,5,4,3,4,4,5,4,3,5,4,3,4,5,4,4];
    const si=[9,15,11,5,7,17,1,13,3,2,16,6,8,18,14,4,12,10];
    const yards=[349,327,192,480,315,162,395,363,500,416,165,480,393,131,321,497,369,365];
    holes.forEach((hole,j)=>Object.assign(hole,{par:pars[j],strokeIndex:si[j],yardage:yards[j]}));
    course.tees.push({...tee,id:'combo',teeName:'White / Blue',rating:71.7,slope:134});
    match.players[1].teeId='combo';
    match.selectedGames=[{key:'team_stroke',basis:'net',scoringMode:'aggregate',stake:0}];
    const scores=[[4,4,2,6,4,4,4,4,5,4,3,5,4,5,4,6,4,4],[3,4,3,5,4,3,4,4,5,5,2,5,4,3,4,6,4,3],[4,5,3,6,4,4,4,4,5,4,4,5,4,4,4,4,4,5],[5,5,3,6,4,4,4,4,4,4,3,6,3,3,3,6,4,4]];
    match.players.forEach((player,i)=>player.scores.forEach((score,j)=>score.gross=scores[i][j]));
  }
  const state=engine.seedState({players,courses:[course],matches:[match],activeMatchId:match.id});
  const live=state.matches[0],metrics=engine.computeMatchMetrics(live);
  const report=engine.buildLedgerEntryReportModel(live,metrics);
  report.meta.status=partial?'provisional':'final';
  // The renderer's factual fallback is exercised rather than a network-generated story.
  report.meta.recap=null;
  return {engine,live,metrics,report,kind};
}

