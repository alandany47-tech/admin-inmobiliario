"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileDown, Search, X } from "lucide-react";
import { getPlanDePagos, procesarPagoCobranza, getDesglosePagosCliente } from "@/app/actions/cobranza";
import { descargarReciboPago } from "@/components/PlantillaReciboPago";
import { descargarEstadoCuenta } from "@/components/PlantillaEstadoCuenta";
import PanelAlertasVencimiento from "@/components/PanelAlertasVencimiento";

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

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const BADGE_ESTATUS = {
  Pendiente: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Parcial: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  Pagado: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  Vencido: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

const METODOS_PAGO = ["Transferencia bancaria", "Efectivo"];

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Captura de pagos de cobranza: alertas de vencimiento, búsqueda de contrato, plan de pagos y dispersión a Tesorería. */
export default function CapturaPagos({ contratos, cuentas, proyectos }) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [contrato, setContrato] = useState(null);
  const [plan, setPlan] = useState([]);
  const [cargandoPlan, setCargandoPlan] = useState(false);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);

  const [abono, setAbono] = useState(null);
  const [reciboListo, setReciboListo] = useState(null);

  const boxRef = useRef(null);
  useEffect(() => {
    function alClickFuera(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  const contratosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return contratos;
    return contratos.filter((c) =>
      `${c.clientes?.nombre ?? ""} ${c.clientes?.rfc ?? ""} ${c.unidades?.codigo_unidad ?? ""}`
        .toLowerCase()
        .includes(termino)
    );
  }, [contratos, busqueda]);

  async function seleccionarContrato(c) {
    setContrato(c);
    setBusqueda(`${c.unidades?.codigo_unidad ?? ""} — ${c.clientes?.nombre ?? ""}`);
    setAbierto(false);
    setError("");
    setReciboListo(null);
    setCargandoPlan(true);
    const data = await getPlanDePagos(c.id);
    setPlan(data);
    setCargandoPlan(false);
  }

  async function exportarEstadoCuenta() {
    if (!contrato?.clientes?.id) return;
    setExportando(true);
    const contratosCliente = await getDesglosePagosCliente(contrato.clientes.id);
    await descargarEstadoCuenta(contrato.clientes, contratosCliente);
    setExportando(false);
  }

  function estatusVisual(fila) {
    if (["Pendiente", "Parcial"].includes(fila.estatus) && fila.fecha_programada < hoyISO()) {
      return "Vencido";
    }
    return fila.estatus;
  }

  function abrirAbono(fila) {
    setReciboListo(null);
    setAbono({
      fila,
      monto: String(Number(fila.monto_programado) - Number(fila.monto_pagado)),
      cuentaId: cuentas[0]?.id ? String(cuentas[0].id) : "",
      fechaPago: hoyISO(),
      metodoPago: METODOS_PAGO[0],
      guardando: false,
      error: "",
    });
  }

  async function confirmarAbono(e) {
    e.preventDefault();
    if (!abono) return;

    const monto = parseFloat(abono.monto);
    if (!(monto > 0)) {
      setAbono((a) => ({ ...a, error: "Captura un monto válido." }));
      return;
    }
    if (!abono.cuentaId) {
      setAbono((a) => ({ ...a, error: "Selecciona la cuenta bancaria destino." }));
      return;
    }

    setAbono((a) => ({ ...a, guardando: true, error: "" }));
    const resultado = await procesarPagoCobranza(
      abono.fila.id,
      Number(abono.cuentaId),
      monto,
      abono.fechaPago,
      abono.metodoPago
    );

    if (resultado.error) {
      setAbono((a) => ({ ...a, guardando: false, error: resultado.error }));
      return;
    }

    const data = await getPlanDePagos(contrato.id);
    setPlan(data);
    setReciboListo({
      folio: `REC-${abono.fila.id.slice(0, 8).toUpperCase()}`,
      fecha: abono.fechaPago,
      clienteNombre: contrato.clientes?.nombre ?? "",
      proyectoCodigo: contrato.proyectos?.codigo ?? "",
      proyectoNombre: contrato.proyectos?.nombre ?? "",
      unidadCodigo: contrato.unidades?.codigo_unidad ?? "",
      tipoPago: abono.fila.tipo_pago,
      monto,
      metodoPago: abono.metodoPago,
    });
    setAbono(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <PanelAlertasVencimiento proyectos={proyectos} />

      <div className="relative max-w-lg" ref={boxRef}>
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Busca por cliente, RFC o unidad…"
          className={`${inputClase} w-full pl-8`}
          value={busqueda}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setAbierto(true);
            if (contrato) setContrato(null);
          }}
        />
        {abierto && (
          <div className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
            {contratosFiltrados.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin resultados.</p>
            ) : (
              contratosFiltrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => seleccionarContrato(c)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                >
                  <span className="text-black dark:text-zinc-50">
                    {c.unidades?.codigo_unidad} — {c.clientes?.nombre}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {c.proyectos?.codigo} · {formatoMXN(c.monto_total_venta)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {contrato && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900">
            <div className="flex flex-col">
              <span className="font-medium text-black dark:text-zinc-50">
                {contrato.unidades?.codigo_unidad} — {contrato.clientes?.nombre}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {contrato.proyectos?.codigo} — {contrato.proyectos?.nombre}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-black dark:text-zinc-50">
                {formatoMXN(contrato.monto_total_venta)}
              </span>
              <button
                type="button"
                onClick={exportarEstadoCuenta}
                disabled={exportando}
                className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                <FileDown size={13} /> {exportando ? "Generando…" : "Estado de Cuenta"}
              </button>
            </div>
          </div>

          {reciboListo && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm dark:border-green-900 dark:bg-green-950/40">
              <span className="text-green-700 dark:text-green-400">Abono registrado correctamente.</span>
              <button
                type="button"
                onClick={() => descargarReciboPago(reciboListo)}
                className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background dark:hover:bg-[#ccc]"
              >
                <Download size={13} /> Descargar / Imprimir Recibo
              </button>
            </div>
          )}

          {cargandoPlan ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando plan de pagos…</p>
          ) : plan.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
              Este contrato no tiene plan de pagos generado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Fecha Programada</th>
                    <th className="px-4 py-3 text-right">Programado</th>
                    <th className="px-4 py-3 text-right">Pagado</th>
                    <th className="px-4 py-3">Estatus</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {plan.map((p) => {
                    const est = estatusVisual(p);
                    const puedeAbonar = ["Pendiente", "Parcial"].includes(p.estatus);
                    return (
                      <tr key={p.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                        <td className="px-4 py-3">
                          {p.tipo_pago}
                          {p.notas && <span className="ml-1.5 text-xs text-zinc-500 dark:text-zinc-400">({p.notas})</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {formatoFecha(p.fecha_programada)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatoMXN(p.monto_programado)}</td>
                        <td className="px-4 py-3 text-right">{formatoMXN(p.monto_pagado)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${BADGE_ESTATUS[est] ?? ""}`}>
                            {est}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {puedeAbonar && (
                            <button
                              type="button"
                              onClick={() => abrirAbono(p)}
                              className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                            >
                              Abonar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {abono && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={confirmarAbono}
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                Abonar — {abono.fila.tipo_pago}
              </h3>
              <button
                type="button"
                onClick={() => setAbono(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={abono.monto}
                onChange={(e) => setAbono((a) => ({ ...a, monto: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Cuenta Bancaria Destino</label>
              <select
                className={inputClase}
                value={abono.cuentaId}
                onChange={(e) => setAbono((a) => ({ ...a, cuentaId: e.target.value }))}
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Fecha de Pago</label>
                <input
                  type="date"
                  className={inputClase}
                  value={abono.fechaPago}
                  onChange={(e) => setAbono((a) => ({ ...a, fechaPago: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Método de Pago</label>
                <select
                  className={inputClase}
                  value={abono.metodoPago}
                  onChange={(e) => setAbono((a) => ({ ...a, metodoPago: e.target.value }))}
                >
                  {METODOS_PAGO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {abono.error && <p className="text-sm text-red-600 dark:text-red-400">{abono.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAbono(null)}
                disabled={abono.guardando}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={abono.guardando}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {abono.guardando ? "Procesando…" : "Confirmar Abono"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
