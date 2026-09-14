-- Logo compacto por proyecto: variante reducida del logo_proyecto_url para
-- documentos donde el encabezado dual completo (logo de empresa + logo de
-- proyecto) resulta demasiado ancho o pesado — Cotización y Estado de Cuenta
-- lo usan en vez del bloque EncabezadoDualLogo cuando está presente, cayendo
-- al comportamiento actual si no existe. Reutiliza el bucket "logos-proyectos"
-- (mismo dueño lógico del archivo, mismo modelo de acceso) en vez de crear
-- un bucket nuevo para una variante del mismo activo.

alter table public.proyectos
  add column logo_compacto_url text;
