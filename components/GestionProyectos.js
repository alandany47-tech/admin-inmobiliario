"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { crearProyecto, actualizarProyecto, eliminarProyecto } from "@/app/actions/proyectos";

const FORM_VACIO = {
  codigo: "",
  nombre: "",
  presupuesto: "",
  logoProyectoUrl: "",
  colorPrimario: "#0f172a",
  colorSecundario: "#2563eb",
  estatus: "En Desarrollo",
};
const ESTATUS_PROYECTO = ["En Desarrollo", "Concluido", "Archivado"];
const BADGE_ESTATUS_PROYECTO = {
  "En Desarrollo": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  Concluido: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  Archivado: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Alta, edición y baja de proyectos, con presupuesto/ejercido/partidas WBS agregados por proyecto. */
export default function GestionProyectos({ proyectosIniciales }) {
  const [proyectos, setProyectos] = useState(proyectosIniciales);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState("");

  function abrirNuevo() {
    setModal("nuevo");
    setForm(FORM_VACIO);
    setError("");
  }

  function abrirEdicion(p) {
    setModal(p);
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      presupuesto: String(p.presupuesto),
      logoProyectoUrl: p.logoProyectoUrl ?? "",
      colorPrimario: p.colorPrimario ?? "#0f172a",
      colorSecundario: p.colorSecundario ?? "#2563eb",
      estatus: p.estatus ?? "En Desarrollo",
    });
    setError("");
  }

  function cerrarModal() {
    setModal(null);
    setForm(FORM_VACIO);
  }

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);

    const esNuevo = modal === "nuevo";
    const resultado = esNuevo
      ? await crearProyecto(form)
      : await actualizarProyecto(modal.id, form);

    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    if (esNuevo) {
      setProyectos((filas) => [
        ...filas,
        {
          id: resultado.proyecto.id,
          codigo: resultado.proyecto.codigo,
          nombre: resultado.proyecto.nombre,
          presupuesto: Number(resultado.proyecto.presupuesto),
          totalPagado: 0,
          totalPartidasWbs: 0,
          logoProyectoUrl: resultado.proyecto.logo_proyecto_url,
          colorPrimario: resultado.proyecto.color_primario,
          colorSecundario: resultado.proyecto.color_secundario,
          estatus: resultado.proyecto.estatus,
        },
      ]);
    } else {
      setProyectos((filas) =>
        filas.map((f) =>
          f.id === modal.id
            ? {
                ...f,
                codigo: form.codigo.trim().toUpperCase(),
                nombre: form.nombre.trim(),
                presupuesto: Number(form.presupuesto),
                logoProyectoUrl: form.logoProyectoUrl?.trim() || null,
                colorPrimario: form.colorPrimario,
                colorSecundario: form.colorSecundario,
                estatus: form.estatus,
              }
            : f
        )
      );
    }

    cerrarModal();
  }

  async function eliminar(p) {
    if (!window.confirm(`¿Eliminar el proyecto "${p.codigo} — ${p.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setProcesandoId(p.id);
    setError("");
    const resultado = await eliminarProyecto(p.id);
    setProcesandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setProyectos((filas) => filas.filter((f) => f.id !== p.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={abrirNuevo}
          className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          <Plus size={15} /> Nuevo Proyecto
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {proyectos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          No hay proyectos registrados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                <th className="py-3 pr-4 pl-4">Código</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3 text-right">Presupuesto</th>
                <th className="px-4 py-3 text-right">Total Pagado</th>
                <th className="px-4 py-3 text-right">Disponible</th>
                <th className="px-4 py-3 text-right">Partidas WBS</th>
                <th className="px-4 py-3">Estatus</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => {
                const disponible = p.presupuesto - p.totalPagado;
                const procesando = procesandoId === p.id;
                return (
                  <tr key={p.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                    <td className="py-2.5 pr-4 pl-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {p.codigo}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-black dark:text-zinc-50">{p.nombre}</td>
                    <td className="px-4 py-2.5 text-right">{formatoMXN(p.presupuesto)}</td>
                    <td className="px-4 py-2.5 text-right">{formatoMXN(p.totalPagado)}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        disponible < 0 ? "text-red-600 dark:text-red-400" : ""
                      }`}
                    >
                      {formatoMXN(disponible)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{p.totalPartidasWbs}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          BADGE_ESTATUS_PROYECTO[p.estatus] ?? ""
                        }`}
                      >
                        {p.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => abrirEdicion(p)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminar(p)}
                          disabled={procesando}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={guardar}
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                {modal === "nuevo" ? "Nuevo Proyecto" : "Editar Proyecto"}
              </h3>
              <button
                type="button"
                onClick={cerrarModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Código (ej. PIA, FCH)</label>
              <input
                type="text"
                maxLength={10}
                className={`${inputClase} uppercase`}
                value={form.codigo}
                onChange={(e) => actualizarCampo("codigo", e.target.value.toUpperCase())}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Nombre del Proyecto</label>
              <input
                type="text"
                className={inputClase}
                value={form.nombre}
                onChange={(e) => actualizarCampo("nombre", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Presupuesto Total</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={form.presupuesto}
                onChange={(e) => actualizarCampo("presupuesto", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Logo del Proyecto (URL)</label>
              <input
                type="text"
                placeholder="https://…"
                className={inputClase}
                value={form.logoProyectoUrl}
                onChange={(e) => actualizarCampo("logoProyectoUrl", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Color Primario</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 rounded border border-black/[.08] bg-transparent dark:border-white/[.145]"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.colorPrimario) ? form.colorPrimario : "#0f172a"}
                    onChange={(e) => actualizarCampo("colorPrimario", e.target.value)}
                  />
                  <input
                    type="text"
                    className={`${inputClase} flex-1`}
                    value={form.colorPrimario}
                    onChange={(e) => actualizarCampo("colorPrimario", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Color Secundario</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 rounded border border-black/[.08] bg-transparent dark:border-white/[.145]"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.colorSecundario) ? form.colorSecundario : "#2563eb"}
                    onChange={(e) => actualizarCampo("colorSecundario", e.target.value)}
                  />
                  <input
                    type="text"
                    className={`${inputClase} flex-1`}
                    value={form.colorSecundario}
                    onChange={(e) => actualizarCampo("colorSecundario", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Estatus</label>
              <select
                className={inputClase}
                value={form.estatus}
                onChange={(e) => actualizarCampo("estatus", e.target.value)}
              >
                {ESTATUS_PROYECTO.map((es) => (
                  <option key={es} value={es}>
                    {es}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cerrarModal}
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
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
