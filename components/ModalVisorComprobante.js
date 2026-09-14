"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Modal de vista previa de un comprobante de pago en R2. A diferencia de
 * ModalVisorPDF (que genera el blob localmente), recibe `onObtenerUrl` y pide
 * la presigned URL justo al abrirse, porque el bucket no es público.
 */
export default function ModalVisorComprobante({ itemId, open, onClose, onObtenerUrl }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState(null);
  const [idEnCurso, setIdEnCurso] = useState(null);
  const onObtenerUrlRef = useRef(onObtenerUrl);
  useEffect(() => {
    onObtenerUrlRef.current = onObtenerUrl;
  });

  // Ajuste de estado durante el render (no en el Effect) al abrir el modal
  // con un comprobante distinto al ya procesado.
  if (open && itemId !== idEnCurso) {
    setIdEnCurso(itemId);
    setCargando(true);
    setError("");
    setUrl(null);
  }

  useEffect(() => {
    if (!open) return;
    let vigente = true;
    onObtenerUrlRef.current().then((resultado) => {
      if (!vigente) return;
      if (resultado?.url) {
        setUrl(resultado.url);
      } else {
        setError(resultado?.error || "No se pudo obtener el comprobante.");
      }
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [open, itemId]);

  useEffect(() => {
    if (!open) return;
    function alTeclado(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Comprobante de Pago</h3>
          <div className="flex items-center gap-2">
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!url}
              onClick={(e) => !url && e.preventDefault()}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background aria-disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              <Download size={14} /> Descargar
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {cargando && <p className="text-sm text-zinc-500 dark:text-zinc-400">Generando enlace…</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!cargando && !error && url && (
            <iframe src={url} title="Vista previa del comprobante" className="h-full w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
