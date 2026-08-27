"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Lista las cuentas bancarias con su saldo actual. */
export async function getCuentasBancarias() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al consultar cuentas bancarias:", error.message);
    return [];
  }

  return data;
}

/** Lista las solicitudes autorizadas listas para dispersión de pago. */
export async function getSolicitudesAutorizadas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, created_at, metodo_pago, total, solicitante, proyectos(codigo, nombre), proveedores(razon_social)"
    )
    .eq("estado", "Autorizado")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al consultar solicitudes autorizadas:", error.message);
    return [];
  }

  return data;
}

/**
 * Dispersa el pago de una solicitud autorizada: la cuenta a debitar se
 * determina por el método de pago dentro de la función de Postgres, que
 * descuenta el saldo y marca la solicitud como pagada de forma atómica.
 */
export async function procesarPagoSolicitud(solicitudId, fechaPago) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("procesar_pago_solicitud", {
    p_solicitud_id: solicitudId,
    p_fecha_pago: fechaPago,
  });

  if (error) {
    return { error: `No se pudo procesar el pago: ${error.message}` };
  }

  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  return { ok: true };
}
