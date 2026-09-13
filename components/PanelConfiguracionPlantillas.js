"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { actualizarConfiguracionPlantilla } from "@/app/actions/plantillas";
import {
  subirLogoProyecto,
  eliminarLogoProyecto,
  subirLogoCompactoProyecto,
  eliminarLogoCompactoProyecto,
  actualizarColoresProyecto,
} from "@/app/actions/proyectos";
import { subirLogoEmpresa, eliminarLogoEmpresa } from "@/app/actions/configuracionEmpresa";
import UploaderImagenConEliminar from "@/components/UploaderImagenConEliminar";

const NOMBRES_CLAVE = {
  RECIBO_PAGO: "Recibo de Pago",
  ESTADO_CUENTA: "Estado de Cuenta",
  SOLICITUD_PAGO: "Solicitud de Pago / Autorización",
  COTIZACION: "Cotización",
};

/** Categorías de documentos PDF, cada una agrupando las claves de configuracion_plantillas que le corresponden. */
const CATEGORIAS = [
  { id: "cobranza", nombre: "Cobranza", claves: ["RECIBO_PAGO", "ESTADO_CUENTA"] },
  { id: "solicitudes", nombre: "Solicitudes / Tesorería", claves: ["SOLICITUD_PAGO"] },
  { id: "cotizaciones", nombre: "Cotizaciones", claves: ["COTIZACION"] },
];

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

