"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Lista las unidades de un proyecto. */
export async function getUnidades(proyectoId) {
  if (!proyectoId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .order("codigo_unidad", { ascending: true });

  if (error) {
    console.error("Error al consultar unidades:", error.message);
    return [];
  }

  return data;
}

/** Crea una unidad de inventario para un proyecto. */
export async function crearUnidad(payload) {
  const { proyectoId, codigoUnidad, superficieM2, tipoUnidad, montoLista } = payload;

  if (!proyectoId || !codigoUnidad?.trim()) {
    return { error: "Captura proyecto y código de unidad." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .insert({
      proyecto_id: proyectoId,
      codigo_unidad: codigoUnidad.trim(),
      superficie_m2: Number(superficieM2) || 0,
      tipo_unidad: tipoUnidad || "CLIENTE",
      monto_lista: Number(montoLista) || 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: `Ya existe una unidad con el código "${codigoUnidad}" en este proyecto.` };
    }
    return { error: `No se pudo crear la unidad: ${error.message}` };
  }

  revalidatePath("/unidades");
  return { ok: true, unidad: data };
}

/** Actualiza specs de una unidad (código, superficie, tipo, monto de lista). */
export async function actualizarUnidad(id, payload) {
  const { codigoUnidad, superficieM2, tipoUnidad, montoLista } = payload;

  if (!codigoUnidad?.trim()) {
    return { error: "Captura el código de unidad." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update({
      codigo_unidad: codigoUnidad.trim(),
      superficie_m2: Number(superficieM2) || 0,
      tipo_unidad: tipoUnidad || "CLIENTE",
      monto_lista: Number(montoLista) || 0,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: `Ya existe una unidad con el código "${codigoUnidad}" en este proyecto.` };
    }
    return { error: `No se pudo actualizar la unidad: ${error.message}` };
  }

  revalidatePath("/unidades");
  return { ok: true, unidad: data };
}

/**
 * Cambia el estatus de una unidad. Pasar a 'Disponible' está bloqueado si la
 * unidad tiene un contrato de venta 'Activo' (hay que cancelar/finiquitar el
 * contrato primero, no se libera inventario con una venta vigente detrás).
 */
export async function cambiarEstatusUnidad(id, estatus) {
  if (!["Disponible", "Apartada", "Vendida"].includes(estatus)) {
    return { error: "Estatus no válido." };
  }

  const supabase = await createClient();

  if (estatus === "Disponible") {
    const { count, error: errorConteo } = await supabase
      .from("contratos_venta")
      .select("id", { count: "exact", head: true })
      .eq("unidad_id", id)
      .eq("estatus", "Activo");

    if (errorConteo) {
      return { error: `No se pudo validar la unidad: ${errorConteo.message}` };
    }
    if (count > 0) {
      return { error: "No se puede liberar: la unidad tiene un contrato de venta activo." };
    }
  }

  const { error } = await supabase.from("unidades").update({ estatus }).eq("id", id);
  if (error) {
    return { error: `No se pudo actualizar el estatus: ${error.message}` };
  }

  revalidatePath("/unidades");
  return { ok: true };
}
