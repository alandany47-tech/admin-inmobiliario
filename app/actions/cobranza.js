"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const DIAS_SEPARACION = 30;

function sumarMeses(fechaISO, n) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function sumarDias(fechaISO, n) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/** Lista todos los contratos de venta, con proyecto/unidad/cliente, para el combobox de Captura de Pagos. */
export async function getContratosVenta() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos_venta")
    .select(
      "id, monto_total_venta, fecha_contrato, estatus, esquema_venta, contrato_firmado, monto_enganche_pactado, monto_enganche_pagado, fecha_limite_apartado, dia_pago_mensual, proyectos(codigo, nombre, logo_proyecto_url, color_primario, color_secundario), unidades(codigo_unidad), clientes(id, nombre, rfc, email)"
    )
    .order("fecha_contrato", { ascending: false });

  if (error) {
    console.error("Error al consultar contratos de venta:", error.message);
    return [];
  }

  return data;
}

/**
 * Paso 1 del flujo comercial (Separación, 30 días): crea el contrato de
 * venta con el monto de separación y el enganche pactado, deja
 * `contrato_firmado = false` y fija `fecha_limite_apartado` a 30 días. La
 * unidad pasa a 'APARTADA' (no 'VENDIDA' — eso ocurre hasta
 * `confirmarFirmaContrato`). También registra la fila 'SEPARACION' del plan
 * de pagos (queda 'Pendiente' hasta que se abone desde Captura de Pagos).
 */