function FormularioPlantilla({ plantilla, onGuardado }) {
  const [form, setForm] = useState({
    piePagina: plantilla.pie_pagina ?? "",
    colorPrimario: plantilla.color_primario ?? "#0f172a",
    terminosCondiciones: plantilla.terminos_condiciones ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setGuardado(false);
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const resultado = await actualizarConfiguracionPlantilla(plantilla.clave, form);
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setGuardado(true);
    onGuardado(resultado.plantilla);
  }

  return (
    <form
      onSubmit={guardar}
      className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
    >
      <h3 className="text-base font-semibold text-black dark:text-zinc-50">
        {NOMBRES_CLAVE[plantilla.clave] ?? plantilla.clave}
      </h3>

      <div className="flex flex-col gap-1.5">
        <label className={labelClase}>Pie de Página</label>
        <input
          type="text"
          className={inputClase}
          value={form.piePagina}
          onChange={(e) => actualizarCampo("piePagina", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label className={labelClase}>Color Primario (respaldo global)</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="h-9 w-12 rounded border border-black/[.08] bg-transparent dark:border-white/[.145]"
            value={/^#[0-9a-fA-F]{6}$/.test(form.colorPrimario) ? form.colorPrimario : "#0f172a"}
            onChange={(e) => actualizarCampo("colorPrimario", e.target.value)}
          />
          <input
            type="text"
            className={`${inputClase} flex-1`}
            value={form.colorPrimario}
            onChange={(e) => actualizarCampo("colorPrimario", e.target.value)}
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Se usa solo cuando el proyecto del documento no tiene su propio color (ver abajo).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClase}>Términos y Condiciones</label>
        <textarea
          rows={4}
          className={inputClase}
          value={form.terminosCondiciones}
          onChange={(e) => actualizarCampo("terminosCondiciones", e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        {guardado && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 size={15} /> Guardado
          </span>
        )}
        <button
          type="submit"
          disabled={guardando}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {guardando ? "Guardando…" : "Guardar Cambios"}
        </button>
      </div>
    </form>
  );
}

/** Editor rápido del logo (completo y compacto) y color de acento de un proyecto, usados en Recibo/Estado de Cuenta/Solicitud/Cotización de ese proyecto en vez del color global. */
function LogoColorProyecto({ proyecto, onActualizado }) {
  const [colorPrimario, setColorPrimario] = useState(proyecto.color_primario ?? "#0f172a");
  const [colorSecundario, setColorSecundario] = useState(proyecto.color_secundario ?? "#2563eb");
  const [guardandoColor, setGuardandoColor] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");

  async function subirLogo(archivo) {
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirLogoProyecto(proyecto.id, formData);
    if (!resultado.error) onActualizado({ ...proyecto, logo_proyecto_url: resultado.url });
    return resultado;
  }

  async function eliminarLogo() {
    const resultado = await eliminarLogoProyecto(proyecto.id);
    if (!resultado.error) onActualizado({ ...proyecto, logo_proyecto_url: null });
    return resultado;
  }

  async function subirLogoCompacto(archivo) {
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirLogoCompactoProyecto(proyecto.id, formData);
    if (!resultado.error) onActualizado({ ...proyecto, logo_compacto_url: resultado.url });
    return resultado;
  }

  async function eliminarLogoCompacto() {
    const resultado = await eliminarLogoCompactoProyecto(proyecto.id);
    if (!resultado.error) onActualizado({ ...proyecto, logo_compacto_url: null });
    return resultado;
  }

  async function guardarColores() {
    setGuardandoColor(true);
    setError("");
    setGuardado(false);

    const resultado = await actualizarColoresProyecto(proyecto.id, { colorPrimario, colorSecundario });

    setGuardandoColor(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setGuardado(true);
    onActualizado({ ...proyecto, color_primario: colorPrimario, color_secundario: colorSecundario });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
      <span className="text-sm font-semibold text-black dark:text-zinc-50">
        {proyecto.codigo} — {proyecto.nombre}
      </span>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Logo completo</span>
          <UploaderImagenConEliminar
            url={proyecto.logo_proyecto_url}
            onSubir={subirLogo}
            onEliminar={eliminarLogo}
            confirmarEliminar="¿Eliminar el logo de este proyecto?"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Logo compacto / pie de página</span>
          <UploaderImagenConEliminar
            url={proyecto.logo_compacto_url}
            onSubir={subirLogoCompacto}
            onEliminar={eliminarLogoCompacto}
            confirmarEliminar="¿Eliminar el logo compacto de este proyecto?"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Primario</span>
          <input
            type="color"
            className="h-7 w-9 rounded border border-black/[.08] bg-transparent dark:border-white/[.145]"
            value={/^#[0-9a-fA-F]{6}$/.test(colorPrimario) ? colorPrimario : "#0f172a"}
            onChange={(e) => {
              setColorPrimario(e.target.value);
              setGuardado(false);
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Secundario</span>
          <input
            type="color"
            className="h-7 w-9 rounded border border-black/[.08] bg-transparent dark:border-white/[.145]"
            value={/^#[0-9a-fA-F]{6}$/.test(colorSecundario) ? colorSecundario : "#2563eb"}
            onChange={(e) => {
              setColorSecundario(e.target.value);
              setGuardado(false);
            }}
          />
        </div>

        <button
          type="button"
          onClick={guardarColores}
          disabled={guardandoColor}
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {guardandoColor ? "Guardando…" : "Guardar Color"}
        </button>
        {guardado && <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Logo global de empresa (usado como logo principal en el encabezado de las 5 plantillas PDF, junto al logo del proyecto). */
function LogoEmpresa({ configuracionEmpresa, onActualizado }) {
  async function subir(archivo) {
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirLogoEmpresa(formData);
    if (!resultado.error) onActualizado({ ...configuracionEmpresa, logo_empresa_url: resultado.url });
    return resultado;
  }

  async function eliminar() {
    const resultado = await eliminarLogoEmpresa();
    if (!resultado.error) onActualizado({ ...configuracionEmpresa, logo_empresa_url: null });
    return resultado;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
      <div>
        <h4 className="text-sm font-semibold text-black dark:text-zinc-50">Logo de empresa</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Se muestra como logo principal en el encabezado de las 5 plantillas PDF, junto al del proyecto.
        </p>
      </div>

      <UploaderImagenConEliminar
        url={configuracionEmpresa?.logo_empresa_url}
        onSubir={subir}
        onEliminar={eliminar}
        confirmarEliminar="¿Eliminar el logo de empresa?"
      />
    </div>
  );
}

/** Panel de configuración visual de las plantillas PDF, agrupadas por categoría, más el logo/color propio de cada proyecto. */
export default function PanelConfiguracionPlantillas({
  plantillas: plantillasIniciales,
  proyectos: proyectosIniciales,
  configuracionEmpresa: configuracionEmpresaInicial,
}) {
  const [plantillas, setPlantillas] = useState(plantillasIniciales);
  const [proyectos, setProyectos] = useState(proyectosIniciales);
  const [configuracionEmpresa, setConfiguracionEmpresa] = useState(configuracionEmpresaInicial);
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0].id);

  const categoria = CATEGORIAS.find((c) => c.id === categoriaActiva) ?? CATEGORIAS[0];
  const plantillasCategoria = plantillas.filter((p) => categoria.claves.includes(p.clave));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-2 border-b border-black/[.08] pb-3 dark:border-white/[.145]">
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoriaActiva(c.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              categoriaActiva === c.id
                ? "bg-foreground text-background"
                : "border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            }`}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {plantillasCategoria.map((p) => (
          <FormularioPlantilla
            key={p.clave}
            plantilla={p}
            onGuardado={(actualizada) =>
              setPlantillas((filas) => filas.map((f) => (f.clave === actualizada.clave ? actualizada : f)))
            }
          />
        ))}
      </div>

      <LogoEmpresa configuracionEmpresa={configuracionEmpresa} onActualizado={setConfiguracionEmpresa} />

      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-sm font-semibold text-black dark:text-zinc-50">Logo y color por proyecto</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Cada proyecto usa su propio logo y color de acento en estos documentos (aplica a todas las
            categorías); si un proyecto no define los suyos, se usa el color global de arriba.
          </p>
        </div>

        {proyectos.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay proyectos registrados.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {proyectos.map((p) => (
              <LogoColorProyecto
                key={p.id}
                proyecto={p}
                onActualizado={(actualizado) =>
                  setProyectos((filas) => filas.map((f) => (f.id === actualizado.id ? actualizado : f)))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
