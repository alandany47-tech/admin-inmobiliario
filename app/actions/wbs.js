"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarPartidaWbs } from "@/lib/wbs";

// Pendiente para siguiente fase (ver 0007_wbs_presupuesto.sql):
// - Backfill de wbs_catalog_id para solicitudes históricas.
// - Vista de detalle por partida con el listado de solicitudes que la componen.

/**
 * IDs de wbs_catalog que ya tienen dinero real "Pagado" asociado, ya sea
 * directo (solicitudes_pago.wbs_catalog_id) o vía reparto de gasto
 * corporativo (solicitud_reparto_corporativo). Estas partidas no deben
 * poder renombrarse ni desactivarse.
 */
async function wbsTienePagosAsociados(supabase, ids) {
  if (!ids?.length) return new Set();

  const [{ data: directos, error: errorDirectos }, { data: repartidos, error: errorRepartidos }] =
    await Promise.all([
      supabase.from("solicitudes_pago").select("wbs_catalog_id").in("wbs_catalog_id", ids).eq("estado", "Pagado"),
      supabase
        .from("solicitud_reparto_corporativo")
        .select("wbs_id, solicitudes_pago!inner(estado)")
        .in("wbs_id", ids)
        .eq("solicitudes_pago.estado", "Pagado"),
    ]);

  if (errorDirectos || errorRepartidos) {
    throw new Error(errorDirectos?.message || errorRepartidos?.message);
  }

  const idsConPago = new Set((directos ?? []).map((p) => p.wbs_catalog_id));
  (repartidos ?? []).forEach((r) => idsConPago.add(r.wbs_id));
  return idsConPago;
}

/**
 * Lista el catálogo WBS (entradas generales y específicas por proyecto),
 * incluyendo presupuesto/ejercido/disponible de wbs_presupuesto_resumen para
 * que el combobox de SolicitudPagoForm pueda alertar si una solicitud excede
 * el disponible de la subpartida hoja seleccionada.
 */
export async function getWbsCatalog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wbs_presupuesto_resumen")
    .select("id, proyecto_id, categoria, partida, codigo, parent_id, presupuesto, ejercido, disponible, activo")
    .order("categoria", { ascending: true })
    .order("partida", { ascending: true });

  if (error) {
    console.error("Error al consultar el catálogo WBS:", error.message);
    return [];
  }

  return data.map((w) => ({ ...w, ...normalizarPartidaWbs(w.partida, w.codigo) }));
}

/** Presupuesto/ejercido/disponible por partida WBS de un proyecto específico. */
export async function getWbsPresupuesto(proyectoId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wbs_presupuesto_resumen")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .order("categoria", { ascending: true })
    .order("partida", { ascending: true });

  if (error) {
    console.error("Error al consultar presupuesto WBS:", error.message);
    return [];
  }

  return data.map((w) => ({ ...w, ...normalizarPartidaWbs(w.partida, w.codigo) }));
}

/**
 * Desglose de pagos de una partida WBS (o de todo su subárbol si tiene
 * hijos): delega en la RPC recursiva get_desglose_pagos_wbs.
 */
export async function getDesglosePagosWbs(wbsId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_desglose_pagos_wbs", { p_wbs_id: wbsId });

  if (error) {
    console.error("Error al consultar el desglose de pagos WBS:", error.message);
    return [];
  }

  return data;
}

/**
 * Actualiza el techo de presupuesto de una partida. No mueve dinero: no
 * requiere función atómica. Exige `comentario` (comentario libre / número de
 * Orden de Cambio) y deja una fila en `wbs_historial_cambios` con el monto
 * anterior y el nuevo.
 */
