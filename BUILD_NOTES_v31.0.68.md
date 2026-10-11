# The Dye Ledger v31.0.68 — Local Storage Footprint

## Authorized scope

Urgent event storage relief before October 16. Supersedes the pending setup-warning,
handicap-preview and foursome-assignment refinements; those remain unimplemented.
Started from clean committed v31.0.67 (d5a0363), on
codex/v31.0.68-local-storage-footprint. No archive migration, asynchronous
persistence, backend change, scoring change or frozen-record rewrite.

## Storage relief and preservation

Stats materialize only with individual tracking enabled. Creation, template/next
round drafts, normalization, Play initialization and cloud hydration tolerate
absent arrays. Enabling tracking materializes the existing full row shape and
preserves prior recorded rows. Actual legacy statistics remain present even when
tracking is disabled; unknown row fields are retained in normalization.

On load, a separate compaction step removes stats only when tracking is explicitly
false, the hole count is 9 or 18, and all existing player arrays contain exactly
the known defaults. Every default field must exist with the exact value/type.
Optional entryCompleted:false is also recognized. Missing fields, changed fields,
unknown fields or any non-default row prevent all stats removal for that match.
This runs before normalizing and writes the smaller primary synchronously. Failed
atomic primary writes preserve the prior saved data; backup pruning retains the
existing quota recovery behavior. Repeated loads are idempotent.

Frozen matches retain the last five shared sync events plus the existing small
aggregate and parity information. This preserves recent completion diagnosis
while releasing old telemetry. New freeze eviction requires verified parity for
shared rounds; existing already-frozen matches compact on load. No function visits
or changes roundRecordSnapshot, its history, scores, saved evidence or payments.

Quota failures explicitly name full device storage and Library's existing Delete
action, with export-before-deletion guidance. Deletion is never automatic.
Copy Diagnostics includes the actual local save error and storage usage.
Technical diagnostics reports estimated UTF-16 bytes across all localStorage keys,
round count, largest keys and largest rounds. Browser storage.estimate() is
separately labelled as the origin-wide estimate (caches/databases included), not
localStorage's limit or remaining capacity. Unavailable estimates are explicit.

## Measurements

Same deterministic completed fixtures through the live engine and finish candidate,
comparing committed .67 with .68; UTF-8 bytes of JSON.stringify(match):

| Completed round | .67 bytes | .68 bytes | Reduction |
| --- | ---: | ---: | ---: |
| Flamtana, live telemetry cap | 102,872 | 51,199 | 50.2% |
| Flamtana, exhaustive Hole 18 card-off | 110,600 | 58,927 | 46.7% |
| Tracked individual, no shared telemetry | 69,721 | 69,721 | 0% |
| Flamtana, injected legacy 200-event trace | 135,933 | 51,199 | 62.3% |
| Exhaustive card-off, legacy 200-event trace | 143,661 | 58,927 | 59.0% |
| Tracked individual, injected legacy 200-event trace | 108,619 | 70,693 | 34.9% |

Tracked statistics bytes remain exactly 22,504 before/after (sum of each stats
array's JSON bytes). Flamtana stores no player stats arrays; its saved defaults
formerly occupied 46,736 bytes by the same measure. Recorded games, player records,
report players and payment bytes
are equal across releases. New records naturally identify their creating version;
existing frozen records are byte-identical through compaction.

The supplied 151 KB estimate is not reproducible under .67's existing 6,144-character
telemetry budget: live normalization reduced the injected 200 events to 30 before
freeze (5,839 bytes). The separate 200-event case measures load-time relief without
pretending that all live rounds retain 200 events. Shared traces/backup copies and
localStorage UTF-16 accounting differ from UTF-8 match-file measurements.

Reproduce with `node scripts/measure-storage-footprint.mjs d5a0363`.
Full machine-readable results: reports/storage-footprint-v31.0.68.json.

## Verification

Final complete suite: **1,400/1,400 passed**, no skips. Lint: zero errors,
88 existing warnings. Validate passed. Release sanity: six passes, three existing
development warnings, zero failures. Simulation comparison: 77/77 exact matches,
zero differences/failures; 60 advisory warnings and one suspicious outcome.
Simulation tests: 4/4 passed.

Flamtana stress: **50/50 scoring, independent hydration, finalization and PDF
generation runs passed** against .67, with byte-identical component settlement
amounts, combined payments and complete saved evidence. Page ranges unchanged:
split 7–8, Hole 18 8–10, back nine 7–8, last six 8–10.

Layout checks passed for all seven reports. Page counts and extracted PDF text
match committed .67: Nassau 8, Nine Point 5, Sixes segments 5, Sixes points 5,
Wolf 5, iOS reference 11, Flamtana 7. Kept existing PDFs after verifying equality
to avoid generation-date-only changes; HTML cache URLs and the Flamtana fixture's
creating-version metadata are updated. Report logic changes only its cache URLs.

New behavioral tests cover enabled
tracking and full report preservation, no team stats through report/hydration,
mid-round materialization, exact-default conservatism, repeated-load idempotence,
immutable frozen evidence, quota recovery/atomic failure, and contributor accounting.
The production browser startup path compacts a pre-release round, preserves its
frozen snapshot and unrelated storage key, then surfaces the explicit remedy on
a real browser quota failure. Larger-text support diagnostics passed at 32px root
text on a 375px phone viewport.

## Physical iPhone acceptance

Install .68 and verify existing saved round count and reports. On the remote phone,
inspect storage diagnostics after automatic compaction, retry joining, assign all
eight golfers to the two scoring devices and confirm both foursomes can score.
Check a tracked individual round, then enable tracking mid-round on an untracked
individual round. This local/browser verification cannot confirm the affected
physical phone has sufficient remaining capacity until John rehearses it.
