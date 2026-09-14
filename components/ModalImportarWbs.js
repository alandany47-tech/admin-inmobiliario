"use client";

import { useState } from "react";
import { AlertTriangle, Download, Upload, X } from "lucide-react";
import { previsualizarImportWbs, aplicarImportWbs } from "@/app/actions/wbs";
import { descargarPlantillaExcel } from "@/lib/plantillasExcel";

const COLUMNAS_PLANTILLA = ["Categoría", "Partida", "Presupuesto"];

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Modal de import de WBS por Excel: parsea el archivo, previsualiza el diff y lo aplica. */
export default function ModalImportarWbs({ proyectoId, onImportado, onCerrar }) {
  const [diff, setDiff] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  async function manejarArchivo(archivo) {
    if (!archivo) return;
    setError("");
    setProcesando(true);

    try {
      const XLSX = await import("xlsx");
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

      const normalizadas = filas.map((f) => ({
        categoria: f.categoria ?? f["Categoría"] ?? f["Categoria"] ?? "",
        partida: f.partida ?? f["Partida"] ?? "",
        presupuesto: f.presupuesto ?? f["Presupuesto"] ?? 0,
      }));

      const resultado = await previsualizarImportWbs(proyectoId, normalizadas);
      if (resultado.error) {
        setError(resultado.error);
      } else {
        setDiff(resultado);
      }
    } catch {
      setError("No se pudo leer el archivo. Verifica el formato.");
    }
    setProcesando(false);
  }

  async function confirmar() {
    setProcesando(true);
    setError("");
    const resultado = await aplicarImportWbs(proyectoId, diff);
    setProcesando(false);
    if (resultado.error) {
      setError(resultado.error);
    } else {
      onImportado();
    }
  }

  const hayCambios =
    diff && (diff.nuevas.length > 0 || diff.actualizadas.length > 0 || diff.noVienen.length > 0);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Importar WBS desde Excel
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        {!diff && (
          <button
            type="button"
            onClick={() => descargarPlantillaExcel("plantilla-wbs.xlsx", COLUMNAS_PLANTILLA)}
            className="flex w-fit items-center gap-1.5 rounded-md border border-black/[.08] px-2 py-1 text-xs shadow-sm hover:bg-zinc-100 dark:border-white/[.145] dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <Download size={13} /> Descargar Plantilla Excel
          </button>
        )}

        {!diff && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 hover:bg-black/[.02] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.03]">
            <Upload size={20} />
            {procesando
              ? "Procesando…"
              : "Selecciona un archivo .xlsx (columnas: categoría, partida, presupuesto)"}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={procesando}
              onChange={(e) => manejarArchivo(e.target.files?.[0])}
            />
          </label>
        )}

        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={14} /> {error}
          </p>
        )}

        {diff && (
          <div className="flex flex-col gap-5">
            {diff.nuevas.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                  Partidas nuevas ({diff.nuevas.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {diff.nuevas.map((n, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {n.categoria} — {n.partida}
                      </span>
                      <span className="font-medium">{formatoMXN(n.presupuesto)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.actualizadas.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                  Presupuesto a actualizar ({diff.actualizadas.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {diff.actualizadas.map((a, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {a.categoria} — {a.partida}
                      </span>
                      <span className="font-medium">
                        {formatoMXN(a.presupuestoAnterior)} → {formatoMXN(a.presupuestoNuevo)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.noVienen.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Ya no vienen en el archivo ({diff.noVienen.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {diff.noVienen.map((n) => (
                    <li key={n.id} className="flex justify-between">
                      <span>
                        {n.categoria} — {n.partida}
                      </span>
                      <span
                        className={
                          n.bloqueada
                            ? "text-red-600 dark:text-red-400"
                            : "text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {n.bloqueada ? "No se puede desactivar: tiene pagos asociados" : "Se desactivará"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!hayCambios && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No hay cambios que aplicar: el archivo coincide con el catálogo actual.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCerrar}
                disabled={procesando}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={procesando || !hayCambios}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {procesando ? "Aplicando…" : "Aplicar cambios"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
