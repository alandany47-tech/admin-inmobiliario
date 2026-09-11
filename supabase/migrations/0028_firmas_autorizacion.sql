-- Firmas de autorización: sello de imagen (sin validez legal) para los
-- usuarios con zona de firma asignada. La zona (izquierda/derecha) la fija
-- un ADMIN por usuario; cada usuario sube su propia imagen de firma.

alter table public.perfiles_usuario
  add column firma_imagen_url text,
  add column firma_zona varchar(10) check (firma_zona in ('izquierda', 'derecha'));

create table public.solicitud_autorizaciones (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references public.solicitudes_pago(id) on delete cascade,
  usuario_id uuid not null references public.perfiles_usuario(id),
  created_at timestamptz not null default now(),
  unique (solicitud_id, usuario_id)
);

create index on public.solicitud_autorizaciones (solicitud_id);

alter table public.solicitud_autorizaciones enable row level security;

create policy "anon acceso total autorizaciones" on public.solicitud_autorizaciones
  for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('firmas-usuarios', 'firmas-usuarios', true)
on conflict (id) do nothing;

drop policy if exists "anon acceso total firmas usuarios" on storage.objects;
create policy "anon acceso total firmas usuarios" on storage.objects
  for all using (bucket_id = 'firmas-usuarios') with check (bucket_id = 'firmas-usuarios');

-- perfiles_usuario tiene RLS real (update solo ADMIN, ver 0023): se necesita
-- una función security definer, acotada solo a firma_imagen_url, para que
-- cada usuario pueda subir su propia firma sin poder tocar rol/activo.
create or replace function public.actualizar_mi_firma(p_firma_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles_usuario
     set firma_imagen_url = p_firma_url, updated_at = now()
   where id = auth.uid();
end;
$$;

-- Reemplaza el update directo de cambiarEstadoSolicitud: autoriza/pospone/
-- cancela y, si el resultado es 'Autorizado', registra en una sola
-- transacción quién autorizó (para poder mostrar su firma en el PDF).
create or replace function public.autorizar_solicitud(p_solicitud_id bigint, p_nuevo_estado varchar(20))
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_nuevo_estado not in ('Autorizado', 'Pospuesto', 'Cancelado') then
    raise exception 'Estado no válido: %', p_nuevo_estado;
  end if;

  update public.solicitudes_pago set estado = p_nuevo_estado where id = p_solicitud_id;

  if not found then
    raise exception 'Solicitud % no encontrada', p_solicitud_id;
  end if;

  if p_nuevo_estado = 'Autorizado' and auth.uid() is not null then
    insert into public.solicitud_autorizaciones (solicitud_id, usuario_id)
    values (p_solicitud_id, auth.uid())
    on conflict (solicitud_id, usuario_id) do nothing;
  end if;
end;
$$;
