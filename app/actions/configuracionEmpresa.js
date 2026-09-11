"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Configuración global de la empresa (fila única: logo de empresa, futuros datos fiscales, etc.). */
export async function getConfiguracionEmpresa() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("configuracion_empresa").select("*").limit(1).maybeSingle();

  if (error) {
    console.error("Error al consultar la configuración de empresa:", error.message);
    return null;
  }

  return data;
}

/** Sube el logo de empresa (PNG) y actualiza la fila única de configuracion_empresa. */
export async function subirLogoEmpresa(formData) {
  const archivo = formData.get("archivo");
  if (!archivo || archivo.size === 0) {
    return { error: "Selecciona un archivo." };
  }
  if (archivo.type !== "image/png") {
    return { error: "El logo debe ser un archivo PNG." };
  }

  const supabase = await createClient();
  const ruta = `empresa/${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage
    .from("logos-empresa")
    .upload(ruta, archivo, { upsert: true });

  if (errorSubida) {
    return { error: `No se pudo subir el logo: ${errorSubida.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("logos-empresa").getPublicUrl(ruta);

  const { data: fila } = await supabase.from("configuracion_empresa").select("id").limit(1).maybeSingle();

  const { error: errorUpdate } = await supabase
    .from("configuracion_empresa")
    .update({ logo_empresa_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", fila.id);

  if (errorUpdate) {
    return { error: `No se pudo actualizar el logo: ${errorUpdate.message}` };
  }

  revalidatePath("/configuracion/plantillas");
  return { ok: true, url: publicUrl };
}
