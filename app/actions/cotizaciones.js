"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ESQUEMAS_VALIDOS = ["TRADICIONAL", "INVERSIONISTA"];
const TIPOS_VALIDOS = ["UNIDAD", "LIBRE"];
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
 * Sube la foto/render de una cotización libre al bucket "cotizaciones-libres"
 * (ruta {timestamp}-archivo: no hay unidad/proyecto todavía que la posea) y
 * regresa la URL pública. No hay fila de cotización que actualizar aquí: el
 * Cotizador sube la imagen en cuanto el usuario la selecciona y guarda la URL
 * en el payload de `crearCotizacion`.
 */
export async function subirImagenCotizacionLibre(formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (!TIPOS_IMAGEN_VALIDOS.includes(archivo.type)) {
    return { error: "La imagen debe ser PNG, JPG o WEBP." };
  }

  const supabase = await createClient();
  const ruta = `${Date.now()}.${extensionSegura(archivo.name)}`;

  const { error: errorSubida } = await supabase.storage
    .from("cotizaciones-libres")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

  if (errorSubida) {
    return { error: `No se pudo subir la imagen: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("cotizaciones-libres").getPublicUrl(ruta);

  return { ok: true, url: publicUrl };
}

/** Historial de cotizaciones generadas, más reciente primero. `proyectoId` (opcional) filtra por proyecto. */
export async function getCotizaciones(proyectoId) {
  const supabase = await createClient();
  let query = supabase
    .from("cotizaciones")
    .select("*, proyectos(codigo, nombre), unidades(codigo_unidad)")
    .order("created_at", { ascending: false });

  if (proyectoId) query = query.eq("proyecto_id", proyectoId);

  const { data, error } = await query;
  if (error) {
    console.error("Error al consultar cotizaciones:", error.message);
    return [];
  }

  return data;
}

/** Guarda el snapshot del simulador y regresa el registro con su folio (COT-<8 primeros del id>). */
export async function crearCotizacion(payload) {
  const {
    proyectoId,
    unidadId,
    clienteNombre,
    clienteEmail,
    clienteTelefono,
    tipoCotizacion,
    descripcionLibre,
    montoTotal,
    esquema,
    montoSeparacion,
    porcentajeEnganche,
    montoEnganche,
    plazoMeses,
    montoMensualidad,
    saldoEntrega,
    imagenUrl,
  } = payload;

  if (!clienteNombre?.trim()) {
    return { error: "Captura el nombre del cliente para la cotización." };
  }
  if (!(Number(montoTotal) > 0)) {
    return { error: "Captura el monto total a cotizar." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cotizaciones")
    .insert({
      proyecto_id: proyectoId || null,
      unidad_id: unidadId || null,
      cliente_nombre: clienteNombre.trim(),
      cliente_email: clienteEmail?.trim() || null,
      cliente_telefono: clienteTelefono?.trim() || null,
      tipo_cotizacion: TIPOS_VALIDOS.includes(tipoCotizacion) ? tipoCotizacion : "UNIDAD",
      descripcion_libre: descripcionLibre?.trim() || null,
      monto_total: Number(montoTotal),
      esquema: ESQUEMAS_VALIDOS.includes(esquema) ? esquema : "TRADICIONAL",
      monto_separacion: Number(montoSeparacion) || 0,
      porcentaje_enganche: Number(porcentajeEnganche) || 0,
      monto_enganche: Number(montoEnganche) || 0,
      plazo_meses: Number(plazoMeses) || 0,
      monto_mensualidad: Number(montoMensualidad) || 0,
      saldo_entrega: Number(saldoEntrega) || 0,
      imagen_url: imagenUrl || null,
    })
    .select()
    .single();

  if (error) {
    return { error: `No se pudo guardar la cotización: ${error.message}` };
  }

  const folio = `COT-${data.id.slice(0, 8).toUpperCase()}`;
  await supabase.from("cotizaciones").update({ folio }).eq("id", data.id);

  return { ok: true, cotizacion: { ...data, folio } };
}

/** Elimina una cotización del historial (solo el snapshot guardado; no afecta unidades ni contratos). */
export async function eliminarCotizacion(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("cotizaciones").delete().eq("id", id);

  if (error) {
    return { error: `No se pudo eliminar la cotización: ${error.message}` };
  }

  revalidatePath("/cotizaciones");
  return { ok: true };
}
