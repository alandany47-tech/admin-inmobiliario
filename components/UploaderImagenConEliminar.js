"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

/**
 * Uploader de un solo campo de imagen con "Reemplazar" (uploader ya existente,
 * re-etiquetado) + "Eliminar" (limpia el campo y borra el archivo del bucket)
 * conviviendo lado a lado — usado por logo de empresa, logo/logo compacto de
 * proyecto, firma de usuario y foto de perfil. `onSubir`/`onEliminar` hacen el
 * trabajo real (server action + actualizar el estado del padre) y regresan
 * `{ error }` si algo falló; este componente solo maneja el estado de
 * ocupado/error y el `window.confirm` antes de eliminar.
 */
export default function UploaderImagenConEliminar({
  url,
  accept = "image/png",
  onSubir,
  onEliminar,
  confirmarEliminar = "¿Eliminar esta imagen?",
  imgClassName = "h-9 w-auto rounded border border-black/[.08] object-contain dark:border-white/[.145]",
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function subir(archivo) {
    if (!archivo) return;
    setOcupado(true);
    setError("");
    const resultado = await onSubir(archivo);
    setOcupado(false);
    if (resultado?.error) setError(resultado.error);
  }

  async function eliminar() {
    if (!window.confirm(confirmarEliminar)) return;
    setOcupado(true);
    setError("");
    const resultado = await onEliminar();
    setOcupado(false);
    if (resultado?.error) setError(resultado.error);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={imgClassName} />
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded border border-black/[.08] px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-blue-400 dark:hover:bg-white/[.06]">
          <Upload size={12} />
          {ocupado ? "Subiendo…" : url ? "Reemplazar" : "Subir"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={ocupado}
            onChange={(e) => subir(e.target.files?.[0])}
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={eliminar}
            disabled={ocupado}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
          >
            Eliminar
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
