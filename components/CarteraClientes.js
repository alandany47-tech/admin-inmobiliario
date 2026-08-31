"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import ModalDesglosePagosCliente from "@/components/ModalDesglosePagosCliente";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Directorio de clientes y cartera: venta acumulada, cobrado, saldo pendiente y días de mora. */
export default function CarteraClientes({ clientes }) {
  const [detalle, setDetalle] = useState(null);

  if (clientes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
        No hay clientes con contratos de venta registrados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Contratos</th>
              <th className="px-4 py-3 text-right">Venta Total</th>
              <th className="px-4 py-3 text-right">Cobrado</th>
              <th className="px-4 py-3 text-right">Saldo Pendiente</th>
              <th className="px-4 py-3 text-right">Días de Mora</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-black dark:text-zinc-50">{c.nombre}</span>
                    {c.rfc && <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{c.rfc}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{c.cantidadContratos}</td>
                <td className="px-4 py-3 text-right">{formatoMXN(c.ventaTotal)}</td>
                <td className="px-4 py-3 text-right">{formatoMXN(c.cobrado)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatoMXN(c.saldoPendiente)}</td>
                <td className="px-4 py-3 text-right">
                  {c.diasMora > 0 ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                      {c.diasMora} días
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                      Al día
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setDetalle(c)}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                  >
                    <Eye size={13} /> Ver Detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalDesglosePagosCliente
        clienteId={detalle?.id ?? null}
        titulo={detalle?.nombre ?? ""}
        open={detalle !== null}
        onClose={() => setDetalle(null)}
      />
    </div>
  );
}
