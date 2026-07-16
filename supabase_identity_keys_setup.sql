-- Etapa 2A: claves públicas de identidad para cifrado ECDH por conversación.
-- Las claves privadas permanecen en el dispositivo y nunca se guardan aquí.

create table if not exists public.user_identity_keys (
  user_id uuid primary key,
  public_key_jwk jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.user_identity_keys enable row level security;
grant select, insert, update on public.user_identity_keys to authenticated;

drop policy if exists "Usuarios autenticados pueden leer claves públicas" on public.user_identity_keys;
create policy "Usuarios autenticados pueden leer claves públicas"
  on public.user_identity_keys
  for select
  to authenticated
  using (true);

drop policy if exists "Usuarios pueden registrar su clave pública" on public.user_identity_keys;
create policy "Usuarios pueden registrar su clave pública"
  on public.user_identity_keys
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Usuarios pueden rotar su clave pública" on public.user_identity_keys;
create policy "Usuarios pueden rotar su clave pública"
  on public.user_identity_keys
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
