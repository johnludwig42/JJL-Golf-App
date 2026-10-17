# v31.0.74 — Flamtana Event Options

Approved event changes, based on clean committed v31.0.73 (931b79a), on
codex/v31.0.74-flamtana-event-options. No commit, push or deployment performed.

- New Flamtana rounds use saved scoring policy 3. Both devices need this update;
  earlier clients reject the unsupported policy rather than calculate old payouts.
- Select The Big Game, either group contest independently, foursome versus
  foursome, and Calcutta. At least one is required. Disabled contests contribute
  zero and are omitted from public standings, settlement, report and AI facts.
- The Big Game replaces Featured for new rounds. First/second percentages default
  to 70/30, are editable, must total 100%, and accept at most two decimal places.
  Setup previews the pool and dollar allocations. Integer percentage basis points
  and cents avoid floating-point half-cent errors; all allocations reconcile exactly.
- A tie for first splits the whole pool across winning teams; no second prize.
  An outright winner gets the first allocation; tied runners-up share second.
  New-round scoring contests split ties without card-off. Off-low scoring remains.
- Calcutta defaults to $15 per golfer ($120). Its existing per-winning-team pool
  share/backer distribution and unbacked-partner fallback remain unchanged. It is
  independent of Big Game prize percentages and can be selected without its buy-in.
- Existing rounds retain policies 1/2 and frozen records remain immutable. Setup
  choices/stakes/percentages lock at Start. No identity, cloud or SQL changes.

## Constitutional review

Proposal: Flamtana Event Options; owner: John; authorized in this conversation
on October 17, 2026 after review of first/second ties and Calcutta preservation.

Principles 6–8 and 10 (authoritative RoundRecord, round facts and versioned history)
are directly affected: configuration and prize evidence are saved with the round;
legacy policies remain distinct and completed records are never rewritten.
Principles 15 and 22 (competition ownership/finality) are directly implemented by
round-owned options fixed at Start and finalized in that round's frozen record.
No change to identity, device/account ownership, roles, historical participation,
privacy, access, deletion or Event Record finality. No Amendment Session needed for
new-round options. No constitutional conflict identified.

## Verification

- Ten new behavioral tests cover setup, exact percentage rounding, first/second
  ties, all 31 nonempty selections, 50 independently calculated event rounds,
  saved/reloaded history, selected Scoreboard columns and actual report rendering.
- New-policy PDF stress: 50/50, all 31 selections represented, alternating desktop
  and iPhone print user agents, 4–9 pages with no measured overflow. Separate
  Big Game/group-only/Calcutta-only browser acceptance passes. New layouts reserve
  print headroom and keep handicaps after the opening scoring graphic.
- Two isolated browser devices pass create/join, all-eight assignment, Start,
  opposite-order 18-hole scoring, 144-row parity, exact pool/transaction checks,
  freeze, remote closure to Create/Join and normal mobile Ledger export (8 pages).
  This uses an in-memory API test double, not live production service or phones.
- Legacy policy-2 stress: 50/50. Every component's money, payments, settlement
  players, picks and complete evidence remain byte-identical to the .70 baseline.
  Page ranges: split 7–8; Hole 18 8–10; back nine 7–8; last six 8–10.
- Layout 7/7, 46 pages: Flamtana 7, general reference 8, Nine-Point 5,
  iOS reference 11, Sixes points 5, Sixes 5, Wolf 5. All original reference text
  and page counts match; original PDF bytes retained against timestamp churn.
- Lint: 0 errors, 88 existing warnings. Validate passes. Release sanity:
  6 pass, 3 development warnings, 0 failures. Simulation comparison: 77/77 exact,
  0 differences/failures, 61 warnings and 1 suspicious outcome; simulation tests
  4/4. Flamtana remains outside the deferred simulation mirror; its dedicated
  coverage is above.
- An initial full-suite run was 1,437/1,438: compact legacy Group 1/Group 2
  header expectations failed. Compact labels were restored and focused browser
  regression passed. Final full suite: **1,439/1,439 pass**, 0 failures/skips (508.6 seconds).

Install this version on both phones and create a new round. Physical iPhone,
provider authentication and live-service acceptance remain user checks. No
production data was written during verification.
