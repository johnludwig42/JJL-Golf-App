import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import puppeteer from 'puppeteer-core';
import {loadLiveEngine} from './live-engine-adapter.js';
import {scrambleFixture} from '../tests/support/scramble-fixture.js';
import {chrome,startServer} from '../tests/support/design-browser.js';

const directory=process.env.FLAMTANA_STRESS_OUTPUT || 'tmp/report-qa/v62/stress';
const baselineDirectory=process.env.FLAMTANA_STRESS_BASELINE || '';
fs.mkdirSync(directory,{recursive:true});
let randomState=620050;
const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
const plain=value=>JSON.parse(JSON.stringify(value));
const sum=values=>values.reduce((a,b)=>a+b,0);
const methods=['split','hole18','back9','last6'];
const results=[];
function oracleWinners(series,method){
 let remaining=series.map((scores,index)=>({id:index,scores}));
 const compare=indexes=>{const totals=remaining.map(row=>sum(indexes.map(index=>row.scores[index]))),low=Math.min(...totals);remaining=remaining.filter((row,index)=>totals[index]===low);};
 compare(Array.from({length:18},(_,i)=>i));
 const ranges=method==='hole18'?Array.from({length:18},(_,i)=>[17-i]):method==='back9'?[[9,10,11,12,13,14,15,16,17],[12,13,14,15,16,17],[15,16,17],[17]]:method==='last6'?[[12,13,14,15,16,17],[15,16,17],[17]]:[];
 for(const indexes of ranges){if(remaining.length===1)break;compare(indexes);}
 return remaining.map(row=>row.id);
}
function credit(amounts,ids,cents){const ordered=ids.slice().sort();ordered.forEach((id,index)=>amounts[id]+=Math.trunc(cents/ordered.length)+(index<cents%ordered.length?1:0));}
function expectedMoney(series,method,memberGroups,stake){const ids=memberGroups.flat(),cents=Math.round(stake*100),amounts=Object.fromEntries(ids.map(id=>[id,-cents]));credit(amounts,oracleWinners(series,method).flatMap(index=>memberGroups[index]),cents*ids.length);return amounts;}
function oracleStrokes(handicap,si){if(handicap>=0)return Math.trunc(handicap/18)+(si<=handicap%18?1:0);const absolute=-handicap;return -(Math.trunc(absolute/18)+(si>18-absolute%18?1:0));}

