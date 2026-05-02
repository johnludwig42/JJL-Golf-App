# The Dye Ledger

Current version: **v27.25**

## What changed in v27.25
- Stabilized Create New Match when the active round is already complete.
- Made DOM score capture side-effect free so passive sync/capture paths do not reopen completed rounds.
- Reopened completed rounds only from user-initiated score saves when values actually changed.
- Preserved reopened-round metadata when editing match setup.
- Updated manifest and service-worker cache version to v27.25.
