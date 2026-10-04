# The Dye Ledger v31.0.47 — Approved Course Revision

## Behavior

- Course Library maintainers see **Revise Approved Course** beside approved catalog courses.
- Confirmation explains that the course returns to Draft under the maintainer's Account and is unavailable for new public catalog downloads until reapproved.
- A server-confirmed revision enables existing local course/tee editors. Use **Publish Local Changes**, then **Approve** when corrections are complete.
- Course/tee/hole IDs and content remain intact during the status transition. Existing round snapshots are not changed.
- Ordinary accounts cannot revise approved courses. Failed or unavailable server requests never optimistically unlock the course.

## Deployment and permissions

Apply `supabase/migrations/202610040001_v31_0_47_course_revision.sql` through the reviewed deployment process before releasing the app. It adds one maintainer-only function; no tables or columns change. Production has not been changed by this implementation.

Existing atomic publishing accepts only an Account's own user draft. Revision therefore transfers draft ownership to the authenticated maintainer and changes its source to `user`; previous approval attribution remains until reapproval. The maintainer must also have draft-publishing permission. No permissions are granted by this release.

Rollback revokes new revision calls without deleting courses or undoing drafts already opened. Reapproval uses the existing validated approval function. No payment-tracking or unrelated UX changes.

## Verification

- Focused tests cover authorization, confirmation responses, missing server deployment, failures, pending-edit preservation, and reapproval protection.
- Verified: 56 course-related tests passed; 127 scoring scenarios had zero failures and zero live/mirror differences; release validation passed; lint reported zero errors and 88 warnings in existing code paths.
- Revised courses with pending local corrections cannot be approved before publishing those corrections.
- Server SQL is reviewed but needs execution/permission acceptance in an approved test environment before production deployment.
- Manual acceptance: maintainer revises a synthetic approved course, changes a tee, publishes, reapproves, then verifies a non-maintainer cannot revise and a prior round remains unchanged. Check small-iPhone and desktop layouts.
