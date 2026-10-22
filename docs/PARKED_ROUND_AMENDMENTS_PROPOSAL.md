# PARKED — Round Amendments and Financial Restatement

Not the scope of v31.0.79. Parked by the owner on October 21, 2026.
Retained as the design of record, not implementation authorization. Sticky waivers,
the limits of physical/account attribution, and hashes as identity rather than
mathematical proof remain part of this proposal.

# Archived design context — Round Amendments

**Parked design of record — no implementation or production authorization**  
Prepared October 21, 2026. Baseline: clean `ec9f966`, v31.0.78.  
Owner: John Ludwig. Future release unassigned; this is not the narrowed v31.0.79 scope.

## 1. Outcome and recommended decisions

Let the host review a refused or subsequently corrected score, save a real correction,
and explicitly choose whether it changes the agreed financial settlement. Preserve
every previously published RoundRecord and Ledger Entry. Resolve the exception
without leaving the phone permanently pending or retaining full delivery payloads forever.

Recommended decisions for approval:

1. Use an **Amendment Session**, never reopen a completed round for ordinary scoring.
2. Offer **Adjust settlement** or **Keep agreed settlement** whenever money changes.
   Keep corrected competitive results distinct from the financial agreement.
3. Make earlier monetary waivers persist through later amendments. Do not reinstate
   waived money merely because another score is corrected.
4. For shared rounds, use an explicit **Send for host review** queue, separate from
   `score_entries`, plus authenticated owner approval. Physical presence alone is
   not an authorization mechanism.
5. Remove unresolved payloads only after a durable resolution receipt. Preserve a
   compact audit separately; return the live outbox to its empty baseline.
6. Require a separately reviewed server foundation and staging rehearsal before
   enabling shared amendment publication. Do not apply historical migrations unchanged.

This is materially larger than an accept/discard dialog. Organize it into gated
implementation milestones under this proposal, rather than quietly expanding .78
or shipping a partial feature as a complete amendment system. The recommended
publication model remains owner-approved, client-computed sporting results, with
server-enforced authority, financial equations and immutable versioning; it does
not add a second server implementation of every scoring engine.

## 2. What the repository actually provides

- .78 preserves operations, latest local values and originating-device information.
  It has no usable review/resolution interface or resolution receipt.
- `roundRecordSnapshot` and the accepted `ledgerEntrySnapshot` represent frozen output.
  Current report acceptance identifies the round, not a particular published version;
  that is insufficient when two versions can exist.
- `roundRecordSnapshotHistory` exists, but its current reopen helper archives a copy,
  clears the live snapshots and changes the round back to active. **Do not reuse that
  behavior for amendments.** A local array is not an authorized cloud version protocol.
- The supplied deployed-schema audit found 10 migrations applied cumulatively,
  1 partial and 2 absent. The July versioned-history foundation and August score RPC
  are absent. Existing direct membership policies are broader than owner-only amendment
  authority. Passing repository tests is not proof that those protections exist in production.

The application needs new version-aware orchestration, and shared rounds need a
verified server contract. Existing wager formulas should be reused, not rewritten.

## 3. Scope

### Included

- Preserved-score review with values, time, source and current authoritative value.
- Single and bulk accept/discard, with durable reasons and attribution.
- Host-created score corrections even when there is no preserved exception.
- Gross scores and statistical fields already supported by the saved score contract.
- Completed local rounds and completed shared rounds, using one version contract;
  shared publication requires server authorization, while local publication is
  explicitly device-local and can remain offline.
- Revised results, relevant derived statistics, Story and Ledger Entry.
- Explicit financial adjustment or waiver, integer-cent accounting and repeated amendments.
- Version history, recoverable draft saving, exception cleanup and visible storage pressure.
- Existing supported games, including Flamtana and recorded Nassau presses. Unsupported
  or incomplete historical inputs block publication with a specific explanation.

### Excluded