export async function crearSeparacionUnidad(payload) {
  const { proyectoId, unidadId, clienteId, montoTotal, esquemaVenta, montoSeparacion, montoEnganchePactado, fechaContrato } =
    payload;

  if (!proyectoId || !unidadId || !clienteId || !(Number(montoTotal) > 0)) {
    return { error: "Captura proyecto, unidad, cliente y monto total de venta." };
  }

  const fecha = fechaContrato || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data: contrato, error } = await supabase
    .from("contratos_venta")
    .insert({
      proyecto_id: proyectoId,
      unidad_id: unidadId,
      cliente_id: clienteId,
      monto_total_venta: Number(montoTotal),
      fecha_contrato: fecha,
      esquema_venta: esquemaVenta === "INVERSIONISTA" ? "INVERSIONISTA" : "TRADICIONAL",
      fecha_separacion: new Date().toISOString(),
      fecha_limite_apartado: sumarDias(fecha, DIAS_SEPARACION),
      monto_separacion: Number(montoSeparacion) || 0,
      monto_enganche_pactado: Number(montoEnganchePactado) || 0,
      contrato_firmado: false,
    })
    .select()
    .single();

  if (error) {
    return { error: `No se pudo crear el contrato: ${error.message}` };
  }

  if (Number(montoSeparacion) > 0) {
    const { error: errorPlan } = await supabase.from("planes_pago_cobranza").insert({
      contrato_id: contrato.id,
      tipo_pago: "SEPARACION",
      monto_programado: Number(montoSeparacion),
      fecha_programada: fecha,
    });
    if (errorPlan) {
      return { error: `El contrato se creó, pero no se pudo registrar la separación: ${errorPlan.message}` };
    }
  }

  const { error: errorUnidad } = await supabase
    .from("unidades")
    .update({ estatus: "APARTADA" })
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
 * Todas nacen `fase_plan = 'PROYECTADO'` (default de columna): son supuestos
 * hasta que `confirmarFirmaContrato` las active.
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

  // El monto de enganche pactado del contrato se sincroniza aquí (además de
  // capturarse en crearSeparacionUnidad) por si el plan se generó con un
  // monto de enganche distinto al capturado en el paso de separación.
  if (Number(montoEnganche) > 0) {
    await supabase
      .from("contratos_venta")
      .update({ monto_enganche_pactado: Number(montoEnganche) })
      .eq("id", contratoId);
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
 * Resincroniza `contratos_venta.monto_enganche_pagado` sumando `monto_pagado`
 * de todas las filas `tipo_pago='ENGANCHE'` del contrato. Se llama después de
 * cualquier RPC de dinero que toque una fila ENGANCHE (abono o reversión),
 * nunca dentro del RPC mismo (regla 7 de CLAUDE.md: no tocar las funciones
 * atómicas de dinero para un cambio que no es en sí mismo de dinero).
 */
async function sincronizarEnganchePagado(supabase, contratoId) {
  const { data: filasEnganche } = await supabase
    .from("planes_pago_cobranza")
    .select("monto_pagado")
    .eq("contrato_id", contratoId)
    .eq("tipo_pago", "ENGANCHE");

  const totalPagado = (filasEnganche ?? []).reduce((s, f) => s + Number(f.monto_pagado), 0);
  await supabase.from("contratos_venta").update({ monto_enganche_pagado: totalPagado }).eq("id", contratoId);
}

/**
 * Dispersa el abono de una fila del plan de pagos: la función de Postgres
 * ingresa el movimiento en Tesorería, actualiza el saldo de la cuenta y el
 * monto_pagado/estatus de la fila de forma atómica. Después (fuera del RPC
 * de dinero, por la regla de no tocar procesar_pago_cobranza) sincroniza
 * `contratos_venta.monto_enganche_pagado` si la fila pagada es 'ENGANCHE',
 * para poder validar en `confirmarFirmaContrato` si ya se liquidó.
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

  const { data: plan } = await supabase
    .from("planes_pago_cobranza")
    .select("contrato_id, tipo_pago")
    .eq("id", planPagoId)
    .single();

  if (plan?.tipo_pago === "ENGANCHE") {
    await sincronizarEnganchePagado(supabase, plan.contrato_id);
  }

  revalidatePath("/cobranza/pagos");
  revalidatePath("/cobranza/clientes");
  revalidatePath("/tesoreria");
  revalidatePath("/dashboard");
  return { ok: true, resultado: data };
}

/**
 * Revierte el abono de una fila del plan de pagos: la RPC `revertir_pago_cobranza`
 * descuenta el `monto_pagado` acumulado de la cuenta bancaria, inserta un
 * egreso de compensación en Tesorería (no borra los ingresos originales) y
 * regresa la fila a `monto_pagado=0`/`estatus='Pendiente'`, de forma atómica
 * (mismo patrón que `revertir_pago_solicitud`). Después, si la fila era
 * 'ENGANCHE', resincroniza `contratos_venta.monto_enganche_pagado` — si el
 * contrato ya estaba `contrato_firmado=true`, esto puede dejar
 * `monto_enganche_pagado` por debajo de `monto_enganche_pactado` sin revertir
 * la firma ni el estatus 'VENDIDA' de la unidad (caso de borde documentado,
 * no automatizado: requeriría una decisión de negocio sobre qué hacer con
 * una unidad ya vendida cuyo enganche se desliquida).
 */
export async function revertirPagoCobranza(planPagoId) {
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("planes_pago_cobranza")
    .select("contrato_id, tipo_pago")
    .eq("id", planPagoId)
    .single();

  const { data, error } = await supabase.rpc("revertir_pago_cobranza", {
    p_plan_pago_id: planPagoId,
  });

  if (error) {
    return { error: `No se pudo revertir el abono: ${error.message}` };
  }

  if (plan?.tipo_pago === "ENGANCHE") {
    await sincronizarEnganchePagado(supabase, plan.contrato_id);
  }

  revalidatePath("/cobranza/pagos");
  revalidatePath("/cobranza/clientes");
  revalidatePath("/tesoreria");
  revalidatePath("/dashboard");
  return { ok: true, resultado: data };
}

/**
 * Paso 2 del flujo comercial (Liquidación de Enganche y Firma): valida que
 * el enganche pactado ya esté liquidado y que el contrato no esté firmado
 * todavía, define el día de pago mensual definitivo, activa el plan de
 * pagos completo (`fase_plan` PROYECTADO -> ACTIVO) y marca la unidad
 * 'VENDIDA'.
 */
export async function confirmarFirmaContrato(contratoId, diaPagoMensual) {
  const dia = Number(diaPagoMensual);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    return { error: "Captura un día de pago mensual válido (1 a 31)." };
  }

  const supabase = await createClient();
  const { data: contrato, error: errorContrato } = await supabase
    .from("contratos_venta")
    .select("id, unidad_id, contrato_firmado, monto_enganche_pactado, monto_enganche_pagado")
    .eq("id", contratoId)
    .single();

  if (errorContrato || !contrato) {
    return { error: "No se encontró el contrato." };
  }
  if (contrato.contrato_firmado) {
    return { error: "Este contrato ya está firmado." };
  }
  if (Number(contrato.monto_enganche_pagado) < Number(contrato.monto_enganche_pactado)) {
    return { error: "El enganche pactado todavía no se liquida por completo." };
  }

  const { error: errorFirma } = await supabase
    .from("contratos_venta")
    .update({ contrato_firmado: true, dia_pago_mensual: dia })
    .eq("id", contratoId);
  if (errorFirma) {
    return { error: `No se pudo confirmar la firma: ${errorFirma.message}` };
  }

  const { error: errorPlan } = await supabase
    .from("planes_pago_cobranza")
    .update({ fase_plan: "ACTIVO" })
    .eq("contrato_id", contratoId);
  if (errorPlan) {
    return { error: `La firma se confirmó, pero no se pudo activar el plan de pagos: ${errorPlan.message}` };
  }

  const { error: errorUnidad } = await supabase
    .from("unidades")
    .update({ estatus: "VENDIDA" })
    .eq("id", contrato.unidad_id);
  if (errorUnidad) {
    return { error: `La firma se confirmó, pero no se pudo actualizar la unidad: ${errorUnidad.message}` };
  }

  revalidatePath("/unidades");
  revalidatePath("/cobranza/clientes");
  revalidatePath("/cobranza/pagos");
  return { ok: true };
}

