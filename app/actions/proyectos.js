"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Lista proyectos con presupuesto, total pagado y conteo de partidas WBS (RPC get_proyectos_con_estadisticas). */
export async function getProyectosStats() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_proyectos_con_estadisticas");

  if (error) {
    console.error("Error al consultar estadísticas de proyectos:", error.message);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    presupuesto: Number(p.presupuesto),
    totalPagado: Number(p.total_pagado),
    totalPartidasWbs: Number(p.total_partidas_wbs),
  }));
}

function validarDatosProyecto({ codigo, nombre, presupuesto }) {
  if (!codigo?.trim()) return "Captura el código del proyecto.";
  if (!nombre?.trim()) return "Captura el nombre del proyecto.";
  const monto = Number(presupuesto);
  if (!Number.isFinite(monto) || monto < 0) return "Captura un presupuesto válido.";
  return null;
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

/** Actualiza código/nombre/presupuesto de un proyecto existente. */
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
