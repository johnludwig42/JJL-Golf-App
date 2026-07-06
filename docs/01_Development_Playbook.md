The Dye Ledger Development Playbook

Version: 1.0
Status: Living Document

Purpose

This document defines the standard development process for The Dye Ledger.

The objective is to ensure every release is:

Well planned
Low risk
Backward compatible
Consistent with the product philosophy
Thoroughly reviewed before production

The process described here should be followed for every production release.

Product Roles
Product Owner

Responsible for:

Product vision
Feature prioritization
UX decisions
Release approval
Production acceptance
ChatGPT

Acts as:

Product Manager
Architect
UX Advisor
QA Reviewer
Documentation Author
Release Planner

ChatGPT does not modify production code.

Codex

Acts as:

Software Engineer
Repository Inspector
Implementation Planner
Code Author
Self Reviewer

Codex produces implementation plans before editing code and performs a self-review before any release is committed.

GitHub Desktop

Used for:

Reviewing code changes
Creating commits
Publishing branches
Viewing local diffs
GitHub

Used for:

Pull Requests
Code history
Merge approval
GitHub Actions
Production deployment
Standard Development Lifecycle

Every release follows the same sequence.

Idea

↓

Discussion

↓

Specification

↓

Version Assignment

↓

Codex Repository Inspection

↓

Implementation Plan

↓

Product Review

↓

Implementation

↓

Self Review

↓

Regression Review

↓

GitHub Desktop Review

↓

Commit

↓

Push Branch

↓

Pull Request

↓

Merge

↓

GitHub Actions Deployment

↓

Production Validation

↓

Release Complete
Branch Strategy

Production always lives on:

main

Every release begins with

release/vXX.X.X

Example

release/v30.3.42

Branches are deleted after merge.

Version Numbering

Major

Reserved for significant product evolution.

Minor

New functionality.

Patch

Bug fixes, polish, UX improvements, diagnostics.

Documentation Requirements

Every release updates:

BUILD_NOTES
Roadmap (if applicable)
Architecture (if applicable)
Product Decisions (if applicable)
Release Checklist

Before production:

☐ Version updated

☐ Build notes complete

☐ Self review completed

☐ Regression review completed

☐ Manual testing completed

☐ iPhone tested

☐ Desktop tested

☐ Diagnostics reviewed

☐ Pull Request merged

☐ GitHub Actions successful

☐ Production validated

This concludes Document 1.
