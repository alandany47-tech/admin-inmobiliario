-- Agrega campos informativos de presupuestación detallada al catálogo WBS:
-- unidad, cantidad, precio_unitario. Estos son valores de conveniencia para
-- calculadora de usuario/auditoría (ej. mes × 4587 = 201828) pero NO son
-- la fuente de verdad del presupuesto (presupuesto sigue siendo autoritativo,
-- almacenado en presupuesto column). Sin restricción de valores en unidad
-- (texto libre: "mes", "año", "m2", "lote", etc.). El cálculo presupuesto =
-- cantidad × precio_unitario lo maneja la capa de aplicación, no la BD.
alter table public.wbs_catalog
  add column if not exists unidad text,
  add column if not exists cantidad numeric
    check (cantidad is null or cantidad >= 0),
  add column if not exists precio_unitario numeric
    check (precio_unitario is null or precio_unitario >= 0);

-- Recrear la vista agregando los campos nuevos como PASSTHROUGH (sin
-- transformación). Mantiene todas las columnas previas incluidas las de 0041
-- (porcentaje_iva, presupuesto_iva, presupuesto_total).
create or replace view public.wbs_presupuesto_resumen as
with wbs_ejercido as (
  select
    c.id,
    c.proyecto_id,
    c.categoria,
    c.partida,
    c.presupuesto,
    c.activo,
    c.codigo,
    c.parent_id,
    c.porcentaje_iva,
    c.unidad,
    c.cantidad,
    c.precio_unitario,
    round(c.presupuesto * c.porcentaje_iva / 100, 2) as presupuesto_iva,
    c.presupuesto + round(c.presupuesto * c.porcentaje_iva / 100, 2) as presupuesto_total,
    coalesce(sum(s.total) filter (where s.estado = 'Pagado'), 0)
      + coalesce((
          select sum(src.monto)
          from public.solicitud_reparto_corporativo src
          join public.solicitudes_pago sp on sp.id = src.solicitud_id
          where src.wbs_id = c.id and sp.estado = 'Pagado'
        ), 0) as ejercido
  from public.wbs_catalog c
  left join public.solicitudes_pago s on s.wbs_catalog_id = c.id
  group by c.id, c.proyecto_id, c.categoria, c.partida, c.presupuesto, c.activo, c.codigo, c.parent_id, c.porcentaje_iva, c.unidad, c.cantidad, c.precio_unitario
)
select
  e.id,
  e.proyecto_id,
  e.categoria,
  e.partida,
  e.presupuesto,
  e.activo,
  e.ejercido,
  e.presupuesto - e.ejercido as disponible,
  e.codigo,
  e.parent_id,
  e.porcentaje_iva,
  e.presupuesto_iva,
  e.presupuesto_total,
  e.unidad,
  e.cantidad,
  e.precio_unitario
from wbs_ejercido e;

-- Reaplica security_invoker = true: el reloption no persiste automáticamente
-- tras create or replace view. Sin esto, cualquier usuario autenticado podría
-- saltarse el RLS por rol de 0038 y leer presupuesto de proyectos a los que
-- no tiene acceso (ver 0040/0041 para detalles).
alter view public.wbs_presupuesto_resumen set (security_invoker = true);
