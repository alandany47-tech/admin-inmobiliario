-- Fotos/renders para que las cotizaciones y solicitudes de pago se vean más
-- "real estate": una imagen por unidad de inventario (persistente, ligada al
-- proyecto) y una imagen opcional por cotización libre (no hay unidad de
-- inventario detrás, así que la imagen se sube directo a la cotización).
--
-- Dos buckets nuevos, mismo patrón que 0025_bucket_logos_proyectos.sql
-- (público + policy permisiva sobre storage.objects), con límite de tamaño y
-- tipos MIME para no aceptar archivos arbitrarios:
--   - "renders-unidades": ruta {proyecto_id}/{unidad_id}/{archivo}, persiste
--     con el inventario.
--   - "cotizaciones-libres": ruta {timestamp}-{archivo}, bucket "temporal"
--     (no hay unidad/proyecto que la posea) para el flujo de cotización libre.

alter table public.unidades add column if not exists imagen_url text null;
alter table public.cotizaciones add column if not exists imagen_url text null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renders-unidades', 'renders-unidades', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anon acceso total renders unidades" on storage.objects;
create policy "anon acceso total renders unidades" on storage.objects
  for all using (bucket_id = 'renders-unidades') with check (bucket_id = 'renders-unidades');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones-libres', 'cotizaciones-libres', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anon acceso total cotizaciones libres" on storage.objects;
create policy "anon acceso total cotizaciones libres" on storage.objects
  for all using (bucket_id = 'cotizaciones-libres') with check (bucket_id = 'cotizaciones-libres');
