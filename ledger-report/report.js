/* ==========================================================================
   ROUND — the data contract. Everything the report shows is either in here
   or derived from it. Stroke allocation comes from the app's engine, keyed by
   basis; the report never re-derives handicapping.
   ========================================================================== */
import { composeCompetitionLabel, describeFinalCarry, describeMarginTurningPoint, getSegmentMarginPerspective, getWinningMarginPerspective } from './logic.js?v=31.0.26';

const packPages = globalThis.packPages;
const runGame = globalThis.runGame;
const REFERENCE_ROUND = {
  meta:{ course:"Chatham Hills", layout:"Gold", date:"2026-08-09",
    weather:{ note:"Clear, 70°F, 93% humidity, wind 2 mph south.", recordedAt:"first completed hole" } },
  holes:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
  card:{
    yds:[396,145,360,450,556,420,544,195,453,390,208,422,505,155,423,440,555,412],
    par:[4,3,4,4,5,4,5,3,4,4,3,4,5,3,4,4,5,4],
    si: [5,17,11,7,9,1,15,13,3,10,12,4,14,6,2,8,16,18]},
  sides:{ OG:{name:"Old Guard",color:"#2C4A6E"}, YG:{name:"Young Guns",color:"#1E6B4F"} },
  players:[
    {id:"bw",name:"Brian Warner",    side:"OG",tee:"Blue",index:8.9, ch:10,ph:4,
      gross:[6,3,5,6,4,4,5,3,6,5,3,6,5,5,5,5,6,6]},
    {id:"pb",name:"Phil Bounsall",   side:"OG",tee:"Blue",index:13.2,ch:15,ph:9,
      gross:[5,3,5,3,5,4,5,3,6,4,4,5,6,4,5,6,6,5]},
    {id:"to",name:"Tom O\u2019Brien",side:"OG",tee:"Blue",index:7.6, ch:8, ph:3,
      gross:[5,4,4,5,5,4,4,3,5,4,4,4,4,3,5,5,5,5]},
    {id:"jl",name:"John Ludwig",     side:"OG",tee:"Blue",index:4.8, ch:5, ph:0,
      gross:[5,3,4,4,5,4,5,4,5,3,3,5,4,3,4,6,5,5]},
    {id:"mb",name:"Michael Bounsall",side:"YG",tee:"Gold",index:4.0, ch:8, ph:3,
      gross:[4,4,4,5,6,4,4,3,4,4,4,4,5,2,5,6,6,6]},
    {id:"le",name:"Lane Erickson",   side:"YG",tee:"Gold",index:10.5,ch:16,ph:10,
      gross:[4,3,5,7,6,5,6,3,7,6,3,3,6,3,6,5,5,4]},
    {id:"cd",name:"Cam Durm",        side:"YG",tee:"Gold",index:15.2,ch:22,ph:15,
      gross:[5,2,5,8,7,5,5,4,4,6,2,5,5,4,5,6,5,4]},
    {id:"bd",name:"Bryce Durm",      side:"YG",tee:"Gold",index:5.7, ch:10,ph:4,
      gross:[4,3,6,6,5,4,4,4,5,4,3,5,5,5,5,5,5,4]}],
  games:[
    { id:"g1", name:"Net Nassau", type:"nassau", featured:true, scope:"team",
      allowance:{ key:"featured", label:"Best 2 · 85% off the low" }, bestN:2,
      sides:[{key:"OG",playerIds:["bw","pb","to","jl"]},
             {key:"YG",playerIds:["mb","le","cd","bd"]}],
      segments:[{label:"Front",holes:[1,2,3,4,5,6,7,8,9]},
                {label:"Back", holes:[10,11,12,13,14,15,16,17,18]}],
      stakePerSegment:5, unit:"dollars",
      money:{bw:-15,pb:-15,to:-15,jl:-15,mb:15,le:15,cd:15,bd:15} },
    { id:"g2", name:"Greenies", type:"greenies", featured:false, scope:"individual",
      allowance:{ key:"featured", label:"—" }, unit:"dollars",
      detail:{ stakePerPlayer:1, winners:{2:"bd",8:"bw",11:"bw",14:"mb"} } }
  ],
  /* Illustrative only — replace with the app's real hole memories. */
  memories:[
    {hole:4,  text:"Pin tucked back left behind the bunker. Nobody went at it."},
    {hole:9,  text:"Wind switched at the turn and the ninth played two clubs longer."},
    {hole:11, text:"Cart path only from here in. Ball in the gravel twice."},
    {hole:14, text:"Closest to the pin all day, inside four feet."},
    {hole:18, text:"Group behind waved through on the tee. Cost us fifteen minutes."}
  ],
  payments:[{from:"pb",to:"mb",amt:19},{from:"to",to:"bd",amt:19},
            {from:"jl",to:"le",amt:11},{from:"jl",to:"cd",amt:8},
            {from:"bw",to:"cd",amt:3}]
};
REFERENCE_ROUND.players.forEach((p,index)=>{
  const deltas=p.gross.map((score,hole)=>score-REFERENCE_ROUND.card.par[hole]);
  const greens=Math.max(4,10-index%4);
  p.statistics={
    scoredHoles:18, gross:p.gross.reduce((a,b)=>a+b,0),
    birdieOrBetter:deltas.filter(v=>v<0).length,
    parOrBetter:deltas.filter(v=>v<=0).length,
    bogeyOrBetter:deltas.filter(v=>v<2).length,
    greensInRegulation:greens, convertedGreens:Math.min(deltas.filter(v=>v<0).length,greens),
    fairwayHitOpportunities:7, fairwayHitGirs:4,
    fairwayMissedOpportunities:7, fairwayMissedGirs:2,
    fairwayGirAdvantage:2/7,
    tracked:{trackedHoles:18,fairwaysHit:7,fairwayOpps:14,greens,greenOpps:18,unknownGirHoles:0,
      putts:31+index%4,puttOpps:18,onePutts:5,threePutts:2,girPutts:18,girPuttOpps:greens,
      missedGirPutts:13,missedGirPuttOpps:18-greens,penaltyStrokes:index%3,penaltyHoles:index%3,
      upAndDowns:3,scramblingOpps:8,sandies:1,sandSaveOpps:3,missingRecoveryLies:1,
      fairwayOutcomes:{
        HIT:{opportunities:7,scoreToPar:2,girs:4,penalties:0,penaltyHoles:0},
        LEFT:{opportunities:4,scoreToPar:5,girs:1,penalties:1,penaltyHoles:1},
        RIGHT:{opportunities:3,scoreToPar:3,girs:1,penalties:0,penaltyHoles:0}},
      recoveryByLie:{ROUGH:{opportunities:4,successes:2},BUNKER:{opportunities:3,successes:1},FRINGE:{opportunities:1,successes:0},OTHER:{opportunities:0,successes:0}},
      approachPositions:{'1':2,'2':2,'3':1,'4':2,'5':greens,'6':1,'7':1,'8':1,'9':0},
      approachOutcomes:{
        '1':{scramblingOpps:2,scrambles:1},'2':{scramblingOpps:2,scrambles:1},'3':{scramblingOpps:1,scrambles:0},
        '4':{scramblingOpps:1,scrambles:1},'5':{scramblingOpps:0,scrambles:0},'6':{scramblingOpps:1,scrambles:0},
        '7':{scramblingOpps:1,scrambles:0},'8':{scramblingOpps:0,scrambles:0},'9':{scramblingOpps:0,scrambles:0}},
      parTypes:{'3':{opportunities:4,scoreToPar:1},'4':{opportunities:10,scoreToPar:6},'5':{opportunities:4,scoreToPar:2}}},
  };
});
const ROUND = globalThis.__DYE_LEDGER_ROUND__ || REFERENCE_ROUND;
document.title = `Ledger Entry Report — ${ROUND.meta.course}, ${new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${ROUND.meta.date}T12:00:00Z`))}`;

/* ==========================================================================
   Derivation
   ========================================================================== */
const C = ROUND.card, HOLES = ROUND.holes, NH = HOLES.length;
const P = ROUND.players, SIDES = ROUND.sides;
const PAR_TOTAL = C.par.reduce((a,b)=>a+b,0);
const S = id => P.find(p=>p.id===id);
const nameOf = id => S(id).name;
const isNum = v => typeof v==="number" && Number.isFinite(v);
const played = v => isNum(v) && v>0;      /* null gross = hole not played */
const sum = (a,f=0,t=a.length) => a.slice(f,t).reduce((x,y)=>x+(isNum(y)?y:0),0);
const el = id => document.getElementById(id);
const usd = v => { const a=Math.abs(v); return "$"+(a%1?a.toFixed(2):a.toFixed(0)); };
const acct = v => v<0 ? "("+usd(v)+")" : usd(v);
const WORD=["no","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve"];
const wn = n => WORD[n]!==undefined?WORD[n]:String(n);
const ORD=["first","second","third","fourth","fifth","sixth","seventh","eighth","ninth",
  "tenth","eleventh","twelfth","thirteenth","fourteenth","fifteenth","sixteenth",
  "seventeenth","eighteenth"];
const ordw = n => ORD[n-1]||(n+"th");
const listw = a => a.length<2 ? (a[0]||"") : a.slice(0,-1).join(", ")+" and "+a[a.length-1];
const cap = s => s.replace(/^\w/,c=>c.toUpperCase());
const MONTHS=["January","February","March","April","May","June","July","August",
  "September","October","November","December"];
const fmtDate = iso => { const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if(!m) return iso;
  return `${MONTHS[+m[2]-1]} ${+m[3]}, ${m[1]}`; };
const qty = value => Number(value || 0).toLocaleString("en-US");
const plur = (n,w) => wn(n)+" "+w+(n===1?"":"s");
const an = s => (/^[aeiou]/i.test(s)?"an ":"a ")+s;
const initials = full => { const t=full.trim().split(/\s+/);
  return t.length<2 ? full : t[0]+" "+t[t.length-1][0]+"."; };
const headerCompetitionLabel = (name, allowance) => composeCompetitionLabel(name, allowance)
  .replace(/\s*·\s*Featured Competition settings\s*$/i, "")
  .trim();

/* stroke allocation supplied by the engine, keyed by basis */
const alloc = (h) => C.si.map(s => Math.floor(h/NH) + (s <= h-Math.floor(h/NH)*NH ? 1:0));
const LOWCH = Math.min(...P.map(p=>p.ch));
const LOWMAN = P.slice().sort((a,b)=>a.ch-b.ch)[0];
P.forEach(p=>{
  p.strokes = p.strokes || { courseNet:alloc(p.ch), featured:alloc(p.ph),
                             offLow:alloc(p.ch-LOWCH) };
  const net = k => p.gross.map((g,i)=>played(g)?g-p.strokes[k][i]:null);
  p.cnet = net("courseNet"); p.fnet = net("featured"); p.onet = net("offLow");
  p.playedIdx = p.gross.map((g,i)=>played(g)?i:-1).filter(i=>i>=0);
  p.nPlayed = p.playedIdx.length;
  p.parPlayed = p.playedIdx.reduce((a,i)=>a+C.par[i],0);
  p.delta = p.playedIdx.map(i=>p.gross[i]-C.par[i]);
  p.tot = sum(p.gross); p.cnetT = sum(p.cnet); p.fnetT = sum(p.fnet); p.onetT = sum(p.onet);
  p.postable = isNum(p.postable) ? p.postable : p.tot;
  p.half = Math.ceil(NH/2);
  p.out = sum(p.gross,0,p.half); p.inn = sum(p.gross,p.half);
});
/* Totals over unequal hole counts are not comparable. Awards restrict to
   players who finished; the badge and recap say so when anyone did not. */
const COMPLETE = P.every(p=>p.nPlayed===NH);
const HOLES_SCORED = Math.max(0,...P.map(p=>p.nPlayed));
const FULL = P.filter(p=>p.nPlayed===NH);
const RANKABLE = FULL.length ? FULL : P;
const sideOf = k => P.filter(p=>p.side===k);
const SIDEKEYS = Object.keys(SIDES);
const HAS_SIDES = SIDEKEYS.length===2 && P.every(p=>p.side);

/* run every game through its engine */
const CTX = { players:P, holes:HOLES, par:C.par };
ROUND.games.forEach(g=>{ try{ g.R = runGame(g,CTX); }catch(e){ g.R=null;
  console.error("ENGINE FAIL "+g.id+": "+e.message); } });
const FEAT = ROUND.games.find(g=>g.featured) || ROUND.games[0] || null;

/* money per game: engine ledger for discrete, declared for the rest */
ROUND.games.forEach(g=>{
  g.moneyBy = g.money || (g.R && g.R.ledger) || {};
  if(g.unit==="points" && g.pointValue!=null && g.money){
    P.forEach(p=>{ const own=g.R.series.find(s=>s.id===p.id).total;
      const want=(g.settlementMode==="headToHead"
        ? g.R.series.filter(s=>s.id!==p.id).reduce((sum,s)=>sum+(own-s.total),0)
        : own)*g.pointValue;
      if(Math.abs(want-(g.money[p.id]||0))>1e-6)
        console.error(`POINTS/MONEY MISMATCH ${g.id} ${p.name}: ${want} vs ${g.money[p.id]}`); });
  }
});
const moneyOf = id => ROUND.games.reduce((a,g)=>a+(g.moneyBy[id]||0),0);
const HAS_MONEY = ROUND.games.some(g=>Object.values(g.moneyBy).some(v=>v!==0));
const PAY = ROUND.payments||[];
const sideMoney = k => sideOf(k).reduce((a,p)=>a+moneyOf(p.id),0);
/* side games ordered by money moved, descending */
const SIDEGAMES = ROUND.games.filter(g=>!g.featured)
  .sort((a,b)=> Object.values(b.moneyBy).filter(v=>v>0).reduce((x,y)=>x+y,0)
              - Object.values(a.moneyBy).filter(v=>v>0).reduce((x,y)=>x+y,0));

if(HAS_MONEY && PAY.length){
  const chk={}; P.forEach(p=>chk[p.id]=0);
  PAY.forEach(x=>{chk[x.from]-=x.amt; chk[x.to]+=x.amt;});
  P.forEach(p=>{ if(Math.abs(chk[p.id]-moneyOf(p.id))>1e-9)
    console.error(`SETTLEMENT MISMATCH ${p.name}: games ${moneyOf(p.id)} vs payments ${chk[p.id]}`); });
}

const FR = FEAT && FEAT.R;
const MARGIN = FR && FR.archetype==="margin" ? FR : null;
const WINK = MARGIN && MARGIN.winner!==null ? FEAT.sides[MARGIN.winner].key : null;
const LOSEK = WINK ? SIDEKEYS.find(k=>k!==WINK) : null;

/* ==========================================================================
   Small builders
   ========================================================================== */
const h = (tag,attrs={},kids=[]) => {
  const e = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==="class") e.className=v; else if(k==="html") e.innerHTML=v;
    else if(k==="text") e.textContent=v; else e.setAttribute(k,v);
  }
  (Array.isArray(kids)?kids:[kids]).forEach(k=>k&&e.appendChild(k));
  return e;
};
/* Shape carries the side, colour reinforces it. Colour alone fails in greyscale
   print and for colour-blind readers. */
const dot = k => { const i=Math.max(0,SIDEKEYS.indexOf(k));
  return `<i class="sd sd${i%4}" style="background:${SIDES[k]?SIDES[k].color:'#6E736C'}"></i>`; };
const nameCell = p => `<span class="nm">${HAS_SIDES?dot(p.side):""}${p.name}</span>`;

function secHead(title, sub){
  const w = h("div",{class:"sechead"});
  w.appendChild(h("div",{class:"sec",
    html:title+(sub?` <small>${sub}</small>`:"")}));
  return w;
}

/* score marks: circle under par, square over, doubled at two */
function mark(score, par){
  const d = score-par;
  const cls = d<=-2?"c2":d===-1?"c1":d===1?"s1":d>=2?"s2":"";
  const wide = String(score).length>1 ? " wide" : "";
  return `<span class="mk ${cls}${wide}">${score}</span>`;
}

/* ==========================================================================
   Blocks — fixed order. Pagination is computed, order is not.
   ========================================================================== */
const BLOCKS = [];
const add = (id, build, opts={}) => BLOCKS.push({id,build,...opts});

/* ---- hero ---- */
add("hero", ()=>{
  const w = h("div",{style:"padding-bottom:2px"});
  const label = FEAT ? headerCompetitionLabel(FEAT.name, FEAT.allowance.label) : "No featured competition";
  w.appendChild(h("div",{class:"eyebrow",text:"Featured Competition · "+label}));
  let head;
  if(WINK){
    const swept = FEAT?.type==="nassau" && MARGIN.segments.length>1 && MARGIN.segments.every(segment=>WINK===FEAT.sides[1].key ? segment.margin>0 : segment.margin<0);
    const verb = sideOf(WINK).length===1 ? "sweeps" : "sweep";
    head = swept ? `${SIDES[WINK].name} ${verb} the Nassau` : `${SIDES[WINK].name} — ${Math.abs(MARGIN.total)}&nbsp;up`;
  }
  else if(MARGIN) head = "All square";
  else {
    const lo = P.slice().sort((a,b)=>a.cnetT-b.cnetT)[0];
    const tied = P.filter(p=>p.cnetT===lo.cnetT);
    head = tied.length>1
      ? `${listw(tied.map(p=>p.name))} — tied low net, ${lo.cnetT}`
      : `${lo.name} — low net, ${lo.cnetT}`;
  }
  w.appendChild(h("h1",{html:head}));
  w.appendChild(h("p",{class:"deck",text:deckText()}));
  return w;
});

function deckText(){
  const parts=[];
  if(WINK){
    if(HAS_MONEY){
      const winnerPosition=sideMoney(WINK);
      parts.push(winnerPosition>0
        ? `${SIDES[WINK].name} finished ${usd(winnerPosition)} ahead of ${SIDES[LOSEK].name} after all recorded games.`
        : winnerPosition<0
          ? `${SIDES[LOSEK].name} finished ${usd(winnerPosition)} ahead of ${SIDES[WINK].name} after the side games were settled.`
          : `${SIDES[WINK].name} and ${SIDES[LOSEK].name} finished even after all recorded games.`);
      SIDEGAMES.map(sideGameDeckResult).filter(Boolean).forEach(result=>parts.push(result));
    } else {
      parts.push("No wagers recorded on this round.");
      SIDEGAMES.map(sideGameDeckResult).filter(Boolean).forEach(result=>parts.push(result));
    }
  } else parts.push("No featured competition on this round. Scoring and awards below.");
  return parts.join(" ");
}
function sideGameDeckResult(game){
  if(!game?.R || game.R.archetype!=="discrete") return "";
  const countsBySide=Object.fromEntries(SIDEKEYS.map(key=>[key,0]));
  game.R.per.forEach(result=>{
    const side=result.winner ? S(result.winner)?.side : null;
    if(side && side in countsBySide) countsBySide[side]+=1;
  });
  if(HAS_SIDES){
    const [first,second]=SIDEKEYS;
    const firstCount=countsBySide[first]||0, secondCount=countsBySide[second]||0;
    if(firstCount===0 && secondCount===0) return `No ${game.name} winners were recorded.`;
    if(firstCount===secondCount) return `${game.name} split ${firstCount}–${secondCount}.`;
    const winner=firstCount>secondCount?first:second;
    const loser=winner===first?second:first;
    return `${game.name} went ${countsBySide[winner]}–${countsBySide[loser]} to ${SIDES[winner].name}.`;
  }
  const ranked=Object.entries(game.R.counts||{}).sort((a,b)=>b[1]-a[1]);
  if(!ranked.length) return `No ${game.name} winners were recorded.`;
  const top=ranked[0][1];
  const leaders=ranked.filter(([,count])=>count===top).map(([id])=>S(id)?.name||id);
  return `${listw(leaders)} ${leaders.length===1?"led":"shared the lead in"} ${game.name} with ${top}.`;
}

/* ---- side strip ---- */
if(HAS_SIDES) add("strip", ()=>{
  const outer = h("div",{class:"strip-wrap"});
  const w = h("div",{class:"strip",
    style:`grid-template-columns:repeat(${SIDEKEYS.length},1fr)`});
  SIDEKEYS.forEach(k=>{
    const t = sideOf(k);
    const g = t.reduce((a,p)=>a+p.tot,0), n = t.reduce((a,p)=>a+p.cnetT,0);
    const sgn = MARGIN && k===FEAT.sides[1].key ? 1 : -1;
    const f = v => v>0?"+"+v:v===0?"AS":String(v);
    const segTxt = MARGIN ? MARGIN.segments.map(s=>
      `${s.label.toUpperCase()} <b>${f(s.margin*sgn)}</b>`).join(" &nbsp; ")
      + (MARGIN.aggregate?` &nbsp; MATCH <b>${f(MARGIN.aggregate.margin*sgn)}</b>`:"") : "";
    w.appendChild(h("div",{class:"scol",html:
      `<div class="sname"><i style="background:${SIDES[k].color}"></i>${SIDES[k].name}</div>
       <div class="sstats">GROSS <b>${g}</b> &nbsp;·&nbsp; NET (FULL CH) <b>${n}</b>
       ${segTxt?" &nbsp;·&nbsp; "+segTxt:""}</div>
       <div class="sstats" style="margin-top:1px">${t.map(p=>`${initials(p.name)} · ${p.tee}`).join(" &nbsp; | &nbsp; ")}</div>`}));
  });
  outer.appendChild(w);
  return outer;
});

/* ---- featured competition chart ---- */
if(FR) add("charth", ()=>{ const perspective=getWinningMarginPerspective(MARGIN||{}); const side=FEAT.sides?.[perspective.sideIndex]; return secHead("Featured Competition by hole",
  `${headerCompetitionLabel(FEAT.name, FEAT.allowance.label)}${MARGIN&&side?` · Winning Side perspective: ${SIDES[side.key].name}`:""}`); }, {keepWithNext:true, label:"Result"});
if(FR) add("chart", ()=>{ const w=h("div"); w.innerHTML=chartSVG(); return w; });

/* One geometry for every archetype. The label stack below the plot was carrying
   ~28px of slack; tightening it loses no information and buys the cover page
   room for the Highlights strip. */
const CH = { W:720, H:208, x0:54, x1:704, y0:14, y1:148,
  ribbonY:155, ribbonH:8, ribbonBot:163, holeY:172, parY:182, memY:188, segY:200 };

function chartFrame(inner, yAxis, footLabels){
  const W=CH.W, x0=CH.x0, x1=CH.x1;
  const X = i => x0 + (x1-x0)*i/NH;
  const ribbon = HOLES.map((hh,i)=>{
    let c="#D8D8D0";
    if(MARGIN){ const r=MARGIN.per[i]; c = r.win===null?"#D8D8D0":SIDES[FEAT.sides[r.win].key].color; }
    return `<rect x="${X(i)+.6}" y="${CH.ribbonY}" width="${X(i+1)-X(i)-1.2}" height="${CH.ribbonH}" fill="${c}"/>`;
  }).join("");
  const labels = HOLES.map((hh,i)=>{
    const cx=(X(i)+X(i+1))/2;
    return `<text x="${cx}" y="${CH.holeY}" text-anchor="middle" font-family="IBM Plex Mono" font-size="7" fill="#14211C">${hh}</text>
      <text x="${cx}" y="${CH.parY}" text-anchor="middle" font-family="IBM Plex Mono" font-size="6.4" fill="#9A9E97">${C.par[i]}</text>`;
  }).join("");
  const memMark = ROUND.memories.map(m=>{
    const i=HOLES.indexOf(m.hole); if(i<0) return "";
    return `<circle cx="${(X(i)+X(i+1))/2}" cy="${CH.memY}" r="1.5" fill="#B0821F"/>`;
  }).join("");
  const dividers = (MARGIN&&MARGIN.segments.length>1?MARGIN.segments.slice(0,-1):[])
    .map(s=>`<line x1="${X(s.idx[s.idx.length-1]+1)}" y1="${CH.y0-2}" x2="${X(s.idx[s.idx.length-1]+1)}" y2="${CH.ribbonBot}"
      stroke="#B8B8B0" stroke-width=".6" stroke-dasharray="3 3"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${CH.H}" width="100%" role="img" aria-label="Featured competition by hole">
    ${dividers}${inner}${yAxis}${ribbon}${labels}${memMark}
    <text x="${x0-8}" y="${CH.ribbonY+CH.ribbonH-1}" text-anchor="end" font-family="Archivo" font-weight="600"
      font-size="5.8" letter-spacing=".5" fill="#6E736C">HOLE</text>
    <text x="${x0-8}" y="${CH.parY}" text-anchor="end" font-family="Archivo" font-weight="600"
      font-size="5.8" letter-spacing=".5" fill="#9A9E97">PAR</text>
    ${footLabels}</svg>`;
}

function yAxisLabel(label){
  const mid=(CH.y0+CH.y1)/2;
  return `<text x="10" y="${mid}" text-anchor="middle" transform="rotate(-90 10 ${mid})"
    font-family="Archivo" font-weight="600" font-size="6.2" letter-spacing=".8" fill="#6E736C">${label}</text>`;
}

function chartSVG(){
  if(FR.archetype==="margin") return marginChart();
  if(FR.archetype==="cumulative") return cumulativeChart();
  return discreteChart();
}

function marginChart(){
  const {x0,x1,y0,y1}=CH;
  const perspective=getWinningMarginPerspective(MARGIN);
  const CUM=MARGIN.cum.map(value=>value*perspective.sign);
  const lo=Math.min(-1,...CUM), hi=Math.max(1,...CUM)+1;
  const Y=v=>y1-(v-lo)/(hi-lo)*(y1-y0), X=i=>x0+(x1-x0)*i/NH, zero=Y(0);
  const perspectiveKey=FEAT.sides[perspective.sideIndex].key;
  const opposingKey=FEAT.sides[perspective.sideIndex===0?1:0].key;
  const colOf = v => v>0?SIDES[perspectiveKey].color:SIDES[opposingKey].color;
  let d=`M${X(0)} ${zero}`, fills="";
  for(let i=1;i<=NH;i++){
    d += ` L${X(i-1)} ${Y(CUM[i])} L${X(i)} ${Y(CUM[i])}`;
    if(CUM[i]!==0) fills += `<rect x="${X(i-1)}" y="${Math.min(zero,Y(CUM[i]))}"
      width="${X(i)-X(i-1)}" height="${Math.abs(Y(CUM[i])-zero)}" fill="${colOf(CUM[i])}" opacity=".16"/>`;
  }
  let grid="";
  for(let v=Math.ceil(lo);v<=hi-1;v++){ if(v===0) continue;
    grid+=`<line x1="${x0}" y1="${Y(v)}" x2="${x1}" y2="${Y(v)}" stroke="#E4E4DC" stroke-width=".5"/>
      <text x="${x0-8}" y="${Y(v)+2.6}" text-anchor="end" font-family="IBM Plex Mono" font-size="7" fill="#6E736C">${Math.abs(v)}</text>`; }
  const tp=MARGIN.turning;
  const band = tp?`<rect x="${X(tp.i)}" y="${y0}" width="${X(tp.i+1)-X(tp.i)}" height="${y1-y0}" fill="#B0821F" opacity=".13"/>
    <line x1="${X(tp.i)}" y1="${y0}" x2="${X(tp.i)}" y2="${CH.ribbonBot}" stroke="#B0821F" stroke-width=".8"/>
    <line x1="${X(tp.i+1)}" y1="${y0}" x2="${X(tp.i+1)}" y2="${CH.ribbonBot}" stroke="#B0821F" stroke-width=".8"/>
    <text x="${(X(tp.i)+X(tp.i+1))/2}" y="${y0-6}" text-anchor="middle" font-family="Archivo"
      font-weight="600" font-size="6.6" letter-spacing="1.4" fill="#B0821F">TURNING POINT</text>`:"";
  const sgn = perspective.sign;
  const segLab = MARGIN.segments.map(s=>{
    const mid=(X(s.idx[0])+X(s.idx[s.idx.length-1]+1))/2;
    const v=s.margin*sgn;
    const txt = v===0?"ALL SQUARE":`${SIDES[v>0?perspectiveKey:opposingKey].name.toUpperCase()} ${Math.abs(v)} UP`;
    return `<text x="${mid}" y="${CH.segY}" text-anchor="middle" font-family="Archivo" font-weight="600"
      font-size="6.4" letter-spacing="1.4" fill="#6E736C">${s.label.toUpperCase()} ${txt}</text>`;
  }).join("");
  const inner = `${grid}${band}${fills}
    <path d="${d}" fill="none" stroke="${SIDES[perspectiveKey].color}" stroke-width="2.2" stroke-linejoin="miter"/>
    <line x1="${x0}" y1="${zero}" x2="${x1}" y2="${zero}" stroke="#14211C" stroke-width="1.4"/>
    <text x="${x0-8}" y="${zero+2.6}" text-anchor="end" font-family="Archivo" font-weight="600"
      font-size="6.6" letter-spacing=".8" fill="#14211C">AS</text>
    <text x="${x1}" y="${Y(MARGIN.total)-8}" text-anchor="end" font-family="Archivo" font-weight="700"
      font-size="10" fill="${SIDES[perspectiveKey].color}">${MARGIN.total===0?'AS':`${Math.abs(MARGIN.total)} UP`}</text>`;
  return chartFrame(inner,yAxisLabel("MATCH MARGIN · HOLES"),segLab);
}

function cumulativeChart(){
  const {x0,x1,y0,y1}=CH;
  const all = FR.series.flatMap(s=>s.run);
  const lo=Math.min(...all), hi=Math.max(...all);
  const pad=(hi-lo)*0.08||1;
  const Y=v=>y1-(v-(lo-pad))/((hi+pad)-(lo-pad))*(y1-y0), X=i=>x0+(x1-x0)*i/NH;
  const top3 = FR.ranked.slice(0,3).map(s=>s.id);
  const paths = FR.series.map(s=>{
    const lead = top3.includes(s.id);
    const p = s.run.map((v,i)=>`${i?"L":"M"}${X(i)} ${Y(v)}`).join(" ");
    const col = HAS_SIDES ? SIDES[S(s.id).side].color : "#14211C";
    return `<path d="${p}" fill="none" stroke="${col}" stroke-width="${lead?2:0.9}"
      opacity="${lead?1:.28}"/>`;
  }).join("");
  const tags = FR.ranked.slice(0,3).map((s,k)=>
    `<text x="${x1+2}" y="${Y(s.run[NH])+3}" text-anchor="end" font-family="Archivo"
      font-weight="700" font-size="7" fill="${HAS_SIDES?SIDES[S(s.id).side].color:'#14211C'}"
      >${initials(nameOf(s.id))} ${s.total>0?"+":""}${s.total}</text>`).join("");
  const tp=FR.turning;
  const band = tp?`<rect x="${X(tp.i)}" y="${y0}" width="${X(tp.i+1)-X(tp.i)}" height="${y1-y0}"
    fill="#B0821F" opacity=".13"/><text x="${(X(tp.i)+X(tp.i+1))/2}" y="${y0-6}" text-anchor="middle"
    font-family="Archivo" font-weight="600" font-size="6.6" letter-spacing="1.4" fill="#B0821F">TURNING POINT</text>`:"";
  const ticks=[lo,(lo+hi)/2,hi].map(v=>`<line x1="${x0}" y1="${Y(v)}" x2="${x1}" y2="${Y(v)}" stroke="#E4E4DC" stroke-width=".5"/>
    <text x="${x0-8}" y="${Y(v)+2.6}" text-anchor="end" font-family="IBM Plex Mono" font-size="6.5" fill="#6E736C">${Math.round(v*10)/10}</text>`).join("");
  return chartFrame(`${ticks}${band}${paths}${tags}`,yAxisLabel(`CUMULATIVE ${String(FR.unit).toUpperCase()}`),
    `<text x="${x0}" y="${CH.segY}" font-family="Archivo" font-weight="600" font-size="6.4"
      letter-spacing="1.4" fill="#6E736C">CUMULATIVE ${String(FR.unit).toUpperCase()} · TOP THREE EMPHASISED</text>`);
}

function discreteChart(){
  const {x0,x1,y0,y1}=CH;
  const X=i=>x0+(x1-x0)*i/NH;
  const hi=Math.max(...FR.per.map(p=>p.value),1);
  const Y=v=>y1-(v/hi)*(y1-y0);
  const bars = FR.per.map(p=>{
    if(!p.value) return "";
    const col = p.winner&&HAS_SIDES ? SIDES[S(p.winner).side].color : "#14211C";
    return `<rect x="${X(p.i)+2}" y="${Y(p.value)}" width="${X(p.i+1)-X(p.i)-4}"
      height="${y1-Y(p.value)}" fill="${col}" opacity=".82"/>
      <text x="${(X(p.i)+X(p.i+1))/2}" y="${Y(p.value)-3}" text-anchor="middle"
      font-family="IBM Plex Mono" font-size="6" fill="#14211C">${usd(p.value)}</text>`;
  }).join("");
  const axis=`<text x="${x0-8}" y="${y1+2.6}" text-anchor="end" font-family="IBM Plex Mono" font-size="6.5" fill="#6E736C">0</text>
    <text x="${x0-8}" y="${Y(hi)+2.6}" text-anchor="end" font-family="IBM Plex Mono" font-size="6.5" fill="#6E736C">${hi}</text>`;
  return chartFrame(`<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="#14211C" stroke-width="1.2"/>${bars}${axis}`,yAxisLabel(FR.unit==="dollars"?"POT VALUE · $":`VALUE · ${String(FR.unit).toUpperCase()}`),
    `<text x="${x0}" y="${CH.segY}" font-family="Archivo" font-weight="600" font-size="6.4"
      letter-spacing="1.4" fill="#6E736C">POT PER HOLE · CARRYOVERS STACKED</text>`);
}

/* ---- turning point ---- */
if(FR && FR.turning) add("turning", ()=>{
  const w=h("div",{class:"callout"});
  const tp=FR.turning, i=tp.i, hole=HOLES[i];
  let body="";
  if(MARGIN){
    body = describeMarginTurningPoint({ margin:MARGIN, game:FEAT, sides:SIDES, players:P, holeIndex:i });
  } else if(FR.archetype==="cumulative"){
    body = `<b>${nameOf(FR.winner.id)}</b> takes the lead here and holds it to the end.`;
  } else {
    body = `<b>${tp.winner?nameOf(tp.winner):"Carry"}</b> takes the largest pot of the round, ${usd(tp.value)}.`;
  }
  w.innerHTML = `<div class="k">Turning point · Hole ${hole} · Par ${C.par[i]} · ${qty(C.yds[i])} yds · SI ${C.si[i]}</div>
    <p>${body} Selected by the featured competition’s deterministic turning-point rule.</p>`;
  return w;
});

/* ---- settlement ---- */
if(HAS_MONEY){
  add("settleh", ()=>secHead("Settlement",
    `${cap(plur(ROUND.games.length,"game"))}, netted to ${plur(PAY.length,"payment")}.`),
    {keepWithNext:true});
  add("settle", ()=>{
    const w=h("div",{class:"split"});
    const gs = ROUND.games;
    const cols = `<colgroup><col style="width:38%">${gs.map(()=>`<col style="width:${52/gs.length}%">`).join("")}<col style="width:20%"></colgroup>`;
    const rows = P.map(p=>`<tr data-row><td class="l">${nameCell(p)}</td>
      ${gs.map(g=>`<td class="n ${(g.moneyBy[p.id]||0)<0?'neg':''}">${acct(g.moneyBy[p.id]||0)}</td>`).join("")}
      <td class="n ${moneyOf(p.id)<0?'neg':'pos'}">${acct(moneyOf(p.id))}</td></tr>`).join("");
    w.appendChild(h("div",{html:
      `<div class="subhead">By game</div><table>${cols}<thead data-rowhead><tr>
        <th class="l">Player</th>${gs.map(g=>`<th class="n">${g.name}</th>`).join("")}
        <th class="n">Total</th></tr></thead><tbody>${rows}</tbody></table>`}));
    const gross = ROUND.games.reduce((a,g)=>a+Object.values(g.moneyBy).filter(v=>v>0).reduce((x,y)=>x+y,0),0);
    const moved = PAY.reduce((a,x)=>a+x.amt,0);
    w.appendChild(h("div",{html:
      `<div class="subhead">Efficient settlement<span>${plur(PAY.length,"payment")} settle ${plur(ROUND.games.length,"game")}</span></div>`
      + PAY.map(x=>`<div class="pay"><em>${nameOf(x.from)} <span class="dim">pays</span> ${nameOf(x.to)}</em><span>${usd(x.amt)}</span></div>`).join("")
      + `<div class="recon"><span>RECONCILED</span><span>${usd(gross)} GROSS &nbsp;→&nbsp; ${usd(moved)} NET</span></div>`}));
    return w;
  });
}

/* ---- highlights ---- */
add("awardsh", ()=>secHead("Highlights",
  "Ties are shown as ties, never resolved by row order."),
  {keepWithNext:true, label:"Result"});
add("awards", ()=>{
  const cards=[];
  const lowG = RANKABLE.slice().sort((a,b)=>a.tot-b.tot)[0];
  const lowN = RANKABLE.slice().sort((a,b)=>a.cnetT-b.cnetT)[0];
  const namesAt=(rows,key,value)=>rows.filter(p=>p[key]===value).map(p=>p.name);
  const grossNames=namesAt(RANKABLE,"tot",lowG.tot), netNames=namesAt(RANKABLE,"cnetT",lowN.cnetT);
  cards.push(["Low gross",listw(grossNames),lowG.tot,grossNames.length>1]);
  cards.push(["Low net · full CH",listw(netNames),lowN.cnetT,netNames.length>1]);
  if(NH>9){
    const f=RANKABLE.slice().sort((a,b)=>a.out-b.out)[0], b=RANKABLE.slice().sort((a,b)=>a.inn-b.inn)[0];
    const fn=namesAt(RANKABLE,"out",f.out), bn=namesAt(RANKABLE,"inn",b.inn);
    cards.push(["Best front",listw(fn),f.out,fn.length>1]);
    cards.push(["Best back",listw(bn),b.inn,bn.length>1]);
  }
  const birdRows=P.map(p=>({name:p.name,n:p.delta.filter(d=>d<0).length}));
  const bird=Math.max(...birdRows.map(row=>row.n));
  const birdNames=birdRows.filter(row=>row.n===bird).map(row=>row.name);
  cards.push(["Most birdies",listw(birdNames),bird,birdNames.length>1]);
  const w=h("div",{class:"awards",style:`grid-template-columns:repeat(${cards.length},1fr)`});
  cards.forEach(([k,v,n,t])=>w.appendChild(h("div",{class:"aw",
    html:`<div class="k">${k}${t?" (T)":""}</div><div class="v">${v}</div><div class="n">${n}</div>`})));
  return w;
});

/* ---- recap: always included, no user toggle ---- */
add("recaph", ()=>secHead("The Story of the Round",
  "Generated from the authoritative scorecard, competitions, settlement and recorded round context."),
  {keepWithNext:true, breakBefore:true, label:"Round story"});
add("recap", ()=>{
  const w=h("div",{class:"prose"});
  const supplied = String(ROUND.meta.story || ROUND.meta.recap || "").trim();
  const beats = supplied
    ? storyParagraphs(supplied)
    : recapBeats();
  beats.forEach(b=>w.appendChild(h("p",{"data-row":"",text:b})));
  return w;
});   /* not splittable: column-count makes per-row measurement unreliable */

function storyParagraphs(text){
  const explicit=String(text||"").split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean);
  if(explicit.length>1) return explicit;
  const sentences=String(text||"").match(/[^.!?]+[.!?]+(?:[\"'’”)]*)|[^.!?]+$/g)
    ?.map(v=>v.trim()).filter(Boolean)||[];
  if(sentences.length<4) return explicit;
  const paragraphCount=Math.min(4,Math.max(3,Math.ceil(sentences.length/3)));
  const size=Math.ceil(sentences.length/paragraphCount), paragraphs=[];
  for(let i=0;i<sentences.length;i+=size) paragraphs.push(sentences.slice(i,i+size).join(" "));
  return paragraphs;
}

function recapBeats(){
  const beats=[];
  if(!COMPLETE){
    const short=P.filter(p=>p.nPlayed<NH).sort((a,b)=>a.nPlayed-b.nPlayed);
    const same=new Set(short.map(p=>p.nPlayed)).size===1;
    const who = same
      ? `${listw(short.map(p=>p.name))} posted ${short[0].nPlayed} of ${NH} holes`
      : listw(short.map(p=>`${p.name} posted ${p.nPlayed} of ${NH}`));
    let s=`This round is incomplete: ${who}. Unplayed holes are excluded rather than estimated, so gross and net totals are not comparable across players.`;
    if(MARGIN) s+=` The featured competition is settled over the ${MARGIN.holesScored} ${MARGIN.holesScored===1?"hole":"holes"} both sides contested.`;
    beats.push(s);
  }
  if(MARGIN && WINK){
    const wg=sideOf(WINK).reduce((a,p)=>a+p.tot,0), lg=sideOf(LOSEK).reduce((a,p)=>a+p.tot,0);
    const top=P.slice().sort((a,b)=>a.tot-b.tot).slice(0,Math.min(4,P.length));
    const nTop=top.filter(p=>p.side===LOSEK).length;
    beats.push(lg<wg
      ? `${SIDES[LOSEK].name} had the better ball-striking day and it bought them nothing. They posted ${lg} gross to the ${SIDES[WINK].name}' ${wg} and took ${wn(nTop)} of the ${wn(top.length)} lowest scores in the field, but the featured game was best-${wn(FEAT.bestN||2)} net, and best-${wn(FEAT.bestN||2)} net rewards the side with players who can go low on the same hole.`
      : `${SIDES[WINK].name} won this the straightforward way. They posted ${wg} gross to the ${SIDES[LOSEK].name}' ${lg} and took ${wn(top.length-nTop)} of the ${wn(top.length)} lowest scores in the field.`);
    const lb = MARGIN.per.map(r=>({i:r.i,hole:r.hole,
      gain: LOSEK===FEAT.sides[1].key?Math.max(0,r.a-r.b):Math.max(0,r.b-r.a)}))
      .filter(x=>x.gain>0).sort((a,b)=>b.gain-a.gain)[0];
    if(lb){
      const hero=sideOf(LOSEK).map(p=>({p,v:p.fnet[lb.i]})).sort((a,b)=>a.v-b.v)[0];
      let s=`${hero.p.name}'s net ${hero.v} at the ${ordw(lb.hole)} — ${qty(C.yds[lb.i])} yards, stroke index ${C.si[lb.i]} — was the ${SIDES[LOSEK].name}'s high-water mark. It swung the hole by ${lb.gain}`;
      s += MARGIN.lastLevel>lb.hole
        ? `, and by the ${ordw(MARGIN.lastLevel)} the match was square again. That was the last time it was level.`
        : MARGIN.lastLevel>0 ? `, but the match was already gone by the ${ordw(MARGIN.lastLevel)}.`
        : `, and it was the closest they came.`;
      beats.push(s);
    }
    const tp=MARGIN.turning;
    if(tp){
      const heroes=sideOf(WINK).map(p=>({p,v:p.fnet[tp.i]})).sort((a,b)=>a.v-b.v).slice(0,FEAT.bestN||2);
      const opp=MARGIN.per[tp.i][WINK===FEAT.sides[1].key?"a":"b"];
      const atTurn = NH>9 && tp.hole===Math.ceil(NH/2);
      beats.push(`At the ${ordw(tp.hole)} — ${qty(C.yds[tp.i])} yards, the ${ordw(C.si[tp.i])}-hardest hole on the card — ${listw(heroes.map(x=>x.p.name))} both signed for net ${heroes[0].v} against ${an(SIDES[LOSEK].name)} best ${wn(FEAT.bestN||2)} of ${opp}. ${cap(wn(tp.gain))} shots on one hole${atTurn?", at the turn":""}. ${SIDES[WINK].name} went ${Math.abs(MARGIN.cum[tp.i+1])} up and were never caught.`);
    }
    if(MARGIN.segments.length>1){
      const last=MARGIN.segments[MARGIN.segments.length-1];
      const sgn = WINK===FEAT.sides[1].key?1:-1;
      const gains=last.idx.map(i=>({i,hole:MARGIN.per[i].hole,
        gain: WINK===FEAT.sides[1].key?Math.max(0,MARGIN.per[i].a-MARGIN.per[i].b):Math.max(0,MARGIN.per[i].b-MARGIN.per[i].a)}))
        .filter(x=>x.gain>0).sort((a,b)=>b.gain-a.gain||a.i-b.i).slice(0,3).sort((a,b)=>a.i-b.i);
      if(gains.length){
        const phr=gains.map(x=>{
          const hero=sideOf(WINK).map(p=>({p,v:p.fnet[x.i]})).sort((a,b)=>a.v-b.v)[0];
          return `${hero.p.name}'s net ${hero.v} at the ${ordw(x.hole)}`;});
        beats.push(`The ${last.label.toLowerCase()} nine ${last.margin*sgn>0?"repeated the pattern rather than reversing it":"was tighter"}: ${listw(phr)}. ${SIDES[WINK].name} carried it by ${Math.abs(last.margin)}.`);
      }
    }
  } else {
    const byG=P.slice().sort((a,b)=>a.tot-b.tot), byN=P.slice().sort((a,b)=>a.cnetT-b.cnetT);
    if(P.length>1){
      beats.push(`${byG[0].name} signed for the low round of the day, a ${byG[0].tot}, ${byG[1].tot===byG[0].tot?"tied with":"clear of"} ${byG[1].name} at ${byG[1].tot}. On full course handicap the card went to ${byN[0].name} at net ${byN[0].cnetT}.`);
      const beat=P.slice().sort((a,b)=>(a.cnetT-a.parPlayed)-(b.cnetT-b.parPlayed))[0];
      beats.push(`${beat.name} played ${Math.abs(beat.cnetT-beat.parPlayed)} ${beat.cnetT-beat.parPlayed<0?"under":"over"} his handicap, the best relative performance in the field off a course handicap of ${beat.ch}.`);
    } else {
      const p=P[0], d=p.tot-p.parPlayed;
      beats.push(`${p.name} went round in ${p.tot}, ${d===0?"level with":d>0?d+" over":Math.abs(d)+" under"} par, for a net ${p.cnetT} off ${p.ch}.`);
      const best=bestStretch(p), worst=worstStretch(p);
      beats.push(`The best stretch came at holes ${best.from}–${best.to}, ${best.rel<=0?Math.abs(best.rel)+" under":best.rel+" over"} par across ${wn(best.n)} holes. The round came apart at ${worst.from}–${worst.to}, ${worst.rel} over.`);
    }
    const bird=P.map(p=>({p,n:p.gross.filter((g,i)=>g<C.par[i]).length})).sort((a,b)=>b.n-a.n)[0];
    beats.push(`${bird.p.name} led the field with ${plur(bird.n,"birdie")}.`);
  }

  if(HAS_MONEY && WINK){
    let s="";
    SIDEGAMES.forEach(g=>{
      if(g.R && g.R.archetype==="discrete" && g.R.top){
        const who=S(g.R.top[0]);
        const lw=g.R.per.filter(x=>x.winner&&S(x.winner).side===LOSEK).length;
        const ww=g.R.per.filter(x=>x.winner&&S(x.winner).side===WINK).length;
        s += `The ${g.name.toLowerCase()} were a separate game and they did pay: ${usd(g.R.pot)} a hole, ${wn(lw)} to the ${SIDES[LOSEK].name} and ${wn(ww)} to the ${SIDES[WINK].name}.`;
        const mine=moneyOf(who.id), worst=Math.min(...sideOf(who.side).map(p=>moneyOf(p.id)));
        s += mine<0
          ? ` ${who.name} took ${wn(g.R.top[1])} of them, and they are the only reason he lost ${usd(mine)} on the day instead of ${usd(worst)}.`
          : ` ${who.name} took ${wn(g.R.top[1])} of them and was the only man on his side to finish ahead, at ${usd(mine)}.`;
      }
    });
    const wm=sideMoney(WINK), moved=PAY.reduce((a,x)=>a+x.amt,0);
    s += wm>0 ? ` Across ${plur(ROUND.games.length,"game")} the ${SIDES[WINK].name} collected ${usd(wm)}, settled in ${plur(PAY.length,"payment")}.`
      : PAY.length ? ` Across ${plur(ROUND.games.length,"game")} the two sides finished level on money, with ${usd(moved)} changing hands in ${plur(PAY.length,"payment")}.`
      : ` No payments were required.`;
    beats.push(s.trim());
  } else if(WINK) beats.push("No wagers were recorded on this round, so the margin above is the whole result.");
  return beats;
}
function bestStretch(p){ return stretch(p,(a,b)=>a<b); }
function worstStretch(p){ return stretch(p,(a,b)=>a>b); }
function stretch(p,better){
  const n=Math.min(6,NH); let best=null;
  for(let i=0;i+n<=NH;i++){
    const rel=sum(p.gross,i,i+n)-sum(C.par,i,i+n);
    if(!best||better(rel,best.rel)) best={from:HOLES[i],to:HOLES[i+n-1],rel,n};
  }
  return best;
}

