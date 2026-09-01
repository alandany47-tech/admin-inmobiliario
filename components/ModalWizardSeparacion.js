"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { getUnidadesDisponibles } from "@/app/actions/unidades";
import { buscarOCrearCliente } from "@/app/actions/clientes";
import { crearSeparacionUnidad, generarPlanDePagos } from "@/app/actions/cobranza";

const CLIENTE_NUEVO_VACIO = { nombre: "", rfc: "", telefono: "", email: "" };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const DATOS_VACIO = {
  montoTotal: "",
  esquemaVenta: "TRADICIONAL",
  montoSeparacion: "",
  montoEnganchePactado: "",
  fechaContrato: hoyISO(),
};

const PLAN_VACIO = {
  montoEnganche: "",
  fechaEnganche: hoyISO(),
  numMensualidades: "",
  montoMensualidad: "",
  fechaPrimeraMensualidad: "",
  montoEntrega: "",
  fechaEntrega: "",
};

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

function pasoInicial(unidadPreset, clientePreset) {
  if (!unidadPreset) return "unidad";
  if (!clientePreset) return "cliente";
  return "separacion";
}

/**
 * Wizard de 2 pasos del flujo comercial: Separación (crea el contrato,
 * registra monto de separación/enganche pactado, la unidad pasa a
 * 'APARTADA' con 30 días de temporizador) y Plan Proyectado (mensualidades
 * supuestas, sujetas a cambio hasta la firma). Se usa tanto desde Unidades
 * (con `unidadPreset` fijo) como desde Cartera de Clientes (con
 * `clientePreset` fijo, mostrando primero el selector de proyecto/unidad).
 */
