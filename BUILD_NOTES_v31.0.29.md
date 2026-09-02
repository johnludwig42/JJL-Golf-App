# v31.0.29 — Course Approval Reliability

## Summary

- Repairs Course Library approval for UUID-backed course IDs.
- Validates that a draft has tees, complete 9- or 18-hole tee data, and no duplicate tee name/gender identities before approval.
- Keeps a failed approval visible and retryable instead of hiding the approval action.
- Displays and retains the actual approval error so a remaining database or data problem can be diagnosed.
- Leaves course, tee, and hole data unchanged when approval fails.

## Database migration

Run `supabase/migrations/202609020002_v31_0_29_course_approval_reliability.sql` before deploying the application.

## Verification

- Focused approval reliability and database safety tests.
- Prior Course Library status, tee identity, import, and security regressions.
- Complete application tests, lint, release validation, release sanity, simulations, and Ledger Entry layout acceptance.
