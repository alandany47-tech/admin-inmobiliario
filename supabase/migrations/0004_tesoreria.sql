-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Agrega cuentas_bancarias, dispersión de pagos en solicitudes_pago, el
-- estado 'Pagado' y la función atómica que procesa el pago de una solicitud.

create table if not exists public.cuentas_bancarias (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  tipo varchar(30) not null check (tipo in ('Efectivo', 'Transferencia bancaria')),
  saldo_actual numeric(14, 2) not null default 0.00,
  created_at timestamptz not null default now()
);

alter table public.solicitudes_pago
  add column if not exists cuenta_id bigint references public.cuentas_bancarias(id),
  add column if not exists fecha_pago date;

alter table public.solicitudes_pago drop constraint if exists solicitudes_pago_estado_check;
alter table public.solicitudes_pago
  add constraint solicitudes_pago_estado_check
  check (estado in ('Por Autorizar', 'Autorizado', 'Pospuesto', 'Pagado', 'Cancelado'));

insert into public.cuentas_bancarias (nombre, tipo, saldo_actual)
values
  ('Caja Chica', 'Efectivo', 0.00),
  ('Fresh Coco Desarrollos Banregio', 'Transferencia bancaria', 0.00)
on conflict (nombre) do nothing;

alter table public.cuentas_bancarias enable row level security;

drop policy if exists "anon acceso total cuentas_bancarias" on public.cuentas_bancarias;
create policy "anon acceso total cuentas_bancarias" on public.cuentas_bancarias
  for all using (true) with check (true);

-- Dispersa el pago de una solicitud autorizada de forma atómica: determina
-- la cuenta según el método de pago, descuenta el saldo y marca el pago.
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
begin
  select metodo_pago, total, estado
    into v_metodo_pago, v_total, v_estado
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

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual - v_total
   where id = v_cuenta_id;

  update public.solicitudes_pago
     set estado = 'Pagado', cuenta_id = v_cuenta_id, fecha_pago = p_fecha_pago
   where id = p_solicitud_id;
end;
$$;
