"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { actualizarCliente } from "@/app/actions/clientes";

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Modal de edición del directorio completo de un cliente. */
export default function ModalEditarCliente({ cliente, onGuardado, onCerrar }) {
  const [form, setForm] = useState({
    nombre: cliente.nombre ?? "",
    rfc: cliente.rfc ?? "",
    telefono: cliente.telefono ?? "",
    email: cliente.email ?? "",
    direccion: cliente.direccion ?? "",
    contactoSecundario: cliente.contactoSecundario ?? "",
    notas: cliente.notas ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim()) {
      setError("Captura el nombre o razón social.");
      return;
    }

    setGuardando(true);
    const resultado = await actualizarCliente(cliente.id, form);
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    onGuardado(resultado.cliente);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={guardar}
        className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Editar Cliente</h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Nombre / Razón Social</label>
          <input
            type="text"
            className={inputClase}
            value={form.nombre}
            onChange={(e) => actualizarCampo("nombre", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>RFC</label>
            <input
              type="text"
              className={`${inputClase} uppercase`}
              value={form.rfc}
              onChange={(e) => actualizarCampo("rfc", e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Teléfono</label>
            <input
              type="text"
              className={inputClase}
              value={form.telefono}
              onChange={(e) => actualizarCampo("telefono", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Email</label>
          <input
            type="email"
            className={inputClase}
            value={form.email}
            onChange={(e) => actualizarCampo("email", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Dirección Fiscal</label>
          <input
            type="text"
            className={inputClase}
            value={form.direccion}
            onChange={(e) => actualizarCampo("direccion", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Contacto Secundario</label>
          <input
            type="text"
            className={inputClase}
            value={form.contactoSecundario}
            onChange={(e) => actualizarCampo("contactoSecundario", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Notas</label>
          <textarea
            rows={3}
            className={inputClase}
            value={form.notas}
            onChange={(e) => actualizarCampo("notas", e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
