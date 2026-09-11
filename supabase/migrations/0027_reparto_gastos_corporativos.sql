-- Reparto de gastos corporativos: una solicitud puede pagarse sin WBS asignado
-- (es_corporativo = true) y repartirse después entre 2-4 partidas WBS destino.
-- El presupuesto ejercido de esas partidas se calcula (nunca se decrementa
-- physicamente wbs_catalog.presupuesto), igual que el resto del sistema:
-- se agrega una tabla hecho (solicitud_reparto_corporativo) y se amplía la
-- vista wbs_presupuesto_resumen para sumarla.

alter table public.solicitudes_pago
  add column es_corporativo boolean not null default false,
  add column reparto_estado varchar(20) not null default 'no_aplica'
    check (reparto_estado in ('no_aplica', 'pendiente_reparto', 'repartido')),
  add constraint solicitudes_pago_corporativo_sin_wbs
    check (not es_corporativo or wbs_catalog_id is null);

create table public.solicitud_reparto_corporativo (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references public.solicitudes_pago(id) on delete cascade,
  wbs_id bigint not null references public.wbs_catalog(id),
  monto numeric(14, 2) not null check (monto > 0),
  porcentaje numeric not null check (porcentaje > 0 and porcentaje <= 100),
  creado_por uuid references public.perfiles_usuario(id),
  created_at timestamptz not null default now(),
  unique (solicitud_id, wbs_id)
);

create index on public.solicitud_reparto_corporativo (solicitud_id);
create index on public.solicitud_reparto_corporativo (wbs_id);

alter table public.solicitud_reparto_corporativo enable row level security;

create policy "anon acceso total reparto corporativo" on public.solicitud_reparto_corporativo
  for all using (true) with check (true);

-- Amplía el cálculo de "ejercido" para incluir el reparto corporativo, sin
-- tocar el orden/shape de columnas de salida de la vista (0016).
create or replace view public.wbs_presupuesto_resumen as
with wbs_ejercido as (
  select
    c.id,
    c.proyecto_id,
    c.categoria,
    c.partida,
    c.presupuesto,
    c.activo,
    c.codigo,
    c.parent_id,
    coalesce(sum(s.total) filter (where s.estado = 'Pagado'), 0)
      + coalesce((
          select sum(src.monto)
          from public.solicitud_reparto_corporativo src
          join public.solicitudes_pago sp on sp.id = src.solicitud_id
          where src.wbs_id = c.id and sp.estado = 'Pagado'
        ), 0) as ejercido
  from public.wbs_catalog c
  left join public.solicitudes_pago s on s.wbs_catalog_id = c.id
  group by c.id, c.proyecto_id, c.categoria, c.partida, c.presupuesto, c.activo, c.codigo, c.parent_id
)
select
  e.id,
  e.proyecto_id,
  e.categoria,
  e.partida,
  e.presupuesto,
  e.activo,
  e.ejercido,
  e.presupuesto - e.ejercido as disponible,
  e.codigo,
  e.parent_id
from wbs_ejercido e;

-- Reparte el total de una solicitud corporativa pagada entre 2-4 partidas WBS
-- destino. Calcula los montos ella misma (no confía en montos del cliente):
-- round(total/N, 2) para cada partida salvo la última, que recibe el residuo
-- exacto para que la suma cuadre con el total.
create or replace function public.confirmar_reparto_corporativo(p_solicitud_id bigint, p_wbs_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_corporativo boolean;
  v_estado varchar(20);
  v_reparto_estado varchar(20);
  v_total numeric(14, 2);
  v_n int;
  v_monto_base numeric(14, 2);
  v_suma_asignada numeric(14, 2) := 0;
  v_wbs_id bigint;
  v_idx int := 0;
  v_monto numeric(14, 2);
begin
  v_n := array_length(p_wbs_ids, 1);
  if v_n is null or v_n < 2 or v_n > 4 then
    raise exception 'Selecciona entre 2 y 4 partidas WBS destino';
  end if;
  if v_n <> (select count(distinct w) from unnest(p_wbs_ids) w) then
    raise exception 'No repitas la misma partida WBS en el reparto';
  end if;

  select es_corporativo, estado, reparto_estado, total
    into v_es_corporativo, v_estado, v_reparto_estado, v_total
    from public.solicitudes_pago
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;
  if not v_es_corporativo then
    raise exception 'La solicitud % no es un gasto corporativo', p_solicitud_id;
  end if;
  if v_estado <> 'Pagado' then
    raise exception 'Solo se puede repartir una solicitud en estado Pagado (actual: %)', v_estado;
  end if;
  if v_reparto_estado <> 'pendiente_reparto' then
    raise exception 'La solicitud % no está pendiente de reparto (actual: %)', p_solicitud_id, v_reparto_estado;
  end if;

  v_monto_base := round(v_total / v_n, 2);

  foreach v_wbs_id in array p_wbs_ids loop
    v_idx := v_idx + 1;
    if v_idx < v_n then
      v_monto := v_monto_base;
    else
      v_monto := v_total - v_suma_asignada;
    end if;
    v_suma_asignada := v_suma_asignada + v_monto;

    insert into public.solicitud_reparto_corporativo (solicitud_id, wbs_id, monto, porcentaje, creado_por)
    values (p_solicitud_id, v_wbs_id, v_monto, round(100.0 / v_n, 2), auth.uid());
  end loop;

  update public.solicitudes_pago set reparto_estado = 'repartido' where id = p_solicitud_id;
end;
$$;

-- Reemplaza revertir_pago_solicitud (0013) agregando cascada: si la solicitud
-- ya fue repartida, borra el reparto y la deja pendiente de re-repartir antes
-- de restaurar el saldo, para que nunca quede "ejercido" fantasma en los WBS.
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
