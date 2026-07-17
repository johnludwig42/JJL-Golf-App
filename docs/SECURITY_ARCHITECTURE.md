# Security Architecture

## Course Library contract

The app remains local-first. Public cloud access is a convenience catalog, not a prerequisite for scoring. Approved courses are publicly readable. Cloud drafts are private to an active permanent user. Anonymous Auth users receive no draft-write privilege.

The identities are deliberately separate: Supabase Auth user, local device, golfer/player, and Shared Match participant. A golfer is not automatically an Auth user. v30.3.75A does not add login or change Shared Match.

`courses.owner_user_id` owns drafts. Tees and holes inherit authorization through `course_id`; ownership is not duplicated. Hole policy additionally proves `tee_id` belongs to the same course. Owners cannot change ownership, approve a course, or edit canonical rows.

`course_library_roles` is a narrow, protected authorization bridge for this staged release. It has RLS with no browser policies. Permanent-user detection also rejects trusted JWTs where `is_anonymous` is true. v30.3.75B must reconcile it with the final beta identity model before deployment.

Maintainers publish only through `publish_course(text)`, a narrowly granted security-definer function that performs its own protected role check. Maintainer authority is never read from user-editable metadata. Broader administration remains out of scope.

## Minimum schema decision

| Field | Definition | Migration/security purpose |
|---|---|---|
| `owner_user_id` | Nullable UUID FK to `auth.users`, default `auth.uid()` | Null for canonical legacy rows; permanent owner for drafts |
| `publication_status` | Non-null text with constrained values; default `draft` | Separates public approved rows from private drafts |
| `source` | Non-null constrained text; default `user` | Deterministically identifies the legacy backfill and restricts owner writes |
| `approved_by` | Nullable UUID FK to `auth.users` | Records the protected principal that published a draft |
| `approved_at` | Nullable timestamp | Records when protected publication occurred |

`created_by` and `updated_by` were rejected because `owner_user_id`, existing timestamps, and the protected publication record provide the authorization/audit data required in this pass. General audit history is not an RLS prerequisite. An enum was rejected because a constrained text column is simpler to extend and roll back during the staged beta. Ownership columns on children were rejected because duplication creates inconsistent authority.

## Maintainer options considered

| Model | Assessment |
|---|---|
| Protected maintainers table | Secure and testable, but a single-purpose boolean table alone duplicates future identity state |
| General role table | Flexible but too broad for this pass |
| Service-role Edge Function only | Strong boundary, but adds deployment/runtime burden and unavailable source to this repository pass |
| Protected table plus narrow security-definer function | Selected: small, locally testable, no secret in the browser, and direct canonical DML remains denied |

The selected function has an explicit authorization check, empty `search_path`, restricted execution grants, and a single publication operation. The protected role table cannot be read or written through browser policies. Security-definer code requires review whenever changed because mistakes can elevate privileges.

Final review pins all three security-definer functions to the trusted `postgres` owner and an empty `search_path`; every object reference inside them is schema-qualified and no dynamic SQL is used. `publish_course` is revoked from PUBLIC and `anon`, granted to `authenticated`, and still rejects every non-maintainer from protected database state. Repeating publication after success safely raises “draft course not found” and performs no additional mutation.

The boolean permanent-user helper is executable by `anon` because it appears in the shared SELECT policy, but it exposes only the caller’s own authorization result. The maintainer helper is not directly executable by browser roles; the authenticated publisher invokes it under trusted function ownership. The publisher is not executable by `anon`. None of the functions trusts user metadata.

Course Library grants are explicit: PUBLIC has no table privileges; `anon` has SELECT only; `authenticated` has SELECT/INSERT/UPDATE/DELETE subject to RLS. `course_library_roles` grants are revoked from PUBLIC, `anon`, and `authenticated`. The protected table has RLS enabled with no browser policies. `service_role` and `postgres` retain their normal administrative/bypass behavior and must never be used by browser code.

`FORCE ROW LEVEL SECURITY` is deliberately not enabled. The narrowly reviewed security-definer publisher and trusted migration/incident administration require the table owner’s normal bypass. Browser roles do not own the tables and cannot bypass RLS. This decision must be revisited if function ownership or deployment roles change.

The entire forward migration is one PostgreSQL transaction. Preflight runs before schema or access changes; any later constraint, function, policy, grant, or postflight failure rolls back RLS, policies, functions, indexes, columns, and backfill together. No statement in the migration requires non-transactional execution.

## Actual application access

All access is in `app.js`. `loadSupabaseCourses` selects all courses, tees, and holes. `findCloudCourseRow`, `syncCourseToSupabase`, and `syncCourseLibrary` also select courses/children for reconciliation. `insertOrUpdateCloudCourse`, `insertOrUpdateCloudTee`, and `insertOrUpdateCloudTeeHoles` use separate inserts or partial updates; no upsert, RPC, Realtime, direct REST fetch, or database batch call is used.

The parent course is written before tees, and each tee before its holes. Existing holes are updated by ID after matching on hole number; missing holes are inserted. Normal sync does not delete/recreate children. `deleteCloudCourseById` explicitly deletes holes, tees, then course, although foreign keys also cascade. Database IDs are text and are generated by database defaults for new browser inserts; existing local/cloud IDs are retained for updates.

Course calls use `ensureSupabaseClient({ anonymousAuth: false })`: they do not initiate Anonymous Auth and can operate with only the publishable-key `anon` role, but reuse any session already created elsewhere. The app assumes all cloud rows are readable. Local state is saved first; failures mark the course `pending-sync`, preserve it locally, show a failure/local-only status, and retry through pending sync. Cloud denial therefore does not block local scoring or mutate immutable Round Course Snapshots.

## Secrets

- A publishable/anon key is intended for browser initialization and is not an administrative secret.
- `sb_secret` and `service_role` keys bypass normal browser trust boundaries and must remain server-only.
- Database credentials and signing/private keys must never enter browser assets or Git.
- Edge Function secrets belong in the Supabase secret store, not JavaScript or `.env.example`.

Enable GitHub secret scanning and push protection, and add CI Gitleaks or TruffleHog scanning in the release-hardening pass. Repository files do not prove those external settings are enabled.
