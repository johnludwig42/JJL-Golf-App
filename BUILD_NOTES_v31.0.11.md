# v31.0.11 — Player Memories and Four-Golfer Grind

## Outcome

Player Mode restores direct access to round Memories, while Grind becomes practical for a standard foursome and for larger Shared Matches divided among scoring devices.

## Player Mode Memories

- Adds **Add Memory** to the Player Mode overflow menu and shows the current Memory count.
- Allows an editable Memory from an active local round to be deleted with an explicit two-step confirmation.
- Restores the original Memory collection if local persistence fails.
- Keeps completed-round Memories protected for Amendment Sessions.
- Keeps Shared Match Memories append-only until conflict-safe deletion is available.

## Grind eligibility

- Raises the Grind workload limit from two to four editable golfers per scoring device.
- Bases Shared Match eligibility on golfers assigned to the current device, not the total field the host can view.
- Falls back to Enhanced when a device can edit five or more golfers.
- Preserves viewer and unassigned-device protections.

## Compatibility

- No scoring, settlement, Ledger Entry calculation, Course Library, local-storage schema, or database changes.
- Classic Mode behavior is unchanged.
- Existing rounds and stat-tracking modes remain compatible.
