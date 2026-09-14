-- Fix: procesar_pago_solicitud() nunca actualizaba reparto_estado, por lo que
-- ningún gasto corporativo pagado llegaba a aparecer en el Panel de Reparto
-- (PanelRepartoCorporativo.js / getSolicitudesPendientesReparto), que filtra
-- por reparto_estado = 'pendiente_reparto'. 0027_reparto_gastos_corporativos.sql
-- solo regresa la solicitud a ese estado al revertir un reparto ya confirmado,
-- nunca la pone en ese estado al pagarla por primera vez.
-- Esta migración redefine procesar_pago_solicitud (misma versión vigente de
-- 0010_fix_procesar_pago_solicitud.sql) agregando esa transición.
--
-- Efecto colateral necesario: al activar esta transición, revertir_pago_solicitud
-- (0027_reparto_gastos_corporativos.sql) queda con un caso no cubierto: si se
-- revierte el pago de una solicitud corporativa ANTES de repartirla (reparto_estado
-- todavía en 'pendiente_reparto', nunca llegó a 'repartido'), la función no
-- reseteaba reparto_estado — quedaba "pendiente de reparto" una solicitud que ya
-- ni siquiera está pagada. Esta migración también corrige ese caso.

create or replace function public.procesar_pago_solicitud(p_solicitud_id bigint, p_fecha_pago date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metodo_pago varchar(30);
  v_total numeric(14, 2);
  v_estado varchar(20);
  v_proyecto_id bigint;
  v_folio text;
  v_wbs_catalog_id bigint;
  v_es_corporativo boolean;
  v_disponible numeric;
  v_cuenta_id bigint;
  v_saldo_resultante numeric(14, 2);
  v_proveedor_razon_social text;
begin
  select metodo_pago, total, estado, proyecto_id, folio, wbs_catalog_id, es_corporativo
    into v_metodo_pago, v_total, v_estado, v_proyecto_id, v_folio, v_wbs_catalog_id, v_es_corporativo
    from public.solicitudes_pago
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;

  if v_estado <> 'Autorizado' then
    raise exception 'Solo se pueden pagar solicitudes autorizadas';
  end if;

  -- ============================================================
  -- Validación de presupuesto por partida WBS (desactivada por ahora).
  -- Descomentar para activarla:
  -- ============================================================
  -- if v_wbs_catalog_id is not null then
  --   select disponible into v_disponible
  --     from public.wbs_presupuesto_resumen
  --    where id = v_wbs_catalog_id;
  --
  --   if v_disponible is not null and v_total > v_disponible then
  --     raise exception 'El total % excede el disponible % de la partida WBS', v_total, v_disponible;
  --   end if;
  -- end if;
  -- ============================================================

  select id into v_cuenta_id
    from public.cuentas_bancarias
   where tipo = v_metodo_pago
   for update;

  if not found then
    raise exception 'No existe una cuenta para el método de pago %', v_metodo_pago;
  end if;

  select p.razon_social into v_proveedor_razon_social
    from public.solicitudes_pago sp
    join public.proveedores p on p.id = sp.proveedor_id
   where sp.id = p_solicitud_id;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual - v_total
   where id = v_cuenta_id
   returning saldo_actual into v_saldo_resultante;

  update public.solicitudes_pago
     set estado = 'Pagado',
         cuenta_id = v_cuenta_id,
         fecha_pago = p_fecha_pago,
         reparto_estado = case when v_es_corporativo then 'pendiente_reparto' else reparto_estado end
   where id = p_solicitud_id;

  insert into public.movimientos_tesoreria (
    cuenta_id, proyecto_id, tipo_movimiento, fecha, razon_social, concepto, monto, saldo_resultante, solicitud_id
  ) values (
    v_cuenta_id, v_proyecto_id, 'egreso', p_fecha_pago, v_proveedor_razon_social, 'Pago solicitud ' || v_folio, v_total, v_saldo_resultante, p_solicitud_id
  );
end;
$$;

-- Redefine revertir_pago_solicitud (misma versión vigente de 0027) agregando
-- el caso donde reparto_estado = 'pendiente_reparto' pero nunca llegó a
-- 'repartido': al revertir el pago, se resetea a 'no_aplica' en vez de quedar
-- "pendiente de reparto" en una solicitud que ya no está pagada.
create or replace function public.revertir_pago_solicitud(
  p_solicitud_id bigint,
  p_nuevo_estado varchar(20) default 'Por Autorizar'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_estado varchar(20);
  v_reparto_estado varchar(20);
  v_proyecto_id bigint;
  v_proveedor_id bigint;
  v_total numeric(14, 2);
  v_folio text;
  v_cuenta_id bigint;
  v_saldo_resultante numeric(14, 2);
  v_proveedor_razon_social text;
begin
  if p_nuevo_estado not in ('Por Autorizar', 'Autorizado', 'Pospuesto', 'Cancelado') then
    raise exception 'Estado destino inválido para reversión: %', p_nuevo_estado;
  end if;

  select estado, reparto_estado, proyecto_id, proveedor_id, total, folio, cuenta_id
    into v_estado, v_reparto_estado, v_proyecto_id, v_proveedor_id, v_total, v_folio, v_cuenta_id
    from public.solicitudes_pago
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;

  if v_estado <> 'Pagado' then
    raise exception 'Solo se puede revertir una solicitud en estado Pagado (actual: %)', v_estado;
  end if;

  if v_cuenta_id is null then
    raise exception 'La solicitud % no tiene cuenta asociada, no se puede revertir', p_solicitud_id;
  end if;

  if v_reparto_estado = 'repartido' then
    delete from public.solicitud_reparto_corporativo where solicitud_id = p_solicitud_id;
    update public.solicitudes_pago set reparto_estado = 'pendiente_reparto' where id = p_solicitud_id;
  elsif v_reparto_estado = 'pendiente_reparto' then
    update public.solicitudes_pago set reparto_estado = 'no_aplica' where id = p_solicitud_id;
  end if;

  select p.razon_social into v_proveedor_razon_social
    from public.proveedores p
   where p.id = v_proveedor_id;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual + v_total
   where id = v_cuenta_id
   returning saldo_actual into v_saldo_resultante;

  insert into public.movimientos_tesoreria (
    cuenta_id, proyecto_id, tipo_movimiento, fecha, razon_social, concepto, monto, saldo_resultante, comentarios, solicitud_id
  ) values (
    v_cuenta_id, v_proyecto_id, 'ingreso', current_date, v_proveedor_razon_social,
    'Reversión de pago - folio ' || v_folio, v_total, v_saldo_resultante,
    'Reversión automática por cambio de estado', p_solicitud_id
  );

  update public.solicitudes_pago
     set estado = p_nuevo_estado, fecha_pago = null, cuenta_id = null
   where id = p_solicitud_id;
end;
$$;
