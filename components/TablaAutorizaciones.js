"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import { cambiarEstadoSolicitud } from "@/app/actions/autorizaciones";
import ModalVisorPDF from "@/components/ModalVisorPDF";

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** Tabla de autorización de solicitudes de pago con acciones de estado por renglón. */
export default function TablaAutorizaciones({ solicitudes: solicitudesIniciales }) {
  const [solicitudes, setSolicitudes] = useState(solicitudesIniciales);
  const [enProceso, setEnProceso] = useState(null);
  const [error, setError] = useState("");
  const [pdfSolicitudId, setPdfSolicitudId] = useState(null);
  const [isPending, startTransition] = useTransition();

  function actualizarEstado(id, nuevoEstado) {
    setEnProceso(id);
    setError("");
    startTransition(async () => {
      const resultado = await cambiarEstadoSolicitud(id, nuevoEstado);
      if (resultado.error) {
        setError(resultado.error);
      } else {
        setSolicitudes((filas) => filas.filter((f) => f.id !== id));
      }
      setEnProceso(null);
    });
  }

  if (solicitudes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
        No hay solicitudes por autorizar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Método de Pago</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => {
              const deshabilitado = isPending && enProceso === s.id;
              return (
                <tr
                  key={s.id}
                  className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]"
                >
                  <td className="px-4 py-3 font-mono">
                    <button
                      type="button"
                      onClick={() => setPdfSolicitudId(s.id)}
                      className="flex items-center gap-1.5 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <FileText size={14} /> {s.folio}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatoFecha(s.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {s.proyectos?.codigo} — {s.proyectos?.nombre}
                  </td>
                  <td className="px-4 py-3">{s.proveedores?.razon_social}</td>
                  <td className="px-4 py-3">{s.metodo_pago}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatoMXN(s.total)}</td>
                  <td className="px-4 py-3">{s.solicitante}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={() => actualizarEstado(s.id, "Autorizado")}
                        className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} /> Autorizar
                      </button>
                      <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={() => actualizarEstado(s.id, "Pospuesto")}
                        className="flex items-center gap-1 rounded-full border border-black/[.08] px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                      >
                        <Clock size={13} /> Posponer
                      </button>
                      <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={() => actualizarEstado(s.id, "Cancelado")}
                        className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        <XCircle size={13} /> Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ModalVisorPDF
        solicitudId={pdfSolicitudId}
        open={pdfSolicitudId !== null}
        onClose={() => setPdfSolicitudId(null)}
      />
    </div>
  );
}
