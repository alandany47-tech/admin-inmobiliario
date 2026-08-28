-- Cambia el destino por defecto de revertir_pago_solicitud: al revertir un
-- pago desde Tesorería (sin especificar estado destino) la solicitud regresa
-- a 'Por Autorizar' en vez de 'Autorizado', para que pase de nuevo por el
-- flujo de autorización completo. Redefinida a partir de la versión vigente
-- en la BD (0011), solo cambia el default del segundo parámetro.
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

  select estado, proyecto_id, proveedor_id, total, folio, cuenta_id
    into v_estado, v_proyecto_id, v_proveedor_id, v_total, v_folio, v_cuenta_id
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
