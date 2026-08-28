-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Agrega (desactivada por ahora) la validación de presupuesto por partida
-- WBS dentro de procesar_pago_solicitud: si el total de la solicitud excede
-- el disponible de su partida, se rechaza el pago.
-- La validación queda comentada a propósito: apenas van a empezar a probar
-- el flujo de presupuesto y no se quiere bloquear pagos todavía. Para
-- activarla, descomentar el bloque señalado más abajo y volver a aplicar
-- este archivo (create or replace function).
-- Pendiente para siguiente fase: decidir si esta misma validación debe
-- aplicar también al pasar una solicitud a 'Autorizado', no solo al pagar.

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
  v_cuenta_id bigint;
  v_wbs_catalog_id bigint;
  v_disponible numeric;
begin
  select metodo_pago, total, estado, wbs_catalog_id
    into v_metodo_pago, v_total, v_estado, v_wbs_catalog_id
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

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual - v_total
   where id = v_cuenta_id;

  update public.solicitudes_pago
     set estado = 'Pagado', cuenta_id = v_cuenta_id, fecha_pago = p_fecha_pago
   where id = p_solicitud_id;
end;
$$;
