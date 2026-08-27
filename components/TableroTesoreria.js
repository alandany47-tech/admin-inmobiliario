"use client";

import { useState } from "react";
import { Landmark, Wallet, X } from "lucide-react";
import { procesarPagoSolicitud } from "@/app/actions/tesoreria";

const ICONO_POR_TIPO = {
  Efectivo: Wallet,
  "Transferencia bancaria": Landmark,
};

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Tablero de tesorería: saldos por cuenta y dispersión de pagos autorizados. */
export default function TableroTesoreria({ cuentas: cuentasIniciales, solicitudes: solicitudesIniciales }) {
  const [cuentas, setCuentas] = useState(cuentasIniciales);
  const [solicitudes, setSolicitudes] = useState(solicitudesIniciales);
  const [solicitudActiva, setSolicitudActiva] = useState(null);
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  function abrirModal(solicitud) {
    setSolicitudActiva(solicitud);
    setFechaPago(hoyISO());
    setError("");
  }

  function cerrarModal() {
    setSolicitudActiva(null);
    setError("");
  }

  async function confirmarPago() {
    setProcesando(true);
    setError("");

    const resultado = await procesarPagoSolicitud(solicitudActiva.id, fechaPago);

    if (resultado.error) {
      setError(resultado.error);
      setProcesando(false);
      return;
    }

    const cuentaId = cuentas.find((c) => c.tipo === solicitudActiva.metodo_pago)?.id;
    setCuentas((filas) =>
      filas.map((c) =>
        c.id === cuentaId ? { ...c, saldo_actual: c.saldo_actual - solicitudActiva.total } : c
      )
    );
    setSolicitudes((filas) => filas.filter((s) => s.id !== solicitudActiva.id));
    setProcesando(false);
    setSolicitudActiva(null);
  }

  const cuentaAsignada = solicitudActiva
    ? cuentas.find((c) => c.tipo === solicitudActiva.metodo_pago)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cuentas.map((c) => {
          const Icono = ICONO_POR_TIPO[c.tipo] ?? Landmark;
          return (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[.04] text-zinc-600 dark:bg-white/[.06] dark:text-zinc-400">
                <Icono size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {c.nombre}
                </span>
                <span className="text-xl font-semibold text-black dark:text-zinc-50">
                  {formatoMXN(c.saldo_actual)}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Solicitudes Autorizadas para Pago
        </h2>

        {solicitudes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            No hay solicitudes autorizadas pendientes de pago.
          </p>
        ) : (
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]"
                  >
                    <td className="px-4 py-3 font-mono">{s.folio}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatoFecha(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {s.proyectos?.codigo} — {s.proyectos?.nombre}
                    </td>
                    <td className="px-4 py-3">{s.proveedores?.razon_social}</td>
                    <td className="px-4 py-3">{s.metodo_pago}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatoMXN(s.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => abrirModal(s)}
                        className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                      >
                        Pagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {solicitudActiva && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                Confirmar Pago
              </h3>
              <button
                type="button"
                onClick={cerrarModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Folio</span>
                <span className="font-mono">{solicitudActiva.folio}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Proveedor</span>
                <span>{solicitudActiva.proveedores?.razon_social}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Total</span>
                <span className="font-semibold">{formatoMXN(solicitudActiva.total)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 rounded border border-black/[.08] bg-black/[.03] px-3 py-2.5 dark:border-white/[.145] dark:bg-white/[.04]">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Cuenta a Debitar
              </span>
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                {cuentaAsignada?.nombre ?? "Sin cuenta asignada para este método de pago"}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Fecha de Pago
              </label>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cerrarModal}
                disabled={procesando}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPago}
                disabled={procesando || !cuentaAsignada}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {procesando ? "Procesando…" : "Confirmar Pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
