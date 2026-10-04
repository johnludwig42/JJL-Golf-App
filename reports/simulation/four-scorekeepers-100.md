# 100-round, four-scorekeeper simulation

Seed: four-scorekeepers-2026-10-02

- Full 18-hole rounds: 100
- Independent scoring sessions: 400
- Scores: 7,200
- Failures: 0
- Corrections before upload: 1027
- Delayed upload batches: 1300
- Duplicate acknowledgements: 7200
- Session reloads: 400



## Coverage limits
- Server acceptance, assignment enforcement, and network transport are modeled.
- Ledger propagation uses the standalone merge model, not the app cloud pull path.
- Corrections are queued before submission; cross-device conflicting edits and stale server updates are not covered.
- No live cloud, browser UI, phone, or PWA lifecycle verification.
