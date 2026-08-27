"use server";

import { createClient } from "@/lib/supabase/server";

/** Lista las solicitudes de pago cerradas (Pagado/Cancelado) para el historial general. */
export async function getHistorialSolicitudes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, created_at, metodo_pago, solicitante, subtotal, iva, total, estado, fecha_programada, fecha_pago, proyectos(id, codigo, nombre), proveedores(razon_social)"
    )
    .in("estado", ["Pagado", "Cancelado"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al consultar el historial de solicitudes:", error.message);
    return [];
  }

  return data;
}
