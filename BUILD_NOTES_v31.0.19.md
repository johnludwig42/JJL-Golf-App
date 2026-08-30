# The Dye Ledger v31.0.19

## Guided post-round Story flow

- Automatically starts one host-only Story of the Round draft after a round is durably completed.
- Preserves every existing draft and saved Story; automatic generation never overwrites accepted work.
- Replaces duplicate completion prompts and export choices with one **Finish up** workflow on the Scores tab.
- Guides the golfer through Story review, saving, Ledger Entry review, and the next-round choices.
- Keeps a facts-only Ledger Entry preview available when a Story has not been saved, while preventing premature finalization.
- Keeps joined Shared Match devices read-only for Story preparation and waiting for the host's accepted Ledger Entry.
- Retains the Classic Scorecard as a quiet secondary post-round option.

## Safety and compatibility

- No scoring, handicap, settlement, Round data schema, cloud schema, or migration changes.
- Existing completed rounds, saved Stories, accepted Ledger snapshots, Classic Mode, and Shared Match scoring remain compatible.
- Story service failures and offline completion leave the completed round usable with a clear manual retry path.
