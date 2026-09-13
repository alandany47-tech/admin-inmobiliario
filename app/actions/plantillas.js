"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const CLAVES_VALIDAS = ["RECIBO_PAGO", "ESTADO_CUENTA", "SOLICITUD_PAGO", "COTIZACION"];
const TIPOS_IMAGEN_VALIDOS = ["image/png", "image/jpeg", "image/webp"];

/**
 * Nombres de captura de pantalla de macOS pueden traer un espacio angosto
 * (U+202F, "1.04.24 p.m.") u otros caracteres que Supabase Storage rechaza
 * con 400 al usarlos tal cual en el key del objeto. Usamos solo la extensión.
 */
function extensionSegura(nombreArchivo) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(nombreArchivo || "");
  return match ? match[1].toLowerCase() : "png";
}

/** Lista la configuración de las 3 plantillas PDF (Recibo de Pago, Estado de Cuenta, Solicitud de Pago). */
export async function getConfiguracionPlantillas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_plantillas")
    .select("*")
    .order("clave", { ascending: true });

  if (error) {
    console.error("Error al consultar la configuración de plantillas:", error.message);
    return [];
  }

  return data;
}

/** Configuración de una sola plantilla, usada por los generadores de PDF antes de renderizar. */
export async function getConfiguracionPlantilla(clave) {
  if (!CLAVES_VALIDAS.includes(clave)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_plantillas")
    .select("*")
    .eq("clave", clave)
    .maybeSingle();

  if (error) {
    console.error("Error al consultar la plantilla:", error.message);
    return null;
  }

  return data;
}

/** Actualiza los parámetros visuales de una plantilla PDF. */
export async function actualizarConfiguracionPlantilla(clave, payload) {
  if (!CLAVES_VALIDAS.includes(clave)) {
    return { error: "Plantilla no válida." };
  }

  const { encabezadoLinea1, encabezadoLinea2, piePagina, colorPrimario, terminosCondiciones } = payload;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_plantillas")
    .update({
      encabezado_linea1: encabezadoLinea1?.trim() || null,
      encabezado_linea2: encabezadoLinea2?.trim() || null,
      pie_pagina: piePagina?.trim() || null,
      color_primario: colorPrimario?.trim() || "#0f172a",
      terminos_condiciones: terminosCondiciones?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("clave", clave)
    .select()
    .single();

  if (error) {
    return { error: `No se pudo actualizar la plantilla: ${error.message}` };
  }

  revalidatePath("/configuracion/plantillas");
  return { ok: true, plantilla: data };
}

/** Sube el logo de una plantilla PDF al bucket "logos-plantillas" y actualiza su `logo_url`. */
export async function subirLogoPlantilla(clave, formData) {
  if (!CLAVES_VALIDAS.includes(clave)) {
    return { error: "Plantilla no válida." };
  }

  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (!TIPOS_IMAGEN_VALIDOS.includes(archivo.type)) {
    return { error: "El logo debe ser PNG, JPG o WEBP." };
  }

  const supabase = await createClient();
  const ruta = `${clave}/${Date.now()}.${extensionSegura(archivo.name)}`;

  const { error: errorSubida } = await supabase.storage
    .from("logos-plantillas")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

  if (errorSubida) {
    return { error: `No se pudo subir el logo: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("logos-plantillas").getPublicUrl(ruta);

  const { data, error: errorUpdate } = await supabase
    .from("configuracion_plantillas")
    .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("clave", clave)
    .select()
    .single();

  if (errorUpdate) {
    return { error: `No se pudo guardar la referencia del logo: ${errorUpdate.message}` };
  }

  revalidatePath("/configuracion/plantillas");
  return { ok: true, url: publicUrl, plantilla: data };
}
