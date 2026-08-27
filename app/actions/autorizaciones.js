"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ESTADOS_VALIDOS = ["Autorizado", "Pospuesto", "Cancelado"];

/** Lista las solicitudes de pago pendientes de autorización con proyecto y proveedor. */
export async function getSolicitudesPorAutorizar() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, created_at, metodo_pago, total, solicitante, proyectos(codigo, nombre), proveedores(razon_social)"
    )
    .eq("estado", "Por Autorizar")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al consultar solicitudes por autorizar:", error.message);
    return [];
  }

  return data;
}

/** Actualiza el estado de autorización de una solicitud de pago. */
export async function cambiarEstadoSolicitud(solicitudId, nuevoEstado) {
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return { error: "Estado no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("solicitudes_pago")
    .update({ estado: nuevoEstado })
    .eq("id", solicitudId);

  if (error) {
    return { error: `No se pudo actualizar el estado: ${error.message}` };
  }

  revalidatePath("/autorizaciones");
  return { ok: true };
}
