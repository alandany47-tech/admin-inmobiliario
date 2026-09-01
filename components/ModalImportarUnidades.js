"use client";

import { useState } from "react";
import { AlertTriangle, Upload, X } from "lucide-react";
import { importarUnidadesMasivo } from "@/app/actions/unidades";

/** Modal de carga masiva de unidades por Excel/CSV: parsea el archivo y hace upsert por (proyecto, código). */
export default function ModalImportarUnidades({ proyectoId, onImportado, onCerrar }) {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  async function manejarArchivo(archivo) {
    if (!archivo) return;
    setError("");
    setResultado(null);
    setProcesando(true);

    try {
      const XLSX = await import("xlsx");
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

      const normalizadas = filas.map((f) => ({
        codigoUnidad: f["Codigo Unidad"] ?? f["Código Unidad"] ?? f.codigoUnidad ?? "",
        tipoUso: f["Tipo Uso"] ?? f.tipoUso ?? "",
        superficieM2: f["Superficie m2"] ?? f["Superficie m²"] ?? f.superficieM2 ?? 0,
        precioM2: f["Precio m2"] ?? f["Precio m²"] ?? f.precioM2 ?? 0,
        montoLista: f["Monto Lista"] ?? f.montoLista ?? "",
        estatus: f["Estatus"] ?? f.estatus ?? "",
      }));

      const resultadoImport = await importarUnidadesMasivo(proyectoId, normalizadas);
      if (resultadoImport.error) {
        setError(resultadoImport.error);
      } else {
        setResultado(resultadoImport);
      }
    } catch {
      setError("No se pudo leer el archivo. Verifica el formato.");
    }
    setProcesando(false);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Importar Unidades desde Excel</h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        {!resultado && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 hover:bg-black/[.02] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.03]">
            <Upload size={20} />
            {procesando
              ? "Procesando…"
              : "Selecciona un archivo .xlsx o .csv (columnas: Codigo Unidad, Tipo Uso, Superficie m2, Precio m2, Monto Lista, Estatus)"}
            <input
              type="file"
              accept=".xlsx,.csv"
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

        {resultado && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-green-700 dark:text-green-400">
              Se importaron/actualizaron {resultado.importadas} unidad(es).
            </p>

            {resultado.invalidas.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Filas ignoradas ({resultado.invalidas.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {resultado.invalidas.map((inv, i) => (
                    <li key={i}>
                      Fila {inv.fila}: {inv.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onImportado}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background dark:hover:bg-[#ccc]"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
