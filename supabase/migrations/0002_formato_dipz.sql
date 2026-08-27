-- Ajusta solicitudes_pago al formato oficial de Solicitud de Pago (DIPZ).
-- Requiere que 0001_proveedores_solicitudes_pago.sql ya se haya ejecutado.

-- La plantilla reemplaza "monto" (monto plano) por "subtotal" (suma de partidas).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'solicitudes_pago' and column_name = 'monto'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'solicitudes_pago' and column_name = 'subtotal'
  ) then
    alter table public.solicitudes_pago rename column monto to subtotal;
  end if;
end $$;

alter table public.solicitudes_pago
  add column if not exists subtotal numeric(14, 2) not null default 0.00,
  add column if not exists metodo_pago varchar(30),
  add column if not exists solicitante varchar(10),
  add column if not exists num_factura varchar(50),
  add column if not exists wbs_categoria varchar(100),
  add column if not exists wbs_partida varchar(100),
  add column if not exists partidas jsonb not null default '[]'::jsonb,
  add column if not exists aplica_iva boolean not null default true;

-- Backfill mínimo para filas previas a esta migración, luego se exige el dato.
update public.solicitudes_pago set metodo_pago = 'Transferencia bancaria' where metodo_pago is null;
update public.solicitudes_pago set solicitante = 'N/A' where solicitante is null;

alter table public.solicitudes_pago
  alter column metodo_pago set not null,
  alter column solicitante set not null,
  alter column iva set default 0.00,
  alter column total set default 0.00;

alter table public.solicitudes_pago drop constraint if exists solicitudes_pago_metodo_pago_check;
alter table public.solicitudes_pago
  add constraint solicitudes_pago_metodo_pago_check
  check (metodo_pago in ('Transferencia bancaria', 'Efectivo'));

-- Permite al cliente anon leer el consecutivo actual para mostrar el preview
-- del folio antes de guardar (la escritura sigue siendo solo del trigger).
drop policy if exists "anon lectura folios_consecutivos" on public.folios_consecutivos;
create policy "anon lectura folios_consecutivos" on public.folios_consecutivos
  for select using (true);
