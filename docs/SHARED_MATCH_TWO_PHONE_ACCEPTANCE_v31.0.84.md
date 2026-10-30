# v31.0.84 — physical two-phone acceptance

Status: NOT_RUN. Requires a separately approved, phone-accessible staging website
using staging project darbakmabpbkikisadop. Do not use production for this test.
Both phones must show v31.0.84. Use clearly named synthetic golfers/rounds.

1. Host creates a new Flamtana round. Remote signs in and joins. Assign both
   foursomes and all eight golfers; keep T1/T2 on host and T3/T4 on remote.
2. Score the first holes from the assigned phones. Compare team gross values and
   save status. A green contact indicator alone does not prove score delivery.
3. Disconnect remote. Enter its own team correction while offline. Lock/wake and
   reload once; confirm its saved correction and pending count survive.
4. Host takes over a different remote-owned team/hole. Reconnect remote; confirm
   its own pending correction survives, the host correction arrives, both partners
   agree and neither phone replays an untouched old field when changing holes.
5. Complete 18 holes across both phones, including another lock/wake/reconnect.
   On both Match panels require zero pending holes, Ready retry and Confirmed
   card parity. Verify gross scores and wager totals agree. Resolve any Pending
   pair by deliberately re-entering its team score; do not silently choose a value.
6. Host completes the round. Confirm remote exits to Match → Create/Join without
   dropping unsent facts. Review/save Story, open Ledger, check results and Accept
   & Finalize. Confirm accepted/frozen status survives reload. Previously completed
   rounds must retain their original results.
7. Record phone models, OS/browser versions, installed build, staging URL, round
   code, scores/totals, contact/delivery/parity evidence and any failure. Record
   AI service failure/facts-only fallback honestly. Never send passwords/tokens.

Any lost score, unexpected overwrite, unequal partner resolution, changed frozen
record or inability to confirm required parity fails acceptance. Preserve evidence
and stop; do not delete the round or re-enter scores just to make the test green.
