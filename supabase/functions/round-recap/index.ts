import contentSpec from './content-spec.json' with { type: 'json' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function buildSystemInstructions() {
  return [
    `You write private round recaps for The Dye Ledger under content specification ${contentSpec.version}.`,
    `Authority order: ${contentSpec.authorityOrder.join(' > ')}.`,
    contentSpec.tone,
    `Target length: ${contentSpec.targetWords}.`,
    `Maximum ${contentSpec.maximumWords} words.`,
    `Supported sections: ${contentSpec.sections.join('; ')}.`,
    ...contentSpec.rules.map(rule => `Rule: ${rule}`),
    'Return JSON with one string field named recap.',
  ].join('\n');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { success: false, error: 'Method not allowed.' });
  try {
    const body = await request.json();
    const match = body?.match;
    if (!match || typeof match !== 'object') return json(400, { success: false, error: 'A round recap payload is required.' });
    if (match.recapContentSpecVersion !== contentSpec.version) return json(409, { success: false, error: 'Unsupported recap content specification.' });
    if (!match.authoritativeFacts || !Array.isArray(match.players)) return json(400, { success: false, error: 'Authoritative round facts are required.' });

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_RECAP_MODEL');
    if (!apiKey || !model) return json(503, { success: false, error: 'Round Recap service is not configured.' });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: buildSystemInstructions(),
        input: JSON.stringify(match),
        text: { format: { type: 'json_schema', name: 'round_recap', strict: true, schema: { type: 'object', properties: { recap: { type: 'string' } }, required: ['recap'], additionalProperties: false } } },
      }),
    });
    const result = await response.json();
    if (!response.ok) return json(502, { success: false, error: 'Round Recap generation failed.' });
    const outputText = String(result?.output_text || '').trim();
    const parsed = JSON.parse(outputText || '{}');
    const recap = String(parsed?.recap || '').trim();
    if (!recap) return json(502, { success: false, error: 'Round Recap returned no text.' });
    return json(200, { success: true, recap, contentSpecVersion: contentSpec.version, state: 'draft' });
  } catch {
    return json(400, { success: false, error: 'Round Recap request could not be processed.' });
  }
});
