"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { actualizarConfiguracionPlantilla } from "@/app/actions/plantillas";

const NOMBRES_CLAVE = {
  RECIBO_PAGO: "Recibo de Pago",
  ESTADO_CUENTA: "Estado de Cuenta",
  SOLICITUD_PAGO: "Solicitud de Pago",
};

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

function FormularioPlantilla({ plantilla, onGuardado }) {
  const [form, setForm] = useState({
    logoUrl: plantilla.logo_url ?? "",
    encabezadoLinea1: plantilla.encabezado_linea1 ?? "",
    encabezadoLinea2: plantilla.encabezado_linea2 ?? "",
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
        <label className={labelClase}>Logo (URL)</label>
        <input
          type="text"
          placeholder="https://…"
          className={inputClase}
          value={form.logoUrl}
          onChange={(e) => actualizarCampo("logoUrl", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Encabezado Línea 1</label>
          <input
            type="text"
            className={inputClase}
            value={form.encabezadoLinea1}
            onChange={(e) => actualizarCampo("encabezadoLinea1", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Encabezado Línea 2</label>
          <input
            type="text"
            className={inputClase}
            value={form.encabezadoLinea2}
            onChange={(e) => actualizarCampo("encabezadoLinea2", e.target.value)}
          />
        </div>
      </div>

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
        <label className={labelClase}>Color Primario</label>
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

/** Panel de configuración visual de las 3 plantillas PDF del sistema. */
export default function PanelConfiguracionPlantillas({ plantillas: plantillasIniciales }) {
  const [plantillas, setPlantillas] = useState(plantillasIniciales);

  return (
    <div className="flex flex-col gap-6">
      {plantillas.map((p) => (
        <FormularioPlantilla
          key={p.clave}
          plantilla={p}
          onGuardado={(actualizada) =>
            setPlantillas((filas) => filas.map((f) => (f.clave === actualizada.clave ? actualizada : f)))
          }
        />
      ))}
    </div>
  );
}
