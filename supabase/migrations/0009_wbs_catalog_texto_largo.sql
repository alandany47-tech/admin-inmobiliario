-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Amplía wbs_catalog.categoria/partida de varchar(100) a text: el WBS real
-- de Piamont trae descripciones de partida que superan 100 caracteres
-- (ej. alcances de albañilería con notas entre paréntesis). Cambio seguro,
-- sin pérdida de datos.

-- La vista wbs_presupuesto_resumen depende de estas columnas: hay que
-- soltarla y recrearla igual que en 0007_wbs_presupuesto.sql.
drop view if exists public.wbs_presupuesto_resumen;

alter table public.wbs_catalog
  alter column categoria type text,
  alter column partida type text;

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
