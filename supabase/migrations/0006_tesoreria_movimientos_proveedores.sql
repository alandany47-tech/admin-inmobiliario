-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Bitácora de movimientos de tesorería (ingresos/egresos por cuenta), saldo
-- inicial editable por cuenta y soporte de eliminación/estatus de proveedores.
-- Nota: se numera 0006 porque 0005 ya está tomado por 0005_wbs_y_comprobantes.sql.
-- Nota: cuenta_id, proyecto_id y solicitud_id se definen bigint (no UUID) porque
-- cuentas_bancarias.id, proyectos.id y solicitudes_pago.id son bigint identity;
-- un FK a UUID no podría crearse contra esas columnas. El id propio de la
-- bitácora sí es UUID, como se pidió.

create extension if not exists pgcrypto;

alter table public.cuentas_bancarias
  add column if not exists saldo_inicial numeric(14, 2) not null default 0.00;

create table if not exists public.movimientos_tesoreria (
  id uuid primary key default gen_random_uuid(),
  cuenta_id bigint not null references public.cuentas_bancarias(id),
  proyecto_id bigint references public.proyectos(id),
  tipo_movimiento varchar(10) not null check (tipo_movimiento in ('ingreso', 'egreso')),
  fecha date not null default current_date,
  razon_social varchar(200),
  concepto text not null,
  monto numeric(14, 2) not null,
  saldo_resultante numeric(14, 2) not null,
  comentarios text,
  solicitud_id bigint references public.solicitudes_pago(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.movimientos_tesoreria enable row level security;

drop policy if exists "anon acceso total movimientos_tesoreria" on public.movimientos_tesoreria;
create policy "anon acceso total movimientos_tesoreria" on public.movimientos_tesoreria
  for all using (true) with check (true);

-- Ajusta el saldo inicial de una cuenta y traslada el mismo delta al saldo
-- actual, de forma atómica, para no perder el efecto de movimientos previos.
create or replace function public.actualizar_saldo_inicial_cuenta(p_cuenta_id bigint, p_saldo_inicial numeric)
returns public.cuentas_bancarias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas_bancarias;
begin
  update public.cuentas_bancarias
     set saldo_actual = saldo_actual - coalesce(saldo_inicial, 0) + p_saldo_inicial,
         saldo_inicial = p_saldo_inicial
   where id = p_cuenta_id
   returning * into v_cuenta;

  if not found then
    raise exception 'Cuenta % no encontrada', p_cuenta_id;
  end if;

  return v_cuenta;
end;
$$;

-- Registra un movimiento manual (ingreso/egreso), descuenta o abona el saldo
-- de la cuenta y calcula el saldo resultante de forma atómica.
create or replace function public.registrar_movimiento_tesoreria(
  p_cuenta_id bigint,
  p_proyecto_id bigint,
  p_tipo_movimiento varchar,
  p_fecha date,
  p_razon_social varchar,
  p_concepto text,
  p_monto numeric,
  p_comentarios text
)
returns public.movimientos_tesoreria
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo_resultante numeric(14, 2);
  v_movimiento public.movimientos_tesoreria;
begin
  if p_tipo_movimiento not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo_movimiento;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual + (case when p_tipo_movimiento = 'ingreso' then p_monto else -p_monto end)
   where id = p_cuenta_id
   returning saldo_actual into v_saldo_resultante;

  if not found then
    raise exception 'Cuenta % no encontrada', p_cuenta_id;
  end if;

  insert into public.movimientos_tesoreria (
    cuenta_id, proyecto_id, tipo_movimiento, fecha, razon_social, concepto, monto, saldo_resultante, comentarios
  ) values (
    p_cuenta_id, p_proyecto_id, p_tipo_movimiento, p_fecha, p_razon_social, p_concepto, p_monto, v_saldo_resultante, p_comentarios
  )
  returning * into v_movimiento;

  return v_movimiento;
end;
$$;

-- Redefine la dispersión de pago para que además quede registrada como
-- egreso en la bitácora de tesorería, ligada a la solicitud pagada.
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
  v_cuenta_id bigint;
  v_saldo_resultante numeric(14, 2);
  v_proveedor_razon_social text;
begin
  select metodo_pago, total, estado, proyecto_id, folio
    into v_metodo_pago, v_total, v_estado, v_proyecto_id, v_folio
    from public.solicitudes_pago
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;

  if v_estado <> 'Autorizado' then
    raise exception 'Solo se pueden pagar solicitudes autorizadas';
  end if;

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
