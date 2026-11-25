-- Woodsman's Quiz remote operator — repeatable upgrade in the EXISTING quiz
-- project's Supabase SQL Editor. Every signed-in, non-anonymous quiz account
-- can discover/control an active venue. Only its owner can maintain the venue
-- record. No invitations, allowlist or changes to existing users are required.
-- No changes to live_state or booking data.
begin;
create table if not exists public.quiz_remote_sessions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  mode text not null check (mode in ('TEST','LIVE')),
  version text not null,
  seen_at timestamptz not null default now()
);
create index if not exists quiz_remote_sessions_owner_seen on public.quiz_remote_sessions(owner_id,seen_at);
alter table public.quiz_remote_sessions enable row level security;
revoke all on public.quiz_remote_sessions from anon;
grant select, insert, update, delete on public.quiz_remote_sessions to authenticated;
drop policy if exists quiz_remote_owner on public.quiz_remote_sessions;
drop policy if exists quiz_remote_read on public.quiz_remote_sessions;
drop policy if exists quiz_remote_insert on public.quiz_remote_sessions;
drop policy if exists quiz_remote_update on public.quiz_remote_sessions;
drop policy if exists quiz_remote_delete on public.quiz_remote_sessions;
create policy quiz_remote_read on public.quiz_remote_sessions for select to authenticated
  using ((select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false'
    -- Owners must be able to refresh their own row after a connection outage.
    and (owner_id = (select auth.uid()) or seen_at > now() - interval '25 seconds'));
create policy quiz_remote_insert on public.quiz_remote_sessions for insert to authenticated
  with check ((select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false'
    and owner_id = (select auth.uid()));
create policy quiz_remote_update on public.quiz_remote_sessions for update to authenticated
  using ((select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false'
    and owner_id = (select auth.uid()))
  with check ((select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false'
    and owner_id = (select auth.uid()));
create policy quiz_remote_delete on public.quiz_remote_sessions for delete to authenticated
  using ((select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false'
    and owner_id = (select auth.uid()));

create or replace function public.quiz_remote_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.seen_at := now();
  return new;
end;
$$;
drop trigger if exists quiz_remote_stamp on public.quiz_remote_sessions;
create trigger quiz_remote_stamp before insert or update on public.quiz_remote_sessions
  for each row execute function public.quiz_remote_stamp();

create or replace function public.quiz_remote_list_sessions()
returns setof public.quiz_remote_sessions language sql stable security invoker set search_path = '' as $$
  select * from public.quiz_remote_sessions
  where auth.uid() is not null
    and coalesce(auth.jwt()->>'is_anonymous','false') = 'false'
    and seen_at > now() - interval '25 seconds'
  order by label, id;
$$;
revoke all on function public.quiz_remote_list_sessions() from public, anon;
grant execute on function public.quiz_remote_list_sessions() to authenticated;

create or replace function public.quiz_remote_allowed_topic()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->>'is_anonymous','false') = 'false'
    and exists (
    select 1 from public.quiz_remote_sessions s
    where realtime.topic() = 'quiz-control:' || s.owner_id::text || ':' || s.id::text
      and s.seen_at > now() - interval '25 seconds'
  );
$$;
revoke all on function public.quiz_remote_allowed_topic() from public, anon;
grant execute on function public.quiz_remote_allowed_topic() to authenticated;

-- Supabase enables RLS on realtime.messages. These narrowly scoped policies
-- do not grant access to any existing phone/booking channels.
drop policy if exists quiz_remote_receive on realtime.messages;
drop policy if exists quiz_remote_send on realtime.messages;
create policy quiz_remote_receive on realtime.messages for select to authenticated
  using (extension = 'broadcast' and public.quiz_remote_allowed_topic());
create policy quiz_remote_send on realtime.messages for insert to authenticated
  with check (extension = 'broadcast' and public.quiz_remote_allowed_topic());

-- Restrictive guards also protect this namespace if this project already has
-- a permissive Realtime policy. Other topic names retain their existing rules.
drop policy if exists quiz_remote_read_guard on realtime.messages;
drop policy if exists quiz_remote_write_guard on realtime.messages;
drop policy if exists quiz_remote_anon_read_guard on realtime.messages;
drop policy if exists quiz_remote_anon_write_guard on realtime.messages;
create policy quiz_remote_read_guard on realtime.messages as restrictive for select to authenticated
  using (realtime.topic() not like 'quiz-control:%'
    or (extension = 'broadcast' and public.quiz_remote_allowed_topic()));
create policy quiz_remote_write_guard on realtime.messages as restrictive for insert to authenticated
  with check (realtime.topic() not like 'quiz-control:%'
    or (extension = 'broadcast' and public.quiz_remote_allowed_topic()));
create policy quiz_remote_anon_read_guard on realtime.messages as restrictive for select to anon
  using (realtime.topic() not like 'quiz-control:%');
create policy quiz_remote_anon_write_guard on realtime.messages as restrictive for insert to anon
  with check (realtime.topic() not like 'quiz-control:%');
commit;
