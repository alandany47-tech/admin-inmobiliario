"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TIPOS_USO_VALIDOS = ["DEPARTAMENTO", "OFICINA", "LOCAL", "BODEGA", "OTRO"];
const ESTATUS_VALIDOS = ["SIN ASIGNAR", "APARTADA", "VENDIDA"];
const ESQUEMAS_VALIDOS = ["TRADICIONAL", "INVERSIONISTA"];

/**
 * Lista las unidades de un proyecto, con el contrato de venta 'Activo' (si
 * existe) para poder mostrar el countdown de separación y el estatus de
 * firma directamente en la tarjeta, sin queries adicionales por unidad.
 */
export async function getUnidades(proyectoId) {
  if (!proyectoId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select(
      "*, contratos_venta(id, fecha_limite_apartado, contrato_firmado, esquema_venta, monto_enganche_pactado, monto_enganche_pagado, estatus)"
    )
    .eq("proyecto_id", proyectoId)
    .order("codigo_unidad", { ascending: true });

  if (error) {
    console.error("Error al consultar unidades:", error.message);
    return [];
  }

  return data.map((u) => ({
    ...u,
    contrato_activo: (u.contratos_venta ?? []).find((c) => c.estatus === "Activo") ?? null,
  }));
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
  const { proyectoId, codigoUnidad, superficieM2, tipoUso, montoLista, precioM2, esquemaUnidad } = payload;

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
      esquema_unidad: ESQUEMAS_VALIDOS.includes(esquemaUnidad) ? esquemaUnidad : "TRADICIONAL",
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
  const { codigoUnidad, superficieM2, tipoUso, montoLista, precioM2, esquemaUnidad } = payload;

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
      esquema_unidad: ESQUEMAS_VALIDOS.includes(esquemaUnidad) ? esquemaUnidad : "TRADICIONAL",
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
    const esquemaUnidad = ESQUEMAS_VALIDOS.includes(String(fila.esquema ?? "").toUpperCase())
      ? String(fila.esquema).toUpperCase()
      : "TRADICIONAL";

    registros.push({
      proyecto_id: proyectoId,
      codigo_unidad: codigoUnidad,
      tipo_uso: tipoUso,
      superficie_m2: superficieM2,
      precio_m2: precioM2,
      monto_lista: montoLista,
      estatus,
      esquema_unidad: esquemaUnidad,
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

/**
 * Sube la foto/render de una unidad al bucket "renders-unidades" (ruta
 * {proyecto_id}/{unidad_id}/..., persiste con el inventario) y guarda su URL
 * pública. Esa imagen la reutiliza el Cotizador cuando se cotiza esa unidad
 * (ver `descargarCotizacionPdf`/`Cotizador.js`).
 */
export async function subirImagenUnidad(unidadId, proyectoId, formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (!TIPOS_IMAGEN_VALIDOS.includes(archivo.type)) {
    return { error: "La imagen debe ser PNG, JPG o WEBP." };
  }

  const supabase = await createClient();
  const ruta = `${proyectoId}/${unidadId}/${Date.now()}.${extensionSegura(archivo.name)}`;

  const { error: errorSubida } = await supabase.storage
    .from("renders-unidades")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

  if (errorSubida) {
    return { error: `No se pudo subir la imagen: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("renders-unidades").getPublicUrl(ruta);

  const { error: errorUpdate } = await supabase
    .from("unidades")
    .update({ imagen_url: publicUrl })
    .eq("id", unidadId);

  if (errorUpdate) {
    return { error: `No se pudo guardar la referencia de la imagen: ${errorUpdate.message}` };
  }

  revalidatePath("/unidades");
  return { ok: true, url: publicUrl };
}

/**
 * Libera una unidad 'APARTADA' cuyos 30 días de separación ya vencieron sin
 * liquidar el enganche ni firmar contrato: cancela el contrato de venta
 * asociado (no lo borra, queda como historial) y regresa la unidad a
 * 'SIN ASIGNAR'.
 */
export async function liberarUnidadVencida(unidadId) {
  const supabase = await createClient();

  const { data: unidad, error: errorUnidad } = await supabase
    .from("unidades")
    .select("id, estatus")
    .eq("id", unidadId)
    .single();

  if (errorUnidad || !unidad) {
    return { error: "No se encontró la unidad." };
  }
  if (unidad.estatus !== "APARTADA") {
    return { error: "Solo se pueden liberar unidades en estatus 'APARTADA'." };
  }

  const { data: contrato, error: errorContrato } = await supabase
    .from("contratos_venta")
    .select("id, contrato_firmado, fecha_limite_apartado")
    .eq("unidad_id", unidadId)
    .eq("estatus", "Activo")
    .maybeSingle();

  if (errorContrato) {
    return { error: `No se pudo validar el contrato: ${errorContrato.message}` };
  }
  if (!contrato) {
    return { error: "Esta unidad no tiene un contrato de separación activo." };
  }
  if (contrato.contrato_firmado) {
    return { error: "No se puede liberar: el contrato ya está firmado." };
  }
  if (new Date(contrato.fecha_limite_apartado) > new Date()) {
    return { error: "Todavía no vencen los 30 días de separación." };
  }

  const { error: errorCancelar } = await supabase
    .from("contratos_venta")
    .update({ estatus: "Cancelado" })
    .eq("id", contrato.id);
  if (errorCancelar) {
    return { error: `No se pudo cancelar el contrato: ${errorCancelar.message}` };
  }

  const { error: errorLiberar } = await supabase
    .from("unidades")
    .update({ estatus: "SIN ASIGNAR" })
    .eq("id", unidadId);
  if (errorLiberar) {
    return { error: `No se pudo liberar la unidad: ${errorLiberar.message}` };
  }

  revalidatePath("/unidades");
  revalidatePath("/cobranza/clientes");
  revalidatePath("/cobranza/pagos");
  return { ok: true };
}
