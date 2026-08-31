-- Autogenera codigo secuencial para partidas raíz (Nivel 1) de wbs_catalog:
-- backfill de las filas ya cargadas sin codigo, y trigger para que las
-- raíces nuevas (parent_id null) reciban automáticamente el siguiente
-- consecutivo del proyecto si no traen codigo explícito desde el Excel.
-- No toca wbs_presupuesto_resumen ni agrega una CTE recursiva: la vista
-- sigue exponiendo el ejercido propio de cada fila y la numeración
-- jerárquica 1 / 1.1 / 1.1.1 se recalcula siempre en el cliente
-- (construirArbol en lib/wbs.js) — ver nota en
-- 0016_wbs_jerarquia_y_resumen_recursivo.sql. Este backfill solo evita que
-- las raíces se queden sin codigo propio, que es lo que usa construirArbol
-- para inferir la jerarquía por puntos cuando parent_id no viene explícito.

-- Backfill: solo raíces (sin parent_id) que aún no tienen codigo, numeradas
-- por proyecto en su orden actual (categoria, partida, id) para no alterar
-- el orden ya visible antes de esta migración.
with raices_sin_codigo as (
  select
    id,
    row_number() over (
      partition by proyecto_id
      order by categoria, partida, id
    ) as posicion
  from public.wbs_catalog
  where parent_id is null
    and (codigo is null or codigo = '')
)
update public.wbs_catalog c
set codigo = r.posicion::text
from raices_sin_codigo r
where c.id = r.id;

-- Trigger: si se inserta una raíz nueva sin codigo, le asigna el siguiente
-- consecutivo disponible dentro de su proyecto (o del catálogo general si
-- proyecto_id es null).
create or replace function public.wbs_catalog_autogenerar_codigo_raiz()
returns trigger
language plpgsql
as $$
declare
  v_siguiente int;
begin
  if new.parent_id is null and (new.codigo is null or new.codigo = '') then
    select coalesce(max(codigo::int), 0) + 1
      into v_siguiente
      from public.wbs_catalog
     where parent_id is null
       and codigo ~ '^[0-9]+$'
       and proyecto_id is not distinct from new.proyecto_id;

    new.codigo := v_siguiente::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wbs_catalog_autogenerar_codigo_raiz on public.wbs_catalog;
create trigger trg_wbs_catalog_autogenerar_codigo_raiz
  before insert on public.wbs_catalog
  for each row
  execute function public.wbs_catalog_autogenerar_codigo_raiz();
