"use server";

import { createClient } from "@/lib/supabase/server";

/** Datos crudos de solicitudes para el cálculo de KPIs ejecutivos. */
export async function getSolicitudesDashboard() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select("id, total, estado, metodo_pago, wbs_categoria, fecha_pago, proyectos(codigo, nombre)");

  if (error) {
    console.error("Error al consultar datos del dashboard:", error.message);
    return [];
  }

  return data;
}
