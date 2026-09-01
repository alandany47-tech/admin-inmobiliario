"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Upload, X } from "lucide-react";
import {
  getUnidades,
  crearUnidad,
  actualizarUnidad,
  cambiarEstatusUnidad,
} from "@/app/actions/unidades";
import { getClientes, buscarOCrearCliente } from "@/app/actions/clientes";
import { crearContratoVenta, generarPlanDePagos } from "@/app/actions/cobranza";
import ModalImportarUnidades from "@/components/ModalImportarUnidades";

const TIPOS_USO = ["DEPARTAMENTO", "OFICINA", "LOCAL", "BODEGA", "OTRO"];

const FORM_VACIO = {
  codigoUnidad: "",
  superficieM2: "",
  tipoUso: "DEPARTAMENTO",
  precioM2: "",
  montoLista: "",
};
const CLIENTE_NUEVO_VACIO = { nombre: "", rfc: "", telefono: "", email: "" };
const VENTA_DATOS_VACIO = { montoTotal: "", fechaContrato: new Date().toISOString().slice(0, 10) };
const PLAN_VACIO = {
  montoEnganche: "",
  fechaEnganche: new Date().toISOString().slice(0, 10),
  numMensualidades: "",
  montoMensualidad: "",
  fechaPrimeraMensualidad: "",
  montoEntrega: "",
  fechaEntrega: "",
};

const ESTILO_ESTATUS = {
  "SIN ASIGNAR":
    "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
  APARTADA:
    "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  VENDIDA:
    "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
};

