-- solicitud_reparto_corporativo (0027) quedó con "anon acceso total" (for all
-- using (true)), igual que el resto del esquema en ese momento. A diferencia
-- de las demás tablas, aquí eso sí es explotable de forma directa: el
-- reparto solo debe crearse/borrarse a través de confirmar_reparto_corporativo
-- y revertir_pago_solicitud (ambas security definer, y por lo tanto no
-- afectadas por RLS), que validan estado/monto/cantidad de partidas antes de
-- escribir. Con la policy "for all" cualquiera con la anon key podía hacer
-- INSERT/UPDATE/DELETE directo por PostgREST sobre la tabla y dejar el
-- "ejercido" de wbs_presupuesto_resumen inflado o inconsistente sin pasar por
-- esas validaciones.
--
-- Se restringe lectura a usuarios autenticados (igual que hoy la consulta via
-- app/actions/reparto.js siempre corre con sesión) y se elimina la policy de
-- escritura: sin policy para insert/update/delete, RLS deniega esas
-- operaciones a cualquier rol de cliente (anon o authenticated) y las dos
-- funciones security definer siguen funcionando porque no están sujetas a RLS.

drop policy if exists "anon acceso total reparto corporativo" on public.solicitud_reparto_corporativo;

create policy "Lectura reparto corporativo: solo autenticados" on public.solicitud_reparto_corporativo
  for select
  to authenticated
  using (true);
