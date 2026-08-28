-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Presupuesto por partida WBS (fase 1): techo de presupuesto y bandera de
-- activo por partida, enlace fuerte desde solicitudes_pago hacia adelante y
-- vista de resumen presupuesto/ejercido/disponible.
-- Nota: se numera 0007 porque 0006 ya está tomado por
-- 0006_tesoreria_movimientos_proveedores.sql.
-- Nota: wbs_categoria/wbs_partida (texto) en solicitudes_pago se dejan como
-- están, no se eliminan. wbs_catalog_id es el nuevo enlace fuerte hacia
-- adelante; no se hace backfill automático de solicitudes históricas en esta
-- fase (riesgo de emparejar mal texto libre) — pendiente como tarea aparte.

alter table public.wbs_catalog
  add column if not exists presupuesto numeric not null default 0,
  add column if not exists activo boolean not null default true;

alter table public.solicitudes_pago
  add column if not exists wbs_catalog_id bigint references public.wbs_catalog(id);

create or replace view public.wbs_presupuesto_resumen as
select
  w.id,
  w.proyecto_id,
  w.categoria,
  w.partida,
  w.presupuesto,
  w.activo,
  coalesce(sum(s.total) filter (where s.estado = 'Pagado'), 0) as ejercido,
  w.presupuesto - coalesce(sum(s.total) filter (where s.estado = 'Pagado'), 0) as disponible
from public.wbs_catalog w
left join public.solicitudes_pago s on s.wbs_catalog_id = w.id
group by w.id;
