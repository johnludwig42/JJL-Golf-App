The Dye Ledger Release Workflow

Version 1.0

Purpose

This document defines exactly how production releases are performed.

Every release should follow the same predictable process.

Pre-Codex Release Checklist

Before Codex begins work on a release, the Product Owner must verify:

1. Prior release committed.
2. Prior release pushed.
3. Prior release merged into main.
4. Local main synchronized with origin/main.
5. Working tree clean.
6. No unmerged paths.
7. Next release branch created from updated main.
8. Active branch verified in GitHub Desktop.
9. Prior release build notes exist.
10. Version baseline verified.
11. Codex started only after branch verification.

This checklist exists to prevent branch confusion, prevent merge conflicts, keep each release isolated, maintain clean release history, and make Codex safer and more predictable.

Post-Codex Review Checklist

Before the Product Owner commits a release, verify:

1. No conflict markers.
2. No unexpected deleted files.
3. Expected files changed only.
4. Build notes created.
5. Version metadata updated consistently.
6. Validation suite run.
7. Failures documented honestly.
8. Simulation results reviewed.
9. Product Owner review completed before commit.
10. Commit only after review.
11. Push only after commit.
12. Pull Request only after push.

Branch Recovery Guidance

If Codex starts on the wrong branch:

1. Stop Codex.
2. Do not commit.
3. Inspect git status.
4. Stash or discard intentionally, never accidentally.
5. Switch to the correct branch.
6. Pull main if needed.
7. Recreate the release branch if needed.
8. Reapply work only from the correct baseline.

Merge Conflict Guidance

Never commit conflict markers.

Search for conflict marker text such as the opening marker made of seven less-than signs, the separator made of seven equals signs, and the closing marker made of seven greater-than signs.

Use the VS Code merge editor if available. Preserve the current target version metadata, preserve prior release functionality, and run validation after resolving conflicts.

Production Acceptance

A release is not fully accepted until it is deployed, opened live, the live version is verified, relevant smoke tests are run, and the Product Owner approves production behavior.

Phase 1

Product Planning

Discuss

Define scope

Assign version

Identify regression risks

Phase 2

Implementation Planning

Codex:

Inspect repository

Locate affected files

Identify risks

Produce implementation plan

No files are modified during this phase.

Phase 3

Approval

Product Owner reviews:

Scope

Approach

Files

Risks

Only after approval does implementation begin.

Phase 4

Implementation

Codex edits only approved files.

No unrelated refactoring.

No redesigns.

Backward compatibility preserved.

Phase 5

Self Review

Codex performs:

Static review

Regression review

Diff review

Validation

Known risks

Phase 6

Git Review

GitHub Desktop

Review every changed file

Review diff

Commit

Push branch

Phase 7

Pull Request

Open PR

Review

Merge

Delete release branch

Phase 8

Deployment

GitHub Actions

Deploy Pages

Verify production

Phase 9

Validation

Desktop

iPhone

Offline

Saved matches

Templates

Diagnostics

Competition

Reports

Statistics

Only after successful validation is the release considered complete.