const BADGE_ESTATUS = {
  "SIN ASIGNAR": "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  APARTADA: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  VENDIDA: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function redondear(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Panel de unidades: grid por estatus, alta/edición de specs, importación masiva y flujo de venta. */
export default function PanelUnidades({ proyectos }) {
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [unidades, setUnidades] = useState([]);
  const [cargando, setCargando] = useState(Boolean(proyectoId));
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState("");

  const [modalForm, setModalForm] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);

  const [detalle, setDetalle] = useState(null);
  const [procesandoEstatusId, setProcesandoEstatusId] = useState(null);

  const [venta, setVenta] = useState(null);

  useEffect(() => {
    getClientes().then(setClientes);
  }, []);

  useEffect(() => {
    if (!proyectoId) return;
    let vigente = true;
    getUnidades(Number(proyectoId)).then((data) => {
      if (vigente) {
        setUnidades(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  function abrirNuevaUnidad() {
    setModalForm("nuevo");
    setForm(FORM_VACIO);
    setError("");
  }

  function abrirEdicionUnidad(u) {
    setModalForm(u);
    setForm({
      codigoUnidad: u.codigo_unidad,
      superficieM2: String(u.superficie_m2),
      tipoUso: u.tipo_uso,
      precioM2: String(u.precio_m2),
      montoLista: String(u.monto_lista),
    });
    setDetalle(null);
    setError("");
  }

  function actualizarSuperficie(valor) {
    setForm((f) => {
      const superficie = parseFloat(valor) || 0;
      const precio = parseFloat(f.precioM2) || 0;
      return { ...f, superficieM2: valor, montoLista: String(redondear(superficie * precio)) };
    });
  }

  function actualizarPrecioM2(valor) {
    setForm((f) => {
      const precio = parseFloat(valor) || 0;
      const superficie = parseFloat(f.superficieM2) || 0;
      return { ...f, precioM2: valor, montoLista: String(redondear(superficie * precio)) };
    });
  }

  function actualizarMontoLista(valor) {
    setForm((f) => {
      const monto = parseFloat(valor) || 0;
      const superficie = parseFloat(f.superficieM2) || 0;
      return {
        ...f,
        montoLista: valor,
        precioM2: superficie > 0 ? String(redondear(monto / superficie)) : f.precioM2,
      };
    });
  }

  async function guardarUnidad(e) {
    e.preventDefault();
    setError("");
    if (!form.codigoUnidad.trim()) {
      setError("Captura el código de unidad.");
      return;
    }

    setGuardandoForm(true);
    const esNuevo = modalForm === "nuevo";
    const resultado = esNuevo
      ? await crearUnidad({ proyectoId: Number(proyectoId), ...form })
      : await actualizarUnidad(modalForm.id, form);
    setGuardandoForm(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setUnidades((filas) =>
      esNuevo
        ? [...filas, resultado.unidad].sort((a, b) => a.codigo_unidad.localeCompare(b.codigo_unidad, "es"))
        : filas.map((f) => (f.id === resultado.unidad.id ? resultado.unidad : f))
    );
    setModalForm(null);
  }

  async function cambiarEstatus(unidad, estatus) {
    setProcesandoEstatusId(unidad.id);
    setError("");
    const resultado = await cambiarEstatusUnidad(unidad.id, estatus);
    setProcesandoEstatusId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setUnidades((filas) => filas.map((f) => (f.id === unidad.id ? { ...f, estatus } : f)));
    setDetalle((d) => (d && d.id === unidad.id ? { ...d, estatus } : d));
  }

  async function recargarUnidades() {
    if (!proyectoId) return;
    const data = await getUnidades(Number(proyectoId));
    setUnidades(data);
  }

  function abrirVenta(unidad) {
    setVenta({
      paso: "datos",
      unidad,
      modoCliente: "existente",
      clienteId: "",
      clienteBusqueda: "",
      clienteAbierto: false,
      clienteNuevo: CLIENTE_NUEVO_VACIO,
      datos: VENTA_DATOS_VACIO,
      contratoId: null,
      plan: PLAN_VACIO,
      guardando: false,
      error: "",
    });
    setDetalle(null);
  }

  async function confirmarDatosVenta(e) {
    e.preventDefault();
    if (!venta) return;
    setVenta((v) => ({ ...v, error: "" }));

    if (venta.modoCliente === "existente" && !venta.clienteId) {
      setVenta((v) => ({ ...v, error: "Selecciona un cliente." }));
      return;
    }
    if (venta.modoCliente === "nuevo" && !venta.clienteNuevo.nombre.trim()) {
      setVenta((v) => ({ ...v, error: "Captura el nombre del cliente." }));
      return;
    }
    if (!(Number(venta.datos.montoTotal) > 0)) {
      setVenta((v) => ({ ...v, error: "Captura el monto total de venta." }));
      return;
    }

    setVenta((v) => ({ ...v, guardando: true }));

    let clienteId = venta.clienteId;
    if (venta.modoCliente === "nuevo") {
      const resultadoCliente = await buscarOCrearCliente(venta.clienteNuevo);
      if (resultadoCliente.error) {
        setVenta((v) => ({ ...v, guardando: false, error: resultadoCliente.error }));
        return;
      }
      clienteId = resultadoCliente.id;
      if (resultadoCliente.cliente) {
        setClientes((prev) => [...prev, resultadoCliente.cliente]);
      }
    }

    const resultado = await crearContratoVenta({
      proyectoId: Number(proyectoId),
      unidadId: venta.unidad.id,
      clienteId,
      montoTotal: venta.datos.montoTotal,
      fechaContrato: venta.datos.fechaContrato,
    });

    if (resultado.error) {
      setVenta((v) => ({ ...v, guardando: false, error: resultado.error }));
      return;
    }

    setUnidades((filas) => filas.map((f) => (f.id === venta.unidad.id ? { ...f, estatus: "VENDIDA" } : f)));
    setVenta((v) => ({ ...v, guardando: false, paso: "plan", contratoId: resultado.contrato.id }));
  }

  async function confirmarPlanVenta(e) {
    e.preventDefault();
    if (!venta) return;

    setVenta((v) => ({ ...v, guardando: true, error: "" }));
    const resultado = await generarPlanDePagos(venta.contratoId, venta.plan);
    setVenta((v) => ({ ...v, guardando: false }));

    if (resultado.error) {
      setVenta((v) => ({ ...v, error: resultado.error }));
      return;
    }

    setVenta(null);
  }

  const clientesFiltrados = useMemo(() => {
    if (!venta) return [];
    const termino = venta.clienteBusqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(termino) || (c.rfc ?? "").toLowerCase().includes(termino)
    );
  }, [clientes, venta]);

  const clienteBoxRef = useRef(null);
  useEffect(() => {
    function alClickFuera(e) {
      if (clienteBoxRef.current && !clienteBoxRef.current.contains(e.target)) {
        setVenta((v) => (v ? { ...v, clienteAbierto: false } : v));
      }
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  const selectClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={proyectoId}
          onChange={(e) => {
            const valor = e.target.value;
            setProyectoId(valor);
            if (valor) setCargando(true);
            else setUnidades([]);
          }}
          className={selectClase}
        >
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.nombre}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalImportar(true)}
            disabled={!proyectoId}
            className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            <Upload size={15} /> Importar Excel
          </button>
          <button
            type="button"
            onClick={abrirNuevaUnidad}
            disabled={!proyectoId}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            <Plus size={15} /> Nueva Unidad
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {cargando ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : unidades.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          Este proyecto no tiene unidades registradas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {unidades.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setDetalle(u)}
              className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:brightness-95 dark:hover:brightness-110 ${ESTILO_ESTATUS[u.estatus] ?? ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-black dark:text-zinc-50">{u.codigo_unidad}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_ESTATUS[u.estatus] ?? ""}`}>
                  {u.estatus}
                </span>
              </div>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{u.tipo_uso}</span>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span>{Number(u.superficie_m2).toLocaleString("es-MX")} m²</span>
                <span className="font-medium text-black dark:text-zinc-50">{formatoMXN(u.monto_lista)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal crear/editar specs de unidad */}
      {modalForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={guardarUnidad}
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                {modalForm === "nuevo" ? "Nueva Unidad" : "Editar Unidad"}
              </h3>
              <button
                type="button"
                onClick={() => setModalForm(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Código de Unidad</label>
              <input
                type="text"
                className={inputClase}
                value={form.codigoUnidad}
                onChange={(e) => setForm((f) => ({ ...f, codigoUnidad: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Superficie (m²)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.superficieM2}
                  onChange={(e) => actualizarSuperficie(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Tipo de Uso</label>
                <select
                  className={inputClase}
                  value={form.tipoUso}
                  onChange={(e) => setForm((f) => ({ ...f, tipoUso: e.target.value }))}
                >
                  {TIPOS_USO.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Precio por m²</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.precioM2}
                  onChange={(e) => actualizarPrecioM2(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Monto de Lista</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.montoLista}
                  onChange={(e) => actualizarMontoLista(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Monto de Lista = Superficie × Precio por m². Editar cualquiera de los tres recalcula los
              otros dos automáticamente.
            </p>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalForm(null)}
                disabled={guardandoForm}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoForm}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {guardandoForm ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de detalle/acciones de la unidad */}
      {detalle && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">{detalle.codigo_unidad}</h3>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Estatus</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_ESTATUS[detalle.estatus] ?? ""}`}>
                  {detalle.estatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Tipo de Uso</span>
                <span>{detalle.tipo_uso}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Superficie</span>
                <span>{Number(detalle.superficie_m2).toLocaleString("es-MX")} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Precio por m²</span>
                <span>{formatoMXN(detalle.precio_m2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Monto de Lista</span>
                <span className="font-medium">{formatoMXN(detalle.monto_lista)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => abrirEdicionUnidad(detalle)}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Editar Specs
              </button>

              {detalle.estatus === "SIN ASIGNAR" && (
                <button
                  type="button"
                  disabled={procesandoEstatusId === detalle.id}
                  onClick={() => cambiarEstatus(detalle, "APARTADA")}
                  className="rounded-full border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
                >
                  Apartar
                </button>
              )}

              {detalle.estatus === "APARTADA" && (
                <button
                  type="button"
                  disabled={procesandoEstatusId === detalle.id}
                  onClick={() => cambiarEstatus(detalle, "SIN ASIGNAR")}
                  className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                >
                  Liberar
                </button>
              )}

              {detalle.estatus !== "VENDIDA" && (
                <button
                  type="button"
                  onClick={() => abrirVenta(detalle)}
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  Vender / Asignar Cliente
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de venta: paso 1 (contrato) / paso 2 (plan de pagos) */}
      {venta && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          {venta.paso === "datos" ? (
            <form
              onSubmit={confirmarDatosVenta}
              className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                  Vender {venta.unidad.codigo_unidad} — Datos del Contrato
                </h3>
                <button
                  type="button"
                  onClick={() => setVenta(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVenta((v) => ({ ...v, modoCliente: "existente" }))}
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    venta.modoCliente === "existente"
                      ? "bg-foreground text-background"
                      : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                  }`}
                >
                  Cliente Existente
                </button>
                <button
                  type="button"
                  onClick={() => setVenta((v) => ({ ...v, modoCliente: "nuevo" }))}
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    venta.modoCliente === "nuevo"
                      ? "bg-foreground text-background"
                      : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                  }`}
                >
                  Cliente Nuevo
                </button>
              </div>

              {venta.modoCliente === "existente" ? (
                <div className="relative" ref={clienteBoxRef}>
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Busca por nombre o RFC…"
                    className={`${inputClase} w-full pl-8`}
                    value={venta.clienteBusqueda}
                    onFocus={() => setVenta((v) => ({ ...v, clienteAbierto: true }))}
                    onChange={(e) =>
                      setVenta((v) => ({ ...v, clienteBusqueda: e.target.value, clienteAbierto: true, clienteId: "" }))
                    }
                  />
                  {venta.clienteAbierto && (
                    <div className="absolute top-full z-10 mt-1 max-h-52 w-full overflow-y-auto rounded border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
                      {clientesFiltrados.length === 0 ? (
                        <p className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin resultados.</p>
                      ) : (
                        clientesFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setVenta((v) => ({
                                ...v,
                                clienteId: c.id,
                                clienteBusqueda: `${c.rfc ? "[" + c.rfc + "] " : ""}${c.nombre}`,
                                clienteAbierto: false,
                              }))
                            }
                            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                          >
                            {c.rfc && (
                              <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                [{c.rfc}]
                              </span>
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
                      value={venta.clienteNuevo.nombre}
                      onChange={(e) =>
                        setVenta((v) => ({ ...v, clienteNuevo: { ...v.clienteNuevo, nombre: e.target.value } }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className={labelClase}>RFC (opcional)</label>
                      <input
                        type="text"
                        className={`${inputClase} uppercase`}
                        value={venta.clienteNuevo.rfc}
                        onChange={(e) =>
                          setVenta((v) => ({
                            ...v,
                            clienteNuevo: { ...v.clienteNuevo, rfc: e.target.value.toUpperCase() },
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelClase}>Teléfono (opcional)</label>
                      <input
                        type="text"
                        className={inputClase}
                        value={venta.clienteNuevo.telefono}
                        onChange={(e) =>
                          setVenta((v) => ({ ...v, clienteNuevo: { ...v.clienteNuevo, telefono: e.target.value } }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClase}>Email (opcional)</label>
                    <input
                      type="email"
                      className={inputClase}
                      value={venta.clienteNuevo.email}
                      onChange={(e) =>
                        setVenta((v) => ({ ...v, clienteNuevo: { ...v.clienteNuevo, email: e.target.value } }))
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Monto Total de Venta</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClase}
                    value={venta.datos.montoTotal}
                    onChange={(e) => setVenta((v) => ({ ...v, datos: { ...v.datos, montoTotal: e.target.value } }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Fecha de Contrato</label>
                  <input
                    type="date"
                    className={inputClase}
                    value={venta.datos.fechaContrato}
                    onChange={(e) =>
                      setVenta((v) => ({ ...v, datos: { ...v.datos, fechaContrato: e.target.value } }))
                    }
                  />
                </div>
              </div>

              {venta.error && <p className="text-sm text-red-600 dark:text-red-400">{venta.error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setVenta(null)}
                  disabled={venta.guardando}
                  className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={venta.guardando}
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {venta.guardando ? "Guardando…" : "Continuar: Plan de Pagos"}
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={confirmarPlanVenta}
              className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                  Plan de Pagos — {venta.unidad.codigo_unidad}
                </h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Captura los conceptos que apliquen; cada uno es opcional. Las mensualidades se generan
                mensuales consecutivas a partir de la primera fecha.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Monto Enganche</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClase}
                    value={venta.plan.montoEnganche}
                    onChange={(e) => setVenta((v) => ({ ...v, plan: { ...v.plan, montoEnganche: e.target.value } }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Fecha Enganche</label>
                  <input
                    type="date"
                    className={inputClase}
                    value={venta.plan.fechaEnganche}
                    onChange={(e) => setVenta((v) => ({ ...v, plan: { ...v.plan, fechaEnganche: e.target.value } }))}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}># Mensualidades</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClase}
                    value={venta.plan.numMensualidades}
                    onChange={(e) =>
                      setVenta((v) => ({ ...v, plan: { ...v.plan, numMensualidades: e.target.value } }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Monto por Mensualidad</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClase}
                    value={venta.plan.montoMensualidad}
                    onChange={(e) =>
                      setVenta((v) => ({ ...v, plan: { ...v.plan, montoMensualidad: e.target.value } }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className={labelClase}>Fecha Primera Mensualidad</label>
                  <input
                    type="date"
                    className={inputClase}
                    value={venta.plan.fechaPrimeraMensualidad}
                    onChange={(e) =>
                      setVenta((v) => ({ ...v, plan: { ...v.plan, fechaPrimeraMensualidad: e.target.value } }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Monto a Entrega</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClase}
                    value={venta.plan.montoEntrega}
                    onChange={(e) => setVenta((v) => ({ ...v, plan: { ...v.plan, montoEntrega: e.target.value } }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Fecha Estimada Entrega</label>
                  <input
                    type="date"
                    className={inputClase}
                    value={venta.plan.fechaEntrega}
                    onChange={(e) => setVenta((v) => ({ ...v, plan: { ...v.plan, fechaEntrega: e.target.value } }))}
                  />
                </div>
              </div>

              {venta.error && <p className="text-sm text-red-600 dark:text-red-400">{venta.error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setVenta(null)}
                  disabled={venta.guardando}
                  className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                >
                  Omitir por Ahora
                </button>
                <button
                  type="submit"
                  disabled={venta.guardando}
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {venta.guardando ? "Guardando…" : "Generar Plan de Pagos"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {modalImportar && (
        <ModalImportarUnidades
          proyectoId={Number(proyectoId)}
          onImportado={() => {
            setModalImportar(false);
            recargarUnidades();
          }}
          onCerrar={() => setModalImportar(false)}
        />
      )}
    </div>
  );
}
