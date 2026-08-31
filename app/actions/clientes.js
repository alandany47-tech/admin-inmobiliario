"use server";

import { createClient } from "@/lib/supabase/server";

/** Lista todos los clientes, para el combobox buscable de Unidades/Cobranza. */
export async function getClientes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al consultar clientes:", error.message);
    return [];
  }

  return data;
}

/**
 * Reutiliza un cliente existente por id, o crea uno nuevo. Mismo patrón que
 * el alta inline de proveedor en crearSolicitudPago.
 */
export async function buscarOCrearCliente(payload) {
  const { id, nombre, rfc, telefono, email } = payload;
  const supabase = await createClient();

  if (id) return { id };

  if (!nombre?.trim()) {
    return { error: "Captura el nombre del cliente." };
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre: nombre.trim(),
      rfc: rfc?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { error: `No se pudo registrar el cliente: ${error.message}` };
  }

  return { id: data.id, cliente: data };
}
