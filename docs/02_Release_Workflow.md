The Dye Ledger Release Workflow

Version 1.0

Purpose

This document defines exactly how production releases are performed.

Every release should follow the same predictable process.

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
