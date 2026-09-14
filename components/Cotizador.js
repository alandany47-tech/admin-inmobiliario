"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, ImagePlus, Trash2, X } from "lucide-react";
import { getUnidadesDisponibles } from "@/app/actions/unidades";
import { crearCotizacion, eliminarCotizacion, subirImagenCotizacionLibre } from "@/app/actions/cotizaciones";
import { descargarCotizacionPdf } from "@/components/PlantillaCotizacion";
import CampoNumerico from "@/components/CampoNumerico";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function redondear(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function clamp(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

const SIMULADOR_VACIO = {
  montoTotal: "",
  montoSeparacion: "",
  pctEnganche: 30,
  pctEntrega: 0,
  plazoMeses: "",
};

const ESQUEMAS_PRESET = [
  { id: "90-10", etiqueta: "90 / 10", pctEnganche: 90, pctEntrega: 10 },
  { id: "15-45-40", etiqueta: "15 / 45 / 40", pctEnganche: 15, pctEntrega: 40 },
];

const COLOR_MENSUALIDADES = "#a1a1aa"; // zinc-400: color neutro para el tramo "automático" de la barra

/**
 * Barra de distribución del monto total: dos manijas arrastrables (o captura
 * numérica directa) reparten Enganche / Mensualidades (automático) / Entrega
 * como porcentajes. Una marca dentro del tramo de Enganche indica cuánto de
 * ese porcentaje ya está cubierto por el monto de Separación.
 */
function BarraDistribucion({ total, pctEnganche, pctEntrega, montoSeparacion, colorPrimario, onCambiar }) {
  const barraRef = useRef(null);
  const pctMensualidades = Math.max(0, 100 - pctEnganche - pctEntrega);
  const montoEnganche = redondear((total * pctEnganche) / 100);
  const montoEntrega = redondear((total * pctEntrega) / 100);
  const montoMensualidades = redondear(total - montoEnganche - montoEntrega);
  const pctSeparacionEnBarra = total > 0 ? clamp((montoSeparacion / total) * 100, 0, pctEnganche) : 0;

  function iniciarArrastre(manija) {
    return (evento) => {
      evento.preventDefault();
      const barra = barraRef.current;
      if (!barra) return;

      function mover(e) {
        const rect = barra.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
        if (manija === "enganche") {
          onCambiar({ pctEnganche: Math.round(clamp(pct, 0, 100 - pctEntrega)) });
        } else {
          onCambiar({ pctEntrega: Math.round(clamp(100 - pct, 0, 100 - pctEnganche)) });
        }
      }
      function soltar() {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
      }
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={barraRef}
        className="relative h-9 w-full touch-none overflow-hidden rounded-full border border-black/[.08] dark:border-white/[.145]"
      >
        <div className="absolute inset-y-0 left-0 flex items-center justify-center text-[11px] font-semibold text-white transition-[width]" style={{ width: `${pctEnganche}%`, backgroundColor: colorPrimario }}>
          {pctEnganche >= 10 && `${pctEnganche}%`}
        </div>
        <div
          className="absolute inset-y-0 flex items-center justify-center text-[11px] font-semibold text-white transition-[left,width]"
          style={{ left: `${pctEnganche}%`, width: `${pctMensualidades}%`, backgroundColor: COLOR_MENSUALIDADES }}
        >
          {pctMensualidades >= 10 && `${pctMensualidades}%`}
        </div>
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center text-[11px] font-semibold text-white transition-[width]"
          style={{ width: `${pctEntrega}%`, backgroundColor: "#b45309" }}
        >
          {pctEntrega >= 10 && `${pctEntrega}%`}
        </div>

        {montoSeparacion > 0 && (
          <div
            className="absolute inset-y-0 w-[2px] bg-white/80 mix-blend-difference"
            style={{ left: `${pctSeparacionEnBarra}%` }}
            title={`Separación: ${formatoMXN(montoSeparacion)}`}
          />
        )}

        <div
          onPointerDown={iniciarArrastre("enganche")}
          className="absolute top-1/2 z-10 h-6 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-zinc-900 shadow dark:border-zinc-900 dark:bg-white"
          style={{ left: `${pctEnganche}%` }}
        />
        <div
          onPointerDown={iniciarArrastre("entrega")}
          className="absolute top-1/2 z-10 h-6 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-zinc-900 shadow dark:border-zinc-900 dark:bg-white"
          style={{ left: `${100 - pctEntrega}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorPrimario }} /> Enganche
          </span>
          <div className="flex items-center gap-1">
            <CampoNumerico
              min="0"
              max="100"
              className={`${inputClase} w-16 px-2 py-1`}
              value={pctEnganche}
              onChange={(texto) => onCambiar({ pctEnganche: clamp(Math.round(Number(texto) || 0), 0, 100 - pctEntrega) })}
            />
            <span className="text-zinc-500">%</span>
          </div>
          <span className="text-zinc-500 dark:text-zinc-400">{formatoMXN(montoEnganche)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_MENSUALIDADES }} /> Mensualidades
          </span>
          <span className="py-1 text-zinc-500 dark:text-zinc-400">{pctMensualidades}% (automático)</span>
          <span className="text-zinc-500 dark:text-zinc-400">{formatoMXN(montoMensualidades)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-[#b45309]" /> Finiquito / Entrega
          </span>
          <div className="flex items-center gap-1">
            <CampoNumerico
              min="0"
              max="100"
              className={`${inputClase} w-16 px-2 py-1`}
              value={pctEntrega}
              onChange={(texto) => onCambiar({ pctEntrega: clamp(Math.round(Number(texto) || 0), 0, 100 - pctEnganche) })}
            />
            <span className="text-zinc-500">%</span>
          </div>
          <span className="text-zinc-500 dark:text-zinc-400">{formatoMXN(montoEntrega)}</span>
        </div>
      </div>
    </div>
  );
}

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
  const [imagenLibreUrl, setImagenLibreUrl] = useState("");
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);

  async function borrarDelHistorial(cotizacion) {
    if (!window.confirm(`¿Eliminar la cotización ${cotizacion.folio}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setEliminandoId(cotizacion.id);
    const resultado = await eliminarCotizacion(cotizacion.id);
    setEliminandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setHistorial((h) => h.filter((c) => c.id !== cotizacion.id));
  }

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
    setImagenLibreUrl("");
  }

  async function subirImagenLibre(archivo) {
    if (!archivo) return;
    setSubiendoImagen(true);
    setError("");
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirImagenCotizacionLibre(formData);
    setSubiendoImagen(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setImagenLibreUrl(resultado.url);
  }

  function seleccionarUnidad(id) {
    setUnidadId(id);
    const unidad = unidades.find((u) => u.id === id);
    if (unidad) {
      setEsquema(unidad.esquema_unidad);
      setSim((s) => ({ ...s, montoTotal: String(unidad.monto_lista) }));
    }
  }

  function actualizarBarra(cambios) {
    setSim((s) => ({ ...s, ...cambios }));
  }

  function aplicarEsquemaPreset(preset) {
    setSim((s) => ({ ...s, pctEnganche: preset.pctEnganche, pctEntrega: preset.pctEntrega }));
  }

  const esquemaActivo =
    ESQUEMAS_PRESET.find((e) => e.pctEnganche === sim.pctEnganche && e.pctEntrega === sim.pctEntrega)?.id ??
    "personalizado";

  const proyecto = proyectos.find((p) => String(p.id) === proyectoId) ?? null;
  const unidad = unidades.find((u) => u.id === unidadId) ?? null;
  const colorPrimario = proyecto?.color_primario || "#0f172a";

  const montoTotal = parseFloat(sim.montoTotal) || 0;
  const plazo = parseInt(sim.plazoMeses, 10) || 0;

  // Enganche/Entrega son porcentajes del total repartidos en la barra; la
  // Separación es un anticipo que ya cuenta como parte del Enganche (se
  // resta de él, no del total aparte), por lo que Separación + Resto de
  // Enganche + Mensualidades×Plazo + Entrega siempre suma exactamente el total.
  const montoEnganche = useMemo(() => redondear((montoTotal * sim.pctEnganche) / 100), [montoTotal, sim.pctEnganche]);
  const montoEntrega = useMemo(() => redondear((montoTotal * sim.pctEntrega) / 100), [montoTotal, sim.pctEntrega]);
  const montoSeparacion = useMemo(
    () => clamp(parseFloat(sim.montoSeparacion) || 0, 0, montoEnganche),
    [sim.montoSeparacion, montoEnganche]
  );
  const restoEnganche = useMemo(() => redondear(montoEnganche - montoSeparacion), [montoEnganche, montoSeparacion]);
  const montoMensualidad = useMemo(() => {
    if (plazo <= 0) return 0;
    return redondear((montoTotal - montoEnganche - montoEntrega) / plazo);
  }, [montoTotal, montoEnganche, montoEntrega, plazo]);

  const separacionExcedeEnganche = (parseFloat(sim.montoSeparacion) || 0) > montoEnganche && montoEnganche > 0;
  // La imagen viene de la unidad de inventario (persistente) si se cotiza sobre
  // una unidad existente; en cotización libre la sube el usuario a mano.
  const imagenUrl = tipo === "UNIDAD" ? unidad?.imagen_url ?? null : imagenLibreUrl || null;

  async function guardarYGenerar(e) {
    e.preventDefault();
    setError("");

    if (!clienteNombre.trim()) {
      setError("Captura el nombre del cliente.");
      return;
    }
    if (!(montoTotal > 0)) {
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
      montoSeparacion,
      porcentajeEnganche: sim.pctEnganche,
      montoEnganche,
      plazoMeses: sim.plazoMeses,
      montoMensualidad,
      saldoEntrega: montoEntrega,
      imagenUrl,
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
      montoSeparacion,
      montoEnganche,
      porcentajeEnganche: sim.pctEnganche,
      plazoMeses: sim.plazoMeses,
      montoMensualidad,
      saldoEntrega: montoEntrega,
      imagenUrl,
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
            {unidad?.imagen_url && (
              <div className="col-span-2 flex items-center gap-3 rounded-lg border border-black/[.08] p-2 dark:border-white/[.145]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={unidad.imagen_url}
                  alt={unidad.codigo_unidad}
                  className="h-14 w-20 rounded bg-zinc-50 object-contain dark:bg-zinc-900"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Imagen de la unidad — se incluye en la cotización automáticamente.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
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

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Foto o render (opcional)</label>
              {imagenLibreUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-black/[.08] p-2 dark:border-white/[.145]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagenLibreUrl}
                    alt="Vista previa"
                    className="h-14 w-20 rounded bg-zinc-50 object-contain dark:bg-zinc-900"
                  />
                  <span className="flex-1 text-xs text-zinc-500 dark:text-zinc-400">Se incluirá en la cotización.</span>
                  <button
                    type="button"
                    onClick={() => setImagenLibreUrl("")}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-black/[.16] px-4 py-2 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.2] dark:text-zinc-400 dark:hover:bg-white/[.04]">
                  <ImagePlus size={15} />
                  {subiendoImagen ? "Subiendo…" : "Subir foto o render (máx. 25 MB)"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={subiendoImagen}
                    onChange={(e) => subirImagenLibre(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
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
            <CampoNumerico
              min="0"
              step="0.01"
              className={inputClase}
              value={sim.montoTotal}
              onChange={(texto) => setSim((s) => ({ ...s, montoTotal: texto }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Plazo (meses)</label>
            <CampoNumerico
              min="0"
              step="1"
              className={inputClase}
              value={sim.plazoMeses}
              onChange={(texto) => setSim((s) => ({ ...s, plazoMeses: texto }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Separación (incluida en el enganche)</label>
            <CampoNumerico
              min="0"
              step="0.01"
              className={inputClase}
              value={sim.montoSeparacion}
              onChange={(texto) => setSim((s) => ({ ...s, montoSeparacion: texto }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className={labelClase}>Distribución del monto total</label>
            <div className="flex flex-wrap gap-1.5">
              {ESQUEMAS_PRESET.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => aplicarEsquemaPreset(preset)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    esquemaActivo === preset.id
                      ? "border-transparent bg-foreground text-background"
                      : "border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                  }`}
                >
                  {preset.etiqueta}
                </button>
              ))}
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  esquemaActivo === "personalizado"
                    ? "border-transparent bg-foreground text-background"
                    : "border-black/[.08] text-zinc-500 dark:border-white/[.145] dark:text-zinc-400"
                }`}
              >
                Personalizado
              </span>
            </div>
          </div>
          <BarraDistribucion
            total={montoTotal}
            pctEnganche={sim.pctEnganche}
            pctEntrega={sim.pctEntrega}
            montoSeparacion={montoSeparacion}
            colorPrimario={colorPrimario}
            onCambiar={actualizarBarra}
          />
          {separacionExcedeEnganche && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              La separación no puede exceder el enganche calculado; se ajustará a {formatoMXN(montoEnganche)}.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-black/[.02] p-4 text-sm dark:border-white/[.145] dark:bg-white/[.03]">
          {montoSeparacion > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Separación</span>
              <span className="font-medium">{formatoMXN(montoSeparacion)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">
              {montoSeparacion > 0 ? "Resto de enganche" : "Enganche"} ({sim.pctEnganche}%)
            </span>
            <span className="font-medium">{formatoMXN(restoEnganche)}</span>
          </div>
          {plazo > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">{plazo} mensualidades de</span>
              <span className="font-medium">{formatoMXN(montoMensualidad)}</span>
            </div>
          )}
          {montoEntrega > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Saldo a entrega ({sim.pctEntrega}%)</span>
              <span className="font-medium">{formatoMXN(montoEntrega)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-black/[.08] pt-2 font-semibold dark:border-white/[.145]">
            <span>Total</span>
            <span>{formatoMXN(montoTotal)}</span>
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
                  <th className="px-4 py-3" />
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => borrarDelHistorial(c)}
                        disabled={eliminandoId === c.id}
                        title="Eliminar del historial"
                        className="text-zinc-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
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
