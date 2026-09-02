# v31.0.29 — Course Approval Reliability

## Summary

- Repairs Course Library approval for UUID-backed course IDs.
- Validates that a draft has tees, complete 9- or 18-hole tee data, and no duplicate tee name/gender identities before approval.
- Keeps a failed approval visible and retryable instead of hiding the approval action.
- Displays and retains the actual approval error so a remaining database or data problem can be diagnosed.
- Detects when a cloud draft contains fewer tees than the preserved local course and schedules a repair upload before approval.
- Prevents approval while the cloud draft is known to be incomplete.
- Identifies already-approved cloud courses that contain fewer tees than the preserved device copy and keeps the missing tees recoverable.
- Allows a protected cache row to re-enter the repair upload path only after a maintainer explicitly returns that course to Draft.
- Leaves course, tee, and hole data unchanged when approval fails.

## Database migration

Run `supabase/migrations/202609020002_v31_0_29_course_approval_reliability.sql` before deploying the application.

## Verification

- Focused approval reliability and database safety tests.
- Prior Course Library status, tee identity, import, and security regressions.
- Complete application tests, lint, release validation, release sanity, simulations, and Ledger Entry layout acceptance.
