-- WBS jerárquico: código y relación padre/hijo para renderizar árbol N-niveles.
alter table public.wbs_catalog
  add column codigo text,
  add column parent_id bigint references public.wbs_catalog(id) on delete cascade;

create index idx_wbs_catalog_parent on public.wbs_catalog(parent_id);

-- Edita el monto de un movimiento de tesorería ya registrado (manual o
-- generado por procesar_pago_solicitud/revertir_pago_solicitud) y traslada
-- el delta a cuentas_bancarias.saldo_actual de forma atómica. Si el
-- movimiento está ligado a una solicitud, sincroniza su total para que
-- wbs_presupuesto_resumen.ejercido no quede desfasado.
-- Nota: no recalcula el saldo_resultante de movimientos posteriores en la
-- bitácora (ese campo queda como snapshot histórico al momento de su propio
-- registro); solo cuentas_bancarias.saldo_actual refleja siempre el balance vigente.
create or replace function public.editar_movimiento_tesoreria(
  p_movimiento_id uuid,
  p_nuevo_monto numeric
)
returns public.movimientos_tesoreria
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cuenta_id bigint;
  v_tipo_movimiento varchar(10);
  v_monto_anterior numeric(14, 2);
  v_solicitud_id bigint;
  v_saldo_actual numeric(14, 2);
  v_movimiento public.movimientos_tesoreria;
begin
  if p_nuevo_monto is null or p_nuevo_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  select cuenta_id, tipo_movimiento, monto, solicitud_id
    into v_cuenta_id, v_tipo_movimiento, v_monto_anterior, v_solicitud_id
    from public.movimientos_tesoreria
   where id = p_movimiento_id
   for update;

  if not found then
    raise exception 'Movimiento % no encontrado', p_movimiento_id;
  end if;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual
       + (case when v_tipo_movimiento = 'ingreso' then 1 else -1 end) * (p_nuevo_monto - v_monto_anterior)
   where id = v_cuenta_id
   returning saldo_actual into v_saldo_actual;

  update public.movimientos_tesoreria
     set monto = p_nuevo_monto, saldo_resultante = v_saldo_actual
   where id = p_movimiento_id
   returning * into v_movimiento;

  if v_solicitud_id is not null then
    update public.solicitudes_pago set total = p_nuevo_monto where id = v_solicitud_id;
  end if;

  return v_movimiento;
end;
$$;

-- Elimina un movimiento de tesorería, revirtiendo su efecto en
-- cuentas_bancarias.saldo_actual. Si estaba ligado a una solicitud que sigue
-- 'Pagado', la regresa a 'Autorizado' (fecha_pago/cuenta_id a null) para no
-- dejar una solicitud marcada como pagada sin ningún movimiento que lo respalde.
-- No delega en revertir_pago_solicitud: esa función inserta un movimiento de
-- compensación nuevo, lo que aquí duplicaría el efecto porque el propio
-- registro que se está borrando ya es la reversión.
create or replace function public.eliminar_movimiento_tesoreria(p_movimiento_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cuenta_id bigint;
  v_tipo_movimiento varchar(10);
  v_monto numeric(14, 2);
  v_solicitud_id bigint;
  v_estado_solicitud varchar(20);
  v_saldo_actual numeric(14, 2);
begin
  select cuenta_id, tipo_movimiento, monto, solicitud_id
    into v_cuenta_id, v_tipo_movimiento, v_monto, v_solicitud_id
    from public.movimientos_tesoreria
   where id = p_movimiento_id
   for update;

  if not found then
    raise exception 'Movimiento % no encontrado', p_movimiento_id;
  end if;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual + (case when v_tipo_movimiento = 'egreso' then 1 else -1 end) * v_monto
   where id = v_cuenta_id
   returning saldo_actual into v_saldo_actual;

  if v_solicitud_id is not null then
    select estado into v_estado_solicitud from public.solicitudes_pago where id = v_solicitud_id for update;

    if v_estado_solicitud = 'Pagado' then
      update public.solicitudes_pago
         set estado = 'Autorizado', fecha_pago = null, cuenta_id = null
       where id = v_solicitud_id;
    end if;
  end if;

  delete from public.movimientos_tesoreria where id = p_movimiento_id;

  return v_saldo_actual;
end;
$$;

-- Expone codigo/parent_id para el árbol jerárquico de /wbs. create or replace
-- no permite reordenar/insertar columnas en medio de una vista existente, así
-- que codigo/parent_id se agregan al final en vez de junto a categoria/partida.
create or replace view public.wbs_presupuesto_resumen as
select
  w.id,
  w.proyecto_id,
  w.categoria,
  w.partida,
  w.presupuesto,
  w.activo,
  coalesce(sum(s.total) filter (where s.estado::text = 'Pagado'::text), 0::numeric) as ejercido,
  w.presupuesto - coalesce(sum(s.total) filter (where s.estado::text = 'Pagado'::text), 0::numeric) as disponible,
  w.codigo,
  w.parent_id
from public.wbs_catalog w
left join public.solicitudes_pago s on s.wbs_catalog_id = w.id
group by w.id;
