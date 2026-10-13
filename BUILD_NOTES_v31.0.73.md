# v31.0.73 — Shared Match Sign-In Recovery

John confirmed that signing back into the host account resolved the .71/.72 finish
loop, then requested a prompt if this recurs. Started clean from committed .72
(cd145a1); branch codex/v31.0.73-shared-sign-in-recovery. Other event-freeze limits
remain in effect. No server, SQL, scoring, settlement or frozen-record changes.

- Before host publishing/retrying queued scores, verify the existing permanent
  account requirement. Missing/guest host sessions produce SHARED_SIGN_IN_REQUIRED
  before any writes. This implements the server's existing owner requirement;
  participant/guest permissions and identity storage keys are unchanged.
- Persistent Play/Scores notice links directly to Account & Security and provides
  Sync Now for the same saved round after login, including completed review.
  Background errors do not move focus; explicit failure draws attention to the
  notice. An unfinished visible entry must be saved before changing screens.
- Authentication errors get sign-in guidance. A signed-in account denied access
  gets separate account/access guidance; network errors keep connection guidance.
- Access-blocked parity stays unknown/unconfirmed rather than synthesizing 144
  missing scores. Complete Round stops with the recovery prompt rather than a
  generic retry loop. No local scores/outbox operations are discarded or rewritten.
- Sign-in-required outbox delivery pauses until recovery. A verified account retry
  resumes delivery; successful sync removes the notice and recomputes parity.

## Verification

Five focused behavioral cases pass: missing/guest host identity, valid account
recovery, error classification, preserved scores/parity, browser
finish→Account→sync→finish and a permanent but unauthorized account. Phone widths
320/375/430, 32px text and 44px targets pass.

- Lint: 0 errors, 88 existing warnings. Validate passes. Release sanity: 6 pass,
  3 development warnings, 0 failures.
- Simulation comparison: 77/77 exact (27 fixtures + 50 random), 0 differences or
  failures, 55 warnings, 1 suspicious outcome. Simulation tests: 4/4. Flamtana's
  simulation-mirror gap remains deferred; its independent stress coverage is below.
- Flamtana stress: 50/50 policy-2 rounds and reports pass. Games, payments,
  settlement-player data, picks and complete evidence are byte-identical to the
  .70 off-low baseline for all cases. Engine and final settlement are unchanged.
- Layout: 7/7, 46 total pages. All seven PDF page counts and extracted text are
  unchanged; original PDF bytes retained to avoid timestamp-only churn.
- Full regression suite: **1,429/1,429 pass**, 0 failures/skips (523.3 seconds).
  Historical source-only checks were
  corrected without changing story behavior; executable story review/save tests
  retain coverage of the required-fact normalization introduced in .72.

Actual iPhone sign-in/OTP and live-service acceptance remain separate from local
browser/API-test-double verification. No commit, push or deployment performed.