export async function actualizarPresupuestoWbs(id, nuevoPresupuesto, comentario) {
  const monto = Number(nuevoPresupuesto);
  if (!Number.isFinite(monto) || monto < 0) {
    return { error: "Captura un presupuesto válido." };
  }
  if (!comentario?.trim()) {
    return { error: "Captura un comentario u Orden de Cambio (OC) para el historial." };
  }

  const supabase = await createClient();

  const { data: actual, error: errorActual } = await supabase
    .from("wbs_catalog")
    .select("presupuesto")
    .eq("id", id)
    .single();

  if (errorActual) {
    return { error: `No se pudo leer el presupuesto actual: ${errorActual.message}` };
  }

  const { error } = await supabase.from("wbs_catalog").update({ presupuesto: monto }).eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el presupuesto: ${error.message}` };
  }

  const { error: errorHistorial } = await supabase.from("wbs_historial_cambios").insert({
    wbs_catalog_id: id,
    presupuesto_anterior: actual.presupuesto,
    presupuesto_nuevo: monto,
    comentario: comentario.trim(),
  });

  if (errorHistorial) {
    return { error: `Presupuesto actualizado, pero no se pudo registrar el historial: ${errorHistorial.message}` };
  }

  revalidatePath("/wbs");
  return { ok: true };
}

/** Renombra la categoría/partida de una fila; bloqueado si tiene solicitudes pagadas asociadas. */
export async function renombrarPartidaWbs(id, categoria, partida) {
  if (!categoria?.trim() || !partida?.trim()) {
    return { error: "Captura categoría y partida." };
  }

  const supabase = await createClient();
  let tienePagos;
  try {
    tienePagos = await wbsTienePagosAsociados(supabase, [id]);
  } catch (e) {
    return { error: `No se pudo validar la partida: ${e.message}` };
  }

  if (tienePagos.has(id)) {
    return { error: "No se puede renombrar: tiene solicitudes pagadas asociadas." };
  }

  const { error } = await supabase
    .from("wbs_catalog")
    .update({ categoria: categoria.trim(), partida: partida.trim() })
    .eq("id", id);

  if (error) {
    return { error: `No se pudo renombrar la partida: ${error.message}` };
  }

  revalidatePath("/wbs");
  return { ok: true };
}

/**
 * Calcula el diff entre el catálogo WBS actual de un proyecto y las filas de
 * un Excel importado, sin aplicar ningún cambio. `filas` es un arreglo de
 * { categoria, partida, presupuesto } ya parseado en el cliente.
 */
export async function previsualizarImportWbs(proyectoId, filas) {
  const supabase = await createClient();

  const { data: existentes, error } = await supabase
    .from("wbs_catalog")
    .select("id, categoria, partida, presupuesto, activo")
    .eq("proyecto_id", proyectoId);

  if (error) {
    return { error: `No se pudo leer el catálogo actual: ${error.message}` };
  }

  const clave = (c, p) => `${c.trim().toLowerCase()}|${p.trim().toLowerCase()}`;
  const mapaExistente = new Map(existentes.map((w) => [clave(w.categoria, w.partida), w]));
  const clavesImportadas = new Set();

  const nuevas = [];
  const actualizadas = [];

  for (const fila of filas) {
    const categoria = String(fila.categoria ?? "").trim();
    const partida = String(fila.partida ?? "").trim();
    const presupuesto = Number(fila.presupuesto);
    if (!categoria || !partida || !Number.isFinite(presupuesto)) continue;

    const k = clave(categoria, partida);
    clavesImportadas.add(k);
    const existente = mapaExistente.get(k);

    if (!existente) {
      nuevas.push({ categoria, partida, presupuesto });
    } else if (Number(existente.presupuesto) !== presupuesto) {
      actualizadas.push({
        id: existente.id,
        categoria,
        partida,
        presupuestoAnterior: existente.presupuesto,
        presupuestoNuevo: presupuesto,
      });
    }
  }

  const faltantes = existentes.filter(
    (w) => w.activo && !clavesImportadas.has(clave(w.categoria, w.partida))
  );

  let noVienen = [];
  if (faltantes.length > 0) {
    const ids = faltantes.map((w) => w.id);
    let idsConPago;
    try {
      idsConPago = await wbsTienePagosAsociados(supabase, ids);
    } catch (e) {
      return { error: `No se pudo validar pagos asociados: ${e.message}` };
    }

    noVienen = faltantes.map((w) => ({
      id: w.id,
      categoria: w.categoria,
      partida: w.partida,
      bloqueada: idsConPago.has(w.id),
    }));
  }

  return { nuevas, actualizadas, noVienen };
}

/** Aplica un diff ya previsualizado: inserta nuevas, actualiza montos y desactiva las que ya no vienen (si no tienen pagos). */
export async function aplicarImportWbs(proyectoId, { nuevas, actualizadas, noVienen }) {
  const supabase = await createClient();

  if (nuevas?.length > 0) {
    const { error } = await supabase.from("wbs_catalog").insert(
      nuevas.map((n) => ({
        proyecto_id: proyectoId,
        categoria: n.categoria,
        partida: n.partida,
        presupuesto: n.presupuesto,
      }))
    );
    if (error) return { error: `No se pudieron insertar las partidas nuevas: ${error.message}` };
  }

  for (const a of actualizadas ?? []) {
    const { error } = await supabase
      .from("wbs_catalog")
      .update({ presupuesto: a.presupuestoNuevo })
      .eq("id", a.id);
    if (error) return { error: `No se pudo actualizar la partida ${a.partida}: ${error.message}` };
  }

  const idsDesactivar = (noVienen ?? []).filter((n) => !n.bloqueada).map((n) => n.id);
  if (idsDesactivar.length > 0) {
    const { error } = await supabase.from("wbs_catalog").update({ activo: false }).in("id", idsDesactivar);
    if (error) return { error: `No se pudieron desactivar partidas: ${error.message}` };
  }

  revalidatePath("/wbs");
  return { ok: true };
}
