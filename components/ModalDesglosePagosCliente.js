"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getDesglosePagosCliente } from "@/app/actions/cobranza";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  if (!fecha) return "—";
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const BADGE_ESTATUS = {
  Pendiente: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Parcial: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  Pagado: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  Vencido: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

/** Modal de desglose del plan de pagos de un cliente, a través de todos sus contratos. */
export default function ModalDesglosePagosCliente({ clienteId, titulo, open, onClose }) {
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!open || !clienteId) return;
    let vigente = true;
    setCargando(true);
    getDesglosePagosCliente(clienteId).then((data) => {
      if (vigente) {
        setContratos(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [open, clienteId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Detalle de Pagos — {titulo}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        {cargando ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
        ) : contratos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            Este cliente no tiene contratos registrados.
          </p>
        ) : (
          contratos.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-black dark:text-zinc-50">
                  Unidad {c.unidades?.codigo_unidad} — Contrato {formatoFecha(c.fecha_contrato)}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">{formatoMXN(c.monto_total_venta)}</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="border-b border-black/[.08] bg-black/[.03] text-left font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Fecha Programada</th>
                      <th className="px-3 py-2 text-right">Programado</th>
                      <th className="px-3 py-2 text-right">Pagado</th>
                      <th className="px-3 py-2">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(c.planes_pago_cobranza ?? [])
                      .sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada))
                      .map((p) => (
                        <tr key={p.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                          <td className="px-3 py-2">{p.tipo_pago}</td>
                          <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                            {formatoFecha(p.fecha_programada)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatoMXN(p.monto_programado)}</td>
                          <td className="px-3 py-2 text-right">{formatoMXN(p.monto_pagado)}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_ESTATUS[p.estatus] ?? ""}`}>
                              {p.estatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
