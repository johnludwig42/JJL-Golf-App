/**
 * engines.js — scoring engines for the three game archetypes.
 * No DOM. Pure functions over the ROUND model so they can be tested in node.
 *
 *   margin      cumulative sides-up      Nassau, Match Play, Sixes, team Stroke Play
 *   cumulative  running points/strokes   Stroke Play, Sneaky/Sandy/Poley, 9-Point, Wolf
 *   discrete    per-hole pots            Skins, Greenies
 *
 * Nassau and Match Play are the same engine. They differ only in segments and
 * payouts: a 9-hole Nassau is one segment with no aggregate, which scores
 * identically to 9-hole match play.
 */

const ARCHETYPE = {
  nassau: "margin", matchplay: "margin", sixes: "margin",
  strokeplay: "cumulative", points: "cumulative", ninepoint: "cumulative", wolf: "cumulative",
  skins: "discrete", greenies: "discrete", settlement: "settlement",
};

const sum = a => a.reduce((x, y) => x + (isNum(y) ? y : 0), 0);

/* A gross score of null/undefined means the hole was not played. Coercing it to
   zero makes an abandoned hole look like the best score in the field, so a side
   that walked in after twelve holes "wins" every remaining hole. Every engine
   must test for a scored hole rather than trusting arithmetic. */
const isNum = v => typeof v === "number" && Number.isFinite(v);
const played = v => isNum(v) && v > 0;

/* ---------- shared ---------- */

function netOfPlayer(player, game) {
  const st = (player.strokes && player.strokes[game.allowance.key]) || player.strokes?.featured;
  if (!st) throw new Error(`no stroke array for ${player.id} basis ${game.allowance.key}`);
  return player.gross.map((g, i) => played(g) ? g - st[i] : null);
}

/* Returns null when fewer than n players on this side have a score for the hole.
   Null propagates: the hole is not contested and cannot be won by either side. */
function bestN(players, holeIdx, n, netByPlayer) {
  const v = players.map(p => netByPlayer[p.id][holeIdx]).filter(isNum).sort((a, b) => a - b);
  if (v.length < Math.min(n, players.length)) return null;
  return sum(v.slice(0, Math.min(n, v.length)));
}

/* ---------- margin ---------- */

function marginEngine(game, ctx) {
  const { players, holes } = ctx;
  if (!game.sides || game.sides.length !== 2)
    throw new Error(`margin game ${game.id} needs exactly two sides`);
  const net = {};
  players.forEach(p => { net[p.id] = netOfPlayer(p, game); });
  const side = k => players.filter(p => game.sides[k].playerIds.includes(p.id));
  const bn = game.bestN ?? side(0).length;

  const per = holes.map((h, i) => {
    const a = bestN(side(0), i, bn, net), b = bestN(side(1), i, bn, net);
    const scored = a !== null && b !== null;
    return { i, hole: h, a, b, scored,
             win: !scored ? null : a < b ? 0 : b < a ? 1 : null };
  });
  const holesScored = per.filter(r => r.scored).length;
  const complete = holesScored === holes.length;

  /* an unscored hole moves nothing */
  const stepOf = r => (!r.scored ? 0 : r.win === 1 ? 1 : r.win === 0 ? -1 : 0);
  const cum = [0];
  per.forEach(r => cum.push(cum[cum.length - 1] + stepOf(r)));

  const segments = game.segments.map(s => {
    const idx = s.holes.map(h => holes.indexOf(h)).filter(i => i >= 0);
    return { label: s.label, idx, margin: sum(idx.map(i => stepOf(per[i]))) };
  });
  const aggregate = segments.length > 1
    ? { label: "Aggregate", idx: per.map(r => r.i), margin: cum[cum.length - 1] }
    : null;

  const total = cum[cum.length - 1];
  const winner = total > 0 ? 1 : total < 0 ? 0 : null;

  let turning = null;
  if (winner !== null) {
    const gain = r => (!r.scored ? 0
      : winner === 1 ? Math.max(0, r.a - r.b) : Math.max(0, r.b - r.a));
    const winnerIsAhead = value => winner === 1 ? value > 0 : value < 0;
    turning = per.filter(r => r.scored && gain(r) > 0)
      .map(r => ({ i: r.i, hole: r.hole, gain: gain(r) }))
      .find(candidate => winnerIsAhead(cum[candidate.i + 1])
        && cum.slice(candidate.i + 1).every(winnerIsAhead));
    /* A completed margin win always has a first permanent lead. Keep a
       defensive fallback for malformed/partial legacy inputs. */
    if (!turning) turning = per.filter(r => r.scored && gain(r) > 0).at(-1) || null;
    if (!turning || turning.gain === 0) turning = null;
  } else {
    /* A tied match has no winning side. The last contested hole is the most
       honest event to highlight without fabricating a decisive winner. */
    const lastContested = per.filter(r => r.scored && r.win !== null).at(-1);
    if (lastContested) turning = { i: lastContested.i, hole: lastContested.hole, gain: Math.abs(lastContested.a - lastContested.b), tied: true };
  }
  let lastLevel = 0;
  cum.forEach((v, i) => { if (v === 0) lastLevel = i; });

  return { archetype: "margin", per, cum, segments, aggregate, total, winner, turning,
           lastLevel, net, bestN: bn, unit: "holes", holesScored, complete };
}