/**
 * Cartera por cliente: venta acumulada, cobrado, saldo pendiente, días de
 * mora y estatus de separación/firma, agregados en JS a partir de
 * `vista_cartera_clientes` (un renglón por contrato, con saldos/mora/avance
 * de enganche ya calculados en SQL). `proyectoId` (opcional) filtra a solo
 * los clientes con al menos un contrato en ese proyecto.
 */
export async function getCarteraClientes(proyectoId) {
  const supabase = await createClient();
  const { data: clientes, error: errorClientes } = await supabase
    .from("clientes")
    .select("id, nombre, rfc, telefono, email, direccion, contacto_secundario, notas")
    .order("nombre", { ascending: true });

  if (errorClientes) {
    console.error("Error al consultar clientes:", errorClientes.message);
    return [];
  }

  let query = supabase.from("vista_cartera_clientes").select("*");
  if (proyectoId) query = query.eq("proyecto_id", proyectoId);
  const { data: contratos, error: errorContratos } = await query;

  if (errorContratos) {
    console.error("Error al consultar la cartera de clientes:", errorContratos.message);
    return [];
  }

  const contratosPorCliente = new Map();
  (contratos ?? []).forEach((c) => {
    if (!contratosPorCliente.has(c.cliente_id)) contratosPorCliente.set(c.cliente_id, []);
    contratosPorCliente.get(c.cliente_id).push(c);
  });

  return clientes
    .map((cliente) => ({ ...cliente, contratos: contratosPorCliente.get(cliente.id) ?? [] }))
    .filter((cliente) => !proyectoId || cliente.contratos.length > 0)
    .map((cliente) => {
      const contratos = cliente.contratos;
      const ventaTotal = contratos.reduce((s, c) => s + Number(c.monto_total_venta), 0);
      const cobrado = contratos.reduce((s, c) => s + Number(c.total_pagado), 0);
      const diasMora = contratos.reduce((max, c) => Math.max(max, Number(c.dias_mora) || 0), 0);
      const apartadaPorVencer = contratos.find((c) => !c.contrato_firmado && c.dias_restantes_separacion != null);

      return {
        id: cliente.id,
        nombre: cliente.nombre,
        rfc: cliente.rfc,
        telefono: cliente.telefono,
        email: cliente.email,
        direccion: cliente.direccion,
        contactoSecundario: cliente.contacto_secundario,
        notas: cliente.notas,
        cantidadContratos: contratos.length,
        ventaTotal,
        cobrado,
        saldoPendiente: ventaTotal - cobrado,
        diasMora,
        estadoSeparacion: apartadaPorVencer
          ? { diasRestantes: apartadaPorVencer.dias_restantes_separacion, codigoUnidad: apartadaPorVencer.codigo_unidad }
          : null,
      };
    });
}

