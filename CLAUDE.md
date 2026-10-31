# The Dye Ledger — Claude Code Orientation

Read these sources before changing code:

1. `PROJECT_CONTEXT.md`
2. `docs/03_CODEX_WORKFLOW.md`
3. `docs/architecture/THE_DYE_LEDGER_CONSTITUTION_v1.0.md` for architecture, identity, data-model, security, or historical-record work
4. The newest `BUILD_NOTES_v*.md`

## Finding the current state

- Read the version from `package.json`.
- Read the dated entries at the top of `PROJECT_CONTEXT.md` and the newest `BUILD_NOTES_v*.md` for status and verification limits.
- Inspect Git for the current branch, revision and working-tree changes.
- Static, dependency-free, local-first PWA; Node is development tooling only.

## Roles

John owns product direction, approved scope and owner decisions. Claude plans work
packages and independently reviews plans, implementations and evidence. Codex
implements, tests and self-reviews. ChatGPT may be an optional adviser with no
planning, review or approval gate.

See [Claude–Codex handoff](docs/07_CLAUDE_CODEX_HANDOFF.md).

## Non-negotiable invariants

- Preserve user data, localStorage compatibility, completed RoundRecords, and immutable Round course snapshots.
- Classic and Player Mode render and collect through one Play controller and Round contract. Input modes do not calculate independently.
- `applyCurrentHoleDomToMatch` applies only inputs present in the DOM; absent accordion inputs must never clear a golfer's facts.
- Unknown statistical inputs remain unknown and stay outside denominators. Default putts are not confirmed putts.
- Shared Match remains authority-scoped, outbox-backed, idempotent, and parity-gated at completion.
- Course draft publishing remains atomic and retains local recovery until verified cloud parity.
- Ledger Entry never accepts an unverified generated story. When online generation fails, it uses the deterministic authoritative-facts story.
- Grind is limited to four golfers editable by one scorekeeper; otherwise use Enhanced.
- Every release gets a new cache name and immutable branding filenames.
- Release-identity assertions must derive the current version from `package.json` through the shared test helper; test files must not hard-code the current release version.

## Required workflow

- Inspect branch and working tree before edits; preserve existing user changes.
- Keep releases narrow and avoid unrelated refactoring.
- Follow [Actions Requiring Product Owner Approval](docs/03_CODEX_WORKFLOW.md#16-actions-requiring-product-owner-approval).
- Run `npm test`; it discovers every `tests/*.test.js` file.
- Before release approval also run simulation comparison, release sanity, validation, lint, layout checks, and relevant real-device acceptance.
