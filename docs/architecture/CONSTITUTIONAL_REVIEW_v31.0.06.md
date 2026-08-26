# Constitutional Review — v31.0.06 Play Input-Mode Foundation

## Decision

Play input modes are presentation adapters over one authoritative Round and Play controller. A mode may render and collect inputs, but it may not implement separate scoring calculations, game logic, stat derivation, Shared Match synchronization, settlement, reporting, or RoundRecord persistence.

Classic Mode owns the current renderer in v31.0.06. Player Mode is registered but unavailable and resolves safely to Classic. Future modes must consume the same controller contract and must save visible edits before switching. Mode preference is device-local and is never written into the Round, Shared Match facts, or historical record.

## Compatibility and authority

- Existing Match and RoundRecord schemas are unchanged.
- Classic Mode continues to use the existing score and stat controls.
- `persistCurrentMatch` remains the authoritative visible-input commit path.
- `computeMatchMetrics` and all downstream calculations remain mode-independent.
- A failed local save prevents a mode change.

## Acceptance boundary

This release establishes architecture and parity only. It does not ship the redesigned Player Mode, stat-capture modes, lifecycle navigation, or Trip Mode.
