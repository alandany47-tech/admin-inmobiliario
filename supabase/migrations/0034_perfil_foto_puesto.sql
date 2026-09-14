-- Extiende perfiles_usuario con foto de perfil y puesto/cargo, editables por
-- el propio colaborador desde Mi Perfil (acceso ahora también desde el
-- nombre/rol del Navbar). Igual que firma_imagen_url (0028), perfiles_usuario
-- tiene RLS de UPDATE restringida a es_admin() (0023): se necesita una
-- función security definer acotada solo a estas dos columnas (nunca
-- rol/activo), siguiendo el mismo patrón que actualizar_mi_firma.
--
-- Bucket propio "fotos-usuarios" en vez de reutilizar "firmas-usuarios":
-- son dos clases de activo distintas (foto de perfil vs. sello de firma)
-- y esta sí lleva límites explícitos de tamaño/mime (a diferencia de
-- firmas-usuarios, que quedó sin límites en 0028) sin querer alterar los
-- límites del bucket de firmas ya existente.

alter table public.perfiles_usuario
  add column foto_url text,
  add column puesto text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-usuarios', 'fotos-usuarios', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "anon acceso total fotos usuarios" on storage.objects;
create policy "anon acceso total fotos usuarios" on storage.objects
  for all using (bucket_id = 'fotos-usuarios') with check (bucket_id = 'fotos-usuarios');

create or replace function public.actualizar_mi_perfil_extendido(p_foto_url text, p_puesto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles_usuario
     set foto_url = p_foto_url, puesto = p_puesto, updated_at = now()
   where id = auth.uid();
end;
$$;
