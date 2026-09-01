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

/** Invita a un usuario nuevo por correo (solo ADMIN; usa la service role key, RLS no aplica). */
export async function invitarUsuario(formData) {
  const perfilActual = await getPerfilActual();
  if (!perfilActual || perfilActual.rol !== "ADMIN") {
    return { error: "No autorizado." };
  }

  const email = formData.get("email")?.toString().trim();
  const nombre = formData.get("nombre")?.toString().trim();

  if (!email) {
    return { error: "El correo es obligatorio." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: nombre ? { full_name: nombre } : undefined,
  });

  if (error) {
    return { error: `No se pudo invitar al usuario: ${error.message}` };
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
