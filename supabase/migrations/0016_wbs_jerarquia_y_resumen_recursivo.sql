-- Prepara wbs_presupuesto_resumen para jerarquía WBS de N-niveles.
-- La vista sigue exponiendo el "ejercido" propio de cada fila (no agregado):
-- la consolidación de presupuesto/ejercido/disponible de un nodo padre sobre
-- todos sus descendientes recursivos se sigue calculando en el cliente
-- (construirArbol en components/PanelPresupuestoWbs.js), igual que desde
-- 0012 — no hay CTE recursiva de árbol en la vista misma.
--
-- Nota: el borrador original de esta migración usaba
-- "create or replace view" reordenando columnas (codigo/parent_id movidas
-- junto a categoria/partida). Postgres no permite reordenar ni insertar
-- columnas en medio de una vista existente vía create or replace (ver nota
-- en 0012_wbs_jerarquico_y_edicion_tesoreria.sql) — hacerlo así habría
-- fallado contra la vista ya desplegada. Se mantiene el mismo orden de
-- columnas (codigo/parent_id al final) y se reescribe el cálculo de
-- "ejercido" con un CTE por claridad, sin cambiar el resultado.
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
    coalesce(sum(s.total) filter (where s.estado = 'Pagado'), 0) as ejercido
  from public.wbs_catalog c
  left join public.solicitudes_pago s on s.wbs_catalog_id = c.id
  group by c.id, c.proyecto_id, c.categoria, c.partida, c.presupuesto, c.activo, c.codigo, c.parent_id
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
  e.parent_id
from wbs_ejercido e;
