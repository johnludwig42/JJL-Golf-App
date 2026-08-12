import contentSpec from './content-spec.json' with { type: 'json' };
import { parseRecapResponse } from './response-utils.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function failure(status: number, code: string, error: string) {
  return json(status, { success: false, code, error });
}

function buildSystemInstructions(purpose = '') {
  const rules = purpose === 'ledger-story'
    ? contentSpec.rules.filter(rule => !rule.startsWith('Every saved Memory must') && !rule.startsWith('When Stat Tracking is enabled'))
    : contentSpec.rules;
  const ledgerStory = purpose === 'ledger-story' ? [
    'Write The Story of the Round for the Ledger Entry report.',
    'Target 300–400 words and never exceed 450 words.',
    'Use the factual precision, pacing, and polish of a major golf publication, without invented drama.',
    'Open with the Featured Competition result; explain the decisive stretch and pivotal holes; recognize supported player and round highlights; close with what defined the round.',
    'Do not repeat a full Match Summary recap or produce a list of report sections.',
  ] : [];
  return [
    `You write private round recaps for The Dye Ledger under content specification ${contentSpec.version}.`,
    `Authority order: ${contentSpec.authorityOrder.join(' > ')}.`,
    contentSpec.tone,
    `Target length: ${contentSpec.targetWords}.`,
    `Maximum ${contentSpec.maximumWords} words.`,
    `Supported sections: ${contentSpec.sections.join('; ')}.`,
    ...rules.map(rule => `Rule: ${rule}`),
    ...ledgerStory,
    'Return JSON with one string field named recap.',
  ].join('\n');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  try {
    const body = await request.json();
    const match = body?.match;
    const repair = body?.repair && typeof body.repair === 'object' ? body.repair : null;
    const purpose = String(body?.purpose || match?.reportPurpose || '');
    if (!match || typeof match !== 'object') return failure(400, 'INVALID_PAYLOAD', 'A round recap payload is required.');
    if (match.recapContentSpecVersion !== contentSpec.version) return failure(409, 'CONTENT_SPEC_MISMATCH', 'Unsupported recap content specification.');
    if (!match.authoritativeFacts || !Array.isArray(match.players)) return failure(400, 'INVALID_PAYLOAD', 'Authoritative round facts are required.');

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_RECAP_MODEL');
    if (!apiKey || !model) return failure(503, 'SERVICE_NOT_CONFIGURED', 'Round Recap service is not configured.');

    const repairInstructions = repair ? [
      'Revise the supplied prior recap. Preserve all accurate material and correct every listed validation issue.',
      'Do not mention the revision process or validation rules in the recap.',
      `Validation issues: ${JSON.stringify(Array.isArray(repair.issues) ? repair.issues : [])}`,
      `Prior recap: ${String(repair.priorRecap || '').slice(0, 12000)}`,
    ].join('\n') : '';

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: [buildSystemInstructions(purpose), repairInstructions].filter(Boolean).join('\n\n'),
        input: JSON.stringify(match),
        text: { format: { type: 'json_schema', name: 'round_recap', strict: true, schema: { type: 'object', properties: { recap: { type: 'string' } }, required: ['recap'], additionalProperties: false } } },
      }),
    });
    const result = await response.json();
    if (!response.ok) return failure(response.status === 429 ? 429 : 502, response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_FAILED', 'Round Recap generation failed.');
    const recap = parseRecapResponse(result);
    if (!recap) return failure(502, 'EMPTY_PROVIDER_RESPONSE', 'Round Recap returned no text.');
    return json(200, { success: true, recap, ...(purpose === 'ledger-story' ? { story: recap } : {}), contentSpecVersion: contentSpec.version, state: 'draft' });
  } catch {
    return failure(400, 'REQUEST_PROCESSING_FAILED', 'Round Recap request could not be processed.');
  }
});
