"use client";

import { useState } from "react";
import { Download } from "lucide-react";

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function Campo({ label, valor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold uppercase tracking-wide text-[#71717b]">{label}</span>
      <span className="text-black">{valor}</span>
    </div>
  );
}

function Resumen({ label, valor, destacado }) {
  return (
    <div
      className={`flex items-center justify-between border-b border-[rgba(0,0,0,0.2)] px-3 py-1.5 last:border-b-0 ${
        destacado ? "bg-black font-bold text-white" : ""
      }`}
    >
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  );
}

// Usa colores literales (hex/rgba) en vez de utilidades de paleta Tailwind
// (zinc-500, black/20, etc.): Tailwind v4 las define con progresive
// enhancement a lab()/oklch(), y html2canvas no sabe parsear esas funciones
// de color al generar el canvas para el PDF.
function HojaSolicitud({ solicitud, hojaRef }) {
  const partidas = solicitud.partidas ?? [];

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white p-10 text-black">
      <div className="flex items-center justify-between border-b-4 border-black pb-4">
        <div className="flex flex-col">
          <span className="text-3xl font-black tracking-tight">DIPZ</span>
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#52525c]">
            THE FUTURE OF REAL ESTATE
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-lg font-bold uppercase tracking-wide">Solicitud de Pago</span>
          <span className="font-mono text-sm">{solicitud.folio}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-x-6 gap-y-3 border-b border-[rgba(0,0,0,0.2)] py-4 text-xs">
        <Campo label="Fecha" valor={formatoFecha(solicitud.created_at)} />
        <Campo
          label="Proyecto"
          valor={`${solicitud.proyectos?.codigo ?? ""} — ${solicitud.proyectos?.nombre ?? ""}`}
        />
        <Campo label="Proveedor" valor={solicitud.proveedores?.razon_social} />
        <Campo label="Método de Pago" valor={solicitud.metodo_pago} />
        <Campo label="Solicitante" valor={solicitud.solicitante} />
        <Campo label="# Factura" valor={solicitud.num_factura || "—"} />
        <Campo label="Fecha Programada" valor={formatoFecha(solicitud.fecha_programada)} />
        <Campo label="RFC Proveedor" valor={solicitud.proveedores?.rfc || "—"} />
        <Campo label="WBS Categoría" valor={solicitud.wbs_categoria || "—"} />
        <Campo label="WBS Partida" valor={solicitud.wbs_partida || "—"} />
        <Campo label="Estado" valor={solicitud.estado} />
      </div>

      <table className="mt-6 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-black text-white">
            <th className="border border-black px-3 py-2 text-left">Cantidad</th>
            <th className="border border-black px-3 py-2 text-left">Descripción</th>
            <th className="border border-black px-3 py-2 text-right">Precio Unitario</th>
            <th className="border border-black px-3 py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((p, i) => (
            <tr key={i}>
              <td className="border border-black px-3 py-2">{p.cantidad}</td>
              <td className="border border-black px-3 py-2">{p.descripcion}</td>
              <td className="border border-black px-3 py-2 text-right">
                {formatoMXN(p.precio_unitario)}
              </td>
              <td className="border border-black px-3 py-2 text-right">{formatoMXN(p.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex w-64 flex-col self-end border border-black text-xs">
        <Resumen label="Subtotal" valor={formatoMXN(solicitud.subtotal)} />
        <Resumen label="IVA (16%)" valor={formatoMXN(solicitud.iva)} />
        <Resumen label="Total" valor={formatoMXN(solicitud.total)} destacado />
      </div>
    </div>
  );
}

/**
 * Renderiza la hoja de una solicitud fuera de pantalla, la convierte a PDF
 * (jsPDF + html2canvas) y regresa un Blob listo para descargar o previsualizar.
 */
export async function generarPdfBlob(solicitud) {
  const [{ default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
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
  root.render(<HojaSolicitud solicitud={solicitud} hojaRef={hojaRef} />);

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

      <HojaSolicitud solicitud={solicitud} />
    </div>
  );
}
