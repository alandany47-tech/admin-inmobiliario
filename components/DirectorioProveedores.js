"use client";

import { useMemo, useState } from "react";
import { Landmark, Mail, Pencil, Phone, Power, Search, Trash2, Upload, X } from "lucide-react";
import {
  actualizarProveedor,
  cambiarEstatusProveedor,
  eliminarProveedor,
  getProveedores,
} from "@/app/actions/proveedores";
import ModalImportarProveedores from "@/components/ModalImportarProveedores";

const ESTILO_ESTATUS = {
  Activo: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  Inactivo: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

function datosBancariosTexto(datos) {
  if (!datos?.banco) return null;
  if (datos.banco === "Banregio") {
    return `Banregio · Cuenta ${datos.numero_cuenta ?? "—"}`;
  }
  return `${datos.banco} · CLABE ${datos.clabe ?? "—"}`;
}

function formularioDesdeProveedor(p) {
  const datos = p.datos_bancarios ?? {};
  return {
    razonSocial: p.razon_social ?? "",
    rfc: p.rfc ?? "",
    banco: datos.banco === "Otro" ? "Otro" : "Banregio",
    numeroCuenta: datos.numero_cuenta ?? "",
    clabe: datos.clabe ?? "",
  };
}

/** Directorio de proveedores: búsqueda, edición, activación/desactivación y eliminación segura. */
export default function DirectorioProveedores({ proveedores: proveedoresIniciales }) {
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [proveedorEnEdicion, setProveedorEnEdicion] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState("");
  const [modalImportAbierto, setModalImportAbierto] = useState(false);

  function importado() {
    setModalImportAbierto(false);
    getProveedores().then(setProveedores);
  }

  const proveedoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return proveedores;
    return proveedores.filter(
      (p) =>
        p.razon_social.toLowerCase().includes(termino) ||
        (p.rfc ?? "").toLowerCase().includes(termino)
    );
  }, [proveedores, busqueda]);

  function abrirEdicion(p) {
    setProveedorEnEdicion(p);
    setForm(formularioDesdeProveedor(p));
    setError("");
  }

  function cerrarEdicion() {
    setProveedorEnEdicion(null);
    setForm(null);
  }

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setError("");

    if (!form.razonSocial.trim()) return setError("Captura la razón social.");

    const datosBancarios =
      form.banco === "Banregio"
        ? { banco: "Banregio", numero_cuenta: form.numeroCuenta }
        : { banco: "Otro", clabe: form.clabe };

    setGuardando(true);
    const resultado = await actualizarProveedor(proveedorEnEdicion.id, {
      razonSocial: form.razonSocial,
      rfc: form.rfc,
      datosBancarios,
    });
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setProveedores((filas) =>
      filas.map((p) =>
        p.id === proveedorEnEdicion.id
          ? { ...p, razon_social: form.razonSocial.trim(), rfc: form.rfc?.trim() || null, datos_bancarios: datosBancarios }
          : p
      )
    );
    cerrarEdicion();
  }

  async function alternarEstatus(p) {
    const nuevoEstatus = p.estatus === "Activo" ? "Inactivo" : "Activo";
    setProcesandoId(p.id);
    setError("");

    const resultado = await cambiarEstatusProveedor(p.id, nuevoEstatus);
    setProcesandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setProveedores((filas) => filas.map((f) => (f.id === p.id ? { ...f, estatus: nuevoEstatus } : f)));
  }

  async function eliminar(p) {
    if (!window.confirm(`¿Eliminar al proveedor "${p.razon_social}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setProcesandoId(p.id);
    setError("");

    const resultado = await eliminarProveedor(p.id);
    setProcesandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setProveedores((filas) => filas.filter((f) => f.id !== p.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative sm:max-w-sm sm:flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Buscar por razón social o RFC…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded border border-black/[.08] bg-transparent py-2 pl-9 pr-3 text-sm dark:border-white/[.145]"
          />
        </div>

        <button
          type="button"
          onClick={() => setModalImportAbierto(true)}
          className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          <Upload size={15} /> Importar Proveedores desde Excel
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {proveedoresFiltrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          No se encontraron proveedores.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proveedoresFiltrados.map((p) => {
            const cuenta = datosBancariosTexto(p.datos_bancarios);
            const procesando = procesandoId === p.id;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-black dark:text-zinc-50">
                    {p.razon_social}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      ESTILO_ESTATUS[p.estatus] ?? ESTILO_ESTATUS.Activo
                    }`}
                  >
                    {p.estatus}
                  </span>
                </div>

                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {p.rfc || "RFC no registrado"}
                </span>

                {(p.contacto_nombre || p.contacto_telefono || p.contacto_email) && (
                  <div className="flex flex-col gap-1 border-t border-black/[.08] pt-3 text-xs text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                    {p.contacto_nombre && <span>{p.contacto_nombre}</span>}
                    {p.contacto_telefono && (
                      <span className="flex items-center gap-1.5">
                        <Phone size={12} /> {p.contacto_telefono}
                      </span>
                    )}
                    {p.contacto_email && (
                      <span className="flex items-center gap-1.5">
                        <Mail size={12} /> {p.contacto_email}
                      </span>
                    )}
                  </div>
                )}

                {cuenta && (
                  <div className="flex items-center gap-1.5 rounded border border-black/[.08] bg-black/[.03] px-2.5 py-2 text-xs text-zinc-600 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                    <Landmark size={13} /> {cuenta}
                  </div>
                )}

                <div className="flex items-center gap-2 border-t border-black/[.08] pt-3 dark:border-white/[.145]">
                  <button
                    type="button"
                    onClick={() => abrirEdicion(p)}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarEstatus(p)}
                    disabled={procesando}
                    className="flex items-center gap-1 text-xs font-medium text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
                  >
                    <Power size={12} /> {p.estatus === "Activo" ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminar(p)}
                    disabled={procesando}
                    className="ml-auto flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {proveedorEnEdicion && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={guardarEdicion}
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                Editar Proveedor
              </h3>
              <button
                type="button"
                onClick={cerrarEdicion}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Razón Social</label>
              <input
                type="text"
                className={inputClase}
                value={form.razonSocial}
                onChange={(e) => actualizarCampo("razonSocial", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>RFC (opcional)</label>
              <input
                type="text"
                className={`${inputClase} uppercase`}
                value={form.rfc}
                onChange={(e) => actualizarCampo("rfc", e.target.value.toUpperCase())}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Banco</label>
              <select
                className={inputClase}
                value={form.banco}
                onChange={(e) => actualizarCampo("banco", e.target.value)}
              >
                <option value="Banregio">Banregio</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            {form.banco === "Banregio" ? (
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Número de Cuenta</label>
                <input
                  type="text"
                  className={inputClase}
                  value={form.numeroCuenta}
                  onChange={(e) => actualizarCampo("numeroCuenta", e.target.value)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>CLABE Interbancaria (18 dígitos)</label>
                <input
                  type="text"
                  maxLength={18}
                  className={inputClase}
                  value={form.clabe}
                  onChange={(e) => actualizarCampo("clabe", e.target.value.replace(/\D/g, ""))}
                />
              </div>
            )}

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cerrarEdicion}
                disabled={guardando}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {guardando ? "Guardando…" : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {modalImportAbierto && (
        <ModalImportarProveedores onImportado={importado} onCerrar={() => setModalImportAbierto(false)} />
      )}
    </div>
  );
}
