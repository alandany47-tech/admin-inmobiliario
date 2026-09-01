"use server";

import { createClient } from "@/lib/supabase/server";

const ESQUEMAS_VALIDOS = ["TRADICIONAL", "INVERSIONISTA"];
const TIPOS_VALIDOS = ["UNIDAD", "LIBRE"];

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
