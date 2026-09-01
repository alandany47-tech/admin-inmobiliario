-- Amplía Unidades (precio_m2, tipo_uso, estatus en mayúsculas) y Clientes
-- (dirección/contacto secundario/notas), y agrega el catálogo de
-- configuración de plantillas PDF (Recibo de Pago, Estado de Cuenta,
-- Solicitud de Pago).

-- 1. Unidades: precio_m2, tipo_uso (reemplaza a tipo_unidad como
-- clasificador del inmueble) y estatus en mayúsculas ('SIN ASIGNAR' pasa a
-- ser el estatus de disponibilidad, ya no un valor de tipo_unidad).
alter table public.unidades
  add column if not exists precio_m2 numeric(14, 2) not null default 0;

update public.unidades
   set precio_m2 = round(monto_lista / superficie_m2, 2)
 where superficie_m2 > 0 and precio_m2 = 0;

alter table public.unidades
  add column if not exists tipo_uso text not null default 'DEPARTAMENTO';

alter table public.unidades
  drop constraint if exists unidades_tipo_uso_check;
alter table public.unidades
  add constraint unidades_tipo_uso_check
  check (tipo_uso in ('DEPARTAMENTO', 'OFICINA', 'LOCAL', 'BODEGA', 'OTRO'));

alter table public.unidades drop column if exists tipo_unidad;

alter table public.unidades drop constraint if exists unidades_estatus_check;

update public.unidades set estatus = 'SIN ASIGNAR' where estatus = 'Disponible';
update public.unidades set estatus = 'APARTADA' where estatus = 'Apartada';
update public.unidades set estatus = 'VENDIDA' where estatus = 'Vendida';

alter table public.unidades alter column estatus set default 'SIN ASIGNAR';
alter table public.unidades
  add constraint unidades_estatus_check
  check (estatus in ('SIN ASIGNAR', 'APARTADA', 'VENDIDA'));

-- 2. Clientes: datos de directorio adicionales.
alter table public.clientes
  add column if not exists direccion text,
  add column if not exists contacto_secundario text,
  add column if not exists notas text;

-- 3. Configuración de Plantillas PDF (Recibo de Pago, Estado de Cuenta,
-- Solicitud de Pago), editable desde /configuracion/plantillas.
create table if not exists public.configuracion_plantillas (
  id uuid primary key default gen_random_uuid(),
  clave text unique not null check (clave in ('RECIBO_PAGO', 'ESTADO_CUENTA', 'SOLICITUD_PAGO')),
  nombre text not null,
  logo_url text,
  encabezado_linea1 text,
  encabezado_linea2 text,
  pie_pagina text,
  color_primario text not null default '#0f172a',
  terminos_condiciones text,
  updated_at timestamptz not null default now()
);

alter table public.configuracion_plantillas enable row level security;

drop policy if exists "anon acceso total configuracion_plantillas" on public.configuracion_plantillas;
create policy "anon acceso total configuracion_plantillas" on public.configuracion_plantillas
  for all using (true) with check (true);

insert into public.configuracion_plantillas (clave, nombre, encabezado_linea1, encabezado_linea2, pie_pagina)
values
  ('RECIBO_PAGO', 'Recibo de Pago', 'DIPZ', 'THE FUTURE OF REAL ESTATE', 'Gracias por su pago.'),
  ('ESTADO_CUENTA', 'Estado de Cuenta', 'DIPZ', 'THE FUTURE OF REAL ESTATE', 'Documento informativo, no válido como comprobante fiscal.'),
  ('SOLICITUD_PAGO', 'Solicitud de Pago', 'DIPZ', 'THE FUTURE OF REAL ESTATE', null)
on conflict (clave) do nothing;
