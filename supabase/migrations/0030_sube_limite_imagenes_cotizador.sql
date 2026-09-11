-- Sube el tope de tamaño de "renders-unidades" y "cotizaciones-libres" de
-- 10MB a 25MB (renders reales de unidades pesan más de lo previsto en
-- 0026_imagenes_unidades_cotizaciones.sql). Va de la mano con
-- experimental.serverActions.bodySizeLimit=25mb en next.config.mjs: sin ese
-- cambio, Next.js corta la subida en su límite de 1MB por Server Action
-- antes de que el archivo llegue a Supabase.

update storage.buckets set file_size_limit = 26214400 where id = 'renders-unidades';
update storage.buckets set file_size_limit = 26214400 where id = 'cotizaciones-libres';
