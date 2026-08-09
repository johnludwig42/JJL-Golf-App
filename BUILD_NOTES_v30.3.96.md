# The Dye Ledger v30.3.96 Build Notes

## Release purpose

This focused security-reliability release repairs a partially activated production Identity foundation and makes initial Shared Match publication server-authoritative.

## Changes

- Adds one ordered, idempotent migration that restores the missing Account, Golfer Identity, Personal Golfer Library, provider-readiness, and Device foundations.
- Restores explicit claimed Golfer Identity creation without name, nickname, email, phone, GHIN, or Device-based merging.
- Adds a narrow authenticated `publish_shared_match_owner` RPC that derives Owner authority from `auth.uid()` and atomically creates the organizer membership.
- Keeps subsequent teams, players, scores, notes, devices, assignments, SSP facts, Press facts, memories, and parity synchronization behind the existing membership-scoped RLS policies.
- Records explicit initial-publication and Sync Now failures in Recent App Errors using only a friendly classification and bounded error code; raw responses, tokens, URLs, OTPs, and private match data are not recorded.
- Advances the application, cache, manifest, immutable icon references, App Notes, and release tests to v30.3.96.

## Compatibility and persistence

- Existing local matches and scores are not uploaded, claimed, rewritten, deduplicated, or deleted by sign-in or migration.
- The unpublished host match remains on its originating Device and can be retried after activation using Sync Now.
- Local-only and offline scoring remain available without an Account.
- Existing cloud Shared Matches and historical production rows are preserved.
- No scoring, handicap, game, SSP, Press, settlement, recap, or report calculation changes are included.

## Database deployment

- Migration: `202608090001_v30_3_96_identity_shared_publish_remediation.sql`.
- Rollback guidance disables the two new callable RPC surfaces while deliberately preserving Identity and Shared Match data.
- Validate twice against the disposable local Supabase stack before production application.
- Production application requires the confirmed Dye Ledger project and Product Owner approval; never apply to another project by inference.

## Manual acceptance

- Signed-in Account loads or explicitly creates its permanent Golfer Identity.
- Existing local rounds remain unchanged after identity creation.
- Host opens the previously unpublished local Shared Match and taps Sync Now.
- Host state becomes Online/Synced with a published `DYE-######` code.
- A second signed-in device joins that exact code.
- Assigned scoring, an older-hole edit, current-hole scoring, Sync Now, and score parity converge.
- Signing out does not delete local rounds or local scoring capability.
- Failed explicit synchronization produces a safe Recent App Errors entry without secrets or private match content.

## Automated verification

- Full JavaScript regression: 356 passed, 0 failed.
- Focused v30.3.96 remediation suite: 27 passed, 0 failed.
- Disposable local migration/RLS suite: all v30.3.75-v30.3.96 migrations completed; v30.3.96 policy contract 12 passed, 0 failed; the v30.3.96 migration was applied twice as the idempotency gate.
- Standard simulation: 75 rounds, 0 failures, 0 live-versus-mirror differences.
- Extended simulation: 125 rounds, 0 failures, 0 live-versus-mirror differences.
- Release validation, release sanity, and JavaScript syntax checks passed.
- Lint: 0 errors and 163 pre-existing non-blocking warnings.
- Secret scan found no committed credentials, tokens, private keys, OTPs, or database URLs with passwords; documented placeholders and security terminology were the only matches.
