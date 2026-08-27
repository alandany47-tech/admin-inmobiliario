---
# Sistema de Solicitudes de Pago y Tesorería - DIPZ Real Estate

## Stack Tecnológico
- **Framework:** Next.js (App Router, JS ES6+ puro, SIN TypeScript).
- **Base de Datos & Auth:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`).
- **DB Connection:** Direct DDL vía `DATABASE_URL` en `.env.local` (Node `pg`).
- **UI & Iconos:** Tailwind CSS, `lucide-react`.

## Esquema de Base de Datos (DIPZ Format)
- `proyectos`: `id`, `codigo` (VARCHAR 10), `nombre`, `presupuesto`.
- `proveedores`: `id`, `razon_social`, `rfc`, `datos_bancarios` (JSONB: `{banco, cuenta, clabe}`), `estatus`.
- `cuentas_bancarias`: `id`, `nombre`, `tipo` ('efectivo', 'transferencia'), `saldo_actual`.
- `solicitudes_pago`: 
  - `id`, `folio` (Generado por trigger: `[CODIGO]-[MMYY]-[CONSECUTIVO]`, ej. `PIA-0826-001`).
  - `proyecto_id`, `proveedor_id`, `cuenta_id`.
  - `metodo_pago` (VARCHAR(30): 'Transferencia bancaria' | 'Efectivo').
  - `solicitante`, `num_factura`, `wbs_categoria`, `wbs_partida`.
  - `partidas` (JSONB array: `[{cantidad, descripcion, precio_unitario, subtotal}]`).
  - `subtotal`, `aplica_iva` (BOOLEAN), `iva`, `total`.
  - `estado` ('Por Autorizar', 'Autorizado', 'Pospuesto', 'Pagado', 'Cancelado').
  - `fecha_programada`, `fecha_pago`.

## Estructura de Archivos Implementada
- `lib/supabase/client.js`: Browser Client (`createBrowserClient`).
- `lib/supabase/server.js`: Server Client (`createServerClient` con cookies).
- `app/solicitud/page.js`: Vista Server Component precargando proyectos/proveedores.
- `components/SolicitudPagoForm.js`: Formulario dinámico cliente (WBS, partidas dinámicas, preview folio, IVA opcional).
- `app/actions/solicitudes.js`: Server Actions (`crearSolicitudPago`, `getFolioPreview`).
- `app/actions/proveedores.js`: `getProveedores()`.
- `supabase/migrations/`: `0001_proveedores_solicitudes_pago.sql`, `0002_formato_dipz.sql`.

## Reglas de Desarrollo & Optimización de Tokens
1. **Atomicidad:** Generar cambios modulares por archivo. No refactorizar código que no se solicitó modificar.
2. **Concisión:** Respuestas en CLI limitadas al estado de ejecución y lista de archivos modificados. Cero explicaciones redundantes.
3. **Estilo:** JavaScript ES6+ directo, Tailwind nativo, JSDoc mínimos solo en Server Actions.
4. **Clientes Supabase:** Usar siempre `lib/supabase/server.js` para Server Actions/Components y `lib/supabase/client.js` para Client Components.
---