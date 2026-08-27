-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Catálogo WBS reutilizable, comprobante de pago, datos de directorio de
-- proveedores y el bucket de Storage para comprobantes.
-- Nota: se numera 0005 porque 0004 ya está tomado por 0004_tesoreria.sql.
-- Nota: proyecto_id se define bigint (no UUID) porque public.proyectos.id
-- es bigint identity; un FK a UUID no podría crearse contra esa columna.

create table if not exists public.wbs_catalog (
  id bigint generated always as identity primary key,
  proyecto_id bigint references public.proyectos(id),
  categoria varchar(100) not null,
  partida varchar(100) not null,
  created_at timestamptz not null default now()
);

alter table public.wbs_catalog enable row level security;

drop policy if exists "anon acceso total wbs_catalog" on public.wbs_catalog;
create policy "anon acceso total wbs_catalog" on public.wbs_catalog
  for all using (true) with check (true);

insert into public.wbs_catalog (categoria, partida)
select v.categoria, v.partida
from (
  values
    ('Gerencia de Obra', 'Owner''s REP'),
    ('Gerencia de Obra', 'Supervisión Técnica'),
    ('Estructura de Acero', 'Suministro de Acero'),
    ('Estructura de Acero', 'Montaje Estructural'),
    ('Cimentación y Concreto', 'Excavación y Cimentación'),
    ('Cimentación y Concreto', 'Colado de Concreto')
) as v(categoria, partida)
where not exists (
  select 1 from public.wbs_catalog w
  where w.categoria = v.categoria and w.partida = v.partida and w.proyecto_id is null
);

alter table public.solicitudes_pago
  add column if not exists comprobante_url text;

alter table public.proveedores
  add column if not exists estatus varchar(20) not null default 'Activo',
  add column if not exists contacto_nombre text,
  add column if not exists contacto_telefono text,
  add column if not exists contacto_email text;

alter table public.proveedores drop constraint if exists proveedores_estatus_check;
alter table public.proveedores
  add constraint proveedores_estatus_check
  check (estatus in ('Activo', 'Inactivo'));

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

drop policy if exists "anon acceso total comprobantes" on storage.objects;
create policy "anon acceso total comprobantes" on storage.objects
  for all using (bucket_id = 'comprobantes') with check (bucket_id = 'comprobantes');
