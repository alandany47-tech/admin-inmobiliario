-- Agrega IVA informativo al catálogo WBS: porcentaje por partida (default 0,
-- no asumir IVA en partidas existentes) y calcula presupuesto_iva y
-- presupuesto_total en la vista de resumen (sin afectar el cálculo de
-- disponible, que sigue siendo presupuesto - ejercido; el IVA es solo para
-- administración/operaciones, no afecta alerta de excedente en SolicitudPagoForm).
alter table public.wbs_catalog
  add column if not exists porcentaje_iva numeric not null default 0
    check (porcentaje_iva >= 0 and porcentaje_iva <= 100);

-- Recrear la vista con las columnas nuevas: porcentaje_iva, presupuesto_iva,
-- presupuesto_total, manteniendo orden relativo de columnas existentes para
-- no romper consumidores que usan select(*) o select explícito sin las nuevas.
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
  group by c.id, c.proyecto_id, c.categoria, c.partida, c.presupuesto, c.activo, c.codigo, c.parent_id, c.porcentaje_iva
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
  e.presupuesto_total
from wbs_ejercido e;

-- Reaplica security_invoker = true: el reloption no persiste automáticamente
-- tras create or replace view, y la migración 0040 dejó esta vista con ese
-- atributo para heredar RLS por rol (ver 0040 para detalles).
alter view public.wbs_presupuesto_resumen set (security_invoker = true);
