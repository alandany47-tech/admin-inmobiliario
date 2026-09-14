"use server";

import { revalidatePath } from "next/cache";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/r2/client";
import { createClient } from "@/lib/supabase/server";

const TOPE_BYTES = 10 * 1024 * 1024;

/**
 * Sube el comprobante de pago a Cloudflare R2 (bucket privado) y guarda su
 * key en `comprobante_r2_key`. Reemplaza cualquier comprobante R2 anterior de
 * la misma solicitud; no toca `comprobante_url` (flujo legado de Supabase).
 */
export async function subirComprobanteR2(solicitudId, formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  const esPdf = archivo.type === "application/pdf" || archivo.name?.toLowerCase().endsWith(".pdf");
  if (!esPdf) {
    return { error: "El comprobante debe ser un archivo PDF." };
  }
  if (archivo.size > TOPE_BYTES) {
    return { error: "El comprobante no debe superar 10MB." };
  }

  const supabase = await createClient();
  const { data: solicitud, error: errorConsulta } = await supabase
    .from("solicitudes_pago")
    .select("proyecto_id, proyectos(codigo)")
    .eq("id", solicitudId)
    .single();

  if (errorConsulta) {
    return { error: `No se pudo consultar la solicitud: ${errorConsulta.message}` };
  }

  const carpetaProyecto = `${solicitud.proyectos?.codigo ?? "SIN-CODIGO"}-${solicitud.proyecto_id}`;
  const key = `comprobantes/${carpetaProyecto}/${solicitudId}-${Date.now()}-${archivo.name}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  try {
    const r2 = createR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "application/pdf",
      })
    );
  } catch (err) {
    return { error: `No se pudo subir el comprobante a R2: ${err.message}` };
  }

  const { error: errorUpdate } = await supabase
    .from("solicitudes_pago")
    .update({ comprobante_r2_key: key })
    .eq("id", solicitudId);

  if (errorUpdate) {
    return { error: `No se pudo guardar la referencia del comprobante: ${errorUpdate.message}` };
  }

  revalidatePath("/control-maestro");
  revalidatePath("/historial");
  revalidatePath("/wbs");
  return { ok: true, key };
}

/** Genera una URL firmada (vigente ~5 minutos) para leer el comprobante de una solicitud en R2. */
export async function obtenerUrlComprobante(solicitudId) {
  const supabase = await createClient();
  const { data: solicitud, error } = await supabase
    .from("solicitudes_pago")
    .select("comprobante_r2_key")
    .eq("id", solicitudId)
    .single();

  if (error) {
    return { error: `No se pudo consultar la solicitud: ${error.message}` };
  }
  if (!solicitud.comprobante_r2_key) {
    return { error: "Esta solicitud no tiene comprobante en R2." };
  }

  try {
    const r2 = createR2Client();
    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: solicitud.comprobante_r2_key }),
      { expiresIn: 300 }
    );
    return { url };
  } catch (err) {
    return { error: `No se pudo generar la URL del comprobante: ${err.message}` };
  }
}

/** Elimina el comprobante de R2 y limpia `comprobante_r2_key`. */
export async function eliminarComprobanteR2(solicitudId) {
  const supabase = await createClient();
  const { data: solicitud, error: errorConsulta } = await supabase
    .from("solicitudes_pago")
    .select("comprobante_r2_key")
    .eq("id", solicitudId)
    .single();

  if (errorConsulta) {
    return { error: `No se pudo consultar la solicitud: ${errorConsulta.message}` };
  }

  if (solicitud.comprobante_r2_key) {
    try {
      const r2 = createR2Client();
      await r2.send(
        new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: solicitud.comprobante_r2_key })
      );
    } catch (err) {
      return { error: `No se pudo eliminar el archivo de R2: ${err.message}` };
    }
  }

  const { error: errorUpdate } = await supabase
    .from("solicitudes_pago")
    .update({ comprobante_r2_key: null })
    .eq("id", solicitudId);

  if (errorUpdate) {
    return { error: `No se pudo limpiar la referencia del comprobante: ${errorUpdate.message}` };
  }

  revalidatePath("/control-maestro");
  revalidatePath("/historial");
  revalidatePath("/wbs");
  return { ok: true };
}
