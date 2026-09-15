-- Permisos finos por vista dentro de un módulo compuesto. Varias vistas del
-- navbar comparten un solo módulo de RLS (ej. SOLICITUDES cubre Solicitudes/
-- Mis Solicitudes/Autorizaciones/Historial, todas sobre solicitudes_pago),
-- así que hoy no hay forma de dar acceso a "Autorizaciones" sin dar también
-- las otras 3. No se toca tiene_acceso() ni ninguna de las ~110 policies que
-- ya la usan (0038): el nivel del módulo sigue siendo el piso real de acceso
-- a los datos vía RLS. Estas claves nuevas son puramente para que un ADMIN
-- pueda, además, ocultar/mostrar vistas individuales del menú.
--
-- Fila ausente en permisos_usuario para una de estas claves = hereda el
-- nivel del módulo padre (comportamiento idéntico al actual para todo
-- usuario ya configurado: nada cambia hasta que un ADMIN capture una
-- excepción explícita en /configuracion/permisos).
insert into public.modulos (clave, nombre) values
  ('SOLICITUDES_CREAR', 'Solicitudes — Nueva solicitud'),
  ('SOLICITUDES_MIS', 'Solicitudes — Mis solicitudes'),
  ('SOLICITUDES_AUTORIZACIONES', 'Solicitudes — Autorizaciones'),
  ('SOLICITUDES_HISTORIAL', 'Solicitudes — Historial general'),
  ('WBS_PRESUPUESTO', 'WBS — Presupuesto'),
  ('WBS_ORDENES_CAMBIO', 'WBS — Órdenes de cambio'),
  ('TESORERIA_DISPERSION', 'Tesorería — Dispersión'),
  ('TESORERIA_CONTROL_MAESTRO', 'Tesorería — Control Maestro'),
  ('CONFIGURACION_PLANTILLAS', 'Configuración — Plantillas PDF'),
  ('CONFIGURACION_IMPORTAR', 'Configuración — Importar histórico')
on conflict (clave) do nothing;