- Retroactive changes to participants, tees, handicaps, wagers, buy-ins, Calcutta picks,
  competition selection or saved rules. Those require another scoped amendment type.
- Inventing/removing historical presses because corrected scores would have triggered
  different presses. Recompute the results of the presses actually recorded.
- Automatic payments, bank reconciliation, email/message distribution or external posting.
- Automatic amendment of a finalized linked Event Record.
- General cloud archive, Flamtana simulation-mirror coverage, sparse stat rows,
  per-cell conflict revisions and unrelated report polish.

## 4. Non-negotiable invariants

- Completed rounds never become active to accommodate a correction.
- Original versions and original report artifacts remain readable and unmodified.
- Drafts are separate from live matches and never enter ordinary shared-score uploads.
- Rejected scores never go back into `score_entries` after completion.
- A new authoritative version requires explicit approval, a reason and a financial decision.
- Use the saved course, hole mapping, handicaps, rules/policy versions, picks and
  recorded game facts. Do not reinterpret an older Flamtana round using today's defaults.
- A correction cannot silently revise a previously finalized Event Record or third-party report.
- Receipt acknowledgement, resolved exceptions and verified parity remain distinct.
- Storage/auth/network failures leave the original version usable and the proposal recoverable.

## 5. User flow

### A. Find and share exceptions

On the holding device, show a **Scores awaiting review** action in the completion
notice and in that round's Library details. Reopening the round must find the same
records even if its working completion marker was never saved.

Each row shows player/team, hole, preserved value, frozen/current value when known,
queued time, source-device label and status. Score and stat differences are explicit.
If the captured upload payload and the later local value differ, show both; do not
silently decide which represents the golfer's intended correction.

For Flamtana, group the partners into one team/hole review item while retaining both
source operation IDs. A mismatch remains Pending until the host chooses a consistent
team value. Never accept one partner's team score in isolation.

For a shared round, **Send for host review** explicitly submits the review packet to
the review queue. Display pending submission, received and resolved separately. Lost
acknowledgement does not cause duplicate proposals or clear the local copy.

### B. Host review

The host opens **Review corrections** from the completed round in Library. Also offer
**Correct a score** to start an amendment without a preserved packet.

The host can accept selected corrections, choose a consistent replacement value, or
discard selected proposals. Bulk decisions show exactly which rows are included;
unresolved rows stay unresolved. Require a reason, with one reason allowed for an
explicitly selected batch. Identical values can be resolved as **Already reflected**.

Discarding records what was proposed, who decided, when and why. Discard-only or
already-reflected decisions need an audit receipt, but no artificial new score version.

### C. Amendment preview

Create a separate draft against an identified base version. Show:

- Before/after scores and relevant statistics.
- Changed winners, ties, card-offs, presses, Calcutta recipients and other affected results.
- Corrected competitive balances, previously agreed financial balances, and this amendment's delta.
- The two financial choices, with neither preselected when amounts differ.
- Any necessary game-fact resolution. If a changed tie requires a fresh permitted
  card-off decision, obtain it before publication; do not reuse a decision about different candidates.

Unchanged rules and bets are locked. Preview does not send live score writes or change
the Library's authoritative version. Cancel keeps or explicitly removes the draft,
and does not discard the underlying score proposals.

### D. Save and publish

The final confirmation names the round, base version, changes, reason and financial
choice. For shared rounds it requires the recorded owner's authenticated account.

Successful publication creates a new immutable version and resolution receipt,
then marks the previous version superseded, not deleted. The user sees **Amendment
saved — Version 2**, or the appropriate later version, with a Revised Ledger action.

If offline, a shared amendment can be saved as **Draft on this device**. It cannot
claim to be published or financially authoritative until the server acknowledges it.
Local-only rounds can publish locally with clearly recorded device-local authority.

## 6. Financial rules — including repeated corrections

The application knows recorded settlement instructions, not whether cash actually
changed hands. The host confirms the prior agreed settlement used as the baseline.
Show revised total instructions separately from adjustment-only instructions; do not
claim a payment occurred or execute one.

