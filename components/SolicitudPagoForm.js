"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Search, Trash2, Users, X } from "lucide-react";
import { crearSolicitudPago, getFolioPreview } from "@/app/actions/solicitudes";
import { compararCodigoWbsNatural, construirRutaWbs } from "@/lib/wbs";

const TASA_IVA = 0.16;
const METODOS_PAGO = ["Transferencia bancaria", "Efectivo"];

const FORM_VACIO = {
  proyectoId: "",
  metodoPago: METODOS_PAGO[0],
  solicitante: "",
  numFactura: "",
  wbsCategoria: "",
  wbsPartida: "",
  wbsCatalogId: null,
};

const PROVEEDOR_NUEVO_VACIO = {
  razonSocial: "",
  rfc: "",
  banco: "Banregio",
  numeroCuenta: "",
  clabe: "",
};

function partidaVacia() {
  return { id: crypto.randomUUID(), cantidad: "", descripcion: "", precioUnitario: "" };
}

function subtotalPartida(p) {
  const cantidad = parseFloat(p.cantidad) || 0;
  const precio = parseFloat(p.precioUnitario) || 0;
  return Math.round(cantidad * precio * 100) / 100;
}

function formatoMXN(valor) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function calcularProximoViernes() {
  const hoy = new Date();
  const diasHastaViernes = ((5 - hoy.getDay() + 7) % 7) || 7;
  const viernes = new Date(hoy);
  viernes.setDate(hoy.getDate() + diasHastaViernes);
  return viernes;
}

