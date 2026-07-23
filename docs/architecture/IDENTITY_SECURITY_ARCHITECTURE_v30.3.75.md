# Identity & Security Architecture — v30.3.75

## Domain boundaries

- Account is the Supabase Auth principal. Email OTP proves access to an address; email is not identity.
- Golfer Identity is a permanent UUID, claimed or unclaimed. Name, email, phone, GHIN, photo, and Device IDs are mutable and never merge keys.
- Personal Golfer Library is owned by an Account and links to a Golfer Identity. Adding another golfer does not confer ownership of that identity.
- A cloud Round has one Owner. Participant and Viewer are roles. Round Participation is a permanent historical relationship, not a role.
- Device identifies a working copy. Scoring assignment is a revocable capability tied to participation and Device; it is not ownership or participation.
- Provider links attach verified subjects to an Account. Later phone/social links do not replace Golfer Identity.

## Authentication and synchronization

The PWA requests and verifies a six-digit email OTP, restores its persisted session, and supports local sign-out. Invalid/expired codes receive generic feedback; resend is throttled for 60 seconds. Offline/service failures leave local scoring available. No OTP or token is logged.

Account authentication is disabled by default. Enabling it requires an explicit environment name and an exact `expectedProjectRef` match. Its Supabase client uses the dedicated `dye-ledger-account-auth-v1` storage key; legacy anonymous Shared Match auth retains its separate session. Anonymous Supabase users are never presented as Accounts, and Account sign-out does not sign out the Shared Match client.

Sign-in changes authentication state only. It never scans localStorage, uploads history, claims an identity, changes Shared Match identity, or writes courses/Rounds. New protected cloud ownership and writes require an authenticated authorized Account after migrations are separately approved and applied.

## RoundRecord and amendment contract

The cloud authoritative Round owns a monotonically numbered immutable version chain and current pointer. Every version preserves its predecessor and records actor, time, reason, and impact. Owner authorization is required to publish; Participants may propose corrections. The full UI/publisher is deferred.

The legacy local Reopen for Correction workflow remains unchanged and isolated. It must never overwrite a cloud version. Its replacement is an Amendment Session publishing a new version without reopening a completed Round.

## Threat model

Protected assets include identities, libraries, Round access, historical facts, amendments, audit attribution, and catalog authority. Threats include OTP abuse/enumeration, stolen sessions, attribute-based takeover, IDOR, role/capability confusion, record overwrite, anonymous catalog vandalism, and credential leakage.

Controls include generic errors, provider rate limits/CAPTCHA readiness, session refresh/local sign-out, UUID identity, no implicit merge, owner/member RLS, immutable version trigger, least grants, anonymous revocation, audit actor/device fields, and fail-closed test tooling. Service-role keys and database URLs never enter client code or logs.

Known transition risks: legacy Shared Match policies/anonymous bootstrap require a later protocol migration; public catalog read remains temporarily; live schema is unknown until inventoried; a compromised Device working copy is not authoritative merely because its user signs in.
