"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ESTADOS_VALIDOS = ["Por Autorizar", "Autorizado", "Pospuesto", "Pagado", "Cancelado"];
const ESTADOS_ACTIVOS = ["Por Autorizar", "Autorizado", "Pospuesto"];

/**
 * Lista las solicitudes de pago activas (no 'Pagado' ni 'Cancelado') para el
 * panel de control maestro. Esos dos estados son finales y viven en /historial.
 */
export async function getSolicitudesControlMaestro() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, created_at, metodo_pago, solicitante, subtotal, iva, total, estado, fecha_programada, fecha_pago, comprobante_url, proyectos(id, codigo, nombre), proveedores(id, razon_social)"
    )
    .in("estado", ESTADOS_ACTIVOS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al consultar solicitudes del control maestro:", error.message);
    return [];
  }

  return data;
}

/**
 * Cambia el estado de una solicitud. Si el nuevo estado es 'Pagado', delega
 * en la función atómica de tesorería para dispersar el pago y debitar la
 * cuenta correspondiente al método de pago. Si la solicitud estaba 'Pagado'
 * y se mueve a otro estado, delega en la función atómica de reversión para
 * restaurar el saldo y compensar el movimiento en la bitácora.
 */
export async function cambiarEstadoGeneral(solicitudId, nuevoEstado) {
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return { error: "Estado no válido." };
  }

  const supabase = await createClient();

  const { data: solicitudActual, error: errorConsulta } = await supabase
    .from("solicitudes_pago")
    .select("estado")
    .eq("id", solicitudId)
    .single();

  if (errorConsulta) {
    return { error: `No se pudo consultar la solicitud: ${errorConsulta.message}` };
  }

  if (nuevoEstado === "Pagado") {
    const { error } = await supabase.rpc("procesar_pago_solicitud", {
      p_solicitud_id: solicitudId,
      p_fecha_pago: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      return { error: `No se pudo procesar el pago: ${error.message}` };
    }
  } else if (solicitudActual.estado === "Pagado") {
    const { error } = await supabase.rpc("revertir_pago_solicitud", {
      p_solicitud_id: solicitudId,
      p_nuevo_estado: nuevoEstado,
    });

    if (error) {
      return { error: `No se pudo revertir el pago: ${error.message}` };
    }
  } else {
    const { error } = await supabase
      .from("solicitudes_pago")
      .update({ estado: nuevoEstado })
      .eq("id", solicitudId);

    if (error) {
      return { error: `No se pudo actualizar el estado: ${error.message}` };
    }
  }

  revalidatePath("/control-maestro");
  revalidatePath("/autorizaciones");
  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Sube el comprobante de pago al bucket "comprobantes" y guarda su URL pública. */
export async function subirComprobante(solicitudId, formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }

  const supabase = await createClient();
  const ruta = `${solicitudId}/${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage
    .from("comprobantes")
    .upload(ruta, archivo, { upsert: true });

  if (errorSubida) {
    return { error: `No se pudo subir el comprobante: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("comprobantes").getPublicUrl(ruta);

  const { error: errorUpdate } = await supabase
    .from("solicitudes_pago")
    .update({ comprobante_url: publicUrl })
    .eq("id", solicitudId);

  if (errorUpdate) {
    return { error: `No se pudo guardar la referencia del comprobante: ${errorUpdate.message}` };
  }

  revalidatePath("/control-maestro");
  return { ok: true, url: publicUrl };
}
