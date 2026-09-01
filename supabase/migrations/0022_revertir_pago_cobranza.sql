-- Reversión atómica de un abono de Cobranza: mismo patrón que
-- revertir_pago_solicitud (0011/0013), adaptado a planes_pago_cobranza. Sin
-- esto, deshacer un abono mal capturado requería 3 pasos manuales desde
-- Tesorería (ajustar saldo, borrar/editar el movimiento, y corregir a mano
-- monto_pagado/estatus del plan), con alto riesgo de dejar el saldo o el
-- plan desfasados.
--
-- Nota de diseño: a diferencia de solicitudes_pago (un solo pago, un solo
-- movimiento), una fila de planes_pago_cobranza puede recibir varios abonos
-- parciales; procesar_pago_cobranza (0019) sobrescribe movimiento_tesoreria_id
-- con el del ÚLTIMO abono en cada llamada, así que ese FK ya no basta para
-- saber cuánto dinero entró en total. Por eso esta función revierte
-- monto_pagado completo (la fuente de verdad de cuánto se ha cobrado) contra
-- cuenta_id (la última cuenta conocida), no solo el monto del último
-- movimiento — y por eso, como revertir_pago_solicitud, es una reversión
-- total de la fila, no una reversión parcial de un abono específico. Caso de
-- borde: si los abonos parciales de una misma fila se hicieron a cuentas
-- bancarias distintas, la reversión completa se aplica solo a la última
-- cuenta (cuenta_id), no se reparte entre las cuentas originales.
create or replace function public.revertir_pago_cobranza(
  p_plan_pago_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_plan record;
  v_contrato record;
  v_saldo_resultante numeric;
  v_mov_id uuid;
begin
  select * into v_plan from public.planes_pago_cobranza where id = p_plan_pago_id for update;
  if v_plan.id is null then
    raise exception 'Plan de pago % no encontrado', p_plan_pago_id;
  end if;

  if v_plan.monto_pagado is null or v_plan.monto_pagado <= 0 then
    raise exception 'Esta fila del plan de pagos no tiene abonos que revertir';
  end if;

  if v_plan.cuenta_id is null then
    raise exception 'La fila % no tiene cuenta asociada, no se puede revertir', p_plan_pago_id;
  end if;

  select cv.*, u.codigo_unidad, cl.nombre as cliente_nombre
    into v_contrato
    from public.contratos_venta cv
    join public.unidades u on u.id = cv.unidad_id
    join public.clientes cl on cl.id = cv.cliente_id
   where cv.id = v_plan.contrato_id;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual - v_plan.monto_pagado
   where id = v_plan.cuenta_id
   returning saldo_actual into v_saldo_resultante;

  if v_saldo_resultante is null then
    raise exception 'Cuenta bancaria % no encontrada', v_plan.cuenta_id;
  end if;

  insert into public.movimientos_tesoreria (
    cuenta_id, proyecto_id, tipo_movimiento, fecha, razon_social, concepto, monto, saldo_resultante, comentarios, plan_pago_cobranza_id
  ) values (
    v_plan.cuenta_id, v_contrato.proyecto_id, 'egreso', current_date, v_contrato.cliente_nombre,
    'Reversión de abono - ' || v_contrato.codigo_unidad || ' - ' || v_plan.tipo_pago,
    v_plan.monto_pagado, v_saldo_resultante,
    'Reversión automática de abono de Cobranza', p_plan_pago_id
  ) returning id into v_mov_id;

  update public.planes_pago_cobranza
     set monto_pagado = 0,
         estatus = 'Pendiente',
         fecha_pago = null,
         cuenta_id = null,
         movimiento_tesoreria_id = null
   where id = p_plan_pago_id;

  return jsonb_build_object('success', true, 'movimiento_id', v_mov_id);
end;
$$;
