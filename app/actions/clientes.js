"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Lista todos los clientes, para el combobox buscable de Unidades/Cobranza. */
export async function getClientes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al consultar clientes:", error.message);
    return [];
  }

  return data;
}

/**
 * Reutiliza un cliente existente por id, o crea uno nuevo. Mismo patrón que
 * el alta inline de proveedor en crearSolicitudPago.
 */
export async function buscarOCrearCliente(payload) {
  const { id, nombre, rfc, telefono, email } = payload;
  const supabase = await createClient();

  if (id) return { id };

  if (!nombre?.trim()) {
    return { error: "Captura el nombre del cliente." };
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre: nombre.trim(),
      rfc: rfc?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { error: `No se pudo registrar el cliente: ${error.message}` };
  }

  return { id: data.id, cliente: data };
}

/** Actualiza el directorio completo de un cliente existente. */
export async function actualizarCliente(id, payload) {
  const { nombre, rfc, telefono, email, direccion, contactoSecundario, notas } = payload;

  if (!nombre?.trim()) {
    return { error: "Captura el nombre o razón social del cliente." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .update({
      nombre: nombre.trim(),
      rfc: rfc?.trim() || null,
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
      direccion: direccion?.trim() || null,
      contacto_secundario: contactoSecundario?.trim() || null,
      notas: notas?.trim() || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: `No se pudo actualizar el cliente: ${error.message}` };
  }

  revalidatePath("/cobranza/clientes");
  return { ok: true, cliente: data };
}

function normalizarRfc(rfc) {
  const limpio = String(rfc ?? "").trim().toUpperCase();
  return limpio || null;
}

/**
 * Calcula el diff entre los clientes existentes y las filas de un archivo
 * Excel/CSV importado, sin aplicar ningún cambio. `filas` ya viene parseado
 * en el cliente con las columnas: nombre, rfc, telefono, email, direccion,
 * contactoSecundario, notas. La correspondencia con clientes existentes se
 * hace por RFC (normalizado, insensible a mayúsculas); filas sin RFC siempre
 * se tratan como altas nuevas, mismo criterio que la importación de
 * proveedores.
 */
export async function previsualizarImportClientes(filas) {
  const supabase = await createClient();

  const { data: existentes, error } = await supabase
    .from("clientes")
    .select("id, nombre, rfc, telefono, email, direccion, contacto_secundario, notas");
  if (error) {
    return { error: `No se pudo leer el directorio actual: ${error.message}` };
  }

  const mapaExistente = new Map(
    existentes.filter((c) => c.rfc).map((c) => [c.rfc.trim().toUpperCase(), c])
  );

  const invalidos = [];
  const duplicados = [];
  const nuevos = [];
  const actualizados = [];
  const rfcsVistos = new Set();

  filas.forEach((fila, i) => {
    const nombre = String(fila.nombre ?? "").trim();
    if (!nombre) {
      invalidos.push({ fila: i + 1, motivo: "Falta nombre / razón social" });
      return;
    }

    const rfc = normalizarRfc(fila.rfc);
    const registro = {
      nombre,
      rfc,
      telefono: String(fila.telefono ?? "").trim() || null,
      email: String(fila.email ?? "").trim() || null,
      direccion: String(fila.direccion ?? "").trim() || null,
      contactoSecundario: String(fila.contactoSecundario ?? "").trim() || null,
      notas: String(fila.notas ?? "").trim() || null,
    };

    if (rfc) {
      if (rfcsVistos.has(rfc)) {
        duplicados.push({ fila: i + 1, nombre, rfc, motivo: "RFC repetido en el archivo" });
        return;
      }
      rfcsVistos.add(rfc);

      const existente = mapaExistente.get(rfc);
      if (existente) {
        actualizados.push({
          id: existente.id,
          nombre: registro.nombre,
          rfc,
          telefono: registro.telefono ?? existente.telefono,
          email: registro.email ?? existente.email,
          direccion: registro.direccion ?? existente.direccion,
          contactoSecundario: registro.contactoSecundario ?? existente.contacto_secundario,
          notas: registro.notas ?? existente.notas,
        });
        return;
      }
    }

    nuevos.push(registro);
  });

  return { nuevos, actualizados, duplicados, invalidos };
}

/** Aplica un diff ya previsualizado: inserta altas nuevas y actualiza las que matchearon por RFC. */
export async function aplicarImportClientes({ nuevos, actualizados }) {
  const supabase = await createClient();

  if (nuevos?.length > 0) {
    const { error } = await supabase.from("clientes").insert(
      nuevos.map((n) => ({
        nombre: n.nombre,
        rfc: n.rfc,
        telefono: n.telefono,
        email: n.email,
        direccion: n.direccion,
        contacto_secundario: n.contactoSecundario,
        notas: n.notas,
      }))
    );
    if (error) return { error: `No se pudieron insertar los clientes nuevos: ${error.message}` };
  }

  for (const a of actualizados ?? []) {
    const { error } = await supabase
      .from("clientes")
      .update({
        nombre: a.nombre,
        rfc: a.rfc,
        telefono: a.telefono,
        email: a.email,
        direccion: a.direccion,
        contacto_secundario: a.contactoSecundario,
        notas: a.notas,
      })
      .eq("id", a.id);
    if (error) return { error: `No se pudo actualizar "${a.nombre}": ${error.message}` };
  }

  revalidatePath("/cobranza/clientes");
  return { ok: true };
}
