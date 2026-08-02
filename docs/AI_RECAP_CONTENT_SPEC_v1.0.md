# The Dye Ledger AI Recap Content Specification v1.0

The machine-readable authority is `supabase/functions/round-recap/content-spec.json`. This document explains its product and historical-record boundaries.

## Authority and factual precedence

Deterministic Round facts are binding. Scores, completed holes, handicaps, Featured Competition status, game results, settlement, and tracked-stat facts override conflicting notes, Memories, or generated prose. The generator may omit unsupported sections but must never fill gaps by inference.

Every saved Memory is a high-intent contributor fact and must be materially represented. Round Notes supply voice and context but cannot alter authoritative outcomes. Weather is optional context and is mentioned only when supplied and useful.

## Output contract

Recaps are substantive but mobile-readable, warm, specific, and golf-aware. When enough supported facts exist, the target is 650–850 words with an absolute ceiling of 900; fact-light rounds stay shorter rather than being padded. Supported sections are optional. The Featured Competition leads the competitive narrative when selected. Low Gross, Low Net, game winners, money winners, and awards remain distinct concepts.

Incomplete rounds state the completed-hole count and do not imply that unplayed holes occurred. Money and unresolved games remain provisional unless the supplied finality state is final. Untracked statistics are omitted.

When Stat Tracking is enabled and a player has at least three completed tracked holes, the recap includes an individualized improvement opportunity grounded in supplied evidence. It states relevant counts or rates and the sample size. A single-round observation is framed as a possible next-round or practice focus, not a diagnosis or causal conclusion. Fairway-conditioned GIR may distinguish approach results after a fairway hit versus miss when the underlying opportunities exist. The recap never invents swing mechanics, club selection, physical limitations, or intent, and omits coaching when eligible evidence is absent.

## Privacy and sensitive content

The recap payload must exclude account credentials, OTPs, email addresses, phone numbers, device identifiers, private diagnostics, and secrets. Sensitive notes are treated neutrally and are not amplified into allegations, diagnoses, shame, or conclusions about protected traits, health, intoxication, private disputes, law, or finances.

## Lifecycle

Generated output is always a draft. The user may edit and must explicitly accept it. Acceptance controls local presentation in Match Summary and exports. If the RoundRecord was already frozen, acceptance does not mutate that historical record or masquerade as an amendment. Authoritative post-freeze publication requires an Owner-authorized Amendment Session, attribution, reason, impact classification, and a preserved prior version.

## Compatibility

Legacy local recaps remain readable. They are not silently revalidated, regenerated, uploaded, rewritten, or deleted. The v1.0 validator applies when generating or accepting a recap in v30.3.84.

Until the repository candidate is separately approved and deployed, the client also transmits a compatibility instruction summary for the unknown live function. That summary is subordinate to this specification and can be removed after a verified server rollout.
