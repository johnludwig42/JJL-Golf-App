-- Disable new revisions; do not change any course or draft already revised.
begin;
revoke execute on function public.revise_approved_course(text) from authenticated;
commit;