const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
try{
 for(let run=0;run<50;run++){
  const start=performance.now(),data=scrambleFixture(),engine=loadLiveEngine(),host=engine.getSharedDeviceId(),kind=run%10;
  data.match.id='stress-'+run;data.match.date='2026-10-16';data.match.sharedMatchId='STRESS-'+run;
  data.match.sharedHostDeviceId=host;data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;
  data.match.teamNames=kind===9?['North Course Long Team 001','South Course Long Team 002','East Course Long Team 003','West Course Long Team 004']:['Team One','Team Two','Team Three','Team Four'];
  data.players.forEach((player,i)=>player.name=kind===9?'Longlastname Golfer '+(i+1):'Golfer '+(i+1));
  const handicaps=[1,2,3,4].map((team,index)=>[1,2,3,4,5,7].includes(kind)?0:[-2,0,10,35,54][(run+index)%5]);
  data.match.players.forEach(player=>player.assignedTeamIndex=handicaps[player.team-1]);
  const picks=Object.fromEntries(data.match.players.map((player,i)=>[player.playerId,kind===2?4:kind===3?1:kind===1?player.team:kind===8?[1,1,1,2,2,3,4,4][i]:1+Math.floor(random()*4)]));
  const stake=kind===7?0:kind===8?19.99:kind===9?12.34:20;
  const cfg={key:'flamtana_special',scoringPolicyVersion:1,tieMethod:methods[run%4],featuredStake:stake,groupStake:kind===9?13.37:stake,foursomeStake:kind===9?1.01:stake,calcuttaStake:stake,picks};
  data.match.selectedGames=[cfg];
  const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
  const gross=Array.from({length:4},(_,team)=>Array.from({length:18},(_,hole)=>{
   if(kind===1||kind===7)return 4;
   if(kind===2)return team<2?4:6+team;
   if(kind===3)return team<3?4:7;
   if(kind===4)return 4+(hole===team?1:0)-(hole===17-team?1:0);
   if(kind===5)return team<2?(hole%2===team?3:6):5;
   return 3+Math.floor(random()*5);
  }));
  const net=gross.map((scores,team)=>scores.map((score,hole)=>score-oracleStrokes(handicaps[team],hole+1)));
  const groups=[['p0','p1'],['p2','p3'],['p4','p5'],['p6','p7']];
  const foursome=[net[0].map((score,i)=>Math.min(score,net[1][i])),net[2].map((score,i)=>Math.min(score,net[3][i]))];
  // Actual validated team-write controller; groups deliberately score in different orders.
  for(const team of [3,1,4,2])for(let step=0;step<18;step++){
   const hole=team>=3?18-step:step+1;
   const edit=engine.applyTeamGrossScore(match,team,hole,gross[team-1][hole-1]);assert.equal(edit.valid,true);
  }
  assert.equal(engine.applyTeamGrossScore(match,1,1,'').valid,true);assert.equal(engine.computeFlamtanaResults(match).ready,false);
  engine.applyTeamGrossScore(match,1,1,gross[0][0]+1);engine.applyTeamGrossScore(match,1,1,gross[0][0]);
  assert.equal(engine.applyTeamGrossScore(match,1,1,gross[0][0]).changedPlayerIds.length,0);
  const metrics=engine.computeMatchMetrics(match);assert.equal(metrics.completed,18);
  assert.deepEqual(plain(engine.computeFlamtanaResults(match).teams.map(team=>team.scores)),net);
  // Persist/reload and independently hydrate the cloud bundle, including every score row.
  const payload=engine.buildCloudMatchPayload(match),reader=loadLiveEngine();reader.seedState({players:[],courses:[],matches:[]});
  const remote=reader.hydrateMatchFromCloudBundle({matchRow:payload.matchRow,teams:payload.teams,players:payload.players,scoreEntries:match.players.flatMap(player=>player.scores.map(score=>({player_id:player.playerId,hole_number:score.holeNumber,gross:score.gross})))});
  assert.deepEqual(plain(reader.computeFlamtanaResults(remote).teams.map(team=>team.scores)),net);
  const finished=engine.buildFinishedMatchCandidate(match,'2026-10-16T18:00:00Z').candidate;
  const record=finished.roundRecordSnapshot;assert.ok(record?.isFrozen);assert.equal(engine.validateFrozenTransactions(record),true);
  const result=record.games[0].componentResults;assert.equal(result.final,true);
  const expected=[expectedMoney(net,cfg.tieMethod,groups,cfg.featuredStake),expectedMoney(net.slice(0,2),cfg.tieMethod,groups.slice(0,2),cfg.groupStake),expectedMoney(net.slice(2),cfg.tieMethod,groups.slice(2),cfg.groupStake),expectedMoney(foursome,cfg.tieMethod,[groups.slice(0,2).flat(),groups.slice(2).flat()],cfg.foursomeStake)];
  const calcutta=Object.fromEntries(data.players.map(player=>[player.id,-Math.round(stake*100)])),winners=oracleWinners(net,cfg.tieMethod),pool=Math.round(stake*100)*8;
  winners.forEach((team,index)=>{const backers=data.players.filter(player=>picks[player.id]===team+1).map(player=>player.id);credit(calcutta,backers.length?backers:groups[team],Math.trunc(pool/winners.length)+(index<pool%winners.length?1:0));});expected.push(calcutta);
  result.components.forEach((component,index)=>{const actual=Object.fromEntries(Object.entries(component.amounts).map(([id,amount])=>[id,Math.round(amount*100)]));assert.deepEqual(plain(actual),expected[index]);assert.equal(sum(Object.values(actual)),0);});
  const report=engine.buildLedgerEntryReportModel(finished),engineMs=performance.now()-start;
  if(baselineDirectory){
   const baseline=JSON.parse(fs.readFileSync(baselineDirectory+'/round-'+String(run+1).padStart(2,'0')+'.js','utf8').replace(/^globalThis\.__DYE_LEDGER_ROUND__=/,'').replace(/;\s*$/,''));
   assert.equal(JSON.stringify(report.games.map(game=>({id:game.id,money:game.money}))),JSON.stringify(baseline.games.map(game=>({id:game.id,money:game.money}))),'Settlement bytes changed from .62');
   assert.equal(JSON.stringify(report.payments),JSON.stringify(baseline.payments),'Combined payment bytes changed from .62');
   assert.equal(JSON.stringify(report.meta.flamtanaEvidence),JSON.stringify(baseline.meta.flamtanaEvidence),'Complete saved evidence changed from .62');
  }
  assert.equal(report.games.length,5);assert.equal(report.players.length,4);assert.equal(report.settlementPlayers.length,8);
  assert.deepEqual(plain(report.games[3].seriesByHole.map(side=>side.scores)),foursome);
  const reloaded=engine.seedState(plain({players:data.players,courses:[data.course],matches:[finished]})).matches[0];assert.equal(JSON.stringify(reloaded.roundRecordSnapshot),JSON.stringify(record));
  const name='round-'+String(run+1).padStart(2,'0'),htmlFile=directory+'/'+name+'.html',scriptFile=directory+'/'+name+'.js';
  fs.writeFileSync(scriptFile,'globalThis.__DYE_LEDGER_ROUND__='+JSON.stringify(report)+';');
  const html=fs.readFileSync('ledger-report/shell.html','utf8').replaceAll("url('./fonts/","url('/ledger-report/fonts/").replaceAll('src="./','src="/ledger-report/').replace(/(<script src="\/ledger-report\/bootstrap.js[^>]*><\/script>)/,'$1\n<script src="/'+scriptFile+'"></script>');fs.writeFileSync(htmlFile,html);
  const renderStart=performance.now(),page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  if(run%2)await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+htmlFile,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('.page');
  const audit=await page.evaluate(()=>({pages:[...document.querySelectorAll('.page')].map(node=>{const flow=node.querySelector('.flow'),last=flow?.lastElementChild;return {overflow:last?last.getBoundingClientRect().bottom-flow.getBoundingClientRect().top-flow.clientHeight:0,horizontal:node.scrollWidth>node.clientWidth+1};}),stats:document.querySelectorAll('[data-ledger-stat-category]').length,picks:document.querySelectorAll('[data-flamtana-picks] [data-row]').length,calcutta:document.querySelectorAll('[data-calcutta-ledger] [data-row]').length,standings:document.querySelectorAll('[data-stroke-standings]').length}));
  assert.deepEqual(errors,[]);assert.equal(audit.stats,0);assert.equal(audit.picks,8);assert.equal(audit.calcutta,8);assert.equal(audit.standings,4);assert.ok(audit.pages.every(page=>!page.horizontal&&page.overflow<=1),JSON.stringify(audit.pages));
  const printed=await page.$$eval('[data-flamtana-evidence]',blocks=>blocks.map(block=>({label:block.dataset.flamtanaEvidence,steps:[...block.querySelectorAll('[data-flamtana-step]')].map(step=>step.dataset.flamtanaStep),matched:[...block.querySelectorAll('[data-flamtana-matched]')].map(step=>step.dataset.flamtanaMatched),reference:!!block.querySelector('[data-flamtana-featured-reference]'),exhausted:!!block.querySelector('[data-flamtana-exhausted]')})));
  report.meta.flamtanaEvidence.forEach(component=>{
   const block=printed.find(block=>block.label===component.label);
   if(component.label==='Calcutta'){assert.equal(block.reference,true);assert.equal(block.steps.length,0);return;}
   const steps=component.result.evidence,required=steps.filter((step,i)=>i===0||JSON.stringify(step.remaining)!==JSON.stringify(steps[i-1].remaining));
   required.forEach(step=>assert.ok(block.steps.includes(step.label),'Dropped candidate-set change: '+step.label));
   steps.forEach(step=>assert.ok(block.steps.includes(step.label)||block.matched.some(labels=>labels.split(' / ').includes(step.label)),'Dropped comparison: '+step.label));
   if(component.result.final&&component.result.split&&component.result.tieMethod!=='split')assert.equal(block.exhausted,true);
  });
  await page.emulateMediaType('print');const pdf=await page.pdf({path:directory+'/'+name+'.pdf',format:'letter',printBackground:true,preferCSSPageSize:true});
  const physical=(Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert.equal(physical,audit.pages.length);
  if(run===0||kind===4||kind===9)await page.screenshot({path:directory+'/'+name+'.png',fullPage:false});
  results.push({run:run+1,kind,tieMethod:cfg.tieMethod,ios:!!(run%2),pages:physical,pdfBytes:pdf.length,engineMs:Math.round(engineMs),reportMs:Math.round(performance.now()-renderStart),pass:true});await page.close();
  fs.writeFileSync(directory+'/results.json',JSON.stringify({seed:620050,runs:results},null,2));console.log('PASS '+name+' '+cfg.tieMethod+' '+physical+' pages');
 }
 console.log('COMPLETE '+results.length+'/50 passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
