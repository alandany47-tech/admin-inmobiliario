"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { getUnidadesDisponibles } from "@/app/actions/unidades";
import { crearCotizacion } from "@/app/actions/cotizaciones";
import { descargarCotizacionPdf } from "@/components/PlantillaCotizacion";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function redondear(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

const SIMULADOR_VACIO = {
  montoTotal: "",
  montoSeparacion: "",
  porcentajeEnganche: "",
  plazoMeses: "",
  saldoEntrega: "",
};

/** Cotizador: sobre unidades del inventario o libre, con simulador de pagos y generación de PDF (guarda historial). */
export default function Cotizador({ proyectos, historial: historialInicial }) {
  const [tipo, setTipo] = useState("UNIDAD");
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [unidades, setUnidades] = useState([]);
  const [unidadId, setUnidadId] = useState("");
  const [descripcionLibre, setDescripcionLibre] = useState("");

  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [esquema, setEsquema] = useState("TRADICIONAL");

  const [sim, setSim] = useState(SIMULADOR_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState(historialInicial);

  useEffect(() => {
    if (tipo !== "UNIDAD" || !proyectoId) return;
    let vigente = true;
    getUnidadesDisponibles(Number(proyectoId)).then((data) => {
      if (vigente) setUnidades(data);
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId, tipo]);

  function cambiarTipo(valor) {
    setTipo(valor);
    setUnidadId("");
    setSim(SIMULADOR_VACIO);
  }

  function seleccionarUnidad(id) {
    setUnidadId(id);
    const unidad = unidades.find((u) => u.id === id);
    if (unidad) {
      setEsquema(unidad.esquema_unidad);
      setSim((s) => ({ ...s, montoTotal: String(unidad.monto_lista) }));
    }
  }

  const proyecto = proyectos.find((p) => String(p.id) === proyectoId) ?? null;
  const unidad = unidades.find((u) => u.id === unidadId) ?? null;

  const montoEnganche = useMemo(() => {
    const total = parseFloat(sim.montoTotal) || 0;
    const pct = parseFloat(sim.porcentajeEnganche) || 0;
    return redondear((total * pct) / 100);
  }, [sim.montoTotal, sim.porcentajeEnganche]);

  const montoMensualidad = useMemo(() => {
    const total = parseFloat(sim.montoTotal) || 0;
    const separacion = parseFloat(sim.montoSeparacion) || 0;
    const entrega = parseFloat(sim.saldoEntrega) || 0;
    const plazo = parseInt(sim.plazoMeses, 10) || 0;
    if (plazo <= 0) return 0;
    return redondear((total - separacion - montoEnganche - entrega) / plazo);
  }, [sim.montoTotal, sim.montoSeparacion, sim.saldoEntrega, sim.plazoMeses, montoEnganche]);

  async function guardarYGenerar(e) {
    e.preventDefault();
    setError("");

    if (!clienteNombre.trim()) {
      setError("Captura el nombre del cliente.");
      return;
    }
    if (!(parseFloat(sim.montoTotal) > 0)) {
      setError("Captura el monto total a cotizar.");
      return;
    }
    if (tipo === "UNIDAD" && !unidadId) {
      setError("Selecciona una unidad.");
      return;
    }

    setGuardando(true);

    const payload = {
      proyectoId: tipo === "UNIDAD" ? Number(proyectoId) : null,
      unidadId: tipo === "UNIDAD" ? unidadId : null,
      clienteNombre,
      clienteEmail,
      clienteTelefono,
      tipoCotizacion: tipo,
      descripcionLibre: tipo === "LIBRE" ? descripcionLibre : "",
      montoTotal: sim.montoTotal,
      esquema,
      montoSeparacion: sim.montoSeparacion,
      porcentajeEnganche: sim.porcentajeEnganche,
      montoEnganche,
      plazoMeses: sim.plazoMeses,
      montoMensualidad,
      saldoEntrega: sim.saldoEntrega,
    };

    const resultado = await crearCotizacion(payload);
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    await descargarCotizacionPdf({
      folio: resultado.cotizacion.folio,
      clienteNombre,
      proyecto: tipo === "UNIDAD" ? proyecto : null,
      unidadCodigo: unidad?.codigo_unidad ?? null,
      descripcionLibre,
      montoTotal: sim.montoTotal,
      esquema,
      montoSeparacion: sim.montoSeparacion,
      montoEnganche,
      porcentajeEnganche: sim.porcentajeEnganche,
      plazoMeses: sim.plazoMeses,
      montoMensualidad,
      saldoEntrega: sim.saldoEntrega,
    });

    setHistorial((h) => [
      {
        ...resultado.cotizacion,
        proyectos: tipo === "UNIDAD" ? { codigo: proyecto?.codigo, nombre: proyecto?.nombre } : null,
        unidades: tipo === "UNIDAD" ? { codigo_unidad: unidad?.codigo_unidad } : null,
      },
      ...h,
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={guardarYGenerar}
        className="flex flex-col gap-5 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cambiarTipo("UNIDAD")}
            className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tipo === "UNIDAD"
                ? "bg-foreground text-background"
                : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
            }`}
          >
            Unidad Existente
          </button>
          <button
            type="button"
            onClick={() => cambiarTipo("LIBRE")}
            className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tipo === "LIBRE"
                ? "bg-foreground text-background"
                : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
            }`}
          >
            Cotización Libre
          </button>
        </div>

        {tipo === "UNIDAD" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Proyecto</label>
              <select
                className={inputClase}
                value={proyectoId}
                onChange={(e) => {
                  setProyectoId(e.target.value);
                  setUnidadId("");
                }}
              >
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Unidad</label>
              <select className={inputClase} value={unidadId} onChange={(e) => seleccionarUnidad(e.target.value)}>
                <option value="">Selecciona una unidad…</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo_unidad} — {formatoMXN(u.monto_lista)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Descripción</label>
            <input
              type="text"
              placeholder="Ej. Local comercial planta baja, 45 m²"
              className={inputClase}
              value={descripcionLibre}
              onChange={(e) => setDescripcionLibre(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Cliente</label>
            <input type="text" className={inputClase} value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Email (opcional)</label>
            <input type="email" className={inputClase} value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Teléfono (opcional)</label>
            <input type="text" className={inputClase} value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label className={labelClase}>Esquema</label>
          <select className={inputClase} value={esquema} onChange={(e) => setEsquema(e.target.value)}>
            <option value="TRADICIONAL">Tradicional</option>
            <option value="INVERSIONISTA">Inversionista</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Monto Total</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClase}
              value={sim.montoTotal}
              onChange={(e) => setSim((s) => ({ ...s, montoTotal: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Separación</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClase}
              value={sim.montoSeparacion}
              onChange={(e) => setSim((s) => ({ ...s, montoSeparacion: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Enganche (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              className={inputClase}
              value={sim.porcentajeEnganche}
              onChange={(e) => setSim((s) => ({ ...s, porcentajeEnganche: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Plazo (meses)</label>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClase}
              value={sim.plazoMeses}
              onChange={(e) => setSim((s) => ({ ...s, plazoMeses: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Saldo a Entrega</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClase}
              value={sim.saldoEntrega}
              onChange={(e) => setSim((s) => ({ ...s, saldoEntrega: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-black/[.02] p-4 text-sm dark:border-white/[.145] dark:bg-white/[.03]">
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Enganche calculado</span>
            <span className="font-medium">{formatoMXN(montoEnganche)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Mensualidad calculada</span>
            <span className="font-medium">{formatoMXN(montoMensualidad)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={guardando}
          className="flex w-fit items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          <FileDown size={15} /> {guardando ? "Generando…" : "Guardar y Generar PDF"}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Historial de Cotizaciones</h2>
        {historial.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            Todavía no se ha generado ninguna cotización.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                  <th className="px-4 py-3">Folio</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Proyecto / Unidad</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                    <td className="px-4 py-3 font-mono text-xs">{c.folio}</td>
                    <td className="px-4 py-3">{c.cliente_nombre}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {c.unidades?.codigo_unidad
                        ? `${c.proyectos?.codigo ?? ""} — ${c.unidades.codigo_unidad}`
                        : c.descripcion_libre || "Cotización libre"}
                    </td>
                    <td className="px-4 py-3 text-right">{formatoMXN(c.monto_total)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatoFecha(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