export default function ModalWizardSeparacion({
  proyectos,
  clientes,
  unidadPreset,
  clientePreset,
  onClienteCreado,
  onCompletado,
  onCerrar,
}) {
  const [paso, setPaso] = useState(pasoInicial(unidadPreset, clientePreset));

  const [proyectoId, setProyectoId] = useState(
    unidadPreset ? String(unidadPreset.proyecto_id) : proyectos[0]?.id ? String(proyectos[0].id) : ""
  );
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [cargandoUnidades, setCargandoUnidades] = useState(!unidadPreset && Boolean(proyectoId));
  const [unidad, setUnidad] = useState(unidadPreset ?? null);

  const [modoCliente, setModoCliente] = useState("existente");
  const [clienteId, setClienteId] = useState("");
  const [clienteBusqueda, setClienteBusqueda] = useState("");
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const [clienteNuevo, setClienteNuevo] = useState(CLIENTE_NUEVO_VACIO);
  const clienteBoxRef = useRef(null);

  const [datos, setDatos] = useState({
    ...DATOS_VACIO,
    esquemaVenta: unidadPreset?.esquema_unidad ?? "TRADICIONAL",
  });
  const [contratoId, setContratoId] = useState(null);
  const [plan, setPlan] = useState(PLAN_VACIO);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (unidadPreset || !proyectoId) return;
    let vigente = true;
    getUnidadesDisponibles(Number(proyectoId)).then((data) => {
      if (vigente) {
        setUnidadesDisponibles(data);
        setCargandoUnidades(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId, unidadPreset]);

  useEffect(() => {
    function alClickFuera(e) {
      if (clienteBoxRef.current && !clienteBoxRef.current.contains(e.target)) {
        setClienteAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  function cambiarProyecto(valor) {
    setProyectoId(valor);
    setUnidadesDisponibles([]);
    setUnidad(null);
    if (valor) setCargandoUnidades(true);
  }

  function seleccionarUnidad(u) {
    setUnidad(u);
    setDatos((d) => ({ ...d, esquemaVenta: u.esquema_unidad }));
  }

  function confirmarUnidad(e) {
    e.preventDefault();
    if (!unidad) {
      setError("Selecciona una unidad disponible.");
      return;
    }
    setError("");
    setPaso(clientePreset ? "separacion" : "cliente");
  }

  const clientesFiltrados = useMemo(() => {
    const termino = clienteBusqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(termino) || (c.rfc ?? "").toLowerCase().includes(termino)
    );
  }, [clientes, clienteBusqueda]);

  async function confirmarCliente(e) {
    e.preventDefault();
    setError("");

    if (modoCliente === "existente" && !clienteId) {
      setError("Selecciona un cliente.");
      return;
    }
    if (modoCliente === "nuevo" && !clienteNuevo.nombre.trim()) {
      setError("Captura el nombre del cliente.");
      return;
    }
    setPaso("separacion");
  }

  async function confirmarSeparacion(e) {
    e.preventDefault();
    setError("");

    if (!(Number(datos.montoTotal) > 0)) {
      setError("Captura el monto total de venta.");
      return;
    }

    setGuardando(true);

    let clienteFinalId = clientePreset?.id ?? clienteId;
    if (!clientePreset && modoCliente === "nuevo") {
      const resultadoCliente = await buscarOCrearCliente(clienteNuevo);
      if (resultadoCliente.error) {
        setGuardando(false);
        setError(resultadoCliente.error);
        return;
      }
      clienteFinalId = resultadoCliente.id;
      if (resultadoCliente.cliente) onClienteCreado?.(resultadoCliente.cliente);
    }

    const resultado = await crearSeparacionUnidad({
      proyectoId: Number(proyectoId),
      unidadId: unidad.id,
      clienteId: clienteFinalId,
      montoTotal: datos.montoTotal,
      esquemaVenta: datos.esquemaVenta,
      montoSeparacion: datos.montoSeparacion,
      montoEnganchePactado: datos.montoEnganchePactado,
      fechaContrato: datos.fechaContrato,
    });

    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setPlan((p) => ({ ...p, montoEnganche: datos.montoEnganchePactado }));
    setContratoId(resultado.contrato.id);
    setPaso("plan");
  }

  async function confirmarPlan(e) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    const resultado = await generarPlanDePagos(contratoId, plan);
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    onCompletado();
  }

  function omitirPlan() {
    onCompletado();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      {paso === "unidad" && (
        <form
          onSubmit={confirmarUnidad}
          className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-black dark:text-zinc-50">
              Apartar Unidad{clientePreset ? ` — ${clientePreset.nombre}` : ""}
            </h3>
            <button type="button" onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Proyecto</label>
            <select className={inputClase} value={proyectoId} onChange={(e) => cambiarProyecto(e.target.value)}>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Unidad (Sin Asignar)</label>
            {cargandoUnidades ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando unidades…</p>
            ) : unidadesDisponibles.length === 0 ? (
              <p className="rounded border border-dashed border-black/[.08] px-3 py-2.5 text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
                Este proyecto no tiene unidades sin asignar.
              </p>
            ) : (
              <select
                className={inputClase}
                value={unidad?.id ?? ""}
                onChange={(e) => seleccionarUnidad(unidadesDisponibles.find((u) => u.id === e.target.value))}
              >
                <option value="">Selecciona una unidad…</option>
                {unidadesDisponibles.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo_unidad} — {u.tipo_uso} ({Number(u.superficie_m2).toLocaleString("es-MX")} m²)
                    {u.esquema_unidad === "INVERSIONISTA" ? " · Inversionista" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={unidadesDisponibles.length === 0}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              Continuar
            </button>
          </div>
        </form>
      )}

      {paso === "cliente" && (
        <form
          onSubmit={confirmarCliente}
          className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-black dark:text-zinc-50">
              Apartar {unidad.codigo_unidad} — Cliente
            </h3>
            <button type="button" onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={18} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModoCliente("existente")}
              className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                modoCliente === "existente"
                  ? "bg-foreground text-background"
                  : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
              }`}
            >
              Cliente Existente
            </button>
            <button
              type="button"
              onClick={() => setModoCliente("nuevo")}
              className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                modoCliente === "nuevo"
                  ? "bg-foreground text-background"
                  : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
              }`}
            >
              Cliente Nuevo
            </button>
          </div>

          {modoCliente === "existente" ? (
            <div className="relative" ref={clienteBoxRef}>
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Busca por nombre o RFC…"
                className={`${inputClase} w-full pl-8`}
                value={clienteBusqueda}
                onFocus={() => setClienteAbierto(true)}
                onChange={(e) => {
                  setClienteBusqueda(e.target.value);
                  setClienteAbierto(true);
                  setClienteId("");
                }}
              />
              {clienteAbierto && (
                <div className="absolute top-full z-10 mt-1 max-h-52 w-full overflow-y-auto rounded border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
                  {clientesFiltrados.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin resultados.</p>
                  ) : (
                    clientesFiltrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClienteId(c.id);
                          setClienteBusqueda(`${c.rfc ? "[" + c.rfc + "] " : ""}${c.nombre}`);
                          setClienteAbierto(false);
                        }}
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                      >
                        {c.rfc && (
                          <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">[{c.rfc}]</span>
                        )}
                        <span className="text-black dark:text-zinc-50">{c.nombre}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded border border-dashed border-black/[.08] p-4 dark:border-white/[.145]">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Nombre</label>
                <input
                  type="text"
                  className={inputClase}
                  value={clienteNuevo.nombre}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, nombre: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>RFC (opcional)</label>
                  <input
                    type="text"
                    className={`${inputClase} uppercase`}
                    value={clienteNuevo.rfc}
                    onChange={(e) => setClienteNuevo((c) => ({ ...c, rfc: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Teléfono (opcional)</label>
                  <input
                    type="text"
                    className={inputClase}
                    value={clienteNuevo.telefono}
                    onChange={(e) => setClienteNuevo((c) => ({ ...c, telefono: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Email (opcional)</label>
                <input
                  type="email"
                  className={inputClase}
                  value={clienteNuevo.email}
                  onChange={(e) => setClienteNuevo((c) => ({ ...c, email: e.target.value }))}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background dark:hover:bg-[#ccc]"
            >
              Continuar
            </button>
          </div>
        </form>
      )}

      {paso === "separacion" && (
        <form
          onSubmit={confirmarSeparacion}
          className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-black dark:text-zinc-50">
              Separación — {unidad.codigo_unidad}
            </h3>
            <button type="button" onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            La unidad pasa a APARTADA con un temporizador de 30 días. Si no se liquida el enganche pactado y se
            firma el contrato en ese plazo, la unidad puede liberarse desde Unidades.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Monto Total de Venta</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={datos.montoTotal}
                onChange={(e) => setDatos((d) => ({ ...d, montoTotal: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Esquema</label>
              <select
                className={inputClase}
                value={datos.esquemaVenta}
                onChange={(e) => setDatos((d) => ({ ...d, esquemaVenta: e.target.value }))}
              >
                <option value="TRADICIONAL">Tradicional</option>
                <option value="INVERSIONISTA">Inversionista</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Monto de Separación</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={datos.montoSeparacion}
                onChange={(e) => setDatos((d) => ({ ...d, montoSeparacion: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Enganche Pactado</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={datos.montoEnganchePactado}
                onChange={(e) => setDatos((d) => ({ ...d, montoEnganchePactado: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className={labelClase}>Fecha de Contrato</label>
              <input
                type="date"
                className={inputClase}
                value={datos.fechaContrato}
                onChange={(e) => setDatos((d) => ({ ...d, fechaContrato: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {guardando ? "Guardando…" : "Continuar: Plan Proyectado"}
            </button>
          </div>
        </form>
      )}

      {paso === "plan" && (
        <form
          onSubmit={confirmarPlan}
          className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Plan Proyectado — {unidad.codigo_unidad}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Estas mensualidades son proyecciones/supuestos: se activan hasta liquidar el enganche y confirmar la
            firma del contrato desde Captura de Pagos.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Monto Enganche</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={plan.montoEnganche}
                onChange={(e) => setPlan((p) => ({ ...p, montoEnganche: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Fecha Enganche</label>
              <input
                type="date"
                className={inputClase}
                value={plan.fechaEnganche}
                onChange={(e) => setPlan((p) => ({ ...p, fechaEnganche: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}># Mensualidades</label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputClase}
                value={plan.numMensualidades}
                onChange={(e) => setPlan((p) => ({ ...p, numMensualidades: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Monto por Mensualidad</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={plan.montoMensualidad}
                onChange={(e) => setPlan((p) => ({ ...p, montoMensualidad: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className={labelClase}>Fecha Primera Mensualidad</label>
              <input
                type="date"
                className={inputClase}
                value={plan.fechaPrimeraMensualidad}
                onChange={(e) => setPlan((p) => ({ ...p, fechaPrimeraMensualidad: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Monto a Entrega</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClase}
                value={plan.montoEntrega}
                onChange={(e) => setPlan((p) => ({ ...p, montoEntrega: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Fecha Estimada Entrega</label>
              <input
                type="date"
                className={inputClase}
                value={plan.fechaEntrega}
                onChange={(e) => setPlan((p) => ({ ...p, fechaEntrega: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={omitirPlan}
              disabled={guardando}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              Omitir por Ahora
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {guardando ? "Guardando…" : "Generar Plan Proyectado"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
