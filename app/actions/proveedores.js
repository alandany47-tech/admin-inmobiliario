"use server";

import { createClient } from "@/lib/supabase/server";

/** Lista los proveedores existentes para el selector del formulario. */
export async function getProveedores() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .order("razon_social", { ascending: true });

  if (error) {
    console.error("Error al consultar proveedores:", error.message);
    return [];
  }

  return data;
}
