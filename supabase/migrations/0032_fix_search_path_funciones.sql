-- function_search_path_mutable (WARN, get_advisors del 2026-09-11): 3 funciones
-- sin `search_path` fijo. Sin este ajuste, la función resuelve `public.` (y
-- cualquier tabla sin schema explícito) según el search_path de quien llama,
-- lo que en teoría permite a un rol con privilegios para crear objetos en
-- otro schema listado antes que "public" hacer que la función use una tabla
-- suplantada en vez de la real. Fix de solo metadato (`SET search_path =
-- public`) sobre la definición vigente vía `pg_get_functiondef`, sin tocar
-- la lógica de ninguna de las 3.

CREATE OR REPLACE FUNCTION public.wbs_catalog_autogenerar_codigo_raiz()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.procesar_pago_cobranza(p_plan_pago_id uuid, p_cuenta_id bigint, p_monto numeric, p_fecha_pago timestamp with time zone, p_metodo_pago text DEFAULT 'Transferencia bancaria'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
declare
  v_plan record;
  v_contrato record;
  v_mov_id uuid;
  v_saldo_actual numeric;
  v_monto_pagado_nuevo numeric;
begin
  select * into v_plan from public.planes_pago_cobranza where id = p_plan_pago_id for update;
  if v_plan.id is null then
    raise exception 'Plan de pago no encontrado';
  end if;

  select cv.*, u.codigo_unidad, cl.nombre as cliente_nombre
    into v_contrato
    from public.contratos_venta cv
    join public.unidades u on u.id = cv.unidad_id
    join public.clientes cl on cl.id = cv.cliente_id
   where cv.id = v_plan.contrato_id;

  select saldo_actual into v_saldo_actual from public.cuentas_bancarias where id = p_cuenta_id for update;
  if v_saldo_actual is null then
    raise exception 'Cuenta bancaria % no encontrada', p_cuenta_id;
  end if;
  v_saldo_actual := v_saldo_actual + p_monto;

  insert into public.movimientos_tesoreria (
    cuenta_id, proyecto_id, tipo_movimiento, fecha, razon_social, concepto, monto, saldo_resultante, comentarios, plan_pago_cobranza_id
  ) values (
    p_cuenta_id, v_contrato.proyecto_id, 'ingreso', coalesce(p_fecha_pago, now()),
    v_contrato.cliente_nombre,
    'COBRANZA: ' || v_contrato.codigo_unidad || ' - ' || v_plan.tipo_pago,
    p_monto, v_saldo_actual, 'Ingreso procesado desde Módulo de Cobranza (' || p_metodo_pago || ')', p_plan_pago_id
  ) returning id into v_mov_id;

  update public.cuentas_bancarias set saldo_actual = v_saldo_actual where id = p_cuenta_id;

  v_monto_pagado_nuevo := v_plan.monto_pagado + p_monto;

  update public.planes_pago_cobranza
     set monto_pagado = v_monto_pagado_nuevo,
         estatus = case when v_monto_pagado_nuevo >= monto_programado then 'Pagado' else 'Parcial' end,
         fecha_pago = coalesce(p_fecha_pago, now()),
         cuenta_id = p_cuenta_id,
         movimiento_tesoreria_id = v_mov_id
   where id = p_plan_pago_id;

  return jsonb_build_object('success', true, 'movimiento_id', v_mov_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.revertir_pago_cobranza(p_plan_pago_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
$function$;
