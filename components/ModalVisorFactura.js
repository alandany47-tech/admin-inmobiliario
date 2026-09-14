"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";

/** Extrae los campos relevantes de un CFDI ya parseado como XML DOM (Emisor, Receptor, timbre). */
function parsearCfdi(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const comprobante = doc.documentElement;
    const emisor = doc.getElementsByTagNameNS("*", "Emisor")[0];
    const receptor = doc.getElementsByTagNameNS("*", "Receptor")[0];
    const timbre = doc.getElementsByTagNameNS("*", "TimbreFiscalDigital")[0];

    return {
      folioFiscal: timbre?.getAttribute("UUID") ?? null,
      serie: comprobante?.getAttribute("Serie") ?? null,
      folio: comprobante?.getAttribute("Folio") ?? null,
      fecha: comprobante?.getAttribute("Fecha") ?? null,
      subtotal: comprobante?.getAttribute("SubTotal") ?? null,
      total: comprobante?.getAttribute("Total") ?? null,
      emisorNombre: emisor?.getAttribute("Nombre") ?? null,
      emisorRfc: emisor?.getAttribute("Rfc") ?? null,
      receptorNombre: receptor?.getAttribute("Nombre") ?? null,
      receptorRfc: receptor?.getAttribute("Rfc") ?? null,
    };
  } catch {
    return null;
  }
}

function Campo({ etiqueta, valor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {etiqueta}
      </span>
      <span className="text-sm text-black dark:text-zinc-50">{valor || "—"}</span>
    </div>
  );
}

/** Modal simple de "Ver Factura": muestra los campos relevantes del CFDI y permite descargar el XML crudo. */
export default function ModalVisorFactura({ open, onClose, xml, folioSolicitud }) {
  useEffect(() => {
    if (!open) return;
    function alTeclado(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [open, onClose]);

  if (!open) return null;

  const datos = xml ? parsearCfdi(xml) : null;

  function descargar() {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `${folioSolicitud || "factura"}.xml`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Factura</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        {!datos ? (
          <p className="rounded border border-dashed border-black/[.08] px-3 py-2.5 text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            No se pudo leer el XML como CFDI. Puedes descargar el archivo crudo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Folio Fiscal (UUID)" valor={datos.folioFiscal} />
            <Campo etiqueta="Fecha" valor={datos.fecha} />
            <Campo etiqueta="Serie / Folio" valor={[datos.serie, datos.folio].filter(Boolean).join(" ")} />
            <Campo
              etiqueta="Total"
              valor={datos.total ? Number(datos.total).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : null}
            />
            <Campo etiqueta="Emisor" valor={datos.emisorNombre} />
            <Campo etiqueta="RFC Emisor" valor={datos.emisorRfc} />
            <Campo etiqueta="Receptor" valor={datos.receptorNombre} />
            <Campo etiqueta="RFC Receptor" valor={datos.receptorRfc} />
          </div>
        )}

        <button
          type="button"
          onClick={descargar}
          className="flex w-fit items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background dark:hover:bg-[#ccc]"
        >
          <Download size={14} /> Descargar XML
        </button>
      </div>
    </div>
  );
}
