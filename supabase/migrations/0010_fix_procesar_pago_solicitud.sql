-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- CORRECCIÓN: 0008_validar_presupuesto_pago.sql redefinió
-- procesar_pago_solicitud() a partir de la versión de 0004_tesoreria.sql, sin
-- conocer que 0006_tesoreria_movimientos_proveedores.sql ya la había vuelto a
-- redefinir para registrar cada pago en la bitácora movimientos_tesoreria.
-- Esto pisó silenciosamente esa bitácora: cualquier pago procesado entre
-- 0008 y esta migración no quedó registrado en movimientos_tesoreria.
-- Esta versión combina ambas: la bitácora de 0006 + el bloque (comentado)
-- de validación de presupuesto WBS de 0008.

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
  v_disponible numeric;
  v_cuenta_id bigint;
  v_saldo_resultante numeric(14, 2);
  v_proveedor_razon_social text;
begin
  select metodo_pago, total, estado, proyecto_id, folio, wbs_catalog_id
    into v_metodo_pago, v_total, v_estado, v_proyecto_id, v_folio, v_wbs_catalog_id
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
     set estado = 'Pagado', cuenta_id = v_cuenta_id, fecha_pago = p_fecha_pago
   where id = p_solicitud_id;

  insert into public.movimientos_tesoreria (
    cuenta_id, proyecto_id, tipo_movimiento, fecha, razon_social, concepto, monto, saldo_resultante, solicitud_id
  ) values (
    v_cuenta_id, v_proyecto_id, 'egreso', p_fecha_pago, v_proveedor_razon_social, 'Pago solicitud ' || v_folio, v_total, v_saldo_resultante, p_solicitud_id
  );
end;
$$;
