-- Run only on staging after reviewed RPC rollback. All test actions roll back.
-- Reuse the previously verified direct cases; also require the RPC to be absent.
\set direct_only true
\ir closed-round-checks.sql
