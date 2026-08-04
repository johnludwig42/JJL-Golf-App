# The Dye Ledger v30.3.85 Build Notes

## Summary

v30.3.85 improves trust at the end of a round and hardens Nassau scoring: tracked statistics use interaction provenance instead of a confirmation checkbox, Memories can be corrected with revision history, AI Recap generation becomes an obvious post-round step, and Nassau supports explicit Best N scoring with game-specific handicap policy.

## Nassau scoring and handicaps

- Nassau remains a two-team competition and supports one through six active golfers per team, including unequal teams.
- Both teams count the same selected number of low balls. Best N cannot exceed the smaller active roster.
- Any missing score from an active team member keeps that hole unresolved; the engine never silently chooses from a partial team.
- Net Nassau stores a versioned, game-specific allowance with recommended/custom provenance. Approved recommendations are 100% for 1-v-1, 90% for 2-v-2 Best 1, 100% for 2-v-2 Best 2, 75%/85%/100% for 4-v-4 Best 1/2/3+, and a clearly labeled 100% Dye Ledger recommendation for other or unequal rosters.
- New Nassau setup offers Gross or Net. Existing Gross & Net configurations remain readable and retain legacy Best 1 behavior.
- Presses and Re-Presses inherit the parent Nassau basis, Best N selection, allowance, and scoring-policy version.
- Versioned Nassau Shared Match payloads use a fail-closed capability key so an older client cannot silently score the match as legacy Best 1.

## Scorecard clarity

- Scores offers Course Net and Match Net views while preserving the existing Classic Scorecard table and scrolling behavior.
- Course Net uses the golfer's full signed Course Handicap, including correct upward stroke allocation for plus handicaps.
- Match Net displays the selected competition's relative strokes and allowance.
- Match Summary exports Course Net first, followed by each materially distinct Match Net scorecard.
- Settlement headings now use the basis-neutral label `Final Settlement`.
- Match > Players now shows only tee-specific Handicap Index and Course Handicap facts. Match > Games & Stat Tracking shows the Featured Competition's allowance, Game Handicap, and relative strokes received, with a bottom return control for long iPhone pages.
- Match Setup now fails closed during startup: the landing choices and setup form cannot render together, and an unavailable Featured Competition preview cannot interrupt navigation or scoring controls.
- Play now labels and derives Game Strokes from the saved Featured Competition, and Match Summary's Match Net view uses that same frozen competition basis. Course Net remains a separate full-Course-Handicap view.

## Round completion

- Gross-score completion no longer silently certifies untouched tracked statistics.
- Interacting with a player's stat controls marks that player's hole entry as entered; untouched suggestions remain distinguishable and excluded from analysis.
- End Round is always available and distinguishes a fully scored round from an early ending in its review window.
- Completing the final gross score does not open an automatic finish prompt. The user explicitly chooses End Round when ready.
- A fully scored round may be completed with untouched statistics; those facts are excluded rather than treated as zero or accepted defaults.
- Score-only rounds and disabled Stat Tracking remain unchanged.

## Memories and recap

- Scores provides Edit actions for eligible active and completed-round Memories.
- Edits preserve the Memory ID, creator, creation time, prior content, update attribution, and an append-only revision history.
- Frozen RoundRecords are not directly rewritten; a completed Memory correction updates the living presentation while preserving the frozen historical record.
- Completed rounds expose Generate AI Recap before viewing the Match Summary.
- Rounds without selected games remain fully eligible for AI Recap generation.
- Recap failures distinguish unavailable deployment, authorization, throttling, validation, and connection states without logging recap content.
- AI remains online-only, non-blocking, draft-first, and subject to explicit acceptance.

## Compatibility and boundaries

- Scores, Library, and More subsection headers use the same title-description-back-button hierarchy as Match Setup.
- Long subsection pages provide an equivalent back button at the bottom so iPhone users do not need to scroll back to the top.
- Existing rounds and default/auto/user putt provenance remain readable.
- Non-Nassau scoring and settlement calculations remain unchanged.
- No local records were uploaded, claimed, rewritten, or deleted.
- No Supabase migration, Edge Function deployment, production data change, or secret change was performed.

## Deferred

- Full Amendment Session UI
- Production recap-function inventory/deployment
- Memory photo attachments
- Insights implementation beyond the separately documented product plan
