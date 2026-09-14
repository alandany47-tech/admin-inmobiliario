-- Cierre de RLS por permisos de módulo — hasta ahora TODAS las tablas de
-- negocio (desde 0001) tenían policy "anon acceso total <tabla>" sin
-- cláusula `to <rol>` — aplica a PUBLIC, incluido `anon`. server.js usa la
-- anon key (no service_role) para todo, y esa key es pública
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY, vive en el bundle del cliente), así que
-- RLS era el único gate real de acceso a datos y estaba abierto. El deploy
-- de pruebas ya está en línea, así que se cierra ahora.
--
-- En vez de mapear el enum fijo rol_usuario (SOLICITANTE/APROBADOR/
-- TESORERIA/ADMIN, 0023) a las áreas reales del negocio (Ventas, Operaciones,
-- Administración/Tesorería, Marketing), se construye un sistema de permisos
-- granular por módulo — más flexible y no hay que rediseñar RLS otra vez
-- cuando cambien las áreas. `rol` se queda intacto: sigue siendo la única
-- fuente de es_admin() (ADMIN = bypass total de la matriz, para no poder
-- auto-bloquearse con una mala configuración).
--
-- Las 8 funciones RPC que mueven dinero/estado (procesar_pago_solicitud,
-- autorizar_solicitud, editar/eliminar_movimiento_tesoreria,
-- registrar_movimiento_tesoreria, actualizar_saldo_inicial_cuenta,
-- confirmar_reparto_corporativo, revertir_pago_solicitud) + una de solo
-- lectura (get_proyectos_con_estadisticas) son SECURITY DEFINER con dueño
-- `postgres`, que tiene BYPASSRLS (confirmado vía pg_roles/pg_proc) —
-- cerrar las tablas NO las protege, porque bypasean RLS por diseño y
-- ninguna validaba nada adentro del propio SQL. Se les agrega el mismo
-- candado tiene_acceso() que usan las policies de tabla.

-- ============================================================
-- 1. Esquema de permisos por módulo
-- ============================================================

create type public.nivel_acceso as enum ('sin_acceso', 'lectura', 'lectura_escritura');

create table public.modulos (
  clave text primary key,
  nombre text not null
);

insert into public.modulos (clave, nombre) values
  ('SOLICITUDES', 'Solicitudes de pago'),
  ('TESORERIA', 'Tesorería'),
  ('WBS', 'Presupuesto WBS'),
  ('PROYECTOS', 'Proyectos'),
  ('PROVEEDORES', 'Proveedores'),
  ('UNIDADES', 'Unidades'),
  ('COTIZADOR', 'Cotizador'),
  ('COBRANZA', 'Cobranza'),
  ('CONFIGURACION', 'Configuración');

create table public.permisos_usuario (
  usuario_id uuid not null references public.perfiles_usuario(id) on delete cascade,
  modulo text not null references public.modulos(clave),
  nivel public.nivel_acceso not null default 'sin_acceso',
  primary key (usuario_id, modulo)
);

alter table public.modulos enable row level security;
create policy "select modulos autenticado" on public.modulos
  for select using ( auth.uid() is not null );

alter table public.permisos_usuario enable row level security;

create policy "select permisos propios o admin" on public.permisos_usuario
  for select using ( usuario_id = auth.uid() or public.es_admin() );

create policy "escritura permisos admin" on public.permisos_usuario
  for all using ( public.es_admin() ) with check ( public.es_admin() );

-- Helper reusado en todas las policies de tabla y en los RPCs — mismo patrón
-- que get_mi_rol()/es_admin() (0023): SECURITY DEFINER sobre su propia tabla
-- evita la recursión infinita de RLS.
create or replace function public.tiene_acceso(p_modulo text, p_nivel_minimo public.nivel_acceso)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.es_admin() or exists (
    select 1 from public.permisos_usuario
    where usuario_id = auth.uid()
      and modulo = p_modulo
      and (
        (p_nivel_minimo = 'lectura' and nivel in ('lectura', 'lectura_escritura'))
        or (p_nivel_minimo = 'lectura_escritura' and nivel = 'lectura_escritura')
      )
  );
