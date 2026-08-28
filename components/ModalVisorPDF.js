"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { getSolicitudPorId } from "@/app/actions/solicitudes";
import { generarPdfBlob } from "@/components/SolicitudPagoPDF";

/** Modal de vista previa de PDF de una solicitud, sin navegar fuera de la vista actual. */
export default function ModalVisorPDF({ solicitudId, open, onClose }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [blobUrl, setBlobUrl] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState("solicitud.pdf");

  useEffect(() => {
    if (!open) return;

    let vigente = true;
    let urlGenerada = null;
    setCargando(true);
    setError("");
    setBlobUrl(null);

    (async () => {
      const solicitud = await getSolicitudPorId(solicitudId);
      if (!vigente) return;
      if (!solicitud) {
        setError("No se pudo cargar la solicitud.");
        setCargando(false);
        return;
      }
      try {
        const blob = await generarPdfBlob(solicitud);
        if (!vigente) return;
        urlGenerada = URL.createObjectURL(blob);
        setBlobUrl(urlGenerada);
        setNombreArchivo(`${solicitud.folio}.pdf`);
      } catch {
        if (vigente) setError("No se pudo generar el PDF.");
      } finally {
        if (vigente) setCargando(false);
      }
    })();

    return () => {
      vigente = false;
      if (urlGenerada) URL.revokeObjectURL(urlGenerada);
    };
  }, [open, solicitudId]);

  useEffect(() => {
    if (!open) return;
    function alTeclado(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [open, onClose]);

  if (!open) return null;

  function descargar() {
    if (!blobUrl) return;
    const enlace = document.createElement("a");
    enlace.href = blobUrl;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Vista Previa PDF</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={descargar}
              disabled={!blobUrl}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              <Download size={14} /> Descargar
            </button>
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
          {cargando && <p className="text-sm text-zinc-500 dark:text-zinc-400">Generando PDF…</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!cargando && !error && blobUrl && (
            <iframe src={blobUrl} title="Vista previa PDF" className="h-full w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
