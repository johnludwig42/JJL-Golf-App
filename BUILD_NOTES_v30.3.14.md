# The Dye Ledger — Build Notes v30.3.14

Release theme: Shared Match should feel effortless, trustworthy, and ready before scoring begins.

## Changes
- Updated app version, service-worker registration, manifest start URL, cache name, and asset query strings to v30.3.14.
- Standardized new Shared Match codes as `DYE-######` with six digits and leading-zero support.
- Hardened match-code normalization so joins accept lowercase, digits-only, spaces, and normal `DYE-######` input.
- Improved Shared Match join failure messaging for invalid or missing codes.
- Kept joined devices on the Match tab after joining so assignment/readiness is visible before scoring.
- Added clearer host Shared Match card wording, separate Copy Code and Share Code actions, and plain-English readiness lines.
- Improved participant/cart display with friendly names, assigned players, and seen-now / seen-recently / not-seen-recently status language.
- Preserved participant-based assignment values while keeping raw IDs in diagnostics only.
- Kept Play tab scoring-focused with the existing sync light and a calm waiting-for-assignment message for unassigned joined devices.
- Preserved PWA update reliability, desktop scrolling behavior, Shared Match diagnostics, shared memories, and score sync.

## Files Modified
- `app.js`
- `index.html`
- `manifest.json`
- `service-worker.js`
- `README.md`

## Validation Checklist
- [ ] Host creates a Shared Match with `DYE-######` format.
- [ ] Join accepts `DYE-######`, lowercase, digits-only, and spaced variants.
- [ ] Invalid code shows a clear retry message.
- [ ] Host remains on Match tab with code, participants, assignments, readiness, and Start Scoring visible.
- [ ] Joined device remains on Match tab after joining and sees waiting/assigned state.
- [ ] Participant assignments persist as `playerId → participantId`.
- [ ] Joined refresh/reopen preserves assignment.
- [ ] Play tab sync light remains present.
- [ ] Local-only scoring unchanged.
- [ ] Shared scoring, memories, Course Library sync, and Match Summary still work.