$$;

-- No se backfillea permisos_usuario para usuarios existentes: no hay forma
-- confiable de mapear su rol viejo (SOLICITANTE/APROBADOR/TESORERIA) a las
-- áreas nuevas sin adivinar. Quedan en sin_acceso a todo (salvo ADMIN, que
-- bypasea) hasta que se les asignen módulos desde el panel extendido.

-- ============================================================
-- 2. Columnas usuario_id (para que SOLICITANTE-equivalentes vean solo lo suyo)
-- ============================================================

alter table public.solicitudes_pago
  add column usuario_id uuid references public.perfiles_usuario(id) default auth.uid();

alter table public.cotizaciones
  add column usuario_id uuid references public.perfiles_usuario(id) default auth.uid();

-- ============================================================
-- 3. Candados de módulo dentro de las funciones SECURITY DEFINER
--    (bypasean RLS por dueño postgres, necesitan su propio candado)
-- ============================================================

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
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para dispersar un pago';
  end if;

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
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para revertir un pago';
  end if;

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

create or replace function public.editar_movimiento_tesoreria(
  p_movimiento_id uuid,
  p_nuevo_monto numeric
)
returns public.movimientos_tesoreria
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cuenta_id bigint;
  v_tipo_movimiento varchar(10);
  v_monto_anterior numeric(14, 2);
  v_solicitud_id bigint;
  v_saldo_actual numeric(14, 2);
  v_movimiento public.movimientos_tesoreria;
begin
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para editar un movimiento';
  end if;

  if p_nuevo_monto is null or p_nuevo_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  select cuenta_id, tipo_movimiento, monto, solicitud_id
    into v_cuenta_id, v_tipo_movimiento, v_monto_anterior, v_solicitud_id
    from public.movimientos_tesoreria
   where id = p_movimiento_id
   for update;

  if not found then
    raise exception 'Movimiento % no encontrado', p_movimiento_id;
  end if;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual
       + (case when v_tipo_movimiento = 'ingreso' then 1 else -1 end) * (p_nuevo_monto - v_monto_anterior)
   where id = v_cuenta_id
   returning saldo_actual into v_saldo_actual;

  update public.movimientos_tesoreria
     set monto = p_nuevo_monto, saldo_resultante = v_saldo_actual
   where id = p_movimiento_id
   returning * into v_movimiento;

  if v_solicitud_id is not null then
    update public.solicitudes_pago set total = p_nuevo_monto where id = v_solicitud_id;
  end if;

  return v_movimiento;
end;
$$;

