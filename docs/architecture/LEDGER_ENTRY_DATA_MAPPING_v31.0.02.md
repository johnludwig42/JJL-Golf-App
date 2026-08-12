# Ledger Entry Data Mapping — v31.0.02

This is the approved pre-implementation mapping for the Ledger Entry report. The report is a read-only projection of the effective RoundRecord plus current deterministic engines. It never mutates a Round, settlement, memory, or local record.

## Scope decisions

- Ledger Entry is the default and visibly recommended Export type. Match Summary and Classic Scorecard remain available and unchanged.
- Presses render as separate nested ledgers with their own range, wager, status, result, and audit identity. They do not alter the parent cumulative-margin chart.
- Completed local rounds and Shared Matches are supported. No cloud upload or database change is required.
- The Story of the Round is always present. When online, the report requests a dedicated 300–400 word publication-style narrative from authoritative round facts and reuses it for the same unchanged RoundRecord within the active app session. It does not reuse or mutate the Match Summary recap. When AI is unavailable, a deterministic facts-only story is rendered and labelled.
- Wolf and Sixes are out of scope because their engines are not yet implemented.
- Proven visual adapters cover Nassau, Match Play, Greenies, individual Skins, and 9-Point. Other selected games retain their authoritative recorded settlement as a separate ledger and use Course Net for the neutral featured exhibit; the report never substitutes invented per-hole values.

## Field-level mapping

| Displayed field | App source | Transformation | Handicap basis | Unit | Provenance | Missing / incomplete treatment |
|---|---|---|---|---|---|---|
| Report title | Export selection | Constant `Ledger Entry` | N/A | text | generated presentation | Always present |
| Report status | RoundRecord meta + completion engine | FINAL, CLINCHED EARLY, or PROVISIONAL | N/A | status | derived calculation | Incomplete rounds are PROVISIONAL unless all games are mathematically final |
| Date / Course / Tee | RoundRecord snapshots | Recorded display values | N/A | text/date | historical fact | Truthful fallback; never infer missing context |
| Holes completed | RoundRecord meta | completed / planned | N/A | holes | derived calculation | Completed holes only |
| Featured result | Featured Competition engine | Existing truthful formatter | Featured competition | holes, points, or strokes | derived calculation | Unresolved remains unresolved |
| Settlement positions | RoundRecord settlement | Canonical player net positions | Per owning game | dollars | derived calculation | Provisional when unresolved |
| Settle-up payments | RoundRecord transactions | Existing optimized settlement rows | Per owning game | dollars | derived calculation | Empty state when none due |
| Settlement cross-foot | RoundRecord settlement | Position/payment audit | Per owning game | dollars | derived audit | Mismatch is surfaced, never repaired in report |
| Highlights | Match Summary analytics | Supported-fact highlights | Declared by each fact | score, holes, or dollars | derived calculation | Ties remain ties |
| The Story of the Round | Effective RoundRecord plus authoritative recap payload | Dedicated AI narrative, cached in memory by RoundRecord fingerprint | Strokes, points and dollars remain explicitly distinct | narrative | generated narrative | 300–400 words; deterministic facts-only fallback when unavailable; never mutates the RoundRecord |
| Recap provenance | RoundRecord notes | Visible generated/fallback label | N/A | label | historical metadata | Always present |
| Memories | RoundRecord notes `memories` | Verbatim text and recorded hole | N/A | text | historical fact | Omit section if none |
| Weather | RoundRecord notes `weather` | Conditions, temperature, humidity, wind | N/A | °F, %, mph | historical fact | Omit missing values and coordinates |
| Player rank | Course Net leaderboard | Tie-preserving rank | Full Course Handicap | ordinal | derived calculation | Non-finishers excluded from final awards |
| Player gross | RoundRecord hole scores | Completed-score sum | Gross | strokes | historical fact aggregation | Missing holes excluded |
| Player Course Net | Course handicap engine | Gross less Course Handicap strokes | Full Course Handicap | strokes | derived calculation | Provisional when incomplete |
| Player net to par | Course Net leaderboard | Course Net less scored-hole par | Full Course Handicap | strokes to par | derived calculation | Completed holes only |
| Score distribution | RoundRecord hole scores | Counts relative to par | Gross | hole count | derived calculation | Suppressed before six holes |
| Team gross | Team membership + scores | Member gross sum | Gross | strokes | derived calculation | Dash when empty |
| Team full-CH net | Course handicap engine | Member Course Net sum | Full Course Handicap | strokes | derived calculation | Dash when empty |
| Team 100%-off-low net | Game-relative stroke engine | Gross less 100% Playing Handicap difference | 100% off low | strokes | derived calculation | Dash when unavailable |
| Team featured net | Featured handicap context | Gross less selected allowance difference | Explicit selected allowance, e.g. 85% off low | strokes | derived calculation | Dash for gross/no handicap game |
| Game label / result | RoundRecord game + game engine | Authoritative result formatter | Declared in game | holes, points, or strokes | historical fact + derived calculation | Provisional/unresolved stays labelled |
| Game stake | RoundRecord game config | Money formatter | N/A | dollars per match/hole/point | historical fact | Zero remains zero |
| Game contribution | RoundRecord settlement | Per-game economic contribution | Declared in game | dollars | derived calculation | Reconciles separately from margin |
| Nassau margin | Nassau engine | Front, Back, Overall | Gross or configured off-low allowance | holes | derived calculation | Incomplete segment cannot be awarded |
| Match Play margin | Match Play engine | Cumulative hole margin | Gross or configured off-low allowance | holes | derived calculation | Unplayed holes excluded |
| SSP raw / final points | SSP ledger | Raw categories, Take/Keep, multipliers | SSP configuration | points | derived calculation | Counted SSP holes only |
| SSP settlement | SSP ledger | Point margin × point value | SSP configuration | dollars | derived calculation | Points and dollars reconcile independently |
| 9-Point ledger / settlement | 9-Point engine | Primary points; separately derived money | Game configuration | points and dollars | derived calculation | Mismatch is an error state |
| Press identity / range / wager | RoundRecord Press facts | Stable ID, depth, holes, original wager | Parent game basis | identifier, holes, dollars | historical fact | Never inferred from row order/current stake |
| Press result | Press engine / frozen result | Separate nested ledger status and winner | Parent game basis | holes and dollars | derived calculation | ACTIVE/INCOMPLETE stays provisional |
| Stat-tracking rows | RoundRecord stat facts | Existing stat summaries | Gross context | count or percent | derived calculation | Unrecorded fields omitted; off is not zero |
| Course Net scorecard | Scores + handicap engine | Gross above Course Net | Full Course Handicap | strokes | fact + derived calculation | Missing holes are dashes |
| Match Net scorecard | Scores + featured engine | Gross above featured net | Explicit selected allowance off low | strokes | fact + derived calculation | Omit when no featured handicap config |

## Privacy exclusions

The output must never contain GHIN, email, phone, Account IDs, Golfer Identity IDs, Device IDs, installation IDs, auth/session tokens, credentialed URLs, or diagnostic payloads.

## Compatibility

No schema migration is introduced. Existing RoundRecords remain readable; added note fields are additive and preserve unknown fields. Report generation performs no save, upload, claim, merge, rewrite, or deletion.
