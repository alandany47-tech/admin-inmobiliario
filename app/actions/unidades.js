"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TIPOS_USO_VALIDOS = ["DEPARTAMENTO", "OFICINA", "LOCAL", "BODEGA", "OTRO"];
const ESTATUS_VALIDOS = ["SIN ASIGNAR", "APARTADA", "VENDIDA"];

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

/** Unidades 'SIN ASIGNAR' de un proyecto, para el flujo de asignación directa desde Cartera de Clientes. */
export async function getUnidadesDisponibles(proyectoId) {
  if (!proyectoId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .eq("estatus", "SIN ASIGNAR")
    .order("codigo_unidad", { ascending: true });

  if (error) {
    console.error("Error al consultar unidades disponibles:", error.message);
    return [];
  }

  return data;
}

/** Crea una unidad de inventario para un proyecto. */
export async function crearUnidad(payload) {
  const { proyectoId, codigoUnidad, superficieM2, tipoUso, montoLista, precioM2 } = payload;

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
      tipo_uso: TIPOS_USO_VALIDOS.includes(tipoUso) ? tipoUso : "DEPARTAMENTO",
      monto_lista: Number(montoLista) || 0,
      precio_m2: Number(precioM2) || 0,
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

/** Actualiza specs de una unidad (código, superficie, tipo de uso, precio/m² y monto de lista). */
export async function actualizarUnidad(id, payload) {
  const { codigoUnidad, superficieM2, tipoUso, montoLista, precioM2 } = payload;

  if (!codigoUnidad?.trim()) {
    return { error: "Captura el código de unidad." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update({
      codigo_unidad: codigoUnidad.trim(),
      superficie_m2: Number(superficieM2) || 0,
      tipo_uso: TIPOS_USO_VALIDOS.includes(tipoUso) ? tipoUso : "DEPARTAMENTO",
      monto_lista: Number(montoLista) || 0,
      precio_m2: Number(precioM2) || 0,
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
 * Cambia el estatus de una unidad. Pasar a 'SIN ASIGNAR' está bloqueado si la
 * unidad tiene un contrato de venta 'Activo' (hay que cancelar/finiquitar el
 * contrato primero, no se libera inventario con una venta vigente detrás).
 */
export async function cambiarEstatusUnidad(id, estatus) {
  if (!ESTATUS_VALIDOS.includes(estatus)) {
    return { error: "Estatus no válido." };
  }

  const supabase = await createClient();

  if (estatus === "SIN ASIGNAR") {
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

/**
 * Importación masiva de unidades desde Excel/CSV: hace upsert por
 * (proyecto_id, codigo_unidad). `filas` ya viene parseado y normalizado en
 * el cliente: { codigoUnidad, tipoUso, superficieM2, precioM2, montoLista,
 * estatus }. Si `montoLista` no viene en el archivo, se calcula como
 * superficieM2 * precioM2, igual que en el formulario manual.
 */
export async function importarUnidadesMasivo(proyectoId, filas) {
  if (!proyectoId) {
    return { error: "Selecciona un proyecto." };
  }
  if (!Array.isArray(filas) || filas.length === 0) {
    return { error: "El archivo no tiene filas para importar." };
  }

  const invalidas = [];
  const registros = [];
  const codigosVistos = new Set();

  filas.forEach((fila, i) => {
    const codigoUnidad = String(fila.codigoUnidad ?? "").trim();
    if (!codigoUnidad) {
      invalidas.push({ fila: i + 1, motivo: "Falta código de unidad" });
      return;
    }
    const codigoNormalizado = codigoUnidad.toUpperCase();
    if (codigosVistos.has(codigoNormalizado)) {
      invalidas.push({ fila: i + 1, motivo: `Código "${codigoUnidad}" repetido en el archivo` });
      return;
    }
    codigosVistos.add(codigoNormalizado);

    const superficieM2 = Number(fila.superficieM2) || 0;
    const precioM2 = Number(fila.precioM2) || 0;
    const montoLista = Number(fila.montoLista) || Math.round(superficieM2 * precioM2 * 100) / 100;
    const tipoUso = TIPOS_USO_VALIDOS.includes(String(fila.tipoUso ?? "").toUpperCase())
      ? String(fila.tipoUso).toUpperCase()
      : "DEPARTAMENTO";
    const estatus = ESTATUS_VALIDOS.includes(String(fila.estatus ?? "").toUpperCase())
      ? String(fila.estatus).toUpperCase()
      : "SIN ASIGNAR";

    registros.push({
      proyecto_id: proyectoId,
      codigo_unidad: codigoUnidad,
      tipo_uso: tipoUso,
      superficie_m2: superficieM2,
      precio_m2: precioM2,
      monto_lista: montoLista,
      estatus,
    });
  });

  if (registros.length === 0) {
    return { error: "Ninguna fila es válida para importar.", invalidas };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .upsert(registros, { onConflict: "proyecto_id,codigo_unidad" })
    .select();

  if (error) {
    return { error: `No se pudo importar el archivo: ${error.message}` };
  }

  revalidatePath("/unidades");
  return { ok: true, importadas: data.length, invalidas };
}
