"use client";

import { useState } from "react";
import { AlertTriangle, Download, Upload, X } from "lucide-react";
import {
  previsualizarImportSolicitudesHistoricas,
  aplicarImportSolicitudesHistoricas,
} from "@/app/actions/solicitudesHistoricas";
import { descargarPlantillaExcel } from "@/lib/plantillasExcel";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const COLUMNAS_PLANTILLA = [
  "Proyecto",
  "Proveedor",
  "RFC",
  "Concepto",
  "Subtotal",
  "IVA",
  "Total",
  "Fecha de Pago",
  "Método de Pago",
  "Solicitante",
  "# Factura",
  "Categoría WBS",
  "Partida WBS",
];

/** Modal de carga histórica de solicitudes ya pagadas (fuera de este sistema) por Excel: parsea, previsualiza y aplica. */
export default function ModalImportarSolicitudesHistoricas({ onImportado, onCerrar }) {
  const [diff, setDiff] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

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
        proyecto: f["Proyecto"] ?? f.proyecto ?? "",
        proveedor: f["Proveedor"] ?? f["Razón Social"] ?? f.proveedor ?? "",
        rfc: f["RFC"] ?? f.rfc ?? "",
        concepto: f["Concepto"] ?? f.concepto ?? "",
        subtotal: f["Subtotal"] ?? f.subtotal ?? "",
        iva: f["IVA"] ?? f.iva ?? "",
        total: f["Total"] ?? f.total ?? "",
        fechaPago: f["Fecha de Pago"] ?? f["Fecha"] ?? f.fechaPago ?? "",
        metodoPago: f["Método de Pago"] ?? f["Metodo de Pago"] ?? f.metodoPago ?? "",
        solicitante: f["Solicitante"] ?? f.solicitante ?? "",
        numFactura: f["# Factura"] ?? f["Factura"] ?? f.numFactura ?? "",
        wbsCategoria: f["Categoría WBS"] ?? f["Categoria WBS"] ?? f.wbsCategoria ?? "",
        wbsPartida: f["Partida WBS"] ?? f.wbsPartida ?? "",
      }));

      const resultadoPreview = await previsualizarImportSolicitudesHistoricas(normalizadas);
      if (resultadoPreview.error) {
        setError(resultadoPreview.error);
      } else {
        setDiff(resultadoPreview);
      }
    } catch {
      setError("No se pudo leer el archivo. Verifica el formato.");
    }
    setProcesando(false);
  }

  async function confirmar() {
    setProcesando(true);
    setError("");
    const res = await aplicarImportSolicitudesHistoricas(diff.validas);
    setProcesando(false);
    if (res.error) {
      setError(res.error);
    } else {
      setResultado(res);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Importar Solicitudes Pagadas Históricas
          </h3>
          <button type="button" onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        {resultado ? (
          <>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Se importaron {resultado.cantidad} solicitud{resultado.cantidad === 1 ? "" : "es"} histórica
              {resultado.cantidad === 1 ? "" : "s"} como Pagadas.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onImportado}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background dark:hover:bg-[#ccc]"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            {!diff && (
              <button
                type="button"
                onClick={() =>
                  descargarPlantillaExcel("plantilla-solicitudes-historicas.xlsx", COLUMNAS_PLANTILLA)
                }
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
                  : "Selecciona un archivo .xlsx (columnas: Proyecto, Proveedor, RFC, Concepto, Subtotal, IVA, Total, Fecha de Pago, Método de Pago, Categoría WBS, Partida WBS)"}
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

            {diff && (
              <div className="flex flex-col gap-5">
                {diff.validas.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                      Listas para importar ({diff.validas.length})
                    </h4>
                    <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
                      {diff.validas.map((v, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="truncate">
                            {v.proyectoCodigo} — {v.proveedorNuevo ? `${v.proveedorNuevo.razonSocial} (nuevo)` : "proveedor existente"}
                          </span>
                          <span className="shrink-0 font-medium">{formatoMXN(v.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {diff.invalidas.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                      Filas inválidas, se ignoran ({diff.invalidas.length})
                    </h4>
                    <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm text-zinc-500 dark:text-zinc-400">
                      {diff.invalidas.map((inv, i) => (
                        <li key={i}>
                          Fila {inv.fila}: {inv.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
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
                    disabled={procesando || diff.validas.length === 0}
                    className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
                  >
                    {procesando ? "Importando…" : `Confirmar importación (${diff.validas.length})`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
