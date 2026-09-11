-- Bucket público de Storage para los logos de proyecto (proyectos.logo_proyecto_url,
-- agregada en 0021_unidades_cobranza_inversion.sql). Replica el mismo patrón que el
-- bucket "comprobantes" de 0005_wbs_y_comprobantes.sql: bucket público + policy
-- permisiva de acceso total sobre storage.objects para ese bucket_id.

insert into storage.buckets (id, name, public)
values ('logos-proyectos', 'logos-proyectos', true)
on conflict (id) do nothing;

drop policy if exists "anon acceso total logos proyectos" on storage.objects;
create policy "anon acceso total logos proyectos" on storage.objects
  for all using (bucket_id = 'logos-proyectos') with check (bucket_id = 'logos-proyectos');
