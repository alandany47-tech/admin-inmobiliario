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

/** Lista los movimientos de tesorería (ingresos y egresos) de todas las cuentas. */
export async function getMovimientosTesoreria() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("movimientos_tesoreria")
    .select("*, proyectos(codigo, nombre), solicitudes_pago(estado, num_factura)")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al consultar movimientos de tesorería:", error.message);
    return [];
  }

  return data;
}

/**
 * Ajusta el saldo inicial de una cuenta; la función de Postgres traslada el
 * mismo delta al saldo actual para no perder el efecto de movimientos previos.
 */
export async function actualizarSaldoInicial(cuentaId, saldoInicial) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("actualizar_saldo_inicial_cuenta", {
    p_cuenta_id: cuentaId,
    p_saldo_inicial: saldoInicial,
  });

  if (error) {
    return { error: `No se pudo actualizar el saldo inicial: ${error.message}` };
  }

  revalidatePath("/tesoreria");
  return { ok: true, cuenta: data };
}

/**
 * Registra un movimiento manual de tesorería (ingreso o egreso); la función
 * de Postgres actualiza el saldo de la cuenta y calcula el saldo resultante
 * de forma atómica.
 */
export async function registrarMovimiento(payload) {
  const { cuentaId, proyectoId, tipoMovimiento, fecha, razonSocial, concepto, monto, comentarios } =
    payload;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_movimiento_tesoreria", {
    p_cuenta_id: cuentaId,
    p_proyecto_id: proyectoId || null,
    p_tipo_movimiento: tipoMovimiento,
    p_fecha: fecha,
    p_razon_social: razonSocial || null,
    p_concepto: concepto,
    p_monto: monto,
    p_comentarios: comentarios || null,
  });

  if (error) {
    return { error: `No se pudo registrar el movimiento: ${error.message}` };
  }

  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  revalidatePath("/dashboard");
  return { ok: true, movimiento: data };
}

/**
 * Edita el monto de un movimiento de tesorería ya registrado; la función de
 * Postgres traslada el delta al saldo de la cuenta y, si el movimiento viene
 * de una solicitud, sincroniza su total para no desfasar el ejercido del WBS.
 */
export async function editarMovimiento(movimientoId, nuevoMonto) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("editar_movimiento_tesoreria", {
    p_movimiento_id: movimientoId,
    p_nuevo_monto: nuevoMonto,
  });

  if (error) {
    return { error: `No se pudo editar el movimiento: ${error.message}` };
  }

  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  revalidatePath("/dashboard");
  revalidatePath("/wbs");
  revalidatePath("/control-maestro");
  return { ok: true, movimiento: data };
}

/**
 * Elimina un movimiento de tesorería; la función de Postgres devuelve el
 * monto a la cuenta y, si estaba ligado a una solicitud 'Pagado', la regresa
 * a 'Autorizado' para que no quede marcada como pagada sin respaldo en la bitácora.
 */
export async function eliminarMovimiento(movimientoId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("eliminar_movimiento_tesoreria", {
    p_movimiento_id: movimientoId,
  });

  if (error) {
    return { error: `No se pudo eliminar el movimiento: ${error.message}` };
  }

  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  revalidatePath("/dashboard");
  revalidatePath("/wbs");
  revalidatePath("/control-maestro");
  revalidatePath("/autorizaciones");
  return { ok: true, saldoActual: data };
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

/**
 * Revierte el pago de una solicitud desde la bitácora de Tesorería: llama a
 * la función atómica de reversión (por defecto regresa a 'Por Autorizar', ver
 * 0013_revertir_a_por_autorizar.sql) y devuelve las cuentas y movimientos
 * frescos para refrescar el estado local sin depender de un patch incremental.
 */
export async function revertirPagoSolicitud(solicitudId) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revertir_pago_solicitud", {
    p_solicitud_id: solicitudId,
  });

  if (error) {
    return { error: `No se pudo revertir el pago: ${error.message}` };
  }

  const [cuentas, movimientos] = await Promise.all([getCuentasBancarias(), getMovimientosTesoreria()]);

  revalidatePath("/tesoreria");
  revalidatePath("/historial");
  revalidatePath("/control-maestro");
  revalidatePath("/autorizaciones");
  revalidatePath("/dashboard");
  revalidatePath("/wbs");
  return { ok: true, cuentas, movimientos };
}
