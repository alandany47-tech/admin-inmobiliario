"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Pendiente para siguiente fase (ver 0007_wbs_presupuesto.sql):
// - Backfill de wbs_catalog_id para solicitudes históricas.
// - Vista de detalle por partida con el listado de solicitudes que la componen.

/** Lista el catálogo WBS (entradas generales y específicas por proyecto). */
export async function getWbsCatalog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wbs_catalog")
    .select("id, proyecto_id, categoria, partida, codigo")
    .order("categoria", { ascending: true })
    .order("partida", { ascending: true });

  if (error) {
    console.error("Error al consultar el catálogo WBS:", error.message);
    return [];
  }

  return data;
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

  return data;
}

/** Actualiza el techo de presupuesto de una partida. No mueve dinero: no requiere función atómica. */
export async function actualizarPresupuestoWbs(id, nuevoPresupuesto) {
  const monto = Number(nuevoPresupuesto);
  if (!Number.isFinite(monto) || monto < 0) {
    return { error: "Captura un presupuesto válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("wbs_catalog").update({ presupuesto: monto }).eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el presupuesto: ${error.message}` };
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
  const { count, error: errorConteo } = await supabase
    .from("solicitudes_pago")
    .select("id", { count: "exact", head: true })
    .eq("wbs_catalog_id", id)
    .eq("estado", "Pagado");

  if (errorConteo) {
    return { error: `No se pudo validar la partida: ${errorConteo.message}` };
  }
  if (count > 0) {
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
    const { data: pagos, error: errorPagos } = await supabase
      .from("solicitudes_pago")
      .select("wbs_catalog_id")
      .in("wbs_catalog_id", ids)
      .eq("estado", "Pagado");

    if (errorPagos) {
      return { error: `No se pudo validar pagos asociados: ${errorPagos.message}` };
    }

    const idsConPago = new Set((pagos ?? []).map((p) => p.wbs_catalog_id));
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
