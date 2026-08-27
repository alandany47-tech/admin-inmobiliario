---
# Sistema de Solicitudes de Pago y Tesorería - DIPZ Real Estate

## Stack Tecnológico
- **Framework:** Next.js (App Router, JS ES6+ puro, SIN TypeScript).
- **Base de Datos & Auth:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`). Sin auth todavía: RLS abierto (`for all using (true)`) en todas las tablas.
- **DB Connection:** Migraciones DDL vía `DATABASE_URL` en `.env.local`, aplicadas con `scripts/run-migration.js` (Node `pg`). Uso: `node scripts/run-migration.js supabase/migrations/000X_archivo.sql`.
- **Storage:** Bucket público `comprobantes` (comprobantes de pago).
- **UI & Iconos:** Tailwind CSS, `lucide-react`. Cero emojis en la interfaz.
- **PDF/Excel:** `jspdf` + `html2canvas` (PDF con formato DIPZ y PDF masivo de tabla), `xlsx` (exportación a Excel).

## Esquema de Base de Datos (verificado en Supabase)
- `proyectos`: `id`, `codigo` (text), `nombre` (text), `presupuesto` (numeric), `created_at`.
- `proveedores`: `id`, `razon_social`, `rfc`, `datos_bancarios` (JSONB: `{banco, numero_cuenta}` si Banregio, `{banco, clabe}` si Otro), `estatus` ('Activo'|'Inactivo'), `contacto_nombre`, `contacto_telefono`, `contacto_email`, `created_at`.
- `cuentas_bancarias`: `id`, `nombre` (único; seed: "Caja Chica" y "Fresh Coco Desarrollos Banregio"), `tipo` ('Efectivo'|'Transferencia bancaria' — coincide con `metodo_pago`), `saldo_actual`, `created_at`.
- `wbs_catalog`: `id`, `proyecto_id` (bigint NULL = catálogo general; FK a `proyectos.id`, que es bigint, no UUID), `categoria`, `partida`, `created_at`.
- `folios_consecutivos`: `proyecto_id`, `periodo` (MMYY), `consecutivo` — solo la toca el trigger `generar_folio_solicitud`.
- `solicitudes_pago`:
  - `id`, `folio` (autogenerado por trigger: `[CODIGO_PROYECTO]-[MMYY]-[CONSECUTIVO]`, ej. `PIA-0826-001`).
  - `proyecto_id`, `proveedor_id`, `cuenta_id` (se llena solo al pagar).
  - `metodo_pago` ('Transferencia bancaria'|'Efectivo'), `solicitante`, `num_factura`, `wbs_categoria`, `wbs_partida`.
  - `partidas` (JSONB array: `[{cantidad, descripcion, precio_unitario, subtotal}]`).
  - `concepto` (resumen autogenerado de las descripciones), `subtotal`, `aplica_iva` (boolean), `iva`, `total`.
  - `estado` ('Por Autorizar'|'Autorizado'|'Pospuesto'|'Pagado'|'Cancelado').
  - `fecha_programada` (se autocalcula al crear: próximo viernes), `fecha_pago` (se llena al pagar), `comprobante_url`.
- **Funciones Postgres:** `generar_folio_solicitud()` (trigger BEFORE INSERT), `procesar_pago_solicitud(p_solicitud_id, p_fecha_pago)` (RPC atómica: valida que la solicitud esté 'Autorizado', determina la cuenta por `tipo = metodo_pago`, descuenta `saldo_actual` y marca `estado = 'Pagado'`). Cualquier cambio a estado 'Pagado' debe pasar por esta función, nunca por un `update` directo del estado.

## Estructura de Archivos Implementada
- `lib/supabase/client.js` / `lib/supabase/server.js`: clientes Browser/Server de Supabase.
- **Solicitudes** (`/solicitud`): `app/solicitud/page.js`, `components/SolicitudPagoForm.js` (WBS por selects dinámicos filtrados por proyecto, fecha estimada = próximo viernes autocalculada), `app/actions/solicitudes.js` (`crearSolicitudPago`, `getFolioPreview`, `getSolicitudPorId`).
- **Autorizaciones** (`/autorizaciones`): `app/autorizaciones/page.js`, `components/TablaAutorizaciones.js`, `app/actions/autorizaciones.js` (`getSolicitudesPorAutorizar`, `cambiarEstadoSolicitud` — solo Autorizado/Pospuesto/Cancelado).
- **PDF de solicitud** (`/solicitud/[id]/pdf`): `components/SolicitudPagoPDF.js` (plantilla DIPZ + botón "Descargar PDF" vía jsPDF/html2canvas, imports dinámicos).
- **Tesorería** (`/tesoreria`): `app/tesoreria/page.js`, `components/TableroTesoreria.js` (tarjetas de saldo, modal de confirmación de pago), `app/actions/tesoreria.js` (`getCuentasBancarias`, `getSolicitudesAutorizadas`, `procesarPagoSolicitud` → llama al RPC).
- **Historial** (`/historial`): `app/historial/page.js`, `components/TablaHistorial.js` (filtros + exportar Excel), `app/actions/reportes.js`.
- **Proveedores** (`/proveedores`): `app/proveedores/page.js`, `components/DirectorioProveedores.js` (búsqueda por razón social/RFC), `app/actions/proveedores.js`.
- **Dashboard KPIs** (`/dashboard`): `app/dashboard/page.js` (Server Component puro, agrega KPIs desde `app/actions/dashboard.js`, sin estado cliente).
- **Control Maestro** (`/control-maestro`): `app/control-maestro/page.js`, `components/PanelControlMaestro.js` (filtros periodo/proyecto/categoría/estado, cambio de estado por fila, adjuntar comprobante a Storage, exportar Excel/PDF), `components/ModalSolicitudRapida.js` (alta rápida reutilizando `crearSolicitudPago`), `app/actions/controlMaestro.js` (`getSolicitudesControlMaestro`, `cambiarEstadoGeneral` — delega a `procesar_pago_solicitud` si el nuevo estado es 'Pagado', `subirComprobante`).
- `app/actions/wbs.js`: `getWbsCatalog()`.
- `app/actions/test.js`: `getProyectos()` (reutilizado por varias vistas).
- `components/Navbar.js`: sidebar global (Dashboard, Solicitudes, Autorizaciones, Tesorería, Proveedores, Control Maestro, Historial), resalta ruta activa con `usePathname()`.
- `scripts/run-migration.js`: ejecuta un archivo `.sql` de `supabase/migrations/` contra `DATABASE_URL`.
- `supabase/migrations/`: `0001_proveedores_solicitudes_pago.sql`, `0002_formato_dipz.sql`, `0003_estado_solicitud.sql`, `0004_tesoreria.sql`, `0005_wbs_y_comprobantes.sql` — todas ya aplicadas.

## Reglas de Desarrollo & Optimización de Tokens
1. **Atomicidad:** Generar cambios modulares por archivo. No refactorizar código que no se solicitó modificar.
2. **Concisión:** Respuestas en CLI limitadas al estado de ejecución y lista de archivos modificados. Cero explicaciones redundantes.
3. **Estilo:** JavaScript ES6+ directo, Tailwind nativo, JSDoc mínimos solo en Server Actions/componentes exportados. Cero emojis.
4. **Clientes Supabase:** Usar siempre `lib/supabase/server.js` para Server Actions/Components y `lib/supabase/client.js` para Client Components.
5. **Migraciones:** Todo cambio de esquema va en un nuevo archivo numerado en `supabase/migrations/` (siguiente consecutivo libre) y se aplica con `scripts/run-migration.js`, nunca a mano fuera de ese flujo.
6. **Dinero:** Cualquier movimiento que afecte `cuentas_bancarias.saldo_actual` debe pasar por una función Postgres atómica (patrón `procesar_pago_solicitud`), no por updates sueltos desde Server Actions.
---