Let:

- `C_previous` = competitive net balances in the latest published version.
- `F_previous` = financial balances agreed in that version, including prior waivers.
- `C_new` = competitive net balances from the corrected scores.
- `D = C_new - C_previous`, calculated per participant in integer cents.

| Choice | New agreed financial balances | New adjustment |
|---|---|---|
| Adjust settlement | `F_new = F_previous + D` | `F_new - F_previous` |
| Keep agreed settlement | `F_new = F_previous` | Zero; record `D` as waived |

Example: the original competitive and financial balance is +$20/-$20. A correction
makes it +$30/-$30. Adjust adds $10/-$10; keeping the agreement adds nothing and
records that waiver. If a later correction makes competition +$35/-$35, adjusting
adds only $5/-$5. It does not silently revive the earlier waived $10.

Compare per-person balances, not optimized payer/payee rows: rerouting a payment
matrix is not itself a new debt. Preserve exact deterministic cent allocation and
zero-sum checks. Report financial offsets/waivers explicitly so game-result amounts
and agreed money reconcile without pretending they are identical.

Reopening an earlier financial waiver would require an explicitly approved later
financial-amendment feature; it is not an implicit side effect of correcting a score.

## 7. Cross-phone authority and server contract

### Recommended transport

Use a review queue distinct from live score delivery. The submitting member can see
their submissions; the owner can inspect the round's proposals. Ordinary participants
cannot publish amendments or discard someone else's proposals. Preserve existing
guest/participant scoring behavior; do not add a permanent-login requirement to normal play.

Physical review on the holding phone remains useful but is not proof of host approval.
A count alone is insufficient. An exported packet can be a backup, but an unsigned
file must not become an authoritative host approval or cleanup receipt.

Approval is attributed to the authenticated owner account and originating device,
not an unverified typed name. Two phones sharing the same owner credentials cannot
prove which human approved an action. The UI and audit must not claim otherwise.

### Narrow server foundation to design and rehearse

Define owner-protected round heads, immutable versions, review submissions, amendment
requests/resolutions and receipts. Exact table/RPC names belong in the subsequent
schema proposal. Prefer a focused integration with the audited schema, not a blanket
replay of the absent July architecture.

Required guarantees:

1. Stable round-owner identity; bootstrap only from verified existing ownership,
   never an arbitrary UID in a client payload. Protect ownership/version links from
   the currently broad legacy metadata-update path.
2. Member-scoped review submission; owner-only review publication. Enforce in RLS
   and RPC, not just by hiding buttons. Device labels are attribution, not credentials.
3. Idempotent submission/request IDs and immutable payload hashes. A changed body
   with a reused ID is rejected; a lost-response replay returns its original receipt.
4. Publish against an expected current version. Two owner devices cannot overwrite
   each other: the second stale publisher must refresh and review the changed base.
5. Atomically append the new version, financial decision and audit, resolve its
   proposal IDs, and advance the head. Never leave a half-published amendment.
6. Use the canonical existing client engine for corrected competitive results,
   honoring the saved rule version. At publication the server checks the base and
   change contract, participant identities, integer cents, zero sums and the exact
   financial equations in section 6; derive agreed balances from the stored prior
   balances and explicit choice rather than accepting arbitrary client financial
   totals. The competitive result snapshot is explicitly **owner-approved**, not
   represented as independently recomputed by the database. Hashes establish content
   identity, not mathematical correctness. Independent behavioral test oracles and
   the host's before/after preview establish calculation assurance. If server-side
   recomputation of sporting results is desired, propose that shared-engine/runtime
   work separately; do not silently add a broad engine port to this release.
7. No amendment fallback to direct table upserts if the new RPC is missing. Save
   the draft, show a compatibility explanation and keep the original version current.
8. Ordinary direct/RPC score delivery remains closed after completion. The amendment
   path writes a successor version, not late live scores or an active-round reset.

