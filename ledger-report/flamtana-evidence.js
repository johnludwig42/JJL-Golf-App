// Presentation only. Complete saved evidence remains untouched in the RoundRecord.
const candidateKey = step => Array.isArray(step?.remaining)
  ? JSON.stringify([...new Set(step.remaining)].sort()) : null;

export function compactFlamtanaEvidence(evidence = []) {
  const printed = [];
  let matched = [];
  const flush = () => {
    if (matched.length) printed.push({ kind: 'matched', labels: matched.map(step => step.label) });
    matched = [];
  };
  evidence.forEach((step, index) => {
    const current = candidateKey(step), previous = candidateKey(evidence[index - 1]);
    // Unknown candidate lists cannot safely be condensed.
    if (index === 0 || current === null || previous === null || current !== previous) {
      flush();
      printed.push({ kind: 'comparison', step });
    } else matched.push(step);
  });
  flush();
  return printed;
}

export function formatFlamtanaMatchedSteps(labels) {
  const holes = labels.map(label => /^Hole (\d+)$/.exec(label));
  if (holes.every(Boolean)) {
    const numbers = holes.map(match => Number(match[1]));
    if (numbers.length === 1) return 'Hole ' + numbers[0] + ' matched.';
    if (numbers.every((number, i) => i === 0 || number === numbers[i - 1] - 1)) {
      return 'Holes ' + numbers[0] + '–' + numbers.at(-1) + ' matched.';
    }
  }
  return labels.join(' / ') + ' matched.';
}
