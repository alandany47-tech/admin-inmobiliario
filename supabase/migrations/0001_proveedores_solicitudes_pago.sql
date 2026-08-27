-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Crea proveedores, solicitudes_pago y el trigger que autogenera el folio
-- con el formato [CODIGO_PROYECTO]-[MMYY]-[CONSECUTIVO], ej. PIA-0826-001.

create table if not exists public.proveedores (
  id bigint generated always as identity primary key,
  razon_social text not null,
  rfc text,
  datos_bancarios jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.solicitudes_pago (
  id bigint generated always as identity primary key,
  folio text unique,
  proyecto_id bigint not null references public.proyectos(id),
  proveedor_id bigint not null references public.proveedores(id),
  concepto text not null,
  monto numeric(14, 2) not null,
  iva numeric(14, 2) not null default 0,
  total numeric(14, 2) not null,
  fecha_programada date not null,
  created_at timestamptz not null default now()
);

-- Contador interno por proyecto + periodo (MMYY) para el consecutivo del folio.
create table if not exists public.folios_consecutivos (
  proyecto_id bigint not null references public.proyectos(id),
  periodo text not null,
  consecutivo integer not null default 0,
  primary key (proyecto_id, periodo)
);

create or replace function public.generar_folio_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_periodo text;
  v_consecutivo integer;
begin
  if new.folio is not null then
    return new;
  end if;

  select codigo into v_codigo from public.proyectos where id = new.proyecto_id;
  if v_codigo is null then
    raise exception 'Proyecto % no encontrado para generar folio', new.proyecto_id;
  end if;

  v_periodo := to_char(current_date, 'MMYY');

  insert into public.folios_consecutivos (proyecto_id, periodo, consecutivo)
  values (new.proyecto_id, v_periodo, 1)
  on conflict (proyecto_id, periodo)
  do update set consecutivo = public.folios_consecutivos.consecutivo + 1
  returning consecutivo into v_consecutivo;

  new.folio := v_codigo || '-' || v_periodo || '-' || lpad(v_consecutivo::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_generar_folio_solicitud on public.solicitudes_pago;
create trigger trg_generar_folio_solicitud
  before insert on public.solicitudes_pago
  for each row
  execute function public.generar_folio_solicitud();

-- RLS: acceso abierto temporal (sin auth todavía). Restringir cuando se agregue login.
alter table public.proveedores enable row level security;
alter table public.solicitudes_pago enable row level security;
alter table public.folios_consecutivos enable row level security;

drop policy if exists "anon acceso total proveedores" on public.proveedores;
create policy "anon acceso total proveedores" on public.proveedores
  for all using (true) with check (true);

drop policy if exists "anon acceso total solicitudes_pago" on public.solicitudes_pago;
create policy "anon acceso total solicitudes_pago" on public.solicitudes_pago
  for all using (true) with check (true);
-- folios_consecutivos no lleva policy: solo la toca la función security definer del trigger.
