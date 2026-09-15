"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { autorizarOrdenCambioWbs } from "@/app/actions/wbs";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Tabla de autorización de Órdenes de Cambio de presupuesto WBS. Quien
 * propuso una orden no puede autorizarla (la RPC lo bloquea server-side); en
 * ese caso el renglón solo deja "Rechazar" (cancelarla) habilitado.
 */
export default function TablaOrdenesCambioWbs({ ordenes: ordenesIniciales, usuarioActualId, esAdmin }) {
  const [ordenes, setOrdenes] = useState(ordenesIniciales);
  const [enProceso, setEnProceso] = useState(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function resolver(id, nuevoEstado) {
    setEnProceso(id);
    setError("");
    startTransition(async () => {
      const resultado = await autorizarOrdenCambioWbs(id, nuevoEstado);
      if (resultado.error) {
        setError(resultado.error);
      } else {
        setOrdenes((filas) => filas.filter((f) => f.id !== id));
      }
      setEnProceso(null);
    });
  }

  if (ordenes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
        No hay órdenes de cambio por autorizar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Partida</th>
              <th className="px-4 py-3 text-right">Presupuesto</th>
              <th className="px-4 py-3">Comentario / OC</th>
              <th className="px-4 py-3">Solicitó</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => {
              const deshabilitado = isPending && enProceso === o.id;
              const propia = o.solicitado_por === usuarioActualId;
              return (
                <tr key={o.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatoFecha(o.created_at)}</td>
                  <td className="px-4 py-3">
                    {o.wbs_catalog?.proyectos?.codigo} — {o.wbs_catalog?.proyectos?.nombre}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {o.wbs_catalog?.codigo ? `[${o.wbs_catalog.codigo}] ` : ""}
                    </span>
                    {o.wbs_catalog?.categoria} — {o.wbs_catalog?.partida}
                    {(o.cantidad_nueva != null || o.precio_unitario_nuevo != null || o.unidad_nueva) && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {o.cantidad_nueva ?? "—"} {o.unidad_nueva || ""}
                        {o.precio_unitario_nuevo != null && ` × ${formatoMXN(o.precio_unitario_nuevo)}`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium">
                      {formatoMXN(o.presupuesto_anterior)} → {formatoMXN(o.presupuesto_nuevo)}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[240px] truncate" title={o.comentario}>
                    {o.comentario}
                  </td>
                  <td className="px-4 py-3">
                    {o.solicitante?.nombre ?? "—"}
                    {propia && (
                      <span className="ml-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        Tuya
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={deshabilitado || (propia && !esAdmin)}
                        title={
                          propia && !esAdmin ? "No puedes autorizar tu propia orden de cambio" : "Autorizar"
                        }
                        onClick={() => resolver(o.id, "Autorizado")}
                        className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} /> Autorizar
                      </button>
                      <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={() => resolver(o.id, "Rechazado")}
                        className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        <XCircle size={13} /> {propia ? "Cancelar" : "Rechazar"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
