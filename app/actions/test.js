"use server";

import { createClient } from "@/lib/supabase/server";

/** Consulta todos los proyectos existentes para verificar la conexión con Supabase. */
export async function getProyectos() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("proyectos").select("*");

  if (error) {
    console.error("Error al consultar proyectos:", error.message);
    return [];
  }

  return data;
}
