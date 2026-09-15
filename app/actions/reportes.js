"use server";

import { createClient } from "@/lib/supabase/server";

/** Lista las solicitudes de pago cerradas (Pagado/Cancelado) para el historial general. */
export async function getHistorialSolicitudes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, created_at, metodo_pago, solicitante, subtotal, iva, total, estado, fecha_programada, fecha_pago, comprobante_url, comprobante_r2_key, xml_factura, num_factura, proyectos(id, codigo, nombre), proveedores(razon_social)"
    )
    .in("estado", ["Pagado", "Cancelado"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al consultar el historial de solicitudes:", error.message);
    return [];
  }

  return data;
}

/**
 * Lista TODAS las solicitudes de pago del usuario autenticado (cualquier
 * estado, no solo Pagado/Cancelado) para su panel personal "Mis Solicitudes".
 * El filtro por `usuario_id` es explícito y no solo delegado a RLS: si quien
 * consulta además tiene acceso de lectura al módulo SOLICITUDES, la policy
 * de la tabla dejaría pasar TODAS las filas — este filtro es lo que
 * garantiza que "Mis Solicitudes" muestre únicamente lo propio.
 */
export async function getMisSolicitudes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, created_at, metodo_pago, solicitante, subtotal, iva, total, estado, fecha_programada, fecha_pago, comprobante_url, comprobante_r2_key, xml_factura, num_factura, proyectos(id, codigo, nombre), proveedores(razon_social)"
    )
    .eq("usuario_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al consultar mis solicitudes:", error.message);
    return [];
  }

  return data;
}
