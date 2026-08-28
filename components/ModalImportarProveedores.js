"use client";

import { useState } from "react";
import { AlertTriangle, Upload, X } from "lucide-react";
import { previsualizarImportProveedores, aplicarImportProveedores } from "@/app/actions/proveedores";

/** Modal de carga masiva de proveedores por Excel/CSV: parsea el archivo, previsualiza el diff y lo aplica. */
export default function ModalImportarProveedores({ onImportado, onCerrar }) {
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
        razonSocial: f["Razón Social"] ?? f["Razon Social"] ?? f.razonSocial ?? "",
        rfc: f["RFC"] ?? f.rfc ?? "",
        banco: f["Banco"] ?? f.banco ?? "",
        cuenta: f["Cuenta / CLABE"] ?? f["Cuenta/CLABE"] ?? f["Cuenta"] ?? f["CLABE"] ?? f.cuenta ?? "",
        contactoNombre: f["Contacto Nombre"] ?? f["Contacto"] ?? f.contactoNombre ?? "",
        telefono: f["Teléfono"] ?? f["Telefono"] ?? f.telefono ?? "",
        email: f["Email"] ?? f["Correo"] ?? f.email ?? "",
      }));

      const resultado = await previsualizarImportProveedores(normalizadas);
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
    const resultado = await aplicarImportProveedores(diff);
    setProcesando(false);
    if (resultado.error) {
      setError(resultado.error);
    } else {
      onImportado();
    }
  }

  const hayCambios =
    diff && (diff.nuevos.length > 0 || diff.actualizados.length > 0);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Importar Proveedores desde Excel
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
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 hover:bg-black/[.02] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.03]">
            <Upload size={20} />
            {procesando
              ? "Procesando…"
              : "Selecciona un archivo .xlsx o .csv (columnas: Razón Social, RFC, Banco, Cuenta / CLABE, Contacto Nombre, Teléfono, Email)"}
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
            {diff.nuevos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                  Altas nuevas ({diff.nuevos.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {diff.nuevos.map((n, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{n.razonSocial}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{n.rfc ?? "Sin RFC"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.actualizados.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                  Coinciden por RFC, se actualizarán ({diff.actualizados.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {diff.actualizados.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3">
                      <span>{a.razonSocial}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{a.rfc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.duplicados.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Duplicados en el archivo, se ignoran ({diff.duplicados.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {diff.duplicados.map((d, i) => (
                    <li key={i}>
                      Fila {d.fila}: {d.razonSocial} ({d.rfc}) — {d.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diff.invalidos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                  Filas inválidas, se ignoran ({diff.invalidos.length})
                </h4>
                <ul className="flex flex-col gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {diff.invalidos.map((inv, i) => (
                    <li key={i}>
                      Fila {inv.fila}: {inv.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!hayCambios && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No hay altas ni actualizaciones que aplicar.
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
