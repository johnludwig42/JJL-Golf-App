# The Dye Ledger v30.1.5

AI Recap Memory Integration & Storytelling Refinement.

## What changed

- Preserves Memories from UI state through the app recap payload and Supabase `round-recap` Edge Function.
- Passes Official Results, Round Notes, and Memories to OpenAI as distinct context sections.
- Updates AI recap instructions to naturally weave in memories and notes without fabricating details.
- Adds compact recap input transparency showing Round Notes status and Memories included in the recap.
- Preserves Generate / Regenerate / Edit / Accept editorial workflow.
- Updates app, cache, manifest, and visible version references to v30.1.5.

## Guardrails

- No scoring calculation changes.
- No settlement calculation changes.
- No shared-match synchronization architecture changes.
- No Supabase schema changes.
- No localStorage key changes.