/* ---------- cumulative ---------- */

function cumulativeEngine(game, ctx) {
  const { players, holes } = ctx;
  const byHole = game.pointsByHole || null;   // { playerId: [per hole] }
  const net = {};
  players.forEach(p => { net[p.id] = netOfPlayer(p, game); });

  const series = players.map(p => {
    const raw = byHole ? byHole[p.id]
      : net[p.id].map((v, i) => isNum(v) ? v - ctx.par[i] : null);
    const run = [0];
    /* an unscored hole holds the running total flat rather than adding zero,
       which would otherwise read as a par for a hole nobody played */
    raw.forEach(v => run.push(run[run.length - 1] + (isNum(v) ? v : 0)));
    return { id: p.id, raw, run, total: run[run.length - 1],
             holesScored: raw.filter(isNum).length };
  });

  const better = game.lowWins ? (a, b) => a < b : (a, b) => a > b;
  const ranked = series.slice().sort((a, b) => game.lowWins ? a.total - b.total : b.total - a.total);
  const winner = ranked[0];

  // leader at each hole, so a lead change is detectable
  const leadAt = holes.map((_, i) => {
    let best = null;
    series.forEach(s => { if (!best || better(s.run[i + 1], best.run[i + 1])) best = s; });
    return best.id;
  });
  const holesScored = Math.max(...series.map(s => s.holesScored));
  const complete = holesScored === holes.length;
  let turning = null;
  for (let i = 1; i < leadAt.length; i++) {
    if (leadAt[i] !== leadAt[i - 1] && leadAt[i] === winner.id) turning = { i, hole: holes[i] };
  }
  if (!turning) {
    const gains = series.find(s => s.id === winner.id).raw
      .map((v, i) => ({ i, hole: holes[i], gain: !isNum(v) ? -Infinity : game.lowWins ? -v : v }))
      .sort((a, b) => b.gain - a.gain);
    turning = gains[0] && gains[0].gain > 0 ? gains[0] : null;
  }

  const segments = (game.segments || []).map(s => {
    const idx = s.holes.map(h => holes.indexOf(h)).filter(i => i >= 0);
    return { label: s.label, idx };
  });

  return { archetype: "cumulative", series, ranked, winner, leadAt, turning, segments,
           net, unit: game.unit || "points", holesScored, complete };
}

/* ---------- discrete ---------- */

function discreteEngine(game, ctx) {
  const { players, holes } = ctx;
  const d = game.detail || {};
  const stake = d.stakePerPlayer ?? 0;
  const pot = stake * (players.length - 1);
  const winners = d.winners || {};
  const eligible = d.holes || holes.filter(h => String(h) in winners);

  /* a hole nobody played is not eligible: no pot, no carry */
  const anyScored = i => players.some(p => played(p.gross[i]));
  let carry = 0;
  const per = eligible.filter(h => anyScored(holes.indexOf(h))).map(h => {
    const i = holes.indexOf(h);
    const w = winners[h] ?? null;
    const value = pot + (d.carryover ? carry : 0);
    if (d.carryover && !w) { carry += pot; return { i, hole: h, winner: null, value: 0, carried: carry }; }
    carry = 0;
    return { i, hole: h, winner: w, value, carried: 0 };
  });

  const ledger = {};
  players.forEach(p => { ledger[p.id] = 0; });
  per.forEach(x => {
    if (!x.winner) return;
    players.forEach(p => {
      ledger[p.id] += p.id === x.winner ? (x.value) : -(x.value / (players.length - 1));
    });
  });

  const counts = {};
  per.forEach(x => { if (x.winner) counts[x.winner] = (counts[x.winner] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;
  const turning = per.filter(x => x.winner).sort((a, b) => b.value - a.value)[0] || null;

  const holesScored = holes.filter((_, i) => players.some(p => played(p.gross[i]))).length;
  return { archetype: "discrete", per, ledger, counts, top, turning, pot, stake,
           holesScored, complete: holesScored === holes.length,
           grossFlow: sum(per.map(x => x.value)),
           netFlow: sum(Object.values(ledger).filter(v => v > 0)),
           unit: game.unit || "dollars" };
}

function runGame(game, ctx) {
  const a = game.archetype || ARCHETYPE[game.type];
  if (a === "margin") return marginEngine(game, ctx);
  if (a === "cumulative") return cumulativeEngine(game, ctx);
  if (a === "discrete") return discreteEngine(game, ctx);
  if (a === "settlement") return { archetype: "settlement", complete: true, unit: "dollars" };
  throw new Error(`unknown archetype for game type ${game.type}`);
}

globalThis.runGame = runGame;
export { runGame, marginEngine, cumulativeEngine, discreteEngine, ARCHETYPE, isNum, played };
if (typeof module !== "undefined")
  module.exports = { runGame, marginEngine, cumulativeEngine, discreteEngine, ARCHETYPE,
                     isNum, played };
