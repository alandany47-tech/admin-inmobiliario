"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Lista proyectos con presupuesto, total pagado y conteo de partidas WBS
 * (RPC get_proyectos_con_estadisticas) más su branding/estatus (columnas
 * propias de `proyectos`, fuera de la RPC — se agregan aquí en JS en vez de
 * tocar la función de Postgres).
 */
export async function getProyectosStats() {
  const supabase = await createClient();
  const [{ data, error }, { data: branding, error: errorBranding }] = await Promise.all([
    supabase.rpc("get_proyectos_con_estadisticas"),
    supabase
      .from("proyectos")
      .select("id, logo_proyecto_url, logo_compacto_url, color_primario, color_secundario, estatus"),
  ]);

  if (error) {
    console.error("Error al consultar estadísticas de proyectos:", error.message);
    return [];
  }
  if (errorBranding) {
    console.error("Error al consultar branding de proyectos:", errorBranding.message);
  }

  const brandingPorId = new Map((branding ?? []).map((b) => [b.id, b]));

  return data.map((p) => {
    const b = brandingPorId.get(p.id);
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      presupuesto: Number(p.presupuesto),
      totalPagado: Number(p.total_pagado),
      totalPartidasWbs: Number(p.total_partidas_wbs),
      logoProyectoUrl: b?.logo_proyecto_url ?? null,
      logoCompactoUrl: b?.logo_compacto_url ?? null,
      colorPrimario: b?.color_primario ?? "#0f172a",
      colorSecundario: b?.color_secundario ?? "#2563eb",
      estatus: b?.estatus ?? "En Desarrollo",
    };
  });
}

const ESTATUS_PROYECTO_VALIDOS = ["En Desarrollo", "Concluido", "Archivado"];

/** Branding (logo + colores) y estatus de todos los proyectos, para el Cotizador y los documentos con logo dual. */
export async function getProyectosBranding() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proyectos")
    .select("id, codigo, nombre, logo_proyecto_url, logo_compacto_url, color_primario, color_secundario, estatus");

  if (error) {
    console.error("Error al consultar el branding de proyectos:", error.message);
    return [];
  }

  return data;
}

/** Sube el logo del proyecto al bucket "logos-proyectos" y guarda su URL pública. */
export async function subirLogoProyecto(proyectoId, formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (archivo.type !== "image/png") {
    return { error: "El logo debe ser un archivo PNG." };
  }

  const supabase = await createClient();
  const ruta = `${proyectoId}/${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage
    .from("logos-proyectos")
    .upload(ruta, archivo, { upsert: true });

  if (errorSubida) {
    return { error: `No se pudo subir el logo: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("logos-proyectos").getPublicUrl(ruta);

  const { error: errorUpdate } = await supabase
    .from("proyectos")
    .update({ logo_proyecto_url: publicUrl })
    .eq("id", proyectoId);

  if (errorUpdate) {
    return { error: `No se pudo guardar la referencia del logo: ${errorUpdate.message}` };
  }

  revalidatePath("/proyectos");
  return { ok: true, url: publicUrl };
}

/** Elimina el logo del proyecto del bucket "logos-proyectos" y limpia su referencia. */
export async function eliminarLogoProyecto(proyectoId) {
  const supabase = await createClient();

  const { data: proyecto, error: errorConsulta } = await supabase
    .from("proyectos")
    .select("logo_proyecto_url")
    .eq("id", proyectoId)
    .single();

  if (errorConsulta) {
    return { error: `No se pudo consultar el proyecto: ${errorConsulta.message}` };
  }

  if (proyecto.logo_proyecto_url) {
    const ruta = proyecto.logo_proyecto_url.split("/logos-proyectos/")[1];
    if (ruta) {
      const { error: errorBorrado } = await supabase.storage.from("logos-proyectos").remove([ruta]);
      if (errorBorrado) {
        return { error: `No se pudo eliminar el archivo: ${errorBorrado.message}` };
      }
    }
  }

  const { error: errorUpdate } = await supabase
    .from("proyectos")
    .update({ logo_proyecto_url: null })
    .eq("id", proyectoId);

  if (errorUpdate) {
    return { error: `No se pudo limpiar la referencia del logo: ${errorUpdate.message}` };
  }

  revalidatePath("/proyectos");
  revalidatePath("/configuracion/plantillas");
  return { ok: true };
}

/** Sube el logo compacto del proyecto (variante reducida para Cotización/Estado de Cuenta) al mismo bucket "logos-proyectos". */
export async function subirLogoCompactoProyecto(proyectoId, formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (archivo.type !== "image/png") {
    return { error: "El logo debe ser un archivo PNG." };
  }

  const supabase = await createClient();
  const ruta = `${proyectoId}/compacto-${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage
    .from("logos-proyectos")
    .upload(ruta, archivo, { upsert: true });

  if (errorSubida) {
    return { error: `No se pudo subir el logo: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("logos-proyectos").getPublicUrl(ruta);

  const { error: errorUpdate } = await supabase
    .from("proyectos")
    .update({ logo_compacto_url: publicUrl })
    .eq("id", proyectoId);

  if (errorUpdate) {
    return { error: `No se pudo guardar la referencia del logo: ${errorUpdate.message}` };
  }

  revalidatePath("/proyectos");
  revalidatePath("/configuracion/plantillas");
  return { ok: true, url: publicUrl };
}