const fechaHoy = new Date().toLocaleDateString("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const proximoViernes = calcularProximoViernes();
const fechaProgramadaISO = proximoViernes.toISOString().slice(0, 10);
const fechaProgramadaDisplay = proximoViernes.toLocaleDateString("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Formulario de captura de solicitudes de pago con alta de proveedores en vivo. */
export default function SolicitudPagoForm({ proyectos, proveedores: proveedoresIniciales, wbsCatalog }) {
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [modoProveedor, setModoProveedor] = useState("existente");
  const [proveedorId, setProveedorId] = useState("");
  const [proveedorBusqueda, setProveedorBusqueda] = useState("");
  const [proveedorAbierto, setProveedorAbierto] = useState(false);
  const proveedorBoxRef = useRef(null);
  const [proveedorNuevo, setProveedorNuevo] = useState(PROVEEDOR_NUEVO_VACIO);
  const [form, setForm] = useState(FORM_VACIO);
  const [partidas, setPartidas] = useState([partidaVacia()]);
  const [aplicaIva, setAplicaIva] = useState(true);
  const [folioPreview, setFolioPreview] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!form.proyectoId) return;
    let vigente = true;
    getFolioPreview(Number(form.proyectoId)).then((folio) => {
      if (vigente) setFolioPreview(folio);
    });
    return () => {
      vigente = false;
    };
  }, [form.proyectoId]);

  const subtotal = useMemo(
    () => Math.round(partidas.reduce((acc, p) => acc + subtotalPartida(p), 0) * 100) / 100,
    [partidas]
  );
  const iva = useMemo(
    () => (aplicaIva ? Math.round(subtotal * TASA_IVA * 100) / 100 : 0),
    [subtotal, aplicaIva]
  );
  const total = useMemo(() => Math.round((subtotal + iva) * 100) / 100, [subtotal, iva]);

  const proveedoresFiltrados = useMemo(() => {
    const termino = proveedorBusqueda.trim().toLowerCase();
    if (!termino) return proveedores;
    return proveedores.filter(
      (p) =>
        p.razon_social.toLowerCase().includes(termino) || (p.rfc ?? "").toLowerCase().includes(termino)
    );
  }, [proveedores, proveedorBusqueda]);

  useEffect(() => {
    function alClickFuera(e) {
      if (proveedorBoxRef.current && !proveedorBoxRef.current.contains(e.target)) {
        setProveedorAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  const wbsPorId = useMemo(() => new Map(wbsCatalog.map((w) => [w.id, w])), [wbsCatalog]);
  const wbsConHijos = useMemo(
    () => new Set(wbsCatalog.filter((w) => w.parent_id).map((w) => w.parent_id)),
    [wbsCatalog]
  );

  const wbsHojas = useMemo(
    () =>
      form.proyectoId
        ? wbsCatalog
            .filter((w) => !wbsConHijos.has(w.id))
            .filter((w) => String(w.proyecto_id) === form.proyectoId)
            .map((w) => ({ ...w, ruta: construirRutaWbs(w, wbsPorId) }))
            .sort((a, b) => compararCodigoWbsNatural(a.codigo, b.codigo))
        : [],
    [wbsCatalog, wbsConHijos, wbsPorId, form.proyectoId]
  );

  const [wbsBusqueda, setWbsBusqueda] = useState("");
  const [wbsAbierto, setWbsAbierto] = useState(false);
  const wbsBoxRef = useRef(null);

  const wbsFiltrado = useMemo(() => {
    const termino = wbsBusqueda.trim().toLowerCase();
    if (!termino) return wbsHojas;
    return wbsHojas.filter((w) => `${w.codigo ?? ""} ${w.ruta}`.toLowerCase().includes(termino));
  }, [wbsHojas, wbsBusqueda]);

  const wbsSeleccionado = form.wbsCatalogId ? wbsPorId.get(form.wbsCatalogId) : null;
  const excedePresupuesto =
    wbsSeleccionado && wbsSeleccionado.disponible != null && total > Number(wbsSeleccionado.disponible);

  useEffect(() => {
    function alClickFuera(e) {
      if (wbsBoxRef.current && !wbsBoxRef.current.contains(e.target)) {
        setWbsAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Al cambiar (o limpiar) el proyecto, la partida WBS ya seleccionada deja
  // de ser válida (pertenece al catálogo de otro proyecto o no hay proyecto
  // aún): se resetea aquí mismo, en el evento que dispara el cambio, en vez
  // de en un Effect aparte.
  function cambiarProyecto(valor) {
    setForm((f) => ({ ...f, proyectoId: valor, wbsCategoria: "", wbsPartida: "", wbsCatalogId: null }));
    setWbsBusqueda("");
    setWbsAbierto(false);
  }

  function seleccionarWbs(entrada) {
    setForm((f) => ({ ...f, wbsCategoria: entrada.categoria, wbsPartida: entrada.partida, wbsCatalogId: entrada.id }));
    setWbsBusqueda(`${entrada.codigo ? "[" + entrada.codigo + "] " : ""}${entrada.ruta}`);
    setWbsAbierto(false);
  }

  function actualizarProveedorNuevo(campo, valor) {
    setProveedorNuevo((p) => ({ ...p, [campo]: valor }));
  }

  function cambiarModoProveedor(modo) {
    setModoProveedor(modo);
    setProveedorId("");
    setProveedorBusqueda("");
    setProveedorNuevo(PROVEEDOR_NUEVO_VACIO);
  }

  function seleccionarProveedor(p) {
    setProveedorId(String(p.id));
    setProveedorBusqueda(`${p.rfc ? "[" + p.rfc + "] " : ""}${p.razon_social}`);
    setProveedorAbierto(false);
  }

  function actualizarPartida(id, campo, valor) {
    setPartidas((filas) => filas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function agregarPartida() {
    setPartidas((filas) => [...filas, partidaVacia()]);
  }

  function eliminarPartida(id) {
    setPartidas((filas) => (filas.length > 1 ? filas.filter((f) => f.id !== id) : filas));
  }

  function validar() {
    if (!form.proyectoId) return "Selecciona un proyecto.";
    if (!form.solicitante.trim()) return "Captura el solicitante.";
    if (modoProveedor === "existente" && !proveedorId) return "Selecciona un proveedor.";

    if (modoProveedor === "nuevo") {
      if (!proveedorNuevo.razonSocial.trim()) return "Captura la razón social del proveedor.";
      if (proveedorNuevo.banco === "Banregio" && !proveedorNuevo.numeroCuenta.trim()) {
        return "Captura el número de cuenta Banregio.";
      }
      if (proveedorNuevo.banco === "Otro" && !/^\d{18}$/.test(proveedorNuevo.clabe)) {
        return "La CLABE interbancaria debe tener exactamente 18 dígitos.";
      }
    }

    const partidasValidas = partidas.filter(
      (p) => p.descripcion.trim() && parseFloat(p.cantidad) > 0 && parseFloat(p.precioUnitario) > 0
    );
    if (partidasValidas.length === 0) {
      return "Agrega al menos una partida con descripción, cantidad y precio unitario.";
    }

    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const mensajeError = validar();
    if (mensajeError) {
      setError(mensajeError);
      return;
    }

    setEnviando(true);

    const partidasValidas = partidas
      .filter((p) => p.descripcion.trim() && parseFloat(p.cantidad) > 0 && parseFloat(p.precioUnitario) > 0)
      .map((p) => ({
        cantidad: parseFloat(p.cantidad),
        descripcion: p.descripcion.trim(),
        precio_unitario: parseFloat(p.precioUnitario),
        subtotal: subtotalPartida(p),
      }));

    const proveedorPayload =
      modoProveedor === "existente"
        ? { id: Number(proveedorId) }
        : {
            nuevo: true,
            razonSocial: proveedorNuevo.razonSocial,
            rfc: proveedorNuevo.rfc,
            datosBancarios:
              proveedorNuevo.banco === "Banregio"
                ? { banco: "Banregio", numero_cuenta: proveedorNuevo.numeroCuenta }
                : { banco: "Otro", clabe: proveedorNuevo.clabe },
          };

    const resultado = await crearSolicitudPago({
      proyectoId: Number(form.proyectoId),
      proveedor: proveedorPayload,
      metodoPago: form.metodoPago,
      solicitante: form.solicitante,
      numFactura: form.numFactura,
      wbsCategoria: form.wbsCategoria,
      wbsPartida: form.wbsPartida,
      wbsCatalogId: form.wbsCatalogId,
      partidas: partidasValidas,
      aplicaIva,
      subtotal,
      iva,
      total,
      fechaProgramada: fechaProgramadaISO,
    });

    setEnviando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    if (resultado.proveedorCreado) {
      setProveedores((prev) =>
        [...prev, resultado.proveedorCreado].sort((a, b) =>
          a.razon_social.localeCompare(b.razon_social)
        )
      );
    }

    setForm(FORM_VACIO);
    setPartidas([partidaVacia()]);
    setAplicaIva(true);
    setProveedorId("");
    setProveedorBusqueda("");
    setProveedorNuevo(PROVEEDOR_NUEVO_VACIO);
    setModoProveedor("existente");
    setWbsBusqueda("");
    setToast(resultado.folio);
  }

  const inputClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
  const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <div className="relative">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-8 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
      >
        {/* Encabezado */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Encabezado
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Proyecto</label>
              <select
                className={inputClase}
                value={form.proyectoId}
                onChange={(e) => cambiarProyecto(e.target.value)}
              >
                <option value="">Selecciona un proyecto…</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Fecha</label>
              <div className={`${inputClase} bg-black/[.03] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400`}>
                {fechaHoy}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Método de Pago</label>
              <select
                className={inputClase}
                value={form.metodoPago}
                onChange={(e) => actualizarCampo("metodoPago", e.target.value)}
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Datos secundarios */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Datos Secundarios
          </h2>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cambiarModoProveedor("existente")}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  modoProveedor === "existente"
                    ? "bg-foreground text-background"
                    : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                }`}
              >
                <Users size={14} /> Proveedor Existente
              </button>
              <button
                type="button"
                onClick={() => cambiarModoProveedor("nuevo")}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  modoProveedor === "nuevo"
                    ? "bg-foreground text-background"
                    : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                }`}
              >
                <Plus size={14} /> Registrar Nuevo
              </button>
            </div>

            {modoProveedor === "existente" ? (
              <div className="relative" ref={proveedorBoxRef}>
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  placeholder="Busca por razón social o RFC…"
                  className={`${inputClase} w-full pl-8`}
                  value={proveedorBusqueda}
                  onFocus={() => setProveedorAbierto(true)}
                  onChange={(e) => {
                    setProveedorBusqueda(e.target.value);
                    setProveedorAbierto(true);
                    if (proveedorId) setProveedorId("");
                  }}
                />

                {proveedorAbierto && (
                  <div className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
                    {proveedoresFiltrados.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin resultados.</p>
                    ) : (
                      proveedoresFiltrados.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => seleccionarProveedor(p)}
                          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                        >
                          {p.rfc && (
                            <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                              [{p.rfc}]
                            </span>
                          )}
                          <span className="text-black dark:text-zinc-50">{p.razon_social}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded border border-dashed border-black/[.08] p-4 dark:border-white/[.145]">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Razón Social</label>
                  <input
                    type="text"
                    className={inputClase}
                    value={proveedorNuevo.razonSocial}
                    onChange={(e) => actualizarProveedorNuevo("razonSocial", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>RFC (opcional)</label>
                  <input
                    type="text"
                    className={`${inputClase} uppercase`}
                    value={proveedorNuevo.rfc}
                    onChange={(e) => actualizarProveedorNuevo("rfc", e.target.value.toUpperCase())}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClase}>Banco</label>
                  <select
                    className={inputClase}
                    value={proveedorNuevo.banco}
                    onChange={(e) => actualizarProveedorNuevo("banco", e.target.value)}
                  >
                    <option value="Banregio">Banregio</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                {proveedorNuevo.banco === "Banregio" ? (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClase}>Número de Cuenta</label>
                    <input
                      type="text"
                      className={inputClase}
                      value={proveedorNuevo.numeroCuenta}
                      onChange={(e) => actualizarProveedorNuevo("numeroCuenta", e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClase}>CLABE Interbancaria (18 dígitos)</label>
                    <input
                      type="text"
                      maxLength={18}
                      className={inputClase}
                      value={proveedorNuevo.clabe}
                      onChange={(e) =>
                        actualizarProveedorNuevo("clabe", e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Folio</label>
              <div className={`${inputClase} bg-black/[.03] font-mono text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400`}>
                {folioPreview ?? "—"}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Solicitante</label>
              <input
                type="text"
                maxLength={10}
                placeholder="Ej. AB"
                className={inputClase}
                value={form.solicitante}
                onChange={(e) => actualizarCampo("solicitante", e.target.value.toUpperCase())}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}># Factura (opcional)</label>
              <input
                type="text"
                className={inputClase}
                value={form.numFactura}
                onChange={(e) => actualizarCampo("numFactura", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <label className={labelClase}>Fecha Estimada de Pago</label>
            <div
              className={`${inputClase} inline-flex w-fit items-center gap-2 bg-black/[.03] text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400`}
            >
              <CalendarClock size={14} />
              Próximo viernes: {fechaProgramadaDisplay}
            </div>
          </div>
        </section>

        {/* Clasificación WBS */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Clasificación WBS
          </h2>
          <div className="relative flex flex-col gap-1.5 sm:max-w-md" ref={wbsBoxRef}>
            <label className={labelClase}>Partida WBS</label>
            {!form.proyectoId ? (
              <p className="rounded border border-dashed border-black/[.08] px-3 py-2.5 text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
                Selecciona un proyecto primero para cargar su catálogo WBS
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Busca por código, categoría o partida…"
                    className={`${inputClase} w-full pl-8`}
                    value={wbsBusqueda}
                    onFocus={() => setWbsAbierto(true)}
                    onChange={(e) => {
                      setWbsBusqueda(e.target.value);
                      setWbsAbierto(true);
                      if (form.wbsCatalogId) {
                        setForm((f) => ({ ...f, wbsCategoria: "", wbsPartida: "", wbsCatalogId: null }));
                      }
                    }}
                  />
                </div>

                {wbsAbierto && (
                  <div className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
                    {wbsFiltrado.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin resultados.</p>
                    ) : (
                      wbsFiltrado.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => seleccionarWbs(w)}
                          className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                        >
                          <span className="flex items-start gap-1.5">
                            {w.codigo && (
                              <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                [{w.codigo}]
                              </span>
                            )}
                            <span className="text-black dark:text-zinc-50">{w.ruta}</span>
                          </span>
                          {w.disponible != null && (
                            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                              Disp. {formatoMXN(Number(w.disponible))}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {excedePresupuesto && (
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={14} />
              El total de esta solicitud ({formatoMXN(total)}) excede el disponible presupuestal de la
              partida seleccionada ({formatoMXN(Number(wbsSeleccionado.disponible))}).
            </p>
          )}
        </section>

        {/* Partidas */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Partidas
            </h2>
            <button
              type="button"
              onClick={agregarPartida}
              className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              <Plus size={13} /> Agregar renglón
            </button>
          </div>

          <div className="flex flex-col gap-2 overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-[80px_1fr_140px_140px_36px] gap-2 px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span>Cantidad</span>
              <span>Descripción</span>
              <span>Precio Unitario</span>
              <span>Subtotal</span>
              <span />
            </div>

            {partidas.map((p) => (
              <div
                key={p.id}
                className="grid min-w-[560px] grid-cols-[80px_1fr_140px_140px_36px] items-center gap-2"
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={inputClase}
                  value={p.cantidad}
                  onChange={(e) => actualizarPartida(p.id, "cantidad", e.target.value)}
                />
                <input
                  type="text"
                  className={inputClase}
                  value={p.descripcion}
                  onChange={(e) => actualizarPartida(p.id, "descripcion", e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={p.precioUnitario}
                  onChange={(e) => actualizarPartida(p.id, "precioUnitario", e.target.value)}
                />
                <div className={`${inputClase} bg-black/[.03] text-right dark:bg-white/[.04]`}>
                  {formatoMXN(subtotalPartida(p))}
                </div>
                <button
                  type="button"
                  onClick={() => eliminarPartida(p.id)}
                  disabled={partidas.length === 1}
                  className="flex items-center justify-center text-zinc-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-zinc-400 dark:hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Resumen financiero */}
        <section className="flex flex-col gap-3 self-end sm:w-72">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Subtotal</span>
            <span className="font-medium">{formatoMXN(subtotal)}</span>
          </div>

          <label className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={aplicaIva}
                onChange={(e) => setAplicaIva(e.target.checked)}
              />
              Aplica IVA (16%)
            </span>
            <span className="font-medium">{formatoMXN(iva)}</span>
          </label>

          <div className="flex items-center justify-between border-t border-black/[.08] pt-3 text-base font-semibold dark:border-white/[.145]">
            <span>Total</span>
            <span>{formatoMXN(total)}</span>
          </div>
        </section>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="self-start rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {enviando ? "Guardando…" : "Crear Solicitud de Pago"}
        </button>
      </form>

      {toast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-3 rounded-lg border border-black/[.08] bg-white px-5 py-4 shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
          <CheckCircle2 className="text-green-600 dark:text-green-500" size={20} />
          <div className="flex flex-col">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Solicitud creada</span>
            <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {toast}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
