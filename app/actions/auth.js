"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES_VALIDOS = ["SOLICITANTE", "APROBADOR", "TESORERIA", "ADMIN"];

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
