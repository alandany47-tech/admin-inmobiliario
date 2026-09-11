"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/app/actions/auth";

/** Solicitudes corporativas pagadas que aún no se han repartido entre partidas WBS. */
export async function getSolicitudesPendientesReparto() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "id, folio, fecha_pago, total, proyecto_id, proyectos(codigo, nombre), proveedores(razon_social)"
    )
    .eq("es_corporativo", true)
    .eq("reparto_estado", "pendiente_reparto")
    .order("fecha_pago", { ascending: true });

  if (error) {
    console.error("Error al consultar solicitudes pendientes de reparto:", error.message);
    return [];
  }

  return data;
}

/** Detalle del reparto ya confirmado de una solicitud (para mostrarlo en historial/PDF). */
export async function getRepartoDeSolicitud(solicitudId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitud_reparto_corporativo")
    .select("id, wbs_id, monto, porcentaje, created_at, wbs_catalog(codigo, categoria, partida, proyecto_id, proyectos(codigo, nombre))")
    .eq("solicitud_id", solicitudId)
    .order("monto", { ascending: false });

  if (error) {
    console.error("Error al consultar el reparto de la solicitud:", error.message);
    return [];
  }

  return data;
}

/** Confirma el reparto de una solicitud corporativa entre 2-4 partidas WBS destino (solo TESORERIA/ADMIN). */
export async function confirmarRepartoCorporativo(solicitudId, wbsIds) {
  const perfil = await getPerfilActual();
  if (!perfil || !["TESORERIA", "ADMIN"].includes(perfil.rol)) {
    return { error: "No autorizado." };
  }

  if (!Array.isArray(wbsIds) || wbsIds.length < 2 || wbsIds.length > 4) {
    return { error: "Selecciona entre 2 y 4 partidas WBS destino." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_reparto_corporativo", {
    p_solicitud_id: solicitudId,
    p_wbs_ids: wbsIds,
  });

  if (error) {
    return { error: `No se pudo confirmar el reparto: ${error.message}` };
  }

  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  revalidatePath("/wbs");
  revalidatePath("/dashboard");
  return { ok: true };
}
