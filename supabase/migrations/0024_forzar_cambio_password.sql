-- Ejecutar manualmente en el SQL Editor de Supabase (requiere permisos DDL).
-- Agrega el flag debe_cambiar_password a perfiles_usuario: se usa para
-- forzar el cambio de contraseña en el siguiente login de cuentas creadas
-- por un ADMIN con contraseña temporal (ver crearUsuario en
-- app/actions/auth.js). marcar_password_cambiada() es SECURITY DEFINER
-- para que el propio usuario pueda apagar su flag sin necesitar permisos
-- de ADMIN (la policy de escritura de perfiles_usuario sigue siendo
-- solo-ADMIN, ver 0023).

alter table public.perfiles_usuario
  add column debe_cambiar_password boolean not null default true;

-- Las cuentas que ya existían antes de este flag no deben quedar forzadas
-- a cambiar contraseña (ya la conocen); solo las que se creen de aquí en
-- adelante (vía crearUsuario, que no la pasa explícita) heredan el
-- default `true` de la columna.
update public.perfiles_usuario set debe_cambiar_password = false;

create or replace function public.marcar_password_cambiada()
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles_usuario
  set debe_cambiar_password = false, updated_at = now()
  where id = auth.uid();
$$;
