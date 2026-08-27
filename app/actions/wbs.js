"use server";

import { createClient } from "@/lib/supabase/server";

/** Lista el catálogo WBS (entradas generales y específicas por proyecto). */
export async function getWbsCatalog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wbs_catalog")
    .select("id, proyecto_id, categoria, partida")
    .order("categoria", { ascending: true })
    .order("partida", { ascending: true });

  if (error) {
    console.error("Error al consultar el catálogo WBS:", error.message);
    return [];
  }

  return data;
}
