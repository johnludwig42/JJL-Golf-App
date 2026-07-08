The Dye Ledger Release Workflow

Version 1.0

Purpose

This document defines exactly how production releases are performed.

Every release should follow the same predictable process.

Pre-Codex Release Checklist

Before Codex begins work on a release, the Product Owner must verify:

1. Previous release committed.
2. Previous release pushed.
3. Previous release merged.
4. Local repository synchronized with main.
5. Working tree clean.
6. Create the next release branch before launching Codex.
7. Verify the active branch in GitHub Desktop.
8. Start Codex only after confirming the correct release branch is active.
9. Codex does not commit automatically.
10. Product Owner reviews changes.
11. Product Owner commits.
12. Product Owner pushes.
13. Pull Request is created.
14. Pull Request is merged.
15. Production acceptance testing is performed.

This checklist exists to prevent branch confusion, prevent merge conflicts, keep each release isolated, maintain clean release history, and make Codex safer and more predictable.

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
