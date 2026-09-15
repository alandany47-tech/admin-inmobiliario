"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES_VALIDOS = ["SOLICITANTE", "APROBADOR", "TESORERIA", "ADMIN"];
const MODULOS_VALIDOS = [
  "SOLICITUDES",
  "TESORERIA",
  "WBS",
  "PROYECTOS",
  "PROVEEDORES",
  "UNIDADES",
  "COTIZADOR",
  "COBRANZA",
  "CONFIGURACION",
  // A diferencia de los 9 de arriba, este no gatea una sección del navbar:
  // gatea la ACCIÓN de autorizar dentro de autorizar_solicitud() y
  // autorizar_orden_cambio_wbs() (0046) — un candado real en el RPC, no
  // cosmético como las claves de vista de 0045.
  "AUTORIZACIONES_GLOBAL",
];
// Claves finas por vista (0045): cada una vive bajo un módulo de la lista de
// arriba, que sigue siendo el piso real de acceso a datos vía RLS. Una fila
// ausente para una de estas claves en permisos_usuario significa "hereda el
// nivel del módulo padre" — ver VISTAS_POR_MODULO en ModalPermisosUsuario.js.
const VISTAS_VALIDAS = [
  "SOLICITUDES_CREAR",
  "SOLICITUDES_MIS",
  "SOLICITUDES_AUTORIZACIONES",
  "SOLICITUDES_HISTORIAL",
  "WBS_PRESUPUESTO",
  "WBS_ORDENES_CAMBIO",
  "TESORERIA_DISPERSION",
  "TESORERIA_CONTROL_MAESTRO",
  "CONFIGURACION_PLANTILLAS",
  "CONFIGURACION_IMPORTAR",
];
const NIVELES_ACCESO_VALIDOS = ["sin_acceso", "lectura", "lectura_escritura"];

/** Inicia sesión con correo/contraseña y redirige al dashboard. */
export async function iniciarSesion(formData) {
  const email = formData.get("email");
  const password = formData.get("password");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Credenciales inválidas. Verifica tu correo y contraseña." };
  }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("activo")
    .eq("id", data.user.id)
    .single();

  if (perfil && !perfil.activo) {
    await supabase.auth.signOut();
    return { error: "Tu cuenta está desactivada. Contacta a un administrador." };
  }

  redirect("/dashboard");
}

/** Cambia la contraseña del usuario autenticado y apaga el flag de cambio obligatorio. */
export async function cambiarPassword(formData) {
  const nueva = formData.get("password")?.toString() ?? "";
  const confirmacion = formData.get("confirmar")?.toString() ?? "";

  if (nueva.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (nueva !== confirmacion) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });

  if (error) {
    return { error: `No se pudo actualizar la contraseña: ${error.message}` };
  }

  await supabase.rpc("marcar_password_cambiada");
  redirect("/dashboard");
}

/** Cierra la sesión actual y redirige al login. */
export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Perfil (nombre, rol, etc.) del usuario autenticado, o null si no hay sesión. */
export async function getPerfilActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("*")
    .eq("id", user.id)
    .single();

  return perfil;
}

/** Lista todos los perfiles de usuario (requiere rol ADMIN/APROBADOR/TESORERIA por RLS). */
export async function getPerfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perfiles_usuario")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al consultar perfiles de usuario:", error.message);
    return [];
  }

  return data;
}

/** Crea un usuario nuevo con contraseña temporal definida por un ADMIN (solo ADMIN; usa la service role key, RLS no aplica). */
export async function crearUsuario(formData) {
  const perfilActual = await getPerfilActual();
  if (!perfilActual || perfilActual.rol !== "ADMIN") {
    return { error: "No autorizado." };
  }

  const email = formData.get("email")?.toString().trim();
  const nombre = formData.get("nombre")?.toString().trim();
  const password = formData.get("password")?.toString() ?? "";

  if (!email) {
    return { error: "El correo es obligatorio." };
  }
  if (password.length < 8) {
    return { error: "La contraseña temporal debe tener al menos 8 caracteres." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: nombre ? { full_name: nombre } : undefined,
  });

  if (error) {
    return { error: `No se pudo crear el usuario: ${error.message}` };
  }

  const { data: perfil } = await admin
    .from("perfiles_usuario")
    .select("*")
    .eq("id", data.user.id)
    .single();

  revalidatePath("/configuracion/permisos");
  return { ok: true, perfil };
}

