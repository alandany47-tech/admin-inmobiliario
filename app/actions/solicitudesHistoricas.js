"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const METODOS_VALIDOS = ["Transferencia bancaria", "Efectivo"];

function parseFecha(valor) {
  if (!valor) return null;
  // Excel a veces entrega números de serie de fecha en vez de texto.
  if (typeof valor === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + valor);
    return epoch.toISOString().slice(0, 10);
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toISOString().slice(0, 10);
}

function num(valor) {
  const n = Number(String(valor ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Calcula el diff de una carga histórica de solicitudes ya pagadas (fuera de
 * este sistema), sin insertar nada. `filas` viene ya parseado del Excel en el
 * cliente. Esta carga NO pasa por procesar_pago_solicitud: es data ya
 * conciliada, no mueve saldo de cuentas bancarias ni genera movimientos_tesoreria.
 */
export async function previsualizarImportSolicitudesHistoricas(filas) {
  const supabase = await createClient();

  const [{ data: proyectos, error: errorProyectos }, { data: proveedores, error: errorProveedores }] =
    await Promise.all([
      supabase.from("proyectos").select("id, codigo"),
      supabase.from("proveedores").select("id, razon_social, rfc"),
    ]);

  if (errorProyectos || errorProveedores) {
    return { error: `No se pudo leer el catálogo: ${errorProyectos?.message || errorProveedores?.message}` };
  }

  const proyectosPorCodigo = new Map(proyectos.map((p) => [p.codigo.trim().toLowerCase(), p]));
  const proveedoresPorRfc = new Map(
    proveedores.filter((p) => p.rfc).map((p) => [p.rfc.trim().toUpperCase(), p])
  );
  const proveedoresPorNombre = new Map(
    proveedores.map((p) => [p.razon_social.trim().toLowerCase(), p])
  );

  const validas = [];
  const invalidas = [];

  filas.forEach((f, i) => {
    const fila = i + 2; // fila 1 es el encabezado en el Excel

    const proyectoCodigo = String(f.proyecto ?? "").trim();
    const proyecto = proyectosPorCodigo.get(proyectoCodigo.toLowerCase());
    if (!proyecto) {
      invalidas.push({ fila, motivo: `Proyecto "${proyectoCodigo}" no encontrado` });
      return;
    }

    const razonSocial = String(f.proveedor ?? "").trim();
    const rfc = String(f.rfc ?? "").trim().toUpperCase();
    if (!razonSocial && !rfc) {
      invalidas.push({ fila, motivo: "Falta proveedor (razón social o RFC)" });
      return;
    }
    const proveedorExistente = (rfc && proveedoresPorRfc.get(rfc)) || proveedoresPorNombre.get(razonSocial.toLowerCase());

    const fechaPago = parseFecha(f.fechaPago);
    if (!fechaPago) {
      invalidas.push({ fila, motivo: "Fecha de pago inválida o vacía" });
      return;
    }

    const subtotal = num(f.subtotal) ?? num(f.total) ?? 0;
    const iva = num(f.iva) ?? 0;
    const total = num(f.total) ?? Math.round((subtotal + iva) * 100) / 100;
    if (!total || total <= 0) {
      invalidas.push({ fila, motivo: "Total inválido o en cero" });
      return;
    }

    const metodoPago = METODOS_VALIDOS.includes(f.metodoPago) ? f.metodoPago : "Transferencia bancaria";

    validas.push({
      fila,
      proyectoId: proyecto.id,
      proyectoCodigo: proyecto.codigo,
      proveedorId: proveedorExistente?.id ?? null,
      proveedorNuevo: proveedorExistente
        ? null
        : { razonSocial: razonSocial || rfc, rfc: rfc || null },
      concepto: String(f.concepto ?? "").trim() || "Carga histórica",
      subtotal,
      iva,
      total,
      fechaPago,
      metodoPago,
      solicitante: String(f.solicitante ?? "HIST").trim().slice(0, 10) || "HIST",
      numFactura: String(f.numFactura ?? "").trim() || null,
      wbsCategoria: String(f.wbsCategoria ?? "").trim() || null,
      wbsPartida: String(f.wbsPartida ?? "").trim() || null,
    });
  });

  return { validas, invalidas };
}

/** Aplica un diff ya previsualizado: crea proveedores nuevos que hagan falta e inserta las solicitudes históricas ya como Pagado. */
export async function aplicarImportSolicitudesHistoricas(validas) {
  if (!validas?.length) return { error: "No hay filas válidas que importar." };

  const supabase = await createClient();

  const proveedorPorClave = new Map();
  for (const v of validas) {
    if (!v.proveedorId && v.proveedorNuevo) {
      const clave = (v.proveedorNuevo.rfc || v.proveedorNuevo.razonSocial).toLowerCase();
      if (!proveedorPorClave.has(clave)) {
        proveedorPorClave.set(clave, v.proveedorNuevo);
      }
    }
  }

  const idPorClave = new Map();
  for (const [clave, datos] of proveedorPorClave) {
    const { data: nuevo, error } = await supabase
      .from("proveedores")
      .insert({ razon_social: datos.razonSocial, rfc: datos.rfc })
      .select("id")
      .single();
    if (error) return { error: `No se pudo crear el proveedor ${datos.razonSocial}: ${error.message}` };
    idPorClave.set(clave, nuevo.id);
  }

  const filas = validas.map((v) => {
    let proveedorId = v.proveedorId;
    if (!proveedorId && v.proveedorNuevo) {
      const clave = (v.proveedorNuevo.rfc || v.proveedorNuevo.razonSocial).toLowerCase();
      proveedorId = idPorClave.get(clave);
    }
    return {
      proyecto_id: v.proyectoId,
      proveedor_id: proveedorId,
      concepto: v.concepto,
      metodo_pago: v.metodoPago,
      solicitante: v.solicitante,
      num_factura: v.numFactura,
      wbs_categoria: v.wbsCategoria,
      wbs_partida: v.wbsPartida,
      wbs_catalog_id: null,
      partidas: [],
      aplica_iva: v.iva > 0,
      subtotal: v.subtotal,
      iva: v.iva,
      total: v.total,
      fecha_programada: v.fechaPago,
      fecha_pago: v.fechaPago,
      estado: "Pagado",
    };
  });

  const { error } = await supabase.from("solicitudes_pago").insert(filas);
  if (error) return { error: `No se pudieron insertar las solicitudes: ${error.message}` };

  revalidatePath("/historial");
  revalidatePath("/wbs");
  revalidatePath("/dashboard");
  return { ok: true, cantidad: filas.length };
}
