-- Historial privado de llamadas y videollamadas.
-- Ejecutar una vez en Supabase SQL Editor.

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  peer_id uuid not null,
  call_id text not null,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null check (status in ('completed', 'rejected', 'missed', 'failed', 'canceled')),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint call_logs_distinct_users check (user_id <> peer_id),
  constraint call_logs_user_call_unique unique (user_id, call_id)
);

create index if not exists call_logs_user_created_idx
  on public.call_logs (user_id, created_at desc);

alter table public.call_logs enable row level security;
grant select, insert on public.call_logs to authenticated;

drop policy if exists "Usuarios pueden leer su historial de llamadas" on public.call_logs;
create policy "Usuarios pueden leer su historial de llamadas"
  on public.call_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Usuarios pueden guardar su historial de llamadas" on public.call_logs;
create policy "Usuarios pueden guardar su historial de llamadas"
  on public.call_logs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
