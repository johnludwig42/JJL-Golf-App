# v31.0.27 — Course Tee Gender Sync Integrity

## Summary

- Persists tee gender in the cloud Course Library.
- Treats course, tee name, and gender as the complete cloud tee identity.
- Preserves same-named men's and women's tees as separate records.
- Rejects ambiguous local duplicate tee identities before publishing.
- Verifies distinct tee count and complete hole coverage inside the atomic database transaction so any mismatch rolls back.
- Safely repairs existing Account-owned drafts, including Promontory Nicklaus and Promontory Dye, when they are republished after the migration.
- Retains local recovery copies until post-publish verification succeeds.

## Deployment order

1. Run `supabase/migrations/202609020001_v31_0_27_course_tee_gender_identity.sql` in the Supabase SQL Editor.
2. Deploy the v31.0.27 application.
3. On the authoritative device, choose **Publish Local Changes**.
4. Confirm both Promontory courses no longer show **Needs Attention** and that another device downloads all expected tees.

## Verification

- Focused seven-tee, gender-identity, collision, transaction, and rollback tests.
- Complete Course Library and application test suites.
- Lint, release validation, release sanity, simulation comparison, and Ledger Entry layout acceptance.
