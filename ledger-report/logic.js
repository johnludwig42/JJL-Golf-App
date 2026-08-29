const isFiniteNumber = value => Number.isFinite(Number(value));

export function composeCompetitionLabel(name = '', allowanceLabel = '') {
  const game = String(name || '').trim();
  const allowance = String(allowanceLabel || '').trim();
  if (!game) return allowance;
  if (!allowance) return game;
  const normalizedGame = game.toLocaleLowerCase();
  const normalizedAllowance = allowance.toLocaleLowerCase();
  if (normalizedAllowance.startsWith(normalizedGame)) {
    const remainder = allowance.slice(game.length).replace(/^\s*[·-]\s*/, '').trim();
    return remainder ? `${game} · ${remainder}` : game;
  }
  return `${game} · ${allowance}`;
}

export function describeMarginTurningPoint({ margin, game, sides, players, holeIndex }) {
  const result = margin?.per?.[holeIndex];
  if (!result || result.win === null || result.win === undefined) return '';
  const winningSideKey = game?.sides?.[result.win]?.key;
  const losingSideKey = game?.sides?.[result.win === 0 ? 1 : 0]?.key;
  const bestN = Math.max(1, Number(game?.bestN || margin?.bestN || 1));
  const sidePlayers = key => (players || []).filter(player => player.side === key);
  const winners = sidePlayers(winningSideKey)
    .map(player => ({ player, value: player.fnet?.[holeIndex] }))
    .filter(row => isFiniteNumber(row.value))
    .sort((left, right) => Number(left.value) - Number(right.value))
    .slice(0, bestN);
  const losers = sidePlayers(losingSideKey)
    .map(player => ({ player, value: player.fnet?.[holeIndex] }))
    .filter(row => isFiniteNumber(row.value))
    .sort((left, right) => Number(left.value) - Number(right.value))
    .slice(0, bestN);
  const listNames = rows => rows.map(row => row.player.name).filter(Boolean).join(rows.length > 2 ? ', ' : ' and ');
  const winningTotal = result.win === 0 ? result.a : result.b;
  const losingTotal = result.win === 0 ? result.b : result.a;
  const teamClause = bestN > 1 && winners.length > 1 ? ` (best ${bestN})` : '';
  const scoreSentence = winners.length && losers.length
    ? `<b>${listNames(winners)}</b> ${winners.length === 1 ? 'posts' : 'post'} net ${winningTotal}${teamClause} to ${listNames(losers)}’s ${losingTotal}.`
    : `<b>${sides?.[winningSideKey]?.name || 'The winning side'}</b> wins the hole ${winningTotal}–${losingTotal}.`;

  const before = Number(margin?.cum?.[holeIndex] || 0);
  const after = Number(margin?.cum?.[holeIndex + 1] || 0);
  const sideOneKey = game?.sides?.[1]?.key;
  const postLeaderKey = after > 0 ? sideOneKey : after < 0 ? game?.sides?.[0]?.key : '';
  let movement = 'The hole changes the match margin.';
  if (after === 0) movement = `The hole swings the match level.`;
  else if (postLeaderKey === winningSideKey) {
    movement = before && Math.sign(before) === Math.sign(after)
      ? `The hole extends ${sides?.[winningSideKey]?.name || 'the side'}’s lead to ${Math.abs(after)} up.`
      : `The hole puts ${sides?.[winningSideKey]?.name || 'the side'} ${Math.abs(after)} up.`;
  } else {
    movement = `The hole cuts ${sides?.[winningSideKey]?.name || 'the side'}’s deficit to ${Math.abs(after)} down.`;
  }
  const remaining = (margin?.cum || []).slice(holeIndex + 2);
  const leadHeld = after !== 0 && remaining.length > 0 && remaining.every(value => value !== 0 && Math.sign(value) === Math.sign(after));
  return `${scoreSentence} ${movement}${leadHeld ? ' That lead holds through the finish.' : ''}`;
}

export function describeFinalCarry(gameResult, playerCount) {
  const carried = Number(gameResult?.per?.at?.(-1)?.carried || 0);
  if (!carried) return '';
  const unit = playerCount === 2 ? 'player' : 'players';
  return `${carried === 1 ? '$1 remains' : `$${carried} remain`} unclaimed at the end of the round; no player receives the carried pot. The net position therefore remains $0 for every ${unit}.`;
}

export function getWinningMarginPerspective(margin = {}) {
  const sideIndex = margin.winner === 1 ? 1 : 0;
  return { sideIndex, sign: sideIndex === 1 ? 1 : -1, tied: margin.winner === null || margin.winner === undefined };
}

export function getSegmentMarginPerspective(margin = {}, segment = {}) {
  const segmentMargin = Number(segment?.margin || 0);
  const sideIndex = segmentMargin > 0 ? 1 : 0;
  const sign = sideIndex === 1 ? 1 : -1;
  let running = 0;
  const runningMargins = (segment?.idx || []).map(index => {
    const result = margin?.per?.[index];
    if (result?.scored !== false) {
      if (result?.win === 1) running += 1;
      else if (result?.win === 0) running -= 1;
    }
    const displayed = running * sign;
    return displayed === 0 ? 0 : displayed;
  });
  return { sideIndex, sign, tied: segmentMargin === 0, runningMargins };
}
