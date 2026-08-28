"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  actualizarSaldoInicial,
  editarMovimiento,
  eliminarMovimiento,
  procesarPagoSolicitud,
  registrarMovimiento,
} from "@/app/actions/tesoreria";

const ICONO_POR_TIPO = {
  Efectivo: Wallet,
  "Transferencia bancaria": Landmark,
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
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

const FORM_VACIO = {
  tipoMovimiento: "ingreso",
  proyectoId: "",
  fecha: hoyISO(),
  razonSocial: "",
  concepto: "",
  monto: "",
  comentarios: "",
};

const selectClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Tesorería: pestañas por cuenta, saldo inicial editable, bitácora y dispersión de pagos. */
export default function TableroTesoreria({
  cuentas: cuentasIniciales,
  movimientos: movimientosIniciales,
  solicitudes: solicitudesIniciales,
  proyectos,
}) {
  const router = useRouter();
  const [cuentas, setCuentas] = useState(cuentasIniciales);
  const [movimientos, setMovimientos] = useState(movimientosIniciales);
  const [solicitudes, setSolicitudes] = useState(solicitudesIniciales);
  const [cuentaActivaId, setCuentaActivaId] = useState(cuentasIniciales[0]?.id ?? null);

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());

  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoInicialForm, setSaldoInicialForm] = useState("");
  const [guardandoSaldo, setGuardandoSaldo] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardandoMovimiento, setGuardandoMovimiento] = useState(false);

  const [solicitudActiva, setSolicitudActiva] = useState(null);
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [procesando, setProcesando] = useState(false);

  const [error, setError] = useState("");

  const [editandoMovId, setEditandoMovId] = useState(null);
  const [montoEditado, setMontoEditado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoMovId, setEliminandoMovId] = useState(null);

  const cuentaActiva = cuentas.find((c) => c.id === cuentaActivaId) ?? null;

  const aniosDisponibles = useMemo(() => {
    const anios = new Set([new Date().getFullYear()]);
    movimientos.forEach((m) => anios.add(new Date(`${m.fecha}T00:00:00`).getFullYear()));
    return [...anios].sort((a, b) => b - a);
  }, [movimientos]);

  const movimientosCuenta = useMemo(() => {
    if (!cuentaActivaId) return [];
    return movimientos.filter((m) => {
      if (m.cuenta_id !== cuentaActivaId) return false;
      const f = new Date(`${m.fecha}T00:00:00`);
      return f.getMonth() + 1 === mes && f.getFullYear() === anio;
    });
  }, [movimientos, cuentaActivaId, mes, anio]);

  const ingresos = movimientosCuenta.filter((m) => m.tipo_movimiento === "ingreso");
  const egresos = movimientosCuenta.filter((m) => m.tipo_movimiento === "egreso");

  const solicitudesCuenta = useMemo(() => {
    if (!cuentaActiva) return [];
    return solicitudes.filter((s) => s.metodo_pago === cuentaActiva.tipo);
  }, [solicitudes, cuentaActiva]);

  function seleccionarCuenta(id) {
    setCuentaActivaId(id);
    setEditandoSaldo(false);
    setError("");
  }

  function abrirEdicionSaldo() {
    setSaldoInicialForm(String(cuentaActiva.saldo_inicial ?? 0));
    setEditandoSaldo(true);
    setError("");
  }

  async function guardarSaldoInicial() {
    const valor = parseFloat(saldoInicialForm);
    if (Number.isNaN(valor)) {
      setError("Captura un saldo inicial válido.");
      return;
    }

    setGuardandoSaldo(true);
    setError("");
    const resultado = await actualizarSaldoInicial(cuentaActiva.id, valor);
    setGuardandoSaldo(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setCuentas((filas) => filas.map((c) => (c.id === resultado.cuenta.id ? resultado.cuenta : c)));
    setEditandoSaldo(false);
  }

  function abrirModalMovimiento() {
    setForm({ ...FORM_VACIO, fecha: hoyISO() });
    setError("");
    setModalAbierto(true);
  }

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardarMovimiento(e) {
    e.preventDefault();
    setError("");

    if (!form.concepto.trim()) return setError("Captura el concepto.");
    const monto = parseFloat(form.monto);
    if (!(monto > 0)) return setError("Captura un monto válido.");

    setGuardandoMovimiento(true);
    const resultado = await registrarMovimiento({
      cuentaId: cuentaActiva.id,
      proyectoId: form.proyectoId ? Number(form.proyectoId) : null,
      tipoMovimiento: form.tipoMovimiento,
      fecha: form.fecha,
      razonSocial: form.razonSocial.trim(),
      concepto: form.concepto.trim(),
      monto,
      comentarios: form.comentarios.trim(),
    });
    setGuardandoMovimiento(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setMovimientos((filas) => [resultado.movimiento, ...filas]);
    setCuentas((filas) =>
      filas.map((c) =>
        c.id === cuentaActiva.id ? { ...c, saldo_actual: resultado.movimiento.saldo_resultante } : c
      )
    );
    setModalAbierto(false);
  }

  function iniciarEdicionMonto(movimiento) {
    setEditandoMovId(movimiento.id);
    setMontoEditado(String(movimiento.monto));
    setError("");
  }

  function cancelarEdicionMonto() {
    setEditandoMovId(null);
  }

  async function guardarEdicionMonto(movimiento) {
    const monto = parseFloat(montoEditado);
    if (!(monto > 0)) {
      setError("Captura un monto válido.");
      return;
    }

    setGuardandoEdicion(true);
    setError("");
    const resultado = await editarMovimiento(movimiento.id, monto);
    setGuardandoEdicion(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setMovimientos((filas) =>
      filas.map((f) =>
        f.id === movimiento.id
          ? { ...f, monto: resultado.movimiento.monto, saldo_resultante: resultado.movimiento.saldo_resultante }
          : f
      )
    );
    setCuentas((filas) =>
      filas.map((c) =>
        c.id === movimiento.cuenta_id ? { ...c, saldo_actual: resultado.movimiento.saldo_resultante } : c
      )
    );
    setEditandoMovId(null);
    router.refresh();
  }

  async function eliminarMovimientoBitacora(movimiento) {
    if (
      !window.confirm(
        `¿Eliminar el movimiento "${movimiento.concepto}" por ${formatoMXN(movimiento.monto)}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setEliminandoMovId(movimiento.id);
    setError("");
    const resultado = await eliminarMovimiento(movimiento.id);
    setEliminandoMovId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setMovimientos((filas) => filas.filter((f) => f.id !== movimiento.id));
    setCuentas((filas) =>
      filas.map((c) => (c.id === movimiento.cuenta_id ? { ...c, saldo_actual: resultado.saldoActual } : c))
    );
    router.refresh();
  }

  function abrirModalPago(solicitud) {
    setSolicitudActiva(solicitud);
    setFechaPago(hoyISO());
    setError("");
  }

  async function confirmarPago() {
    setProcesando(true);
    setError("");

    const resultado = await procesarPagoSolicitud(solicitudActiva.id, fechaPago);
    setProcesando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setSolicitudes((filas) => filas.filter((s) => s.id !== solicitudActiva.id));
    setSolicitudActiva(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 border-b border-black/[.08] pb-3 dark:border-white/[.145]">
        {cuentas.map((c) => {
          const Icono = ICONO_POR_TIPO[c.tipo] ?? Landmark;
          const activa = c.id === cuentaActivaId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => seleccionarCuenta(c.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activa
                  ? "bg-foreground text-background"
                  : "border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              }`}
            >
              <Icono size={15} /> {c.nombre}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {cuentaActiva && (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
            <div className="flex flex-wrap gap-8">
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Saldo Actual
                </span>
                <span className="text-2xl font-semibold text-black dark:text-zinc-50">
                  {formatoMXN(cuentaActiva.saldo_actual)}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Saldo Inicial
                </span>
                {editandoSaldo ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      autoFocus
                      value={saldoInicialForm}
                      onChange={(e) => setSaldoInicialForm(e.target.value)}
                      className="w-32 rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm dark:border-white/[.145]"
                    />
                    <button
                      type="button"
                      onClick={guardarSaldoInicial}
                      disabled={guardandoSaldo}
                      className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                    >
                      {guardandoSaldo ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoSaldo(false)}
                      disabled={guardandoSaldo}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={abrirEdicionSaldo}
                    className="flex items-center gap-1.5 text-lg font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {formatoMXN(cuentaActiva.saldo_inicial ?? 0)}
                    <Pencil size={13} className="text-zinc-400" />
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={abrirModalMovimiento}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              <Plus size={15} /> Registrar Movimiento
            </button>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Bitácora de Movimientos
              </h2>
              <div className="flex gap-2">
                <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={selectClase}>
                  {MESES.map((nombre, i) => (
                    <option key={nombre} value={i + 1}>
                      {nombre}
                    </option>
                  ))}
                </select>
                <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={selectClase}>
                  {aniosDisponibles.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TablaMovimientos
                titulo="Ingresos (Entradas)"
                icono={<ArrowUpCircle size={15} className="text-green-600 dark:text-green-500" />}
                movimientos={ingresos}
                vacio="Sin ingresos registrados en el periodo."
                editandoMovId={editandoMovId}
                montoEditado={montoEditado}
                setMontoEditado={setMontoEditado}
                guardandoEdicion={guardandoEdicion}
                eliminandoMovId={eliminandoMovId}
                onIniciarEdicion={iniciarEdicionMonto}
                onCancelarEdicion={cancelarEdicionMonto}
                onGuardarEdicion={guardarEdicionMonto}
                onEliminar={eliminarMovimientoBitacora}
              />
              <TablaMovimientos
                titulo="Egresos (Salidas)"
                icono={<ArrowDownCircle size={15} className="text-red-600 dark:text-red-500" />}
                movimientos={egresos}
                vacio="Sin egresos registrados en el periodo."
                editandoMovId={editandoMovId}
                montoEditado={montoEditado}
                setMontoEditado={setMontoEditado}
                guardandoEdicion={guardandoEdicion}
                eliminandoMovId={eliminandoMovId}
                onIniciarEdicion={iniciarEdicionMonto}
                onCancelarEdicion={cancelarEdicionMonto}
                onGuardarEdicion={guardarEdicionMonto}
                onEliminar={eliminarMovimientoBitacora}
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Solicitudes Autorizadas para Pago
            </h2>

            {solicitudesCuenta.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
                No hay solicitudes autorizadas pendientes de pago en esta cuenta.
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
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudesCuenta.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]"
                      >
                        <td className="px-4 py-3 font-mono">{s.folio}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {formatoFecha(s.created_at?.slice(0, 10))}
                        </td>
                        <td className="px-4 py-3">
                          {s.proyectos?.codigo} — {s.proyectos?.nombre}
                        </td>
                        <td className="px-4 py-3">{s.proveedores?.razon_social}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatoMXN(s.total)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => abrirModalPago(s)}
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
        </>
      )}

      {modalAbierto && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={guardarMovimiento}
            className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                Registrar Movimiento — {cuentaActiva?.nombre}
              </h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => actualizarCampo("tipoMovimiento", "ingreso")}
                className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  form.tipoMovimiento === "ingreso"
                    ? "bg-green-600 text-white"
                    : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                }`}
              >
                Ingreso
              </button>
              <button
                type="button"
                onClick={() => actualizarCampo("tipoMovimiento", "egreso")}
                className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  form.tipoMovimiento === "egreso"
                    ? "bg-red-600 text-white"
                    : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                }`}
              >
                Egreso
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Proyecto (opcional)</label>
                <select
                  className={inputClase}
                  value={form.proyectoId}
                  onChange={(e) => actualizarCampo("proyectoId", e.target.value)}
                >
                  <option value="">Sin proyecto</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Fecha</label>
                <input
                  type="date"
                  className={inputClase}
                  value={form.fecha}
                  onChange={(e) => actualizarCampo("fecha", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={labelClase}>Razón Social / Cliente</label>
                <input
                  type="text"
                  className={inputClase}
                  value={form.razonSocial}
                  onChange={(e) => actualizarCampo("razonSocial", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={labelClase}>Concepto</label>
                <input
                  type="text"
                  className={inputClase}
                  value={form.concepto}
                  onChange={(e) => actualizarCampo("concepto", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Monto</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.monto}
                  onChange={(e) => actualizarCampo("monto", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={labelClase}>Comentarios</label>
                <input
                  type="text"
                  className={inputClase}
                  value={form.comentarios}
                  onChange={(e) => actualizarCampo("comentarios", e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                disabled={guardandoMovimiento}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoMovimiento}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {guardandoMovimiento ? "Guardando…" : "Guardar Movimiento"}
              </button>
            </div>
          </form>
        </div>
      )}

      {solicitudActiva && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                Confirmar Pago
              </h3>
              <button
                type="button"
                onClick={() => setSolicitudActiva(null)}
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
                {cuentaActiva?.nombre}
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
                onClick={() => setSolicitudActiva(null)}
                disabled={procesando}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPago}
                disabled={procesando}
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

/** Tabla compacta de movimientos (ingresos o egresos) para la bitácora del mes, con edición/eliminación por fila. */
function TablaMovimientos({
  titulo,
  icono,
  movimientos,
  vacio,
  editandoMovId,
  montoEditado,
  setMontoEditado,
  guardandoEdicion,
  eliminandoMovId,
  onIniciarEdicion,
  onCancelarEdicion,
  onGuardarEdicion,
  onEliminar,
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {icono} {titulo}
      </h3>

      {movimientos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-6 text-center text-xs text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          {vacio}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-black/[.08] bg-black/[.03] text-left font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Razón Social</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Proyecto</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Comentarios</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => {
                const editando = editandoMovId === m.id;
                const eliminando = eliminandoMovId === m.id;
                return (
                  <tr key={m.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatoFecha(m.fecha)}</td>
                    <td className="px-3 py-2">{m.razon_social || "—"}</td>
                    <td className="px-3 py-2">{m.concepto}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {m.proyectos ? `${m.proyectos.codigo}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {editando ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          autoFocus
                          disabled={guardandoEdicion}
                          value={montoEditado}
                          onChange={(e) => setMontoEditado(e.target.value)}
                          className="w-24 rounded border border-black/[.08] bg-transparent px-1.5 py-0.5 text-right text-xs dark:border-white/[.145]"
                        />
                      ) : (
                        formatoMXN(m.monto)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {formatoMXN(m.saldo_resultante)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{m.comentarios || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {editando ? (
                          <>
                            <button
                              type="button"
                              disabled={guardandoEdicion}
                              onClick={() => onGuardarEdicion(m)}
                              className="text-green-600 hover:text-green-700 disabled:opacity-50 dark:text-green-500"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={guardandoEdicion}
                              onClick={onCancelarEdicion}
                              className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50 dark:hover:text-zinc-200"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onIniciarEdicion(m)}
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={eliminando}
                              onClick={() => onEliminar(m)}
                              className="text-zinc-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
