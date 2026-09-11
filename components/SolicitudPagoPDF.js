"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getConfiguracionPlantilla } from "@/app/actions/plantillas";
import EncabezadoDualLogo from "@/components/EncabezadoDualLogo";

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function Campo({ label, valor }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8a94]">{label}</span>
      <span className="text-[13px] font-medium text-black">{valor}</span>
    </div>
  );
}

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch() (ver nota en las demás plantillas). El color de
// acento es por proyecto (proyectos.color_primario) si la solicitud tiene
// proyecto asociado; si no, cae al color global de configuracion_plantillas.
// Un único acento en toda la hoja (líneas finas + total), no bloques de
// color distintos por fila.
function HojaSolicitud({ solicitud, config, hojaRef }) {
  const partidas = solicitud.partidas ?? [];
  const proyecto = solicitud.proyectos;
  const colorPrimario = proyecto?.color_primario || config?.color_primario || "#0f172a";

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white text-black">
      <div className="h-[6px] w-full" style={{ backgroundColor: colorPrimario }} />

      <div className="flex flex-col px-12 pb-12 pt-8">
        <div className="flex items-start justify-between pb-6">
          <EncabezadoDualLogo configDipz={config} proyecto={proyecto} />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[22px] font-bold uppercase tracking-wide text-[#18181b]">Solicitud de Pago</span>
            <span className="font-mono text-[11px] text-[#52525c]">{solicitud.folio}</span>
            <span className="text-[10px] text-[#8a8a94]">{formatoFecha(solicitud.created_at)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-8 gap-y-4 rounded-xl bg-[#fafafa] p-6 text-xs">
          <Campo
            label="Proyecto"
            valor={`${solicitud.proyectos?.codigo ?? ""} — ${solicitud.proyectos?.nombre ?? ""}`}
          />
          <Campo label="Proveedor" valor={solicitud.proveedores?.razon_social} />
          <Campo label="Método de pago" valor={solicitud.metodo_pago} />
          <Campo label="Solicitante" valor={solicitud.solicitante} />
          <Campo label="# Factura" valor={solicitud.num_factura || "—"} />
          <Campo label="Fecha programada" valor={formatoFecha(solicitud.fecha_programada)} />
          <Campo label="RFC proveedor" valor={solicitud.proveedores?.rfc || "—"} />
          <Campo label="WBS categoría" valor={solicitud.wbs_categoria || "—"} />
          <Campo label="WBS partida" valor={solicitud.wbs_partida || "—"} />
        </div>

        {partidas.length > 0 && (
          <div className="mt-8 flex flex-col">
            <div
              className="grid grid-cols-[0.6fr_2.4fr_1fr_1fr] gap-2 px-1 pb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8a94]"
              style={{ borderBottom: `2px solid ${colorPrimario}` }}
            >
              <span>Cant.</span>
              <span>Descripción</span>
              <span className="text-right">Precio unitario</span>
              <span className="text-right">Subtotal</span>
            </div>
            {partidas.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[0.6fr_2.4fr_1fr_1fr] items-center gap-2 px-1 py-2.5 text-[11px]"
                style={i === partidas.length - 1 ? undefined : { borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                <span className="text-[#27272a]">{p.cantidad}</span>
                <span className="font-medium text-[#27272a]">{p.descripcion}</span>
                <span className="text-right tabular-nums text-[#52525c]">{formatoMXN(p.precio_unitario)}</span>
                <span className="text-right tabular-nums font-semibold">{formatoMXN(p.subtotal)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between px-5 py-2.5 text-[12px]">
              <span className="text-[#52525c]">Subtotal</span>
              <span className="font-medium tabular-nums">{formatoMXN(solicitud.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5 text-[12px]">
              <span className="text-[#52525c]">IVA (16%)</span>
              <span className="font-medium tabular-nums">{formatoMXN(solicitud.iva)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#52525c]">Total</span>
              <span className="text-[18px] font-bold tabular-nums" style={{ color: colorPrimario }}>
                {formatoMXN(solicitud.total)}
              </span>
            </div>
          </div>
        </div>

        {config?.terminos_condiciones && (
          <p className="mt-10 text-[10px] leading-relaxed text-[#8a8a94]">{config.terminos_condiciones}</p>
        )}

        <div className="mt-10 flex items-center justify-center gap-3 border-t border-[rgba(0,0,0,0.06)] pt-5">
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
          <p className="text-center text-[10px] text-[#8a8a94]">
            {config?.pie_pagina || `Estado: ${solicitud.estado}`}
          </p>
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Renderiza la hoja de una solicitud fuera de pantalla, la convierte a PDF
 * (jsPDF + html2canvas) y regresa un Blob listo para descargar o previsualizar.
 * Consume dinámicamente configuracion_plantillas (clave SOLICITUD_PAGO) para
 * logo/encabezado/color/pie de DIPZ, más el logo/color del proyecto (si
 * aplica) vía `EncabezadoDualLogo` — igual que Cotización/Estado de
 * Cuenta/Recibo, para que las 4 plantillas se vean consistentes.
 */
export async function generarPdfBlob(solicitud) {
  const [config, { default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
    getConfiguracionPlantilla("SOLICITUD_PAGO"),
    import("jspdf"),
    import("html2canvas"),
    import("react-dom/client"),
  ]);

  const contenedor = document.createElement("div");
  contenedor.style.position = "fixed";
  contenedor.style.left = "-10000px";
  contenedor.style.top = "0";
  document.body.appendChild(contenedor);

  const hojaRef = { current: null };
  const root = createRoot(contenedor);
  root.render(<HojaSolicitud solicitud={solicitud} config={config} hojaRef={hojaRef} />);

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvas = await html2canvas(hojaRef.current, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const anchoPagina = pdf.internal.pageSize.getWidth();
  const altoPagina = pdf.internal.pageSize.getHeight();
  const altoImagen = (canvas.height * anchoPagina) / canvas.width;

  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    anchoPagina,
    Math.min(altoImagen, altoPagina)
  );

  root.unmount();
  document.body.removeChild(contenedor);

  return pdf.output("blob");
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

/** Vista de detalle/impresión de una solicitud de pago con el formato DIPZ. */
export default function SolicitudPagoPDF({ solicitud }) {
  const [generando, setGenerando] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    getConfiguracionPlantilla("SOLICITUD_PAGO").then(setConfig);
  }, []);

  async function descargarPDF() {
    setGenerando(true);
    const blob = await generarPdfBlob(solicitud);
    descargarBlob(blob, `${solicitud.folio}.pdf`);
    setGenerando(false);
  }

  return (
    <div className="flex flex-col items-center gap-6 bg-zinc-100 py-10 print:bg-white print:py-0 dark:bg-zinc-900">
      <button
        type="button"
        onClick={descargarPDF}
        disabled={generando}
        className="fixed right-6 top-6 z-10 flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-lg transition-colors hover:bg-[#383838] disabled:opacity-50 print:hidden dark:hover:bg-[#ccc]"
      >
        <Download size={16} /> {generando ? "Generando…" : "Descargar PDF"}
      </button>

      <HojaSolicitud solicitud={solicitud} config={config} />
    </div>
  );
}