/** Elimina el logo compacto del proyecto del bucket "logos-proyectos" y limpia su referencia. */
export async function eliminarLogoCompactoProyecto(proyectoId) {
  const supabase = await createClient();

  const { data: proyecto, error: errorConsulta } = await supabase
    .from("proyectos")
    .select("logo_compacto_url")
    .eq("id", proyectoId)
    .single();

  if (errorConsulta) {
    return { error: `No se pudo consultar el proyecto: ${errorConsulta.message}` };
  }

  if (proyecto.logo_compacto_url) {
    const ruta = proyecto.logo_compacto_url.split("/logos-proyectos/")[1];
    if (ruta) {
      const { error: errorBorrado } = await supabase.storage.from("logos-proyectos").remove([ruta]);
      if (errorBorrado) {
        return { error: `No se pudo eliminar el archivo: ${errorBorrado.message}` };
      }
    }
  }

  const { error: errorUpdate } = await supabase
    .from("proyectos")
    .update({ logo_compacto_url: null })
    .eq("id", proyectoId);

  if (errorUpdate) {
    return { error: `No se pudo limpiar la referencia del logo: ${errorUpdate.message}` };
  }

  revalidatePath("/proyectos");
  revalidatePath("/configuracion/plantillas");
  return { ok: true };
}

/**
 * Actualiza solo el color de acento (primario/secundario) de un proyecto,
 * sin tocar código/nombre/presupuesto/logo — usado desde el editor rápido de
 * "Logo y color por proyecto" en Configuración de Plantillas PDF.
 */
export async function actualizarColoresProyecto(id, { colorPrimario, colorSecundario }) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("proyectos")
    .update({
      color_primario: colorPrimario?.trim() || "#0f172a",
      color_secundario: colorSecundario?.trim() || "#2563eb",
    })
    .eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el color: ${error.message}` };
  }

  revalidatePath("/proyectos");
  revalidatePath("/configuracion/plantillas");
  return { ok: true };
}

function validarDatosProyecto({ codigo, nombre, presupuesto }) {
  if (!codigo?.trim()) return "Captura el código del proyecto.";
  if (!nombre?.trim()) return "Captura el nombre del proyecto.";
  const monto = Number(presupuesto);
  if (!Number.isFinite(monto) || monto < 0) return "Captura un presupuesto válido.";
  return null;
}

function datosBrandingProyecto(datos) {
  return {
    logo_proyecto_url: datos.logoProyectoUrl?.trim() || null,
    color_primario: datos.colorPrimario?.trim() || "#0f172a",
    color_secundario: datos.colorSecundario?.trim() || "#2563eb",
    estatus: ESTATUS_PROYECTO_VALIDOS.includes(datos.estatus) ? datos.estatus : "En Desarrollo",
  };
}

/** Crea un proyecto nuevo. El código es único (constraint de base de datos). */
export async function crearProyecto(datos) {
  const mensajeError = validarDatosProyecto(datos);
  if (mensajeError) return { error: mensajeError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proyectos")
    .insert({
      codigo: datos.codigo.trim().toUpperCase(),
      nombre: datos.nombre.trim(),
      presupuesto: Number(datos.presupuesto),
      ...datosBrandingProyecto(datos),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe un proyecto con ese código." };
    return { error: `No se pudo crear el proyecto: ${error.message}` };
  }

  revalidatePath("/proyectos");
  return { ok: true, proyecto: data };
}

/** Actualiza código/nombre/presupuesto/branding/estatus de un proyecto existente. */
export async function actualizarProyecto(id, datos) {
  const mensajeError = validarDatosProyecto(datos);
  if (mensajeError) return { error: mensajeError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("proyectos")
    .update({
      codigo: datos.codigo.trim().toUpperCase(),
      nombre: datos.nombre.trim(),
      presupuesto: Number(datos.presupuesto),
      ...datosBrandingProyecto(datos),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "Ya existe un proyecto con ese código." };
    return { error: `No se pudo actualizar el proyecto: ${error.message}` };
  }

  revalidatePath("/proyectos");
  return { ok: true };
}

/** Elimina un proyecto, validando primero que no tenga solicitudes, movimientos o partidas WBS asociadas. */
export async function eliminarProyecto(id) {
  const supabase = await createClient();

  const [solicitudes, movimientos, wbs] = await Promise.all([
    supabase.from("solicitudes_pago").select("id", { count: "exact", head: true }).eq("proyecto_id", id),
    supabase.from("movimientos_tesoreria").select("id", { count: "exact", head: true }).eq("proyecto_id", id),
    supabase.from("wbs_catalog").select("id", { count: "exact", head: true }).eq("proyecto_id", id),
  ]);

  const errorConteo = solicitudes.error || movimientos.error || wbs.error;
  if (errorConteo) return { error: `No se pudo validar dependencias: ${errorConteo.message}` };

  if (solicitudes.count > 0 || movimientos.count > 0) {
    return { error: "No se puede eliminar: el proyecto tiene solicitudes de pago o movimientos de tesorería asociados." };
  }
  if (wbs.count > 0) {
    return { error: "No se puede eliminar: el proyecto tiene partidas de presupuesto WBS asociadas." };
  }

  const { error } = await supabase.from("proyectos").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar el proyecto: ${error.message}` };

  revalidatePath("/proyectos");
  return { ok: true };
}