create or replace function public.eliminar_movimiento_tesoreria(p_movimiento_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cuenta_id bigint;
  v_tipo_movimiento varchar(10);
  v_monto numeric(14, 2);
  v_solicitud_id bigint;
  v_estado_solicitud varchar(20);
  v_saldo_actual numeric(14, 2);
begin
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para eliminar un movimiento';
  end if;

  select cuenta_id, tipo_movimiento, monto, solicitud_id
    into v_cuenta_id, v_tipo_movimiento, v_monto, v_solicitud_id
    from public.movimientos_tesoreria
   where id = p_movimiento_id
   for update;

  if not found then
    raise exception 'Movimiento % no encontrado', p_movimiento_id;
  end if;

  update public.cuentas_bancarias
     set saldo_actual = saldo_actual + (case when v_tipo_movimiento = 'egreso' then 1 else -1 end) * v_monto
   where id = v_cuenta_id
   returning saldo_actual into v_saldo_actual;

  if v_solicitud_id is not null then
    select estado into v_estado_solicitud from public.solicitudes_pago where id = v_solicitud_id for update;

    if v_estado_solicitud = 'Pagado' then
      update public.solicitudes_pago
         set estado = 'Autorizado', fecha_pago = null, cuenta_id = null
       where id = v_solicitud_id;
    end if;
  end if;

  delete from public.movimientos_tesoreria where id = p_movimiento_id;

  return v_saldo_actual;
end;
$$;

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
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para registrar un movimiento';
  end if;

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

create or replace function public.actualizar_saldo_inicial_cuenta(p_cuenta_id bigint, p_saldo_inicial numeric)
returns public.cuentas_bancarias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas_bancarias;
begin
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para ajustar el saldo inicial';
  end if;

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
  if not public.tiene_acceso('TESORERIA', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo TESORERIA para repartir un gasto corporativo';
  end if;

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

create or replace function public.autorizar_solicitud(p_solicitud_id bigint, p_nuevo_estado varchar(20))
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tiene_acceso('SOLICITUDES', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo SOLICITUDES para autorizar una solicitud';
  end if;

  if p_nuevo_estado not in ('Autorizado', 'Pospuesto', 'Cancelado') then
    raise exception 'Estado no válido: %', p_nuevo_estado;
  end if;

  update public.solicitudes_pago set estado = p_nuevo_estado where id = p_solicitud_id;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;

  if p_nuevo_estado = 'Autorizado' and auth.uid() is not null then
    insert into public.solicitud_autorizaciones (solicitud_id, usuario_id)
    values (p_solicitud_id, auth.uid())
    on conflict (solicitud_id, usuario_id) do nothing;
  end if;
end;
$$;

-- Solo lectura, pero también SECURITY DEFINER + dueño postgres (bypasea
-- RLS). Se convierte de `language sql` a `plpgsql` para poder validar el
-- candado antes de devolver filas — mismo shape de retorno, misma consulta.
create or replace function public.get_proyectos_con_estadisticas()
returns table (
  id bigint,
  codigo text,
  nombre text,
  presupuesto numeric,
  total_pagado numeric,
  total_partidas_wbs bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tiene_acceso('PROYECTOS', 'lectura') then
    raise exception 'No autorizado: se requiere acceso de lectura al módulo PROYECTOS';
  end if;

  return query
  select
    p.id,
    p.codigo,
    p.nombre,
    p.presupuesto,
    coalesce(sp.total_pagado, 0) as total_pagado,
    coalesce(wc.total_partidas, 0) as total_partidas_wbs,
    p.created_at
  from public.proyectos p
  left join (
    select proyecto_id, sum(total) as total_pagado
    from public.solicitudes_pago
    where estado = 'Pagado'
    group by proyecto_id
  ) sp on sp.proyecto_id = p.id
  left join (
    select proyecto_id, count(*) as total_partidas
    from public.wbs_catalog
    group by proyecto_id
  ) wc on wc.proyecto_id = p.id
  order by p.codigo;
end;
$$;

-- ============================================================
-- 4. Políticas RLS por tabla (reemplazan "anon acceso total")
-- ============================================================

-- solicitudes_pago (módulo SOLICITUDES): dueño ve/crea lo suyo; cualquiera
-- con acceso de lectura/escritura al módulo ve/gestiona todo.
drop policy if exists "anon acceso total solicitudes_pago" on public.solicitudes_pago;

create policy "select solicitudes propias o modulo" on public.solicitudes_pago
  for select using (
    public.tiene_acceso('SOLICITUDES', 'lectura') or usuario_id = auth.uid()
  );

create policy "insert solicitudes autenticado" on public.solicitudes_pago
  for insert with check ( auth.uid() is not null and usuario_id = auth.uid() );

create policy "update solicitudes modulo" on public.solicitudes_pago
  for update using ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') )
  with check ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') );

create policy "delete solicitudes modulo" on public.solicitudes_pago
  for delete using ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') );

-- proveedores (módulo PROVEEDORES): lectura general para quien tenga acceso,
-- cualquier autenticado puede dar de alta uno nuevo (se hace al vuelo al
-- crear una solicitud), edición/borrado requiere escritura del módulo.
drop policy if exists "anon acceso total proveedores" on public.proveedores;

create policy "select proveedores modulo" on public.proveedores
  for select using ( public.tiene_acceso('PROVEEDORES', 'lectura') );

create policy "insert proveedores autenticado" on public.proveedores
  for insert with check ( auth.uid() is not null );

create policy "update proveedores modulo" on public.proveedores
  for update using ( public.tiene_acceso('PROVEEDORES', 'lectura_escritura') )
  with check ( public.tiene_acceso('PROVEEDORES', 'lectura_escritura') );

create policy "delete proveedores modulo" on public.proveedores
  for delete using ( public.tiene_acceso('PROVEEDORES', 'lectura_escritura') );

-- cuentas_bancarias / movimientos_tesoreria (módulo TESORERIA).
drop policy if exists "anon acceso total cuentas_bancarias" on public.cuentas_bancarias;

create policy "select cuentas modulo" on public.cuentas_bancarias
  for select using ( public.tiene_acceso('TESORERIA', 'lectura') );

create policy "insert cuentas modulo" on public.cuentas_bancarias
  for insert with check ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

create policy "update cuentas modulo" on public.cuentas_bancarias
  for update using ( public.tiene_acceso('TESORERIA', 'lectura_escritura') )
  with check ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

create policy "delete cuentas modulo" on public.cuentas_bancarias
  for delete using ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

drop policy if exists "anon acceso total movimientos_tesoreria" on public.movimientos_tesoreria;

create policy "select movimientos modulo" on public.movimientos_tesoreria
  for select using ( public.tiene_acceso('TESORERIA', 'lectura') );

create policy "insert movimientos modulo" on public.movimientos_tesoreria
  for insert with check ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

create policy "update movimientos modulo" on public.movimientos_tesoreria
  for update using ( public.tiene_acceso('TESORERIA', 'lectura_escritura') )
  with check ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

create policy "delete movimientos modulo" on public.movimientos_tesoreria
  for delete using ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

-- wbs_catalog / wbs_historial_cambios (módulo WBS) — Operaciones edita
-- presupuesto directo, por eso WBS en lectura_escritura alcanza (no se
-- restringe aparte a ADMIN como en el diseño anterior).
drop policy if exists "anon acceso total wbs_catalog" on public.wbs_catalog;

create policy "select wbs modulo" on public.wbs_catalog
  for select using ( public.tiene_acceso('WBS', 'lectura') );

create policy "insert wbs modulo" on public.wbs_catalog
  for insert with check ( public.tiene_acceso('WBS', 'lectura_escritura') );

create policy "update wbs modulo" on public.wbs_catalog
  for update using ( public.tiene_acceso('WBS', 'lectura_escritura') )
  with check ( public.tiene_acceso('WBS', 'lectura_escritura') );

create policy "delete wbs modulo" on public.wbs_catalog
  for delete using ( public.tiene_acceso('WBS', 'lectura_escritura') );

drop policy if exists "anon acceso total wbs_historial_cambios" on public.wbs_historial_cambios;

create policy "select historial wbs modulo" on public.wbs_historial_cambios
  for select using ( public.tiene_acceso('WBS', 'lectura') );

create policy "insert historial wbs modulo" on public.wbs_historial_cambios
  for insert with check ( public.tiene_acceso('WBS', 'lectura_escritura') );

create policy "update historial wbs modulo" on public.wbs_historial_cambios
  for update using ( public.tiene_acceso('WBS', 'lectura_escritura') )
  with check ( public.tiene_acceso('WBS', 'lectura_escritura') );

create policy "delete historial wbs modulo" on public.wbs_historial_cambios
  for delete using ( public.tiene_acceso('WBS', 'lectura_escritura') );

-- proyectos (módulo PROYECTOS).
drop policy if exists "anon acceso total proyectos" on public.proyectos;

create policy "select proyectos modulo" on public.proyectos
  for select using ( public.tiene_acceso('PROYECTOS', 'lectura') );

create policy "insert proyectos modulo" on public.proyectos
  for insert with check ( public.tiene_acceso('PROYECTOS', 'lectura_escritura') );

create policy "update proyectos modulo" on public.proyectos
  for update using ( public.tiene_acceso('PROYECTOS', 'lectura_escritura') )
  with check ( public.tiene_acceso('PROYECTOS', 'lectura_escritura') );

create policy "delete proyectos modulo" on public.proyectos
  for delete using ( public.tiene_acceso('PROYECTOS', 'lectura_escritura') );

-- clientes: vive bajo COBRANZA, pero Marketing solo tiene UNIDADES y
-- necesita el directorio de clientes sin ver contratos/planes de pago
-- (info financiera). SELECT acepta COBRANZA o UNIDADES en lectura+; no se
-- crea un módulo aparte solo para esto.
drop policy if exists "anon acceso total clientes" on public.clientes;

create policy "select clientes modulo" on public.clientes
  for select using (
    public.tiene_acceso('COBRANZA', 'lectura') or public.tiene_acceso('UNIDADES', 'lectura')
  );

create policy "insert clientes modulo" on public.clientes
  for insert with check ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

create policy "update clientes modulo" on public.clientes
  for update using ( public.tiene_acceso('COBRANZA', 'lectura_escritura') )
  with check ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

create policy "delete clientes modulo" on public.clientes
  for delete using ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

-- unidades (módulo UNIDADES) — Ventas registra separaciones (cambia
-- estatus) directo sin RPC, por eso UNIDADES lectura_escritura alcanza para
-- todo el flujo, sin excepción aparte.
drop policy if exists "anon acceso total unidades" on public.unidades;

create policy "select unidades modulo" on public.unidades
  for select using ( public.tiene_acceso('UNIDADES', 'lectura') );

create policy "insert unidades modulo" on public.unidades
  for insert with check ( public.tiene_acceso('UNIDADES', 'lectura_escritura') );

create policy "update unidades modulo" on public.unidades
  for update using ( public.tiene_acceso('UNIDADES', 'lectura_escritura') )
  with check ( public.tiene_acceso('UNIDADES', 'lectura_escritura') );

create policy "delete unidades modulo" on public.unidades
  for delete using ( public.tiene_acceso('UNIDADES', 'lectura_escritura') );

-- contratos_venta / planes_pago_cobranza (módulo COBRANZA) — marcar un plan
-- como pagado hoy solo pasa por procesar_pago_cobranza (RPC, ya bypasea
-- RLS); la policy de UPDATE de la tabla queda igual de amplia que
-- INSERT/SELECT por si algún día se actualiza directo, es más simple que
-- inventar un módulo TESORERIA-en-cobranza para un caso que hoy no existe.
drop policy if exists "anon acceso total contratos_venta" on public.contratos_venta;

create policy "select contratos modulo" on public.contratos_venta
  for select using ( public.tiene_acceso('COBRANZA', 'lectura') );

create policy "insert contratos modulo" on public.contratos_venta
  for insert with check ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

create policy "update contratos modulo" on public.contratos_venta
  for update using ( public.tiene_acceso('COBRANZA', 'lectura_escritura') )
  with check ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

create policy "delete contratos modulo" on public.contratos_venta
  for delete using ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

drop policy if exists "anon acceso total planes_pago_cobranza" on public.planes_pago_cobranza;

create policy "select planes modulo" on public.planes_pago_cobranza
  for select using ( public.tiene_acceso('COBRANZA', 'lectura') );

create policy "insert planes modulo" on public.planes_pago_cobranza
  for insert with check ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

create policy "update planes modulo" on public.planes_pago_cobranza
  for update using ( public.tiene_acceso('COBRANZA', 'lectura_escritura') )
  with check ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

create policy "delete planes modulo" on public.planes_pago_cobranza
  for delete using ( public.tiene_acceso('COBRANZA', 'lectura_escritura') );

-- configuracion_plantillas / configuracion_empresa (módulo CONFIGURACION).
drop policy if exists "anon acceso total configuracion_plantillas" on public.configuracion_plantillas;

create policy "select config plantillas modulo" on public.configuracion_plantillas
  for select using ( public.tiene_acceso('CONFIGURACION', 'lectura') );

create policy "insert config plantillas modulo" on public.configuracion_plantillas
  for insert with check ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

create policy "update config plantillas modulo" on public.configuracion_plantillas
  for update using ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') )
  with check ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

create policy "delete config plantillas modulo" on public.configuracion_plantillas
  for delete using ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

drop policy if exists "anon acceso total configuracion empresa" on public.configuracion_empresa;

create policy "select config empresa modulo" on public.configuracion_empresa
  for select using ( public.tiene_acceso('CONFIGURACION', 'lectura') );

create policy "insert config empresa modulo" on public.configuracion_empresa
  for insert with check ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

create policy "update config empresa modulo" on public.configuracion_empresa
  for update using ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') )
  with check ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

create policy "delete config empresa modulo" on public.configuracion_empresa
  for delete using ( public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

-- cotizaciones (módulo COTIZADOR): dueño ve/borra lo suyo; cualquiera con
-- lectura del módulo ve todas.
drop policy if exists "anon acceso total cotizaciones" on public.cotizaciones;

create policy "select cotizaciones propias o modulo" on public.cotizaciones
  for select using (
    public.tiene_acceso('COTIZADOR', 'lectura') or usuario_id = auth.uid()
  );

create policy "insert cotizaciones autenticado" on public.cotizaciones
  for insert with check ( auth.uid() is not null and usuario_id = auth.uid() );

create policy "update cotizaciones modulo" on public.cotizaciones
  for update using ( public.tiene_acceso('COTIZADOR', 'lectura_escritura') )
  with check ( public.tiene_acceso('COTIZADOR', 'lectura_escritura') );

create policy "delete cotizaciones propias o modulo" on public.cotizaciones
  for delete using ( usuario_id = auth.uid() or public.tiene_acceso('COTIZADOR', 'lectura_escritura') );

-- solicitud_reparto_corporativo (módulo TESORERIA — es quien confirma el
-- reparto). Escritura real vía RPC confirmar_reparto_corporativo (ya con su
-- propio candado); las policies de tabla son defensa adicional.
drop policy if exists "anon acceso total reparto corporativo" on public.solicitud_reparto_corporativo;

create policy "select reparto modulo" on public.solicitud_reparto_corporativo
  for select using ( public.tiene_acceso('TESORERIA', 'lectura') );

create policy "insert reparto modulo" on public.solicitud_reparto_corporativo
  for insert with check ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

create policy "update reparto modulo" on public.solicitud_reparto_corporativo
  for update using ( public.tiene_acceso('TESORERIA', 'lectura_escritura') )
  with check ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

create policy "delete reparto modulo" on public.solicitud_reparto_corporativo
  for delete using ( public.tiene_acceso('TESORERIA', 'lectura_escritura') );

-- solicitud_autorizaciones (módulo SOLICITUDES): bitácora de quién autorizó
-- qué. INSERT real vía RPC autorizar_solicitud (ya con candado); aquí solo
-- lectura de quien tenga acceso a SOLICITUDES, escritura directa reservada
-- a quien tenga escritura del módulo (además de la vía RPC).
drop policy if exists "anon acceso total autorizaciones" on public.solicitud_autorizaciones;

create policy "select autorizaciones modulo" on public.solicitud_autorizaciones
  for select using ( public.tiene_acceso('SOLICITUDES', 'lectura') );

create policy "insert autorizaciones modulo" on public.solicitud_autorizaciones
  for insert with check ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') );

create policy "update autorizaciones modulo" on public.solicitud_autorizaciones
  for update using ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') )
  with check ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') );

create policy "delete autorizaciones modulo" on public.solicitud_autorizaciones
  for delete using ( public.tiene_acceso('SOLICITUDES', 'lectura_escritura') );

-- folios_consecutivos: getFolioPreview() (solicitudes.js, usada en vivo por
-- SolicitudPagoForm.js) la lee directo — deny-all a secas la habría dejado
-- muda (sin error, el preview siempre en "001"). SELECT para autenticados;
-- INSERT/UPDATE/DELETE siguen sin policy — solo los toca el trigger
-- generar_folio_solicitud(), que bypasea RLS por dueño postgres.
create policy "select folios autenticado" on public.folios_consecutivos
  for select using ( auth.uid() is not null );

-- ============================================================
-- 5. Buckets de storage.objects
-- ============================================================

-- comprobantes (TESORERIA): comprobante legado vía Supabase Storage.
drop policy if exists "anon acceso total comprobantes" on storage.objects;
create policy "comprobantes modulo" on storage.objects
  for all using ( bucket_id = 'comprobantes' and public.tiene_acceso('TESORERIA', 'lectura_escritura') )
  with check ( bucket_id = 'comprobantes' and public.tiene_acceso('TESORERIA', 'lectura_escritura') );

-- logos-proyectos / logos-plantillas / logos-empresa / renders-unidades:
-- branding/catálogo. Lectura abierta a cualquier autenticado a propósito
-- (aparecen en PDFs y pantallas de módulos distintos al que los administra,
-- ej. el logo del proyecto sale en el PDF de una solicitud); solo quien
-- tiene escritura del módulo dueño puede subir/editar/borrar.
drop policy if exists "anon acceso total logos proyectos" on storage.objects;
create policy "logos proyectos lectura autenticado" on storage.objects
  for select using ( bucket_id = 'logos-proyectos' and auth.uid() is not null );
create policy "logos proyectos escritura modulo" on storage.objects
  for insert with check ( bucket_id = 'logos-proyectos' and public.tiene_acceso('PROYECTOS', 'lectura_escritura') );
create policy "logos proyectos update modulo" on storage.objects
  for update using ( bucket_id = 'logos-proyectos' and public.tiene_acceso('PROYECTOS', 'lectura_escritura') )
  with check ( bucket_id = 'logos-proyectos' and public.tiene_acceso('PROYECTOS', 'lectura_escritura') );
create policy "logos proyectos delete modulo" on storage.objects
  for delete using ( bucket_id = 'logos-proyectos' and public.tiene_acceso('PROYECTOS', 'lectura_escritura') );

drop policy if exists "anon acceso total logos plantillas" on storage.objects;
create policy "logos plantillas lectura autenticado" on storage.objects
  for select using ( bucket_id = 'logos-plantillas' and auth.uid() is not null );
create policy "logos plantillas escritura modulo" on storage.objects
  for insert with check ( bucket_id = 'logos-plantillas' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );
create policy "logos plantillas update modulo" on storage.objects
  for update using ( bucket_id = 'logos-plantillas' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') )
  with check ( bucket_id = 'logos-plantillas' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );
create policy "logos plantillas delete modulo" on storage.objects
  for delete using ( bucket_id = 'logos-plantillas' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

drop policy if exists "anon acceso total logos empresa" on storage.objects;
create policy "logos empresa lectura autenticado" on storage.objects
  for select using ( bucket_id = 'logos-empresa' and auth.uid() is not null );
create policy "logos empresa escritura modulo" on storage.objects
  for insert with check ( bucket_id = 'logos-empresa' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );
create policy "logos empresa update modulo" on storage.objects
  for update using ( bucket_id = 'logos-empresa' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') )
  with check ( bucket_id = 'logos-empresa' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );
create policy "logos empresa delete modulo" on storage.objects
  for delete using ( bucket_id = 'logos-empresa' and public.tiene_acceso('CONFIGURACION', 'lectura_escritura') );

drop policy if exists "anon acceso total renders unidades" on storage.objects;
create policy "renders unidades lectura autenticado" on storage.objects
  for select using ( bucket_id = 'renders-unidades' and auth.uid() is not null );
create policy "renders unidades escritura modulo" on storage.objects
  for insert with check ( bucket_id = 'renders-unidades' and public.tiene_acceso('UNIDADES', 'lectura_escritura') );
create policy "renders unidades update modulo" on storage.objects
  for update using ( bucket_id = 'renders-unidades' and public.tiene_acceso('UNIDADES', 'lectura_escritura') )
  with check ( bucket_id = 'renders-unidades' and public.tiene_acceso('UNIDADES', 'lectura_escritura') );
create policy "renders unidades delete modulo" on storage.objects
  for delete using ( bucket_id = 'renders-unidades' and public.tiene_acceso('UNIDADES', 'lectura_escritura') );

-- cotizaciones-libres (COTIZADOR): sin prefijo por usuario en el path hoy
-- (se sube antes de que exista el registro de cotización); lectura abierta
-- (puede aparecer en un PDF visto por alguien sin acceso a COTIZADOR),
-- escritura requiere el módulo.
drop policy if exists "anon acceso total cotizaciones libres" on storage.objects;
create policy "cotizaciones libres lectura autenticado" on storage.objects
  for select using ( bucket_id = 'cotizaciones-libres' and auth.uid() is not null );
create policy "cotizaciones libres escritura modulo" on storage.objects
  for insert with check ( bucket_id = 'cotizaciones-libres' and public.tiene_acceso('COTIZADOR', 'lectura_escritura') );
create policy "cotizaciones libres update modulo" on storage.objects
  for update using ( bucket_id = 'cotizaciones-libres' and public.tiene_acceso('COTIZADOR', 'lectura_escritura') )
  with check ( bucket_id = 'cotizaciones-libres' and public.tiene_acceso('COTIZADOR', 'lectura_escritura') );
create policy "cotizaciones libres delete modulo" on storage.objects
  for delete using ( bucket_id = 'cotizaciones-libres' and public.tiene_acceso('COTIZADOR', 'lectura_escritura') );

-- firmas-usuarios / fotos-usuarios: path "{usuario_id}/archivo", cada quien
-- sube/edita/borra solo lo suyo; lectura general (otros roles ven la firma
-- de quien autorizó en un PDF).
drop policy if exists "anon acceso total firmas usuarios" on storage.objects;
create policy "firmas usuarios lectura autenticado" on storage.objects
  for select using ( bucket_id = 'firmas-usuarios' and auth.uid() is not null );
create policy "firmas usuarios escritura propia" on storage.objects
  for insert with check (
    bucket_id = 'firmas-usuarios' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "firmas usuarios update propia" on storage.objects
  for update using ( bucket_id = 'firmas-usuarios' and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id = 'firmas-usuarios' and (storage.foldername(name))[1] = auth.uid()::text );
create policy "firmas usuarios delete propia" on storage.objects
  for delete using ( bucket_id = 'firmas-usuarios' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "anon acceso total fotos usuarios" on storage.objects;
create policy "fotos usuarios lectura autenticado" on storage.objects
  for select using ( bucket_id = 'fotos-usuarios' and auth.uid() is not null );
create policy "fotos usuarios escritura propia" on storage.objects
  for insert with check (
    bucket_id = 'fotos-usuarios' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "fotos usuarios update propia" on storage.objects
  for update using ( bucket_id = 'fotos-usuarios' and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id = 'fotos-usuarios' and (storage.foldername(name))[1] = auth.uid()::text );
create policy "fotos usuarios delete propia" on storage.objects
  for delete using ( bucket_id = 'fotos-usuarios' and (storage.foldername(name))[1] = auth.uid()::text );
