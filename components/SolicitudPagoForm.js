"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Trash2, Users, X } from "lucide-react";
import { crearSolicitudPago, getFolioPreview } from "@/app/actions/solicitudes";

const TASA_IVA = 0.16;
const METODOS_PAGO = ["Transferencia bancaria", "Efectivo"];

const FORM_VACIO = {
  proyectoId: "",
  metodoPago: METODOS_PAGO[0],
  solicitante: "",
  numFactura: "",
  wbsCategoria: "",
  wbsPartida: "",
  fechaProgramada: "",
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

const fechaHoy = new Date().toLocaleDateString("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/** Formulario de captura de solicitudes de pago con alta de proveedores en vivo. */
export default function SolicitudPagoForm({ proyectos, proveedores: proveedoresIniciales }) {
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [modoProveedor, setModoProveedor] = useState("existente");
  const [proveedorId, setProveedorId] = useState("");
  const [proveedorNuevo, setProveedorNuevo] = useState(PROVEEDOR_NUEVO_VACIO);
  const [form, setForm] = useState(FORM_VACIO);
  const [partidas, setPartidas] = useState([partidaVacia()]);
  const [aplicaIva, setAplicaIva] = useState(true);
  const [folioPreview, setFolioPreview] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!form.proyectoId) {
      setFolioPreview(null);
      return;
    }
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

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function actualizarProveedorNuevo(campo, valor) {
    setProveedorNuevo((p) => ({ ...p, [campo]: valor }));
  }

  function cambiarModoProveedor(modo) {
    setModoProveedor(modo);
    setProveedorId("");
    setProveedorNuevo(PROVEEDOR_NUEVO_VACIO);
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

    if (!form.fechaProgramada) return "Selecciona la fecha programada de pago.";

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
      partidas: partidasValidas,
      aplicaIva,
      subtotal,
      iva,
      total,
      fechaProgramada: form.fechaProgramada,
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
    setProveedorNuevo(PROVEEDOR_NUEVO_VACIO);
    setModoProveedor("existente");
    setToast(resultado.folio);
  }

  const inputClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
  const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <div className="relative">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-8 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950"
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
                onChange={(e) => actualizarCampo("proyectoId", e.target.value)}
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
              <select
                className={inputClase}
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
              >
                <option value="">Selecciona un proveedor…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razon_social}
                  </option>
                ))}
              </select>
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
            <label className={labelClase}>Fecha Programada de Pago</label>
            <input
              type="date"
              className={inputClase}
              value={form.fechaProgramada}
              onChange={(e) => actualizarCampo("fechaProgramada", e.target.value)}
            />
          </div>
        </section>

        {/* Clasificación WBS */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Clasificación WBS
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>WBS Categoría</label>
              <input
                type="text"
                placeholder="9 — Gerencia de Obra"
                className={inputClase}
                value={form.wbsCategoria}
                onChange={(e) => actualizarCampo("wbsCategoria", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>WBS Partida</label>
              <input
                type="text"
                placeholder="9.1.1 — Owner's REP"
                className={inputClase}
                value={form.wbsPartida}
                onChange={(e) => actualizarCampo("wbsPartida", e.target.value)}
              />
            </div>
          </div>
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
