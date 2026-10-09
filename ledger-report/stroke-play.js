(()=>{
// Report-only views over saved competition scores and allocated strokes.
// This module never calculates a handicap or changes a competition result.
const number = value => typeof value === 'number' && Number.isFinite(value);
const total = values => values.reduce((sum,value)=>sum+(number(value)?value:0),0);
const esc = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list = values => values.length<2 ? values[0]||'' : values.slice(0,-1).join(', ')+' and '+values.at(-1);
const reportPalette=['#254e70','#34765f','#9b4814','#8a679a','#586d31','#9d3447','#596d92','#806515','#6c352a','#385669','#74567d','#346b71','#796b39','#754851','#42633b','#655c79'];
function roundEntryColors(round){
  return Object.fromEntries([...Object.keys(round.sides||{}),...round.players.map(player=>player.id)].map((id,i)=>[id,reportPalette[i%reportPalette.length]]));
}
const toPar = value => !number(value)?'—':value===0?'E':value>0?'+'+value:'−'+Math.abs(value);

function buildStrokePlaySummary(game,round){
  if(game?.type!=='strokeplay'||game.overviewOnly)return null;
  const net=game.basis!=='gross',key=game.allowance?.key||'featured';
  const colors=roundEntryColors(round),players=round.players.filter(player=>!game.playerIds?.length||game.playerIds.includes(player.id));
  const entries=game.seriesByHole ? game.seriesByHole.map(entry=>({
    ...entry,name:entry.name||round.sides[entry.id]?.name||entry.id,
    gross:entry.gross||null,strokes:net?entry.strokes||null:round.holes.map(()=>0),
  })) : players.map(player=>{
    const strokes=net?player.strokes?.[key]:round.holes.map(()=>0);
    if(!strokes)throw new Error(`Missing saved ${key} stroke allocation for ${player.id}`);
    return {id:player.id,name:player.name,gross:player.gross,strokes,pars:round.card.par,
      scores:player.gross.map((score,i)=>number(score)&&score>0?score-strokes[i]:null)};
  });
  if(!entries.length)return null;
  const contested=round.holes.map((_,i)=>entries.every(entry=>number(entry.scores[i])));
  const rows=entries.map(entry=>{
    let running=0;
    return {...entry,color:colors[entry.id],cumulative:round.holes.map((_,i)=>{
      if(!contested[i])return null;running+=entry.scores[i];return running;
    }),total:total(entry.scores.filter((_,i)=>contested[i]))};
  });
  const complete=contested.every(Boolean),holesScored=contested.filter(Boolean).length;
  const leaders=round.holes.map((_,i)=>{
    if(!contested[i])return [];
    const best=Math.min(...rows.map(row=>row.cumulative[i]));
    return rows.filter(row=>row.cumulative[i]===best).map(row=>row.id).sort();
  });
  for(const row of rows){
    row.behind=round.holes.map((_,i)=>contested[i]?row.cumulative[i]-Math.min(...rows.map(other=>other.cumulative[i])):null);
    row.positions=round.holes.map((_,i)=>{
      if(!contested[i])return '—';
      const rank=1+rows.filter(other=>other.cumulative[i]<row.cumulative[i]).length;
      return (rows.filter(other=>other.cumulative[i]===row.cumulative[i]).length>1?'T':'')+rank;
    });
    row.position=holesScored?(rows.filter(other=>other.total===row.total).length>1?'T':'')+(1+rows.filter(other=>other.total<row.total).length):'—';
    row.toPar=row.scores.map((score,i)=>number(score)?score-row.pars[i]:null);
    row.relative=total(row.toPar.filter((_,i)=>contested[i]));
  }
  const ranked=rows.slice().sort((a,b)=>a.total-b.total||a.name.localeCompare(b.name));
  const winners=holesScored?ranked.filter(row=>row.total===ranked[0].total):[];
  const finalIds=winners.map(row=>row.id).sort();
  const leadFixed=complete?leaders.findIndex((ids,i)=>JSON.stringify(ids)===JSON.stringify(finalIds)&&leaders.slice(i).every(next=>JSON.stringify(next)===JSON.stringify(finalIds))):-1;
  let swing=null;
  if(leadFixed>=0)for(let end=0;end<=leadFixed;end++)for(let start=Math.max(0,end-3);start<=end;start++){
    const before=start===0?rows.map(row=>row.id):leaders[start-1];
    for(const winner of winners)for(const leaderId of before){
      if(leaderId===winner.id)continue;
      const leader=rows.find(row=>row.id===leaderId);
      const gain=total(leader.scores.slice(start,end+1))-total(winner.scores.slice(start,end+1));
      const candidate={start,end,gain,winnerId:winner.id,leaderId};
      if(gain>0&&(!swing||gain>swing.gain||gain===swing.gain&&(end<swing.end||end===swing.end&&end-start<swing.end-swing.start)))swing=candidate;
    }
  }
  return {gameId:game.id,net,basis:net?'Net':'Gross',key,rows,ranked,winners,leaders,complete,holesScored,leadFixed,swing,holes:round.holes};
}

function strokePlayCallout(summary,round){
  if(!summary.complete)return 'Results are provisional. Lead fixed and the decisive swing will be determined when every entry has completed the round.';
  const winnerNames=list(summary.winners.map(row=>row.name));
  let text=summary.winners.length>1?`${winnerNames} finished tied at ${summary.winners[0].total}.`:`${winnerNames} finished lowest at ${summary.winners[0].total}.`;
  const swing=summary.swing;
  if(swing){
    const leader=summary.rows.find(row=>row.id===swing.leaderId),chaser=summary.rows.find(row=>row.id===swing.winnerId);
    const start=swing.start===0?0:leader.cumulative[swing.start-1],chaseStart=swing.start===0?0:chaser.cumulative[swing.start-1];
    const beforeLeaders=swing.start===0?summary.rows:summary.rows.filter(row=>summary.leaders[swing.start-1].includes(row.id));
    const gap=chaseStart-start;
    text+=` ${list(beforeLeaders.map(row=>row.name))} ${beforeLeaders.length>1?'shared the lead':'led'}${gap>0?' by '+gap+' over '+chaser.name:''} ${swing.start===0?'before the first hole':'through hole '+round.holes[swing.start-1]}.`;
    const values=chaser.scores.slice(swing.start,swing.end+1),relative=chaser.toPar.slice(swing.start,swing.end+1);
    text+=` ${chaser.name} scored ${summary.basis.toLowerCase()} ${values.join('–')} on holes ${round.holes[swing.start]}–${round.holes[swing.end]} (${relative.map(toPar).join(', ')} to par), gaining ${swing.gain} ${swing.gain===1?'stroke':'strokes'}`;
    const endLeaders=summary.leaders[swing.end];
    text+=endLeaders.includes(chaser.id)?endLeaders.length>1?' to share the lead.':' to take the outright lead.':'.';
    if(chaser.gross){
      const birdies=chaser.gross.slice(swing.start,swing.end+1).filter((score,i)=>score===chaser.pars[swing.start+i]-1).length;
      const received=total((chaser.strokes||[]).slice(swing.start,swing.end+1));
      text+=` That stretch contained ${birdies} gross ${birdies===1?'birdie':'birdies'}${summary.net?' and '+received+' allocated handicap '+(received===1?'stroke':'strokes'):''}.`;
    }
  }
  const after=summary.leadFixed+1;
  const fixed=summary.leadFixed;
  const details=[number(round.card.par?.[fixed])?'par '+round.card.par[fixed]:null,number(round.card.yds?.[fixed])&&round.card.yds[fixed]>0?round.card.yds[fixed]+' yards':null,number(round.card.si?.[fixed])?'stroke index '+round.card.si[fixed]:null].filter(Boolean);
  const fixedHole=round.holes[fixed]+(details.length?' ('+details.join(', ')+')':'');
  if(summary.winners.length>1)text+=` The final tied group was established at hole ${fixedHole}; no single team held an outright lead from there.`;
  else text+=` The final leader was established at hole ${fixedHole} and remained unchanged through the finish.`;
  if(summary.winners.length>1&&after<round.holes.length&&summary.winners.every(row=>JSON.stringify(row.scores.slice(after))===JSON.stringify(summary.winners[0].scores.slice(after)))){
    text+=` The tied leaders matched each other ${summary.winners[0].scores.slice(after).join('–')} from hole ${round.holes[after]} through the finish.`;
  }
  return text;
}

const ink = hex => {
  const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c.reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)>.18?'#14211c':'#ffffff';
};
function strokePlayChart(summary,round){
  const max=Math.max(1,...summary.rows.flatMap(row=>row.behind.filter(number)));
  const W=720,x0=56,x1=706,y0=18,y1=Math.max(160,Math.min(260,max*8+18)),height=y1+48;
  const X=i=>x0+(x1-x0)*i/Math.max(1,round.holes.length-1),Y=value=>y0+(y1-y0)*value/max;
  const drawn=summary.ranked.slice().reverse();
  const paths=drawn.map((row,r)=>round.holes.slice(1).map((_,j)=>{
    const i=j+1;if(!number(row.behind[i-1])||!number(row.behind[i]))return '';
    const shared=drawn.slice(0,r).some(other=>other.behind[i]===row.behind[i]&&other.behind[i-1]===row.behind[i-1]);
    return `<path data-entry-line="${esc(row.id)}" data-overlap="${shared}" d="M${X(i-1)} ${Y(row.behind[i-1])} L${X(i)} ${Y(row.behind[i])}" stroke="${row.color}" stroke-width="2.1" fill="none"${shared?' stroke-dasharray="'+(r%2?'6 4':'2 5')+'"':''}/>`;
  }).join('')).join('');
  const stride=Math.max(1,Math.ceil(max/24));
  const ticks=Array.from({length:max+1},(_,value)=>`<line data-grid-tick="${value}" x1="${x0}" x2="${x1}" y1="${Y(value)}" y2="${Y(value)}" stroke="#d9ded7"/>${value%stride===0||value===max?`<text x="${x0-6}" y="${Y(value)+3}" text-anchor="end">${value===0?'0 · lead':value===max?max+' back':value}</text>`:''}`).join('');
  const swing=summary.swing?`<rect data-swing-band x="${X(summary.swing.start)-6}" y="${y0}" width="${X(summary.swing.end)-X(summary.swing.start)+12}" height="${y1-y0}" fill="#b0821f" opacity=".13"/><text x="${(X(summary.swing.start)+X(summary.swing.end))/2}" y="10" text-anchor="middle" fill="#806515">The swing · ${round.holes[summary.swing.start]}–${round.holes[summary.swing.end]}</text>`:'';
  const holes=round.holes.map((hole,i)=>`<line x1="${X(i)}" x2="${X(i)}" y1="${y1}" y2="${y1+4}" stroke="#14211c"/><text x="${X(i)}" y="${y1+15}" text-anchor="middle">${hole}</text><text x="${X(i)}" y="${y1+27}" text-anchor="middle" fill="#68716b">${round.card.par[i]}</text>`).join('');
  const legend=summary.ranked.map(row=>`<span data-entry-legend="${esc(row.id)}"><i style="background:${row.color}"></i><b>${esc(row.name)}</b> ${esc(row.position)} · ${row.total}</span>`).join('');
  return `<div class="stroke-legend">${legend}</div><div class="stroke-caption">Strokes behind the leader <span>Leader = 0. Dashed segments reveal shared values.</span></div><svg class="stroke-chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${summary.basis} stroke play: strokes behind the leader"><g font-family="IBM Plex Mono" font-size="7.8">${ticks}${swing}${paths}<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="#14211c"/>${holes}<text x="${x0-6}" y="${y1+27}" text-anchor="end">Par</text><text x="${(x0+x1)/2}" y="${y1+43}" text-anchor="middle">Hole</text></g></svg>`;
}

function strokePlayStrip(summary,round){
  const title='Position by hole';
  const rows=summary.ranked.map(row=>`<tr data-row data-stroke-entry="${esc(row.id)}"><th scope="row" style="color:${row.color}">${esc(row.name)}</th>${round.holes.map((hole,i)=>{
    const value=row.positions[i];
    let style='';
    if(['1','T1'].includes(value))style=`background:${row.color};color:${ink(row.color)}`;else if(['2','T2'].includes(value))style=`background:${row.color}25`;
    return `<td data-hole="${hole}" style="${style}">${esc(value)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="stroke-caption">${title}</div><table class="stroke-strip" data-stroke-strip="position"><colgroup><col style="width:24%">${round.holes.map(()=>'<col>').join('')}</colgroup><thead data-rowhead><tr><th scope="col">Player / Team</th>${round.holes.map(hole=>`<th scope="col">${hole}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function handicapTable(round,featured){
  const games=round.games.filter(game=>!game.overviewOnly),rows=featured?.scope==='team'?Object.entries(round.sides).map(([id,side])=>({id,name:side.name,members:round.players.filter(player=>player.side===id)})):round.players.map(player=>({id:player.id,name:player.name,members:[player]}));
  const value=(player,game)=>game.basis==='gross'?0:game.handicaps&&Object.hasOwn(game.handicaps,player.id)?game.handicaps[player.id]:(player.strokes?.[game.allowance?.key||'featured']?total(player.strokes[game.allowance?.key||'featured']):null);
  const signature=game=>JSON.stringify(round.players.map(player=>value(player,game)));
  const collapsed=games.length>0&&games.every(game=>signature(game)===signature(games[0]));
  const columns=collapsed?[games[0]]:games;
  const heads=columns.map(game=>`<th>${collapsed?'Match Handicap':esc(game.name)}</th>`).join('');
  const colors=roundEntryColors(round);
  const body=rows.map(row=>`<tr data-row><td style="color:${colors[row.id]}"><b>${esc(row.name)}</b></td><td>${esc([...new Set(row.members.map(player=>player.tee))].join(' / '))}</td><td>${row.members.map(player=>number(player.index)?player.index.toFixed(1):'—').join(' / ')}</td><td>${total(row.members.map(player=>player.ch))}</td>${columns.map(game=>`<td>${row.members.every(player=>number(value(player,game)))?total(row.members.map(player=>value(player,game))):'—'}</td>`).join('')}</tr>`).join('');
  const foot=games.map(game=>`${esc(game.name)}: ${esc(game.allowance?.label||'No fixed handicap allocation')}`).join('; ');
  return `<table class="handicap-table"><thead data-rowhead><tr><th>Player / Team</th><th>Tees</th><th>Index</th><th>Course Handicap</th>${heads}</tr></thead><tbody>${body}</tbody></table><p class="scnote">${foot}. Team handicap columns are combined allocations; Detailed gross/net scores and allocated strokes appear in the appendix. Partner indices remain separate.</p>`;
}

globalThis.DYE_LEDGER_STROKE_REPORT=Object.freeze({reportPalette,roundEntryColors,toPar,buildStrokePlaySummary,strokePlayCallout,strokePlayChart,strokePlayStrip,handicapTable});
})();