/**
 * Alertas de vencimiento: dos tipos de renglón alimentan los mismos buckets
 * 7/15/30 días. 'PAGO': filas del plan de pagos Pendientes/Parciales con
 * `fase_plan = 'ACTIVO'` (mensualidades ya confirmadas, no proyecciones)
 * cuya fecha programada cae dentro de los próximos 30 días (incluye ya
 * vencidas, con diasRestantes negativo). 'APARTADO': contratos sin firmar
 * cuya `fecha_limite_apartado` está por vencer. `proyectoId` (opcional)
 * filtra por unidad/proyecto.
 */
export async function getAlertasVencimiento(proyectoId) {
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date();
  limite.setDate(limite.getDate() + 30);
  const limiteISO = limite.toISOString().slice(0, 10);

  let queryPagos = supabase
    .from("planes_pago_cobranza")
    .select(
      "id, tipo_pago, monto_programado, monto_pagado, fecha_programada, estatus, contratos_venta!inner(id, proyecto_id, clientes(id, nombre), unidades(codigo_unidad, proyecto_id), proyectos(codigo, nombre))"
    )
    .in("estatus", ["Pendiente", "Parcial"])
    .eq("fase_plan", "ACTIVO")
    .lte("fecha_programada", limiteISO)
    .order("fecha_programada", { ascending: true });

  if (proyectoId) queryPagos = queryPagos.eq("contratos_venta.proyecto_id", proyectoId);

  let queryApartados = supabase
    .from("contratos_venta")
    .select("id, fecha_limite_apartado, clientes(id, nombre), unidades(codigo_unidad, proyecto_id), proyectos(codigo, nombre)")
    .eq("contrato_firmado", false)
    .eq("estatus", "Activo")
    .lte("fecha_limite_apartado", limite.toISOString());

  if (proyectoId) queryApartados = queryApartados.eq("proyecto_id", proyectoId);

  const [{ data: pagos, error: errorPagos }, { data: apartados, error: errorApartados }] = await Promise.all([
    queryPagos,
    queryApartados,
  ]);

  if (errorPagos) console.error("Error al consultar alertas de pago:", errorPagos.message);
  if (errorApartados) console.error("Error al consultar alertas de separación:", errorApartados.message);

  const alertasPago = (pagos ?? []).map((p) => ({
    id: p.id,
    tipo: "PAGO",
    tipoPago: p.tipo_pago,
    saldo: Number(p.monto_programado) - Number(p.monto_pagado),
    fechaProgramada: p.fecha_programada,
    diasRestantes: Math.floor((new Date(p.fecha_programada) - new Date(hoy)) / 86400000),
    clienteNombre: p.contratos_venta?.clientes?.nombre ?? "",
    unidadCodigo: p.contratos_venta?.unidades?.codigo_unidad ?? "",
    proyectoCodigo: p.contratos_venta?.proyectos?.codigo ?? "",
  }));

  const alertasApartado = (apartados ?? []).map((c) => ({
    id: `apartado-${c.id}`,
    tipo: "APARTADO",
    tipoPago: "Vence separación",
    saldo: null,
    fechaProgramada: c.fecha_limite_apartado.slice(0, 10),
    diasRestantes: Math.floor((new Date(c.fecha_limite_apartado) - new Date(hoy)) / 86400000),
    clienteNombre: c.clientes?.nombre ?? "",
    unidadCodigo: c.unidades?.codigo_unidad ?? "",
    proyectoCodigo: c.proyectos?.codigo ?? "",
  }));

  return [...alertasPago, ...alertasApartado].sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/** Desglose de todas las filas del plan de pagos de un cliente, a través de todos sus contratos. */
export async function getDesglosePagosCliente(clienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos_venta")
    .select(
      "id, monto_total_venta, fecha_contrato, esquema_venta, contrato_firmado, unidades(codigo_unidad), proyectos(id, codigo, nombre, logo_proyecto_url, color_primario, color_secundario), planes_pago_cobranza(id, tipo_pago, monto_programado, monto_pagado, fecha_programada, fecha_pago, estatus, fase_plan, notas)"
    )
    .eq("cliente_id", clienteId)
    .order("fecha_contrato", { ascending: false });

  if (error) {
    console.error("Error al consultar el desglose de pagos del cliente:", error.message);
    return [];
  }

  return data;
}
