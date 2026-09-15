-- Permitir que el rol ADMIN autorice sus propias órdenes de cambio WBS.
-- Antes: cualquier usuario (incluyendo ADMIN) no podía autorizar sus propias órdenes.
-- Después: solo no-ADMIN no puede auto-autorizarse; ADMIN sí puede.
-- Justificación: ADMIN es poder supremo (maneja seguridad, integridad, auditoría general),
-- por lo que es natural que pueda autorizar sus propios cambios presupuestarios.

create or replace function public.autorizar_orden_cambio_wbs(
  p_orden_id bigint,
  p_nuevo_estado varchar(20)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado varchar(20);
  v_solicitado_por uuid;
  v_presupuesto_anterior numeric;
  v_presupuesto_nuevo numeric;
  v_unidad_nueva text;
  v_cantidad_nueva numeric;
  v_precio_unitario_nuevo numeric;
  v_comentario text;
  v_wbs_catalog_id bigint;
  v_presupuesto_actual numeric;
begin
  -- 1. Exigir acceso de módulo WBS.
  if not public.tiene_acceso('WBS', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo WBS para autorizar una orden de cambio';
  end if;

  -- 2. Validar estado destino.
  if p_nuevo_estado not in ('Autorizado', 'Rechazado') then
    raise exception 'Estado no válido: %', p_nuevo_estado;
  end if;

  -- 3. Leer la orden con lock.
  select
    estado, solicitado_por, presupuesto_anterior, presupuesto_nuevo,
    unidad_nueva, cantidad_nueva, precio_unitario_nuevo, comentario, wbs_catalog_id
  into
    v_estado, v_solicitado_por, v_presupuesto_anterior, v_presupuesto_nuevo,
    v_unidad_nueva, v_cantidad_nueva, v_precio_unitario_nuevo, v_comentario, v_wbs_catalog_id
  from public.wbs_ordenes_cambio
  where id = p_orden_id
  for update;

  if not found then
    raise exception 'Orden de cambio % no encontrada', p_orden_id;
  end if;

  -- 4. Validar estado de origen.
  if v_estado <> 'Por Autorizar' then
    raise exception 'Solo se pueden resolver órdenes de cambio en estado Por Autorizar (actual: %)', v_estado;
  end if;

  -- 5. Regla clave: no autorizarse a sí mismo EXCEPTO si es ADMIN.
  if p_nuevo_estado = 'Autorizado' and v_solicitado_por = auth.uid() and not public.es_admin() then
    raise exception 'Una orden de cambio debe ser autorizada por alguien distinto de quien la solicitó';
  end if;

  -- 6. Actualizar estado de la orden.
  update public.wbs_ordenes_cambio
  set
    estado = p_nuevo_estado,
    autorizado_por = auth.uid(),
    resuelto_at = now()
  where id = p_orden_id;

  -- 7. Si se autoriza, aplicar cambio a wbs_catalog e insertar en historial.
  if p_nuevo_estado = 'Autorizado' then
    -- 7a. Leer presupuesto ACTUAL de wbs_catalog (con lock, para usar en historial).
    select presupuesto
    into v_presupuesto_actual
    from public.wbs_catalog
    where id = v_wbs_catalog_id
    for update;

    -- 7b. Actualizar wbs_catalog según qué campos propuestos vienen informados.
    if v_cantidad_nueva is not null and v_precio_unitario_nuevo is not null then
      update public.wbs_catalog
      set
        presupuesto = v_presupuesto_nuevo,
        unidad = v_unidad_nueva,
        cantidad = v_cantidad_nueva,
        precio_unitario = v_precio_unitario_nuevo
      where id = v_wbs_catalog_id;
    else
      -- Si falta alguno de cantidad_nueva o precio_unitario_nuevo, actualizar solo presupuesto.
      update public.wbs_catalog
      set presupuesto = v_presupuesto_nuevo
      where id = v_wbs_catalog_id;
    end if;

    -- 7c. Insertar en historial con presupuesto_anterior real (el leído en 7a).
    insert into public.wbs_historial_cambios (
      wbs_catalog_id,
      presupuesto_anterior,
      presupuesto_nuevo,
      comentario,
      orden_cambio_ref
    )
    values (
      v_wbs_catalog_id,
      v_presupuesto_actual,
      v_presupuesto_nuevo,
      v_comentario,
      'OC-' || p_orden_id::text
    );
  end if;
end;
$$;
