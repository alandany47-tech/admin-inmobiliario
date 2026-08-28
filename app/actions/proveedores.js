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

function normalizarRfc(rfc) {
  const limpio = String(rfc ?? "").trim().toUpperCase();
  return limpio || null;
}

function armarDatosBancarios(banco, cuenta) {
  const bancoLimpio = String(banco ?? "").trim();
  const cuentaLimpia = String(cuenta ?? "").trim();
  if (!bancoLimpio && !cuentaLimpia) return null;

  if (bancoLimpio.toLowerCase() === "banregio") {
    return { banco: "Banregio", numero_cuenta: cuentaLimpia };
  }
  return { banco: bancoLimpio || "Otro", clabe: cuentaLimpia.replace(/\D/g, "") };
}

/**
 * Calcula el diff entre los proveedores existentes y las filas de un archivo
 * Excel/CSV importado, sin aplicar ningún cambio. `filas` ya viene parseado
 * en el cliente con las columnas: razonSocial, rfc, banco, cuenta,
 * contactoNombre, telefono, email. La correspondencia con proveedores
 * existentes se hace por RFC (normalizado, insensible a mayúsculas); filas
 * sin RFC siempre se tratan como altas nuevas porque no hay forma confiable
 * de emparejarlas.
 */
export async function previsualizarImportProveedores(filas) {
  const supabase = await createClient();

  const { data: existentes, error } = await supabase
    .from("proveedores")
    .select("id, razon_social, rfc, datos_bancarios, contacto_nombre, contacto_telefono, contacto_email");
  if (error) {
    return { error: `No se pudo leer el directorio actual: ${error.message}` };
  }

  const mapaExistente = new Map(
    existentes.filter((p) => p.rfc).map((p) => [p.rfc.trim().toUpperCase(), p])
  );

  const invalidos = [];
  const duplicados = [];
  const nuevos = [];
  const actualizados = [];
  const rfcsVistos = new Set();

  filas.forEach((fila, i) => {
    const razonSocial = String(fila.razonSocial ?? "").trim();
    if (!razonSocial) {
      invalidos.push({ fila: i + 1, motivo: "Falta razón social" });
      return;
    }

    const rfc = normalizarRfc(fila.rfc);
    const datosBancarios = armarDatosBancarios(fila.banco, fila.cuenta);
    const registro = {
      razonSocial,
      rfc,
      datosBancarios,
      contactoNombre: String(fila.contactoNombre ?? "").trim() || null,
      contactoTelefono: String(fila.telefono ?? "").trim() || null,
      contactoEmail: String(fila.email ?? "").trim() || null,
    };

    if (rfc) {
      if (rfcsVistos.has(rfc)) {
        duplicados.push({ fila: i + 1, razonSocial, rfc, motivo: "RFC repetido en el archivo" });
        return;
      }
      rfcsVistos.add(rfc);

      const existente = mapaExistente.get(rfc);
      if (existente) {
        actualizados.push({
          id: existente.id,
          razonSocial: registro.razonSocial,
          rfc,
          // No se pisan datos existentes cuando la fila del archivo no trae
          // el dato: solo se actualiza lo que realmente viene en el Excel.
          datosBancarios: registro.datosBancarios ?? existente.datos_bancarios,
          contactoNombre: registro.contactoNombre ?? existente.contacto_nombre,
          contactoTelefono: registro.contactoTelefono ?? existente.contacto_telefono,
          contactoEmail: registro.contactoEmail ?? existente.contacto_email,
        });
        return;
      }
    }

    nuevos.push(registro);
  });

  return { nuevos, actualizados, duplicados, invalidos };
}

/** Aplica un diff ya previsualizado: inserta altas nuevas y actualiza las que matchearon por RFC. */
export async function aplicarImportProveedores({ nuevos, actualizados }) {
  const supabase = await createClient();

  if (nuevos?.length > 0) {
    const { error } = await supabase.from("proveedores").insert(
      nuevos.map((n) => ({
        razon_social: n.razonSocial,
        rfc: n.rfc,
        datos_bancarios: n.datosBancarios,
        contacto_nombre: n.contactoNombre,
        contacto_telefono: n.contactoTelefono,
        contacto_email: n.contactoEmail,
      }))
    );
    if (error) return { error: `No se pudieron insertar los proveedores nuevos: ${error.message}` };
  }

  for (const a of actualizados ?? []) {
    const { error } = await supabase
      .from("proveedores")
      .update({
        razon_social: a.razonSocial,
        rfc: a.rfc,
        datos_bancarios: a.datosBancarios,
        contacto_nombre: a.contactoNombre,
        contacto_telefono: a.contactoTelefono,
        contacto_email: a.contactoEmail,
      })
      .eq("id", a.id);
    if (error) return { error: `No se pudo actualizar "${a.razonSocial}": ${error.message}` };
  }

  revalidatePath("/proveedores");
  revalidatePath("/control-maestro");
  revalidatePath("/solicitud");
  return { ok: true };
}
