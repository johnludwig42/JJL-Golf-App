-- Run only on the freshly created, specifically guarded local review database.
\set ON_ERROR_STOP on
\ir fixture.sql
select set_config('dye.shared_rpc_review_authorized','reviewed-install',false);
\ir ../../proposals/shared-score-rpc-v31.0.77/install-review.sql
\ir contract.sql
\ir rollback.sql
