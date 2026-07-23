# The Dye Ledger v30.3.76 — SSP Rules, Routing & Finality

## Included

- Standard or Actual play order with immutable first-completion sequencing.
- Configurable Starting Honors and cumulative final-points Honors carry.
- Progressive Bridge/Re-Bridge calls with team, time, Participant, and Device attribution.
- One-tap Greeny validation when Stat Tracking is off.
- Tracked-putt Greeny validation and inherited Prox eligibility.
- Provisional settlement blocking for unresolved facts or Shared Match conflicts.
- Provisional settlement blocking for incomplete gross scoring and invalid Bridge/Re-Bridge attribution.
- Confirmed, reasoned, attributed active-round corrections for locked SSP sequence settings.
- Additive Shared Match facts and backward-compatible legacy normalization.

## Compatibility

No local records are uploaded, claimed, rewritten, deduplicated, or deleted. Existing scoring, Shared Match codes, player assignments, Press facts, settlement inclusion, RoundRecords, PWA storage, and Identity & Security foundations remain in place.

## Deployment

No database migration is included or required. Production Supabase and production data must not be changed as part of this implementation.

## Manual acceptance

- [ ] iPhone PWA upgrades and retains existing rounds and preferences.
- [ ] Standard and Actual play order produce the expected Honors sequence.
- [ ] Greeny is one tap without Stat Tracking and follows putts with Stat Tracking.
- [ ] Bridge is offered to the non-Honors team and Re-Bridge to the Honors team.
- [ ] Two devices converge; same-field conflicts require host attention.
- [ ] Provisional SSP facts do not produce a final settlement.
