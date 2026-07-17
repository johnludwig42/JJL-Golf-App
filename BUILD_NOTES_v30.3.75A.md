# v30.3.75A — Course Library Security Foundation

Prepared a review-only forward migration, two-stage rollback, real PostgreSQL policy-test harness, static package contracts, secret-hygiene baseline, and focused security/deployment documentation.

No authentication UI, beta analytics, Shared Match changes, Course Library UX redesign, production migration, or live Supabase operation is included. The package remains uncommitted and requires disposable-database execution plus v30.3.75B identity integration before the v30.3.75E production gate.

Final review added explicit Data API grants, policy-join indexes, trusted function ownership, expanded privilege-escalation tests, a Stage 1 rollback/reapply probe, and a runner that rejects the production project reference. Standalone disposable PostgreSQL is the executable primary test environment; real SQL execution remains pending. Production Supabase and its unresolved Security Advisor finding were not changed.
