-- get_desglose_pagos_wbs (0035) solo unía solicitudes_pago.wbs_catalog_id,
-- así que la porción de un gasto corporativo repartido a una partida (tabla
-- solicitud_reparto_corporativo, 0027) nunca aparecía en el modal "Desglose
-- de Pagos" de esa partida (ModalDesglosePagosWbs.js) — aunque sí se contaba
-- bien en wbs_presupuesto_resumen.ejercido desde 0027. El dinero cuadraba,
-- pero no había forma de ver, por partida, qué folio corporativo lo aportó.
-- Se agrega esa porción vía UNION ALL y una columna `es_reparto` para que el
-- cliente pueda distinguir "pago directo a esta partida" de "reparto de un
-- gasto corporativo pagado con otro folio".
drop function if exists public.get_desglose_pagos_wbs(bigint);

create function public.get_desglose_pagos_wbs(p_wbs_id bigint)
returns table(
  solicitud_id bigint,
  folio text,
  proyecto_nombre text,
  proveedor_razon_social text,
  concepto text,
  fecha_pago date,
  metodo_pago text,
  monto numeric,
  comprobante_url text,
  comprobante_r2_key text,
  xml_factura text,
  num_factura text,
  es_reparto boolean
)
language sql
stable security definer
set search_path = public
as $function$
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
    s.comprobante_url,
    s.comprobante_r2_key,
    s.xml_factura,
    s.num_factura::text as num_factura,
    false as es_reparto
  from public.solicitudes_pago s
  join nodos n on n.id = s.wbs_catalog_id
  left join public.proyectos p on p.id = s.proyecto_id
  left join public.proveedores pr on pr.id = s.proveedor_id
  where s.estado = 'Pagado'

  union all

  select
    s.id as solicitud_id,
    s.folio,
    p.nombre as proyecto_nombre,
    pr.razon_social as proveedor_razon_social,
    s.concepto,
    s.fecha_pago,
    s.metodo_pago::text as metodo_pago,
    r.monto as monto,
    s.comprobante_url,
    s.comprobante_r2_key,
    s.xml_factura,
    s.num_factura::text as num_factura,
    true as es_reparto
  from public.solicitud_reparto_corporativo r
  join nodos n on n.id = r.wbs_id
  join public.solicitudes_pago s on s.id = r.solicitud_id
  left join public.proyectos p on p.id = s.proyecto_id
  left join public.proveedores pr on pr.id = s.proveedor_id
  where s.estado = 'Pagado'

  -- El ORDER BY del UNION solo puede referenciar columnas proyectadas (a
  -- diferencia del SELECT único de 0035, que ordenaba por s.created_at sin
  -- exponerlo): se usa solicitud_id desc como desempate secundario, un proxy
  -- razonable de "más reciente primero" al ser identity bigint.
  order by fecha_pago desc nulls last, solicitud_id desc;
$function$;
