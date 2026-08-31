-- Historial de cambios de presupuesto por partida WBS: cada vez que se
-- confirma un cambio de presupuesto desde /wbs (ModalConfirmarCambiosWbs)
-- se exige un comentario/número de Orden de Cambio (OC) y queda una fila
-- aquí con el monto anterior y el nuevo. No aplica a renombres de
-- categoría/partida, solo a cambios de presupuesto.

create table if not exists public.wbs_historial_cambios (
  id uuid primary key default gen_random_uuid(),
  wbs_catalog_id bigint not null references public.wbs_catalog(id) on delete cascade,
  presupuesto_anterior numeric(14, 2) not null,
  presupuesto_nuevo numeric(14, 2) not null,
  orden_cambio_ref text null,
  comentario text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wbs_historial_cambios_wbs_catalog_id
  on public.wbs_historial_cambios (wbs_catalog_id);

alter table public.wbs_historial_cambios enable row level security;

drop policy if exists "anon acceso total wbs_historial_cambios" on public.wbs_historial_cambios;
create policy "anon acceso total wbs_historial_cambios" on public.wbs_historial_cambios
  for all using (true) with check (true);
