-- Comprobantes de pago vía Cloudflare R2 (además del bucket "comprobantes" de
-- Supabase Storage, que sigue sirviendo los históricos sin migrar) y captura
-- de XML de factura en texto plano. `comprobante_r2_key` guarda la key del
-- objeto en R2 (el bucket no es público: se lee vía presigned GET generado
-- bajo demanda, nunca una URL fija); `xml_factura` guarda el XML del CFDI tal
-- cual, sin pasar por Storage porque pesa poco (10-30KB).
alter table public.solicitudes_pago
  add column comprobante_r2_key text,
  add column xml_factura text;

-- Redefine get_desglose_pagos_wbs (0014) para incluir las columnas nuevas más
-- num_factura, usadas por ModalDesglosePagosWbs para las acciones "Ver
-- Factura"/"Ver Comprobante". Releída la definición vigente en la BD antes de
-- redefinir (regla 7): sin drift respecto a 0014, misma lógica recursiva, solo
-- se agregan columnas al final del SELECT y del RETURNS TABLE. Postgres no
-- permite `create or replace function` cuando cambia el tipo de retorno
-- compuesto (RETURNS TABLE con columnas nuevas cuenta como eso), así que hay
-- que borrarla primero.
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
  num_factura text
)
language sql
stable security definer
set search_path to 'public'
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
    s.num_factura::text as num_factura
  from public.solicitudes_pago s
  join nodos n on n.id = s.wbs_catalog_id
  left join public.proyectos p on p.id = s.proyecto_id
  left join public.proveedores pr on pr.id = s.proveedor_id
  where s.estado = 'Pagado'
  order by s.fecha_pago desc nulls last, s.created_at desc;
$function$;
