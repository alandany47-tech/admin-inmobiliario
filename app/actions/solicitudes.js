"use server";

import { revalidatePath } from "next/cache";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createClient } from "@/lib/supabase/server";

const TOPE_XML_BYTES = 500 * 1024;

/** Busca recursivamente un atributo UUID (folio fiscal del timbre CFDI) en el XML ya parseado. */
function buscarFolioFiscal(nodo) {
  if (!nodo || typeof nodo !== "object") return null;
  if (typeof nodo["@_UUID"] === "string") return nodo["@_UUID"];
  for (const valor of Object.values(nodo)) {
    if (valor && typeof valor === "object") {
      const encontrado = buscarFolioFiscal(valor);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

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
    esCorporativo,
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

  if (!esCorporativo && wbsCatalogId) {
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
      es_corporativo: !!esCorporativo,
      wbs_categoria: esCorporativo ? null : wbsCategoria || null,
      wbs_partida: esCorporativo ? null : wbsPartida || null,
      wbs_catalog_id: esCorporativo ? null : wbsCatalogId || null,
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

  return { id: solicitud.id, folio: solicitud.folio, proveedorCreado };
}

/**
 * Guarda el XML de la factura (CFDI) como texto plano en `xml_factura` — no
 * va a Storage porque pesa poco (10-30KB). Si el parseo tiene éxito y
 * `num_factura` está vacío, lo autocompleta con el folio fiscal (UUID del
 * timbre); si el parseo falla, no bloquea el guardado del XML.
 */
export async function subirXmlFactura(solicitudId, xmlContent) {
  if (!xmlContent || typeof xmlContent !== "string") {
    return { error: "Selecciona un archivo XML." };
  }
  if (new TextEncoder().encode(xmlContent).length > TOPE_XML_BYTES) {
    return { error: "El archivo XML no debe superar 500KB." };
  }

  const validacion = XMLValidator.validate(xmlContent);
  if (validacion !== true) {
    return { error: "El archivo no es un XML válido." };
  }

  const supabase = await createClient();
  const { data: actual, error: errorConsulta } = await supabase
    .from("solicitudes_pago")
    .select("num_factura")
    .eq("id", solicitudId)
    .single();

  if (errorConsulta) {
    return { error: `No se pudo consultar la solicitud: ${errorConsulta.message}` };
  }

  const cambios = { xml_factura: xmlContent };

  if (!actual.num_factura) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const folioFiscal = buscarFolioFiscal(parser.parse(xmlContent));
      if (folioFiscal) cambios.num_factura = folioFiscal;
    } catch {
      // Ignorado a propósito: el XML se guarda igual, num_factura sigue editable a mano.
    }
  }

  const { error: errorUpdate } = await supabase
    .from("solicitudes_pago")
    .update(cambios)
    .eq("id", solicitudId);

  if (errorUpdate) {
    return { error: `No se pudo guardar el XML de factura: ${errorUpdate.message}` };
  }

  revalidatePath("/control-maestro");
  revalidatePath("/historial");
  return { ok: true, numFactura: cambios.num_factura ?? actual.num_factura };
}

/** Obtiene una solicitud de pago con su proyecto y proveedor para la vista de detalle/PDF. */
export async function getSolicitudPorId(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select(
      "*, proyectos(codigo, nombre, logo_proyecto_url, color_primario), proveedores(razon_social, rfc, datos_bancarios)"
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error al consultar la solicitud:", error.message);
    return null;
  }

  return data;
}

/**
 * Firmas de autorización aplicables a una solicitud: un usuario por cada
 * `firma_zona` asignada (izquierda/derecha), con su imagen de firma y si ya
 * autorizó esta solicitud en particular. Es un sello de imagen sin validez
 * legal, no una firma digital.
 */
export async function getFirmasParaSolicitud(solicitudId) {
  const supabase = await createClient();

  const [{ data: firmantes, error: errorFirmantes }, { data: autorizaciones, error: errorAutorizaciones }] =
    await Promise.all([
      supabase
        .from("perfiles_usuario")
        .select("id, nombre, firma_imagen_url, firma_zona")
        .not("firma_zona", "is", null)
        .order("firma_zona", { ascending: true }),
      supabase.from("solicitud_autorizaciones").select("usuario_id").eq("solicitud_id", solicitudId),
    ]);

  if (errorFirmantes || errorAutorizaciones) {
    console.error(
      "Error al consultar firmas de la solicitud:",
      errorFirmantes?.message || errorAutorizaciones?.message
    );
    return [];
  }

  const idsAutorizaron = new Set((autorizaciones ?? []).map((a) => a.usuario_id));

  return (firmantes ?? []).map((f) => ({
    ...f,
    autorizo: idsAutorizaron.has(f.id),
  }));
}
