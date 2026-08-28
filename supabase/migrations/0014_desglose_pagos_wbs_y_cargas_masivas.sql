-- Desglose de pagos por partida WBS: dado un nodo (hoja o con hijos), regresa
-- todas las solicitudes 'Pagado' ligadas a ese nodo o a cualquiera de sus
-- descendientes (CTE recursiva sobre wbs_catalog.parent_id). Permite que el
-- modal de desglose funcione tanto sobre una partida hoja como sobre un
-- agregado de categoría/subcategoría.
create or replace function public.get_desglose_pagos_wbs(p_wbs_id bigint)
returns table (
  solicitud_id bigint,
  folio text,
  proyecto_nombre text,
  proveedor_razon_social text,
  concepto text,
  fecha_pago date,
  metodo_pago text,
  monto numeric,
  comprobante_url text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with recursive nodos as (
    select id from public.wbs_catalog where id = p_wbs_id
    union all
    select w.id
    from public.wbs_catalog w
    join nodos n on w.parent_id = n.id
  )
  select
    s.id as solicitud_id,
    s.folio,
    p.nombre as proyecto_nombre,
    pr.razon_social as proveedor_razon_social,
    s.concepto,
    s.fecha_pago,
    s.metodo_pago::text as metodo_pago,
    s.total as monto,
    s.comprobante_url
  from public.solicitudes_pago s
  join nodos n on n.id = s.wbs_catalog_id
  left join public.proyectos p on p.id = s.proyecto_id
  left join public.proveedores pr on pr.id = s.proveedor_id
  where s.estado = 'Pagado'
  order by s.fecha_pago desc nulls last, s.created_at desc;
$$;
