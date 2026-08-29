# The Dye Ledger v31.0.14

## Player Mode progressive entry flow

- Keeps gross score, putts, and a concise derived readback visible in the common Player Mode workflow.
- Places penalties, fairway direction, approach dispersion, recovery lie, and the GIR edge-case override in a device-remembered More Detail disclosure.
- Keeps every detailed input mounted while the disclosure is collapsed so the existing score/stat persistence contract remains unchanged.
- Advances to the next editable incomplete golfer only after the selected golfer's required entry is complete. Enhanced and Grind do not advance past unknown required fairway, approach-miss, or recovery-lie facts.
- Treats the remembered More Detail state only as the default for newly expanded cards; completed detail can advance even while the disclosure is open.
- Uses the existing device Smart Score Advance setting and Fast, Normal, or Relaxed timing.
- Collapses all golfer cards and focuses Save & Next Hole when the device's editable entries are complete.

## Replaced presentation

- Replaces the former always-visible standalone GIR result with a concise collapsed readback plus a provenance-labelled GIR result inside More Detail.
- Restores the detailed directional, scrambling, putting, and penalty readback inside More Detail after it was omitted by the initial progressive-disclosure implementation.
- Marks manually corrected GIR results in the concise readback so an override remains visible while detail is collapsed.

## Compatibility

- Classic Mode rendering and behavior are unchanged.
- Round, score, statistic, persistence, Shared Match, synchronization, and reporting schemas are unchanged.
- Grind remains available for as many as four editable golfers on a scoring device.
