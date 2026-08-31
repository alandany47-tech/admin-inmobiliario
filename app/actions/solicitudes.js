"use server";

import { createClient } from "@/lib/supabase/server";

/** Arma un "concepto" resumen a partir de las descripciones de las partidas. */
function resumirConcepto(partidas) {
  return partidas
    .map((p) => p.descripcion)
    .filter(Boolean)
    .join("; ")
    .slice(0, 500);
}

function formatoPeriodo(fecha) {
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yy = String(fecha.getFullYear()).slice(-2);
  return `${mm}${yy}`;
}

/** Previsualiza el folio que asignaría el trigger, sin reservarlo. */
export async function getFolioPreview(proyectoId) {
  if (!proyectoId) return null;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("codigo")
    .eq("id", proyectoId)
    .single();

  if (!proyecto) return null;

  const periodo = formatoPeriodo(new Date());

  const { data: contador } = await supabase
    .from("folios_consecutivos")
    .select("consecutivo")
    .eq("proyecto_id", proyectoId)
    .eq("periodo", periodo)
    .maybeSingle();

  const siguiente = (contador?.consecutivo ?? 0) + 1;
  return `${proyecto.codigo}-${periodo}-${String(siguiente).padStart(3, "0")}`;
}

/**
 * Crea una solicitud de pago. Si `proveedor` viene como objeto (proveedor
 * nuevo) primero lo inserta en `proveedores`; si viene como id, reutiliza el
 * existente. El folio no se envía: lo autogenera el trigger de Postgres.
 */
export async function crearSolicitudPago(payload) {
  const supabase = await createClient();
  const {
    proyectoId,
    proveedor,
    metodoPago,
    solicitante,
    numFactura,
    wbsCategoria,
    wbsPartida,
    wbsCatalogId,
    partidas,
    aplicaIva,
    subtotal,
    iva,
    total,
    fechaProgramada,
  } = payload;

  let proveedorId = proveedor?.id ?? null;
  let proveedorCreado = null;

  if (!proveedorId && proveedor?.nuevo) {
    const { data: nuevoProveedor, error: errorProveedor } = await supabase
      .from("proveedores")
      .insert({
        razon_social: proveedor.razonSocial,
        rfc: proveedor.rfc || null,
        datos_bancarios: proveedor.datosBancarios,
      })
      .select()
      .single();

    if (errorProveedor) {
      return { error: `No se pudo registrar el proveedor: ${errorProveedor.message}` };
    }

    proveedorId = nuevoProveedor.id;
    proveedorCreado = nuevoProveedor;
  }

  if (!proveedorId) {
    return { error: "Selecciona o registra un proveedor." };
  }

  if (wbsCatalogId) {
    const { data: wbsResumen } = await supabase
      .from("wbs_presupuesto_resumen")
      .select("disponible, partida, codigo")
      .eq("id", wbsCatalogId)
      .single();

    if (wbsResumen && total > wbsResumen.disponible) {
      return {
        error: `El monto total ($${Number(total).toLocaleString("es-MX")}) excede el disponible presupuestal ($${Number(wbsResumen.disponible).toLocaleString("es-MX")}) para la partida ${wbsResumen.codigo ? wbsResumen.codigo + " " : ""}${wbsResumen.partida}.`,
      };
    }
  }

  const { data: solicitud, error: errorSolicitud } = await supabase
    .from("solicitudes_pago")
    .insert({
      proyecto_id: proyectoId,
      proveedor_id: proveedorId,
      concepto: resumirConcepto(partidas),
      metodo_pago: metodoPago,
      solicitante,
      num_factura: numFactura || null,
      wbs_categoria: wbsCategoria || null,
      wbs_partida: wbsPartida || null,
      wbs_catalog_id: wbsCatalogId || null,
      partidas,
      aplica_iva: aplicaIva,
      subtotal,
      iva,
      total,
      fecha_programada: fechaProgramada,
    })
    .select()
    .single();

  if (errorSolicitud) {
    return { error: `No se pudo crear la solicitud: ${errorSolicitud.message}` };
  }

  return { folio: solicitud.folio, proveedorCreado };
}

/** Obtiene una solicitud de pago con su proyecto y proveedor para la vista de detalle/PDF. */
export async function getSolicitudPorId(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select("*, proyectos(codigo, nombre), proveedores(razon_social, rfc, datos_bancarios)")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error al consultar la solicitud:", error.message);
    return null;
  }

  return data;
}
