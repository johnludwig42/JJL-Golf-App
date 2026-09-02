-- Safe rollback: disable approval rather than restore the UUID/text mismatch.
-- No Course Library rows, columns, or tee gender values are changed.
begin;
drop function if exists public.publish_course(text);
commit;
