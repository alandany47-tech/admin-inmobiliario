-- autorizar_solicitud() (redefinida en 0038 junto con el candado de módulo)
-- nunca validó de qué estado partía la solicitud, solo que el estado
-- destino fuera uno de los 3 válidos. Cualquier usuario con
-- SOLICITUDES=lectura_escritura podía llamar al RPC directo (sin pasar por
-- la pantalla /autorizaciones, que solo lista 'Por Autorizar') sobre una
-- solicitud ya 'Pagado' y dejarla en 'Cancelado'/'Pospuesto'/'Autorizado'
-- sin revertir el cargo en cuentas_bancarias ni el movimiento en
-- movimientos_tesoreria -- el dinero ya salió pero el estado queda como si
-- nunca se hubiera pagado.
--
-- El único flujo real que invoca este RPC (app/actions/autorizaciones.js)
-- solo opera sobre solicitudes en 'Por Autorizar' (getSolicitudesPorAutorizar
-- filtra por ese estado). Las transiciones entre Por Autorizar/Autorizado/
-- Pospuesto/Cancelado antes de pagar ya las cubre por separado
-- cambiarEstadoGeneral() en controlMaestro.js con un update directo (RLS
-- sigue exigiendo SOLICITUDES lectura_escritura), y esa función ya enruta
-- correctamente por procesar_pago_solicitud/revertir_pago_solicitud en
-- cuanto 'Pagado' entra o sale del estado -- no se toca ese camino aquí.
--
-- Mismo patrón que procesar_pago_solicitud/revertir_pago_solicitud: lock
-- `for update` + valida el estado de origen antes de escribir.
create or replace function public.autorizar_solicitud(p_solicitud_id bigint, p_nuevo_estado varchar(20))
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado varchar(20);
begin
  if not public.tiene_acceso('SOLICITUDES', 'lectura_escritura') then
    raise exception 'No autorizado: se requiere acceso de escritura al módulo SOLICITUDES para autorizar una solicitud';
  end if;

  if p_nuevo_estado not in ('Autorizado', 'Pospuesto', 'Cancelado') then
    raise exception 'Estado no válido: %', p_nuevo_estado;
  end if;

  select estado into v_estado
    from public.solicitudes_pago
   where id = p_solicitud_id
   for update;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;

  if v_estado <> 'Por Autorizar' then
    raise exception 'Solo se pueden autorizar solicitudes en estado "Por Autorizar" (actual: %)', v_estado;
  end if;

  update public.solicitudes_pago set estado = p_nuevo_estado where id = p_solicitud_id;

  if p_nuevo_estado = 'Autorizado' and auth.uid() is not null then
    insert into public.solicitud_autorizaciones (solicitud_id, usuario_id)
    values (p_solicitud_id, auth.uid())
    on conflict (solicitud_id, usuario_id) do nothing;
  end if;
end;
$$;
