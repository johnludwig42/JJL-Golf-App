export function extractResponsesApiText(result) {
  const convenienceText = String(result?.output_text || '').trim();
  if (convenienceText) return convenienceText;
  const fragments = [];
  for (const item of Array.isArray(result?.output) ? result.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') fragments.push(content.text);
    }
  }
  return fragments.join('').trim();
}

export function parseRecapResponse(result) {
  const outputText = extractResponsesApiText(result);
  if (!outputText) return '';
  try {
    const parsed = JSON.parse(outputText);
    return String(parsed?.recap || '').trim();
  } catch {
    return '';
  }
}
