-- Bucket público para los logos de configuracion_plantillas (RECIBO_PAGO,
-- ESTADO_CUENTA, SOLICITUD_PAGO, COTIZACION), que hasta ahora se llenaban
-- pegando una URL de texto a mano en PanelConfiguracionPlantillas.js. Migra
-- al mismo patrón de carga directa de archivo que "logos-proyectos"
-- (0025_bucket_logos_proyectos.sql) y "logos-empresa" (0029), pero con
-- file_size_limit/allowed_mime_types explícitos como "cotizaciones-libres" y
-- "renders-unidades" (0026, sube a 25MB en 0030). `configuracion_plantillas.logo_url`
-- ya existe como columna text: no cambia el esquema, solo cómo se llena.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos-plantillas', 'logos-plantillas', true, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "anon acceso total logos plantillas" on storage.objects;
create policy "anon acceso total logos plantillas" on storage.objects
  for all using (bucket_id = 'logos-plantillas') with check (bucket_id = 'logos-plantillas');
