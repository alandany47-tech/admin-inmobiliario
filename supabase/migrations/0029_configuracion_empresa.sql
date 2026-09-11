-- Logo de empresa global (además del logo por proyecto y el logo por tipo
-- de documento que ya existen). Tabla singleton: el índice único sobre una
-- expresión constante garantiza que nunca pueda existir una segunda fila.

create table public.configuracion_empresa (
  id bigint generated always as identity primary key,
  logo_empresa_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index configuracion_empresa_singleton on public.configuracion_empresa ((true));

insert into public.configuracion_empresa default values;

alter table public.configuracion_empresa enable row level security;

create policy "anon acceso total configuracion empresa" on public.configuracion_empresa
  for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('logos-empresa', 'logos-empresa', true)
on conflict (id) do nothing;

drop policy if exists "anon acceso total logos empresa" on storage.objects;
create policy "anon acceso total logos empresa" on storage.objects
  for all using (bucket_id = 'logos-empresa') with check (bucket_id = 'logos-empresa');