The all-13-migration audit, corrected delivery/completion proposal, role tests and
fresh deployed-schema preflight remain production gates. New SQL needs separate
approval. Existing direct-upload and RPC suites both remain permanent coverage.

## 8. Version and artifact model

Record stable round/version/parent IDs, base content hash, schema/rule/engine versions,
immutable facts and results, competitive balances, agreed financial balances,
adjustment/waiver details, reason, actor account/device, publication time and linked
review/resolution IDs. Keep minimal indexed metadata separate from large snapshots.

Store draft inputs and cell-level before/after changes separately from published
records. Use opaque source operation IDs, since legacy operation IDs are not all UUIDs.

Report and Story acceptance must bind to **round ID + version ID + content hash**.
Reject delayed Story/report callbacks for an older version. Preserve the accepted
original report and original Story. Revised output gets a verified deterministic
facts Story by default; optional AI revision goes through the existing facts check
and explicit review, without blocking financial publication on AI availability.

The Revised Ledger shows version/date, correction summary, prior-version reference,
changed results, the host's financial choice and adjustment-only instructions or
the recorded waiver. Do not automatically resend an old download or imply recipients
have received the revised report. Previously downloaded PDFs cannot be recalled.

Library, Scoreboard and derived round statistics use the latest published version
by default, with readable prior versions and no duplicate counting of one round.
A finalized linked Event Record remains tied to its accepted version until a
separately authorized event amendment; surface that limitation explicitly.

Hydrate the selected version into a view cache before rendering through existing
synchronous record getters. Do not make the whole scoring engine asynchronous to
read IndexedDB. If the current version is not cached while offline, offer an
explicitly labeled available historical version; never silently label it current.

## 9. Resolution, parity and storage

### Durable resolution sequence

1. Retain unresolved local evidence and stable submission ID.
2. Receive the authoritative server resolution/publication receipt for a shared
   round, or create a durable device-local receipt for a local round.
3. Persist a compact audit and receipt locally before removing preserved payloads.
4. Clear only the source operation IDs actually covered by that receipt.
5. Refresh the canonical version, refresh derived views and check parity again.

Use recoverable, idempotent steps across stores. A crash after server commit, after
receipt persistence or during cleanup must resume without duplicate amendments or
lost evidence. If local audit storage fails, retain the unresolved records even
though the server may already have committed; the next retry retrieves the receipt.

Resolved exceptions remove an obstacle to parity; they do not establish parity.
For a completed round, verify the canonical published version ID/hash and bound
artifacts. Legacy `score_entries` are the historical live scoring ledger and are
not rewritten to amended values merely to obtain a green indicator. Keep live-score
parity separate from published-version parity; a discarded different local value
must not create an endless conflict against a permanently closed live ledger.
For active rounds, the existing scored-ledger comparison remains unchanged.

### Audit and size

Move compact local audit/version data into IndexedDB, with only small references
in hot state. Shared-round authoritative history also lives in the dedicated server
version/audit store. This is specific amendment persistence, not the deferred general
cloud archive or a migration of all old rounds.

Audit retains proposed/final values, field/player/team/hole identifiers, source and
decision times, actor, reason, financial choice, version links and receipt. Deduplicate
batch headers; do not keep two full upload payloads per resolved score. Resolution
must never mean silent destruction of the rejected-score fact.

The 72-score test measures an initialized empty outbox, preservation growth, and
return to the same empty-outbox size after resolution. Report IndexedDB/cloud audit
bytes separately. **All-origin storage cannot return to zero-growth baseline while
also retaining an audit locally.** Large active payload growth is bounded by unresolved
work; immutable audit has an explicit separate lifecycle and storage budget. Any
future pruning/export policy requires another explicit decision, never a silent cap.

Add a persistent, non-blocking pressure notice with pending/review counts, estimated
bytes and a direct review action. Proposed configurable soft thresholds: 256 KiB
for delivery/review payloads or 2 MiB for total localStorage, including backup keys.
These are conservative warning thresholds, not claims about browser quota. Tune
against measured fixtures before release. Never auto-discard operations, block saving
just because a warning appears, or present origin-wide quota estimates as exact
localStorage headroom. Actual save failure retains the existing recovery behavior.

