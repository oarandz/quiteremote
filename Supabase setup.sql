-- Woodsman's Quiz remote operator — run once in the EXISTING quiz project's
-- Supabase SQL Editor. No changes to live_state, booking data or existing users.
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
create policy quiz_remote_owner on public.quiz_remote_sessions to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

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
  where owner_id = auth.uid() and seen_at > now() - interval '25 seconds'
  order by label, id;
$$;
revoke all on function public.quiz_remote_list_sessions() from public;
grant execute on function public.quiz_remote_list_sessions() to authenticated;

create or replace function public.quiz_remote_allowed_topic()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.quiz_remote_sessions s
    where s.owner_id = auth.uid()
      and realtime.topic() = 'quiz-control:' || s.owner_id::text || ':' || s.id::text
      and s.seen_at > now() - interval '25 seconds'
  );
$$;
revoke all on function public.quiz_remote_allowed_topic() from public;
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
  using (realtime.topic() not like 'quiz-control:%' or public.quiz_remote_allowed_topic());
create policy quiz_remote_write_guard on realtime.messages as restrictive for insert to authenticated
  with check (realtime.topic() not like 'quiz-control:%' or public.quiz_remote_allowed_topic());
create policy quiz_remote_anon_read_guard on realtime.messages as restrictive for select to anon
  using (realtime.topic() not like 'quiz-control:%');
create policy quiz_remote_anon_write_guard on realtime.messages as restrictive for insert to anon
  with check (realtime.topic() not like 'quiz-control:%');
commit;
