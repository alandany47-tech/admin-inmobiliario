-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Agrega el estado de autorización a solicitudes_pago.

alter table public.solicitudes_pago
  add column if not exists estado varchar(20) not null default 'Por Autorizar';

alter table public.solicitudes_pago drop constraint if exists solicitudes_pago_estado_check;
alter table public.solicitudes_pago
  add constraint solicitudes_pago_estado_check
  check (estado in ('Por Autorizar', 'Autorizado', 'Pospuesto', 'Cancelado'));
