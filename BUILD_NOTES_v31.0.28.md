# v31.0.28 — Course Publish Status Recovery

## Summary

- Clears obsolete Course Library verification errors only after a repaired cloud publish passes complete tee and hole verification.
- Clears stale cloud-incomplete markers at the same verified transition.
- Returns successfully repaired Account-owned drafts from **Needs Attention** to **Draft Uploaded**.
- Does not schedule unnecessary repeat uploads after the cloud and local course are already verified identical.
- Makes **Publish Local Changes** refresh cloud-backed attention courses even when no new upload is pending.
- Leaves tee data, Course Library schema, scoring, matches, and reports unchanged.

## Verification

- Focused stale-attention lifecycle tests.
- v31.0.27 seven-tee and gender-identity regression suite.
- Complete application tests, lint, release validation, release sanity, simulations, and Ledger Entry layout acceptance.