## 10. Legacy compatibility and recovery

- Do not migrate every saved round on startup or duplicate all frozen history in
  primary localStorage. Register/import a legacy baseline only when an amendment
  is requested, with owner approval and stable content hashes.
- If the original frozen record is missing or host/cloud baselines disagree, block
  publication and explain the mismatch. Do not regenerate today's scores and label
  that reconstruction the original reported version.
- Keep original data until baseline registration and local recovery are durable.
- Extend backup/export and restore to include amendment versions, receipts, audit,
  pending review evidence and drafts across both local stores. Validate hashes and
  references in staged recovery before replacing usable data. Continue accepting
  old-format backups. A local-only amendment cannot depend on cloud recovery, and
  exporting only the old primary JSON is not a complete backup of the new feature.
- Older clients must not overwrite canonical version heads or newer reports via
  legacy metadata writes. Require compatible clients before enabling shared amendment
  publication. Offline old clients may still display a historical cached report;
  instructions must not promise automatic replacement of those copies.
- Amendment draft failure does not stop ordinary scoring or original Ledger access.
- Rollback disables new publication while retaining review packets, receipts,
  histories and versions. It must not reset the head or drop tables. A rolled-back
  client that cannot understand revisions must not publish legacy replacements.

## 11. Implementation milestones and approval boundaries

| Milestone | Deliverable | Exit gate |
|---|---|---|
| 0 — Design approval | This plan and its financial/authority decisions | Owner agreement; no application edits |
| 1 — Contract and calculation proof | Version/draft/financial contract, legacy baseline examples, canonical-engine draft proof, narrow schema/rollback proposal | Demonstrate original immutability, sticky waivers, supported historic rules and server financial validation |
| 2 — Local workflow | Review UI, draft amendments, compact audit, pressure handling, local-round publication | Reload/crash/storage and read-only-history tests |
| 3 — Shared staging | Explicit review queue, owner approval, atomic publication, receipts, canonical version parity | Real Supabase roles, same-account devices, cache/offline/concurrency and rollback rehearsal |
| 4 — Release candidate | Versioned client, revised Ledger/Story, complete gates and two-phone checklist | All automated gates plus physical acceptance |
| 5 — Production | Fresh full-schema preflight, backup, approved additive deployment and compatible clients | Separate explicit production approval; monitored acceptance |

Prepare reviewable code and SQL locally/staging before requesting production approval.
Do not expose an enabled but non-publishing shared accept button as a finished feature.
Do not automatically assign more release numbers; if the version-integration or schema
work proves too large for one focused release, bring back a proposed split first.

## 12. Planned files and impact areas

- `app.js`: review entry points, version-aware record selection, publication/recovery,
  canonical parity and pressure messaging; retire the settled-round reopen route
  for this workflow. Keep ordinary Play collection and saving behavior intact.
- `index.html` / presentation styles: compact review, amendment preview, financial
  choice and version history; comfortable touch targets and larger text support.
- Focused amendment-domain and persistence modules: deterministic version/financial
  logic, audit storage, receipt handling and service contracts. Keep them separate
  from the large application controller where practical; no general refactor.
- `ledger-report/*`: version-bound artifact transfer, Revised Ledger disclosure and
  separate competitive/financial presentation; current references remain frozen.
- Future reviewed Supabase proposal/rollback and staging fixtures: review/version
  authority, closure compatibility and atomic publication. No production execution
  follows merely from creating these files.
- Behavioral unit/browser/SQL tests; new revised-report fixtures and current-reference
  regression checks; release/cache/branding metadata, build notes and context docs.

Exact filenames beyond existing sources are finalized after milestone 1, not invented
as if the server/version integration were already proven.

## 13. Verification and definition of done

