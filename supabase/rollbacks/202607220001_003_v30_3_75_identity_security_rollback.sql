-- TEST/STAGING ONLY. Data-preserving rollback: disable new access and retain all records.
revoke all on public.accounts, public.golfer_identities, public.personal_golfer_library, public.account_providers, public.devices,
  public.authoritative_rounds, public.round_access, public.round_participations, public.scoring_assignments,
  public.round_record_versions, public.amendment_sessions, public.security_audit_log from authenticated, anon;
-- Immutable RoundRecord and audit triggers intentionally remain active during rollback.
-- Anonymous catalog writes are intentionally not restored. Never drop historical tables during rollback.
