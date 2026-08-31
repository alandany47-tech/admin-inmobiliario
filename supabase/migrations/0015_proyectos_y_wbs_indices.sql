-- Módulo administrativo de proyectos: estadísticas agregadas por proyecto
-- (presupuesto, total pagado, conteo de partidas WBS) para /proyectos.
-- proyectos ya tiene id/codigo (UNIQUE)/nombre/presupuesto/created_at desde
-- su creación; se deja el guard idempotente por si alguna instancia no lo trae.
alter table public.proyectos
  add column if not exists presupuesto numeric not null default 0,
  add column if not exists created_at timestamptz not null default now();

-- proyectos solo traía una policy de solo lectura ("Permitir lectura
-- publica"); a diferencia del resto de las tablas (sin auth todavía, ver
-- CLAUDE.md) no tenía policy de escritura, lo que bloqueaba crear/editar/
-- eliminar proyectos desde el nuevo módulo administrativo. Se reemplaza por
-- el mismo patrón "anon acceso total <tabla>" ya usado en proveedores,
-- solicitudes_pago, wbs_catalog, etc.
drop policy if exists "Permitir lectura publica" on public.proyectos;
drop policy if exists "anon acceso total proyectos" on public.proyectos;
create policy "anon acceso total proyectos" on public.proyectos
  for all using (true) with check (true);

create index if not exists idx_wbs_catalog_proyecto on public.wbs_catalog(proyecto_id);
create index if not exists idx_solicitudes_pago_proyecto on public.solicitudes_pago(proyecto_id);
create index if not exists idx_solicitudes_pago_wbs_catalog on public.solicitudes_pago(wbs_catalog_id);
create index if not exists idx_solicitudes_pago_estado on public.solicitudes_pago(estado);

-- Por cada proyecto: presupuesto global, total de solicitudes 'Pagado'
-- asociadas y conteo de partidas en wbs_catalog (todas las filas ligadas al
-- proyecto, hoja o no). Solo lectura, sin efectos secundarios.
create or replace function public.get_proyectos_con_estadisticas()
returns table (
  id bigint,
  codigo text,
  nombre text,
  presupuesto numeric,
  total_pagado numeric,
  total_partidas_wbs bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p.id,
    p.codigo,
    p.nombre,
    p.presupuesto,
    coalesce(sp.total_pagado, 0) as total_pagado,
    coalesce(wc.total_partidas, 0) as total_partidas_wbs,
    p.created_at
  from public.proyectos p
  left join (
    select proyecto_id, sum(total) as total_pagado
    from public.solicitudes_pago
    where estado = 'Pagado'
    group by proyecto_id
  ) sp on sp.proyecto_id = p.id
  left join (
    select proyecto_id, count(*) as total_partidas
    from public.wbs_catalog
    group by proyecto_id
  ) wc on wc.proyecto_id = p.id
  order by p.codigo;
$$;
