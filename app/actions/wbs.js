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
    .select(
      "id, proyecto_id, categoria, partida, codigo, parent_id, presupuesto, unidad, cantidad, precio_unitario, porcentaje_iva, presupuesto_iva, presupuesto_total, ejercido, disponible, activo"
    )
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
 * Propone un nuevo techo de presupuesto para una partida (y opcionalmente su
 * unidad/cantidad/precio unitario, capturados juntos porque cantidad×precio
 * es lo que produce el nuevo presupuesto en el flujo de captura por unidad).
 * NO modifica `wbs_catalog` todavía: crea una Orden de Cambio en estado "Por
 * Autorizar" — el presupuesto solo se aplica cuando alguien más (nunca quien
 * la propuso, ver `autorizar_orden_cambio_wbs`) la autoriza desde
 * /wbs/ordenes-cambio. Exige `comentario` (queda como justificación de la
 * orden y, al autorizarse, como comentario del historial).
 */
export async function crearOrdenCambioWbs(id, nuevoPresupuesto, comentario, detalle) {
  const monto = Number(nuevoPresupuesto);
  if (!Number.isFinite(monto) || monto < 0) {
    return { error: "Captura un presupuesto válido." };
  }
  if (!comentario?.trim()) {
    return { error: "Captura un comentario u Orden de Cambio (OC)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: actual, error: errorActual } = await supabase
    .from("wbs_catalog")
    .select("presupuesto")
    .eq("id", id)
    .single();

  if (errorActual) {
    return { error: `No se pudo leer el presupuesto actual: ${errorActual.message}` };
  }

  const { error } = await supabase.from("wbs_ordenes_cambio").insert({
    wbs_catalog_id: id,
    presupuesto_anterior: actual.presupuesto,
    presupuesto_nuevo: monto,
    unidad_nueva: detalle?.unidad || null,
    cantidad_nueva: detalle?.cantidad ?? null,
    precio_unitario_nuevo: detalle?.precio_unitario ?? null,
    comentario: comentario.trim(),
    solicitado_por: user?.id ?? null,
  });

  if (error) {
    return { error: `No se pudo crear la orden de cambio: ${error.message}` };
  }

  revalidatePath("/wbs");
  revalidatePath("/wbs/ordenes-cambio");
  return { ok: true, pendiente: true };
}

/**
 * Actualiza unidad/cantidad/precio unitario SIN mover el presupuesto (por
 * eso no pasa por la Orden de Cambio: no afecta el techo de gasto, solo
 * datos descriptivos/de calculadora).
 */
export async function actualizarDetalleWbs(id, detalle) {
  const cambios = {};
  if (detalle?.unidad !== undefined) cambios.unidad = detalle.unidad || null;
  if (detalle?.cantidad !== undefined) cambios.cantidad = detalle.cantidad;
  if (detalle?.precio_unitario !== undefined) cambios.precio_unitario = detalle.precio_unitario;
  if (Object.keys(cambios).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("wbs_catalog").update(cambios).eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar: ${error.message}` };
  }

  revalidatePath("/wbs");
  return { ok: true };
}

/** Lista las Órdenes de Cambio de presupuesto WBS pendientes de autorización. */
export async function getOrdenesCambioPendientes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wbs_ordenes_cambio")
    .select(
      "id, presupuesto_anterior, presupuesto_nuevo, unidad_nueva, cantidad_nueva, precio_unitario_nuevo, comentario, created_at, solicitado_por, wbs_catalog(codigo, categoria, partida, proyecto_id, proyectos(codigo, nombre)), solicitante:perfiles_usuario!wbs_ordenes_cambio_solicitado_por_fkey(nombre)"
    )
    .eq("estado", "Por Autorizar")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al consultar órdenes de cambio pendientes:", error.message);
    return [];
  }

  return data;
}

/**
 * Autoriza o rechaza una Orden de Cambio pendiente. Delegado por completo en
 * la RPC `autorizar_orden_cambio_wbs`: ella valida el estado de origen y que
 * quien autoriza no sea quien propuso el cambio, y aplica el nuevo
 * presupuesto a `wbs_catalog` + el registro en `wbs_historial_cambios` en la
 * misma transacción cuando el resultado es "Autorizado".
 */
export async function autorizarOrdenCambioWbs(id, nuevoEstado) {
  if (!["Autorizado", "Rechazado"].includes(nuevoEstado)) {
    return { error: "Estado no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("autorizar_orden_cambio_wbs", {
    p_orden_id: id,
    p_nuevo_estado: nuevoEstado,
  });

  if (error) {
    return { error: `No se pudo resolver la orden de cambio: ${error.message}` };
  }

  revalidatePath("/wbs");
  revalidatePath("/wbs/ordenes-cambio");
  return { ok: true };
}

/**
 * Actualiza el % de IVA informativo de una partida. A diferencia del
 * presupuesto, no es un techo de gasto ni una Orden de Cambio: solo alimenta
 * las columnas de IVA/total con IVA que ve administración/operaciones, así
 * que no exige comentario ni deja rastro en wbs_historial_cambios.
 */
export async function actualizarIvaWbs(id, nuevoPorcentaje) {
  const porcentaje = Number(nuevoPorcentaje);
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return { error: "Captura un porcentaje de IVA válido (0-100)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("wbs_catalog").update({ porcentaje_iva: porcentaje }).eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el IVA: ${error.message}` };
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
 * { categoria, partida, presupuesto, unidad?, cantidad?, precio_unitario?,
 * porcentaje_iva? } ya parseado en el cliente (mismo detalle que ya trae el
 * Excel original de presupuesto: Codigo/Partida/UD/Cantidad/Unitario/IVA%).
 */
export async function previsualizarImportWbs(proyectoId, filas) {
  const supabase = await createClient();

  const { data: existentes, error } = await supabase
    .from("wbs_catalog")
    .select("id, categoria, partida, presupuesto, unidad, cantidad, precio_unitario, porcentaje_iva, activo")
    .eq("proyecto_id", proyectoId);

  if (error) {
    return { error: `No se pudo leer el catálogo actual: ${error.message}` };
  }

  const clave = (c, p) => `${c.trim().toLowerCase()}|${p.trim().toLowerCase()}`;
  const mapaExistente = new Map(existentes.map((w) => [clave(w.categoria, w.partida), w]));
  const clavesImportadas = new Set();

  const nuevas = [];
  const actualizadas = [];

  const numeroONulo = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  for (const fila of filas) {
    const categoria = String(fila.categoria ?? "").trim();
    const partida = String(fila.partida ?? "").trim();
    const presupuesto = Number(fila.presupuesto);
    if (!categoria || !partida || !Number.isFinite(presupuesto)) continue;

    const unidad = fila.unidad ? String(fila.unidad).trim() : null;
    const cantidad = numeroONulo(fila.cantidad);
    const precio_unitario = numeroONulo(fila.precio_unitario);
    const porcentaje_iva = fila.porcentaje_iva === "" || fila.porcentaje_iva == null ? 0 : Number(fila.porcentaje_iva);

    const k = clave(categoria, partida);
    clavesImportadas.add(k);
    const existente = mapaExistente.get(k);
    const detalle = { unidad, cantidad, precio_unitario, porcentaje_iva };

    if (!existente) {
      nuevas.push({ categoria, partida, presupuesto, ...detalle });
    } else {
      const cambioDetalle =
        (existente.unidad ?? null) !== unidad ||
        Number(existente.cantidad ?? 0) !== Number(cantidad ?? 0) ||
        Number(existente.precio_unitario ?? 0) !== Number(precio_unitario ?? 0) ||
        Number(existente.porcentaje_iva ?? 0) !== porcentaje_iva;

      if (Number(existente.presupuesto) !== presupuesto || cambioDetalle) {
        actualizadas.push({
          id: existente.id,
          categoria,
          partida,
          presupuestoAnterior: existente.presupuesto,
          presupuestoNuevo: presupuesto,
          ...detalle,
        });
      }
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
        unidad: n.unidad ?? null,
        cantidad: n.cantidad ?? null,
        precio_unitario: n.precio_unitario ?? null,
        porcentaje_iva: n.porcentaje_iva ?? 0,
      }))
    );
    if (error) return { error: `No se pudieron insertar las partidas nuevas: ${error.message}` };
  }

  for (const a of actualizadas ?? []) {
    const { error } = await supabase
      .from("wbs_catalog")
      .update({
        presupuesto: a.presupuestoNuevo,
        unidad: a.unidad ?? null,
        cantidad: a.cantidad ?? null,
        precio_unitario: a.precio_unitario ?? null,
        porcentaje_iva: a.porcentaje_iva ?? 0,
      })
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
