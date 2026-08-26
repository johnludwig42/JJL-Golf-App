# v31.0.07 — Player Mode Core Score Entry

## Outcome

Player Mode is now a selectable Play experience built on the shared v31.0.06 input controller. Classic Mode remains available and unchanged.

## Player Mode

- Current-hole, tap-first gross score choices for every visible golfer.
- One selected golfer expands into detailed stat entry.
- Team, tee, and handicap strokes remain visible; strokes use bold dots rather than “pops.”
- Featured competition status and Shared Match controls remain authoritative and shared.
- None, Casual, Enhanced, and Grind stat-detail preferences are available.
- Grind falls back to Enhanced when the device is responsible for more than two golfers.

## Stat integrity

- GIR is calculated from gross score, putting-surface putts, and par.
- Missing or default putts propagate an unknown GIR rather than a fabricated miss.
- Manual GIR corrections retain override provenance.
- Fairway and green direction plus bunker involvement are stored as additive hole facts.
- Classic and Player Mode continue to use the same persistence, scoring, competition, sync, and report paths.

## Deployment

No database migration is required. Existing rounds remain compatible.
