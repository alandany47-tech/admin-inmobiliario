-- Ciclo de vida real de venta: separación de 30 días -> liquidación de
-- enganche + firma -> venta. Agrega esquema Inversionista (distintivo,
-- misma lógica de plan de pagos que Tradicional), branding por proyecto
-- (logo + colores) para los documentos con doble logo, el Cotizador
-- (tabla `cotizaciones`) y la vista reactiva de cartera de clientes.

-- 1. Unidades: esquema (Tradicional/Inversionista).
alter table public.unidades
  add column if not exists esquema_unidad text not null default 'TRADICIONAL';

alter table public.unidades
  drop constraint if exists unidades_esquema_unidad_check;
alter table public.unidades
  add constraint unidades_esquema_unidad_check
  check (esquema_unidad in ('TRADICIONAL', 'INVERSIONISTA'));

-- 2. Contratos de venta: separación, enganche pactado/pagado, firma y
-- esquema de venta (se copia del esquema de la unidad al momento de
-- apartar, pero es editable por si cambia el acuerdo comercial).
alter table public.contratos_venta
  add column if not exists fecha_separacion timestamptz not null default now(),
  add column if not exists fecha_limite_apartado timestamptz not null default (now() + interval '30 days'),
  add column if not exists monto_separacion numeric(14, 2) not null default 0,
  add column if not exists monto_enganche_pactado numeric(14, 2) not null default 0,
  add column if not exists monto_enganche_pagado numeric(14, 2) not null default 0,
  add column if not exists contrato_firmado boolean not null default false,
  add column if not exists dia_pago_mensual int null,
  add column if not exists esquema_venta text not null default 'TRADICIONAL';

alter table public.contratos_venta
  drop constraint if exists contratos_venta_esquema_venta_check;
alter table public.contratos_venta
  add constraint contratos_venta_esquema_venta_check
  check (esquema_venta in ('TRADICIONAL', 'INVERSIONISTA'));

alter table public.contratos_venta
  drop constraint if exists contratos_venta_dia_pago_mensual_check;
alter table public.contratos_venta
  add constraint contratos_venta_dia_pago_mensual_check
  check (dia_pago_mensual is null or (dia_pago_mensual between 1 and 31));

-- 3. Plan de pagos: fase (Proyectado mientras la unidad está apartada,
-- Activo desde que se confirma firma + enganche liquidado).
alter table public.planes_pago_cobranza
  add column if not exists fase_plan text not null default 'PROYECTADO';

alter table public.planes_pago_cobranza
  drop constraint if exists planes_pago_cobranza_fase_plan_check;
alter table public.planes_pago_cobranza
  add constraint planes_pago_cobranza_fase_plan_check
  check (fase_plan in ('PROYECTADO', 'ACTIVO'));

-- 4. Proyectos: branding (logo + colores) para el encabezado doble
-- (DIPZ + Proyecto) de los documentos, y estatus del desarrollo.
alter table public.proyectos
  add column if not exists logo_proyecto_url text,
  add column if not exists color_primario text not null default '#0f172a',
  add column if not exists color_secundario text not null default '#2563eb',
  add column if not exists estatus text not null default 'En Desarrollo';

alter table public.proyectos
  drop constraint if exists proyectos_estatus_check;
alter table public.proyectos
  add constraint proyectos_estatus_check
  check (estatus in ('En Desarrollo', 'Concluido', 'Archivado'));

