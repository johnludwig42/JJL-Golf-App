# WP-<id> — <title>

Status: Draft | Approved by John on <date> | Closed

- Release/version: <version, or none — docs only>.
- Branch: <name>.
- Starting revision: <full SHA>.
- Evidence folder: <explicit absolute shared evidence root; required, never inferred
  from an agent environment variable>. Confirm both agents can read this folder;
  per-package evidence is stored in its WP-<id> subfolder.
- Constitutional Review: <link, or not required: reason>.

## Objective

<The concrete problem and intended outcome.>

## In scope

<Exact files or areas and the behavior to change.>

## Exclusions

<Explicit exclusions, including adjacent issues not to fix.>

## Acceptance criteria

1. <Testable criterion and how it will be verified.>

## Required checks

<Commands and expected evidence. Include real-device/staging gates and their
prerequisites; an unavailable prerequisite means NOT_RUN.>

## Pre-authorized extras

<Additional checks or named service calls, or none. These do not waive the separate
approval provisions in workflow §16.>

## Approval boundaries

Follow [workflow §16](03_CODEX_WORKFLOW.md#16-actions-requiring-product-owner-approval).

Specific authorized actions under that section: <none, or each exact action,
branch/target, timing and John's authorization reference>.

## Data and compatibility risks

<localStorage, RoundRecords, Shared Match, settlements and SQL impacts, or none.>

## Handoff log

Follow [the handoff protocol](07_CLAUDE_CODEX_HANDOFF.md).

| Round | Fingerprint/evidence | By | Result | Findings |
| --- | --- | --- | --- | --- |
| <N> | <retained diff/manifest and hashes> | <agent> | <result> | <IDs> |

## Owner decision

<John's decision, exact authorized action/target if any, date and remaining risk.
Do not infer authorization from a review verdict.>
