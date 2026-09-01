-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Agrega autenticación con roles: perfiles_usuario (1 fila por auth.users),
-- trigger de autocreado al invitar/registrar un usuario, funciones helper
-- para RLS (evitan recursión infinita) y políticas de acceso sobre la
-- tabla de perfiles. No toca solicitudes_pago ni ninguna otra tabla
-- existente: siguen con "anon acceso total" hasta que se decida (en una
-- migración aparte) qué RLS por rol aplica a cada módulo.

create type public.rol_usuario as enum ('SOLICITANTE', 'APROBADOR', 'TESORERIA', 'ADMIN');

create table public.perfiles_usuario (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol public.rol_usuario not null default 'SOLICITANTE',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Funciones helper para RLS: SECURITY DEFINER + tabla propia = evita la
-- recursión infinita que da "using (rol = ...) " directamente en la policy
-- de la misma tabla que se está protegiendo.
create or replace function public.get_mi_rol()
returns public.rol_usuario
language sql
security definer
set search_path = public
stable
as $$
  select rol from public.perfiles_usuario where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.perfiles_usuario
    where id = auth.uid() and rol = 'ADMIN' and activo = true
  );
$$;

-- Autocreación de perfil al invitar/registrar un usuario en Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles_usuario (id, nombre, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.perfiles_usuario enable row level security;

create policy "Lectura perfiles: propio o roles elevados" on public.perfiles_usuario
  for select using (
    id = auth.uid() or public.get_mi_rol() in ('ADMIN', 'APROBADOR', 'TESORERIA')
  );

create policy "Escritura perfiles: solo admins" on public.perfiles_usuario
  for update using ( public.es_admin() )
  with check ( public.es_admin() );
