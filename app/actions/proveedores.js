"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ESTATUS_VALIDOS = ["Activo", "Inactivo"];
const ESTADOS_ACTIVOS = ["Por Autorizar", "Autorizado", "Pospuesto"];

/** Lista los proveedores existentes (activos e inactivos) para el directorio y los selectores. */
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

/** Actualiza la razón social, RFC y datos bancarios de un proveedor existente. */
export async function actualizarProveedor(proveedorId, datos) {
  const { razonSocial, rfc, datosBancarios } = datos;

  if (!razonSocial?.trim()) {
    return { error: "Captura la razón social." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("proveedores")
    .update({
      razon_social: razonSocial.trim(),
      rfc: rfc?.trim() || null,
      datos_bancarios: datosBancarios,
    })
    .eq("id", proveedorId);

  if (error) {
    return { error: `No se pudo actualizar el proveedor: ${error.message}` };
  }

  revalidatePath("/proveedores");
  revalidatePath("/control-maestro");
  revalidatePath("/solicitud");
  return { ok: true };
}

/** Activa o desactiva un proveedor; los inactivos se excluyen del alta de nuevas solicitudes. */
export async function cambiarEstatusProveedor(proveedorId, nuevoEstatus) {
  if (!ESTATUS_VALIDOS.includes(nuevoEstatus)) {
    return { error: "Estatus no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("proveedores")
    .update({ estatus: nuevoEstatus })
    .eq("id", proveedorId);

  if (error) {
    return { error: `No se pudo actualizar el estatus: ${error.message}` };
  }

  revalidatePath("/proveedores");
  revalidatePath("/control-maestro");
  revalidatePath("/solicitud");
  return { ok: true };
}

/**
 * Elimina un proveedor solo si no tiene solicitudes activas (en flujo de
 * autorización/pago) ni solicitudes creadas en el mes en curso.
 */
export async function eliminarProveedor(proveedorId) {
  const supabase = await createClient();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesISO = inicioMes.toISOString().slice(0, 10);

  const { data: activas, error: errorActivas } = await supabase
    .from("solicitudes_pago")
    .select("id")
    .eq("proveedor_id", proveedorId)
    .in("estado", ESTADOS_ACTIVOS)
    .limit(1);

  if (errorActivas) {
    return { error: `No se pudo validar el proveedor: ${errorActivas.message}` };
  }

  const { data: delMes, error: errorMes } = await supabase
    .from("solicitudes_pago")
    .select("id")
    .eq("proveedor_id", proveedorId)
    .gte("created_at", inicioMesISO)
    .limit(1);

  if (errorMes) {
    return { error: `No se pudo validar el proveedor: ${errorMes.message}` };
  }

  if ((activas?.length ?? 0) > 0 || (delMes?.length ?? 0) > 0) {
    return { error: "El proveedor tiene movimientos registrados este mes" };
  }

  const { error } = await supabase.from("proveedores").delete().eq("id", proveedorId);

  if (error) {
    return { error: `No se pudo eliminar el proveedor: ${error.message}` };
  }

  revalidatePath("/proveedores");
  revalidatePath("/control-maestro");
  revalidatePath("/solicitud");
  return { ok: true };
}
