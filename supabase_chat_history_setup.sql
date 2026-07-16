-- Historial cifrado persistente para sincronización multidispositivo.
-- Ejecutar una vez en Supabase Dashboard > SQL Editor.

create table if not exists public.chat_messages (
  id text primary key,
  room_id text not null,
  sender_id uuid not null,
  receiver_id uuid not null,
  encrypted_payload text not null,
  client_created_at bigint not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint chat_messages_distinct_participants check (sender_id <> receiver_id)
);

create index if not exists chat_messages_room_created_idx
  on public.chat_messages (room_id, created_at desc);

create index if not exists chat_messages_sender_idx
  on public.chat_messages (sender_id);

create index if not exists chat_messages_receiver_idx
  on public.chat_messages (receiver_id);

alter table public.chat_messages enable row level security;

grant select, insert, delete on public.chat_messages to authenticated;

drop policy if exists "Participantes pueden leer mensajes" on public.chat_messages;
create policy "Participantes pueden leer mensajes"
  on public.chat_messages
  for select
  to authenticated
  using (
    (select auth.uid()) = sender_id
    or (select auth.uid()) = receiver_id
  );

drop policy if exists "Emisores pueden guardar mensajes" on public.chat_messages;
create policy "Emisores pueden guardar mensajes"
  on public.chat_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = sender_id);

drop policy if exists "Emisores pueden eliminar sus mensajes" on public.chat_messages;
create policy "Emisores pueden eliminar sus mensajes"
  on public.chat_messages
  for delete
  to authenticated
  using ((select auth.uid()) = sender_id);
