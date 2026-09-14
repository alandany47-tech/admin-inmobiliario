"use client";

import { useMemo, useState } from "react";
import { FileText, X } from "lucide-react";
import { crearSolicitudPago, subirXmlFactura } from "@/app/actions/solicitudes";

const METODOS_PAGO = ["Transferencia bancaria", "Efectivo"];

const FORM_VACIO = {
  proyectoId: "",
  proveedorId: "",
  metodoPago: METODOS_PAGO[0],
  solicitante: "",
  wbsCategoria: "",
  wbsPartida: "",
  wbsCatalogId: null,
  descripcion: "",
  monto: "",
};

function proximoViernesISO() {
  const hoy = new Date();
  const diasHastaViernes = ((5 - hoy.getDay() + 7) % 7) || 7;
  const viernes = new Date(hoy);
  viernes.setDate(hoy.getDate() + diasHastaViernes);
  return viernes.toISOString().slice(0, 10);
}

/** Modal de alta rápida de solicitudes desde el Panel Control Maestro. */
export default function ModalSolicitudRapida({ proyectos, proveedores, wbsCatalog, onCreada, onCerrar }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [aplicaIva, setAplicaIva] = useState(true);
  const [xmlArchivo, setXmlArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const wbsDisponible = useMemo(
    () =>
      wbsCatalog.filter(
        (w) => w.proyecto_id === null || String(w.proyecto_id) === form.proyectoId
      ),
    [wbsCatalog, form.proyectoId]
  );
  const categoriasWbs = useMemo(
    () => [...new Set(wbsDisponible.map((w) => w.categoria))],
    [wbsDisponible]
  );
  const partidasWbs = useMemo(
    () => wbsDisponible.filter((w) => w.categoria === form.wbsCategoria).map((w) => w.partida),
    [wbsDisponible, form.wbsCategoria]
  );

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function actualizarWbsPartida(valor) {
    const entrada = wbsDisponible.find(
      (w) => w.categoria === form.wbsCategoria && w.partida === valor
    );
    setForm((f) => ({ ...f, wbsPartida: valor, wbsCatalogId: entrada?.id ?? null }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.proyectoId) return setError("Selecciona un proyecto.");
    if (!form.proveedorId) return setError("Selecciona un proveedor.");
    if (!form.solicitante.trim()) return setError("Captura el solicitante.");
    if (!form.descripcion.trim()) return setError("Captura la descripción.");
    const monto = parseFloat(form.monto);
    if (!(monto > 0)) return setError("Captura un monto válido.");

    setEnviando(true);

    const subtotal = Math.round(monto * 100) / 100;
    const iva = aplicaIva ? Math.round(subtotal * 0.16 * 100) / 100 : 0;
    const total = Math.round((subtotal + iva) * 100) / 100;

    const resultado = await crearSolicitudPago({
      proyectoId: Number(form.proyectoId),
      proveedor: { id: Number(form.proveedorId) },
      metodoPago: form.metodoPago,
      solicitante: form.solicitante,
      numFactura: "",
      wbsCategoria: form.wbsCategoria,
      wbsPartida: form.wbsPartida,
      wbsCatalogId: form.wbsCatalogId,
      partidas: [
        { cantidad: 1, descripcion: form.descripcion.trim(), precio_unitario: subtotal, subtotal },
      ],
      aplicaIva,
      subtotal,
      iva,
      total,
      fechaProgramada: proximoViernesISO(),
    });

    setEnviando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    if (xmlArchivo) {
      const xmlTexto = await xmlArchivo.text();
      const resultadoXml = await subirXmlFactura(resultado.id, xmlTexto);
      if (resultadoXml.error) {
        window.alert(`La solicitud se creó, pero no se pudo guardar el XML: ${resultadoXml.error}`);
      }
    }

    onCreada();
  }

  const inputClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
  const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Solicitud Rápida
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Proyecto</label>
            <select
              className={inputClase}
              value={form.proyectoId}
              onChange={(e) => actualizarCampo("proyectoId", e.target.value)}
            >
              <option value="">Selecciona…</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Proveedor</label>
            <select
              className={inputClase}
              value={form.proveedorId}
              onChange={(e) => actualizarCampo("proveedorId", e.target.value)}
            >
              <option value="">Selecciona…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Método de Pago</label>
            <select
              className={inputClase}
              value={form.metodoPago}
              onChange={(e) => actualizarCampo("metodoPago", e.target.value)}
            >
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Solicitante</label>
            <input
              type="text"
              maxLength={10}
              placeholder="Ej. AB"
              className={inputClase}
              value={form.solicitante}
              onChange={(e) => actualizarCampo("solicitante", e.target.value.toUpperCase())}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>WBS Categoría</label>
            <select
              className={inputClase}
              value={form.wbsCategoria}
              onChange={(e) =>
                setForm((f) => ({ ...f, wbsCategoria: e.target.value, wbsPartida: "", wbsCatalogId: null }))
              }
            >
              <option value="">Selecciona…</option>
              {categoriasWbs.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>WBS Partida</label>
            <select
              className={inputClase}
              value={form.wbsPartida}
              onChange={(e) => actualizarWbsPartida(e.target.value)}
              disabled={!form.wbsCategoria}
            >
              <option value="">Selecciona…</option>
              {partidasWbs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Descripción</label>
          <input
            type="text"
            className={inputClase}
            value={form.descripcion}
            onChange={(e) => actualizarCampo("descripcion", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Monto (subtotal)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClase}
              value={form.monto}
              onChange={(e) => actualizarCampo("monto", e.target.value)}
            />
          </div>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={aplicaIva}
              onChange={(e) => setAplicaIva(e.target.checked)}
            />
            Aplica IVA (16%)
          </label>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {enviando ? "Guardando…" : "Crear Solicitud"}
          </button>
        </div>
      </form>
    </div>
  );
}