/* ---- memories + weather ---- */
if(ROUND.meta.weather || ROUND.memories.length){
  add("memh", ()=>secHead("From the round",
    "Recorded during play. Verbatim."), {keepWithNext:true});
  add("mem", ()=>{
    const w=h("div");
    if(ROUND.meta.weather) w.appendChild(h("div",{class:"wx","data-row":"",
      html:`<div class="k">Conditions · recorded at ${ROUND.meta.weather.recordedAt}</div>
            <div class="t">${ROUND.meta.weather.note}</div>`}));
    ROUND.memories.slice().sort((a,b)=>HOLES.indexOf(a.hole)-HOLES.indexOf(b.hole))
      .forEach(m=>w.appendChild(h("div",{class:"mem","data-row":"",
        html:`<div class="h">HOLE ${m.hole}</div><div class="t">${m.text}</div>`})));
    return w;
  }, {splittable:true, minRows:2});
}

/* ---- leaderboard ---- */
add("lbh", ()=>secHead("Player leaderboard",
  "Ranked by course net. Every net column declares its basis."),
  {keepWithNext:true, breakBefore:true, label:"Leaderboards"});
add("lb", ()=>{
  const money = HAS_MONEY;
  const cols = [
    ["l","Player","22%"],["n","Idx","5%"],["n",NH<18?"CH /<br>alloc.":"CH","5%"],
    ...(NH>9?[["n","Out","5%"],["n","In","5%"]]:[]),
    ["n","Gross","6%"],["n","Postable","7%"],["n","Net<br>full CH","8%"],["n","To<br>par","6%"],
    ["n","Net<br>featured","8%"],["n","Bird+","5%"],["n","Dbl+","5%"],
    ...(COMPLETE?[]:[["n","Holes","6%"]]),
    ...(money?[["n","Money","10%"]]:[])];
  const rows=P.slice().sort((a,b)=>a.cnetT-b.cnetT).map(p=>{
    const bird=p.delta.filter(d=>d<0).length;
    const dbl=p.delta.filter(d=>d>=2).length;
    const tp=p.cnetT-p.parPlayed;
    return `<tr data-row><td class="l">${nameCell(p)}</td>
      <td class="n dim">${p.index.toFixed(1)}</td><td class="n dim">${NH<18?`${p.ch} / ${sum(p.strokes.courseNet)}`:p.ch}</td>
      ${NH>9?`<td class="n">${p.out}</td><td class="n">${p.inn}</td>`:""}
      <td class="n"><b>${p.tot}</b></td><td class="n">${p.postable}</td><td class="n">${p.cnetT}</td>
      <td class="n">${tp===0?"E":(tp>0?"+":"")+tp}</td><td class="n">${p.fnetT}</td>
      <td class="n">${bird}</td><td class="n">${dbl}</td>
      ${COMPLETE?"":`<td class="n dim">${p.nPlayed}</td>`}
      ${money?`<td class="n ${moneyOf(p.id)<0?'neg':'pos'}">${acct(moneyOf(p.id))}</td>`:""}</tr>`;
  }).join("");
  const w=h("div");
  w.innerHTML=`<table><colgroup>${cols.map(c=>`<col style="width:${c[2]}">`).join("")}</colgroup>
    <thead data-rowhead><tr>${cols.map(c=>`<th class="${c[0]}">${c[1]}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table><div class="note" style="padding-top:6px">POSTABLE IS ADJUSTED GROSS FOR HANDICAP-POSTING PURPOSES; IT IS NOT COURSE NET OR FEATURED NET.${NH<18?' CH IS THE 18-HOLE COURSE HANDICAP BASIS; ALLOC. IS THE NUMBER OF COURSE-NET STROKES APPLIED TO THIS NINE.':''}</div>`;
  return w;
}, {splittable:true, minRows:3});

/* ---- score distribution ---- */
add("disth", ()=>secHead("Score distribution",
  "Gross scores relative to par."), {keepWithNext:true});
add("dist", ()=>{
  const BK=[["Birdie+","#1E6B4F",d=>d<0],["Par","#7E8C84",d=>d===0],
            ["Bogey","#C9A227",d=>d===1],["Double","#B06A2C",d=>d===2],
            ["Triple+","#8C3A2B",d=>d>=3]];
  const wide = String(NH).length;                     // counts never wrap
  const tailW = (BK.length*(wide+3))+"ch";
  const w=h("div",{style:`--distname:1.35in`});
  P.slice().sort((a,b)=>a.tot-b.tot).forEach(p=>{
    const cts=BK.map(b=>p.delta.filter(b[2]).length);
    const den=Math.max(1,p.nPlayed);
    const bars=cts.map((c,i)=>c?`<span style="background:${BK[i][1]};width:${c/den*100}%"></span>`:"").join("");
    w.appendChild(h("div",{class:"dist","data-row":"",
      html:`<div class="who nm">${HAS_SIDES?dot(p.side):""}<span class="fitname" data-full="${p.name}">${p.name}</span></div>
            <div class="bar">${bars}</div>
            <div class="tail" style="min-width:${tailW}">${cts.join(" / ")}</div>`}));
  });
  w.appendChild(h("div",{class:"legend","data-row":"",
    html:BK.map(b=>`<span><i style="background:${b[1]}"></i>${b[0]}</span>`).join("")
      +`<span style="margin-left:auto;white-space:nowrap">${BK.map(b=>b[0].toUpperCase()).join(" / ")}</span>`}));
  return w;
});   /* not splittable: a compact visual block, and splitting stranded the legend */

/* ---- team totals ----
   Restored from v1. Three handicap bases coexist in this app and two of them
   were both labelled "Net" in the original report, which is how a head-to-head
   of +4 sat on the same page as a headline of 5 up. Every column declares its
   basis and the footnote names the one that paid. */
if(HAS_SIDES && MARGIN){
  add("teamh", ()=>secHead("Team totals",
    "Three net bases shown. Only the featured competition settles."),
    {keepWithNext:true, label:"Leaderboards"});
  add("team", ()=>{
    const teamPar = k => sideOf(k).reduce((a,p)=>a+p.parPlayed,0);
    const f = v => v>0?"+"+v:v===0?"AS":String(v);
    const rows = SIDEKEYS.map(k=>{
      const t = sideOf(k);
      const g = t.reduce((a,p)=>a+p.tot,0);
      const nA = t.reduce((a,p)=>a+p.cnetT,0);
      const nB = t.reduce((a,p)=>a+p.onetT,0);
      const nC = t.reduce((a,p)=>a+p.fnetT,0);
      const sgn = k===FEAT.sides[1].key ? 1 : -1;
      const segs = MARGIN.segments.map(s=>`<td class="n">${f(s.margin*sgn)}</td>`).join("");
      const agg = MARGIN.aggregate ? MARGIN.aggregate.margin*sgn : MARGIN.total*sgn;
      const tp = g - teamPar(k);
      return `<tr data-row><td class="l">${dot(k)}${SIDES[k].name}</td>
        <td class="n">${g}</td><td class="n">${tp>0?"+":""}${tp}</td>
        <td class="n dim">${nA}</td><td class="n dim">${nB}</td><td class="n">${nC}</td>
        <td class="n">${MARGIN.per.filter(x=>x.scored&&x.win!==null&&FEAT.sides[x.win].key===k).length}</td>
        <td class="n">${MARGIN.per.filter(x=>x.scored&&x.win===null).length}</td>
        ${segs}<td class="n ${agg>0?'pos':'neg'}"><b>${f(agg)}</b></td></tr>`;
    }).join("");
    /* head-to-head on full course handicap, for the footnote */
    const b2=(k,i)=>{const v=sideOf(k).map(p=>p.cnet[i]).filter(isNum).sort((a,b)=>a-b);
      return v.length<(FEAT.bestN||2)?null:v.slice(0,FEAT.bestN||2).reduce((a,b)=>a+b,0);};
    let d0=0,d1=0;
    MARGIN.per.forEach(x=>{ if(!x.scored) return;
      const a=b2(SIDEKEYS[0],x.i), b=b2(SIDEKEYS[1],x.i);
      if(a===null||b===null) return; if(a<b)d0++; else if(b<a)d1++; });
    const altH2H = d1-d0, aggShown = MARGIN.aggregate?MARGIN.aggregate.margin:MARGIN.total;
    const segCols = MARGIN.segments.map(s=>`<th class="n">${s.label}</th>`).join("");
    const nCols = 8 + MARGIN.segments.length;
    const w=h("div");
    w.innerHTML = `<table class="dense"><colgroup>
      <col style="width:22%">${Array.from({length:nCols-1},()=>`<col style="width:${78/(nCols-1)}%">`).join("")}</colgroup>
      <thead data-rowhead><tr><th class="l">Team</th><th class="n">Gross</th><th class="n">To par</th>
      <th class="n">Course<br>net</th><th class="n">Net<br>100% off low</th>
      <th class="n">Featured<br>net</th><th class="n">Holes<br>won</th><th class="n">Halved</th>
      ${segCols}<th class="n">Match</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note" style="padding-top:6px">COURSE NET USES EACH PLAYER'S FULL COURSE HANDICAP. 100% OFF LOW IS AN INFORMATIONAL COMPARISON.
      FEATURED NET, HOLES WON, HALVED AND THE SEGMENT COLUMNS ALL USE THE FEATURED COMPETITION — ${FEAT.allowance.label.toUpperCase()}
      (${LOWMAN.name.toUpperCase()}, CH ${LOWCH}). THE OTHER TWO NET COLUMNS DO NOT SETTLE THIS GAME AND
      WILL DISAGREE: ON FULL COURSE HANDICAP THE HEAD-TO-HEAD WOULD READ
      ${altH2H>0?"+":""}${altH2H}, NOT ${aggShown>0?"+":""}${aggShown}. IT IS NOT THE BASIS THAT PAID.</div>`;
    return w;
  }, {splittable:true, minRows:2});
}

/* ---- featured competition hole by hole ---- */
if(MARGIN){
  add("fdeth", ()=>secHead(FEAT.name+" · hole by hole",
    `Best ${wn(FEAT.bestN||2)} net per side.`),
    {keepWithNext:true, breakBefore:true, label:"Games"});
  add("fdet", ()=>{
    const w=h("div");
    const segs = MARGIN.segments;
    const lbl=t=>`<td style="font-family:Archivo;font-weight:600;font-size:5.6pt;letter-spacing:.1em;color:#6E736C;white-space:nowrap;padding-right:6px">${t}</td>`;
    segs.forEach(s=>{
      const perspective=getSegmentMarginPerspective(MARGIN,s);
      const perspectiveSide=FEAT.sides[perspective.sideIndex];
      const opposingSide=FEAT.sides[perspective.sideIndex===0?1:0];
      const perspectiveName=SIDES[perspectiveSide.key].name;
      const opposingName=SIDES[opposingSide.key].name;
      const cells=s.idx.map(i=>{
        const r=MARGIN.per[i];
        const k=r.win===null?null:FEAT.sides[r.win].key;
        const c=k?SIDES[k].color:"#EDEDE6", fg=k?"#fff":"#6E736C";
        const first=perspective.sideIndex===0?r.a:r.b;
        const second=perspective.sideIndex===0?r.b:r.a;
        return `<td style="padding:0 1px"><div style="background:${c};color:${fg};font-family:IBM Plex Mono;font-size:6.4pt;font-weight:600;text-align:center;padding:3px 0">${k||"½"}</div>
          <div style="font-family:IBM Plex Mono;font-size:6.2pt;text-align:center;color:#6E736C;padding-top:1.5px">${first}–${second}</div></td>`;}).join("");
      const heads=s.idx.map(i=>`<td style="font-family:IBM Plex Mono;font-size:6.2pt;text-align:center;padding-bottom:2px">${MARGIN.per[i].hole}</td>`).join("");
      const runs=s.idx.map((i,index)=>{ const value=perspective.runningMargins[index]; return `<td style="font-family:IBM Plex Mono;font-size:6.2pt;text-align:center;padding-top:2px;font-weight:600">${value===0?"AS":value>0?`+${value}`:String(value)}</td>`; }).join("");
      const v=s.margin;
      const res=v===0?"ALL SQUARE":`${SIDES[FEAT.sides[v>0?1:0].key].name.toUpperCase()} ${Math.abs(v)} UP`;
      w.appendChild(h("div",{"data-row":"",html:
        `<div style="font-family:Archivo;font-weight:600;font-size:6.4pt;letter-spacing:.08em;color:#6E736C;margin-bottom:3px">${s.label.toUpperCase()} · ${perspectiveName.toUpperCase()} PERSPECTIVE · NET ${perspectiveName.toUpperCase()}–${opposingName.toUpperCase()}</div>
         <table style="width:100%;margin-bottom:2px"><tr>${lbl("HOLE")}${heads}</tr>
         <tr>${lbl("RESULT")}${cells}</tr>
         <tr>${lbl("RUNNING")}${runs}</tr></table>
         <div style="font-family:Archivo;font-weight:700;font-size:8pt;text-align:right;white-space:normal;margin:0 0 7px;color:${v>0?SIDES[FEAT.sides[1].key].color:v<0?SIDES[FEAT.sides[0].key].color:'#6E736C'}">${s.label.toUpperCase()} · ${res}</div>`}));
    });
    const perW = FEAT.stakePerSegment;
    const bets = segs.length + (MARGIN.aggregate?1:0);
    const cardBasis = String(FEAT.basis||"net").toLowerCase()==="gross"?"GROSS":"NET";
    const cardTotals = [
      {name:SIDES[FEAT.sides[0].key].name,total:sum(MARGIN.per.filter(r=>r.scored).map(r=>r.a))},
      {name:SIDES[FEAT.sides[1].key].name,total:sum(MARGIN.per.filter(r=>r.scored).map(r=>r.b))},
    ];
    w.appendChild(h("div",{"data-row":"",class:"recon",html:
      `<span>BEST ${wn(FEAT.bestN||2).toUpperCase()} ${cardBasis} PER SIDE · ${SIDES[SIDEKEYS[0]].name.toUpperCase()}–${SIDES[SIDEKEYS[1]].name.toUpperCase()} UNDER EACH HOLE</span>
       <span style="color:#14211C;font-weight:600">${MARGIN.aggregate?`AGGREGATE ${MARGIN.aggregate.margin>0?SIDES[FEAT.sides[1].key].name.toUpperCase():SIDES[FEAT.sides[0].key].name.toUpperCase()} ${Math.abs(MARGIN.aggregate.margin)} UP · `:""}${perW?`${wn(bets).toUpperCase()} BETS × ${usd(perW)} = ${usd(bets*perW)} EACH`:"NO WAGER"}</span>`}));
    w.appendChild(h("div",{"data-row":"",class:"note",style:"padding-top:5px",html:
      `<strong>BEST-BALL CARD TOTAL · BEST ${wn(FEAT.bestN||2).toUpperCase()} ${cardBasis}</strong> · ${cardTotals.map(side=>`${side.name.toUpperCase()} ${side.total}`).join(" · ")} · INFORMATIONAL AGGREGATE; THE ${FEAT.type==="nassau"?"NASSAU":"MATCH"} RESULT IS DETERMINED HOLE BY HOLE.`}));
    return w;
  }, {splittable:true, minRows:1});
}

/* ---- side games, ordered by money moved ---- */
SIDEGAMES.forEach((g,gi)=>{
  add("sg"+gi+"h", ()=>secHead(g.name,
    g.R&&g.R.archetype==="discrete"&&g.R.stake
      ? `Par 3s · ${usd(g.R.stake)} per player per hole` : ""),
    {keepWithNext:true, label:"Games"});
  add("sg"+gi, ()=>{
    const w=h("div",{class:"split"});
    if(g.R && g.R.archetype==="discrete"){
      const rows=g.R.per.map(x=>`<tr data-row><td class="l">H${x.hole}</td>
        <td class="n dim">${qty(C.yds[x.i])}</td>
        <td class="l">${x.winner?nameCell(S(x.winner)):'<span class="dim">carried</span>'}</td>
        <td class="n pos">${usd(x.value)}</td></tr>`).join("");
      w.appendChild(h("div",{html:
        `<div class="subhead">By hole<span>${usd(g.R.pot)} pot</span></div>
         <table class="dense"><colgroup><col style="width:16%"><col style="width:16%"><col style="width:46%"><col style="width:22%"></colgroup>
         <thead data-rowhead><tr><th class="l">Hole</th><th class="n">Yds</th><th class="l">Winner</th><th class="n">Pot</th></tr></thead>
         <tbody>${rows}</tbody></table>`}));
      const pos=P.slice().sort((a,b)=>(g.moneyBy[b.id]||0)-(g.moneyBy[a.id]||0));
      const potentialPots=(g.R.per?.length||0)*(Number(g.R.pot)||0);
      w.appendChild(h("div",{html:
        `<div class="subhead">Net position<span>${usd(potentialPots)} potential pots · ${usd(g.R.netFlow)} settled net</span></div>
         <table class="dense"><colgroup><col style="width:64%"><col style="width:36%"></colgroup><tbody>
         ${pos.map(p=>`<tr data-row><td class="l">${nameCell(p)}</td>
           <td class="n ${(g.moneyBy[p.id]||0)<0?'neg':'pos'}">${acct(g.moneyBy[p.id]||0)}</td></tr>`).join("")}
         </tbody></table>
         <div class="note" style="margin-top:6px">${usd(g.R.stake)} FROM EACH OF THE OTHER ${plur(P.length-1,"player").toUpperCase()}, SO THE POT ON ANY ONE HOLE IS ${usd(g.R.pot)}. ${describeFinalCarry(g.R,P.length).toUpperCase()} A SEPARATE GAME FROM THE FEATURED COMPETITION; IT SETTLES INDEPENDENTLY.</div>`}));
    } else {
      const pos=P.slice().sort((a,b)=>(g.moneyBy[b.id]||0)-(g.moneyBy[a.id]||0));
      w.appendChild(h("div",{html:`<div class="subhead">Net position</div>
        <table class="dense"><tbody>${pos.map(p=>`<tr data-row><td class="l">${nameCell(p)}</td>
        <td class="n ${(g.moneyBy[p.id]||0)<0?'neg':'pos'}">${acct(g.moneyBy[p.id]||0)}</td></tr>`).join("")}</tbody></table>`}));
      w.appendChild(h("div",{html:`<div class="subhead">Detail</div><div class="note">No hole detail recorded for this game.</div>`}));
    }
    return w;
  });
});

/* ---- player statistics ---- */
add("statsh", ()=>secHead("Player statistics",
  "Scoring plus recorded ball-striking, short-game and putting statistics."),
  {keepWithNext:true, breakBefore:true, label:"Statistics"});
if(!P.some(p=>p.statistics)) add("stats", ()=>{
  const types=[3,4,5].filter(t=>C.par.includes(t));
  const idxOf=t=>C.par.map((v,i)=>v===t?i:-1).filter(i=>i>=0);
  const nameW=26, restW=(100-nameW)/(5+types.length);
  const cols=[["l","Player",nameW+"%"],["n","Gross<br>avg",restW+"%"],
    ["n","Birdie+",restW+"%"],["n","Par or<br>better",restW+"%"],
    ["n","Double<br>avoid.",restW+"%"],["n","Worst<br>hole",restW+"%"],
    ...types.map(t=>["n",`Par ${t}<br>(${idxOf(t).length})`,restW+"%"])];
  const rows=P.slice().sort((a,b)=>a.tot-b.tot).map(p=>{
    const d=p.gross.map((g,i)=>g-C.par[i]);
    const pc=n=>Math.round(n/NH*100)+"%";
    const worst=Math.max(...d), occ=d.filter(x=>x===worst).length;
    const pt=types.map(t=>{
      const idx=idxOf(t), av=idx.reduce((a,i)=>a+p.gross[i],0)/idx.length, dv=av-t;
      return `<td class="n">${av.toFixed(2)} <span class="dim">${dv===0?"E":(dv>0?"+":"")+dv.toFixed(2)}</span></td>`;}).join("");
    return `<tr data-row><td class="l">${nameCell(p)}</td>
      <td class="n">${(p.tot/NH).toFixed(2)}</td><td class="n">${pc(d.filter(x=>x<0).length)}</td>
      <td class="n">${pc(d.filter(x=>x<=0).length)}</td><td class="n">${pc(d.filter(x=>x<2).length)}</td>
      <td class="n">+${worst} <span class="dim">×${occ}</span></td>${pt}</tr>`;}).join("");
  const w=h("div");
  w.innerHTML=`<table class="dense"><colgroup>${cols.map(c=>`<col style="width:${c[2]}">`).join("")}</colgroup>
    <thead data-rowhead><tr>${cols.map(c=>`<th class="${c[0]}">${c[1]}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table>`;
  return w;
}, {splittable:true, minRows:3});

const TRACKED_PLAYERS=P.filter(p=>p.statistics?.tracked?.trackedHoles);
const statObj=v=>v&&typeof v==="object"?v:{};
const statNum=v=>Number.isFinite(Number(v))?Number(v):0;
const statRate=(n,d)=>!statNum(d)?"—":`${Math.round(statNum(n)/statNum(d)*100)}% <span class="dim">(${statNum(n)}/${statNum(d)})</span>`;
const statAvg=(n,d)=>statNum(d)?(statNum(n)/statNum(d)).toFixed(2):"—";
const statSigned=v=>statNum(v)===0?"E":`${statNum(v)>0?"+":""}${statNum(v).toFixed(2)}`;
function buildTrackedStatisticsPage(page){
  const w=h("div",{class:`ledger-stat-page ledger-stat-page-${page}`});
  const obj=statObj,num=statNum,rate=statRate,avg=statAvg,signed=statSigned;
  const table=(title,note,heads,rows)=>`<div class="subhead" data-ledger-stat-group="${title.toLowerCase().replace(/[^a-z]+/g,"-")}">${title}<span>${note}</span></div>
    <table class="dense"><thead data-rowhead><tr>${heads.map((x,i)=>`<th class="${i?"n":"l"}">${x}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  const scoring=P.map(p=>{ const s=obj(p.statistics),t=obj(s.tracked),holes=num(s.scoredHoles)||num(p.nPlayed);
    return `<tr data-row><td class="l">${nameCell(p)}</td><td class="n">${holes||"—"}</td><td class="n">${avg(p.tot,holes)}</td>
      <td class="n">${rate(s.birdieOrBetter,holes)}</td><td class="n">${rate(s.parOrBetter,holes)}</td><td class="n">${rate(s.bogeyOrBetter,holes)}</td>
      <td class="n">${num(t.trackedHoles)?rate(num(t.trackedHoles)-num(t.penaltyHoles),t.trackedHoles):"—"}</td></tr>`; }).join("");
  if(page==="performance") w.innerHTML=table("Scoring","Completed, scored holes; rates show count/sample.",
    ["Player","Holes","Gross avg","Birdie+","Par+","Double avoid.","Penalty-free"],scoring);
  const tracked=P.filter(p=>p.statistics?.tracked?.trackedHoles);
  if(tracked.length){
    const ball=tracked.map(p=>{ const s=obj(p.statistics),t=obj(s.tracked); return `<tr data-row><td class="l">${nameCell(p)}</td><td class="n">${num(t.trackedHoles)}</td>
      <td class="n">${rate(t.fairwaysHit,t.fairwayOpps)}</td><td class="n">${rate(t.greens,t.greenOpps)}</td><td class="n">${rate(s.convertedGreens,s.greensInRegulation)}</td>
      <td class="n">${rate(s.fairwayHitGirs,s.fairwayHitOpportunities)}</td><td class="n">${rate(s.fairwayMissedGirs,s.fairwayMissedOpportunities)}</td>
      <td class="n">${Number.isFinite(s.fairwayGirAdvantage)?`${s.fairwayGirAdvantage>=0?"+":""}${Math.round(s.fairwayGirAdvantage*100)} pp`:"—"}</td></tr>`; }).join("");
    if(page==="performance") w.innerHTML+=table("Ball Striking","Recorded tracked holes only; GIR birdie conversion includes par-5 greens reached in two.",
      ["Player","Tracked","Fairways","GIR","Birdie+ / GIR","GIR / FW hit","GIR / FW miss","FW advantage"],ball);
    const short=tracked.map(p=>{ const t=obj(p.statistics.tracked); return `<tr data-row><td class="l">${nameCell(p)}</td><td class="n">${num(t.trackedHoles)}</td>
      <td class="n">${num(t.puttOpps)?num(t.putts):"—"}</td><td class="n">${avg(t.putts,t.puttOpps)}</td><td class="n">${rate(t.upAndDowns,t.scramblingOpps)}</td><td class="n">${rate(t.sandies,t.sandSaveOpps)}</td></tr>`; }).join("");
    if(page==="performance") w.innerHTML+=table("Short Game & Recovery","Only recorded opportunities enter each denominator.",
      ["Player","Tracked","Putts","Putts / hole","Scrambling","Sand saves"],short);

    const lies=["FAIRWAY","ROUGH","BUNKER","FRINGE","OTHER"];
    if(tracked.some(p=>lies.some(k=>num(obj(obj(p.statistics.tracked).recoveryByLie)[k]?.opportunities)))){
      const rows=tracked.map(p=>{ const r=obj(obj(p.statistics.tracked).recoveryByLie); return `<tr data-row><td class="l">${nameCell(p)}</td>${lies.map(k=>`<td class="n">${rate(obj(r[k]).successes,obj(r[k]).opportunities)}</td>`).join("")}</tr>`; }).join("");
      if(page==="performance") w.innerHTML+=table("Recovery by Lie","Scrambling success from the recorded lie; unknown lies are excluded.",
        ["Player","Fairway","Rough","Bunker","Fringe","Other"],rows);
    }

    const fwKeys=["HIT","LEFT","RIGHT"];
    if(tracked.some(p=>fwKeys.some(k=>num(obj(obj(p.statistics.tracked).fairwayOutcomes)[k]?.opportunities)))){
      const rows=tracked.map(p=>{ const t=obj(p.statistics.tracked),f=obj(t.fairwayOutcomes); const known=fwKeys.reduce((total,k)=>total+num(obj(f[k]).opportunities),0); return `<tr data-row><td class="l">${nameCell(p)}</td>${fwKeys.map(k=>{const x=obj(f[k]),count=num(x.opportunities);return `<td class="n">${count?`${rate(count,known)} <span class="dim">· ${signed(num(x.scoreToPar)/count)} avg</span>`:"—"}</td>`;}).join("")}</tr>`; }).join("");
      if(page==="patterns") w.innerHTML+=table("Tee-Shot Results","Frequency uses the same denominator of recorded par-4 and par-5 tee-shot outcomes; average is score relative to par after that result.",
        ["Player","Hit","Miss left","Miss right"],rows);
    }

    const allPosKeys=["7","8","9","4","5","6","1","2","3"];
    const posKeys=allPosKeys.filter(k=>tracked.some(p=>num(obj(obj(p.statistics.tracked).approachPositions)[k])));
    if(tracked.some(p=>posKeys.some(k=>num(obj(obj(p.statistics.tracked).approachPositions)[k])))){
      const rows=tracked.map(p=>{ const a=obj(obj(p.statistics.tracked).approachPositions),known=allPosKeys.reduce((total,k)=>total+num(a[k]),0); return `<tr data-row><td class="l">${nameCell(p)}</td>${posKeys.map(k=>`<td class="n">${num(a[k])?rate(a[k],known):"—"}</td>`).join("")}</tr>`; }).join("");
      if(page==="patterns") w.innerHTML+=table("Approach Dispersion","3×3 target map: 7–9 long, 4–6 pin-high, 1–3 short; 5 is GIR. Unknown locations are excluded and disclosed below.",
        ["Player",...posKeys.map(k=>k==="5"?"5 GIR":k)],rows);
    }

    if(tracked.some(p=>allPosKeys.some(k=>num(obj(obj(p.statistics.tracked).approachOutcomes)[k]?.scramblingOpps)))){
      const axes={Short:["1","2","3"],Left:["1","4","7"],Right:["3","6","9"],Long:["7","8","9"]};
      const rows=tracked.map(p=>{ const a=obj(obj(p.statistics.tracked).approachOutcomes); return `<tr data-row><td class="l">${nameCell(p)}</td>${Object.values(axes).map(keys=>{const d=keys.reduce((z,k)=>{const x=obj(a[k]);z.o+=num(x.scramblingOpps);z.s+=num(x.scrambles);return z;},{o:0,s:0});return `<td class="n">${rate(d.s,d.o)}</td>`;}).join("")}</tr>`; }).join("");
      if(page==="patterns") w.innerHTML+=table("Scrambling by Approach Miss","Directional axes overlap at corner misses; GIR is excluded.",
        ["Player",...Object.keys(axes)],rows);
    }

    if(tracked.some(p=>num(p.statistics.tracked.puttOpps))){
      const rows=tracked.map(p=>{ const t=obj(p.statistics.tracked); return `<tr data-row><td class="l">${nameCell(p)}</td><td class="n">${rate(t.onePutts,t.puttOpps)}</td><td class="n">${rate(t.threePutts,t.puttOpps)}</td><td class="n">${avg(t.girPutts,t.girPuttOpps)}</td><td class="n">${avg(t.missedGirPutts,t.missedGirPuttOpps)}</td></tr>`; }).join("");
      if(page==="performance") w.innerHTML+=table("Putting Context","Putts are counted by lie; unknown GIR holes do not enter GIR splits.",
        ["Player","One-putt","Three-putt","Putts / GIR","Putts / missed GIR"],rows);
    }

    const parKeys=["3","4","5"];
    if(tracked.some(p=>parKeys.some(k=>num(obj(obj(p.statistics.tracked).parTypes)[k]?.opportunities)))){
      const rows=tracked.map(p=>{ const q=obj(obj(p.statistics.tracked).parTypes); return `<tr data-row><td class="l">${nameCell(p)}</td>${parKeys.map(k=>{const x=obj(q[k]);return `<td class="n">${num(x.opportunities)?`${signed(num(x.scoreToPar)/num(x.opportunities))} <span class="dim">(${num(x.opportunities)})</span>`:"—"}</td>`;}).join("")}</tr>`; }).join("");
      if(page==="performance") w.innerHTML+=table("Performance by Par","Average score to par with recorded sample size.",
        ["Player","Par 3","Par 4","Par 5"],rows);
    }

    const complete=tracked.map(p=>{ const t=obj(p.statistics.tracked); const trackedHoles=num(t.trackedHoles); const recordedApproaches=num(t.approachOpps)||Object.values(obj(t.approachPositions)).reduce((total,value)=>total+num(value),0); const approachSamples=Math.min(trackedHoles,recordedApproaches); const approachUnknown=Math.max(0,trackedHoles-approachSamples); return `<tr data-row><td class="l">${nameCell(p)}</td><td class="n">${trackedHoles}</td><td class="n">${num(t.fairwayOpps)}</td><td class="n">${num(t.greenOpps)}</td><td class="n">${num(t.puttOpps)}</td><td class="n">${approachSamples}</td><td class="n">${approachUnknown}</td><td class="n">${num(t.unknownGirHoles)}</td><td class="n">${num(t.missingRecoveryLies)}</td></tr>`; }).join("");
    if(page==="patterns") w.innerHTML+=table("Tracking Completeness","Unknown values are disclosed and excluded, never counted as misses.",
      ["Player","Tracked","FW<br>samples","GIR<br>samples","Putt<br>samples","Approach<br>samples","Approach<br>unknown","GIR<br>unknown","Recovery<br>lie unknown"],complete);
  }
  return w;
}

function trackedStatisticsGroups(page){
  const source=buildTrackedStatisticsPage(page);
  return [...source.querySelectorAll(".subhead")].map((head,index)=>{
    const tableNode=head.nextElementSibling;
    const id=head.dataset.ledgerStatGroup||`${page}-${index+1}`;
    const html=head.outerHTML+(tableNode?.outerHTML||"");
    return {id,build:()=>{const w=h("div",{class:`ledger-stat-page ledger-stat-page-${page}`,"data-ledger-stat-category":id});w.innerHTML=html;return w;}};
  });
}

if(P.some(p=>p.statistics)) trackedStatisticsGroups("performance").forEach((group,index)=>
  add(`stats-performance-${group.id}`,group.build,{splittable:true,minRows:2,keepTogetherWhenFits:true,label:index===0?"Statistics":undefined}));
if(TRACKED_PLAYERS.length){
  add("statspatternsh", ()=>secHead("Player statistics · Shot patterns",
    "Directional outcomes, consequences and tracking coverage."),
    {keepWithNext:true, label:"Statistics"});
  trackedStatisticsGroups("patterns").forEach(group=>
    add(`stats-patterns-${group.id}`,group.build,{splittable:true,minRows:2,keepTogetherWhenFits:true}));
}

if(ROUND.partnership?.sides?.length){
  add("partnershiph",()=>secHead("Partnership performance",
    `${ROUND.partnership.gameName} · ${cap(String(ROUND.partnership.basis))} · Best ball`),
    {keepWithNext:true,label:"Statistics"});
  add("partnership",()=>{
    const w=h("div",{class:"ledger-stat-page ledger-stat-page-partnership","data-ledger-stat-category":"partnership"});
    const partnershipBasis=String(ROUND.partnership.basis||"net").toLowerCase()==="gross"?"gross":"net";
    const rows=ROUND.partnership.sides.map(side=>{
      const partners=side.playerContributions;
      const rate=(value,denominator)=>denominator?`${Math.round(value/denominator*100)}% (${value}/${denominator})`:"—";
      const contribution=player=>player?`${player.name}<br><strong>${rate(player.count,side.holes)}</strong>`:"—";
      const rescues=partners.map(player=>`${player.name} ${rate(player.rescues,side.holes)}`).join("<br>");
      const rating=side.rating!==null&&Number.isFinite(Number(side.rating))?Math.round(Number(side.rating)):"—";
      return `<tr data-row><td class="l"><strong>${side.name}</strong><br><span class="dim">${side.holes} eligible holes · Actual ${side.actual}</span></td><td class="n">${contribution(partners[0])}</td><td class="n">${contribution(partners[1])}</td><td class="n">${rate(side.redundancy,side.holes)}</td><td class="n">${rate(side.alternations,side.alternationOpportunities)}</td><td class="n">${rescues}</td><td class="n">${side.partnershipGain}</td><td class="n">${rating}</td></tr>`;
    }).join("");
    w.innerHTML=`<div class="subhead" data-ledger-stat-group="partnership">Team Metrics<span>How effectively the partners’ counting scores complemented one another.</span></div>
      <table class="dense"><colgroup><col style="width:16%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:10%"><col style="width:17%"><col style="width:13%"><col style="width:12%"></colgroup><thead data-rowhead><tr><th class="l">Side</th><th class="n">Counted</th><th class="n">Counted</th><th class="n">Tied</th><th class="n">Hand-offs</th><th class="n">Rescues</th><th class="n">Partnership Gain</th><th class="n">Ham &amp; Egg<br>Rating /100</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="scnote">Counted shows how often each partner supplied the team’s counting score; when the partners tie for the counting score, both receive Counted credit. Tied is the share of eligible holes on which both partners supplied the same counting score. Hand-offs measure changes between sole contributors on adjacent eligible holes. A Rescue occurs when a player supplies the counting score and beats the partner’s score by at least two strokes; its percentage uses eligible team holes as the denominator. Partnership Gain is the difference between the side’s lowest individual ${partnershipBasis} total and its hole-by-hole ${partnershipBasis} best-ball total—not strokes gained. Ham &amp; Egg Rating is actual hand-offs divided by all possible hole-to-hole transitions, multiplied by 100 (17 possible for 18 holes; 8 for nine). The report shows only the rating; an em dash means the round is incomplete.</p>`;
    return w;
  },{splittable:true,minRows:2,keepTogetherWhenFits:true});
}

/* ---- appendix scorecards ---- */
function scorecard(netKey, stkKey, label){
  const nameW=14.4, hw=(100-nameW-13.2)/NH, tw=NH>9?4.4:6.6;
  const totCols=NH>9?["Out","In","Tot"]:["Tot"];
  const cols=`<colgroup><col style="width:${nameW}%">
    ${Array.from({length:NH},()=>`<col style="width:${hw}%">`).join("")}
    ${totCols.map(()=>`<col style="width:${tw}%">`).join("")}</colgroup>`;
  const half=Math.ceil(NH/2);
  const metaRow=(lab,arr)=>{ const show=value=>lab==="Yds"?qty(value):value; return `<tr class="rowmeta"><td>${lab}</td>`+
    arr.map((v,i)=>`<td class="${i===half-1&&NH>9?'brd':''}">${show(v)}</td>`).join("")+
    (NH>9?`<td class="tot">${show(sum(arr,0,half))}</td><td class="tot">${show(sum(arr,half))}</td>`:"")+
    `<td class="tot">${show(sum(arr))}</td></tr>`; };
  const body=P.map(p=>{
    const cells=p.gross.map((g,i)=>{
      const st=p.strokes[stkKey][i];
      const dots=st===1?"·":st===2?"··":st>2?"·"+st:"";
      if(!played(g)) return `<td class="cell ${i===half-1&&NH>9?'brd':''}">
        <span class="g dim">—</span><span class="n dim">—</span></td>`;
      return `<td class="cell ${i===half-1&&NH>9?'brd':''}">
        <span class="g">${mark(g,C.par[i])}</span>
        <span class="n">${mark(p[netKey][i],C.par[i])}<span class="stk">${dots}</span></span></td>`;}).join("");
    const t=v=>`<td class="cell tot"><span class="g">${v[0]}</span><span class="n">${v[1]}</span></td>`;
    const handicapLabel=stkKey==='courseNet'
      ? (NH<18?`CH ${p.ch} (18-hole basis) · ${sum(p.strokes.courseNet)} allocated`:`CH ${p.ch}`)
      : `PH ${p.ph} · ${sum(p.strokes.featured)} allocated`;
    return `<tr data-row><td class="pl"><b>${p.name}</b><em>${HAS_SIDES?SIDES[p.side].name+" · ":""}${p.tee} · ${handicapLabel}</em></td>
      ${cells}${NH>9?t([p.out,sum(p[netKey],0,half)])+t([p.inn,sum(p[netKey],half)]):""}
      ${t([p.tot,sum(p[netKey])])}</tr>`;}).join("");
  return `<table class="sc">${cols}<thead data-rowhead><tr><th>Player</th>
    ${HOLES.map((hh,i)=>`<th class="${i===half-1&&NH>9?'brd':''}">${hh}</th>`).join("")}
    ${totCols.map(t=>`<th>${t}</th>`).join("")}</tr></thead>
    <tbody>${metaRow("Yds",C.yds)}${metaRow("Par",C.par)}${metaRow("SI",C.si)}${body}</tbody></table>`;
}
const MKLEGEND = `<div class="mklegend">
  <span><span class="mk c2">2</span> Eagle or better</span>
  <span><span class="mk c1">3</span> Birdie</span>
  <span><span class="mk">4</span> Par</span>
  <span><span class="mk s1">5</span> Bogey</span>
  <span><span class="mk s2">6</span> Double or worse</span>
  <span style="margin-left:auto"><span class="stk" style="color:var(--brass);font-weight:600">·</span> handicap stroke</span></div>`;

add("sc1h", ()=>secHead("Appendix · Course net",
  "Full course handicap. Does not determine the featured competition."),
  {keepWithNext:true, breakBefore:true, label:"Appendix"});
add("sc1", ()=>{ const w=h("div"); w.innerHTML=scorecard("cnet","courseNet")+MKLEGEND; return w; },
  {splittable:true, minRows:2});
add("sc2h", ()=>{ const w=secHead("Appendix · Featured net",
  FEAT?FEAT.allowance.label:"—"); w.classList.add("appendix-scorecard-separator"); return w; }, {keepWithNext:true});
add("sc2", ()=>{ const w=h("div");
  w.innerHTML=scorecard("fnet","featured")
    +`<p class="scnote">Gross above, featured net below; marks are set against par in both rows.
      Playing handicap is ${FEAT?FEAT.allowance.label.toLowerCase():"—"}, so ${LOWMAN.name} plays off scratch.
      Course net on the card above is informational only and will differ.</p>`;
  return w; }, {splittable:true, minRows:2});

/* ==========================================================================
   Layout: measure every block, pack into pages, emit.
   ========================================================================== */
const SLUG = `${ROUND.meta.course} · ${fmtDate(ROUND.meta.date)}`;

function makePage(n, total, label){
  const pg=h("div",{class:"page"});
  pg.appendChild(h("div",{class:"masthead",html:
    `<div class="wordmark">LEDGER ENTRY REPORT${label?`<em>${label}</em>`:""}</div>
     <div class="mast-meta">${SLUG}${n===1?`<span class="final${COMPLETE?"":" prov"}">${COMPLETE?"FINAL":"PROVISIONAL"}</span>`:""}</div>`}));
  pg.appendChild(h("div",{class:"tie"}));
  const flow=h("div",{class:"flow"});
  pg.appendChild(flow);
  pg.appendChild(h("div",{class:"foot",html:
    `<span>The Dye Ledger · ${SLUG}</span><span class="pn">${n} / ${total}</span>`}));
  return {pg,flow};
}

function sliceRows(node, start, end, continued, resumed){
  const rows=[...node.querySelectorAll("[data-row]")];
  rows.forEach((r,i)=>{ if(i<start||i>=end) r.remove(); });
  [...node.querySelectorAll("table")].forEach(tbl=>{
    if(tbl.querySelector("[data-row]")) return;
    const heading=tbl.previousElementSibling;
    if(heading?.classList?.contains("subhead")) heading.remove();
    tbl.remove();
  });
  if(continued){
    const head=node.querySelector("[data-rowhead]");
    if(head) head.setAttribute("data-cont","1");
  }
  return node;
}

function layout(){
  const probe=el("probe");
  const {pg,flow}=makePage(1,1);
  document.body.appendChild(pg);
  const flowH=flow.clientHeight, flowW=flow.clientWidth;
  pg.remove();
  probe.style.width=flowW+"px";

  const cache=new Map();
  const measure=b=>{
    if(cache.has(b.id)) return cache.get(b.id);
    const node=b.build();
    probe.appendChild(node);
    const rows=[...node.querySelectorAll("[data-row]")].map(r=>r.getBoundingClientRect().height);
    /* heights are fractional; the packer sums them while the browser stacks
       rounded boxes, so ceil each one to keep the sum conservative */
    const head=node.querySelector("[data-rowhead]");
    const headH=head?head.getBoundingClientRect().height:0;
    const cs=getComputedStyle(node);
    const mgn=(parseFloat(cs.marginTop)||0)+(parseFloat(cs.marginBottom)||0);
    const height=Math.ceil(node.getBoundingClientRect().height+mgn);
    const rowHeights=rows.map(v=>Math.ceil(v)+1);
    const nonRowHeight=Math.max(0,height-rowHeights.reduce((a,b)=>a+b,0));
    const m={height,
             headerH:Math.max(Math.ceil(headH),nonRowHeight)+(b.splittable?10:0),rows:rowHeights};
    probe.removeChild(node);
    cache.set(b.id,m);
    return m;
  };

  const {pages,overflows}=packPages(BLOCKS, flowH-18, measure);  /* conservative browser-rounding gutter */

  /* Masthead subtitle: the section in effect where the page starts, carried
     forward so a continuation page keeps the right label. */
  let running=""; const effLabel=new Map();
  BLOCKS.forEach(b=>{ if(b.label) running=b.label; effLabel.set(b.id,running); });

  const doc=el("doc"); doc.innerHTML="";
  pages.forEach((slots,pi)=>{
    const lbl = slots.length ? (effLabel.get(slots[0].block.id)||"") : "";
    const {pg,flow}=makePage(pi+1,pages.length,lbl);
    slots.forEach(s=>{
      const node=s.block.build();
      if(s.block.splittable && (s.continued||s.resumed))
        sliceRows(node,s.rowStart,s.rowEnd,s.continued,s.resumed);
      flow.appendChild(node);
    });
    doc.appendChild(pg);
  });

  fitNames();
  report(pages,overflows);
}

/* initials ladder, then CSS ellipsis as the last resort */
function fitNames(){
  document.querySelectorAll(".dist .who .fitname, td.l .nm").forEach(n=>{
    const cell=n.closest(".who")||n.closest("td");
    if(!cell) return;
    if(cell.scrollWidth<=cell.clientWidth+1) return;
    const full=n.getAttribute("data-full")|| n.textContent.trim();
    n.textContent=initials(full);
  });
}

function report(pages,overflows){
  const bad=[];
  document.querySelectorAll(".page").forEach((pg,i)=>{
    const f=pg.querySelector(".flow");
    const kids=[...f.children];
    const last=kids[kids.length-1];
    const used=last?Math.ceil(last.getBoundingClientRect().bottom-f.getBoundingClientRect().top):0;
    const over=used-f.clientHeight;
    if(over>1){ bad.push({n:i+1,over});
      console.error(`PAGE ${i+1} OVERFLOWS BY ${over}px — content will be clipped in print.`);
      if(typeof matchMedia!=="function" || !matchMedia("print").matches){
        pg.style.outline="3px solid #C0392B";
        pg.appendChild(h("div",{class:"page-overflow-diagnostic",text:`PAGE ${i+1} OVERFLOW +${over}px`,
          style:"position:absolute;top:6px;right:6px;background:#C0392B;color:#fff;"+
            "font:600 8pt 'IBM Plex Mono',monospace;padding:3px 7px;z-index:9"}));
      }
    } else console.log(`page ${i+1} fits, ${f.clientHeight-used}px headroom`);
  });
  overflows.forEach(o=>console.error(`BLOCK ${o.id} EXCEEDS A FULL PAGE BY ${Math.round(o.by)}px`));
  console.log(`LAYOUT: ${pages.length} pages, ${P.length} players, ${ROUND.games.length} games, ${NH} holes`);
}

function layoutThenPrint(){
  layout();
  if(globalThis.__DYE_LEDGER_AUTO_PRINT__ && !globalThis.__DYE_LEDGER_PRINT_STARTED__){
    globalThis.__DYE_LEDGER_PRINT_STARTED__=true;
    setTimeout(()=>{ try{ window.print(); }catch(e){} },260);
  }
}
function returnToOriginatingMatch(){
  const status=document.getElementById("returnToMatchStatus");
  if(globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__){
    try{ sessionStorage.removeItem(globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__); }catch(e){}
  }
  let opener=null;
  try{ opener=window.opener && !window.opener.closed ? window.opener : null; }catch(e){}
  if(opener){
    try{ opener.focus(); }catch(e){}
    try{ window.close(); }catch(e){}
    setTimeout(()=>{
      if(window.closed) return;
      try{ window.location.assign(opener.location.href); return; }catch(e){}
      if(status) status.hidden=false;
    },120);
    return;
  }
  if(globalThis.__DYE_LEDGER_RETURN_URL__){
    try{ window.location.assign(globalThis.__DYE_LEDGER_RETURN_URL__); return; }catch(e){}
  }
  try{
    window.location.assign(new URL("../",window.location.href).href);
  }catch(e){
    if(status) status.hidden=false;
  }
}
function acceptLedgerEntry(){
  const button=document.getElementById("acceptLedgerEntryBtn");
  const status=document.getElementById("returnToMatchStatus");
  if(ROUND?.meta?.storyApprovalRequired){
    if(status){ status.hidden=false; status.textContent="Review and save the Story of the Round before accepting this Ledger Entry."; }
    return;
  }
  if(ROUND?.meta?.status!=="final" || !String(ROUND?.meta?.story||"").trim()){
    if(status){ status.hidden=false; status.textContent="Complete the round before accepting this Ledger Entry."; }
    return;
  }
  const acceptedAt=new Date().toISOString();
  const report=JSON.parse(JSON.stringify(ROUND));
  report.meta.acceptanceStatus="accepted";
  report.meta.acceptedAt=acceptedAt;
  const envelope={roundId:String(report.meta.roundId||""),acceptedAt,report};
  let accepted=false;
  try{
    const opener=window.opener && !window.opener.closed ? window.opener : null;
    const result=opener && typeof opener.__DYE_LEDGER_ACCEPT_REPORT__==="function"
      ? opener.__DYE_LEDGER_ACCEPT_REPORT__(envelope) : null;
    accepted=Boolean(result?.accepted);
  }catch(e){}
  if(!accepted){
    try{ accepted=Boolean(globalThis.__DYE_LEDGER_QUEUE_ACCEPTANCE__?.(envelope)); }catch(e){}
  }
  if(!accepted){
    if(status){ status.hidden=false; status.textContent="This Ledger Entry could not be saved. Return to the app and try again."; }
    return;
  }
  ROUND.meta.acceptanceStatus="accepted";
  ROUND.meta.acceptedAt=acceptedAt;
  if(button){ button.disabled=true; button.textContent="Accepted"; }
  const reviseButton=document.getElementById("reviseLedgerEntryBtn");
  if(reviseButton) reviseButton.hidden=false;
  if(status){ status.hidden=false; status.textContent="Accepted and frozen with this completed round."; }
}
function reviseLedgerEntry(){
  if(!window.confirm("Unlock this accepted Ledger Entry? Its frozen Story and report will be replaced the next time you generate and accept a Ledger Entry.")) return;
  const roundId=String(ROUND?.meta?.roundId||"");
  let unlocked=false;
  try{
    const opener=window.opener && !window.opener.closed ? window.opener : null;
    const result=opener && typeof opener.__DYE_LEDGER_UNLOCK_REPORT__==="function"
      ? opener.__DYE_LEDGER_UNLOCK_REPORT__(roundId) : null;
    unlocked=Boolean(result?.unlocked);
  }catch(e){}
  if(!unlocked){
    try{ unlocked=Boolean(globalThis.__DYE_LEDGER_QUEUE_REVISION__?.(roundId)); }catch(e){}
  }
  const status=document.getElementById("returnToMatchStatus");
  if(!unlocked){
    if(status){ status.hidden=false; status.textContent="This Ledger Entry could not be unlocked. Return to the app and try again."; }
    return;
  }
  if(status){ status.hidden=false; status.textContent="Unlocked. Return to the match and generate a revised Ledger Entry."; }
  const acceptButton=document.getElementById("acceptLedgerEntryBtn");
  const reviseButton=document.getElementById("reviseLedgerEntryBtn");
  if(acceptButton){ acceptButton.disabled=true; acceptButton.textContent="Unlocked"; }
  if(reviseButton) reviseButton.hidden=true;
}
document.getElementById("returnToMatchBtn")?.addEventListener("click",returnToOriginatingMatch);
document.getElementById("acceptLedgerEntryBtn")?.addEventListener("click",acceptLedgerEntry);
document.getElementById("reviseLedgerEntryBtn")?.addEventListener("click",reviseLedgerEntry);
document.getElementById("printLedgerEntryBtn")?.addEventListener("click",()=>{ try{ window.print(); }catch(e){} });
if(ROUND?.meta?.acceptanceStatus==="accepted"){
  const button=document.getElementById("acceptLedgerEntryBtn");
  if(button){ button.disabled=true; button.textContent="Accepted"; }
  const reviseButton=document.getElementById("reviseLedgerEntryBtn");
  if(reviseButton) reviseButton.hidden=false;
}else if(ROUND?.meta?.storyApprovalRequired){
  const button=document.getElementById("acceptLedgerEntryBtn");
  if(button){ button.disabled=true; button.textContent="Save Story to finalize"; }
  const status=document.getElementById("returnToMatchStatus");
  if(status){ status.hidden=false; status.textContent="Preview uses a verified facts-only Story. Review and save the Story of the Round to finalize."; }
}else if(ROUND?.meta?.status!=="final"){
  const button=document.getElementById("acceptLedgerEntryBtn");
  if(button){ button.disabled=true; button.textContent="Complete round to accept"; }
}
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>setTimeout(layoutThenPrint,40));
else window.addEventListener("load",()=>setTimeout(layoutThenPrint,40));

/* Deliberate test seam: a few pure helpers exposed for the DOM suite.
   Nothing in the report reads these — do not add stateful things here. */
globalThis.__dye = { mark, initials, fmtDate, recapBeats, deckText };