-- 5. Vista reactiva de cartera: una fila por contrato de venta, con
-- saldos/mora/avance de enganche/estatus de separación ya calculados en
-- SQL (antes se recalculaba entero en JS en getCarteraClientes).
create or replace view public.vista_cartera_clientes as
select
  cv.id as contrato_id,
  cv.proyecto_id,
  p.codigo as proyecto_codigo,
  cv.unidad_id,
  u.codigo_unidad,
  cv.cliente_id,
  cl.nombre as cliente_nombre,
  cv.monto_total_venta,
  cv.esquema_venta,
  cv.contrato_firmado,
  cv.fecha_separacion,
  cv.fecha_limite_apartado,
  case
    when cv.contrato_firmado then null
    else floor(extract(epoch from (cv.fecha_limite_apartado - now())) / 86400)::int
  end as dias_restantes_separacion,
  cv.monto_separacion,
  cv.monto_enganche_pactado,
  cv.monto_enganche_pagado,
  case
    when cv.monto_enganche_pactado > 0
      then round((cv.monto_enganche_pagado / cv.monto_enganche_pactado) * 100, 2)
    else 0
  end as avance_enganche_pct,
  case when cv.contrato_firmado then 'Firmado' else 'Pendiente' end as estado_contrato,
  coalesce(pp.total_programado, 0) as total_programado,
  coalesce(pp.total_pagado, 0) as total_pagado,
  cv.monto_total_venta - coalesce(pp.total_pagado, 0) as saldo_pendiente,
  coalesce(pp.mensualidades_activas, 0) as mensualidades_activas,
  coalesce(pp.monto_vencido, 0) as monto_vencido,
  coalesce(pp.dias_mora, 0) as dias_mora
from public.contratos_venta cv
join public.unidades u on u.id = cv.unidad_id
join public.clientes cl on cl.id = cv.cliente_id
join public.proyectos p on p.id = cv.proyecto_id
left join lateral (
  select
    sum(pl.monto_programado) as total_programado,
    sum(pl.monto_pagado) as total_pagado,
    count(*) filter (where pl.tipo_pago = 'MENSUALIDAD' and pl.fase_plan = 'ACTIVO') as mensualidades_activas,
    sum(pl.monto_programado - pl.monto_pagado) filter (
      where pl.estatus in ('Pendiente', 'Parcial') and pl.fase_plan = 'ACTIVO' and pl.fecha_programada < current_date
    ) as monto_vencido,
    max(floor(current_date - pl.fecha_programada)) filter (
      where pl.estatus in ('Pendiente', 'Parcial') and pl.fase_plan = 'ACTIVO' and pl.fecha_programada < current_date
    ) as dias_mora
  from public.planes_pago_cobranza pl
  where pl.contrato_id = cv.id
) pp on true;

-- 6. Cotizador: historial de cotizaciones generadas (unidad existente o
-- libre), snapshot de los datos del simulador al momento de generar el PDF.
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id bigint null references public.proyectos(id),
  unidad_id uuid null references public.unidades(id),
  cliente_nombre text not null,
  cliente_email text null,
  cliente_telefono text null,
  tipo_cotizacion text not null default 'UNIDAD' check (tipo_cotizacion in ('UNIDAD', 'LIBRE')),
  descripcion_libre text null,
  monto_total numeric(14, 2) not null default 0,
  esquema text not null default 'TRADICIONAL' check (esquema in ('TRADICIONAL', 'INVERSIONISTA')),
  monto_separacion numeric(14, 2) not null default 0,
  porcentaje_enganche numeric(5, 2) not null default 0,
  monto_enganche numeric(14, 2) not null default 0,
  plazo_meses int not null default 0,
  monto_mensualidad numeric(14, 2) not null default 0,
  saldo_entrega numeric(14, 2) not null default 0,
  folio text null,
  created_at timestamptz not null default now()
);

alter table public.cotizaciones enable row level security;

drop policy if exists "anon acceso total cotizaciones" on public.cotizaciones;
create policy "anon acceso total cotizaciones" on public.cotizaciones for all using (true) with check (true);

-- 7. Plantillas PDF: agrega la clave COTIZACION al catálogo configurable.
alter table public.configuracion_plantillas
  drop constraint if exists configuracion_plantillas_clave_check;
alter table public.configuracion_plantillas
  add constraint configuracion_plantillas_clave_check
  check (clave in ('RECIBO_PAGO', 'ESTADO_CUENTA', 'SOLICITUD_PAGO', 'COTIZACION'));

insert into public.configuracion_plantillas (clave, nombre, encabezado_linea1, encabezado_linea2, pie_pagina)
values ('COTIZACION', 'Cotización', 'DIPZ', 'THE FUTURE OF REAL ESTATE', 'Cotización sujeta a cambios sin previo aviso.')
on conflict (clave) do nothing;
