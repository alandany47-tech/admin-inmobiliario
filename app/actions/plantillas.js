"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const CLAVES_VALIDAS = ["RECIBO_PAGO", "ESTADO_CUENTA", "SOLICITUD_PAGO", "COTIZACION"];

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

  const { logoUrl, encabezadoLinea1, encabezadoLinea2, piePagina, colorPrimario, terminosCondiciones } = payload;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_plantillas")
    .update({
      logo_url: logoUrl?.trim() || null,
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