Required behavioral checks, with no source-text assertions substituting for behavior:

1. Preserve, reload and reopen 72 remote scores; display the actual values and provenance.
2. Send explicitly, lose the response and retry: one submission, unchanged payload.
3. Test owner, participant, guest and outsider access, including two devices on one
   account. No client-only control grants publication authority.
4. Accept/discard individually and in bulk; team pairs remain consistent. Reasons
   and rejected original facts remain auditable. Mixed batches clear only resolved IDs.
5. Resolve 72 records: exact live-outbox baseline returns, compact audit remains
   queryable and its separate size is reported.
6. Freeze/deep-freeze/hash the original record and original accepted report. Accept
   a correction and assert both remain byte-identical, with a new version instead.
7. Correct winners, card-offs, all Flamtana components, recorded presses and cent
   splits under saved rule policies. Corrected totals and agreed money reconcile.
8. Exercise adjust/keep choices and repeated amendments, including a waiver followed
   by a later adjustment. No double charging, revived waiver or fabricated cash payment.
9. Change the base from another owner device during preview: publication rejects
   the stale draft; a replay of an already committed request still returns its receipt.
10. Inject crashes/auth loss/quota failure at every receipt/cleanup boundary. Original
    reports remain available; pending evidence is never lost; other rounds keep syncing.
11. Resolve a discarded different score: version parity can confirm without writing
    the discarded value to the closed live ledger. Missing/different version hashes
    stay unconfirmed. Active-round parity retains its old behavior.
12. Bind Story/preview/accepted PDF to the correct version. Reject stale callbacks;
    preserve original Story/PDF. Verify revised financial disclosures at phone widths,
    larger text and print/PDF output without degrading existing references.
13. Pressure notice appears at injected warning thresholds before a later injected
    save failure. No truncation, silent pruning or mandatory browser-data clearing.
14. Legacy baseline import, downgrade blocking, service absence, schema-cache lag,
    direct/RPC closure compatibility and non-destructive rollback behave as specified.
15. Export and restore an amended local-only round into an empty isolated test store;
    versions, original/revised reports, audit and unresolved evidence survive. Test
    older backups, interrupted restoration and cold/offline version hydration without
    a silent fallback to a falsely labeled current report.

Run `npm test`, lint, validate, layout, release sanity, simulation comparison,
simulation tests and the full 50-round Flamtana stress harness. Compare unchanged
unamended fixtures with .78 and add independent amendment/financial oracles. Retain
the permanent direct and RPC transport suites. Report actual numbers, skips,
reference page counts and per-store bytes; do not claim the simulation mirror
exercises Flamtana. Real Supabase and physical two-phone acceptance are separate gates.

## 14. Constitutional review and final approval

Directly affected: principles 2/5 (owner authority), 6/8/10 (immutable history),
11/12 (authorized Amendment Sessions), 15/22 (round/event finality), 18/19
(identity and independent lifecycles), 23 (privacy, preservation and deletion).

The proposal implements versioned amendment rather than in-place editing. It does
not change identity ownership, remove historical participation or automatically
amend a linked finalized event. Review payload visibility is scoped; sharing is
explicit. Original facts, reports and decisions are retained, while disposable
delivery copies are cleared only after durable audit acknowledgement.

No constitutional amendment is proposed. Potential conflicts would arise if ordinary
reopen/reset were reused, owner authority remained client-only, history were pruned
silently, waived money were reinstated, or Event Records changed implicitly. These
are explicit rejection criteria for implementation.

**Owner decisions requested:** approve the amendment/version model; the two financial
choices and persistent-waiver rule; explicit separate cross-phone review queue with
owner-account authority; separate compact audit storage and hot-outbox size target;
the owner-approved competitive snapshot trust model; and the gated schema/calculation
proof before implementation expands.

Plan approval authorizes the agreed development scope, not production SQL, deployment,
commit, merge or external message distribution. This document is the only requested
artifact at this stage; no application or database implementation has begun.
