"use client";

import { useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { subirMiFirma } from "@/app/actions/auth";

const NOMBRES_ZONA = { izquierda: "Izquierda", derecha: "Derecha" };

/** Perfil propio: nombre/correo/rol de solo lectura, y uploader de firma (solo si tiene firma_zona asignada por un ADMIN). */
export default function PanelMiPerfil({ perfil: perfilInicial }) {
  const [perfil, setPerfil] = useState(perfilInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  async function subir(archivo) {
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    setGuardado(false);

    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirMiFirma(formData);

    setSubiendo(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setPerfil((p) => ({ ...p, firma_imagen_url: resultado.url }));
    setGuardado(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nombre</span>
          <span className="text-sm text-black dark:text-zinc-50">{perfil.nombre}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Correo</span>
          <span className="text-sm text-black dark:text-zinc-50">{perfil.email}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div>
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Firma de autorización</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Sello de imagen que se muestra en el PDF de las solicitudes que autorices. No tiene validez legal, no
            es una firma digital.
          </p>
        </div>

        {!perfil.firma_zona ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Esta función es solo para usuarios con zona de firma configurada. Pide a un administrador que te
            asigne una en Configuración → Roles y Accesos.
          </p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Zona asignada: <span className="font-semibold">{NOMBRES_ZONA[perfil.firma_zona]}</span>
            </p>

            <div className="flex flex-wrap items-center gap-4">
              {perfil.firma_imagen_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={perfil.firma_imagen_url}
                  alt="Tu firma"
                  className="h-14 w-auto rounded border border-black/[.08] bg-white object-contain p-1 dark:border-white/[.145]"
                />
              )}
              <label className="flex cursor-pointer items-center gap-1.5 rounded border border-black/[.08] px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-blue-400 dark:hover:bg-white/[.06]">
                <Upload size={12} />
                {subiendo ? "Subiendo…" : perfil.firma_imagen_url ? "Reemplazar firma" : "Subir firma"}
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  disabled={subiendo}
                  onChange={(e) => subir(e.target.files?.[0])}
                />
              </label>
              {guardado && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 size={15} /> Guardada
                </span>
              )}
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
