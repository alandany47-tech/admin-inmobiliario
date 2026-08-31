-- Módulo de Cobranza y Selección de Unidades: clientes, inventario de
-- unidades por proyecto, contratos de venta y plan de pagos por
-- amortización, con dispersión atómica a Tesorería vía
-- procesar_pago_cobranza (mismo patrón que procesar_pago_solicitud).

-- 1. Clientes
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc text null,
  telefono text null,
  email text null,
  created_at timestamptz not null default now()
);

-- 2. Unidades del Desarrollo
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  proyecto_id bigint not null references public.proyectos(id) on delete restrict,
  codigo_unidad text not null,
  superficie_m2 numeric(10, 2) not null default 0,
  tipo_unidad text not null default 'CLIENTE' check (tipo_unidad in ('CLIENTE', 'INVERSIONISTA', 'SIN ASIGNAR')),
  monto_lista numeric(14, 2) not null default 0,
  estatus text not null default 'Disponible' check (estatus in ('Disponible', 'Apartada', 'Vendida')),
  created_at timestamptz not null default now(),
  unique (proyecto_id, codigo_unidad)
);

-- 3. Contratos / Ventas
create table if not exists public.contratos_venta (
  id uuid primary key default gen_random_uuid(),
  proyecto_id bigint not null references public.proyectos(id),
  unidad_id uuid not null references public.unidades(id),
  cliente_id uuid not null references public.clientes(id),
  monto_total_venta numeric(14, 2) not null,
  fecha_contrato date not null default current_date,
  estatus text not null default 'Activo' check (estatus in ('Activo', 'Finiquitado', 'Cancelado')),
  created_at timestamptz not null default now()
);

create index if not exists idx_contratos_venta_cliente_id on public.contratos_venta (cliente_id);
create index if not exists idx_contratos_venta_unidad_id on public.contratos_venta (unidad_id);

-- 4. Amortización y Plan de Pagos
create table if not exists public.planes_pago_cobranza (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_venta(id) on delete cascade,
  tipo_pago text not null check (tipo_pago in ('ENGANCHE', 'MENSUALIDAD', 'A ENTREGA', 'SEPARACION')),
  monto_programado numeric(14, 2) not null,
  monto_pagado numeric(14, 2) not null default 0,
  fecha_programada date not null,
  fecha_pago timestamptz null,
  estatus text not null default 'Pendiente' check (estatus in ('Pendiente', 'Pagado', 'Vencido', 'Parcial')),
  cuenta_id bigint null references public.cuentas_bancarias(id),
  movimiento_tesoreria_id uuid null references public.movimientos_tesoreria(id),
  folio_recibo text null,
  notas text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_planes_pago_cobranza_contrato_id on public.planes_pago_cobranza (contrato_id);

-- Columna de trazabilidad simétrica a `solicitud_id`: permite identificar en
-- la bitácora de Tesorería qué ingresos vienen de Cobranza. No se modifican
-- editar_movimiento_tesoreria/eliminar_movimiento_tesoreria en esta
-- migración: solo saben sincronizar solicitudes_pago vía solicitud_id, así
-- que editar/eliminar desde Tesorería un ingreso de Cobranza ajusta el saldo
-- de la cuenta correctamente pero puede desfasar
-- planes_pago_cobranza.monto_pagado/estatus (igual que el caso ya
-- documentado de reversiones vía solicitud_id) — pendiente si se necesita.
alter table public.movimientos_tesoreria
  add column if not exists plan_pago_cobranza_id uuid references public.planes_pago_cobranza(id) on delete set null;

-- RLS
alter table public.clientes enable row level security;
alter table public.unidades enable row level security;
alter table public.contratos_venta enable row level security;
alter table public.planes_pago_cobranza enable row level security;

drop policy if exists "anon acceso total clientes" on public.clientes;
create policy "anon acceso total clientes" on public.clientes for all using (true) with check (true);

drop policy if exists "anon acceso total unidades" on public.unidades;
create policy "anon acceso total unidades" on public.unidades for all using (true) with check (true);

drop policy if exists "anon acceso total contratos_venta" on public.contratos_venta;
create policy "anon acceso total contratos_venta" on public.contratos_venta for all using (true) with check (true);

drop policy if exists "anon acceso total planes_pago_cobranza" on public.planes_pago_cobranza;
create policy "anon acceso total planes_pago_cobranza" on public.planes_pago_cobranza for all using (true) with check (true);

-- RPC atómica: registra el abono de una fila del plan de pagos e ingresa el
-- movimiento correspondiente en Tesorería, igual que procesar_pago_solicitud.
create or replace function public.procesar_pago_cobranza(
  p_plan_pago_id uuid,
  p_cuenta_id bigint,
  p_monto numeric,
  p_fecha_pago timestamptz,
  p_metodo_pago text default 'Transferencia bancaria'
) returns jsonb
language plpgsql
as $$
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
$$;