/** Cambia el rol de un usuario (solo ADMIN, aplicado también por RLS). */
export async function actualizarRolUsuario(id, rol) {
  if (!ROLES_VALIDOS.includes(rol)) {
    return { error: "Rol no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles_usuario")
    .update({ rol, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el rol: ${error.message}` };
  }

  revalidatePath("/configuracion/permisos");
  return { ok: true };
}

/** Activa o desactiva a un usuario (solo ADMIN, aplicado también por RLS). */
export async function actualizarEstatusUsuario(id, activo) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles_usuario")
    .update({ activo, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el estatus: ${error.message}` };
  }

  revalidatePath("/configuracion/permisos");
  return { ok: true };
}

const ZONAS_FIRMA_VALIDAS = ["izquierda", "derecha", null];

/** Fija la zona de firma (izquierda/derecha/ninguna) de un usuario en el PDF (solo ADMIN). */
export async function actualizarFirmaZona(id, zona) {
  const zonaNormalizada = zona || null;
  if (!ZONAS_FIRMA_VALIDAS.includes(zonaNormalizada)) {
    return { error: "Zona de firma no válida." };
  }

  const perfilActual = await getPerfilActual();
  if (!perfilActual || perfilActual.rol !== "ADMIN") {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles_usuario")
    .update({ firma_zona: zonaNormalizada, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar la zona de firma: ${error.message}` };
  }

  revalidatePath("/configuracion/permisos");
  return { ok: true };
}

/**
 * true si el usuario autenticado puede autorizar solicitudes de pago y
 * órdenes de cambio WBS (0046) — espejo en JS del check que ya hacen
 * autorizar_solicitud() y autorizar_orden_cambio_wbs() vía tiene_acceso(),
 * para poder ocultar/deshabilitar los botones de autorizar en la UI en vez
 * de dejar que el usuario los presione y reciba el error del RPC.
 */
export async function esAutorizadorGlobal() {
  const perfil = await getPerfilActual();
  if (!perfil) return false;
  if (perfil.rol === "ADMIN") return true;

  const supabase = await createClient();
  const { data } = await supabase
    .from("permisos_usuario")
    .select("nivel")
    .eq("usuario_id", perfil.id)
    .eq("modulo", "AUTORIZACIONES_GLOBAL")
    .maybeSingle();

  return data?.nivel === "lectura_escritura";
}

/** Lista los permisos por módulo de un usuario (filas ausentes = sin_acceso). */
export async function getPermisosUsuario(usuarioId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permisos_usuario")
    .select("modulo, nivel")
    .eq("usuario_id", usuarioId);

  if (error) {
    console.error("Error al consultar permisos del usuario:", error.message);
    return [];
  }

  return data;
}

/**
 * Fija el nivel de acceso de un usuario a un módulo o a una vista fina
 * (solo ADMIN, aplicado también por RLS). `clave` acepta ambos: los 9
 * módulos base (gatean datos vía RLS) y las claves de vista de 0045
 * (solo controlan qué se muestra en el navbar — ver Navbar.js).
 */
export async function actualizarPermisoModulo(usuarioId, clave, nivel) {
  if (!MODULOS_VALIDOS.includes(clave) && !VISTAS_VALIDAS.includes(clave)) {
    return { error: "Módulo no válido." };
  }
  if (!NIVELES_ACCESO_VALIDOS.includes(nivel)) {
    return { error: "Nivel de acceso no válido." };
  }

  const perfilActual = await getPerfilActual();
  if (!perfilActual || perfilActual.rol !== "ADMIN") {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("permisos_usuario")
    .upsert({ usuario_id: usuarioId, modulo: clave, nivel }, { onConflict: "usuario_id,modulo" });

  if (error) {
    return { error: `No se pudo actualizar el permiso: ${error.message}` };
  }

  revalidatePath("/configuracion/permisos");
  return { ok: true };
}

/**
 * Quita el override de una vista para que vuelva a heredar el nivel de su
 * módulo padre (solo ADMIN). No aplica a los 9 módulos base: esos no tienen
 * padre del cual heredar, así que fila ausente = sin_acceso para ellos.
 */
export async function heredarPermisoVista(usuarioId, vista) {
  if (!VISTAS_VALIDAS.includes(vista)) {
    return { error: "Vista no válida." };
  }

  const perfilActual = await getPerfilActual();
  if (!perfilActual || perfilActual.rol !== "ADMIN") {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("permisos_usuario")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("modulo", vista);

  if (error) {
    return { error: `No se pudo restablecer la herencia: ${error.message}` };
  }

  revalidatePath("/configuracion/permisos");
  return { ok: true };
}

/**
 * Sube la imagen de firma del usuario autenticado (sello visual, sin validez
 * legal) y la guarda en su perfil vía RPC security definer, ya que la
 * policy de UPDATE de perfiles_usuario solo permite escribir a un ADMIN.
 */
export async function subirMiFirma(formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (archivo.type !== "image/png") {
    return { error: "La firma debe ser un archivo PNG." };
  }

  const perfilActual = await getPerfilActual();
  if (!perfilActual) {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();
  const ruta = `${perfilActual.id}/${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage
    .from("firmas-usuarios")
    .upload(ruta, archivo, { upsert: true });

  if (errorSubida) {
    return { error: `No se pudo subir la firma: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("firmas-usuarios").getPublicUrl(ruta);

  const { error: errorRpc } = await supabase.rpc("actualizar_mi_firma", { p_firma_url: publicUrl });

  if (errorRpc) {
    return { error: `No se pudo guardar la firma: ${errorRpc.message}` };
  }

  revalidatePath("/perfil");
  return { ok: true, url: publicUrl };
}

/** Elimina la firma del usuario autenticado del bucket "firmas-usuarios" y limpia su referencia vía el mismo RPC de subirMiFirma. */
export async function eliminarMiFirma() {
  const perfilActual = await getPerfilActual();
  if (!perfilActual) {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();

  if (perfilActual.firma_imagen_url) {
    const ruta = perfilActual.firma_imagen_url.split("/firmas-usuarios/")[1];
    if (ruta) {
      const { error: errorBorrado } = await supabase.storage.from("firmas-usuarios").remove([ruta]);
      if (errorBorrado) {
        return { error: `No se pudo eliminar el archivo: ${errorBorrado.message}` };
      }
    }
  }

  const { error: errorRpc } = await supabase.rpc("actualizar_mi_firma", { p_firma_url: null });

  if (errorRpc) {
    return { error: `No se pudo eliminar la firma: ${errorRpc.message}` };
  }

  revalidatePath("/perfil");
  return { ok: true };
}

/**
 * Actualiza foto de perfil y/o puesto del usuario autenticado (nunca rol/activo)
 * vía RPC security definer, ya que la policy de UPDATE de perfiles_usuario
 * solo permite escribir a un ADMIN. Read-modify-write: cualquier campo omitido
 * conserva su valor actual.
 */
export async function actualizarMiPerfilExtendido({ fotoUrl, puesto } = {}) {
  const perfilActual = await getPerfilActual();
  if (!perfilActual) {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_mi_perfil_extendido", {
    p_foto_url: fotoUrl !== undefined ? fotoUrl : perfilActual.foto_url,
    p_puesto: puesto !== undefined ? puesto?.trim() || null : perfilActual.puesto,
  });

  if (error) {
    return { error: `No se pudo actualizar el perfil: ${error.message}` };
  }

  revalidatePath("/perfil");
  return { ok: true };
}

/** Sube la foto de perfil del usuario autenticado al bucket "fotos-usuarios". */
export async function subirMiFoto(formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type)) {
    return { error: "La foto debe ser PNG, JPG o WEBP." };
  }

  const perfilActual = await getPerfilActual();
  if (!perfilActual) {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();
  const ruta = `${perfilActual.id}/${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage
    .from("fotos-usuarios")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

  if (errorSubida) {
    return { error: `No se pudo subir la foto: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("fotos-usuarios").getPublicUrl(ruta);

  const resultado = await actualizarMiPerfilExtendido({ fotoUrl: publicUrl });
  if (resultado.error) return resultado;

  return { ok: true, url: publicUrl };
}

/** Elimina la foto de perfil del usuario autenticado del bucket "fotos-usuarios" y limpia su referencia. */
export async function eliminarMiFoto() {
  const perfilActual = await getPerfilActual();
  if (!perfilActual) {
    return { error: "No autorizado." };
  }

  const supabase = await createClient();

  if (perfilActual.foto_url) {
    const ruta = perfilActual.foto_url.split("/fotos-usuarios/")[1];
    if (ruta) {
      const { error: errorBorrado } = await supabase.storage.from("fotos-usuarios").remove([ruta]);
      if (errorBorrado) {
        return { error: `No se pudo eliminar el archivo: ${errorBorrado.message}` };
      }
    }
  }

  return actualizarMiPerfilExtendido({ fotoUrl: null });
}
