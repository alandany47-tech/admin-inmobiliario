"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function sumarMeses(fechaISO, n) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Lista todos los contratos de venta, con proyecto/unidad/cliente, para el combobox de Captura de Pagos. */
export async function getContratosVenta() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos_venta")
    .select(
      "id, monto_total_venta, fecha_contrato, estatus, proyectos(codigo, nombre), unidades(codigo_unidad), clientes(id, nombre, rfc)"
    )
    .order("fecha_contrato", { ascending: false });

  if (error) {
    console.error("Error al consultar contratos de venta:", error.message);
    return [];
  }

  return data;
}

/** Crea el contrato de venta de una unidad y la marca como 'Vendida'. */
export async function crearContratoVenta(payload) {
  const { proyectoId, unidadId, clienteId, montoTotal, fechaContrato } = payload;

  if (!proyectoId || !unidadId || !clienteId || !(Number(montoTotal) > 0)) {
    return { error: "Captura proyecto, unidad, cliente y monto total de venta." };
  }

  const supabase = await createClient();
  const { data: contrato, error } = await supabase
    .from("contratos_venta")
    .insert({
      proyecto_id: proyectoId,
      unidad_id: unidadId,
      cliente_id: clienteId,
      monto_total_venta: Number(montoTotal),
      fecha_contrato: fechaContrato || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();

  if (error) {
    return { error: `No se pudo crear el contrato: ${error.message}` };
  }

  const { error: errorUnidad } = await supabase
    .from("unidades")
    .update({ estatus: "Vendida" })
    .eq("id", unidadId);

  if (errorUnidad) {
    return {
      error: `El contrato se creó, pero no se pudo actualizar el estatus de la unidad: ${errorUnidad.message}`,
    };
  }

  revalidatePath("/unidades");
  revalidatePath("/cobranza/clientes");
  revalidatePath("/cobranza/pagos");
  return { ok: true, contrato };
}

/**
 * Genera las filas del plan de pagos (enganche, N mensualidades, entrega) de
 * un contrato. Cada concepto es opcional: se omite si no trae monto > 0.
 */
export async function generarPlanDePagos(contratoId, payload) {
  const {
    montoEnganche,
    fechaEnganche,
    numMensualidades,
    montoMensualidad,
    fechaPrimeraMensualidad,
    montoEntrega,
    fechaEntrega,
  } = payload;

  const filas = [];

  if (Number(montoEnganche) > 0 && fechaEnganche) {
    filas.push({
      contrato_id: contratoId,
      tipo_pago: "ENGANCHE",
      monto_programado: Number(montoEnganche),
      fecha_programada: fechaEnganche,
    });
  }

  const n = Number(numMensualidades) || 0;
  if (n > 0 && Number(montoMensualidad) > 0 && fechaPrimeraMensualidad) {
    for (let i = 0; i < n; i++) {
      filas.push({
        contrato_id: contratoId,
        tipo_pago: "MENSUALIDAD",
        monto_programado: Number(montoMensualidad),
        fecha_programada: sumarMeses(fechaPrimeraMensualidad, i),
        notas: `Mensualidad ${i + 1}/${n}`,
      });
    }
  }

  if (Number(montoEntrega) > 0 && fechaEntrega) {
    filas.push({
      contrato_id: contratoId,
      tipo_pago: "A ENTREGA",
      monto_programado: Number(montoEntrega),
      fecha_programada: fechaEntrega,
    });
  }

  if (filas.length === 0) {
    return { error: "Captura al menos un concepto del plan de pagos (enganche, mensualidades o entrega)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("planes_pago_cobranza").insert(filas);

  if (error) {
    return { error: `No se pudo generar el plan de pagos: ${error.message}` };
  }

  revalidatePath("/cobranza/pagos");
  revalidatePath("/cobranza/clientes");
  return { ok: true };
}

/** Plan de pagos (amortización) de un contrato. */
export async function getPlanDePagos(contratoId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planes_pago_cobranza")
    .select("*")
    .eq("contrato_id", contratoId)
    .order("fecha_programada", { ascending: true });

  if (error) {
    console.error("Error al consultar el plan de pagos:", error.message);
    return [];
  }

  return data;
}

/**
 * Dispersa el abono de una fila del plan de pagos: la función de Postgres
 * ingresa el movimiento en Tesorería, actualiza el saldo de la cuenta y el
 * monto_pagado/estatus de la fila de forma atómica.
 */
export async function procesarPagoCobranza(planPagoId, cuentaId, monto, fechaPago, metodoPago) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("procesar_pago_cobranza", {
    p_plan_pago_id: planPagoId,
    p_cuenta_id: cuentaId,
    p_monto: monto,
    p_fecha_pago: fechaPago,
    p_metodo_pago: metodoPago || "Transferencia bancaria",
  });

  if (error) {
    return { error: `No se pudo procesar el abono: ${error.message}` };
  }

  revalidatePath("/cobranza/pagos");
  revalidatePath("/cobranza/clientes");
  revalidatePath("/tesoreria");
  revalidatePath("/dashboard");
  return { ok: true, resultado: data };
}

/**
 * Cartera por cliente: venta acumulada, cobrado, saldo pendiente y días de
 * mora (máximo entre las filas Pendiente/Parcial con fecha_programada
 * vencida). Se agrega en JS a partir de un select anidado en vez de una vista
 * SQL nueva, mismo criterio que el árbol WBS (construirArbol en lib/wbs.js).
 */
export async function getCarteraClientes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select(
      "id, nombre, rfc, telefono, email, contratos_venta(id, monto_total_venta, estatus, planes_pago_cobranza(monto_programado, monto_pagado, fecha_programada, estatus))"
    )
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al consultar la cartera de clientes:", error.message);
    return [];
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return data
    .filter((cliente) => (cliente.contratos_venta ?? []).length > 0)
    .map((cliente) => {
      const contratos = cliente.contratos_venta ?? [];
      const ventaTotal = contratos.reduce((s, c) => s + Number(c.monto_total_venta), 0);
      let cobrado = 0;
      let diasMora = 0;

      contratos.forEach((c) => {
        (c.planes_pago_cobranza ?? []).forEach((p) => {
          cobrado += Number(p.monto_pagado);
          if (["Pendiente", "Parcial"].includes(p.estatus) && p.fecha_programada < hoy) {
            const dias = Math.floor((new Date(hoy) - new Date(p.fecha_programada)) / 86400000);
            diasMora = Math.max(diasMora, dias);
          }
        });
      });

      return {
        id: cliente.id,
        nombre: cliente.nombre,
        rfc: cliente.rfc,
        telefono: cliente.telefono,
        email: cliente.email,
        cantidadContratos: contratos.length,
        ventaTotal,
        cobrado,
        saldoPendiente: ventaTotal - cobrado,
        diasMora,
      };
    });
}

/** Desglose de todas las filas del plan de pagos de un cliente, a través de todos sus contratos. */
export async function getDesglosePagosCliente(clienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos_venta")
    .select(
      "id, monto_total_venta, fecha_contrato, unidades(codigo_unidad), planes_pago_cobranza(id, tipo_pago, monto_programado, monto_pagado, fecha_programada, fecha_pago, estatus, notas)"
    )
    .eq("cliente_id", clienteId)
    .order("fecha_contrato", { ascending: false });

  if (error) {
    console.error("Error al consultar el desglose de pagos del cliente:", error.message);
    return [];
  }

  return data;
}
