# v30.3.97 Constitutional Review

## Scope

This release repairs the client side of initial Shared Match admission. It does not modify the production schema or policies.

## Principles implemented or affected

- **Principles 1–5 — Identity and Ownership:** Account authentication authorizes cloud admission without equating Account, Golfer Identity, Device, Owner, Participant, or scoring assignment.
- **Principles 6–12 — Historical Record and Governance:** No RoundRecord or historical fact is rewritten. The change preserves attributable, policy-governed access.
- **Principles 16 and 18 — Enduring Identity and Independent Concepts:** Email and Device identifiers remain mutable attributes rather than canonical identity keys. Membership admission does not create an attribute-based identity merge.
- **Principle 23 — Privacy and Preservation:** Least privilege is retained; the fix does not broaden anonymous or authenticated direct table writes.

## Compliance conclusion

The secure `join_shared_match` RPC remains the only initial admission authority. Removing the redundant client insert resolves the observed RLS failure without weakening policy. Existing local and cloud records remain preserved, and there is no constitutional conflict.
