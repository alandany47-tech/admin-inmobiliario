"use client";

import { AlertTriangle, X } from "lucide-react";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Modal de confirmación para aplicar en lote los cambios de presupuesto/renombre pendientes en el árbol WBS. */
export default function ModalConfirmarCambiosWbs({ cambios, procesando, error, onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Confirmar Cambios de Presupuesto WBS
          </h3>
          <button
            type="button"
            onClick={onCancelar}
            disabled={procesando}
            className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Se aplicarán {cambios.length} cambio{cambios.length === 1 ? "" : "s"} sobre el catálogo WBS:
        </p>

        <ul className="flex flex-col gap-3">
          {cambios.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 rounded border border-black/[.08] p-3 text-sm dark:border-white/[.145]"
            >
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {c.codigo ? `[${c.codigo}] ` : ""}
                {c.categoriaAnterior} — {c.partidaAnterior}
              </span>

              {c.presupuestoNuevo !== undefined && (
                <span className="flex items-center justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">Presupuesto</span>
                  <span className="font-medium">
                    {formatoMXN(c.presupuestoAnterior)} → {formatoMXN(c.presupuestoNuevo)}
                  </span>
                </span>
              )}

              {(c.categoriaNueva !== undefined || c.partidaNueva !== undefined) && (
                <span className="flex items-center justify-between gap-2">
                  <span className="text-zinc-600 dark:text-zinc-400">Renombre</span>
                  <span className="font-medium">
                    {c.categoriaNueva ?? c.categoriaAnterior} — {c.partidaNueva ?? c.partidaAnterior}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>

        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={14} /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={procesando}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={procesando}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {procesando ? "Guardando…" : "Confirmar y Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
