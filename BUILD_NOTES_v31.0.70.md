# v31.0.70 — Flamtana Off-Low and Shared Scoring

## Authorized scope

John explicitly reopened the feature freeze for the Flamtana strokes/readiness
corrections, remote scoring investigation/fix and Play Scoreboard leaderboards.
He chose off-low strokes for wager net scores **only in newly created rounds**
and confirmed both scoring phones use the same signed-in account.
Started clean from committed v31.0.69 (98a5a67), whose application remains .68.
Branch: codex/v31.0.70-flamtana-scoring-and-sync. No production database change.

## Changes

- New Flamtana rounds save scoringPolicyVersion 2. Team Game HCP is full saved
  team Course HCP minus the lowest Course HCP of all four teams, using each team's
  tee stroke indexes. No extra allowance. Featured/Group totals, the per-hole
  Foursome minima and tie evidence all use those net hole scores. Calcutta follows
  the revised Featured result. Saving a new round from an old setup upgrades its
  policy; editing an existing round preserves its version.
- Existing unfinished rounds keep version 1/full Course Net. Existing frozen
  records, evidence, payments and accepted reports remain untouched. Old readers
  reject the new unsupported policy; both phones should install .70 for new rounds.
- Score attribution no longer equates one account to one device. The deployed
  score RPC records updated_by as the authenticated user while device/participant
  attribution lives in the operation receipt. The prior reader selected the first
  participant with that user ID, misidentifying Cart 2 as host and rejecting its
  scores as JOINED_OVERWRITE_PREVENTED. Explicit participant/device attribution
  still takes precedence; an ambiguous account is left unknown rather than falsely
  assigned. Server-authorized rows use the existing unknown-attribution path.
  Assignment enforcement on writing, explicit unauthorized-actor rejection,
  stale-write checks and intentional host override protections remain in place.
- Untouched Cart 2 fields on a stale host render cannot clear newly downloaded
  team scores or create override locks when the host saves another team. Typed
  entries and deliberate clears still permit host takeover and Pending resolution.
  Existing override locks are not automatically removed: genuine host edits must
  not be overwritten merely to make synchronization appear successful.
- Setup warnings route shared/device/scoring requirements to Scoring and game/pick
  requirements to Games, with the actual reason beside Needs attention. Players
  reflects its roster/tee/index requirements. Handicap preview headers and rows
  share widths/gaps/padding, scroll within the card at larger text sizes, and show
  four team rows with off-low Gets. Existing game basis is explicitly labelled.
- Play Scoreboard shows Featured, both Group contests, Foursome and Calcutta.
  Contests compare common completed holes across their sides, while showing each
  side's completed-hole count. Pending pairs are excluded. Calcutta is a labelled
  projection before finalization, with unbacked-team shares going to partners;
  finalized views use the saved result. No preview settles or mutates the round.

## Verification

**Final release checks:** complete suite **1,412/1,412 passed**, zero failures or
skips; lint zero errors with 88 existing warnings; validate passed; release sanity
six passes/three development warnings/zero failures; all seven layout gates passed.
Simulation comparison: 77/77 exact matches, zero differences/failures, 59 advisory
warnings and one suspicious outcome. Simulation tests: 4/4 passed. Flamtana remains
outside the mirror simulation and is verified separately below.

Behavioral coverage includes same-
account incoming scores on all 18 holes, wrong explicit actor rejection, host
override preservation, stale-render protection, deliberate takeover, policy 1
compatibility, policy 2 net/stroke/report consistency, frozen record immutability,
common-hole standings, Calcutta projections and larger-text/browser layout.

**Legacy policy: 50/50 stress cases passed**, with component money, combined
payments and full saved evidence byte-identical to .62. **New off-low policy:
50/50 stress cases passed** against the independent gross-minus-off-low allocation,
per-hole Foursome-minimum and payout oracle. Equality to old card-off outcomes is
not asserted because John explicitly changed the scoring rule for new rounds.
Both sets render/export successfully; each has 13 split, 13 Hole 18, 12 back-nine
and 12 last-six cases. Page ranges for each policy are split 7–8, Hole 18 8–10,
back nine 7–8 and last six 8–10. All required evidence steps remain printed.

**Two-device browser rehearsal passed** through the production Match/Join forms,
all-eight assignments, Start, 18 holes per device in opposite orders, durable
score operation submission/acknowledgement, confirmed parity, completion/freeze
and normal mobile report export (8 pages). Both assigned participant records use
the **same account ID**. The local API test double models admission-created
memberships and SQL-shaped score rows containing updated_by, without invented
participant_id/device_id fields. All **144 partner-score rows** reach the host.
The resulting five component amount maps, combined payments and complete evidence
match the independently verified off-low stress round 01. Test-double RPC counts:
five owner publications, one join and two score-operation submissions.

Existing reference PDFs retain their page counts and extracted text: Nassau 8,
Nine Point 5, Sixes segments 5, Sixes points 5, Wolf 5, iOS 11, Flamtana 7. Retained
the original PDFs after checking text equality to avoid generation-date churn;
HTML module cache URLs and the Flamtana fixture reflect .70. Same-account,
stale-render, deliberate takeover, four-team preview/header tracks, visible warning
hub and all five leaderboard sections also passed browser checks, including 32px
root text on a phone viewport. The low-team test includes a higher-index team
playing a different tee whose Course HCP is actually lowest.

## iPhone rehearsal

Install .70 on **both** phones. Existing unfinished Flamtana tests retain their
old full-handicap wager rule; create a fresh match to test off-low wagers. Assign
both partners in T1/T2 to the host and both in T3/T4 to Cart 2, enter all picks,
Start, score/save on each phone and Sync Now. Confirm remote T3/T4 scores on the
host across several holes and inspect Pending/host override guidance if a genuine
host correction was previously made. Check all five Scoreboard sections and the
four-team preview. Real Supabase/iPhone acceptance remains John's physical check.

The previous .69 API rehearsal used distinct accounts and explicitly attributed
score rows. It did not model this deployed SQL same-account attribution case.
The new rehearsal must use the same account and RPC-shaped score rows without
inventing participant/device fields in score_entries.

The earlier .69 Support diagnostic that shows Frozen RoundRecord: No after
completion remains unchanged; actual frozen snapshots are verified directly and
the runbook explains the limitation. No commit, push, production migration or
deployment was performed. Browser/API-double checks do not establish acceptance
on John's actual iPhones or the live Supabase service.
